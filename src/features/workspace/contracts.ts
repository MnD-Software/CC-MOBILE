import { z } from "zod";
export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  billing_address: z.string(),
  industry: z.string(),
  role: z.enum(["owner", "approver", "buyer", "viewer"]),
  credit_enabled: z.boolean(),
});
export const enquirySchema = z.object({
  id: z.string(),
  kind: z.string(),
  subject: z.string(),
  details: z.string(),
  status: z.string(),
  quote_minor: z.number().int().nullable(),
  quote_expires_at: z.string().nullable(),
  staff_response: z.string(),
  revision: z.number().int(),
});
export const workspaceSchema = z.object({
  role: z.string(),
  permissions: z.array(z.string()),
  financial_reporting_available: z.boolean(),
  branch_scoping_available: z.boolean(),
});
export type Organization = z.infer<typeof organizationSchema>;
export type Enquiry = z.infer<typeof enquirySchema>;
