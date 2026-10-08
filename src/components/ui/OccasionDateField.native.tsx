import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import type { OccasionDateFieldProps } from "./OccasionDateField";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { Text } from "./Typography";

export function OccasionDateField({
  label,
  value,
  onChange,
}: OccasionDateFieldProps) {
  const { colors, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? new Date());
  useEffect(
    () => () => {
      if (Platform.OS === "android")
        void DateTimePickerAndroid.dismiss("date").catch(() => undefined);
    },
    [],
  );
  function chooseDate() {
    const initial = value ?? new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        mode: "date",
        value: initial,
        onValueChange: (_event, date) => onChange(date),
      });
    } else {
      setDraft(initial);
      setOpen(true);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        label={`${label}: ${value ? value.toLocaleDateString(undefined, { month: "long", day: "numeric" }) : "Choose date"}`}
        onPress={chooseDate}
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
          <DateTimePicker
            value={draft}
            mode="date"
            display="spinner"
            themeVariant={isDark ? "dark" : "light"}
            textColor={colors.ink}
            accentColor={colors.brandStrong}
            onValueChange={(_event, date) => setDraft(date)}
            style={{ width: "100%", height: 216 }}
          />
        </BottomSheet>
      ) : null}
    </>
  );
}
