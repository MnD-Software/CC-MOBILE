import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Feedback, Notice, Screen } from "@/components/ui/Commerce";
import { PesapalCheckoutForm } from "./PesapalCheckoutForm";
import { loadPesapalConfiguration } from "./pesapal-checkout";
import { env } from "@/config/env";
import { api } from "@/api/client";

function ReviewCheckout() {
  const capability = useQuery({
    queryKey: ["review-checkout-capability"],
    queryFn: () => api.get<{ enabled: boolean }>("/v1/review-checkout/config"),
    retry: false,
  });
  return (
    <Screen title="Checkout" subtitle="A few details. A happy moment." back>
      {capability.isPending ? (
        <Feedback loading />
      ) : capability.isError ? (
        <Feedback
          error={capability.error}
          onRetry={() => void capability.refetch()}
        />
      ) : capability.data?.enabled ? (
        <PesapalCheckoutForm />
      ) : (
        <Notice message="Ordering is not available right now." />
      )}
    </Screen>
  );
}

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
  return env.reviewCheckout ? <ReviewCheckout /> : <LiveCheckout />;
}
