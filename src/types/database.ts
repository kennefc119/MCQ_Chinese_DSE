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
  bonus_ai_chat: number;       // permanent bonus monthly AI chat quota
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
  cross_passage_id: string | null;
  stem: string;
  explanation: string | null;
  difficulty: number; // 1-5
  source: string | null;
  is_active: boolean;
  admin_flag: boolean;
  user_flag_count: number;
  user_flag_comments: string | null;
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
  /** Sequential variation index within quizzes sharing the same title. Null when the title is unique. */
  title_id: number | null;
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
  subtitle?: string;
  body: string;
  image_url: string | null;
  category: "exam_tip" | "rest" | "study" | "wellness";
  position: number;
  is_active: boolean;
  read_time_minutes?: number;
  cta_label?: string;
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
  cover_image_url?: string | null;
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
  // Per-result mood image. Falls back to the test's cover_image_url in the UI.
  mood_image_url?: string | null;
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

// ─── Admin feature types ────────────────────────────────────────────────────

export type AnnouncementType = "info" | "warning" | "success";

export type AnnouncementAudience = "all" | "free" | "premium";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  type: AnnouncementType;
  audience: AnnouncementAudience;
  sent_by: string | null;
  sent_at: string;
  push_sent: boolean;
  recipients: number;
}

export interface PushToken {
  user_id: string;
  expo_push_token: string;
  platform: string | null;
  updated_at: string;
}

export interface VisitEvent {
  id: string;
  device_id: string;
  user_id: string | null;
  event_type: string;
  platform: string | null;
  occurred_at: string;
}

export interface LoginEvent {
  id: string;
  user_id: string;
  occurred_at: string;
  platform: string | null;
}

/** Aggregated metrics across a time window (e.g. last 7 days). */
export interface UsageWindowMetrics {
  windowDays: number;
  activeUsers: number;      // distinct users with quiz attempts in window
  newUsers: number;         // distinct profiles created in window
  loginEvents: number;      // raw login_events count
  visitorDevices: number;   // distinct device_id without user_id in window
  chatUsers: number;        // distinct users who sent advisor messages in window
  chatMessages: number;     // total advisor exchanges (user+bot pairs) in window
}

/** Single day's usage metrics for the daily bar chart. */
export interface DailyUsageMetric {
  date: string;           // YYYY-MM-DD
  activeUsers: number;
  newUsers: number;
  loginEvents: number;
  visitorDevices: number;
}

/** AI advisor usage statistics. */
export interface AIUsageStats {
  uniqueUsers: number;
  totalConversations: number;
  avgOutputLength: number;  // average bot_reply character count
}

/** Success rate per passage across all students. */
export interface PassageSuccessRate {
  passage_id: string;
  passage_title: string;
  correct: number;
  total: number;
  rate: number;             // 0-1
}

/** Success rate per difficulty level. */
export interface DifficultySuccessRate {
  difficulty: number;
  correct: number;
  total: number;
  rate: number;
}

/** How often each exercise is chosen by students. */
export interface ExerciseChoiceItem {
  quiz_id: string;
  quiz_title: string;
  passage_title: string | null;
  instanceCount: number;
  percentage: number;       // 0-100
}

/** Per-student exercise attempt count. */
export interface StudentExerciseCount {
  user_id: string;
  username: string;
  count: number;
}

/** Per-student ManYuen point balance snapshot. */
export interface StudentPointStat {
  user_id: string;
  username: string;
  points: number;
}

export interface MetricBoxStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

export interface PremiumMetricComparison {
  value: number;
  percentile: number;
  box: MetricBoxStats;
}

export interface PremiumUserComparison {
  allowed: boolean;
  metrics?: {
    points: PremiumMetricComparison;
    accuracy: PremiumMetricComparison;
    completed_questions: PremiumMetricComparison;
    completed_quizzes: PremiumMetricComparison;
  };
  passage_avg_by_id?: Record<string, number>;
  skill_avg_by_tag?: Record<string, number>;
}

export interface QuizPercentileFeedback {
  allowed: boolean;
  participant_count?: number;
  percentile?: number | null;
}

/** Aggregate user demographics & performance summary. */
export interface UserSummaryStats {
  totalUsers: number;
  genderBreakdown: Record<string, number>;
  dseYearBreakdown: Record<number, number>;
  subscriptionBreakdown: { free: number; premium: number };
  statusBreakdown: { active: number; inactive: number };
  avgWenyuanPoints: number;
  avgSuccessRate: number;                  // 0-100
  medianSuccessRate: number;
  psychTestCompletionRate: number;         // 0-100
  psychTestCountBreakdown: Record<number, number>; // count of tests → user count
}

/** Summary of exercise/question inventory. */
export interface InventorySummary {
  totalQuizzes: number;
  totalExercises: number;
  totalQuestions: number;
  activeQuestions: number;
  flaggedQuestions: number;
  byPassage: { passage_id: string; passage_title: string; questionCount: number; exerciseCount: number }[];
  byDifficulty: { difficulty: number; count: number }[];
  byTag: { tag_id: string; tag_label: string; count: number }[];
}

/** App setting key-value pair. */
export interface AppSetting {
  key: string;
  value: unknown;
  updated_at: string;
  updated_by: string | null;
}

export interface AdminPeerBaselineSnapshotStatus {
  generated_at: string | null;
  generated_by: string | null;
  users_counted: number;
  attempts_counted: number;
}

export interface AdminPeerBaselineRefreshResult {
  ok: boolean;
  generated_at?: string;
  users_counted?: number;
  attempts_counted?: number;
  error?: string;
}

/** Education email domain statistics. */
export interface EduDomainStat {
  domain: string;
  count: number;
}

/** Monthly signups from a specific edu domain. */
export interface EduDomainMonthly {
  domain: string;
  month: string;   // YYYY-MM
  count: number;
}

/** A single quiz attempt summary for the user-history admin view. */
export interface AttemptHistoryItem {
  attempt_id: string;
  quiz_id: string;
  quiz_title: string;
  passage_id: string | null;
  passage_title: string | null;
  score: number | null;
  total: number;
  percentage: number;        // 0-100; -1 if not yet scored
  status: "in_progress" | "submitted" | "expired";
  started_at: string;
  submitted_at: string | null;
  time_spent_seconds: number | null;
}

/** Per-skill (tag) aggregate for a single user. */
export interface UserSkillStat {
  tag_id: string;
  tag_label: string;
  attempted: number;
  correct: number;
  accuracy: number;          // 0-1
}

/** Per-difficulty aggregate for a single user. */
export interface UserDifficultyStat {
  difficulty: number;        // 1-5
  attempted: number;
  correct: number;
  accuracy: number;
}

/** Per-passage aggregate for a single user. */
export interface UserPassageStat {
  passage_id: string;
  passage_title: string;
  attempted: number;
  correct: number;
  accuracy: number;
}
