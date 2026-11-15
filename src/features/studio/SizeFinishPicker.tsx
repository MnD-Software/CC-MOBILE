import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";

type Choice = {
  id: number;
  price_minor: number;
  attributes?: unknown;
};
type Attribute = { name?: string; attribute?: string; value: string };
const attributes = (choice: Choice): Attribute[] =>
  Array.isArray(choice.attributes)
    ? choice.attributes.filter(
        (a): a is Attribute =>
          a != null &&
          typeof a.value === "string" &&
          a.value.trim().length > 0 &&
          ((typeof a.name === "string" && a.name.trim().length > 0) ||
            (typeof a.attribute === "string" && a.attribute.trim().length > 0)),
      )
    : [];
const label = (text: string) =>
  text.replace(/^pa_/, "").replaceAll("-", " ").replaceAll("_", " ");
const name = (a: Attribute) =>
  (typeof a.name === "string" && a.name.trim()) || a.attribute || "";
export function SizeFinishPicker<T extends Choice>({
  variants,
  selected,
  onSelect,
}: {
  variants: T[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  const { colors } = useTheme();
  const groups = [...new Set(variants.flatMap((v) => attributes(v).map(name)))];
  if (!groups.length)
    return (
      <Text style={{ color: colors.muted }}>
        Original recipe and finish · KES {selected.price_minor / 100}
      </Text>
    );
  return (
    <View style={{ gap: 14 }}>
      {groups.map((group) => {
        const values = [
          ...new Set(
            variants.flatMap((v) =>
              attributes(v)
                .filter((a) => name(a) === group)
                .map((a) => a.value),
            ),
          ),
        ];
        const current = attributes(selected).find(
          (a) => name(a) === group,
        )?.value;
        const title = /size|weight/i.test(group)
          ? "Cake size · custom cakes start at 2 kg"
          : /icing|cream|finish/i.test(group)
            ? "Icing & finish"
            : label(group);
        return (
          <View key={group} style={{ gap: 8 }}>
            <Text
              style={{ color: colors.ink, fontWeight: "700", fontSize: 14 }}
            >
              {title}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {values.map((value) => {
                const matching = variants.filter((v) =>
                  attributes(v).some(
                    (a) => name(a) === group && a.value === value,
                  ),
                );
                const next =
                  matching.find((v) =>
                    attributes(selected).every(
                      (a) =>
                        name(a) === group ||
                        attributes(v).some(
                          (b) => name(b) === name(a) && b.value === a.value,
                        ),
                    ),
                  ) || matching[0];
                const display =
                  /with.cream|soft.icing|buttercream|whipped/i.test(value)
                    ? `Soft icing · ${label(value)}`
                    : /fondant|sugarpaste|hard.icing/i.test(value)
                      ? `Hard icing · ${label(value)}`
                      : label(value);
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityLabel={`${title}: ${display}`}
                    accessibilityState={{ checked: current === value }}
                    onPress={() => onSelect(next)}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 15,
                      borderRadius: 17,
                      borderWidth: 1,
                      borderColor:
                        current === value ? colors.brandStrong : colors.border,
                      backgroundColor:
                        current === value ? colors.brandLight : colors.surface,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.ink,
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      {display}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        );
      })}
      <Text
        style={{ color: colors.brandStrong, fontWeight: "800", fontSize: 20 }}
      >
        KES {(selected.price_minor / 100).toLocaleString("en-KE")}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
        Only published combinations are selectable. Changing one option may
        update another to an available recipe. Hard/soft icing that is not
        listed can be requested in Inspo for a kitchen quote.
      </Text>
    </View>
  );
}
