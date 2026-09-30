import fs from 'node:fs/promises';

const debugPort = Number(process.env.CAKECITY_CDP_PORT ?? 9222);
const outputDir = process.argv[2];

if (!outputDir) throw new Error('Screenshot output directory is required.');

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function findPageTarget() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    for (const host of ['127.0.0.1', '[::1]']) {
      try {
        const targets = await fetch(`http://${host}:${debugPort}/json/list`).then(response => response.json());
        const target = targets.find(candidate => candidate.type === 'page');
        if (target?.webSocketDebuggerUrl) return target;
      } catch {
        // Edge may still be starting or listening on the other loopback family.
      }
    }
    await sleep(500);
  }
  throw new Error('Timed out waiting for the Edge debugging target.');
}

const target = await findPageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let commandId = 0;
const pending = new Map();

socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result ?? {});
});

function send(method, params = {}) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Browser evaluation failed.');
  return result.result?.value;
}

async function waitFor(expression, label, timeout = 180_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function clickElement(expression, label) {
  const clicked = await evaluate(`(() => { const element = ${expression}; if (!element) return false; element.click(); return true; })()`);
  if (!clicked) throw new Error(`Could not find ${label}.`);
}

async function capture(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile(`${outputDir}/${name}.png`, Buffer.from(result.data, 'base64'));
}

await fs.mkdir(outputDir, { recursive: true });
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
  screenWidth: 390,
  screenHeight: 844,
});
const alreadyHome = await evaluate(`document.body?.innerText.includes('Bestsellers')`);
if (!alreadyHome) {
  await send('Page.navigate', { url: 'http://127.0.0.1:8088/sign-in' });
  await waitFor(`document.body?.innerText.includes('Preview full customer flow')`, 'the preview sign-in action');
  await clickElement(
    `Array.from(document.querySelectorAll('[role="button"]')).find(element => element.innerText?.includes('Preview full customer flow'))`,
    'the preview sign-in action',
  );
}
await waitFor(`document.body?.innerText.includes('Bestsellers')`, 'the Cake City home screen');
await waitFor(`document.querySelectorAll('[aria-label^="View "]').length > 0`, 'the home product rail', 120_000);
await sleep(3_000);
await capture('01-home');

await clickElement(
  `document.querySelector('[aria-label="Categories tab"]')`,
  'the Categories tab',
);
await waitFor(`document.body?.innerText.includes('Birthday Cakes') && document.body?.innerText.includes('Accessories')`, 'the category grid');
await sleep(5_000);
await capture('02-categories');

await clickElement(
  `Array.from(document.querySelectorAll('[role="button"]')).find(element => element.innerText?.trim() === 'Chocolate Cakes')`,
  'the Chocolate Cakes category',
);
await waitFor(`document.querySelectorAll('[aria-label^="View "]').length > 0`, 'the cake product grid');
await sleep(5_000);
await capture('03-cakes');

await clickElement(`document.querySelector('[aria-label^="View "]')`, 'the first cake product');
await waitFor(`document.body?.innerText.includes('Product Details') && document.body?.innerText.includes('Add to Cart')`, 'product details');
await sleep(2_000);
await capture('04-product-details');
await waitFor(`document.body?.innerText.includes('Complete your celebration')`, 'the party accessory pairing');
await evaluate(`(() => {
  const target = Array.from(document.querySelectorAll('*')).find(element => element.textContent?.trim() === 'Complete your celebration');
  target?.scrollIntoView({ block: 'center' });
})()`);
await sleep(2_000);
await capture('04b-accessory-pairing');

await clickElement(`document.querySelector('[aria-label="Close"]')`, 'the product details close action');
await waitFor(`!document.body?.innerText.includes('Product Details')`, 'product details to close');
await clickElement(
  `document.querySelector('[aria-label="Orders tab"]')`,
  'the Orders tab',
);
await waitFor(`document.body?.innerText.includes('Upcoming') && document.body?.innerText.includes('Order #')`, 'the orders screen');
await capture('05-orders');

console.log(JSON.stringify({ outputDir, screens: 6 }));
await send('Browser.close');
