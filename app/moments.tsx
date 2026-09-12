import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import {
  Screen,
  AccountRequired,
  Feedback,
  Chip,
  Section,
  ui,
  useToast,
} from "@/components/ui/Commerce";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { customerApi } from "@/features/commerce/api";
export default function Moments() {
  return (
    <Screen title="Their day, remembered." back>
      <AccountRequired>
        <MomentsContent />
      </AccountRequired>
    </Screen>
  );
}
function MomentsContent() {
  const { customer } = useAuth();
  const q = useQuery({
    queryKey: ["moments", customer?.id],
    queryFn: customerApi.moments,
  });
  const toast = useToast();
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [occasion, setOccasion] = useState("birthday");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const parsed = new Date(date + "T12:00:00Z");
      if (
        !name.trim() ||
        !relationship.trim() ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date
      )
        throw new Error(
          "Enter a name, relationship and a valid date (YYYY-MM-DD).",
        );
      await customerApi.saveMoment({
        name: name.trim(),
        relationship: relationship.trim(),
        occasion,
        event_date: date,
        reminder_days: [7, 1],
      });
      setName("");
      setDate("");
      await q.refetch();
      toast("Celebration saved.");
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Could not save this celebration.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Text style={ui.body}>
        The people you love. The dates that matter. Save a birthday or
        anniversary, with reminders a week and a day before.
      </Text>
      <Feedback
        loading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
      />
      {q.data?.map((m) => (
        <View key={m.id} style={ui.panel}>
          <Text style={ui.heading}>{m.name}</Text>
          <Text style={ui.body}>
            {m.occasion} · {m.event_date}
          </Text>
          <Button
            variant="ghost"
            label="Remove reminder"
            disabled={busy}
            onPress={async () => {
              try {
                await customerApi.deleteMoment(m.id);
                await q.refetch();
              } catch (e) {
                toast(
                  e instanceof Error ? e.message : "Unable to remove reminder.",
                );
              }
            }}
          />
        </View>
      ))}
      <Section title="Add a special day" />
      <Input
        label="Who are we celebrating?"
        value={name}
        onChangeText={setName}
        maxLength={160}
      />
      <Input
        label="Relationship"
        value={relationship}
        onChangeText={setRelationship}
        hint="Use ‘self’ for your own birthday."
        maxLength={80}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {["birthday", "anniversary", "wedding", "graduation", "other"].map(
          (o) => (
            <Chip
              key={o}
              label={o}
              selected={occasion === o}
              onPress={() => setOccasion(o)}
            />
          ),
        )}
      </View>
      <Input
        label="Date"
        placeholder="YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
        maxLength={10}
        keyboardType="numbers-and-punctuation"
      />
      <Button
        label="Save celebration"
        loading={busy}
        onPress={() => void save()}
      />
    </>
  );
}
