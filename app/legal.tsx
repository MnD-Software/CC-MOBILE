import { Linking, Text } from "react-native";
import { Screen, Notice, ui, useToast } from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
export default function Legal() {
  const toast = useToast();
  return (
    <Screen title="The important details." back>
      <Text style={ui.body}>
        Cake City’s published terms and privacy policy govern your account and
        orders. Open the current policies below.
      </Text>
      <Button
        variant="outline"
        label="Privacy policy"
        onPress={() =>
          void Linking.openURL("https://cakecity.co.ke/privacy-policy/").catch(
            () => toast("The policy could not be opened."),
          )
        }
      />
      <Button
        variant="outline"
        label="Terms & conditions"
        onPress={() =>
          void Linking.openURL(
            "https://cakecity.co.ke/terms-and-conditions/",
          ).catch(() => toast("The terms could not be opened."))
        }
      />
      <Notice message="To request a copy or deletion of your account information, contact Cake City customer support with the email on your account." />
      <Button
        variant="outline"
        label="Contact Cake City about my data"
        onPress={() =>
          void Linking.openURL("https://cakecity.co.ke/contact-us/").catch(() =>
            toast("Support could not be opened."),
          )
        }
      />
    </Screen>
  );
}
