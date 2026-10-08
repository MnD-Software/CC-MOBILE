import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/Typography";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { Notice } from "@/components/ui/Commerce";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { customerApi } from "./api";
import {
  locationAddressSuggestion,
  type LocationAddressSuggestion,
} from "./location-assistance";

type Props = LocationAddressSuggestion & {
  recipientName: string;
  recipientPhone: string;
  isGift: boolean;
  canAutofill: boolean;
  profileReady: boolean;
  allowSaving?: boolean;
  onChange: (value: LocationAddressSuggestion) => void;
  onRecipientChange: (name: string, phone: string) => void;
};

export function DeliveryLocationPicker(props: Props) {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<LocationAddressSuggestion[]>([]);
  const [label, setLabel] = useState("Home");
  const [saving, setSaving] = useState(false);
  const latest = useRef(props);
  latest.current = props;
  const alive = useRef(true);
  const attempted = useRef(false);
  const request = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current++;
    };
  }, []);
  const saved = useQuery({
    queryKey: ["addresses", customer?.id],
    queryFn: customerApi.addresses,
    enabled: !!customer,
    retry: false,
    staleTime: 60_000,
  });
  const signature = (value: Props) =>
    JSON.stringify([value.address, value.area, value.city, value.isGift]);

  async function permission(automatic = false) {
    let value = await Location.getForegroundPermissionsAsync();
    if (
      value.status !== "granted" &&
      value.canAskAgain &&
      (!automatic || value.status === "undetermined")
    )
      value = await Location.requestForegroundPermissionsAsync();
    if (value.status !== "granted")
      throw new Error(
        "Allow location access to fill your address automatically, or choose a saved address.",
      );
    if (!(await Location.hasServicesEnabledAsync()))
      throw new Error("Turn on location services, or choose a saved address.");
  }

  async function locate(automatic = false) {
    const identity = ++request.current;
    const initial = signature(latest.current);
    setBusy(true);
    setNotice("Finding your delivery location...");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await permission(automatic);
      const cached = await Location.getLastKnownPositionAsync({
        maxAge: 60_000,
        requiredAccuracy: 100,
      });
      const position =
        cached ??
        (await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(
                    "Location is taking longer than expected. Try again or search for your destination.",
                  ),
                ),
              15_000,
            );
          }),
        ]));
      const [place] = await Location.reverseGeocodeAsync(position.coords);
      const suggestion = locationAddressSuggestion(place);
      if (!suggestion?.address)
        throw new Error(
          "Your location was found, but no street address was available. Search for your destination or enter the building below.",
        );
      if (!alive.current || request.current !== identity) return;
      if (signature(latest.current) !== initial) {
        setNotice("Your edited delivery address has been kept.");
        return;
      }
      props.onChange(suggestion);
      setNotice(
        "Location filled in. Check the building or apartment before placing your order.",
      );
    } catch (error) {
      if (alive.current && request.current === identity)
        setNotice(
          error instanceof Error
            ? error.message
            : "Location could not be read. Search or enter your destination below.",
        );
    } finally {
      if (timer) clearTimeout(timer);
      if (alive.current && request.current === identity) setBusy(false);
    }
  }

  useEffect(() => {
    if (
      attempted.current ||
      !props.profileReady ||
      (customer && saved.isPending) ||
      !props.canAutofill ||
      props.isGift
    )
      return;
    attempted.current = true;
    const preferred = saved.data?.find((value) => value.is_default);
    if (preferred) {
      props.onChange({
        address: [preferred.line1, preferred.line2].filter(Boolean).join(", "),
        area: preferred.area,
        city: preferred.city,
      });
      setNotice(`${preferred.label} selected from your saved addresses.`);
    } else if (!props.address && !props.area) void locate(true);
  }, [
    props.profileReady,
    props.canAutofill,
    props.isGift,
    props.address,
    props.area,
    customer?.id,
    saved.isPending,
    saved.data,
  ]);

  async function searchLocations() {
    const identity = ++request.current;
    setBusy(true);
    setResults([]);
    setNotice("");
    try {
      await permission();
      const matches = await Location.geocodeAsync(`${search.trim()}, Kenya`);
      const suggestions: LocationAddressSuggestion[] = [];
      for (const point of matches.slice(0, 3)) {
        const [place] = await Location.reverseGeocodeAsync(point);
        const value = locationAddressSuggestion(place);
        if (
          value?.address &&
          !suggestions.some((item) => item.address === value.address)
        )
          suggestions.push(value);
      }
      if (!alive.current || request.current !== identity) return;
      setResults(suggestions);
      if (!suggestions.length)
        setNotice(
          "No matching destination found. Try a nearby street or landmark, or enter the address below.",
        );
    } catch {
      if (alive.current && request.current === identity)
        setNotice(
          "Location search is unavailable. You can still enter the destination below.",
        );
    } finally {
      if (alive.current && request.current === identity) setBusy(false);
    }
  }

  async function save() {
    if (!customer) return;
    setSaving(true);
    try {
      await customerApi.saveAddress({
        label: label.trim(),
        recipient_name: props.recipientName.trim(),
        phone: props.recipientPhone.trim(),
        line1: props.address,
        line2: "",
        area: props.area,
        city: props.city,
        delivery_notes: "",
        is_default: !props.isGift && !saved.data?.length,
      });
      if (!alive.current) return;
      await cache.invalidateQueries({ queryKey: ["addresses", customer.id] });
      if (!alive.current) return;
      setNotice("Address saved to your account for next time.");
    } catch (error) {
      if (alive.current)
        setNotice(
          error instanceof Error
            ? error.message
            : "Address could not be saved.",
        );
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void locate()}
        style={{
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Ionicons name="locate-outline" size={18} color={colors.brandStrong} />
        <Text style={{ color: colors.brandStrong, fontSize: 13 }}>
          {busy
            ? "Finding your location..."
            : props.isGift
              ? "Deliver to my current location"
              : "Refresh my current location"}
        </Text>
      </Pressable>
      {notice ? <Notice message={notice} /> : null}
      <Disclosure title="Choose another destination">
        {saved.isError ? (
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Saved addresses are unavailable. Search for a location or enter it
            below.
          </Text>
        ) : null}
        {saved.data?.map((value) => (
          <Pressable
            key={value.id}
            accessibilityRole="button"
            onPress={() => {
              request.current++;
              setBusy(false);
              props.onChange({
                address: [value.line1, value.line2].filter(Boolean).join(", "),
                area: value.area,
                city: value.city,
              });
              if (props.isGift)
                props.onRecipientChange(value.recipient_name, value.phone);
              setResults([]);
              setNotice(`${value.label} selected.`);
            }}
            style={{
              minHeight: 54,
              padding: 12,
              borderRadius: 16,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 3,
            }}
          >
            <Text
              style={{ color: colors.ink, fontSize: 13, fontWeight: "700" }}
            >
              {value.label}
              {value.is_default ? " / Default" : ""}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>
              {value.line1}, {value.area}
            </Text>
          </Pressable>
        ))}
        <Input
          label="Search for a street, building or landmark"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => {
            if (search.trim().length >= 3 && !busy) void searchLocations();
          }}
          returnKeyType="search"
        />
        <Button
          variant="outline"
          label="Find destination"
          loading={busy}
          disabled={search.trim().length < 3}
          onPress={() => void searchLocations()}
        />
        {results.map((value, index) => (
          <Pressable
            key={index}
            accessibilityRole="button"
            onPress={() => {
              props.onChange(value);
              setResults([]);
              setNotice(
                "Destination selected. Check the building or apartment below.",
              );
            }}
            style={{
              padding: 12,
              minHeight: 44,
              borderRadius: 16,
              backgroundColor: colors.brandLight,
            }}
          >
            <Text style={{ color: colors.ink, fontSize: 12 }}>
              {[value.address, value.area, value.city]
                .filter(Boolean)
                .join(", ")}
            </Text>
          </Pressable>
        ))}
      </Disclosure>
      {customer && props.allowSaving !== false ? (
        <Disclosure title="Save this address for next time">
          <Input
            label="Address name"
            placeholder={
              props.isGift ? "Family, friend or office" : "Home or office"
            }
            value={label}
            onChangeText={setLabel}
            maxLength={80}
          />
          <Button
            variant="outline"
            label="Save address"
            loading={saving}
            disabled={
              !props.address.trim() ||
              !props.area.trim() ||
              !props.recipientName.trim() ||
              !props.recipientPhone.trim() ||
              !label.trim()
            }
            onPress={() => void save()}
          />
        </Disclosure>
      ) : null}
    </View>
  );
}
