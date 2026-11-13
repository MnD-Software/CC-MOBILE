import { router } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Notice, Screen } from "@/components/ui/Commerce";
import { BusinessPortal } from "./BusinessPortal";

export function CorporateScreen() {
  const { customer, logout } = useAuth();
  return (
    <Screen
      title="Cake City for business"
      subtitle="Bring your team together, one celebration at a time."
      back
      right={
        customer ? (
          <Button
            label="Sign out"
            size="sm"
            variant="ghost"
            onPress={() => void logout().then(() => router.replace("/sign-in"))}
          />
        ) : undefined
      }
    >
      {customer ? (
        <BusinessPortal key={customer.id} />
      ) : (
        <>
          <Notice message="Sign in to manage your company and request a quotation." />
          <Button label="Sign in" onPress={() => router.push("/sign-in")} />
        </>
      )}
    </Screen>
  );
}
