import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { clubApi } from "@/features/account/club-api";
import { Text } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { CelebrationArtwork } from "@/components/ui/CelebrationArtwork";
import { nextCelebration } from "./planning";

export function CelebrationDashboard() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const query = useQuery({
    queryKey: ["celebrations", customer?.id],
    queryFn: ({ signal }) => clubApi.celebrations(signal),
    enabled: !!customer,
    staleTime: 60_000,
    retry: false,
  });
  const upcoming = (query.data ?? [])
    .filter((item) => item.day <= new Date(2000, item.month, 0).getDate())
    .map((item) => ({ ...item, date: nextCelebration(item.month, item.day) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 3);
  return (
    <View
      style={{
        marginHorizontal: 16,
        padding: 18,
        gap: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: 26,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}>
            Make their day
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
            A little planning. A lot of happiness.
          </Text>
        </View>
        <CelebrationArtwork size={76} />
      </View>
      {upcoming.map((item) => (
        <View
          key={item.id}
          style={{
            paddingVertical: 10,
            gap: 5,
            borderTopWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.ink, fontWeight: "700" }}>
            {item.name} ·{" "}
            {item.date.toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
            })}
          </Text>
          <Button
            size="sm"
            variant="outline"
            label={`Plan ${item.occasion === "other" ? "a celebration" : item.occasion} cake`}
            onPress={() =>
              router.push({
                pathname: "/celebration-builder",
                params: {
                  occasion: item.occasion,
                  date: item.date.toISOString(),
                  name: item.name,
                },
              })
            }
          />
        </View>
      ))}
      <Button
        label="Find my celebration cake"
        onPress={() => router.push("/celebration-builder")}
      />
      {customer ? (
        <Button
          label="My celebration calendar"
          variant="ghost"
          onPress={() => router.push("/moments")}
        />
      ) : null}
    </View>
  );
}
