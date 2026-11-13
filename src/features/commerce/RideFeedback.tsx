import { useState } from "react";
import { View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import {
  deliveryFeedbackSchema,
  deliveryQualityNotes,
  type DeliveryFeedback,
} from "@/features/logistics/delivery-feedback";

export function RideFeedback({
  reference,
  id,
  index,
  feedback,
}: {
  reference: string;
  id: string;
  index: number;
  feedback?: DeliveryFeedback | null;
}) {
  const { colors } = useTheme();
  const cache = useQueryClient();
  const [rating, setRating] = useState(0);
  const [timing, setTiming] = useState<DeliveryFeedback["timing"] | null>(null);
  const [condition, setCondition] = useState<
    DeliveryFeedback["condition"] | null
  >(null);
  const [comment, setComment] = useState("");
  const save = useMutation({
    mutationFn: async () =>
      deliveryFeedbackSchema.parse(
        await api.post(
          `/v1/app-orders/${encodeURIComponent(reference)}/deliveries/${encodeURIComponent(id)}/feedback`,
          { rating, timing, condition, comment },
          { auth: true },
        ),
      ),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["app-order"] });
    },
  });
  const saved = save.data ?? feedback;
  return (
    <View
      style={{
        padding: 20,
        borderRadius: 24,
        gap: 14,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: saved ? colors.success : colors.border,
      }}
    >
      <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 18 }}>
        How was delivery {index + 1}?
      </Text>
      {saved ? (
        <>
          <Text style={{ color: colors.success, fontWeight: "800" }}>
            {saved.rating} / 5 stars · Thank you
          </Text>
          {deliveryQualityNotes(saved).map((note) => (
            <Text
              key={note.label}
              style={{
                color:
                  note.tone === "good"
                    ? colors.success
                    : note.tone === "issue"
                      ? colors.error
                      : colors.warning,
              }}
            >
              {note.label}
            </Text>
          ))}
        </>
      ) : (
        <>
          <Text style={{ color: colors.muted, lineHeight: 21 }}>
            Rate this ride separately from your cake. Your feedback goes
            privately to our delivery team.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Button
                key={value}
                label={`${value} ★`}
                accessibilityLabel={`Delivery rating ${value} stars`}
                accessibilityState={{ selected: rating === value }}
                variant={rating === value ? "primary" : "outline"}
                size="sm"
                disabled={save.isPending}
                onPress={() => setRating(value)}
              />
            ))}
          </View>
          <Text style={{ color: colors.ink, fontWeight: "700" }}>
            Did it arrive on time?
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(
              [
                { value: "on_time", label: "On time" },
                { value: "late", label: "Late" },
                { value: "not_sure", label: "Not sure" },
              ] as const
            ).map((option) => (
              <Button
                key={option.value}
                label={option.label}
                size="sm"
                variant={timing === option.value ? "primary" : "outline"}
                disabled={save.isPending}
                onPress={() => setTiming(option.value)}
              />
            ))}
          </View>
          <Text style={{ color: colors.ink, fontWeight: "700" }}>
            How was the condition?
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(
              [
                { value: "good", label: "All good" },
                { value: "damaged", label: "Damaged" },
                { value: "other_issue", label: "Other issue" },
              ] as const
            ).map((option) => (
              <Button
                key={option.value}
                label={option.label}
                size="sm"
                variant={condition === option.value ? "primary" : "outline"}
                disabled={save.isPending}
                onPress={() => setCondition(option.value)}
              />
            ))}
          </View>
          <Input
            label="Anything else? (optional)"
            multiline
            maxLength={1000}
            value={comment}
            onChangeText={setComment}
            editable={!save.isPending}
          />
          <Button
            label="Save delivery feedback"
            loading={save.isPending}
            disabled={!rating || !timing || !condition || save.isPending}
            onPress={() => save.mutate()}
          />
          {save.isError ? (
            <Notice
              error
              message={
                save.error instanceof Error
                  ? save.error.message
                  : "Could not save delivery feedback."
              }
            />
          ) : null}
        </>
      )}
    </View>
  );
}
