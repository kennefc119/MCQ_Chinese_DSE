# 心理測驗 Admin Dashboard

本地管理面板，用於生成 DSE 心理測驗內容並推送到 Supabase。

## 快速開始

1. 進入目錄：
   ```bash
   cd backend/psy_tests
   ```

2. 安裝依賴：
   ```bash
   pip install -r requirements.txt
   ```

3. 複製並填寫環境變數：
   ```bash
   cp .env.example .env
   # 編輯 .env，填入 POE_API_KEY、SUPABASE_URL、SUPABASE_SERVICE_KEY
   ```

4. 啟動伺服器：
   ```bash
   python -m uvicorn server:app --reload --port 8766
   ```

5. 開啟瀏覽器：http://localhost:8766

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Dashboard HTML |
| `GET` | `/api/health` | Supabase 連接測試 |
| `GET` | `/api/list-tests` | 列出所有心理測驗 |
| `POST` | `/api/generate` | 使用 LLM 生成測驗 JSON |
| `POST` | `/api/push` | 推送測驗到 Supabase |
| `PATCH` | `/api/tests/{id}/position` | 更新測驗排序位置 |
| `PATCH` | `/api/tests/{id}/toggle-active` | 切換測驗啟用狀態 |

## 測驗類型

- **性格古人配對** (`character-match`) — 配對學生與歷史人物
- **學習風格測驗** (`study-style`) — 分析學習偏好維度
- **職業傾向測驗** (`career-inclination`) — 探索未來職業方向

## Supabase 表格結構 (`dsemcq_psych_tests`)

| 欄位 | 類型 | 說明 |
|------|------|------|
| `id` | text PK | 唯一識別碼（如 `psy-character-match-v1`）|
| `title` | text | 測驗標題（繁體中文）|
| `description` | text | 測驗描述 |
| `is_active` | boolean | 是否對用戶顯示 |
| `color_hex` | text | 主題顏色（如 `#C4975A`）|
| `position` | integer | 排序位置 |
| `featured` | boolean | 是否置頂推薦 |
| `questions` | jsonb | 問題陣列 |
| `results` | jsonb | 結果陣列 |
| `created_at` | timestamptz | 建立時間 |
