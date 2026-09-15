import { useState } from "react";
import { Text, View } from "react-native";
import { Chip, Notice, ui } from "@/components/ui/Commerce";
import {
  plainText,
  selectableVariations,
  type StoreProduct,
} from "./contracts";

export function VariationPicker({
  product,
  onChange,
}: {
  product: StoreProduct;
  onChange: (id: number | undefined) => void;
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const variations = selectableVariations(product);
  const names = [
    ...new Set(variations.flatMap((v) => v.attributes.map((a) => a.name))),
  ];
  function choose(name: string, value: string) {
    const next = { ...selected, [name]: value };
    setSelected(next);
    const match = variations.find((v) =>
      names.every(
        (n) =>
          next[n] &&
          v.attributes.some((a) => a.name === n && a.value === next[n]),
      ),
    );
    onChange(match?.id);
  }
  if (!variations.length)
    return (
      <Notice message="This cake's options need confirmation from Cake City before ordering." />
    );
  const complete = names.every((n) => selected[n]);
  const exists = variations.some((v) =>
    names.every((n) =>
      v.attributes.some((a) => a.name === n && a.value === selected[n]),
    ),
  );
  return (
    <View style={{ gap: 17 }}>
      {names.map((name) => {
        const values = [
          ...new Set(
            variations.flatMap((v) =>
              v.attributes
                .filter((a) => a.name === name && a.value)
                .map((a) => a.value!),
            ),
          ),
        ];
        const terms = product.attributes.find((a) => a.name === name)?.terms;
        return (
          <View key={name} style={{ gap: 6 }}>
            <Text style={[ui.label, { fontSize: 12, fontWeight: "500" }]}>
              {plainText(name)}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {values.map((value) => (
                <Chip
                  compact
                  key={value}
                  label={plainText(
                    terms?.find((t) => t.slug === value)?.name ?? value,
                  )}
                  selected={selected[name] === value}
                  onPress={() => choose(name, value)}
                />
              ))}
            </View>
          </View>
        );
      })}
      {complete && !exists ? (
        <Notice message="This combination is unavailable. Please choose another size or finish." />
      ) : null}
    </View>
  );
}
