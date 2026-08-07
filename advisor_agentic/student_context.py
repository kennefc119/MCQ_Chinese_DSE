import argparse
import json

from supabase_client import get_supabase


def load_student_context(user_id: str) -> dict:
    supabase = get_supabase()
    profile = (
        supabase.table("dsemcq_profiles")
        .select("dse_year")
        .eq("id", user_id)
        .maybe_single()
        .execute()
        .data
    )
    results = (
        supabase.table("dsemcq_psych_user_results")
        .select("test_id, result_code, completed_at")
        .eq("user_id", user_id)
        .order("completed_at", desc=True)
        .limit(3)
        .execute()
        .data
        or []
    )
    return {"profile": profile, "psych_results": results}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", required=True)
    args = parser.parse_args()
    print(json.dumps(load_student_context(args.user_id), ensure_ascii=False, indent=2))