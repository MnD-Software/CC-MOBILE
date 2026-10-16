import { forwardRef } from "react";
import {
  Platform,
  StyleSheet,
  Text as NativeText,
  type TextProps,
} from "react-native";

/** iOS ships American Typewriter. Other platforms retain their native font
 * until licensed ITC font assets are supplied for embedding. */
export const brandFontFamily =
  Platform.OS === "ios" ? "AmericanTypewriter" : undefined;

export const Text = forwardRef<NativeText, TextProps>(function Text(
  { style, ...props },
  ref,
) {
  const flat = StyleSheet.flatten(style);
  const weight = flat?.fontWeight;
  const bold = weight === "bold" || Number(weight) >= 600;
  const family =
    Platform.OS === "ios"
      ? bold
        ? "AmericanTypewriter-Bold"
        : "AmericanTypewriter"
      : undefined;
  return (
    <NativeText
      {...props}
      ref={ref}
      style={[family ? { fontFamily: family } : undefined, style]}
    />
  );
});
