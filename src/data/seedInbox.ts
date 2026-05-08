import { InboxMessage } from "../types/database";

export const SEED_INBOX: InboxMessage[] = [
  {
    id: "inbox-welcome",
    user_id: "demo",
    title: "歡迎加入 DSE 文言文 MCQ！",
    body: "我們為你準備了十二篇指定篇章的練習、測驗與模擬試。完成練習可累積文淵點，解鎖更高難度的內容。祝你考運亨通！",
    type: "success",
    read: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "inbox-tip",
    user_id: "demo",
    title: "📣 小提示",
    body: "在「探索」分頁可切換格仔／瀏覽兩種模式。完成練習後，文淵點會自動累積。",
    type: "info",
    read: false,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];
