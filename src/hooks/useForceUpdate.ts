/**
 * useForceUpdate — checks if the installed binary version meets the minimum
 * required version stored in dsemcq_app_settings.
 *
 * Returns:
 *   checking  — true while the async check is in flight
 *   required  — true when the user must update before proceeding
 *
 * Fail-open: any network/parse error lets the app proceed normally so that
 * a Supabase outage never locks out users.
 */
import { useEffect, useState } from "react";
import Constants from "expo-constants";
import { fetchMinAppVersion } from "../lib/dataService";

function parseSemver(v: string): [number, number, number] {
  const parts = (v ?? "0.0.0").split(".").map((p) => parseInt(p, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function isOutdated(current: string, required: string): boolean {
  const [cMa, cMi, cPa] = parseSemver(current);
  const [rMa, rMi, rPa] = parseSemver(required);
  if (cMa !== rMa) return cMa < rMa;
  if (cMi !== rMi) return cMi < rMi;
  return cPa < rPa;
}

export interface ForceUpdateState {
  checking: boolean;
  required: boolean;
  currentVersion: string;
  minVersion: string;
}

export function useForceUpdate(): ForceUpdateState {
  const currentVersion: string =
    (Constants.expoConfig?.version as string | undefined) ?? "0.0.0";

  const [state, setState] = useState<ForceUpdateState>({
    checking: true,
    required: false,
    currentVersion,
    minVersion: "0.0.0",
  });

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    let timedOut = false;

    const applyResult = (minVersion: string, required: boolean) => {
      if (cancelled) return;
      setState({ checking: false, required, currentVersion, minVersion });
    };

    const timeoutId = setTimeout(() => {
      if (cancelled || settled) return;
      timedOut = true;
      console.warn("[force-update] initial check timed out after 3s; fail-open and recheck in background");
      applyResult("0.0.0", false);
    }, 3000);

    fetchMinAppVersion()
      .then((minVersion) => {
        if (cancelled || settled) return;
        settled = true;
        clearTimeout(timeoutId);
        const required = isOutdated(currentVersion, minVersion);
        applyResult(minVersion, required);
      })
      .catch(() => {
        // Fail-open: network error → let the app proceed
        if (cancelled || settled) return;
        settled = true;
        clearTimeout(timeoutId);
        applyResult("0.0.0", false);
      });

    // If initial check timed out, try one non-blocking recheck.
    const recheckId = setTimeout(() => {
      if (cancelled || !timedOut) return;
      fetchMinAppVersion()
        .then((minVersion) => {
          if (cancelled) return;
          const required = isOutdated(currentVersion, minVersion);
          if (required) {
            console.warn("[force-update] background recheck requires update; enforcing now");
          }
          setState((prev) => ({
            ...prev,
            required,
            minVersion,
          }));
        })
        .catch(() => {
          // Keep fail-open state if recheck still fails.
        });
    }, 1200);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      clearTimeout(recheckId);
    };
  }, [currentVersion]);

  return state;
}
