// Installs the actual standalone APK and records native cold-start/route evidence.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const apk = path.resolve(process.argv[2] || 'dist/CakeCity-0.2.0-preview.apk');
const adb = process.env.ADB || path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const output = path.resolve('artifacts/android-qa');
const packageId = 'ke.co.cakecity.mobile';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let serial = process.argv[3];
function command(args, binary = false) {
  const result = spawnSync(adb, [...(serial ? ['-s', serial] : []), ...args], {
    encoding: binary ? undefined : 'utf8', timeout: 120000, windowsHide: true, maxBuffer: 12 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || String(result.stderr || result.stdout));
  return result.stdout;
}
async function readScreen(expected) {
  let xml = '';
  for (let attempt = 0; attempt < 12; attempt++) {
    command(['shell', 'uiautomator', 'dump', '/sdcard/cakecity-qa.xml']);
    xml = command(['shell', 'cat', '/sdcard/cakecity-qa.xml']);
    if (xml.includes(expected)) return xml;
    await pause(1500);
  }
  throw new Error(`Native screen did not show ${JSON.stringify(expected)}: ${xml.slice(0, 1000)}`);
}
async function main() {
  if (!fs.existsSync(apk)) throw new Error('Build the APK before native verification.');
  if (!serial) {
    const devices = command(['devices']).split(/\r?\n/).filter(line => /\tdevice$/.test(line)).map(line => line.split('\t')[0]);
    if (devices.length !== 1) throw new Error('Specify the serial of one connected, authorized Android test device.');
    serial = devices[0];
  }
  fs.mkdirSync(output, { recursive: true });
  console.log(command(['install', '-r', apk]).trim());
  command(['shell', 'am', 'force-stop', packageId]);
  console.log(command(['shell', 'am', 'start', '-W', '-n', `${packageId}/.MainActivity`]).trim());
  const routes = [];
  async function capture(route, label, name) {
    if (route) command(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `cakecity://${route}`, packageId]);
    const xml = await readScreen(label);
    fs.writeFileSync(path.join(output, name + '.xml'), xml);
    fs.writeFileSync(path.join(output, name + '.png'), command(['exec-out', 'screencap', '-p'], true));
    const pid = command(['shell', 'pidof', packageId]).trim();
    if (!pid) throw new Error('App process exited during native verification.');
    routes.push({ route: route || 'cold-start', expected: label, pid });
    console.log(`PASS ${route || 'cold-start'}: ${label}`);
  }
  await capture('', 'Hello, cake lover.', '01-home');
  await capture('shop', 'Blueberry Delight', '02-shop');
  await capture('product/31055', 'Blueberry Delight', '03-product');
  await capture('custom', 'The Cake Studio.', '04-custom');
  await capture('orders', 'Happy memories.', '05-orders');
  await capture('account', 'Your Cake City.', '06-account');
  await capture('register', 'Make it personal.', '07-register');
  await capture('cart', 'A bag full of happy.', '08-cart');
  await capture('checkout', 'The final sweet details.', '09-checkout');
  command(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
  await readScreen('A bag full of happy.');
  await capture('home', 'Hello, cake lover.', '10-home-final');
  const pid = command(['shell', 'pidof', packageId]).trim();
  const logs = command(['logcat', '-d', `--pid=${pid}`, '-s', 'AndroidRuntime:E', 'ReactNativeJS:E']);
  fs.writeFileSync(path.join(output, 'runtime-errors.txt'), logs);
  if (/FATAL EXCEPTION|ReactNativeJS.*(?:TypeError|ReferenceError|Error:)/.test(logs)) throw new Error('Native runtime errors were found; inspect runtime-errors.txt.');
  const result = { verified_at: new Date().toISOString(), apk, device: serial, package: packageId, standalone_cold_start: true, routes, back_navigation: true, process_survived: true };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  const manifestPath = path.join(path.dirname(apk), 'build-manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
    const sha256 = require('node:crypto').createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
    if (manifest.sha256.toLowerCase() !== sha256) throw new Error('APK differs from the build manifest.');
    fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, install_tested: true, tested_device: serial, tested_at: result.verified_at }, null, 2));
  }
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
