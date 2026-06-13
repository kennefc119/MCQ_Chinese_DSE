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

    fetchMinAppVersion()
      .then((minVersion) => {
        if (cancelled) return;
        const required = isOutdated(currentVersion, minVersion);
        setState({ checking: false, required, currentVersion, minVersion });
      })
      .catch(() => {
        // Fail-open: network error → let the app proceed
        if (!cancelled) {
          setState({ checking: false, required: false, currentVersion, minVersion: "0.0.0" });
        }
      });

    return () => { cancelled = true; };
  }, [currentVersion]);

  return state;
}
