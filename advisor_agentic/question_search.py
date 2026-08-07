import argparse
import json

from supabase_client import get_supabase


def search_questions(query: str, limit: int = 5) -> list[dict]:
    safe_query = query.replace("%", " ").replace("_", " ").strip()[:80]
    if not safe_query:
        return []
    response = (
        get_supabase()
        .table("dsemcq_questions")
        .select("id, stem, explanation, passage_id, difficulty, source")
        .eq("is_active", True)
        .ilike("stem", f"%{safe_query}%")
        .limit(limit)
        .execute()
    )
    return response.data or []


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("query")
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()
    print(json.dumps(search_questions(args.query, args.limit), ensure_ascii=False, indent=2))