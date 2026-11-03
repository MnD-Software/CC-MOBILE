import { router } from "expo-router";
import { Text } from "@/components/ui/Typography";
import {
  Screen,
  Notice,
  ui as baseUi,
  useToast,
} from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { useThemedStyles } from "@/theme/ThemeProvider";
export default function Legal() {
  const ui = useThemedStyles(baseUi);
  const toast = useToast();
  return (
    <Screen title="The important details." back>
      <Text style={ui.body}>
        Read Cake City's published policy copies here in the app. Contact in-app
        support if a document is unavailable.
      </Text>
      <Button
        variant="outline"
        label="Privacy policy"
        onPress={() =>
          router.push({
            pathname: "/information/[slug]",
            params: { slug: "privacy-policy" },
          })
        }
      />
      <Button
        variant="outline"
        label="Terms & conditions"
        onPress={() =>
          router.push({
            pathname: "/information/[slug]",
            params: { slug: "terms-and-conditions" },
          })
        }
      />
      <Notice message="To request a copy or deletion of your account information, contact Cake City customer support with the email on your account." />
      <Button
        variant="outline"
        label="Contact Cake City about my data"
        onPress={() => router.push("/requests")}
      />
    </Screen>
  );
}
