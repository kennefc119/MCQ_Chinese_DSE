"""One-time importer: move all passages from nd_passages.md into dsemcq_nd_passages."""
from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Any

from supabase import create_client

from config import settings

ROOT = Path(__file__).resolve().parents[2]
SOURCE_MD = ROOT / "non-detinated_passages" / "nd_passages.md"
TABLE = "dsemcq_nd_passages"
ALLOWED_REPRESENTATIONS = {"文言文", "白話文"}


def get_supabase():
    return create_client(settings.supabase_url, settings.supabase_service_key)


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"\s+", "-", value)
    value = re.sub(r"[^\w\-\u4e00-\u9fff]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "untitled"


def split_passages(text: str) -> list[str]:
    return [segment.strip() for segment in re.split(r"\n---\n", text.strip()) if segment.strip()]


def parse_passage(block: str) -> dict[str, str]:
    lines = [line.rstrip("\r") for line in block.splitlines()]
    if not lines or not lines[0].startswith("# "):
        raise ValueError(f"Passage block missing title header: {block[:80]}")

    data: dict[str, str] = {"title": lines[0][2:].strip()}
    current_key: str | None = None
    content_lines: list[str] = []

    for line in lines[1:]:
        if line.startswith("## "):
            if current_key == "content":
                data["content"] = "\n".join(content_lines).strip()
                content_lines = []
            current_key = line[3:].strip().lower()
            continue

        if current_key == "content":
            content_lines.append(line)
        elif current_key:
            data[current_key] = (data.get(current_key, "") + ("\n" if data.get(current_key) else "") + line).strip()

    if current_key == "content":
        data["content"] = "\n".join(content_lines).strip()

    return data


def derive_dynasty_and_genre(type_value: str) -> tuple[str | None, str | None]:
    if "・" not in type_value:
        return None, type_value.strip() or None
    dynasty, genre = type_value.split("・", 1)
    return dynasty.strip() or None, genre.strip() or None


def derive_author(source_value: str) -> str | None:
    source_value = source_value.strip()
    match = re.match(r"^(?P<author>[^《]+)《", source_value)
    if not match:
        return None
    author = match.group("author").strip()
    return author or None


def derive_summary(content: str) -> str:
    parts = [part.strip() for part in re.split(r"[。！？\n]", content) if part.strip()]
    if not parts:
        return content.strip()[:120]
    return parts[0][:120]


def count_words(content: str) -> int:
    tokens = re.findall(r"[A-Za-z0-9]+|[\u4e00-\u9fff]", content)
    return len(tokens)


def build_rows(passages: list[dict[str, str]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, passage in enumerate(passages, start=1):
        title = passage.get("title", "").strip()
        type_value = passage.get("type", "").strip()
        representation = passage.get("representation", "").strip()
        source_value = passage.get("source", "").strip()
        content = passage.get("content", "")

        if not title:
            raise ValueError(f"Passage #{index} missing title")
        if representation not in ALLOWED_REPRESENTATIONS:
            raise ValueError(f"Passage '{title}' has invalid representation: {representation}")
        if not type_value:
            raise ValueError(f"Passage '{title}' missing type")
        if not source_value:
            raise ValueError(f"Passage '{title}' missing source")
        if not content:
            raise ValueError(f"Passage '{title}' missing content")

        dynasty, genre = derive_dynasty_and_genre(type_value)
        author = derive_author(source_value)

        row = {
            "id": f"ndp-{index:04d}",
            "code": f"ndp{index:04d}",
            "slug": slugify(title),
            "order_no": index,
            "title": title,
            "dynasty": dynasty,
            "author": author,
            "body": content,
            "word_count": count_words(content),
            "summary": derive_summary(content),
            "genre": genre,
            "themes": [],
            "difficulty": 2,
            "representation": representation,
            "type": type_value,
            "source": source_value,
            "generation_prompt": "One-time import from non-detinated_passages/nd_passages.md",
            "is_active": True,
        }
        rows.append(row)
    return rows


def validate_unique(rows: list[dict[str, Any]]) -> None:
    seen_ids: set[str] = set()
    seen_codes: set[str] = set()
    seen_slugs: set[str] = set()
    for row in rows:
        for key, seen in (("id", seen_ids), ("code", seen_codes), ("slug", seen_slugs)):
            value = str(row[key])
            if value in seen:
                raise ValueError(f"Duplicate {key}: {value}")
            seen.add(value)


def load_source_rows() -> list[dict[str, Any]]:
    text = SOURCE_MD.read_text(encoding="utf-8")
    blocks = split_passages(text)
    passages = [parse_passage(block) for block in blocks]
    rows = build_rows(passages)
    validate_unique(rows)
    return rows


def fetch_existing_count() -> int:
    sb = get_supabase()
    response = sb.table(TABLE).select("id", count="exact").limit(1).execute()
    return int(response.count or 0)


def insert_rows(rows: list[dict[str, Any]], *, replace: bool) -> None:
    sb = get_supabase()
    existing_count = fetch_existing_count()
    if existing_count and not replace:
        raise RuntimeError(
            f"Table {TABLE} already has {existing_count} row(s). Re-run with --replace to clear and reseed."
        )

    if replace and existing_count:
        sb.table(TABLE).delete().neq("id", "").execute()

    for row in rows:
        sb.table(TABLE).insert(row).execute()


def main() -> None:
    parser = argparse.ArgumentParser(description="One-time import of nd_passages.md into dsemcq_nd_passages")
    parser.add_argument("--dry-run", action="store_true", help="Parse and validate without writing to Supabase")
    parser.add_argument("--replace", action="store_true", help="Clear existing rows in dsemcq_nd_passages before insert")
    args = parser.parse_args()

    rows = load_source_rows()
    print(f"Parsed {len(rows)} passages from {SOURCE_MD}")
    print(f"First row: {rows[0]['id']} | {rows[0]['title']} | {rows[0]['representation']} | {rows[0]['type']}")
    print(f"Last row:  {rows[-1]['id']} | {rows[-1]['title']} | {rows[-1]['representation']} | {rows[-1]['type']}")

    if args.dry_run:
        print("Dry run complete. No data written.")
        return

    insert_rows(rows, replace=args.replace)
    print(f"Inserted {len(rows)} passages into {TABLE}")


if __name__ == "__main__":
    main()