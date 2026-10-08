import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@/auth/AuthProvider';
import { notificationRoute } from './notifications';

if(Platform.OS!=='web'){
  Notifications.setNotificationHandler({
    handleNotification:async notification=>{
      const tracking=notification.request.content.data?.cakeCityOrderTracking===true;
      return {
        shouldPlaySound:!tracking,
        shouldSetBadge:false,
        shouldShowBanner:true,
        shouldShowList:true,
        priority:tracking?Notifications.AndroidNotificationPriority.LOW:Notifications.AndroidNotificationPriority.DEFAULT,
      };
    },
  });
}

export function NotificationObserver(){const {customer,restoring}=useAuth();useEffect(()=>{if(Platform.OS==='web'||restoring||!customer)return;let active=true;function handle(response:Notifications.NotificationResponse){const path=notificationRoute(response.notification.request.content.data ?? {});if(active&&path)router.push(path);void Notifications.clearLastNotificationResponseAsync();}void Notifications.getLastNotificationResponseAsync().then(r=>{if(r)handle(r);}).catch(()=>undefined);const sub=Notifications.addNotificationResponseReceivedListener(handle);return()=>{active=false;sub.remove();};},[customer?.id,restoring]);return null;}
