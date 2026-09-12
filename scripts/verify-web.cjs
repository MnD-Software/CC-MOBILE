// One-pass smoke/visual check of a real Expo export in a disposable Edge profile.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(process.argv[2] || 'artifacts/export');
const output = path.resolve('artifacts/visual-qa');
const port = Number(process.env.CAKECITY_QA_PORT || 8097);
const debugPort = Number(process.env.CAKECITY_CDP_PORT || 9322);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const types = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.ttf':'font/ttf'};
const server = http.createServer((request,response) => {
  try {
    const requested = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    let file = path.resolve(root,'.'+requested);
    if (!file.startsWith(root+path.sep) && file!==root) { response.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file=path.join(root,'index.html');
    response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
    fs.createReadStream(file).pipe(response);
  } catch { response.writeHead(500).end(); }
});
async function main() {
  fs.mkdirSync(output,{recursive:true});
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  let target;
  for(let i=0;i<60;i++) {
    try { target=(await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t=>t.type==='page'); } catch {}
    if(target)break;
    await pause(500);
  }
  if(!target)throw new Error('Start a disposable headless Edge instance on the configured debugging port.');
  const socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let sequence=0;
  const pending=new Map();const exceptions=[];
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text);
    const item=pending.get(message.id);
    if(item){clearTimeout(item.timer);pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},20000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
  async function waitFor(expression,label) {
    for(let i=0;i<80;i++){if(await evaluate(expression))return;await pause(500);}
    throw new Error('Timed out waiting for '+label+': '+await evaluate('document.body.innerText.slice(0,1200)'));
  }
  const routes=[];
  async function visit(route,label) {
    await send('Page.navigate',{url:`http://127.0.0.1:${port}${route}`});
    await waitFor(`document.body.innerText.includes(${JSON.stringify(label)})`,route);
    const text=await evaluate('document.body.innerText');
    if(text.includes('could not display this screen'))throw new Error('Error boundary on '+route);
    routes.push(route);
  }
  async function capture(name) {
    const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(result.data,'base64'));
  }
  try {
    await send('Page.enable');await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await visit('/','Hello, cake lover.');
    await waitFor("document.body.innerText.includes('Blueberry Delight')",'live homepage product');
    await pause(1000);await capture('01-home-mobile');
    await visit('/shop','Find your happy.');
    await waitFor("document.body.innerText.includes('Blueberry Delight')",'live shop results');
    await capture('02-shop-mobile');
    await visit('/product/31055','Made for your moment');
    await waitFor("document.body.innerText.includes('Blueberry Delight')",'live product details');
    await capture('03-product-mobile');
    await visit('/custom','The Cake Studio.');
    await visit('/orders','Happy memories.');
    await waitFor("document.body.innerText.includes('Sign in')",'guest account gate');
    await visit('/account','Your Cake City.');
    await visit('/register','Make it personal.');await capture('04-register-mobile');
    await visit('/cart','A bag full of happy.');
    await visit('/checkout','The final sweet details.');
    await waitFor("document.body.innerText.includes('Sign in')",'checkout authentication gate');
    await send('Emulation.setDeviceMetricsOverride',{width:834,height:1112,deviceScaleFactor:1,mobile:true});
    await visit('/shop','Find your happy.');
    await waitFor("document.body.innerText.includes('Blueberry Delight')",'tablet catalogue');
    await capture('05-shop-tablet');
    if(exceptions.length)throw new Error('Unhandled browser exceptions: '+exceptions.join(', '));
    const result={routes,unhandled_exceptions:exceptions.length,screenshots:5,api_configured:false,real_catalogue:true};
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  } finally {
    await send('Browser.close').catch(()=>undefined);
    socket.close();server.close();
  }
}
main().catch(error=>{console.error(error.message);server.close();process.exitCode=1;});
