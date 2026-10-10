import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { z } from "zod";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import {
  Screen,
  Section,
  ProductTile,
  Notice,
  Feedback,
  useToast,
} from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CelebrationArtwork } from "@/components/ui/CelebrationArtwork";
import { shopApi, CATALOGUE_STALE_TIME_MS } from "@/features/commerce/api";
import {
  money,
  plainText,
  productPrice,
  selectableVariations,
  variationCartAttributes,
  variationLabel,
  type StoreProduct,
  type BagLine,
} from "@/features/commerce/contracts";
import {
  fetchLiveVariations,
  liveVariationPrice,
} from "@/features/commerce/store-variations";
import { useBag } from "@/features/commerce/store";
import {
  planningRecommendations,
  combinedPlanTotal,
  suggestedOrderDate,
} from "@/features/celebrations/planning";
import { contentApi } from "@/features/editorial/content";
import { AnimatedNumber } from "@/components/ui/Delight";

const draftSchema = z.object({
  occasion: z.string().max(30),
  flavour: z.string().max(30),
  budget: z.string().max(8),
  guests: z.string().max(3),
});
export default function CelebrationBuilder() {
  const params = useLocalSearchParams<{
    occasion?: string;
    date?: string;
    name?: string;
  }>();
  const { customer } = useAuth();
  const owner = customer?.id ?? "guest";
  const { colors } = useTheme();
  const toast = useToast();
  const addBundle = useBag((state) => state.addBundle);
  const edited = useRef(false);
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const [occasion, setOccasion] = useState(params.occasion ?? "birthday");
  const [flavour, setFlavour] = useState("Surprise me");
  const [budget, setBudget] = useState("5000");
  const [guests, setGuests] = useState("12");
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<StoreProduct | null>(null);
  const [variationId, setVariationId] = useState<number | null>(null);
  const [extraIds, setExtraIds] = useState<number[]>([]);
  useEffect(() => {
    edited.current = false;
    setSelected(null);
    setExtraIds([]);
    setStep(0);
    setOccasion(params.occasion ?? "birthday");
    setFlavour("Surprise me");
    setBudget("5000");
    setGuests("12");
    let active = true;
    void AsyncStorage.getItem(`cakecity.plan.${owner}`)
      .then((value) => {
        if (!active || edited.current || !value) return;
        const result = draftSchema.safeParse(JSON.parse(value));
        if (result.success) {
          setOccasion(params.occasion ?? result.data.occasion);
          setFlavour(result.data.flavour);
          setBudget(result.data.budget);
          setGuests(result.data.guests);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [owner, params.occasion]);
  const cakes = useQuery({
    queryKey: ["planner-cakes", occasion],
    queryFn: async ({ signal }) => {
      // Occasion names are often catalogue categories rather than product text.
      // Include real signature cakes so a sparse occasion search still offers
      // suitable celebration cakes, with no synthetic records or prices.
      const results = await Promise.allSettled([
        shopApi.products(
          {
            search:
              occasion === "other" || occasion === "anniversary"
                ? "cake"
                : occasion,
            perPage: 40,
          },
          signal,
        ),
        shopApi.products({ category: 229, perPage: 40 }, signal),
      ]);
      if (signal.aborted) throw new Error("Cancelled");
      const successful = results.filter(
        (result) => result.status === "fulfilled",
      );
      if (!successful.length)
        throw new Error("Cake suggestions could not be loaded. Please retry.");
      return {
        data: [
          ...new Map(
            successful
              .flatMap((result) => result.value.data)
              .map((product) => [product.id, product]),
          ).values(),
        ],
      };
    },
    staleTime: CATALOGUE_STALE_TIME_MS,
    enabled: step > 0,
  });
  const extras = useQuery({
    queryKey: ["planner-extras"],
    queryFn: ({ signal }) =>
      shopApi.products({ search: "candle", perPage: 12 }, signal),
    staleTime: CATALOGUE_STALE_TIME_MS,
    enabled: !!selected,
  });
  const recommendations = planningRecommendations(
    cakes.data?.data ?? [],
    flavour,
    Number(budget),
    Number(guests),
  );
  const variants = selected ? selectableVariations(selected) : [];
  const variable =
    !!selected &&
    (selected.type === "variable" || selected.variations.length > 0);
  const live = useQuery({
    queryKey: ["planner-variants", selected?.id],
    queryFn: ({ signal }) =>
      fetchLiveVariations(
        variants.map((item) => item.id),
        signal,
      ),
    enabled: variants.length > 0,
    staleTime: CATALOGUE_STALE_TIME_MS,
  });
  const variant = variants.find((item) => item.id === variationId);
  const liveVariant = live.data?.find(
    (item) =>
      item.id === variationId &&
      item.parent === selected?.id &&
      item.is_in_stock &&
      item.is_purchasable,
  );
  const price = selected
    ? variable
      ? liveVariant
        ? liveVariationPrice(liveVariant)
        : null
      : productPrice(selected)
    : null;
  const selectedExtras = (extras.data?.data ?? []).filter(
    (item) =>
      extraIds.includes(item.id) &&
      item.type === "simple" &&
      item.is_in_stock &&
      item.is_purchasable &&
      productPrice(item) !== null,
  );
  const total = combinedPlanTotal(price, selectedExtras);
  const editorial = useQuery({
    queryKey: ["product-editorial", selected?.id],
    queryFn: ({ signal }) => contentApi.product(selected!.id, signal),
    enabled: !!selected,
    staleTime: 60_000,
    retry: false,
  });
  const orderBy = params.date
    ? suggestedOrderDate(params.date, editorial.data?.preparation_hours ?? null)
    : null;
  function choices(
    items: string[],
    value: string,
    change: (value: string) => void,
  ) {
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {items.map((item) => (
          <Button
            key={item}
            size="sm"
            label={item}
            variant={item === value ? "primary" : "secondary"}
            accessibilityState={{ selected: item === value }}
            onPress={() => {
              edited.current = true;
              change(item);
            }}
          />
        ))}
      </View>
    );
  }
  function addPlan() {
    if (
      !selected ||
      total === null ||
      price === null ||
      (variable && (!variant || !liveVariant))
    )
      return;
    const bundle: BagLine[] = [];
    for (const product of [selected, ...selectedExtras]) {
      const parent = product.id === selected.id;
      bundle.push({
        key: "",
        product_id: product.id,
        slug: product.slug,
        name:
          parent && variant
            ? `${plainText(product.name)} · ${variationLabel(selected, variant)}`
            : plainText(product.name),
        image: product.images[0]?.src ?? null,
        price: parent ? price : productPrice(product)!,
        quantity: 1,
        selection: {
          size:
            parent &&
            /(?:^|\D)2(?:\.0)?\s*kg/i.test(
              variant ? variationLabel(selected, variant) : product.name,
            )
              ? "2kg"
              : parent &&
                  /1[.\s-]*5\s*kg/i.test(
                    variant ? variationLabel(selected, variant) : product.name,
                  )
                ? "1.5kg"
                : "1kg",
          message: "",
          add_ons: [],
          variation_id: parent ? variant?.id : undefined,
          variation_attributes:
            parent && variant
              ? variationCartAttributes(selected, variant)
              : undefined,
        },
      });
    }
    if (!addBundle(bundle)) {
      toast(
        "Your bag is at its item limit. Remove an item or reduce its quantity, then add your complete celebration again.",
      );
      return;
    }
    toast("Your celebration cake and extras are in the bag.");
    router.push("/cart");
  }
  const validBudget = Number(budget) > 0 && Number(budget) <= 1_000_000;
  const validGuests =
    Number.isInteger(Number(guests)) &&
    Number(guests) > 0 &&
    Number(guests) <= 999;
  return (
    <Screen back>
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        <CelebrationArtwork size={88} />
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={{ color: colors.ink, fontSize: 25, fontWeight: "800" }}>
            {params.name ? `For ${params.name}` : "Build a happy moment"}
          </Text>
          <Text style={{ color: colors.muted }}>
            Your cake. Your budget. A little magic.
          </Text>
        </View>
      </View>
      <Text style={{ color: colors.brandStrong, fontWeight: "700" }}>
        Step {selected ? 3 : step + 1} of 3 ·{" "}
        {selected
          ? "Make it yours"
          : step
            ? "Choose your cake"
            : "Your occasion"}
      </Text>
      {!step ? (
        <>
          <Section title="What are we celebrating?" />
          {choices(
            ["birthday", "anniversary", "graduation", "other"],
            occasion,
            setOccasion,
          )}
          <Section title="Favourite flavour" />
          {choices(
            ["Surprise me", "Vanilla", "Chocolate", "Red velvet", "Cheesecake"],
            flavour,
            setFlavour,
          )}
          <Input
            label="How many people?"
            value={guests}
            keyboardType="number-pad"
            maxLength={3}
            onChangeText={(value) => {
              edited.current = true;
              setGuests(value.replace(/\D/g, ""));
            }}
          />
          <Input
            label="Cake and extras budget (KSh)"
            value={budget}
            keyboardType="number-pad"
            maxLength={8}
            onChangeText={(value) => {
              edited.current = true;
              setBudget(value.replace(/\D/g, ""));
            }}
          />
          <Button
            label="Find my cakes"
            disabled={!validBudget || !validGuests}
            onPress={() => setStep(1)}
          />
          <Button
            label="Save my plan for later"
            variant="ghost"
            onPress={() => {
              const scope = owner;
              void AsyncStorage.setItem(
                `cakecity.plan.${scope}`,
                JSON.stringify({ occasion, flavour, budget, guests }),
              )
                .then(() => {
                  if (currentOwner.current === scope)
                    toast("Your plan is saved on this device.");
                })
                .catch(() =>
                  toast("Your plan couldn't be saved. Please retry."),
                );
            }}
          />
        </>
      ) : !selected ? (
        <>
          <Button
            label="Edit my preferences"
            variant="ghost"
            onPress={() => setStep(0)}
          />
          {cakes.isPending ? (
            <Notice message="Finding real Cake City cakes for your moment…" />
          ) : null}
          <Feedback
            error={cakes.error}
            empty={
              !cakes.isPending && !cakes.isError && !recommendations.length
                ? "No cakes match this budget yet. Try a higher budget or another occasion."
                : undefined
            }
            onRetry={() => void cakes.refetch()}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {recommendations.map(({ product, explanation }) => (
              <View key={product.id} style={{ width: "48%", gap: 6 }}>
                <ProductTile
                  product={product}
                  onPress={() => {
                    setSelected(product);
                    setVariationId(null);
                    setExtraIds([]);
                  }}
                />
                <Text
                  style={{ fontSize: 11, color: colors.muted, lineHeight: 17 }}
                >
                  {explanation}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <>
          <Section title={plainText(selected.name)} />
          {orderBy ? (
            <Notice
              message={`For this celebration, order by ${orderBy.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. Your bakery confirms availability and the final delivery slot.`}
            />
          ) : null}
          <Button
            variant="ghost"
            label="Choose a different cake"
            onPress={() => {
              setSelected(null);
              setExtraIds([]);
            }}
          />
          {variable ? (
            <>
              <Section title="Choose your cake option" />
              <View style={{ gap: 8 }}>
                {variants.map((item) => (
                  <Button
                    key={item.id}
                    variant={variationId === item.id ? "primary" : "secondary"}
                    label={variationLabel(selected, item)}
                    onPress={() => setVariationId(item.id)}
                  />
                ))}
              </View>
              <Feedback
                error={live.error}
                onRetry={() => void live.refetch()}
              />
              {!variants.length ? (
                <Notice message="This cake needs bakery assistance. Open its details to check the available options." />
              ) : null}
            </>
          ) : null}
          <Section title="A finishing touch" />
          {(extras.data?.data ?? [])
            .filter(
              (item) =>
                item.type === "simple" &&
                item.is_purchasable &&
                item.is_in_stock &&
                productPrice(item) !== null,
            )
            .slice(0, 6)
            .map((item) => (
              <Button
                key={item.id}
                variant={extraIds.includes(item.id) ? "primary" : "secondary"}
                label={`${extraIds.includes(item.id) ? "✓ " : "+ "}${plainText(item.name)} · ${money(productPrice(item)!)}`}
                onPress={() =>
                  setExtraIds((ids) =>
                    ids.includes(item.id)
                      ? ids.filter((id) => id !== item.id)
                      : [...ids, item.id],
                  )
                }
              />
            ))}
          <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 22 }}>
            {total === null ? (
              "Choose an option for your total"
            ) : (
              <AnimatedNumber value={total} format={money} />
            )}
          </Text>
          {total !== null && total > Number(budget) ? (
            <Notice
              message={`This selection is ${money(total - Number(budget))} above your budget. You can change the cake or remove an extra.`}
            />
          ) : null}
          <Notice message="Serving sizes and preparation times vary by cake and size. Confirm them with your bakery before setting the celebration date." />
          <Button
            label="Add my celebration to bag"
            disabled={total === null || (variable && !liveVariant)}
            onPress={addPlan}
          />
          <Button
            label="View cake photos and details"
            variant="ghost"
            onPress={() =>
              router.push({
                pathname: "/product/[id]",
                params: { id: String(selected.id), slug: selected.slug },
              })
            }
          />
        </>
      )}
    </Screen>
  );
}
