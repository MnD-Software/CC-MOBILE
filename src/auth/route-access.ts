import { isStaffRole } from "./staff-routing";
export const authRoutes = [
  "/sign-in",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/rider-login",
];
export function publicEntryRoute(path: string) {
  return (
    authRoutes.includes(path) ||
    path === "/legal" ||
    /^\/(?:page|information)(?:\/|$)/.test(path)
  );
}
export function accountDestination(role?: string) {
  return role === "corporate_client"
    ? "/corporate"
    : isStaffRole(role)
      ? "/workspace"
      : "/home";
}
