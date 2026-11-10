import { z } from "zod";
import { api } from "@/api/client";

export const tripSchema = z.object({
  id: z.string(),
  reference: z.string(),
  status: z.string(),
  revision: z.number().int(),
  plant: z.string(),
  service_type: z.string(),
  destination: z.string(),
  recipient: z.string(),
  phone: z.string(),
  rider_id: z.string().nullable(),
  rider_name: z.string().nullable(),
  scheduled_at: z.string().nullable(),
  slot: z.string(),
  payment_test: z.boolean(),
  items: z.array(z.object({ sku_id: z.number(), quantity: z.number() })),
});
export type Trip = z.infer<typeof tripSchema>;
export const workSchema = z.object({
  reference: z.string(),
  status: z.string(),
  plant: z.string().nullable(),
  assigned_to: z.string().nullable(),
  attention: z.string(),
  fulfilment: z.string(),
  payment_test: z.boolean(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      selection: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});
export type WorkOrder = z.infer<typeof workSchema>;
const privateGet = (path: string, signal?: AbortSignal) =>
  api.get(path, { auth: true, signal });
export const logisticsApi = {
  locations: async (signal?: AbortSignal) =>
    z
      .array(z.object({ id: z.string(), name: z.string() }))
      .parse(await privateGet("/v1/kitchen/locations", signal)),
  riderTasks: async (signal?: AbortSignal) =>
    tripSchema.array().parse(await privateGet("/v1/rider/tasks", signal)),
  tasks: async (signal?: AbortSignal) =>
    tripSchema.array().parse(await privateGet("/v1/logistics/tasks", signal)),
  orders: async (kitchen: boolean, signal?: AbortSignal) =>
    workSchema
      .array()
      .parse(
        await privateGet(
          kitchen ? "/v1/kitchen/orders" : "/v1/logistics/orders",
          signal,
        ),
      ),
  riders: async (signal?: AbortSignal) =>
    z
      .array(z.object({ id: z.string(), name: z.string(), role: z.string() }))
      .parse(await privateGet("/v1/logistics/riders", signal)),
  progress: (task: Trip, status: string, note = "", proof = "") =>
    api.patch(
      `/v1/rider/tasks/${encodeURIComponent(task.id)}`,
      { revision: task.revision, status, note, proof },
      { auth: true },
    ),
  assignKitchen: (reference: string, plant: string, assigned_to: string) =>
    api.put(
      `/v1/kitchen/orders/${encodeURIComponent(reference)}/assignment`,
      { plant, assigned_to },
      { auth: true },
    ),
  kitchenProgress: (reference: string, status: string) =>
    api.patch(
      `/v1/kitchen/orders/${encodeURIComponent(reference)}/status`,
      { status },
      { auth: true },
    ),
  assignTrip: (reference: string, rider_id: string, destination: string) =>
    api.post(
      `/v1/logistics/orders/${encodeURIComponent(reference)}/tasks`,
      { rider_id, destination },
      { auth: true },
    ),
};
