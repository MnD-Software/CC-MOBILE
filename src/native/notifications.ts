import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from '@/api/client';
import type { Href } from 'expo-router';
export function notificationRoute(data:Record<string,unknown>):Href|null {
  if(typeof data.reference==='string'&&/^CC-[A-Za-z0-9-]+$/.test(data.reference))return {pathname:'/order/[reference]',params:{reference:data.reference}};
  const url=typeof data.url==='string'?data.url:'';
  const match=url.match(/^\/account\/orders\/(CC-[A-Za-z0-9-]+)$/);
  if(match)return {pathname:'/order/[reference]',params:{reference:match[1]}};
  const routes:Record<string,Href>={'/account/rewards':'/rewards','/account/moments':'/moments','/offers':'/offers','/checkout':'/cart'};
  return routes[url]??null;
}
export async function registerNotifications(){
  if(Platform.OS==='web')throw new Error('Push notifications are available in the installed Cake City app.');
  if(Platform.OS==='android'){
    await Notifications.setNotificationChannelAsync('orders',{name:'Orders and delivery',importance:Notifications.AndroidImportance.DEFAULT});
    await Notifications.setNotificationChannelAsync('offers',{name:'Offers and rewards',importance:Notifications.AndroidImportance.LOW,sound:null});
  }
  const permission=await Notifications.requestPermissionsAsync({ios:{allowAlert:true,allowBadge:true,allowSound:true}});
  if(!permission.granted)throw new Error('Notifications are disabled. You can enable them in your device settings.');
  const projectId=Constants.expoConfig?.extra?.eas?.projectId??Constants.easConfig?.projectId;
  if(!projectId)throw new Error('Notifications cannot be registered at the moment.');
  const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
  await api.post('/v1/account/notifications/devices',{token,platform:Platform.OS,provider:'expo'},{auth:true});
  return token;
}
