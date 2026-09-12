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
  const plugins = (config.plugins ?? []).filter(plugin => (Array.isArray(plugin) ? plugin[0] : plugin) !== GOOGLE_SIGN_IN_PLUGIN);
  if (googlePlugin) plugins.push(googlePlugin);
  if (process.env.CAKECITY_BUILD_PROFILE || process.env.EAS_BUILD_PROFILE) {
    const problems = require('./scripts/release-config.cjs').releaseProblems(process.env);
    if (problems.length) throw new Error(problems.join('\n'));
  }

  return {
    ...config,
    plugins,
    extra: { ...config.extra, ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID ? { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } } : {}) },
    android: { ...config.android, ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}) },
  };
};
