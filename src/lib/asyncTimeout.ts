export function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => {
      reject(new Error(`[timeout] ${label} exceeded ${ms}ms`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(id);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(id);
        reject(err);
      });
  });
}

export function isTimeoutError(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? error ?? "");
  return msg.includes("[timeout]");
}
