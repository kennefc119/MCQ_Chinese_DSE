import { useWindowDimensions } from "react-native";

/** Width at which we switch to the tablet (iPad) layout. */
export const TABLET_BREAKPOINT = 768;

/**
 * Max content width for text-heavy single-column screens (Profile, QuizDetail, etc.)
 * on iPad. Content is centred within the remaining space.
 */
export const CONTENT_MAX_WIDTH = 680;

/**
 * Returns `isTablet: true` when the window width is at or above the tablet
 * breakpoint. Reactive — updates on orientation change.
 */
export function useDeviceType() {
  const { width } = useWindowDimensions();
  return { isTablet: width >= TABLET_BREAKPOINT };
}
