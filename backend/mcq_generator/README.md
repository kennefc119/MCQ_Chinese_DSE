# MCQ Generator — DSE 中文 MC 出題 Agentic Workflow

獨立的 Python 後端工具，用 3-agent pipeline 為香港 DSE 中國語文科 12 篇指定篇章生成高質素 MC 題目，並以 **append-only** 方式寫入 Supabase。**不會修改或刪除任何現有資料。**

## 三個 Agent

1. **題型策略師（Strategist）** — 讀現存題目分佈，決定下一題的維度規格（篇章 / 難度 / 考核能力 / 跨篇章）
2. **出題員（Drafter）** — 根據規格 + 課文全文 起草一條完整 MC 題目（題幹、4 選項、答案、解釋）
3. **審題主任（Critic）** — 嚴格審核：spec 合規、學術準確、難度校準、選項質素、語言質素 → PASS / REVISE

REVISE 最多 3 輪；超過則保留為 `is_active=false` + `source='agent-v1-needs-review'` 待人工審核。

## 安裝

```bash
cd backend/mcq_generator
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Windows
pip install -e .
cp .env.example .env           # 填入 OPENAI_API_KEY 和 SUPABASE_SERVICE_KEY
```

## 使用

```bash
# 一次生成 100 條
mcq-gen run --count 100

# 限定篇章
mcq-gen run --count 5 --passage p09

# 不寫入 DB（dry-run）
mcq-gen run --count 3 --dry-run

# 只看現有題目分佈
mcq-gen stats

# 將近期生成的題目組合成 quiz/exam
mcq-gen build-quizzes --from-recent 30
```

## 結構

```
mcq_gen/
├── cli.py              # typer 入口
├── config.py           # 環境變數 + 設定
├── llm.py              # LLM 呼叫 wrapper
├── schemas.py          # Pydantic models
├── graph.py            # LangGraph 流程編排
├── quiz_builder.py     # 自動組卷
├── logger.py           # JSONL logging
├── prompts/            # 3 個 system prompts（繁中）
├── agents/             # 3 個 agent 實作
└── db/                 # Supabase client + stats + writer
```

## 安全

- `SUPABASE_SERVICE_KEY` 只放於本地 `.env`，**永不入 git、永不入 app bundle**
- Writer 嚴格 INSERT only，無 UPDATE / DELETE 程式碼路徑
- 所有 INSERT 帶 `ON CONFLICT (id) DO NOTHING`
