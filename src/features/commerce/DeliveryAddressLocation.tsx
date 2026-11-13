import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import * as Location from "expo-location";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
export type AddressPoint = { latitude: number; longitude: number };

export function DeliveryAddressLocation({
  onChange,
  onAddress,
}: {
  onChange: (point: AddressPoint | null) => void;
  onAddress: (address: string) => void;
}) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [point, setPoint] = useState<AddressPoint | null>(null);
  const active = useRef(true),
    generation = useRef(0);
  const callbacks = useRef({ onChange, onAddress });
  callbacks.current = { onChange, onAddress };
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      generation.current++;
    };
  }, []);
  async function locate() {
    if (busy) return;
    const version = ++generation.current;
    setBusy(true);
    setError("");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!(await Location.hasServicesEnabledAsync()))
        throw Error("Turn on Location Services, or enter your address below.");
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        throw Error(
          "Location access was not allowed. You can still type your delivery address.",
        );
      const result = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                Error(
                  "Your location is taking too long. Try again outdoors or enter your address.",
                ),
              ),
            15000,
          );
        }),
      ]);
      if (!active.current || version !== generation.current) return;
      if (result.coords.accuracy !== null && result.coords.accuracy > 500)
        throw Error(
          "Your location is not accurate enough yet. Try again or enter your address.",
        );
      const next = {
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
      };
      setPoint(next);
      callbacks.current.onChange(next);
      try {
        const addresses = await Location.reverseGeocodeAsync(next);
        if (!active.current || version !== generation.current) return;
        const address = addresses[0];
        if (address)
          callbacks.current.onAddress(
            [
              ...new Set(
                [
                  address.name,
                  address.street,
                  address.district,
                  address.city,
                ].filter(Boolean),
              ),
            ].join(", "),
          );
      } catch {
        /* The coordinate remains usable; the customer can enter their address. */
      }
    } catch (e) {
      if (active.current && version === generation.current)
        setError(
          e instanceof Error ? e.message : "Location could not be found.",
        );
    } finally {
      if (timer) clearTimeout(timer);
      if (active.current && version === generation.current) setBusy(false);
    }
  }
  return (
    <View style={{ gap: 10 }}>
      <Button
        label={
          point ? "Update my delivery location" : "Use my current location"
        }
        variant="outline"
        loading={busy}
        onPress={() => void locate()}
      />
      {point ? (
        <>
          <Text style={{ color: colors.success, fontSize: 12, lineHeight: 19 }}>
            Delivery pin captured. Check the building, apartment and entrance
            below.
          </Text>
          <Button
            label="Remove location pin"
            size="sm"
            variant="ghost"
            onPress={() => {
              generation.current++;
              setPoint(null);
              callbacks.current.onChange(null);
            }}
          />
        </>
      ) : null}
      {error ? <Notice error message={error} /> : null}
    </View>
  );
}
