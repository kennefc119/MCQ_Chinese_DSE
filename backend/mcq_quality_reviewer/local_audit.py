from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DATA_DIR = Path(__file__).parent / "data"
DB_PATH = DATA_DIR / "audit.sqlite3"


def _create_table(connection: sqlite3.Connection, table_name: str = "question_audits") -> None:
    connection.execute(
        f"""
        CREATE TABLE {table_name} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_id TEXT NOT NULL,
            audit_round INTEGER NOT NULL DEFAULT 1,
            re_audit_of INTEGER,
            passage_id TEXT NOT NULL,
            original_hash TEXT NOT NULL,
            original_json TEXT NOT NULL,
            proposed_json TEXT,
            audit_status TEXT NOT NULL,
            approval_status TEXT NOT NULL DEFAULT 'not_required',
            push_status TEXT NOT NULL DEFAULT 'not_pushed',
            original_score INTEGER,
            final_score INTEGER,
            critic_comments TEXT,
            revision_instructions TEXT,
            traces_json TEXT NOT NULL DEFAULT '[]',
            total_tokens INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            iterations_done INTEGER NOT NULL DEFAULT 0,
            proposal_edited_at TEXT,
            proposal_edit_count INTEGER NOT NULL DEFAULT 0,
            scanned_at TEXT NOT NULL,
            decided_at TEXT,
            pushed_at TEXT
        )
        """
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def initialize() -> None:
    with _connect() as connection:
        exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'question_audits'"
        ).fetchone()
        if not exists:
            _create_table(connection)
            return

        columns = {
            str(row["name"])
            for row in connection.execute("PRAGMA table_info(question_audits)").fetchall()
        }
        unique_question_id = False
        for index in connection.execute("PRAGMA index_list(question_audits)").fetchall():
            if not index["unique"]:
                continue
            index_columns = connection.execute(
                f"PRAGMA index_info({index['name']})"
            ).fetchall()
            if [row["name"] for row in index_columns] == ["question_id"]:
                unique_question_id = True
                break

        if unique_question_id:
            _create_table(connection, "question_audits_new")
            legacy_columns = [
                "id", "question_id", "passage_id", "original_hash", "original_json",
                "proposed_json", "audit_status", "approval_status", "push_status",
                "original_score", "final_score", "critic_comments", "revision_instructions",
                "traces_json", "total_tokens", "error_message", "scanned_at", "decided_at",
                "pushed_at",
            ]
            connection.execute(
                f"""
                INSERT INTO question_audits_new ({', '.join(legacy_columns)})
                SELECT {', '.join(legacy_columns)} FROM question_audits
                """
            )
            connection.execute("DROP TABLE question_audits")
            connection.execute("ALTER TABLE question_audits_new RENAME TO question_audits")
            columns = {
                str(row["name"])
                for row in connection.execute("PRAGMA table_info(question_audits)").fetchall()
            }

        additions = {
            "audit_round": "INTEGER NOT NULL DEFAULT 1",
            "re_audit_of": "INTEGER",
            "iterations_done": "INTEGER NOT NULL DEFAULT 0",
            "proposal_edited_at": "TEXT",
            "proposal_edit_count": "INTEGER NOT NULL DEFAULT 0",
        }
        for column, definition in additions.items():
            if column not in columns:
                connection.execute(f"ALTER TABLE question_audits ADD COLUMN {column} {definition}")


def recover_interrupted_audits() -> int:
    with _connect() as connection:
        cursor = connection.execute(
            """
            UPDATE question_audits
            SET audit_status = 'failed', approval_status = 'not_required',
                error_message = 'Reviewer process stopped before this audit completed'
            WHERE audit_status = 'scanning'
            """
        )
        return cursor.rowcount


def scanned_question_ids() -> set[str]:
    """Return question IDs blocked from the normal un-audited queue.

    Failed runs remain visible in local history but are deliberately eligible
    for a future normal scan. Pending or rejected proposals remain blocked so
    they cannot be overwritten before the user decides what to do.
    """
    with _connect() as connection:
        latest_rows = connection.execute(
            """
            SELECT question_id, audit_status
            FROM question_audits
            WHERE id IN (SELECT MAX(id) FROM question_audits GROUP BY question_id)
            """
        ).fetchall()
    return {
        str(row["question_id"])
        for row in latest_rows
        if row["audit_status"] != "failed"
    }


def claim_question(
    question: dict[str, Any],
    original_hash: str,
    *,
    re_audit_of: int | None = None,
) -> int | None:
    with _connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        question_id = question["question_id"]
        if connection.execute(
            "SELECT 1 FROM question_audits WHERE question_id = ? AND audit_status = 'scanning' LIMIT 1",
            (question_id,),
        ).fetchone():
            return None
        if re_audit_of is None:
            latest = connection.execute(
                """
                SELECT audit_status, approval_status, push_status
                FROM question_audits
                WHERE question_id = ?
                ORDER BY id DESC
                LIMIT 1
                """,
                (question_id,),
            ).fetchone()
            # Failed runs are retryable. Every other existing latest state is
            # deliberately blocked from another automatic LLM run.
            if latest and latest["audit_status"] != "failed":
                return None

        round_row = connection.execute(
            "SELECT COALESCE(MAX(audit_round), 0) + 1 AS next_round FROM question_audits WHERE question_id = ?",
            (question_id,),
        ).fetchone()
        audit_round = int(round_row["next_round"])
        cursor = connection.execute(
            """
            INSERT INTO question_audits (
                question_id, audit_round, re_audit_of, passage_id,
                original_hash, original_json, audit_status, scanned_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'scanning', ?)
            """,
            (
                question_id,
                audit_round,
                re_audit_of,
                question["passage_id"],
                original_hash,
                json.dumps(question, ensure_ascii=False),
                _now(),
            ),
        )
        return int(cursor.lastrowid)


def complete_audit(
    audit_id: int,
    *,
    audit_status: str,
    approval_status: str,
    original_score: int,
    final_score: int,
    critic_comments: str,
    revision_instructions: str,
    proposed: dict[str, Any] | None,
    traces: list[dict[str, Any]],
    total_tokens: int,
    iterations_done: int,
) -> None:
    with _connect() as connection:
        connection.execute(
            """
            UPDATE question_audits
            SET audit_status = ?, approval_status = ?, original_score = ?,
                final_score = ?, critic_comments = ?, revision_instructions = ?,
                proposed_json = ?, traces_json = ?, total_tokens = ?,
                error_message = NULL, iterations_done = ?
            WHERE id = ?
            """,
            (
                audit_status,
                approval_status,
                original_score,
                final_score,
                critic_comments,
                revision_instructions,
                json.dumps(proposed, ensure_ascii=False) if proposed else None,
                json.dumps(traces, ensure_ascii=False),
                total_tokens,
                iterations_done,
                audit_id,
            ),
        )


def fail_audit(
    audit_id: int,
    error_message: str,
    *,
    traces: list[dict[str, Any]] | None = None,
    total_tokens: int = 0,
    iterations_done: int = 0,
) -> None:
    with _connect() as connection:
        connection.execute(
            """
            UPDATE question_audits
            SET audit_status = 'failed', approval_status = 'not_required', error_message = ?,
                traces_json = ?, total_tokens = ?, iterations_done = ?
            WHERE id = ?
            """,
            (
                error_message,
                json.dumps(traces or [], ensure_ascii=False),
                total_tokens,
                iterations_done,
                audit_id,
            ),
        )


def get_audit(audit_id: int) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT * FROM question_audits WHERE id = ?", (audit_id,)
        ).fetchone()
    return _decode_row(row) if row else None


def list_audits(status: str | None = None) -> list[dict[str, Any]]:
    query = "SELECT * FROM question_audits"
    params: tuple[Any, ...] = ()
    if status:
        query += " WHERE audit_status = ? OR approval_status = ? OR push_status = ?"
        params = (status, status, status)
    query += " ORDER BY id DESC"
    with _connect() as connection:
        rows = connection.execute(query, params).fetchall()
    return [_decode_row(row) for row in rows]


def audits_for_questions(question_ids: set[str] | None = None) -> list[dict[str, Any]]:
    with _connect() as connection:
        if question_ids is None:
            rows = connection.execute(
                "SELECT * FROM question_audits ORDER BY id DESC"
            ).fetchall()
        elif not question_ids:
            return []
        else:
            placeholders = ",".join("?" for _ in question_ids)
            rows = connection.execute(
                f"SELECT * FROM question_audits WHERE question_id IN ({placeholders}) ORDER BY id DESC",
                tuple(question_ids),
            ).fetchall()
    return [_decode_row(row) for row in rows]


def latest_audits_by_question(
    question_ids: set[str] | None = None,
) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for audit in audits_for_questions(question_ids):
        latest.setdefault(audit["question_id"], audit)
    return latest


def latest_audit_statuses() -> dict[str, dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT question_id, audit_status, approval_status, push_status, id
            FROM question_audits
            WHERE id IN (SELECT MAX(id) FROM question_audits GROUP BY question_id)
            """
        ).fetchall()
    return {str(row["question_id"]): dict(row) for row in rows}


def pending_audit_ids(min_score: int | None = None) -> list[int]:
    """Return latest pending proposal IDs, optionally filtered by final score."""
    query = """
        SELECT id
        FROM question_audits
        WHERE id IN (SELECT MAX(id) FROM question_audits GROUP BY question_id)
          AND approval_status = 'pending'
          AND proposed_json IS NOT NULL
    """
    params: tuple[Any, ...] = ()
    if min_score is not None:
        query += " AND final_score >= ?"
        params = (min_score,)
    query += " ORDER BY id"
    with _connect() as connection:
        rows = connection.execute(query, params).fetchall()
    return [int(row["id"]) for row in rows]


def audit_history_by_question(
    question_ids: set[str] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    history: dict[str, list[dict[str, Any]]] = {}
    for audit in audits_for_questions(question_ids):
        history.setdefault(audit["question_id"], []).append({
            "id": audit["id"],
            "audit_round": audit.get("audit_round", 1),
            "audit_status": audit["audit_status"],
            "approval_status": audit["approval_status"],
            "push_status": audit["push_status"],
            "original_score": audit.get("original_score"),
            "final_score": audit.get("final_score"),
            "iterations_done": audit.get("iterations_done", 0),
            "error_message": audit.get("error_message"),
            "scanned_at": audit.get("scanned_at"),
            "pushed_at": audit.get("pushed_at"),
        })
    return history


def update_proposal(
    audit_id: int,
    *,
    question_stem: str,
    option_texts: list[str],
    option_explanations: list[str],
) -> dict[str, Any] | None:
    stem = question_stem.strip()
    texts = [text.strip() for text in option_texts]
    explanations = [explanation.strip() for explanation in option_explanations]
    if (
        not stem
        or len(texts) != 4
        or len(explanations) != 4
        or any(not text for text in texts)
        or any(not explanation for explanation in explanations)
    ):
        raise ValueError("題幹、四個選項及四個選項解釋均不可留空")

    with _connect() as connection:
        row = connection.execute(
            "SELECT * FROM question_audits WHERE id = ?", (audit_id,)
        ).fetchone()
        if not row:
            return None
        if row["approval_status"] != "pending":
            raise ValueError("只有待確認的修正才可以手動編輯")
        proposal = json.loads(row["proposed_json"] or "null")
        if not isinstance(proposal, dict) or len(proposal.get("options") or []) != 4:
            raise ValueError("本地修正提案格式無效")
        proposal["question_stem"] = stem
        for option, text, explanation in zip(proposal["options"], texts, explanations):
            option["text"] = text
            option["explanation"] = explanation
        connection.execute(
            """
            UPDATE question_audits
            SET proposed_json = ?, proposal_edited_at = ?,
                proposal_edit_count = proposal_edit_count + 1
            WHERE id = ? AND approval_status = 'pending'
            """,
            (json.dumps(proposal, ensure_ascii=False), _now(), audit_id),
        )
        updated = connection.execute(
            "SELECT * FROM question_audits WHERE id = ?", (audit_id,)
        ).fetchone()
    return _decode_row(updated) if updated else None


def summary() -> dict[str, int]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT audit_status, approval_status, push_status
            FROM question_audits
            WHERE id IN (
                SELECT MAX(id) FROM question_audits GROUP BY question_id
            )
            """
        ).fetchall()
    result = {
        "scanned": 0,
        "passed": 0,
        "pending": 0,
        "approved": 0,
        "rejected": 0,
        "pushed": 0,
        "failed": 0,
    }
    for row in rows:
        if row["audit_status"] == "passed" or row["push_status"] == "pushed":
            result["scanned"] += 1
        if row["audit_status"] in result:
            result[row["audit_status"]] += 1
        if row["approval_status"] in {"pending", "approved", "rejected"}:
            result[row["approval_status"]] += 1
        if row["push_status"] == "pushed":
            result["pushed"] += 1
    return result


def clear_audit_history() -> int:
    """Delete all local audit records and return the number removed."""
    with _connect() as connection:
        count = int(
            connection.execute("SELECT COUNT(*) AS count FROM question_audits").fetchone()["count"]
        )
        connection.execute("DELETE FROM question_audits")
        connection.execute(
            "DELETE FROM sqlite_sequence WHERE name = 'question_audits'"
        )
    return count


def mark_rejected(audit_id: int) -> bool:
    with _connect() as connection:
        cursor = connection.execute(
            """
            UPDATE question_audits
            SET approval_status = 'rejected', decided_at = ?
            WHERE id = ? AND approval_status = 'pending'
            """,
            (_now(), audit_id),
        )
        return cursor.rowcount == 1


def mark_pushed(audit_id: int) -> None:
    now = _now()
    with _connect() as connection:
        connection.execute(
            """
            UPDATE question_audits
            SET approval_status = 'approved', push_status = 'pushed',
                decided_at = ?, pushed_at = ?
            WHERE id = ?
            """,
            (now, now, audit_id),
        )


def _decode_row(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    for key in ("original_json", "proposed_json", "traces_json"):
        decoded_key = key.removesuffix("_json")
        result[decoded_key] = json.loads(result[key]) if result.get(key) else None
        result.pop(key, None)
    return result


initialize()