import { useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import { useAcknowledgeOrder } from "./useHomeOrders";
import type { AppOrder } from "./app-orders";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string(),
  simulated: z.boolean(),
  created_at: z.string(),
});

export function DeliveryComplete({ order }: { order: AppOrder }) {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const acknowledgement = useAcknowledgeOrder();
  const [received, setReceived] = useState(false);
  const hasReceived = !!order.received_at || received;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const completed =
    order.status === "completed" &&
    order.payment_state === "completed" &&
    !!order.paid_at;
  const review = useQuery({
    queryKey: ["order-review", customer?.id, order.reference],
    enabled: completed && hasReceived && !!customer,
    queryFn: async () =>
      reviewSchema
        .nullable()
        .parse(
          await api.get(
            `/v1/app-orders/${encodeURIComponent(order.reference)}/review`,
            { auth: true },
          ),
        ),
  });
  if (!completed) return null;
  const delivered = order.snapshot?.checkout.fulfilment === "delivery";
  const completion = order.events?.find(
    (event) => event.kind === "fulfilment_completed",
  );
  return (
    <View style={{ gap: 16 }}>
      <LinearGradient
        colors={["#FFF0F8", "#FFF9F1"]}
        style={{ padding: 24, borderRadius: 26, gap: 12, alignItems: "center" }}
      >
        <Ionicons name="checkmark-circle" size={48} color="#26744D" />
        <Text
          accessibilityRole="header"
          style={{
            color: "#391426",
            fontWeight: "800",
            fontSize: 25,
            textAlign: "center",
          }}
        >
          {order.payment_test && !order.review_checkout
            ? "Test journey complete!"
            : delivered
              ? "Your cake has arrived! 🎂"
              : "Your cake has been collected! 🎂"}
        </Text>
        <Text style={{ color: "#6E5262", textAlign: "center", lineHeight: 22 }}>
          {order.payment_test && !order.review_checkout
            ? "Simulation complete. No real cake, delivery or charge was made."
            : "Thank you for choosing Cake City. Enjoy every slice of your celebration."}
        </Text>
        {completion ? (
          <Text style={{ color: "#6E5262", fontSize: 12 }}>
            {delivered ? "Delivered" : "Collected"}{" "}
            {new Date(completion.created_at).toLocaleString()}
          </Text>
        ) : null}
        <Button
          variant="outline"
          label="Find your next cake"
          onPress={() => router.push("/(tabs)/shop")}
        />
      </LinearGradient>
      {!hasReceived ? (
        <View
          style={{
            padding: 22,
            borderRadius: 24,
            gap: 14,
            backgroundColor: colors.successLight,
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.ink }}>
            Everything arrived safely?
          </Text>
          <Text style={{ color: colors.muted, lineHeight: 22 }}>
            Please confirm once your cake is in your hands. You can share how
            your celebration went afterwards.
          </Text>
          <Button
            label={
              delivered ? "I've received my cake" : "I've collected my cake"
            }
            loading={acknowledgement.isPending}
            disabled={acknowledgement.isPending}
            onPress={() =>
              acknowledgement.mutate(order.reference, {
                onSuccess: () => setReceived(true),
              })
            }
          />
          {acknowledgement.isError ? (
            <Notice error message={acknowledgement.error.message} />
          ) : null}
          <Button
            label="Something isn't right"
            variant="outline"
            onPress={() =>
              router.push({
                pathname: "/requests",
                params: { kind: "support", reference: order.reference },
              })
            }
          />
        </View>
      ) : (
        <View
          style={{
            padding: 20,
            borderRadius: 22,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 12,
          }}
        >
          <Text style={{ color: colors.ink, fontSize: 19, fontWeight: "800" }}>
            {review.data || submitted
              ? "Thank you for your feedback"
              : "How was your experience?"}
          </Text>
          {review.data || submitted ? (
            <Text style={{ color: colors.muted }}>
              Your {review.data?.rating ?? rating}-star rating has been saved.
              {order.payment_test && !order.review_checkout
                ? " This is test feedback."
                : " Your feedback helps our team improve."}
            </Text>
          ) : review.isPending ? (
            <Text style={{ color: colors.muted }}>Loading your feedback…</Text>
          ) : review.isError ? (
            <>
              <Notice error message="Your review could not be loaded." />
              <Button
                variant="outline"
                label="Retry feedback"
                onPress={() => void review.refetch()}
              />
            </>
          ) : (
            <>
              <Text style={{ color: colors.muted }}>
                Rate your order from 1 to 5 stars. Your comments go privately to
                the Cake City team.
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Button
                    key={star}
                    label={`${star} ★`}
                    accessibilityLabel={`Rate ${star} ${star === 1 ? "star" : "stars"}`}
                    accessibilityState={{ selected: rating === star }}
                    variant={rating === star ? "primary" : "outline"}
                    size="sm"
                    disabled={busy}
                    onPress={() => setRating(star)}
                  />
                ))}
              </View>
              <Input
                label="Tell us more (optional)"
                multiline
                maxLength={1000}
                value={comment}
                editable={!busy}
                onChangeText={setComment}
              />
              {error ? <Notice error message={error} /> : null}
              <Button
                label="Send feedback"
                disabled={busy || !rating}
                loading={busy}
                onPress={() => {
                  if (busy || !rating) return;
                  setBusy(true);
                  setError("");
                  void api
                    .post(
                      `/v1/app-orders/${encodeURIComponent(order.reference)}/review`,
                      { rating, comment },
                      { auth: true },
                    )
                    .then((result) => {
                      reviewSchema.parse(result);
                      setSubmitted(true);
                      return review.refetch();
                    })
                    .catch((e) =>
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Feedback could not be saved. Please try again.",
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}
