import { CELEBRATION_DURATION } from "./celebration-motion";

/** One offline drawing surface rather than thousands of native animated views. */
export function confettiCanvasHtml() {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"><style>html,body,canvas{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;pointer-events:none}</style></head><body><canvas id="celebration"></canvas><script>
(() => {
  'use strict';
  const canvas = document.getElementById('celebration'), ctx = canvas.getContext('2d', {alpha:true});
  if (!ctx) return;
  const colors=['#EC008C','#EAC46B','#FFF1C2','#51C4DC','#F58FC5','#BE87C5','#A7E2B8'];
  const pieces=Array.from({length:5000},(_,i)=>({
    color:colors[i%colors.length], side:i%2, rain:i%4!==0,
    delay:((i*37)%160)/1000, energy:0.55+((i*17)%45)/100,
    spread:0.3+((i*29)%90)/100, phase:i*2.399963,
    x:((i*7919)%5000)/5000, depth:((i*3571)%5003)/5003,
    size:2.2+(i%7)*0.55, ribbon:i%17===0
  }));
  let w=1,h=1,origin=0,frame=0,started=false;
  function resize(){w=innerWidth;h=innerHeight;const d=Math.min(devicePixelRatio||1,1.5);canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);}
  resize();addEventListener('resize',resize);
  function draw(now){
    const elapsed=(now-origin)/${CELEBRATION_DURATION};ctx.clearRect(0,0,w,h);
    if(elapsed>=1||document.hidden){frame=0;return;}
    for(const p of pieces){
      const t=(elapsed-p.delay)/(.98-p.delay);if(t<=0||t>=1)continue;
      const rise=Math.min(h*.82,620)*p.energy;
      const arc=t<.22?-rise*(1-Math.pow(1-t/.22,3)):-rise+(h+rise)*Math.pow((t-.22)/.78,1.48);
      const flutter=Math.sin(t*10+p.phase)*(12+p.size*3)*Math.sin(Math.PI*t);
      const x=p.rain?p.x*w+flutter:(p.side?w-8:8)+(p.side?-1:1)*w*p.spread*(1-Math.exp(-3*t))+flutter;
      const y=p.rain?-h*(.1+p.depth*.8)+h*2.1*Math.pow(t,.95):h*.68+arc;
      if(x< -30||x>w+30||y< -40||y>h+40)continue;
      const flip=.22+Math.abs(Math.cos(t*11+p.phase))*.78;
      ctx.globalAlpha=Math.min(1,t/.035,(1-t)/.17)*.92;
      ctx.fillStyle=p.color;
      ctx.save();ctx.translate(x,y);ctx.rotate(p.phase+t*(p.side?-5:5));ctx.scale(flip,1);
      ctx.fillRect(-p.size/2,-p.size,p.size,p.ribbon?p.size*3.8:p.size*1.65);ctx.restore();
    }
    ctx.globalAlpha=1;frame=requestAnimationFrame(draw);
  }
  window.startConfetti=function(progress){
    if(started)return;started=true;origin=performance.now()-Math.max(0,Math.min(1,Number(progress)||0))*${CELEBRATION_DURATION};frame=requestAnimationFrame(draw);
  };
  addEventListener('message',e=>{if(e.source===parent&&e.data&&e.data.type==='celebration-start')window.startConfetti(e.data.progress)});
  addEventListener('pagehide',()=>cancelAnimationFrame(frame));
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);ctx.clearRect(0,0,w,h)}});
})();
</script></body></html>`;
}
