import { z } from "zod";
import { api } from "@/api/client";
import { bagLineSchema } from "@/features/commerce/contracts";

export const conciergeStatusSchema = z.object({
  available: z.boolean(),
  voice_available: z.boolean(),
  daily_limit: z.number(),
});
export const conciergeReplySchema = z.object({
  reply: z.string().max(3000),
  products: z
    .array(
      z.object({
        id: z.number(),
        slug: z.string(),
        name: z.string(),
        type: z.string().default("simple"),
        prices: z.object({
          price: z.string(),
          currency_code: z.string(),
          currency_minor_unit: z.number(),
        }),
        images: z.array(z.object({ src: z.string() })).nullable(),
      }),
    )
    .max(6),
  orders: z
    .array(z.object({ reference: z.string(), status: z.string() }))
    .max(5),
  bag: z.array(bagLineSchema).max(10),
});
export type ConciergeReply = z.infer<typeof conciergeReplySchema>;
export type ConversationTurn = { role: "user" | "assistant"; content: string };
export const conciergeApi = {
  status: async (signal?: AbortSignal) =>
    conciergeStatusSchema.parse(
      await api.get("/v1/concierge/status", { signal }),
    ),
  chat: async (
    message: string,
    history: ConversationTurn[],
    signal?: AbortSignal,
  ) =>
    conciergeReplySchema.parse(
      await api.post(
        "/v1/concierge/chat",
        { message, history: history.slice(-12) },
        { auth: true, signal, timeoutMs: 115_000 },
      ),
    ),
};
