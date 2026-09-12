import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router } from "expo-router";
import { Linking, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import {
  Screen,
  Feedback,
  Notice,
  ui,
  useToast,
} from "@/components/ui/Commerce";
import { shopApi } from "@/features/commerce/api";
import { usePreferences } from "@/features/commerce/store";
import { distanceKm } from "@/features/commerce/contracts";
import { tokens } from "@/theme/tokens";
export default function Branches() {
  const q = useQuery({
    queryKey: ["mobile-config"],
    queryFn: ({ signal }) => shopApi.config(signal),
  });
  const select = usePreferences((s) => s.setBranch);
  const selected = usePreferences((s) => s.branch);
  const [point, setPoint] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function locate() {
    setBusy(true);
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== "granted")
        throw new Error(
          "You can still choose a branch below without location access.",
        );
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setPoint(position.coords);
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Your location could not be found.",
      );
    } finally {
      setBusy(false);
    }
  }
  const branches = [...(q.data?.branches ?? [])].sort((a, b) =>
    point ? distanceKm(point, a) - distanceKm(point, b) : 0,
  );
  return (
    <Screen title="Find your Cake City." back>
      <Text style={ui.body}>
        Fresh celebrations, closer to you. Choose a branch for collection and
        delivery availability.
      </Text>
      <Button
        variant="outline"
        label="Find branches near me"
        loading={busy}
        onPress={() => void locate()}
      />
      <Feedback
        loading={q.isPending}
        error={q.error}
        empty={
          q.data && !branches.length
            ? "Branch information is unavailable right now."
            : undefined
        }
        onRetry={() => void q.refetch()}
      />
      {branches.map((b, i) => (
        <View key={b.id} style={ui.panel}>
          <View style={ui.row}>
            <Ionicons
              name="storefront-outline"
              size={25}
              color={tokens.color.brandStrong}
            />
            <Text style={[ui.heading, { flex: 1 }]}>{b.name}</Text>
            {point && i === 0 ? <Text style={ui.eyebrow}>NEAREST</Text> : null}
          </View>
          <Text style={ui.body}>{b.address}</Text>
          <Text style={ui.body}>
            {[
              b.pickup_available ? "Pickup available" : null,
              b.delivery_available ? "Delivery available" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          <Button
            label={selected?.id === b.id ? "Selected ✓" : "Choose this branch"}
            disabled={!b.pickup_available && !b.delivery_available}
            onPress={() => {
              select(b);
              if (router.canGoBack()) router.back();
              else router.replace("/home");
            }}
          />
          <View style={ui.row}>
            <Button
              variant="ghost"
              label="Call branch"
              onPress={() =>
                void Linking.openURL(
                  "tel:" + b.phone.replace(/[^+\d]/g, ""),
                ).catch(() => toast("Unable to open the dialler."))
              }
            />
            <Button
              variant="ghost"
              label="Directions"
              onPress={() =>
                void Linking.openURL(
                  "https://www.google.com/maps/search/?api=1&query=" +
                    b.latitude +
                    "," +
                    b.longitude,
                ).catch(() => toast("Unable to open maps."))
              }
            />
          </View>
        </View>
      ))}
      {q.isError ? (
        <Notice message="Branch selection needs current Cake City branch information. Please try again later." />
      ) : null}
    </Screen>
  );
}
