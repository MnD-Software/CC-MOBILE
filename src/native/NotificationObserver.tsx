import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@/auth/AuthProvider';
import { notificationRoute } from './notifications';
export function NotificationObserver(){const {customer,restoring}=useAuth();useEffect(()=>{if(Platform.OS==='web'||restoring||!customer)return;let active=true;function handle(response:Notifications.NotificationResponse){const path=notificationRoute(response.notification.request.content.data ?? {});if(active&&path)router.push(path);void Notifications.clearLastNotificationResponseAsync();}void Notifications.getLastNotificationResponseAsync().then(r=>{if(r)handle(r);}).catch(()=>undefined);const sub=Notifications.addNotificationResponseReceivedListener(handle);return()=>{active=false;sub.remove();};},[customer?.id,restoring]);return null;}
