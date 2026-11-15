import { View, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/components/ui/Typography";
import { Disclosure } from "@/components/ui/Disclosure";
import { Feedback } from "@/components/ui/Commerce";

export type Slot = {
  full: boolean;
  booking_closed: boolean;
  id: string;
  label: string;
  starts_at: string;
  ends_at: string;
  cutoff_at: string;
  fulfilment: "pickup" | "delivery";
  remaining: number;
  capacity: number;
  revision: number;
  enabled: boolean;
};
export function FulfilmentSlots({
  fulfilment,
  value,
  onChange,
}: {
  fulfilment: "pickup" | "delivery";
  value: string;
  onChange: (id: string) => void;
}) {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const query = useQuery({
    queryKey: ["fulfilment-slots", customer?.id, fulfilment],
    queryFn: () =>
      api.get<Slot[]>(`/v1/experience/slots?fulfilment=${fulfilment}`, {
        auth: true,
      }),
    enabled: !!customer,
    staleTime: 15000,
    refetchInterval: 30000,
  });
  if (query.isPending) return <Feedback loading />;
  if (query.isError)
    return (
      <Feedback error={query.error} onRetry={() => void query.refetch()} />
    );
  if (!query.data?.length && !value) return null;
  const selected = query.data?.find((s) => s.id === value);
  return (
    <Disclosure
      title={
        selected
          ? `${selected.label} · ${new Date(selected.starts_at).toLocaleDateString()}`
          : "Choose your pickup or delivery time"
      }
    >
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
          Available kitchen and dispatch capacity. Your place is reserved when
          your order is created.
        </Text>
        {value && !selected ? (
          <Text style={{ color: colors.error }}>
            This window is no longer available. Clear it or choose another.
          </Text>
        ) : null}
        {!query.data?.length ? (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: !value }}
            onPress={() => onChange("")}
            style={{
              padding: 14,
              borderRadius: 16,
              backgroundColor: !value
                ? colors.brandLight
                : colors.surfaceRaised,
            }}
          >
            <Text style={{ color: colors.ink }}>No preferred window</Text>
          </Pressable>
        ) : null}
        {query.data?.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="radio"
            disabled={s.full || s.booking_closed}
            accessibilityState={{
              checked: value === s.id,
              disabled: s.full || s.booking_closed,
            }}
            onPress={() => onChange(s.id)}
            style={{
              padding: 16,
              gap: 6,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: value === s.id ? colors.brandStrong : colors.border,
              backgroundColor:
                value === s.id ? colors.brandLight : colors.surface,
            }}
          >
            <Text style={{ color: colors.ink, fontWeight: "800" }}>
              {s.label}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {new Date(s.starts_at).toLocaleDateString()} ·{" "}
              {new Date(s.starts_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              –
              {new Date(s.ends_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            <Text
              style={{
                color:
                  s.full || s.booking_closed ? colors.error : colors.success,
                fontSize: 12,
                fontWeight: "800",
              }}
            >
              {s.full
                ? "Full - choose another window"
                : s.booking_closed
                  ? "Booking closed"
                  : `${s.remaining} places available`}
            </Text>
          </Pressable>
        ))}
      </View>
    </Disclosure>
  );
}
