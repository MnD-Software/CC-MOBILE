import { useEffect, useState } from "react";
import { Platform } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { useTheme } from "@/theme/ThemeProvider";
import { studioDate } from "@/features/editorial/studio";
import type { CampaignDateProps } from "./CampaignDateField";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";

export function CampaignDateField({
  label,
  value,
  onChange,
}: CampaignDateProps) {
  const { colors, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(new Date(value));
  useEffect(
    () => () => {
      if (Platform.OS === "android") {
        void DateTimePickerAndroid.dismiss("date").catch(() => undefined);
        void DateTimePickerAndroid.dismiss("time").catch(() => undefined);
      }
    },
    [],
  );
  function choose() {
    const initial = new Date(value);
    const safe = Number.isFinite(initial.getTime()) ? initial : new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: safe,
        mode: "date",
        timeZoneName: "Africa/Nairobi",
        onValueChange: (_event, date) =>
          DateTimePickerAndroid.open({
            value: date,
            mode: "time",
            timeZoneName: "Africa/Nairobi",
            onValueChange: (_timeEvent, next) => onChange(next.toISOString()),
          }),
      });
    } else {
      setDraft(safe);
      setOpen(true);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        label={`${label}: ${studioDate(value)}`}
        onPress={choose}
      />
      {open ? (
        <BottomSheet
          visible
          title={label}
          onClose={() => setOpen(false)}
          footer={
            <Button
              label="Use this time"
              onPress={() => {
                onChange(draft.toISOString());
                setOpen(false);
              }}
            />
          }
        >
          <DateTimePicker
            value={draft}
            mode="datetime"
            display="spinner"
            timeZoneName="Africa/Nairobi"
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
