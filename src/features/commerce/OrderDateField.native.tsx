import { useState } from "react";
import { Platform, View } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { OrderDateProps } from "./OrderDateField";
const calendarDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function OrderDateField({ label, value, onChange }: OrderDateProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(new Date());
  const selected = value ? new Date(value + "T12:00:00") : new Date();
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Button
        variant="outline"
        label={`${label}: ${value || "Any date"}`}
        style={{ paddingHorizontal: 8 }}
        onPress={() => {
          if (Platform.OS === "android")
            DateTimePickerAndroid.open({
              value: selected,
              mode: "date",
              onChange: (event, date) => {
                if (event.type === "set" && date) onChange(calendarDate(date));
              },
            });
          else {
            setDraft(selected);
            setOpen(true);
          }
        }}
      />
      {open ? (
        <BottomSheet
          visible
          title={label}
          onClose={() => setOpen(false)}
          footer={
            <Button
              label="Use date"
              onPress={() => {
                onChange(calendarDate(draft));
                setOpen(false);
              }}
            />
          }
        >
          <DateTimePicker
            value={draft}
            mode="date"
            display="inline"
            onChange={(_, date) => {
              if (date) setDraft(date);
            }}
          />
        </BottomSheet>
      ) : null}
    </View>
  );
}
