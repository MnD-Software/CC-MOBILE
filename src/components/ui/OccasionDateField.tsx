import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { Text } from "./Typography";

export type OccasionDateFieldProps = {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
};

// Calendar fallback for web. Native platforms use the system date picker.
export function OccasionDateField({
  label,
  value,
  onChange,
}: OccasionDateFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? new Date());
  const month = draft.getMonth();
  return (
    <>
      <Button
        variant="outline"
        label={`${label}: ${value ? value.toLocaleDateString(undefined, { month: "long", day: "numeric" }) : "Choose date"}`}
        onPress={() => {
          setDraft(value ?? new Date());
          setOpen(true);
        }}
      />
      {open ? (
        <BottomSheet
          visible
          title={label}
          onClose={() => setOpen(false)}
          footer={
            <Button
              label="Use this date"
              onPress={() => {
                onChange(draft);
                setOpen(false);
              }}
            />
          }
        >
          <Text style={{ color: colors.muted }}>
            Choose the month and day. We'll remember it every year.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {Array.from({ length: 12 }, (_, index) => (
              <Pressable
                key={index}
                accessibilityRole="radio"
                accessibilityState={{ selected: month === index }}
                onPress={() =>
                  setDraft(
                    new Date(
                      2000,
                      index,
                      Math.min(
                        draft.getDate(),
                        new Date(2000, index + 1, 0).getDate(),
                      ),
                      12,
                    ),
                  )
                }
                style={{
                  width: "30%",
                  minHeight: 44,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    month === index ? colors.brandStrong : colors.brandLight,
                }}
              >
                <Text
                  style={{ color: month === index ? "#FFFFFF" : colors.ink }}
                >
                  {new Date(2000, index, 1).toLocaleDateString(undefined, {
                    month: "short",
                  })}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {Array.from(
              { length: new Date(2000, month + 1, 0).getDate() },
              (_, index) => index + 1,
            ).map((day) => (
              <Pressable
                key={day}
                accessibilityRole="radio"
                accessibilityLabel={`Day ${day}`}
                accessibilityState={{ selected: draft.getDate() === day }}
                onPress={() => setDraft(new Date(2000, month, day, 12))}
                style={{
                  width: "14.28%",
                  minHeight: 44,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    draft.getDate() === day
                      ? colors.brandStrong
                      : colors.surface,
                }}
              >
                <Text
                  style={{
                    color: draft.getDate() === day ? "#FFFFFF" : colors.ink,
                  }}
                >
                  {day}
                </Text>
              </Pressable>
            ))}
          </View>
        </BottomSheet>
      ) : null}
    </>
  );
}
