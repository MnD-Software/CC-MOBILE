import { createElement } from "react";
import { View } from "react-native";
import { Text } from "./Typography";
import { useTheme } from "@/theme/ThemeProvider";

export type CampaignDateProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};
export function CampaignDateField({
  label,
  value,
  onChange,
}: CampaignDateProps) {
  const { colors } = useTheme();
  const date = new Date(value);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.ink, fontWeight: "700" }}>{label}</Text>
      {createElement("input", {
        type: "datetime-local",
        "aria-label": label,
        value: Number.isFinite(date.getTime())
          ? new Date(date.getTime() + 3 * 3600000).toISOString().slice(0, 16)
          : "",
        onChange: (event: { target: { value: string } }) => {
          const next = new Date(event.target.value + ":00+03:00");
          if (Number.isFinite(next.getTime())) onChange(next.toISOString());
        },
        style: {
          width: "100%",
          boxSizing: "border-box",
          minHeight: 50,
          borderRadius: 16,
          border: `1px solid ${colors.border}`,
          background: colors.surface,
          color: colors.ink,
          padding: 12,
          fontSize: 16,
        },
      })}
    </View>
  );
}
