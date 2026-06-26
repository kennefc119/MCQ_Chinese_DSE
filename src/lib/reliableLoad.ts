import { withTimeout } from "./asyncTimeout";

export async function reliableLoad<T>(args: {
  task: Promise<T> | (() => Promise<T>);
  timeoutMs: number;
  label: string;
  fallback: T;
}): Promise<T> {
  const { task, timeoutMs, label, fallback } = args;
  try {
    const promise = typeof task === "function" ? task() : task;
    return await withTimeout(promise, timeoutMs, label);
  } catch {
    return fallback;
  }
}
