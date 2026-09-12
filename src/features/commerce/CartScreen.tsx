import { Image } from "expo-image";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import {
  Screen,
  Section,
  Feedback,
  Notice,
  ui,
  useToast,
} from "@/components/ui/Commerce";
import { customerApi } from "./api";
import { useBag } from "./store";
import { money } from "./contracts";
export function CartScreen() {
  const { customer } = useAuth();
  const bag = useBag();
  const toast = useToast();
  return (
    <Screen title="A bag full of happy." back right={null}>
      {!bag.lines.length ? (
        <>
          <Feedback empty="Your celebration starts with a cake." />
          <Button
            label="Explore Cake City"
            onPress={() => router.replace("/(tabs)/shop")}
          />
        </>
      ) : (
        <>
          <Text style={ui.body}>
            {bag.lines.reduce((n, l) => n + l.quantity, 0)} little reasons to
            celebrate
          </Text>
          {bag.lines.map((line) => (
            <View
              key={line.key}
              style={{
                gap: 14,
                paddingBottom: 20,
                borderBottomWidth: 1,
                borderBottomColor: "#EEE5E0",
              }}
            >
              <View style={ui.row}>
                {line.image ? (
                  <Image
                    source={line.image}
                    cachePolicy="memory-disk"
                    style={{ width: 82, height: 88, borderRadius: 14 }}
                  />
                ) : null}
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={ui.label}>{line.name}</Text>
                  <Text style={ui.body}>
                    {line.selection.size}
                    {line.selection.message
                      ? " · “" + line.selection.message + "”"
                      : ""}
                  </Text>
                  <Text style={ui.label}>
                    {money(line.price * line.quantity)}
                  </Text>
                </View>
              </View>
              <View style={ui.spread}>
                <View style={ui.row}>
                  <Button
                    label="−"
                    accessibilityLabel={"Decrease " + line.name}
                    variant="secondary"
                    onPress={() => bag.quantity(line.key, line.quantity - 1)}
                  />
                  <Text style={ui.label}>{line.quantity}</Text>
                  <Button
                    label="+"
                    accessibilityLabel={"Increase " + line.name}
                    variant="secondary"
                    disabled={line.quantity >= 20}
                    onPress={() => bag.quantity(line.key, line.quantity + 1)}
                  />
                </View>
                <Button
                  variant="ghost"
                  label="Remove"
                  onPress={() => bag.remove(line.key)}
                />
              </View>
              <Button
                variant="ghost"
                label="Save for later"
                onPress={async () => {
                  if (!customer) {
                    router.push("/sign-in");
                    return;
                  }
                  try {
                    await customerApi.favourite(line.slug, false);
                    bag.remove(line.key);
                    toast("Saved to your favourites.");
                  } catch (e) {
                    toast(
                      e instanceof Error
                        ? e.message
                        : "Unable to save this cake.",
                    );
                  }
                }}
              />
            </View>
          ))}
          <Section title="Your order" />
          <View style={ui.spread}>
            <Text style={ui.body}>Estimated subtotal</Text>
            <Text style={ui.heading}>
              {money(bag.lines.reduce((n, l) => n + l.price * l.quantity, 0))}
            </Text>
          </View>
          <Notice message="We’ll confirm current prices, offers and delivery before you pay." />
          <Button
            label={
              customer ? "Continue to checkout →" : "Sign in to checkout →"
            }
            onPress={() => router.push(customer ? "/checkout" : "/sign-in")}
          />
          <Button
            variant="outline"
            label="Add a little extra"
            onPress={() => router.push("/(tabs)/shop")}
          />
        </>
      )}
    </Screen>
  );
}
