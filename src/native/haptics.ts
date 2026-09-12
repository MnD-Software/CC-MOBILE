import { AccessibilityInfo, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
export async function selectionFeedback(){if(Platform.OS==='web')return;try{if(!await AccessibilityInfo.isReduceMotionEnabled())await Haptics.selectionAsync();}catch{/* Haptics are optional on unsupported devices. */}}
