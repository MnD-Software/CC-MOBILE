import { createElement } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
export type OrderDateProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};
export function OrderDateField({ label, value, onChange }: OrderDateProps) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "700" }}>
        {label}
      </Text>
      {createElement("input", {
        type: "date",
        "aria-label": label,
        value,
        onChange: (event: { target: { value: string } }) =>
          onChange(event.target.value),
        style: {
          width: "100%",
          boxSizing: "border-box",
          minWidth: 0,
          minHeight: 48,
          borderRadius: 14,
          border: `1px solid ${colors.border}`,
          background: colors.surface,
          color: colors.ink,
          padding: 8,
          fontSize: 14,
        },
      })}
    </View>
  );
}
