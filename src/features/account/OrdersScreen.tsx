import { useLocalSearchParams } from "expo-router";
import {
  AppOrdersScreen,
  AppOrderScreen,
} from "@/features/commerce/AppOrdersScreen";
import { purchaseTestOrigin } from "@/features/purchase-test/client";
import {
  PurchaseOrders,
  PurchaseReceipt,
} from "@/features/purchase-test/PurchaseOrders";

export function OrdersScreen() {
  return purchaseTestOrigin() ? <PurchaseOrders /> : <AppOrdersScreen />;
}
export function OrderScreen() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  return purchaseTestOrigin() && reference?.startsWith("TEST-") ? (
    <PurchaseReceipt reference={reference} />
  ) : (
    <AppOrderScreen />
  );
}
