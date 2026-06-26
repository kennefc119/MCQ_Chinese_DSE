# Tip Card Admin Dashboard

本地管理面板，用於生成 DSE 貼士卡內容並推送到 Supabase。

## 快速開始

1. 進入目錄：
   ```bash
   cd backend/tip_cards
   ```

2. 安裝依賴：
   ```bash
   pip install -r requirements.txt
   ```

3. 確保 `backend/mcq_generator/.env` 已填入 `POE_API_KEY`、`SUPABASE_URL`、`SUPABASE_SERVICE_KEY`。

4. 啟動伺服器：
   ```bash
   python -m uvicorn server:app --reload --port 8767
   ```

5. 開啟瀏覽器：http://localhost:8767

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Dashboard HTML |
| `GET` | `/api/health` | Supabase 連接測試 |
| `GET` | `/api/list-cards` | 列出所有貼士卡與分析 |
| `POST` | `/api/generate` | 使用 Poe 生成貼士卡 JSON |
| `POST` | `/api/push` | 推送貼士卡到 Supabase |
| `PATCH` | `/api/cards/{id}/toggle-active` | 切換貼士卡啟用狀態 |
| `DELETE` | `/api/cards/{id}` | 刪除貼士卡 |

## Supabase 表格結構 (`dsemcq_tip_cards`)

| 欄位 | 類型 | 說明 |
|------|------|------|
| `id` | text PK | 唯一識別碼（如 `tip-memory-method`） |
| `title` | text | 貼士卡標題 |
| `subtitle` | text | 副題 |
| `body` | text | 主體內容 |
| `image_url` | text | S3 圖片 URL |
| `category` | enum | `exam_tip` / `rest` / `study` / `wellness` |
| `position` | integer | 排序位置 |
| `is_active` | boolean | 是否對用戶顯示 |
| `read_time_minutes` | integer | 閱讀時間 |
| `related_passage_ids` | text[] | 關聯篇章 ID |
| `author` | text | 作者／來源標示 |
| `cta_label` | text | 按鈕文案 |