import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useScreenActive } from "@/design/useScreenActive";
import { appOrderSchema } from "./app-orders";

export function useHomeOrders() {
  const { customer } = useAuth();
  const active = useScreenActive();
  return useQuery({
    queryKey: ["app-orders", customer?.id, "home-milestones"],
    queryFn: async () =>
      z
        .object({
          data: z.array(appOrderSchema.extend({ fulfilment: z.string() })),
          total: z.number().int().nonnegative().optional(),
          awaiting_receipt_count: z.number().int().nonnegative().optional(),
        })
        .parse(await api.get("/v1/account/home-orders", { auth: true })),
    enabled: !!customer && active,
    staleTime: 5_000,
    refetchInterval: active ? 10_000 : false,
    retry: false,
  });
}

export function useAcknowledgeOrder() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (reference: string) =>
      api.post(
        `/v1/app-orders/${encodeURIComponent(reference)}/received`,
        {},
        { auth: true },
      ),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["app-orders"] }),
        cache.invalidateQueries({ queryKey: ["app-order"] }),
      ]);
    },
  });
}
