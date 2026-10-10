import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Feedback, ProductTile, Screen } from "@/components/ui/Commerce";
import {
  CATALOGUE_GC_TIME_MS,
  CATALOGUE_STALE_TIME_MS,
  shopApi,
} from "@/features/commerce/api";
import { usePreferences } from "@/features/commerce/store";
import { CelebrationArtwork } from "@/components/ui/CelebrationArtwork";

/**
 * Saved cakes are explicitly device-local until the account API publishes a
 * server-backed favourites endpoint. Each slug is resolved again before it is
 * rendered, so deleted products can never reappear from AsyncStorage.
 */
export default function Favourites() {
  const { customer } = useAuth();
  const saved = usePreferences((state) => state.savedProductSlugs);
  const query = useQuery({
    queryKey: ["saved-products", ...saved],
    enabled: saved.length > 0,
    staleTime: CATALOGUE_STALE_TIME_MS,
    gcTime: CATALOGUE_GC_TIME_MS,
    refetchOnMount: false,
    queryFn: ({ signal }) => shopApi.productsByIdentifier(saved, signal),
  });

  return (
    <Screen
      title="Saved cakes"
      subtitle={
        customer
          ? `${customer.first_name}'s shortlist for the next celebration.`
          : "Your shortlist for the next celebration."
      }
      back
    >
      {!saved.length ? (
        <View style={{ alignItems: "center" }}>
          <CelebrationArtwork kind="heart" size={140} />
        </View>
      ) : null}
      <Feedback
        loading={query.isPending && saved.length > 0}
        error={query.error}
        empty={
          !saved.length
            ? "Save a cake to find it here."
            : query.isSuccess && !query.data.length
              ? "Those saved cakes are no longer in today’s collection."
              : undefined
        }
        onRetry={() => void query.refetch()}
      />
      {query.data?.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          {query.data.map((cake) => (
            <ProductTile key={cake.id} product={cake} width={156} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
