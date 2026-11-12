import { z } from "zod";
import { api } from "@/api/client";

export const staffOverviewSchema = z.object({
  role: z.string(),
  department: z.string(),
  generated_at: z.string(),
  timezone: z.string(),
  mode: z.enum(["live", "simulation"]),
  currency: z.literal("KES"),
  period: z.object({ from: z.string(), to: z.string() }),
  modules: z.array(
    z.object({ id: z.string(), label: z.string(), href: z.string() }),
  ),
  kpis: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      value: z.number(),
      hint: z.string(),
      format: z.enum(["money", "number"]),
      change_percent: z.number().nullable(),
    }),
  ),
  workload: z.array(
    z.object({ key: z.string(), label: z.string(), count: z.number() }),
  ),
  alerts: z.array(
    z.object({ label: z.string(), count: z.number(), tab: z.string() }),
  ),
  activity: z.array(
    z.object({ action: z.string(), reference: z.string(), at: z.string() }),
  ),
  sales: z
    .object({
      gross_minor: z.number(),
      reversed_minor: z.number(),
      net_minor: z.number(),
      orders: z.number(),
      average_minor: z.number(),
      previous_net_minor: z.number(),
      change_percent: z.number().nullable(),
      definition: z.string(),
      trend: z.array(
        z.object({
          date: z.string(),
          net_minor: z.number(),
          orders: z.number(),
        }),
      ),
      top_products: z.array(
        z.object({
          name: z.string(),
          quantity: z.number(),
          subtotal_minor: z.number(),
        }),
      ),
    })
    .nullable(),
});
export type StaffOverview = z.infer<typeof staffOverviewSchema>;
export const getStaffOverview = async (
  from: string,
  to: string,
  mode: "live" | "simulation",
  signal?: AbortSignal,
) => {
  const query = new URLSearchParams({ from_date: from, to_date: to, mode });
  return staffOverviewSchema.parse(
    await api.get(`/v1/staff/overview?${query}`, { auth: true, signal }),
  );
};
export function staffDateRange(days: number, now = new Date()) {
  const today = new Date(now.getTime() + 3 * 3600_000)
    .toISOString()
    .slice(0, 10);
  const first = new Date(`${today}T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() - days + 1);
  return { from: first.toISOString().slice(0, 10), to: today };
}
