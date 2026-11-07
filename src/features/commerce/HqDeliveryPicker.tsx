import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import * as Location from "expo-location";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Commerce";
import { Disclosure } from "@/components/ui/Disclosure";
import { Text } from "@/components/ui/Typography";
import {
  appDelivery,
  type DeliveryPoint,
  type DeliveryRouteQuote,
  type DistanceOptions,
} from "./app-delivery";
import { DeliveryMap } from "./DeliveryMap";
import { money } from "./contracts";

export function HqDeliveryPicker({
  options,
  fulfilment,
  onChange,
  onAddressSelect,
}: {
  options: DistanceOptions;
  fulfilment: "delivery" | "pickup";
  onChange: (quote: DeliveryRouteQuote | null) => void;
  onAddressSelect: (address: string) => void;
}) {
  const [point, setPoint] = useState<DeliveryPoint | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<
    (DeliveryPoint & { address: string })[]
  >([]);
  const [address, setAddress] = useState("");
  const [pickup, setPickup] = useState("hq");
  const [route, setRoute] = useState<DeliveryRouteQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [map, setMap] = useState(false);
  const generation = useRef(0);
  const latestChange = useRef(onChange);
  latestChange.current = onChange;
  useEffect(() => {
    generation.current++;
    setRoute(null);
    setBusy(false);
    setError("");
    latestChange.current(null);
    if (fulfilment === "pickup" && (pickup === "hq" || options.maps_ready)) {
      void work(
        () => appDelivery.quote("pickup", null, pickup),
        (value) => {
          setRoute(value);
          latestChange.current(value);
        },
      );
    }
    return () => {
      generation.current++;
    };
  }, [fulfilment, options, pickup]);
  function changeDestination(
    value: DeliveryPoint | null,
    label = "",
    resolved = false,
  ) {
    generation.current++;
    setPoint(value);
    setAddress(label);
    if (resolved) onAddressSelect(label);
    setRoute(null);
    setBusy(false);
    onChange(null);
  }
  async function work<T>(action: () => Promise<T>, done: (value: T) => void) {
    const version = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await action();
      if (version === generation.current) done(result);
    } catch (e) {
      if (version === generation.current)
        setError(
          e instanceof Error ? e.message : "Location could not be confirmed.",
        );
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }
  async function locate() {
    setPoint(null);
    setAddress("");
    onChange(null);
    setRoute(null);
    await work(
      async () => {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted")
          throw Error(
            "Allow location access, search for an address, or choose a map pin.",
          );
        let timer: ReturnType<typeof setTimeout> | undefined;
        const position = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  Error(
                    "Location is taking too long. Search for your destination or choose a map pin.",
                  ),
                ),
              15_000,
            );
          }),
        ]).finally(() => {
          if (timer) clearTimeout(timer);
        });
        return {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
      },
      (value) =>
        resolvePin(
          value,
          "Current location selected. Check your building and delivery entrance.",
        ),
    );
  }
  function confirm(destination = point) {
    setRoute(null);
    onChange(null);
    void work(
      () =>
        appDelivery.quote(
          fulfilment,
          destination,
          fulfilment === "pickup" ? pickup : null,
        ),
      (value) => {
        setRoute(value);
        onChange(value);
      },
    );
  }
  function resolvePin(value: DeliveryPoint, label: string) {
    changeDestination(value, label);
    if (options.maps_ready)
      void work(
        () => appDelivery.resolve(value),
        (results) => {
          if (results[0]) {
            setAddress(results[0].address);
            onAddressSelect(results[0].address);
          }
          confirm(value);
        },
      );
  }
  function findLocations() {
    if (busy || search.trim().length < 3 || !options.maps_ready) return;
    void work(
      () => appDelivery.search(search.trim()),
      (value) => {
        setResults(value);
        if (!value.length)
          setError("No destination found. Try a nearby road or landmark.");
      },
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <Text>Prepared at {options.origin_name}</Text>
      <Text>{options.origin_address}</Text>
      {fulfilment === "delivery" ? (
        <>
          <Text>
            KES 100 + KES 30/km by road from HQ. Available within the configured{" "}
            {options.radius_km} km delivery area.
          </Text>
          <Button
            variant="outline"
            label="Use my current location"
            loading={busy}
            onPress={() => void locate()}
          />
          <Input
            label="Search for your building, road or landmark"
            value={search}
            onChangeText={(value) => {
              setSearch(value);
              setResults([]);
            }}
            returnKeyType="search"
            onSubmitEditing={findLocations}
          />
          <Button
            variant="outline"
            label="Find destination"
            disabled={busy || search.trim().length < 3 || !options.maps_ready}
            onPress={findLocations}
          />
          {results.map((value, i) => (
            <Button
              key={i}
              variant="outline"
              label={value.address}
              onPress={() => {
                changeDestination(value, value.address, true);
                setResults([]);
                confirm(value);
              }}
            />
          ))}
          {options.map_picker_ready ? (
            <Button
              variant="outline"
              label="Choose pin on Google Maps"
              onPress={() => setMap(true)}
            />
          ) : null}
          {map ? (
            <DeliveryMap
              point={point}
              onClose={() => setMap(false)}
              onSelect={(value) => {
                resolvePin(
                  value,
                  "Map pin selected. Check your delivery entrance.",
                );
                setMap(false);
              }}
            />
          ) : null}
          {point ? (
            <Notice
              message={`${address} Pin: ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}. This pin determines the delivery fee; enter the building and apartment in your address details.`}
            />
          ) : null}
        </>
      ) : (
        <>
          <Text>
            Collect at HQ for free, or choose an available store. Transfers cost
            50% of the applicable delivery fee from HQ.
          </Text>
          <Disclosure
            title={`Choose pickup branch: ${pickup === "hq" ? options.origin_name : options.pickup_stores.find((s) => s.id === pickup)?.name || "Select branch"}`}
          >
            {[
              {
                id: "hq",
                name: options.origin_name,
                address: options.origin_address,
              },
              ...options.pickup_stores,
            ].map((store) => (
              <Button
                key={store.id}
                variant={pickup === store.id ? "primary" : "outline"}
                label={store.name}
                onPress={() => {
                  generation.current++;
                  setPickup(store.id);
                  setRoute(null);
                  setBusy(false);
                  onChange(null);
                  if (store.id === pickup) confirm(null);
                }}
              />
            ))}
          </Disclosure>
        </>
      )}
      {!options.maps_ready && (fulfilment === "delivery" || pickup !== "hq") ? (
        <Notice message="Maps setup is pending. Delivery quotes are unavailable; HQ collection can still be configured separately." />
      ) : null}
      {error ? <Notice error message={error} /> : null}
      {fulfilment === "delivery" || (!route && !busy) ? (
        <Button
          variant="outline"
          label={
            fulfilment === "delivery"
              ? route
                ? "Recalculate delivery fee"
                : "Calculate delivery fee"
              : "Retry pickup transport quote"
          }
          loading={busy}
          disabled={
            busy ||
            (fulfilment === "delivery" && (!point || !options.maps_ready)) ||
            (fulfilment === "pickup" && pickup !== "hq" && !options.maps_ready)
          }
          onPress={() => confirm()}
        />
      ) : null}
      {fulfilment === "pickup" && busy ? (
        <Notice message="Calculating transport to your pickup branch…" />
      ) : null}
      {route ? (
        <Notice
          message={`${route.rate}. ${route.distance_meters / 1000} km by road. ${fulfilment === "pickup" ? "Transport" : "Delivery"}: ${money(route.fee_minor / 100)}. Quote valid until ${new Date(route.expires_at).toLocaleTimeString()}.`}
        />
      ) : null}
    </View>
  );
}
