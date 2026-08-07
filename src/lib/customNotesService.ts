import { supabase } from "./supabase";
import { CustomNote, CustomNoteEligibility, CustomNoteJob, CustomNoteSummary } from "../types/database";

type ApiResponse = { error?: string; code?: string; eligibility?: CustomNoteEligibility; job?: CustomNoteJob; notes?: CustomNoteSummary[]; note?: CustomNote };

async function call<T extends ApiResponse>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("dsemcq-custom-notes", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function getCustomNoteEligibility(passageId: string) {
  const result = await call<{ eligibility: CustomNoteEligibility }>({ action: "eligibility", passageId });
  return result.eligibility;
}

export async function createCustomNoteJob(passageId: string, request: string) {
  const result = await call<{ job: CustomNoteJob; reused: boolean }>({ action: "create", passageId, request });
  return result;
}

export async function getCustomNoteJob(jobId: string) {
  const result = await call<{ job: CustomNoteJob }>({ action: "status", jobId });
  return result.job;
}

export async function listCustomNotes() {
  const result = await call<{ notes: CustomNoteSummary[] }>({ action: "list" });
  return result.notes;
}

export async function getCustomNote(noteId: string) {
  const result = await call<{ note: CustomNote }>({ action: "detail", noteId });
  return result.note;
}