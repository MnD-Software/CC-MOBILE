import { Linking, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen, ui, useToast } from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
export default function Help() {
  const toast = useToast();
  return (
    <Screen title="We’re here to help." back>
      <Text style={ui.body}>
        From choosing the right cake to finding your delivery, let’s make your
        celebration a little easier.
      </Text>
      {[
        [
          "Where is my order?",
          "Open Orders for the latest confirmed preparation and delivery updates.",
        ],
        [
          "Can I change my cake?",
          "Contact your branch with the order reference. The team will confirm what is possible before preparation.",
        ],
        [
          "My payment was interrupted",
          "Return to Checkout. Your saved payment request can be checked without creating another charge.",
        ],
        [
          "How do I use rewards?",
          "Your account shows your current points and Cake City credit. Available redemptions are confirmed before your balance changes.",
        ],
      ].map(([title, copy]) => (
        <View key={title} style={ui.panel}>
          <Text style={ui.heading}>{title}</Text>
          <Text style={ui.body}>{copy}</Text>
        </View>
      ))}
      <Button
        label="Find & contact your branch"
        onPress={() => router.push("/branches")}
      />
      <Button
        variant="outline"
        label="Cake City customer support"
        onPress={() =>
          void Linking.openURL("https://cakecity.co.ke/contact-us/").catch(() =>
            toast("The support page could not be opened."),
          )
        }
      />
    </Screen>
  );
}
