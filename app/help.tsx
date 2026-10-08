import { Linking, View } from "react-native";
import { Text } from "@/components/ui/Typography";
import { router } from "expo-router";
import { Screen, ui as baseUi, useToast } from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { useThemedStyles } from "@/theme/ThemeProvider";

const helpTopics = [
  [
    "Finding the right cake",
    "Browse the live Shop to see the cakes currently available from Cake City.",
  ],
  [
    "Need help with an order?",
    "Contact Cake City support with your order details. The team can confirm what is possible.",
  ],
  [
    "Payments and delivery",
    "Secure ordering is being connected. We will only show payment and delivery choices when they can be confirmed live.",
  ],
  [
    "Rewards and special offers",
    "These will appear as soon as Cake City's secure account service is connected.",
  ],
] as const;

export default function Help() {
  const ui = useThemedStyles(baseUi);
  const toast = useToast();
  return (
    <Screen title="We're here to help." back right={null}>
      <Text style={ui.body}>
        Need a hand choosing a cake or managing your account? Our team is here
        to help make the celebration easy.
      </Text>
      {helpTopics.map(([title, copy]) => (
        <View key={title} style={ui.panel}>
          <Text style={ui.heading}>{title}</Text>
          <Text style={ui.body}>{copy}</Text>
        </View>
      ))}
      <Button
        label="Requests, quotes & order support"
        onPress={() => router.push("/requests")}
      />
      <Button
        label="Explore cakes"
        onPress={() => router.push("/(tabs)/shop")}
      />
      <Button
        variant="outline"
        label="Call Cake City · 0709 729 000"
        onPress={() =>
          void Linking.openURL("tel:+254709729000").catch(() =>
            toast("Calling is unavailable on this device."),
          )
        }
      />
    </Screen>
  );
}
