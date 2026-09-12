import { z } from "zod";
import { api } from "@/api/client";
const customerSchema = z.object({
  id: z.string(),
  email: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  phone: z.string().nullable(),
  role: z.string(),
});
const sessionSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(32),
  token_type: z.literal("bearer"),
  expires_in: z.number().positive(),
  customer: customerSchema,
});
export type Customer = z.infer<typeof customerSchema>;
export type MobileSession = z.infer<typeof sessionSchema>;
async function session(path: string, body: unknown) {
  return sessionSchema.parse(await api.post<unknown>(path, body));
}
export const authApi = {
  login: (email: string, password: string) =>
    session("/v1/auth/mobile/login", { email, password }),
  register: (input: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone?: string;
  }) => session("/v1/auth/mobile/register", input),
  google: (idToken: string) =>
    session("/v1/auth/mobile/google", { id_token: idToken }),
  refresh: (refreshToken: string) =>
    session("/v1/auth/mobile/refresh", { refresh_token: refreshToken }),
  logout: (refreshToken: string) =>
    api.post<void>("/v1/auth/mobile/logout", { refresh_token: refreshToken }),
  forgotPassword: (email: string) =>
    api.post<void>("/v1/auth/forgot-password", {
      email,
      redirect_uri: "cakecity://reset-password",
    }),
  resetPassword: (token: string, password: string) =>
    api.post<void>("/v1/auth/reset-password", { token, password }),
};
