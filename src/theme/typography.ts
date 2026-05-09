import { Platform, TextStyle } from "react-native";

// Font families resolve to the loaded Noto Serif TC weights when fonts are ready.
// Body text uses the OS system stack — fast, native, and excellent CJK rendering on
// iOS (PingFang TC) and Android (Noto Sans CJK).
export const fontFamilies = {
  serifRegular: "NotoSerifTC_400Regular",
  serifBold: "NotoSerifTC_700Bold",
  // intentionally undefined — falls back to system font
  sans: Platform.select<string | undefined>({ ios: undefined, android: undefined, default: undefined }),
} as const;

// Use the serif face on screens / headings; sans for body. The hierarchy is
// deliberately small — fewer levels, more rhythm.
export const typography = {
  display: {
    fontFamily: fontFamilies.serifBold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.4,
  } as TextStyle,
  heading: {
    fontFamily: fontFamilies.serifBold,
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: -0.2,
  } as TextStyle,
  subheading: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 17,
    lineHeight: 24,
  } as TextStyle,
  // Content
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" } as TextStyle,
  bodyEmphasis: { fontSize: 15, lineHeight: 22, fontWeight: "600" } as TextStyle,
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" } as TextStyle,
  // Labels — used for SectionLabel small-caps style
  micro: { fontSize: 11, lineHeight: 14, fontWeight: "600", letterSpacing: 1.2 } as TextStyle,
  // Buttons
  button: { fontSize: 16, lineHeight: 22, fontWeight: "600" } as TextStyle,
  // Legacy alias — old code referenced typography.title
  title: {
    fontFamily: fontFamilies.serifBold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.3,
  } as TextStyle,
} as const;
