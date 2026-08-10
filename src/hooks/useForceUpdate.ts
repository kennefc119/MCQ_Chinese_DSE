/**
 * useForceUpdate — checks if the installed binary version meets the minimum
 * required version stored in dsemcq_app_settings.
 *
 * Returns:
 *   checking  — true while the async check is in flight
 *   required  — true when the user must update before proceeding
 *
 * A previously verified minimum version is cached so transient network
 * failures cannot incorrectly block current users at launch.
 */
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { AppState } from "react-native";
import { fetchMinAppVersion } from "../lib/dataService";

const MIN_VERSION_CACHE_KEY = "dsemcq.min_app_version";
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

function parseSemver(version: string): [number, number, number] {
  const parts = version.split(".").map((part) => parseInt(part, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function isValidSemver(version: string | null): version is string {
  return typeof version === "string" && SEMVER_PATTERN.test(version);
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
    Application.nativeApplicationVersion ??
    (Constants.expoConfig?.version as string | undefined) ??
    "0.0.0";

  const [state, setState] = useState<ForceUpdateState>({
    checking: true,
    required: false,
    currentVersion,
    minVersion: "0.0.0",
  });

  useEffect(() => {
    let cancelled = false;

    const applyVersion = (minVersion: string) => {
      if (cancelled) return;
      const required = isOutdated(currentVersion, minVersion);
      setState({
        checking: false,
        required,
        currentVersion,
        minVersion,
      });
    };

    const checkVersion = async () => {
      const cachedVersion = await AsyncStorage.getItem(MIN_VERSION_CACHE_KEY).catch(() => null);
      if (isValidSemver(cachedVersion)) {
        applyVersion(cachedVersion);
      } else if (!cancelled) {
        // No verified cache: do not make a network failure look like an update requirement.
        setState((previous) => ({ ...previous, checking: false }));
      }

      const minVersion = await fetchMinAppVersion();
      if (!isValidSemver(minVersion)) {
        console.warn("[force-update] version check unavailable or returned an invalid version");
        return;
      }

      await AsyncStorage.setItem(MIN_VERSION_CACHE_KEY, minVersion).catch(() => undefined);
      applyVersion(minVersion);
    };

    void checkVersion();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void checkVersion();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [currentVersion]);

  return state;
}
