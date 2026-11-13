import { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";

export type PickupBranch = { id: string; name: string; address: string };
export function PickupBranchPicker({
  branches,
  selected,
  onSelect,
}: {
  branches: PickupBranch[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const active = branches.filter(
    (b) => !b.id.includes("athi-river") && !/athi river/i.test(b.name),
  );
  const current = active.find((b) => b.id === selected);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose pickup branch"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setOpen(true);
          setSearch("");
        }}
        style={{
          padding: 18,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceRaised,
          flexDirection: "row",
          gap: 14,
          alignItems: "center",
        }}
      >
        <View
          style={{
            backgroundColor: colors.brandLight,
            padding: 12,
            borderRadius: 16,
          }}
        >
          <Ionicons
            name="storefront-outline"
            color={colors.brandStrong}
            size={24}
          />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{ color: colors.muted, fontSize: 11, fontWeight: "700" }}
          >
            COLLECT YOUR HAPPINESS
          </Text>
          <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 16 }}>
            {current?.name || "Choose a Cake City branch"}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {current?.address || `${active.length} pickup locations`}
          </Text>
        </View>
        <Ionicons name="chevron-down" color={colors.brandStrong} size={19} />
      </Pressable>
      <BottomSheet
        visible={open}
        title="Find your Cake City"
        onClose={() => setOpen(false)}
      >
        <View style={{ gap: 14 }}>
          <Text style={{ color: colors.muted, lineHeight: 21 }}>
            Your cake, closer to you. Athi River customers are now served by our
            Embakasi branch.
          </Text>
          <Input
            label="Search branches or neighbourhoods"
            value={search}
            onChangeText={setSearch}
          />
          {active
            .filter((b) =>
              `${b.name} ${b.address}${b.id.includes("embakasi") ? " Athi River" : ""}`
                .toLowerCase()
                .includes(search.trim().toLowerCase()),
            )
            .map((b) => (
              <Pressable
                key={b.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected === b.id }}
                onPress={() => {
                  onSelect(b.id);
                  setOpen(false);
                }}
                style={{
                  padding: 18,
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor:
                    selected === b.id ? colors.brandStrong : colors.border,
                  backgroundColor:
                    selected === b.id ? colors.brandLight : colors.surface,
                  flexDirection: "row",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <Ionicons
                  name={
                    selected === b.id ? "checkmark-circle" : "location-outline"
                  }
                  color={colors.brandStrong}
                  size={24}
                />
                <View style={{ flex: 1, gap: 5 }}>
                  <Text
                    style={{
                      color: colors.ink,
                      fontWeight: "800",
                      fontSize: 16,
                    }}
                  >
                    {b.name}
                  </Text>
                  <Text
                    style={{
                      color: colors.muted,
                      lineHeight: 19,
                      fontSize: 12,
                    }}
                  >
                    {b.address}
                  </Text>
                  {b.id.includes("embakasi") ? (
                    <Text
                      style={{
                        color: colors.brandStrong,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      Also serving Athi River
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          <Button label="Done" variant="ghost" onPress={() => setOpen(false)} />
        </View>
      </BottomSheet>
    </>
  );
}
