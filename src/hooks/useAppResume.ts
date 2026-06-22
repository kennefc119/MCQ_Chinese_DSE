import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

export function useAppResume(onResume: () => void, enabled: boolean = true): void {
  const cb = useRef(onResume);
  cb.current = onResume;
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!enabled) return;

    const sub = AppState.addEventListener("change", (next) => {
      const prev = appState.current;
      appState.current = next;
      if ((prev === "background" || prev === "inactive") && next === "active") {
        cb.current();
      }
    });

    return () => sub.remove();
  }, [enabled]);
}
