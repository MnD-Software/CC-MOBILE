export type ReverseGeocodedPlace = {
  formattedAddress?: string | null;
  name?: string | null;
  streetNumber?: string | null;
  street?: string | null;
  district?: string | null;
  subregion?: string | null;
  city?: string | null;
  region?: string | null;
};

export type LocationAddressSuggestion = {
  address: string;
  area: string;
  city: string;
};

function clean(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function unique(parts: Array<string | null | undefined>) {
  return [...new Set(parts.map(clean).filter(Boolean))];
}

/**
 * Converts a foreground reverse-geocode result into editable checkout fields.
 * We intentionally do not retain or transmit the device coordinates here.
 */
export function locationAddressSuggestion(
  place: ReverseGeocodedPlace | null | undefined,
): LocationAddressSuggestion | null {
  if (!place) return null;

  const street = unique([place.streetNumber, place.street]).join(" ");
  const address =
    clean(place.formattedAddress) || unique([place.name, street]).join(", ");
  const area = clean(place.district) || clean(place.subregion);
  const city = clean(place.city) || clean(place.region);

  if (!address && !area && !city) return null;
  return { address, area, city };
}
