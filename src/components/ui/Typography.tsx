import { forwardRef } from "react";
import { Text as NativeText, type TextProps } from "react-native";

/** Use the native system sans serif on each platform. The supplied logo keeps
 * its own lettering; shopping copy stays clear and consistent at large text. */
export const brandFontFamily = undefined;

export const Text = forwardRef<NativeText, TextProps>(function Text(
  { style, ...props },
  ref,
) {
  return <NativeText {...props} ref={ref} style={style} />;
});
