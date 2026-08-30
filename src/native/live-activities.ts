import { NativeModules, Platform } from 'react-native';

export type CakeCityLiveActivityStatus =
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered';

export type CakeCityLiveActivityUpdate = {
  orderId: string;
  cakeName: string;
  status: CakeCityLiveActivityStatus;
  etaMinutes?: number;
  progress: number;
};

type NativeCakeCityLiveActivities = {
  areActivitiesAvailable?: () => Promise<boolean>;
  startOrderActivity?: (update: CakeCityLiveActivityUpdate) => Promise<string>;
  updateOrderActivity?: (activityId: string, update: CakeCityLiveActivityUpdate) => Promise<void>;
  endOrderActivity?: (activityId: string, update: CakeCityLiveActivityUpdate) => Promise<void>;
};

const nativeModule = NativeModules.CakeCityLiveActivities as NativeCakeCityLiveActivities | undefined;

export async function canUseCakeCityLiveActivities() {
  if (Platform.OS !== 'ios' || !nativeModule?.areActivitiesAvailable) return false;
  try {
    return await nativeModule.areActivitiesAvailable();
  } catch {
    return false;
  }
}

export async function startCakeCityOrderActivity(update: CakeCityLiveActivityUpdate) {
  if (Platform.OS !== 'ios' || !nativeModule?.startOrderActivity) {
    return { started: false, reason: 'native-module-unavailable' as const };
  }

  const activityId = await nativeModule.startOrderActivity({
    ...update,
    progress: Math.max(0, Math.min(1, update.progress)),
  });
  return { started: true, activityId } as const;
}

export async function updateCakeCityOrderActivity(activityId: string, update: CakeCityLiveActivityUpdate) {
  if (Platform.OS !== 'ios' || !nativeModule?.updateOrderActivity) return false;
  await nativeModule.updateOrderActivity(activityId, {
    ...update,
    progress: Math.max(0, Math.min(1, update.progress)),
  });
  return true;
}

export async function endCakeCityOrderActivity(activityId: string, update: CakeCityLiveActivityUpdate) {
  if (Platform.OS !== 'ios' || !nativeModule?.endOrderActivity) return false;
  await nativeModule.endOrderActivity(activityId, {
    ...update,
    progress: Math.max(0, Math.min(1, update.progress)),
  });
  return true;
}
