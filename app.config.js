const GOOGLE_SIGN_IN_PLUGIN = '@react-native-google-signin/google-signin';
const GOOGLE_IOS_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

function configuredGooglePlugin() {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  if (!clientId) return null;

  if (!clientId.endsWith(GOOGLE_IOS_CLIENT_ID_SUFFIX)) {
    throw new Error(
      `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must end with ${GOOGLE_IOS_CLIENT_ID_SUFFIX}`,
    );
  }

  const clientPrefix = clientId.slice(0, -GOOGLE_IOS_CLIENT_ID_SUFFIX.length);
  return [
    GOOGLE_SIGN_IN_PLUGIN,
    { iosUrlScheme: `com.googleusercontent.apps.${clientPrefix}` },
  ];
}

module.exports = ({ config }) => {
  const googlePlugin = configuredGooglePlugin();

  return {
    ...config,
    plugins: (config.plugins ?? []).map((plugin) => {
      const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
      if (pluginName !== GOOGLE_SIGN_IN_PLUGIN || !googlePlugin) return plugin;
      return googlePlugin;
    }),
  };
};
