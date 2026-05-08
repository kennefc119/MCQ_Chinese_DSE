import { TextStyle } from "react-native";

export const typography = {
  title: { fontSize: 28, fontWeight: "700" } as TextStyle,
  heading: { fontSize: 22, fontWeight: "700" } as TextStyle,
  body: { fontSize: 17, fontWeight: "400" } as TextStyle,
  caption: { fontSize: 13, fontWeight: "400" } as TextStyle,
  button: { fontSize: 17, fontWeight: "600" } as TextStyle,
} as const;
