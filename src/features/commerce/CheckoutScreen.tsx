import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Feedback, Notice, Screen } from "@/components/ui/Commerce";
import { PesapalCheckoutForm } from "./PesapalCheckoutForm";
import { loadPesapalConfiguration } from "./pesapal-checkout";

function LiveCheckout() {
  const configuration = useQuery({
    queryKey: ["pesapal-configuration"],
    queryFn: loadPesapalConfiguration,
    retry: false,
    staleTime: 30_000,
  });
  return (
    <Screen title="Checkout" subtitle="Secure payment with Pesapal." back>
      {configuration.isPending && configuration.fetchStatus !== "idle" ? (
        <Feedback loading />
      ) : configuration.isError ? (
        <Feedback
          error={configuration.error}
          onRetry={() => void configuration.refetch()}
        />
      ) : configuration.data?.available ? (
        <>
          {configuration.data.environment === "sandbox" ? (
            <Notice message="Pesapal sandbox: test payments only." />
          ) : null}
          <PesapalCheckoutForm />
        </>
      ) : (
        <>
          <Notice message="In-app payments are not available right now. Your shopping bag has been kept." />
          <Button
            variant="outline"
            label="Manage billing details"
            onPress={() => router.push("/billing-details")}
          />
        </>
      )}
    </Screen>
  );
}

/** Normal checkout always uses the real app backend. Test tools have their own route. */
export function CheckoutScreen() {
  return <LiveCheckout />;
}
