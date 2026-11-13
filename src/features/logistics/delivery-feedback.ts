import { z } from "zod";
export const deliveryFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  timing: z.enum(["on_time", "late", "not_sure"]),
  condition: z.enum(["good", "damaged", "other_issue"]),
  comment: z.string(),
});
export type DeliveryFeedback = z.infer<typeof deliveryFeedbackSchema>;
export function deliveryQualityNotes(
  value: DeliveryFeedback | null | undefined,
) {
  if (!value)
    return [{ label: "Awaiting customer feedback", tone: "neutral" as const }];
  return [
    {
      label:
        value.timing === "on_time"
          ? "Arrived on time"
          : value.timing === "late"
            ? "Arrived late"
            : "Arrival time not confirmed",
      tone:
        value.timing === "on_time"
          ? "good"
          : value.timing === "late"
            ? "warning"
            : "neutral",
    },
    {
      label:
        value.condition === "good"
          ? "Received in good condition"
          : value.condition === "damaged"
            ? "Damage reported"
            : "Condition issue reported",
      tone: value.condition === "good" ? "good" : "issue",
    },
  ];
}
