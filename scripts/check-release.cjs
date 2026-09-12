const fs = require('node:fs');
const path = require('node:path');
const profile = process.env.CAKECITY_BUILD_PROFILE || 'production';
const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo;
const problems = [];
if (app.android.package !== 'ke.co.cakecity.mobile' || app.ios.bundleIdentifier !== 'ke.co.cakecity.mobile') problems.push('Unexpected application identity.');
problems.push(...require('./release-config.cjs').releaseProblems(process.env, profile));
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) problems.push('Expo SDK 57 requires Node.js 22.13 or newer.');
if (problems.length) { process.stderr.write(problems.join('\n') + '\n'); process.exit(1); }
process.stdout.write(`Release configuration checks passed (${profile}).\n`);
if (!process.env.EXPO_PUBLIC_API_URL) process.stdout.write('Account and checkout services are not configured in this test build.\n');
