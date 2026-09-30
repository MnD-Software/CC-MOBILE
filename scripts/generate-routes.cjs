const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.env.EXPO_ROUTER_APP_ROOT = path.join(root, 'app');
const output = path.join(root, '.expo', 'types');
fs.mkdirSync(output, { recursive: true });
// Expo 57 keeps the compatible generator nested under Expo CLI. Do not weaken
// Href types or launch Metro just to update route declarations.
const cliPackage = require.resolve('@expo/cli/package.json', { paths: [require.resolve('expo/package.json')] });
const modulePath = require.resolve('@expo/router-server/build/typed-routes', { paths: [cliPackage] });
require(modulePath).regenerateDeclarations(output, {});
setTimeout(() => {}, 1100);
