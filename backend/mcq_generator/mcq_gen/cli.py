"""
CLI 入口 — typer app。
用法：
  mcq-gen run --count 100
  mcq-gen run --count 5 --passage p09
  mcq-gen run --count 3 --dry-run
  mcq-gen stats
  mcq-gen build-quizzes --from-recent 30
  mcq-gen fetch-passages
"""
from __future__ import annotations

import datetime
import json
import sys
from typing import Optional

import structlog
import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(
    name="mcq-gen",
    help="DSE 中文 MC 出題 Agentic Workflow CLI",
    no_args_is_help=True,
)
console = Console()
log = structlog.get_logger(__name__)


def _init_logging() -> str:
    run_id = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    from .logger import setup_logging
    setup_logging(run_id)
    return run_id


# ─── Commands ────────────────────────────────────────────────────────────────


@app.command()
def run(
    count: int = typer.Option(10, "--count", "-n", help="要生成的題目數量"),
    passage: Optional[str] = typer.Option(
        None, "--passage", "-p", help="限定篇章 ID，例如 p09（預設由策略師自動選）"
    ),
    difficulty: Optional[int] = typer.Option(
        None, "--difficulty", "-d",
        help="強制難度 1-5（1=最淺, 2=淺, 3=中, 4=深, 5=最深）；預設由策略師自動選",
        min=1, max=5,
    ),
    skill: Optional[str] = typer.Option(
        None, "--skill", "-s",
        help="強制考核能力（例如：修辭手法）；可選：字詞解釋/內容理解/主旨歸納/修辭手法/人物分析/句式語法/背景知識/跨篇章比較",
    ),
    dry_run: bool = typer.Option(False, "--dry-run", help="生成但不寫入 Supabase"),
) -> None:
    """執行出題 pipeline，生成 N 條 MC 題目。"""
    run_id = _init_logging()
    console.print(f"\n[bold cyan]🚀 開始出題 Pipeline[/bold cyan]")
    console.print(f"   目標數量: [yellow]{count}[/yellow]")
    if passage:
        console.print(f"   指定篇章: [yellow]{passage}[/yellow]")
    if difficulty:
        diff_labels = {1: "最淺①", 2: "淺②", 3: "中③", 4: "深④", 5: "最深⑤"}
        console.print(f"   強制難度: [yellow]{diff_labels.get(difficulty, difficulty)}[/yellow]")
    if skill:
        # Validate skill value
        from .schemas import Skill
        valid_skills = {s.value for s in Skill}
        if skill not in valid_skills:
            console.print(f"[red]❌ 無效考核能力「{skill}」，可選：{' / '.join(valid_skills)}[/red]")
            raise typer.Exit(1)
        console.print(f"   強制考核能力: [yellow]{skill}[/yellow]")
    if dry_run:
        console.print(f"   [red]⚠ Dry-run 模式 — 不會寫入 Supabase[/red]")
    console.print(f"   Run ID: [dim]{run_id}[/dim]\n")

    # 確認 passages.json 存在
    from pathlib import Path
    passages_file = Path(__file__).parent.parent / "data" / "passages.json"
    if not passages_file.exists():
        console.print(
            "[red]❌ 找不到 data/passages.json — 請先執行 `mcq-gen fetch-passages`[/red]"
        )
        raise typer.Exit(1)

    from .graph import run_pipeline

    try:
        results = run_pipeline(
            count=count,
            passage=passage,
            difficulty=difficulty,
            skill=skill,
            dry_run=dry_run,
        )
    except Exception as exc:
        console.print(f"[red]❌ Pipeline 錯誤: {exc}[/red]")
        log.exception("pipeline_error")
        raise typer.Exit(1)

    # 結果表格
    table = Table(title=f"生成結果（共 {len(results)} 條）", show_lines=True)
    table.add_column("Question ID", style="dim")
    table.add_column("篇章")
    table.add_column("難度")
    table.add_column("考核能力")
    table.add_column("分數", justify="right")
    table.add_column("狀態")

    for q in results:
        status = "[green]✅ 已寫入[/green]" if q.is_active else "[yellow]⚠ 待審核[/yellow]"
        if dry_run:
            status = "[dim]dry-run[/dim]"
        table.add_row(
            q.question_id,
            q.passage_id,
            q.difficulty_label.value,
            q.skill.value,
            str(q.critique_score),
            status,
        )

    console.print(table)
    console.print(f"\n[green]✅ 完成！日誌已寫入 logs/run-{run_id}.jsonl[/green]\n")


@app.command()
def stats() -> None:
    """顯示現有題庫的維度分佈統計。"""
    _init_logging()
    console.print("\n[bold cyan]📊 題庫統計[/bold cyan]\n")

    from .db.stats import fetch_db_stats

    try:
        s = fetch_db_stats()
    except Exception as exc:
        console.print(f"[red]❌ 無法讀取統計: {exc}[/red]")
        raise typer.Exit(1)

    console.print(f"  總題數：[bold]{s.total}[/bold]")
    console.print(f"  跨篇章題：{s.cross_passage_count}")
    console.print(f"  待人工審核：[yellow]{s.needs_review_count}[/yellow]")

    # by_passage table
    p_table = Table(title="按篇章分佈")
    p_table.add_column("篇章 ID")
    p_table.add_column("題數", justify="right")
    for pid, cnt in sorted(s.by_passage.items()):
        p_table.add_row(pid, str(cnt))
    console.print(p_table)

    # by difficulty
    d_table = Table(title="按難度分佈")
    d_table.add_column("難度")
    d_table.add_column("題數", justify="right")
    for diff, cnt in s.by_difficulty.items():
        d_table.add_row(diff, str(cnt))
    console.print(d_table)

    # by skill
    sk_table = Table(title="按考核能力分佈")
    sk_table.add_column("考核能力")
    sk_table.add_column("題數", justify="right")
    for skill, cnt in s.by_skill.items():
        sk_table.add_row(skill, str(cnt))
    console.print(sk_table)

    console.print()


@app.command(name="build-quizzes")
def build_quizzes(
    from_recent: int = typer.Option(30, "--from-recent", help="從最近 N 條 agent 題目組卷"),
) -> None:
    """將近期 agent 生成的題目自動組合成 quiz / exam。"""
    _init_logging()
    console.print(f"\n[bold cyan]🔨 自動組卷[/bold cyan]（最近 {from_recent} 條）\n")

    from .quiz_builder import build_quizzes_from_recent

    try:
        created = build_quizzes_from_recent(from_recent=from_recent)
    except Exception as exc:
        console.print(f"[red]❌ 組卷失敗: {exc}[/red]")
        raise typer.Exit(1)

    console.print(f"[green]✅ 已新建 {created} 個 quiz（預設 is_published=false，請在 Supabase 審核後啟用）[/green]\n")


@app.command(name="fetch-passages")
def fetch_passages() -> None:
    """從 Supabase 拉取 12 篇課文並快取到 data/passages.json（首次設定或課文更新後執行）。"""
    _init_logging()
    console.print("\n[bold cyan]📥 拉取課文...[/bold cyan]\n")

    from .passages import fetch_and_cache_passages

    try:
        passages = fetch_and_cache_passages()
    except Exception as exc:
        console.print(f"[red]❌ 拉取失敗: {exc}[/red]")
        raise typer.Exit(1)

    console.print(f"[green]✅ 已快取 {len(passages)} 篇課文到 data/passages.json[/green]\n")


@app.command()
def serve(
    port: int = typer.Option(8765, "--port", "-p", help="本地 HTTP port"),
    reload: bool = typer.Option(False, "--reload", help="開發模式 auto-reload"),
) -> None:
    """啟動本地 dashboard API server。開啟 dashboard.html 即可使用視覺化介面。"""
    from .server import start_server

    console.print(f"\n[bold green]🚀 MCQ Dashboard 伺服器啟動中...[/bold green]")
    console.print(f"   API:       [cyan]http://127.0.0.1:{port}/docs[/cyan]")
    console.print(f"   Dashboard: [cyan]開啟 backend/mcq_generator/dashboard.html[/cyan]")
    console.print("[dim]   按 Ctrl+C 停止[/dim]\n")
    start_server(port=port, reload=reload)


if __name__ == "__main__":
    app()
