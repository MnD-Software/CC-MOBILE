import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import { shopDepartments, type ShopDepartmentId } from "./shop-departments";
import { parseBudget, shopSorts, type ShopSort } from "./shop-browse";

export type ShopSheetMode = "filters" | "categories" | "sort";
export type ShopOptions = {
  department: ShopDepartmentId;
  subfilter: string;
  sort: ShopSort;
  budget: Partial<ReturnType<typeof parseBudget>>;
};

// Mounted afresh for each opening: dismissing a sheet never applies its draft.
export function ShopOptionsSheet({
  mode,
  value,
  onClose,
  onApply,
}: {
  mode: ShopSheetMode;
  value: ShopOptions;
  onClose: () => void;
  onApply: (value: ShopOptions) => void;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(value);
  const [minimum, setMinimum] = useState(
    value.budget.minimumKes?.toString() ?? "",
  );
  const [maximum, setMaximum] = useState(
    value.budget.maximumKes?.toString() ?? "",
  );
  const [error, setError] = useState("");
  const title =
    mode === "categories"
      ? "Choose your cake"
      : mode === "sort"
        ? "Sort cakes"
        : "Filter cakes";
  const selected = shopDepartments.find(
    (item) => item.id === draft.department,
  )!;
  const apply = () => {
    try {
      onApply({
        ...draft,
        budget:
          mode === "filters" ? parseBudget(minimum, maximum) : draft.budget,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Check your budget.");
    }
  };
  return (
    <BottomSheet
      visible
      title={title}
      onClose={onClose}
      footer={
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Button
            label="Clear"
            variant="outline"
            style={{ flex: 1 }}
            onPress={() => {
              setMinimum("");
              setMaximum("");
              setError("");
              setDraft((current) =>
                mode === "categories"
                  ? { ...current, department: "all", subfilter: "all" }
                  : mode === "sort"
                    ? { ...current, sort: "popular" }
                    : { ...current, budget: {} },
              );
            }}
          />
          <Button label="Apply" onPress={apply} style={{ flex: 1 }} />
        </View>
      }
    >
      {mode === "categories" ? (
        <>
          {shopDepartments.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: draft.department === item.id }}
              accessibilityLabel={item.name}
              onPress={() =>
                setDraft((current) => ({
                  ...current,
                  department: item.id,
                  subfilter: item.filters[0].id,
                }))
              }
              style={{
                minHeight: 66,
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                padding: 10,
                borderRadius: 18,
                backgroundColor:
                  draft.department === item.id
                    ? colors.brandLight
                    : colors.surface,
              }}
            >
              <Image
                source={{ uri: item.image }}
                contentFit="cover"
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  backgroundColor: "#FFFFFF",
                }}
              />
              <Text
                style={{
                  flex: 1,
                  fontSize: 16,
                  fontWeight: "700",
                  color: colors.ink,
                }}
              >
                {item.name}
              </Text>
              <Ionicons
                name={
                  draft.department === item.id
                    ? "radio-button-on"
                    : "radio-button-off"
                }
                size={22}
                color={
                  draft.department === item.id
                    ? colors.brandStrong
                    : colors.muted
                }
              />
            </Pressable>
          ))}
          {selected.filters.length > 1 ? (
            <View
              style={{
                gap: 8,
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text
                style={{ color: colors.ink, fontSize: 15, fontWeight: "800" }}
              >
                Explore {selected.name.toLowerCase()}
              </Text>
              {selected.filters.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="radio"
                  accessibilityLabel={item.label}
                  accessibilityState={{ checked: draft.subfilter === item.id }}
                  onPress={() =>
                    setDraft((current) => ({ ...current, subfilter: item.id }))
                  }
                  style={{
                    minHeight: 50,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Ionicons
                    name={
                      draft.subfilter === item.id
                        ? "radio-button-on"
                        : "radio-button-off"
                    }
                    size={21}
                    color={
                      draft.subfilter === item.id
                        ? colors.brandStrong
                        : colors.muted
                    }
                  />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ color: colors.ink, fontSize: 14 }}>
                      {item.label}
                    </Text>
                    {"note" in item ? (
                      <Text style={{ color: colors.muted, fontSize: 12 }}>
                        {item.note}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : mode === "sort" ? (
        shopSorts.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="radio"
            accessibilityLabel={item.label}
            accessibilityState={{ checked: draft.sort === item.id }}
            onPress={() =>
              setDraft((current) => ({ ...current, sort: item.id }))
            }
            style={{
              minHeight: 56,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: 12,
              borderRadius: 16,
              backgroundColor:
                draft.sort === item.id ? colors.brandLight : colors.surface,
            }}
          >
            <Ionicons
              name={
                draft.sort === item.id ? "radio-button-on" : "radio-button-off"
              }
              size={22}
              color={draft.sort === item.id ? colors.brandStrong : colors.muted}
            />
            <Text style={{ fontSize: 16, color: colors.ink }}>
              {item.label}
            </Text>
          </Pressable>
        ))
      ) : (
        <>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.ink }}>
            Your budget
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
            Find a cake for your occasion. Prices are in KSh; delivery is
            calculated at checkout.
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Input
                label="Minimum"
                value={minimum}
                onChangeText={setMinimum}
                placeholder="0"
                keyboardType="decimal-pad"
                maxLength={10}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Maximum"
                value={maximum}
                onChangeText={setMaximum}
                placeholder="No limit"
                keyboardType="decimal-pad"
                maxLength={10}
              />
            </View>
          </View>
          <View style={{ gap: 8 }}>
            {[2500, 4000, 6000].map((amount) => (
              <Pressable
                key={amount}
                accessibilityRole="radio"
                accessibilityLabel={`Under KSh ${amount.toLocaleString()}`}
                accessibilityState={{
                  checked: maximum === String(amount) && !minimum,
                }}
                onPress={() => {
                  setMinimum("");
                  setMaximum(String(amount));
                }}
                style={{
                  minHeight: 48,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Ionicons
                  name={
                    maximum === String(amount) && !minimum
                      ? "radio-button-on"
                      : "radio-button-off"
                  }
                  size={22}
                  color={colors.brandStrong}
                />
                <Text style={{ fontSize: 15, color: colors.ink }}>
                  Under KSh {amount.toLocaleString()}
                </Text>
              </Pressable>
            ))}
          </View>
          {error ? (
            <Text
              accessibilityRole="alert"
              style={{ color: colors.error, fontSize: 13 }}
            >
              {error}
            </Text>
          ) : null}
        </>
      )}
    </BottomSheet>
  );
}
