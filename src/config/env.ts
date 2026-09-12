const configured = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '') ?? '';
const apiUrl = /^https:\/\//i.test(configured) || (__DEV__ && /^http:\/\//i.test(configured)) ? configured : '';

export const env = {
  apiUrl,
  storeUrl: 'https://cakecity.co.ke/wp-json/wc/store/v1',
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
};
