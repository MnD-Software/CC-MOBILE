export const staffRoles = [
  "admin",
  "staff",
  "ecommerce_manager",
  "executive",
  "finance",
  "analyst",
  "production",
  "head_chef",
  "dispatch",
  "branch_dispatch",
  "branch_manager",
  "rider",
  "driver",
  "marketing_manager",
  "content_manager",
  "sales",
  "corporate_sales",
  "customer_service",
] as const;

export const isStaffRole = (role?: string) => !!role && role !== "customer";

/** Navigation convenience only. Every staff API independently authorizes its actor. */
export function staffRouteAllowed(role: string, path: string) {
  if (path === "/workspace" || path === "/notifications") return true;
  const managers = ["admin", "staff", "ecommerce_manager"];
  if (path === "/kitchen")
    return [...managers, "production", "head_chef"].includes(role);
  if (path === "/dispatch")
    return [
      ...managers,
      "dispatch",
      "branch_dispatch",
      "branch_manager",
    ].includes(role);
  if (path === "/rider") return ["rider", "driver"].includes(role);
  if (path === "/commerce-operations")
    return [...managers, "executive", "finance", "analyst"].includes(role);
  if (path === "/campaign-studio")
    return [...managers, "marketing_manager", "content_manager"].includes(role);
  return false;
}

export function staffGreeting(hour: number) {
  return hour < 12
    ? "Good morning"
    : hour < 17
      ? "Good afternoon"
      : "Good evening";
}
