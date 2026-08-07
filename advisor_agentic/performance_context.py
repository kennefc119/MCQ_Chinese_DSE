import argparse
import json

from supabase_client import get_supabase


def load_performance_context(user_id: str) -> dict:
    supabase = get_supabase()
    attempts = (
        supabase.table("dsemcq_attempts")
        .select("id, score, total, submitted_at, time_spent_seconds")
        .eq("user_id", user_id)
        .eq("status", "submitted")
        .order("submitted_at", desc=True)
        .limit(30)
        .execute()
        .data
        or []
    )
    completed = [row for row in attempts if row.get("total", 0) > 0]
    total = sum(int(row["total"]) for row in completed)
    correct = sum(int(row.get("score") or 0) for row in completed)
    return {
        "overall": {
            "attempts": len(completed),
            "correct": correct,
            "total": total,
            "accuracy": correct / total if total else None,
        },
        "recent_attempts": completed,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", required=True)
    args = parser.parse_args()
    print(json.dumps(load_performance_context(args.user_id), ensure_ascii=False, indent=2))