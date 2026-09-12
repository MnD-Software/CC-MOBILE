function releaseProblems(environment, profile = environment.CAKECITY_BUILD_PROFILE || environment.EAS_BUILD_PROFILE || 'production') {
  const problems = [];
  const api = environment.EXPO_PUBLIC_API_URL?.trim() || '';
  if (api || profile === 'production') {
    try {
      const url = new URL(api);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /^(localhost|127\.|\[::1\])|(^|\.)example\.|\.invalid$/i.test(url.hostname)) throw new Error();
    } catch { problems.push('Set a deployed HTTPS EXPO_PUBLIC_API_URL without credentials, query parameters or fragments.'); }
  }
  if (profile === 'production' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(environment.EXPO_PUBLIC_EAS_PROJECT_ID || '')) {
    problems.push('Set the real EXPO_PUBLIC_EAS_PROJECT_ID for production push/build identity.');
  }
  return problems;
}
module.exports = { releaseProblems };
