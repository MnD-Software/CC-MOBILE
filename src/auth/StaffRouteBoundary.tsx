import { rememberCustomerRoute } from "./post-login";
import { useEffect, type PropsWithChildren } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useAuth } from "./AuthProvider";
import { isStaffRole, staffRouteAllowed } from "./staff-routing";
import { useTheme } from "@/theme/ThemeProvider";

/** Keep the root navigator mounted while concealing a restoring/unauthorized route. */
export function StaffRouteBoundary({ children }: PropsWithChildren) {
  const { customer, restoring } = useAuth();
  const { colors } = useTheme();
  const path = usePathname();
  const anonymousBlocked =
    !customer &&
    ![
      "/sign-in",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/rider-login",
    ].includes(path) &&
    !path.startsWith("/page/");
  const blocked =
    anonymousBlocked ||
    (!!customer &&
      isStaffRole(customer.role) &&
      !staffRouteAllowed(customer.role, path));
  useEffect(() => {
    if (!restoring && blocked) {
      if (!customer) rememberCustomerRoute(path);
      router.replace(
        !customer
          ? "/sign-in"
          : customer?.role === "corporate_client"
            ? "/corporate"
            : "/workspace",
      );
    }
  }, [restoring, blocked, path, customer?.role]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        pointerEvents={restoring || blocked ? "none" : "auto"}
        style={{ flex: 1, opacity: restoring || blocked ? 0 : 1 }}
      >
        {children}
      </View>
      {restoring || blocked ? (
        <ActivityIndicator
          accessibilityLabel="Opening your workspace"
          color={colors.brandStrong}
          style={{ position: "absolute", top: "48%", alignSelf: "center" }}
        />
      ) : null}
    </View>
  );
}
