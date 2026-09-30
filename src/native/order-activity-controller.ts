import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { orderActivityState } from "./order-activity-state";
import type { OrderActivityProps } from "./CakeCityOrderActivity";

export type OrderActivitySnapshot = {
  id: number;
  number: string;
  status: string;
  checkedAt: number;
};

export function orderActivitiesAvailable() {
  return (
    Platform.OS === "ios" &&
    Constants.appOwnership !== "expo" &&
    !!requireOptionalNativeModule("ExpoWidgets")
  );
}

function factory() {
  // Never evaluate native widget imports inside Expo Go, Android or web.
  if (!orderActivitiesAvailable()) return null;
  return (
    require("./CakeCityOrderActivity") as typeof import("./CakeCityOrderActivity")
  ).default;
}

function content(snapshot: OrderActivitySnapshot): OrderActivityProps | null {
  const state = orderActivityState(snapshot.status);
  if (!state || !Number.isFinite(snapshot.checkedAt)) return null;
  return {
    orderNumber: snapshot.number,
    statusLabel: state.label,
    compactLabel: state.compact,
    updatedAt: new Date(snapshot.checkedAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export async function startOrderActivity(snapshot: OrderActivitySnapshot) {
  const activity = factory();
  const props = content(snapshot);
  if (!activity || !props || orderActivityState(snapshot.status)?.terminal)
    return null;
  // One tracked order at a time avoids duplicate activities after a relaunch.
  await Promise.all(
    activity.getInstances().map((instance) => instance.end("immediate")),
  );
  const instance = activity.start(
    props,
    `cakecity://order/website-${snapshot.id}`,
    new Date(snapshot.checkedAt + 120_000),
  );
  return instance.getId();
}

export async function syncOrderActivity(
  activityId: string,
  snapshot: OrderActivitySnapshot,
) {
  const instance = factory()
    ?.getInstances()
    .find((item) => item.getId() === activityId);
  if (!instance) return false;
  const props = content(snapshot);
  if (!props) {
    await instance.end("immediate");
    return false;
  }
  if (orderActivityState(snapshot.status)?.terminal) {
    await instance.end("default", props, new Date(snapshot.checkedAt));
    return false;
  }
  await instance.update(props, new Date(snapshot.checkedAt + 120_000));
  return true;
}

export async function stopOrderActivity(activityId: string) {
  const instance = factory()
    ?.getInstances()
    .find((item) => item.getId() === activityId);
  await instance?.end("immediate");
}
