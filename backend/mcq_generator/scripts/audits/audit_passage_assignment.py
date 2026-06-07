#!/usr/bin/env python3
"""
Audit questions to check if they are assigned to the correct passage.
Fetches all passages and questions, then uses keyword/content matching
to detect misassignments.

Usage:
  python audit_passage_assignment.py          # audit only
  python audit_passage_assignment.py --apply  # apply fixes
"""

import argparse
import os
import re
import json
from collections import defaultdict
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]


def fetch_all(sb, table, select="*"):
    all_rows = []
    offset = 0
    batch = 1000
    while True:
        resp = sb.table(table).select(select).range(offset, offset + batch - 1).execute()
        rows = resp.data
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < batch:
            break
        offset += batch
    return all_rows


# ── Passage keyword mapping ──────────────────────────────────────────
# Each passage has distinctive keywords/phrases that appear in its text
PASSAGE_SIGNATURES = {
    "p01": {
        "title": "論仁、論孝、論君子 (論語)",
        "keywords": [
            "論語", "仁者", "不仁", "克己復禮", "殺身成仁", "君子",
            "孝", "孟懿子", "無違", "犬馬", "父母之年", "坦蕩蕩",
            "戚戚", "小人", "忠信", "里仁", "顏淵", "衛靈公",
            "為政", "學而", "述而", "憲問", "司馬牛", "樊遲",
            "子游", "成人之美", "恥其言而過其行", "病無能",
            "求諸己", "求諸人", "義以為質", "禮以行之",
            "論仁", "論孝", "論君子", "孔子", "子曰",
            "幾諫", "見志不從", "敬不違", "勞而不怨",
        ],
    },
    "p02": {
        "title": "魚我所欲也 (孟子)",
        "keywords": [
            "魚我所欲", "熊掌", "舍生取義", "苟得", "一簞食",
            "一豆羹", "嘑爾", "蹴爾", "萬鍾", "本心", "孟子",
            "宮室之美", "妻妾之奉", "窮乏者得我", "弗得則死",
            "辟患", "賢者能勿喪", "禮義", "所欲有甚於生",
            "舍魚而取熊掌", "鄉為身死",
        ],
    },
    "p03": {
        "title": "逍遙遊 (莊子)",
        "keywords": [
            "逍遙遊", "莊子", "惠子", "大瓠", "魏王", "五石",
            "不龜手", "洴澼絖", "吳王", "越人", "大樽",
            "蓬之心", "樗", "擁腫", "繩墨", "規矩", "狸狌",
            "斄牛", "罔罟", "敖者", "無何有之鄉", "廣莫之野",
            "機辟", "跳梁", "大而無用",
        ],
    },
    "p04": {
        "title": "勸學 (荀子)",
        "keywords": [
            "勸學", "荀子", "學不可以已", "青取之於藍", "冰水為之",
            "輮以為輪", "木受繩則直", "金就礪則利", "博學而日參省",
            "跂而望", "登高而招", "順風而呼", "假輿馬", "假舟楫",
            "善假於物", "積土成山", "積水成淵", "騏驥", "駑馬",
            "鍥而舍之", "鍥而不舍", "金石可鏤", "螾", "蟹",
            "用心一也", "用心躁也", "跬步",
        ],
    },
    "p05": {
        "title": "廉頗藺相如列傳 (司馬遷)",
        "keywords": [
            "廉頗", "藺相如", "和氏璧", "完璧歸趙", "秦王",
            "趙王", "趙惠文王", "繆賢", "章台", "澠池",
            "負荊請罪", "刎頸之交", "上卿", "缻", "九賓",
            "湯鑊", "肉袒", "怒髮上衝冠", "司馬遷", "史記",
            "廉頗藺相如列傳", "上大夫",
        ],
    },
    "p06": {
        "title": "出師表 (諸葛亮)",
        "keywords": [
            "出師表", "諸葛亮", "先帝", "崩殂", "益州疲弊",
            "危急存亡", "陛下", "開張聖聽", "妄自菲薄",
            "陟罰臧否", "郭攸之", "費禕", "董允", "向寵",
            "親賢臣遠小人", "先漢", "後漢", "桓靈",
            "躬耕南陽", "草廬", "三顧", "五月渡瀘",
            "北定中原", "討賊興復", "漢室", "劉禪",
            "先帝創業未半", "出師", "諸葛",
        ],
    },
    "p07": {
        "title": "師說 (韓愈)",
        "keywords": [
            "師說", "韓愈", "傳道受業解惑", "師者", "從師",
            "師道", "聖益聖愚益愚", "句讀", "巫醫樂師百工",
            "士大夫之族", "位卑則足羞", "官盛則近諛",
            "孔子師郯子", "萇弘", "師襄", "老聃",
            "三人行", "李氏子蟠", "古文運動", "學於余",
            "術業有專攻",
        ],
    },
    "p08": {
        "title": "始得西山宴遊記 (柳宗元)",
        "keywords": [
            "西山", "柳宗元", "僇人", "惴慄", "施施而行",
            "漫漫而遊", "法華西亭", "湘江", "染溪",
            "箕踞", "攢蹙", "遯隱", "縈青繚白", "顥氣",
            "造物者遊", "心凝形釋", "萬化冥合", "元和四年",
            "始得西山", "西山宴遊", "頹然就醉",
            "永州",
        ],
    },
    "p09": {
        "title": "岳陽樓記 (范仲淹)",
        "keywords": [
            "岳陽樓", "范仲淹", "滕子京", "巴陵", "洞庭",
            "銜遠山", "吞長江", "朝暉夕陰", "遷客騷人",
            "霪雨霏霏", "檣傾楫摧", "去國懷鄉", "憂讒畏譏",
            "春和景明", "浮光躍金", "靜影沉璧", "把酒臨風",
            "不以物喜", "不以己悲", "先天下之憂而憂",
            "後天下之樂而樂", "微斯人", "慶曆四年",
            "居廟堂之高", "處江湖之遠",
        ],
    },
    "p10": {
        "title": "六國論 (蘇洵)",
        "keywords": [
            "六國論", "蘇洵", "六國破滅", "弊在賂秦", "賂秦",
            "六國互喪", "率賂秦", "暴秦之欲無厭",
            "抱薪救火", "以地事秦", "齊人未嘗賂秦",
            "燕趙之君", "荊卿", "李牧", "邯鄲為郡",
            "積威之所劫", "日削月割", "封天下之謀臣",
            "禮天下之奇才", "六國與秦皆諸侯",
            "尺寸之地", "割五城", "割十城",
        ],
    },
    "p11": {
        "title": "唐詩三首",
        "keywords": [
            "山居秋暝", "王維", "空山新雨", "明月松間照",
            "清泉石上流", "竹喧歸浣女", "蓮動下漁舟",
            "月下獨酌", "李白", "花間一壺酒", "獨酌無相親",
            "舉杯邀明月", "對影成三人", "月既不解飲",
            "暫伴月將影", "永結無情遊", "相期邈雲漢",
            "登樓", "杜甫", "花近高樓傷客心", "萬方多難",
            "錦江春色", "玉壘浮雲", "北極朝廷", "西山寇盜",
            "後主還祠廟", "梁甫吟",
        ],
    },
    "p12": {
        "title": "詞三首",
        "keywords": [
            "念奴嬌", "赤壁懷古", "蘇軾", "大江東去", "浪淘盡",
            "周郎赤壁", "亂石穿空", "驚濤拍岸", "千堆雪",
            "公瑾", "小喬", "羽扇綸巾", "檣櫓灰飛煙滅",
            "人間如夢", "酹江月", "華髮",
            "聲聲慢", "李清照", "尋尋覓覓", "冷冷清清",
            "悽悽慘慘戚戚", "乍煖還寒", "三杯兩盞淡酒",
            "黃花堆積", "梧桐更兼細雨", "愁字了得",
            "青玉案", "元夕", "辛棄疾", "東風夜放花千樹",
            "寶馬雕車", "魚龍舞", "蛾兒雪柳", "燈火闌珊",
            "驀然迴首",
        ],
    },
}


def score_question_for_passage(stem: str, options_texts: list[str], pid: str) -> int:
    """Score how well a question+options matches a passage by keyword hits."""
    sigs = PASSAGE_SIGNATURES.get(pid)
    if not sigs:
        return 0
    combined = stem + " " + " ".join(options_texts)
    score = 0
    for kw in sigs["keywords"]:
        if kw in combined:
            score += 1
    return score


def best_passage(stem: str, options_texts: list[str]) -> list[tuple[str, int]]:
    """Return list of (passage_id, score) sorted descending."""
    scores = []
    for pid in PASSAGE_SIGNATURES:
        s = score_question_for_passage(stem, options_texts, pid)
        if s > 0:
            scores.append((pid, s))
    scores.sort(key=lambda x: -x[1])
    return scores


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Fetch passages
    passages = fetch_all(sb, "dsemcq_passages", "id, title, slug")
    print(f"Passages: {len(passages)}")
    for p in sorted(passages, key=lambda x: x["id"]):
        print(f"  {p['id']:6s}  {p['title']}")

    # Fetch all questions
    questions = fetch_all(sb, "dsemcq_questions", "id, passage_id, stem")
    print(f"\nQuestions: {len(questions)}")

    # Fetch all options
    options = fetch_all(sb, "dsemcq_question_options", "id, question_id, text")
    opts_by_q = defaultdict(list)
    for o in options:
        opts_by_q[o["question_id"]].append(o["text"] or "")

    # Audit each question
    mismatches = []
    for q in questions:
        qid = q["id"]
        current_pid = q["passage_id"]
        stem = q["stem"] or ""
        opt_texts = opts_by_q.get(qid, [])

        # Score current passage
        current_score = score_question_for_passage(stem, opt_texts, current_pid)

        # Find best passage
        rankings = best_passage(stem, opt_texts)
        if not rankings:
            continue

        best_pid, best_score = rankings[0]

        # Flag if current passage has 0 score OR best passage scores much higher
        if current_score == 0 and best_score > 0:
            mismatches.append({
                "qid": qid,
                "current_pid": current_pid,
                "current_score": current_score,
                "best_pid": best_pid,
                "best_score": best_score,
                "stem": stem[:80],
                "rankings": rankings[:3],
            })
        elif best_pid != current_pid and best_score >= current_score + 3:
            mismatches.append({
                "qid": qid,
                "current_pid": current_pid,
                "current_score": current_score,
                "best_pid": best_pid,
                "best_score": best_score,
                "stem": stem[:80],
                "rankings": rankings[:3],
            })

    mismatches.sort(key=lambda x: x["qid"])

    print(f"\n{'='*120}")
    print(f"Found {len(mismatches)} potential misassignments:\n")

    fixes = []
    for m in mismatches:
        print(f"  Question:  {m['qid']}")
        print(f"  Stem:      {m['stem']}...")
        print(f"  Current:   {m['current_pid']} (score={m['current_score']})")
        for pid, sc in m["rankings"]:
            marker = " <<<" if pid == m["rankings"][0][0] else ""
            print(f"  Candidate: {pid} (score={sc}){marker}")

        # Determine fix: use the best-scoring passage
        # If top-2 are close (within 2), could be multi-passage
        top = m["rankings"]
        if len(top) >= 2 and top[1][1] >= top[0][1] - 1 and top[1][1] >= 2:
            suggested = f"{top[0][0]},{top[1][0]}"
        else:
            suggested = top[0][0]

        print(f"  Suggested: {suggested}")
        print(f"  {'-'*110}")

        fixes.append({"qid": m["qid"], "new_pid": suggested})

    if not fixes:
        print("  No misassignments found!")
        return

    if not args.apply:
        print(f"\n** DRY RUN — {len(fixes)} fixes shown. Re-run with --apply to write. **")
        return

    # Apply fixes
    print(f"\nApplying {len(fixes)} fixes...")
    ok = 0
    fail = 0
    for f in fixes:
        try:
            sb.table("dsemcq_questions").update({"passage_id": f["new_pid"]}).eq("id", f["qid"]).execute()
            ok += 1
        except Exception as e:
            print(f"  FAILED {f['qid']}: {e}")
            fail += 1
    print(f"Done. {ok} updated, {fail} failed.")


if __name__ == "__main__":
    main()
