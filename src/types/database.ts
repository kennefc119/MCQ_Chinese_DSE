// Supabase schema 對應 TypeScript 型別 (前綴 dsemcq_)

export type QuizType = "exercise" | "quiz" | "exam";
export type Gender = "male" | "female" | "other";
export type Role = "user" | "admin";

export interface Profile {
  id: string;
  email: string;
  username: string;
  gender: Gender;
  dse_year: number; // 預計考 DSE 年份
  wenyuan_points: number;
  role: Role;
  subscription_tier: "free" | "premium";
  subscription_status: "active" | "inactive";
  created_at: string;
}

export interface Passage {
  id: string;
  slug: string;
  order_no: number;
  title: string;
  dynasty: string | null;
  author: string | null;
  body: string;
  summary: string | null;
}

export interface Tag {
  id: string;
  slug: string;
  label: string;
}

export interface Question {
  id: string;
  passage_id: string | null;
  stem: string;
  explanation: string | null;
  difficulty: number; // 1-5
  source: string | null;
  is_active: boolean;
  options: QuestionOption[];
  tag_ids?: string[];
}

export interface QuestionOption {
  id: string;
  question_id: string;
  label: string | null; // null for new label-free questions; app assigns A/B/C/D at runtime
  text: string;
  is_correct: boolean;
  explanation?: string | null; // per-option explanation (why correct or why wrong)
}

export interface Quiz {
  id: string;
  type: QuizType;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  passage_id: string | null;
  difficulty: number;
  duration_seconds: number | null; // null = 不限時
  max_attempts: number | null; // null = 無限
  pass_score: number; // 百分比
  points_reward: number;
  min_points_required: number;
  scheduled_start: string | null;
  scheduled_end: string | null;
  is_published: boolean;
  question_ids: string[];
  created_at: string;
}

export interface Attempt {
  id: string;
  user_id: string;
  quiz_id: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null; // 答對題數
  total: number;
  time_spent_seconds: number | null;
  status: "in_progress" | "submitted" | "expired";
  answers: Record<string, string>; // question_id -> selected_option_id
}

export interface QuizSignup {
  id: string;
  user_id: string;
  quiz_id: string;
  signed_up_at: string;
}

export interface InboxMessage {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: "info" | "warning" | "success";
  read: boolean;
  created_at: string;
}

export interface TipCard {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  category: "exam_tip" | "rest" | "study" | "wellness";
  position: number;
  is_active: boolean;
}

export interface PsychTest {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon_name: string;
  question_count: number;
  estimated_minutes: number;
  questions: PsychQuestion[];
  results: PsychResultMapping[];
  color_hex?: string;
  position?: number;
  featured?: boolean;
}

export interface PsychQuestion {
  id: string;
  text: string;
  options: { label: string; value: number; dimension?: string }[];
}

export interface PsychResultMapping {
  code: string;
  title: string;
  description: string;
  emoji: string;
  // Enriched fields (v2 tests only — optional for backward compat)
  historical_figure?: string;
  historical_background?: string;
  strengths?: string[];
  weaknesses?: string[];
  famous_quote?: string;
  study_tips?: string[];
}

export interface PsychUserResult {
  test_id: string;
  result_code: string;
  completed_at: string;
}

export interface PsychResult {
  id: string;
  user_id: string;
  test_id: string;
  result_code: string;
  completed_at: string;
}

export interface AdvisorMessageRecord {
  id: string;
  user_id: string;
  user_text: string;
  bot_reply: string;
  created_at: string;
}
