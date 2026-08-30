const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

if (!apiUrl) {
  throw new Error('EXPO_PUBLIC_API_URL is required');
}

export const env = {
  apiUrl,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
};
