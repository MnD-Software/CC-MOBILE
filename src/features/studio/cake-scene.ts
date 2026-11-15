/**
 * Offline, original procedural WebGL cake. It is a design illustration of the
 * customer's choices (flavour, size, icing colour, message, candles and
 * extras), never a photograph or scan of the finished product. No third-party
 * models, textures or network requests are used.
 */

export type CakeLook = {
  sponge: string;
  filling: string;
  drip: string | null;
  fruit: "strawberry" | "cherry" | "berries" | null;
};

export type CakeDesign = {
  colour: string;
  message: string;
  candles: boolean;
  sprinkles?: boolean;
  /** Product name; used only to choose an illustrative flavour look. */
  flavour?: string;
  /** Cake weight parsed from the inventory size, if any. */
  sizeKg?: number | null;
  slice?: boolean;
  reduceMotion: boolean;
  backdrop?: [string, string];
};

export type CakeSceneConfig = Required<
  Omit<CakeDesign, "flavour" | "sizeKg" | "backdrop">
> & {
  look: CakeLook;
  sizeKg: number;
  backdrop: [string, string];
};

const LOOKS: [RegExp, CakeLook][] = [
  [
    /black\s*forest/i,
    { sponge: "#4A2A1E", filling: "#F6EEE6", drip: "#2E160F", fruit: "cherry" },
  ],
  [
    /red\s*velvet/i,
    { sponge: "#9A2431", filling: "#F7F0E7", drip: null, fruit: null },
  ],
  [
    /choc|cocoa|mocha|fudge|brownie|oreo|ganache/i,
    { sponge: "#553022", filling: "#3A1F16", drip: "#3A1D14", fruit: null },
  ],
  [
    /caramel|toffee|butterscotch|dulce/i,
    { sponge: "#E3BE88", filling: "#C08142", drip: "#B26A28", fruit: null },
  ],
  [
    /straw/i,
    { sponge: "#F5D9C9", filling: "#D2405A", drip: null, fruit: "strawberry" },
  ],
  [
    /berry|forest|fruit|passion|mango/i,
    { sponge: "#F2DDB0", filling: "#B8345A", drip: null, fruit: "berries" },
  ],
  [
    /lemon|lime|citrus/i,
    { sponge: "#F4DE86", filling: "#FFF0A8", drip: null, fruit: null },
  ],
  [
    /coffee|espresso|tiramisu/i,
    { sponge: "#8A5A3C", filling: "#DDB892", drip: null, fruit: null },
  ],
  [
    /carrot|spice|banana/i,
    { sponge: "#C98A4E", filling: "#F6EEE3", drip: null, fruit: null },
  ],
];
const VANILLA: CakeLook = {
  sponge: "#F1D9A2",
  filling: "#FFF4E4",
  drip: null,
  fruit: null,
};

export function cakeLook(name: string | null | undefined): CakeLook {
  const text = String(name || "");
  return LOOKS.find(([pattern]) => pattern.test(text))?.[1] ?? VANILLA;
}

/** Reads "1 Kg", "1.5kg", "Half kg", "500 g" style inventory sizes. */
export function cakeWeightKg(
  attributes: { value?: unknown }[] | null | undefined,
): number | null {
  if (!Array.isArray(attributes)) return null;
  for (const attribute of attributes) {
    const value =
      typeof attribute?.value === "string" ? attribute.value.trim() : "";
    if (!value) continue;
    if (/\b(half|½)\s*(a\s*)?kg/i.test(value)) return 0.5;
    const kg = value.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilo)/i);
    if (kg) return Number(kg[1]) || null;
    const grams = value.match(/(\d{3,4})\s*(g|gm|grams?)\b/i);
    if (grams) return Number(grams[1]) / 1000 || null;
  }
  return null;
}

const HEX = /^#[0-9a-f]{6}$/i;
const safeHex = (value: string | undefined, fallback: string) =>
  value && HEX.test(value) ? value : fallback;

export function cakeSceneConfig(design: CakeDesign): CakeSceneConfig {
  const kg = design.sizeKg && design.sizeKg > 0 ? design.sizeKg : 1;
  return {
    colour: safeHex(design.colour, "#FFF8EE"),
    message: String(design.message || "").slice(0, 32),
    candles: !!design.candles,
    sprinkles: !!design.sprinkles,
    slice: !!design.slice,
    reduceMotion: !!design.reduceMotion,
    look: cakeLook(design.flavour),
    sizeKg: Math.min(6, Math.max(0.25, kg)),
    backdrop: [
      safeHex(design.backdrop?.[0], "#FFFFFF"),
      safeHex(design.backdrop?.[1], "#F6E9EF"),
    ],
  };
}

/** JSON that is safe inside an inline <script> and an injected JS call. */
export function sceneJson(config: CakeSceneConfig) {
  return JSON.stringify(config)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Script injected into the native WebView to update the live scene. */
export function cakeSceneUpdate(config: CakeSceneConfig) {
  return `window.cakeUpdate&&window.cakeUpdate(${sceneJson(config)});true;`;
}

export function cakeScene(design: CakeDesign) {
  const config = cakeSceneConfig(design);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${config.backdrop[1]}}canvas{width:100%;height:100%;display:block;touch-action:none}#note{position:absolute;bottom:8px;left:10px;right:10px;text-align:center;font:600 11px system-ui,-apple-system,sans-serif;color:#71515b;pointer-events:none}</style></head><body><canvas id="c" role="img" aria-label="Interactive three dimensional cake design illustration"></canvas><div id="note"></div><script>var INITIAL=${sceneJson(config)};${SCENE_SCRIPT}</script></body></html>`;
}

// The renderer is plain WebGL 1 so it runs in every Android/iOS WebView offline.
// String.raw keeps GLSL/JS escapes intact; it must contain no template holes.
const SCENE_SCRIPT = String.raw`(function(){
var canvas=document.getElementById('c'),note=document.getElementById('note');
try{
var gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:false});
if(!gl){note.textContent='3D is unavailable on this device. Switch to the product photo.';return;}
var hp=gl.getShaderPrecisionFormat&&gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT);
var PREC=(hp&&hp.precision>0)?'highp':'mediump';
var PI=Math.PI,TAU=PI*2;
function sub(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
function add(a,b){return[a[0]+b[0],a[1]+b[1],a[2]+b[2]]}
function scl(a,s){return[a[0]*s,a[1]*s,a[2]*s]}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function nrm(a){var l=Math.sqrt(dot(a,a));return l<1e-10?[0,1,0]:scl(a,1/l)}
function lin(hex){hex=String(hex||'#ffffff').replace('#','');var v=[0,2,4].map(function(i){var x=parseInt(hex.slice(i,i+2),16);return isNaN(x)?1:Math.pow(x/255,2.2)});return v}
function luma(c){return .2126*c[0]+.7152*c[1]+.0722*c[2]}
function mixv(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]}
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function angDiff(a,b){var d=(a-b)%TAU;if(d<-PI)d+=TAU;if(d>PI)d-=TAU;return d}

function compile(kind,src){var s=gl.createShader(kind);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
function program(vs,fs){var p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,'precision '+PREC+' float;'+fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));var u={},a={},i,n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(i=0;i<n;i++){var info=gl.getActiveUniform(p,i);u[info.name]=gl.getUniformLocation(p,info.name)}n=gl.getProgramParameter(p,gl.ACTIVE_ATTRIBUTES);for(i=0;i<n;i++){var at=gl.getActiveAttrib(p,i);a[at.name]=gl.getAttribLocation(p,at.name)}return{p:p,u:u,a:a}}

var SQ='uniform vec3 uSquash;vec3 squash(vec3 w){w.y=uSquash.z+(w.y-uSquash.z)*uSquash.y;w.xz*=uSquash.x;return w;}';
var MESH=program(
'attribute vec3 aP;attribute vec3 aN;attribute vec3 aC;attribute vec2 aK;uniform mat4 uVP;uniform vec3 uS;uniform vec3 uT;uniform float uGrow;uniform float uTop;'+SQ+
'varying vec3 vN;varying vec3 vC;varying vec2 vK;varying vec3 vW;void main(){vec3 p=aP;if(p.y<uTop)p.y=uTop-(uTop-p.y)*uGrow;vec3 w=squash(p*uS+uT);vN=normalize(aN/(uS*vec3(uSquash.x,uSquash.y,uSquash.x)));vC=aC;vK=aK;vW=w;gl_Position=uVP*vec4(w,1.);}',
'varying vec3 vN;varying vec3 vC;varying vec2 vK;varying vec3 vW;uniform vec3 uEye;uniform vec3 uTint;uniform float uGloss;uniform float uSheen;uniform float uMetal;'+
'float h3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}'+
'vec3 env(vec3 r){float sky=smoothstep(-.35,1.,r.y);vec3 c=mix(vec3(.28,.2,.21),vec3(1.,.95,.93),sky);c+=vec3(2.4)*smoothstep(.8,.97,dot(r,normalize(vec3(-.55,.75,.45))));c+=vec3(1.3,1.2,1.3)*smoothstep(.88,.99,dot(r,normalize(vec3(.85,.35,-.3))));c+=vec3(1.,.55,.75)*smoothstep(.55,1.,-r.y)*.22;return c;}'+
'void main(){vec3 n=normalize(vN);vec3 v=normalize(uEye-vW);vec3 alb=mix(vC,vC*uTint,vK.x);'+
'if(vK.y>0.){float c=h3(floor(vW*150.));alb*=mix(1.,.7+.42*c,vK.y);if(c<.14)alb*=mix(1.,.5,vK.y);}else{alb*=.985+.03*h3(floor(vW*240.));}'+
'vec3 L1=normalize(vec3(-.55,.95,.6)),L2=normalize(vec3(.75,.35,-.55));float w=uSheen;float d1=max((dot(n,L1)+w)/(1.+w),0.);float d2=max((dot(n,L2)+w)/(1.+w),0.);'+
'vec3 amb=mix(vec3(.2,.15,.16),vec3(.56,.54,.58),.5+.5*n.y);vec3 col=alb*(amb+vec3(1.05,1.,.95)*d1*1.08+vec3(.55,.62,.82)*d2*.45);'+
'float nv=max(dot(n,v),0.);float fr=pow(1.-nv,5.);vec3 h=normalize(L1+v);col+=vec3(1.,.97,.93)*pow(max(dot(n,h),0.),mix(14.,280.,uGloss))*mix(.05,2.4,uGloss);'+
'vec3 R=env(reflect(-v,n));float k=clamp(uGloss*(.05+.95*fr)+uMetal*.75,0.,1.);col=mix(col,R*mix(vec3(1.),alb*1.7,uMetal),k*mix(.5,.85,uMetal));col+=alb*fr*.38*uSheen;'+
'col=(col*(2.51*col+.03))/(col*(2.43*col+.59)+.14);gl_FragColor=vec4(pow(clamp(col,0.,1.),vec3(1./2.2)),1.);}');

var SPRITE=program(
'attribute vec2 aUV;uniform mat4 uVP;uniform vec3 uC;uniform vec3 uAx;uniform vec3 uAy;uniform float uScreen;'+SQ+'varying vec2 vUV;varying vec3 vW;void main(){vUV=aUV;if(uScreen>.5){vW=vec3(0.);gl_Position=vec4(aUV,.9999,1.);return;}vec3 w=squash(uC+uAx*aUV.x+uAy*aUV.y);vW=w;gl_Position=uVP*vec4(w,1.);}',
'varying vec2 vUV;varying vec3 vW;uniform float uMode;uniform sampler2D uTex;uniform float uReveal;uniform float uTime;uniform vec3 uCol;uniform vec3 uCol2;uniform float uA;uniform vec3 uWedge;uniform float uAspect;'+
'void main(){vec2 p=vUV;'+
'if(uMode<.5){if(uWedge.x>.5){float d=abs(mod(atan(vW.z,vW.x)-uWedge.y+3.14159265,6.2831853)-3.14159265);if(d<uWedge.z)discard;}vec2 t=vec2(p.x*.5+.5,.5-p.y*.5);float e=1.-smoothstep(uReveal-.035,uReveal,t.x);gl_FragColor=texture2D(uTex,t)*e*uA;}'+
'else if(uMode<1.5){float fl=sin(uTime*17.+uCol.x*9.)*.5+sin(uTime*7.3+uCol.x*3.)*.5;p.x+=fl*.06*(p.y+1.);float wdt=max(.06,.5*(1.-(p.y+1.)*.42));float f=1.-length(vec2(p.x/wdt,(p.y+.3)/.72));float core=smoothstep(0.,.55,f);float inner=smoothstep(.45,.9,f);float g=exp(-dot(p,p)*2.6)*.4;vec3 c=mix(vec3(1.,.42,.08),vec3(1.,.93,.66),inner)*core*1.25+vec3(1.,.62,.28)*g;c+=vec3(.15,.25,.9)*smoothstep(.2,.6,f)*(1.-smoothstep(-.75,-.35,p.y))*.6;gl_FragColor=vec4(c*uA,0.);}'+
'else if(uMode<2.5){float d=length(p);float a=1.-smoothstep(0.,1.,d);a=a*a*uA;gl_FragColor=vec4(vec3(.17,.08,.1)*a,a);}'+
'else if(uMode<3.5){float a=exp(-abs(p.x)*14.)*exp(-abs(p.y)*1.6)+exp(-abs(p.y)*14.)*exp(-abs(p.x)*1.6)+exp(-dot(p,p)*9.)*.8;gl_FragColor=vec4(uCol*a*uA,0.);}'+
'else{vec2 q=vec2(p.x*uAspect,p.y)-vec2(0.,.12);float d=length(q*vec2(.62,1.05));vec3 c=mix(uCol,uCol2,smoothstep(.0,1.25,d));c=mix(c,uCol2*.93,(1.-smoothstep(-1.,.15,p.y))*.35);gl_FragColor=vec4(c,1.);}}');

var quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),gl.STATIC_DRAW);

// ---------- geometry ----------
function G(){return{p:[],n:[],c:[],k:[]}}
function vtx(g,p,n,c,k){g.p.push(p[0],p[1],p[2]);g.n.push(n[0],n[1],n[2]);g.c.push(c[0],c[1],c[2]);g.k.push(k[0],k[1])}
function fn(x){return typeof x==='function'?x:function(){return x}}
function grid(g,rows,cols,closed,pos,col,kk,ref){col=fn(col);kk=fn(kk);var P=[],N=[],i,j;
for(i=0;i<=rows;i++){P[i]=[];for(j=0;j<=cols;j++)P[i][j]=pos(i/rows,j/cols)}
for(i=0;i<=rows;i++){N[i]=[];for(j=0;j<=cols;j++){var i0=Math.max(0,i-1),i1=Math.min(rows,i+1),j0=j-1,j1=j+1;if(closed){if(j0<0)j0=cols-1;if(j1>cols)j1=1}else{j0=Math.max(0,j0);j1=Math.min(cols,j1)}
var n=cross(sub(P[i1][j],P[i0][j]),sub(P[i][j1],P[i][j0]));n=nrm(n);if(ref){var r=ref(P[i][j]);if(dot(n,sub(P[i][j],r))<0)n=scl(n,-1)}N[i][j]=n}}
for(i=0;i<rows;i++)for(j=0;j<cols;j++){var q=[[i,j],[i+1,j],[i+1,j+1],[i,j],[i+1,j+1],[i,j+1]];for(var t=0;t<6;t++){var a=q[t][0],b=q[t][1];vtx(g,P[a][b],N[a][b],col(a/rows,b/cols,P[a][b]),kk(a/rows,b/cols))}}}
function lathe(g,prof,a0,a1,rows,cols,col,kk,o){o=o||{};var closed=a1-a0>=TAU-1e-6,cx=o.x||0,cy=o.y||0,cz=o.z||0;
grid(g,rows,cols,closed,function(u,v){var th=a0+(a1-a0)*v,rp=prof(u,th),r=rp[0];return[cx+Math.cos(th)*r,cy+rp[1],cz+Math.sin(th)*r]},col,kk,o.ref||function(p){return[cx,cy+(o.refY||0),cz]})}
function sphere(g,x,y,z,r,col,kk,sy){lathe(g,function(u){var a=-PI/2+u*PI;return[Math.cos(a)*r,Math.sin(a)*r*(sy||1)]},0,TAU,10,16,col,kk,{x:x,y:y,z:z})}
function quadFace(g,a,b,c,d,n,col,k){vtx(g,a,n,col,k);vtx(g,b,n,col,k);vtx(g,c,n,col,k);vtx(g,a,n,col,k);vtx(g,c,n,col,k);vtx(g,d,n,col,k)}
function sprinkle(g,m,rot,len,c){var ax=[Math.cos(rot),0,Math.sin(rot)],side=[-Math.sin(rot),0,Math.cos(rot)],A=sub(m,scl(ax,len)),B=add(m,scl(ax,len)),rad=.0085;function ring(pp){return add(scl(side,Math.cos(pp)*rad),[0,Math.sin(pp)*rad,0])}for(var q=0;q<6;q++){var r0=ring(q/6*TAU),r1=ring((q+1)/6*TAU),n0=nrm(r0),n1=nrm(r1);vtx(g,add(A,r0),n0,c,[0,0]);vtx(g,add(B,r0),n0,c,[0,0]);vtx(g,add(B,r1),n1,c,[0,0]);vtx(g,add(A,r0),n0,c,[0,0]);vtx(g,add(B,r1),n1,c,[0,0]);vtx(g,add(A,r1),n1,c,[0,0])}}

var meshes=[],flames=[],state={},cur=null,target=null,anim={pop:9,slice:0,sliceT:0,drip:1,candle:1,sprinkle:1,fruit:1,reveal:1,revealFrom:0,revealTo:1,flames:1,sparks:[]};
var msgTex=gl.createTexture(),msgReady=false,msgCanvas=document.createElement('canvas');msgCanvas.width=1024;msgCanvas.height=512;

function upload(g,mat,kind,piece){if(!g.p.length)return;var m={count:g.p.length/3,mat:mat,kind:kind,piece:piece,b:{}};['p','n','c','k'].forEach(function(key){var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(g[key]),gl.STATIC_DRAW);m.b[key]=b});meshes.push(m)}
function clearMeshes(){meshes.forEach(function(m){for(var k in m.b)gl.deleteBuffer(m.b[k])});meshes=[];flames=[]}

var CREAM={gloss:.16,sheen:.62,metal:0},CUT={gloss:.03,sheen:.35,metal:0},BOARD={gloss:.78,sheen:0,metal:.9},GLAZE={gloss:.95,sheen:.06,metal:0},BERRY={gloss:.72,sheen:.2,metal:0},WAX={gloss:.42,sheen:.25,metal:0};

function build(cfg){clearMeshes();
var kg=cfg.sizeKg,R=Math.max(.78,Math.min(1.24,.98+.24*Math.log(kg)/Math.LN2)),H=Math.max(.78,Math.min(1.02,.86+.07*Math.log(kg)/Math.LN2)),b=.085,s=.05;
state={R:R,H:H,b:b};
var look=cfg.look,spongeC=lin(look.sponge),fillC=lin(look.filling),white=[1,1,1];
var wedge=cfg.slice?PI/3.6:0,wc=PI/2;state.wedge=wedge;state.wc=wc;
var ranges=cfg.slice?[{a0:wc+wedge/2,a1:wc-wedge/2+TAU,piece:'main'},{a0:wc-wedge/2,a1:wc+wedge/2,piece:'slice'}]:[{a0:0,a1:TAU,piece:'main'}];
function profR(y){if(y<=H-b)return R;var d=y-(H-b);return R-b+Math.sqrt(Math.max(0,b*b-d*d))}
function inPiece(th,r){if(!cfg.slice||r<.12)return'main';return Math.abs(angDiff(th,wc))<wedge/2?'slice':'main'}
var groups={};function grp(kind,piece){var key=kind+':'+piece;return groups[key]||(groups[key]={g:G(),kind:kind,piece:piece})}
// Gold board with a bevelled foil edge.
var Rb=R*1.2+.06,bg=G();lathe(bg,function(u){var pts=[[0,0],[Rb-.015,0],[Rb,-.012],[Rb,-.045],[Rb-.015,-.06]];var f=u*(pts.length-1),i=Math.min(pts.length-2,Math.floor(f)),t=f-i;return[pts[i][0]+(pts[i+1][0]-pts[i][0])*t,pts[i][1]+(pts[i+1][1]-pts[i][1])*t]},0,TAU,16,120,function(u,v,p){var r=Math.sqrt(p[0]*p[0]+p[2]*p[2]);return scl(lin('#E2BE72'),.9+.1*Math.sin(r*140))},[0,0],{refY:-.5});upload(bg,BOARD,'board','main');state.Rb=Rb;
ranges.forEach(function(rg){
 // Icing body with a hand-finished wobble and soft scraper lines.
 lathe(grp('body',rg.piece).g,function(u,th){var y,r;if(u<.45){y=u/.45*(H-b);r=R}else if(u<.75){var a=(u-.45)/.3*PI/2;r=R-b+b*Math.cos(a);y=H-b+b*Math.sin(a)}else{r=(R-b)*(1-(u-.75)/.25);y=H}var wob=1+(.005*Math.sin(3*th+1.3)+.003*Math.sin(7*th+.4))*Math.min(1,y/.2);return[r*wob,y]},rg.a0,rg.a1,44,Math.max(24,Math.round(180*(rg.a1-rg.a0)/TAU)),function(u,v,p){var ao=.74+.26*Math.min(1,p[1]/.16);return scl(white,ao*(1-.012*Math.sin(p[1]*95)))},[1,0],{refY:H*.4});
 // Bead border around the base.
 var nb=Math.round(TAU*R/.07);lathe(grp('body',rg.piece).g,function(u,th){var phi=u*TAU,bead=.042*(.55+.45*Math.pow(Math.abs(Math.sin(th*nb/2)),.6));return[R+.012+Math.cos(phi)*bead,.034+Math.sin(phi)*bead]},rg.a0,rg.a1,10,Math.max(16,Math.round(nb*7*(rg.a1-rg.a0)/TAU)),function(u){return scl(white,.82+.18*Math.max(0,Math.sin(u*TAU)))},[1,0],{ref:function(p){var a=Math.atan2(p[2],p[0]);return[Math.cos(a)*(R+.012),.034,Math.sin(a)*(R+.012)]}});
 // Glossy ganache or caramel drip over the crown.
 if(look.drip){var rd=rng(7),nd=Math.round(TAU*R/.12),dr=[];for(var k=0;k<nd;k++)dr.push({th:k/nd*TAU+rd()*.12,len:(.05+rd()*.27)*H,w:.035+rd()*.03});
  var e=.014;lathe(grp('drip',rg.piece).g,function(u,th){var d=.03;dr.forEach(function(q){var x=angDiff(th,q.th)/q.w;d=Math.max(d,q.len*Math.exp(-x*x))});var r,y;if(u<.32){r=(R-b)*u/.32;y=H+e}else if(u<.58){var a=PI/2-(u-.32)/.26*PI/2;r=R-b+(b+e)*Math.cos(a);y=H-b+(b+e)*Math.sin(a)}else{var t=(u-.58)/.42;y=H-b-d*t;r=R+e*(t>.86?Math.sqrt(Math.max(0,1-Math.pow((t-.86)/.14,2)))*1.25:1+.25*t)}return[r,y]},rg.a0,rg.a1,34,Math.max(24,Math.round(420*(rg.a1-rg.a0)/TAU)),lin(look.drip),[0,0],{refY:H*.4})}
 // Cut faces reveal sponge and filling layers.
 if(cfg.slice){[[rg.a0,1],[rg.a1,-1]].forEach(function(face){var th=face[0],n=scl([Math.sin(th),0,-Math.cos(th)],face[1]),dx=Math.cos(th),dz=Math.sin(th),g=grp('cut',rg.piece).g,Hi=H-s,layers=[[.27,spongeC,1],[.1,fillC,.15],[.26,spongeC,1],[.1,fillC,.15],[.27,spongeC,1]],ys=[0],acc=0;layers.forEach(function(l){acc+=l[0];ys.push(Math.min(Hi,acc*Hi))});for(var q=1;q<=6;q++)ys.push(H-b+b*q/6);ys.push(Hi,H);ys=ys.filter(function(y,i,a){return a.indexOf(y)===i}).sort(function(a,b){return a-b});
  function P(r,y){return[dx*r,y,dz*r]}function layerAt(y){var a=0;for(var i=0;i<layers.length;i++){a+=layers[i][0]*Hi;if(y<=a+1e-6)return layers[i]}return layers[layers.length-1]}
  for(var i=0;i<ys.length-1;i++){var y0=ys[i],y1=ys[i+1],m=(y0+y1)/2,o0=profR(y0),o1=profR(y1);if(m<Hi){var L=layerAt(m);quadFace(g,P(0,y0),P(o0-s,y0),P(o1-s,y1),P(0,y1),n,L[1],[0,L[2]]);quadFace(g,P(o0-s,y0),P(o0,y0),P(o1,y1),P(o1-s,y1),n,white,[1,0])}else quadFace(g,P(0,y0),P(o0,y0),P(o1,y1),P(0,y1),n,white,[1,0])}})}
});
// Piped star rosettes around the crown.
var rr=R-.075,nr=Math.max(14,Math.round(TAU*rr/.155)),size=.064;for(var i=0;i<nr;i++){var th=i/nr*TAU,x=Math.cos(th)*rr,z=Math.sin(th)*rr,top=look.drip?H+.012:H;
 lathe(grp('rosette',inPiece(th,rr)).g,function(u,t){var r=size*Math.pow(1-u,.75)*(.72+.28*Math.sin(Math.min(1,u*2.6)*PI/2));r*=1+.2*Math.cos(8*t+u*5.5)*(1-u*.55);return[r,u*size*1.3]},0,TAU,12,32,function(u){return scl(white,.86+.14*u)},[1,0],{x:x,y:top-.006,z:z})}
// Layout of decorations on top.
var hasMsg=!!cfg.message,ring=R-.23,items=[];
var nCandles=cfg.candles?(R<.9?6:8):0,fruitN=look.fruit?(hasMsg?(nCandles?nCandles:9):(look.fruit==='cherry'?7:8)):0;
for(i=0;i<nCandles;i++)items.push({kind:'candle',th:i/nCandles*TAU+PI/nCandles*.0+.2,r:ring});
if(look.fruit){if(hasMsg||nCandles){for(i=0;i<fruitN;i++)items.push({kind:'fruit',th:(i+.5)/fruitN*TAU+.2,r:ring+(nCandles?0:.02)})}else{items.push({kind:'fruit',th:0,r:0});for(i=0;i<fruitN-1;i++)items.push({kind:'fruit',th:i/(fruitN-1)*TAU,r:.26*R})}}
var topY=look.drip?H+.014:H;state.topY=topY;
items.forEach(function(it,idx){var x=Math.cos(it.th)*it.r,z=Math.sin(it.th)*it.r,piece=inPiece(it.th,it.r);
 if(it.kind==='candle'){var g=grp('candle',piece).g,cc=lin(['#F06BB0','#5BC7E6','#F4C95D','#B78BE0'][idx%4]),ch=.36;lathe(g,function(u,t){return u<.92?[.024,u/.92*ch]:[.024*(1-(u-.92)/.08),ch]},0,TAU,14,18,function(u,v){var stripe=((v*2+u*4.2)%1)<.5;return stripe?cc:[.98,.96,.94]},[0,0],{x:x,y:topY,z:z,refY:ch/2});lathe(g,function(u){return[.004,u*.035]},0,TAU,2,6,[.08,.06,.05],[0,0],{x:x,y:topY+ch,z:z});flames.push({p:[x,topY+ch+.075,z],piece:piece,seed:idx})}
 else{var fg=grp('fruit',piece).g,ft=look.fruit==='berries'?(idx%2?'blue':'straw'):look.fruit;
  if(ft==='straw'||ft==='strawberry'){var sz=.07;lathe(fg,function(u){var r=sz*Math.pow(Math.max(0,Math.sin(PI*(.15+.85*u))),.6)*(1-u*.3);return[r,u*sz*1.55]},0,TAU,14,18,function(u,v){var seed=Math.abs(Math.sin(u*61+v*131))>.985;return seed?lin('#F2D88C'):mixv(lin('#C8102E'),lin('#E8384F'),u)},[0,0],{x:x,y:topY-.01,z:z,refY:.04});for(var l=0;l<4;l++){var la=l/4*TAU+idx;sphere(fg,x+Math.cos(la)*.035,topY+.004,z+Math.sin(la)*.035,.026,lin('#3E8E41'),[0,0],.25)}}
  else if(ft==='cherry'){sphere(fg,x,topY+.05,z,.05,lin('#6E0B1A'),[0,0]);lathe(fg,function(u){return[.004,u*.09]},0,TAU,2,6,lin('#5B4A1E'),[0,0],{x:x+.01,y:topY+.09,z:z})}
  else{sphere(fg,x,topY+.03,z,.034,lin('#2F3A73'),[0,0]);sphere(fg,x+.045,topY+.028,z+.02,.03,lin('#3B4890'),[0,0])}}});
// Sprinkles scattered on the crown.
if(cfg.sprinkles){var rs=rng(3),pal=['#EC008C','#F4C95D','#51C4DC','#A7E2B8','#BE87C5','#FFFFFF'];for(i=0;i<240;i++){var a=rs()*TAU,rad=hasMsg?ring-.06+rs()*.12:Math.sqrt(rs())*(R-.16),rot=rs()*PI,len=.028,c=lin(pal[i%pal.length]);sprinkle(grp('sprinkle',inPiece(a,rad)).g,[Math.cos(a)*rad,topY+.01,Math.sin(a)*rad],rot,len,c)}}
for(var key in groups){var gr=groups[key],mat=gr.kind==='drip'?GLAZE:gr.kind==='cut'?CUT:gr.kind==='fruit'?BERRY:gr.kind==='candle'||gr.kind==='sprinkle'?WAX:CREAM;upload(gr.g,mat,gr.kind,gr.piece)}
drawMessage(cfg);}

function drawMessage(cfg){var x=msgCanvas.getContext('2d');x.clearRect(0,0,1024,512);var text=cfg.message;state.msg=text;if(!text){msgReady=false;return}
var top=cfg.look.drip?lin(cfg.look.drip):lin(cfg.colour),pipe=luma(top)<.22?'#FFF6EC':cfg.look.drip?'#FFF6EC':'#5A2C22';
var words=text.split(/\s+/),lines=[text],fs=170,fam='"Snell Roundhand","Segoe Script","Brush Script MT","Dancing Script",cursive';
function fit(){x.font='italic 700 '+fs+'px '+fam;return lines.every(function(l){return x.measureText(l).width<900})}
while(fs>70&&!fit())fs-=6;if(!fit()&&words.length>1){var half=Math.ceil(words.length/2);lines=[words.slice(0,half).join(' '),words.slice(half).join(' ')];fs=150;while(fs>48&&!fit())fs-=6}
x.textAlign='center';x.textBaseline='middle';x.lineJoin='round';var lh=fs*1.05,y0=256-(lines.length-1)*lh/2;
lines.forEach(function(l,i){var y=y0+i*lh;x.fillStyle='rgba(40,14,10,.28)';x.fillText(l,516,y+7);x.strokeStyle=pipe;x.lineWidth=fs*.11;x.strokeText(l,512,y);x.fillStyle=pipe;x.fillText(l,512,y);x.save();x.globalCompositeOperation='source-atop';var gr=x.createLinearGradient(0,y-fs/2,0,y+fs/2);gr.addColorStop(0,'rgba(255,255,255,.55)');gr.addColorStop(.45,'rgba(255,255,255,0)');x.fillStyle=gr;x.fillRect(0,y-fs/2,1024,fs);x.restore()});
var w=0;lines.forEach(function(l){w=Math.max(w,x.measureText(l).width)});state.msgX0=Math.max(0,(512-w/2-20)/1024);state.msgX1=Math.min(1,(512+w/2+20)/1024);
gl.bindTexture(gl.TEXTURE_2D,msgTex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,msgCanvas);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);msgReady=true}

// ---------- camera & interaction ----------
var cam={yaw:-.5,pitch:.42,zoom:1,vy:0,ty:null,tp:null},pointers={},pinch=null,lastTap=0,downAt=null,idle=0;
function eye(){var asp=canvas.clientWidth/Math.max(1,canvas.clientHeight),d=(3.2+2.1*(state.R||1))*cam.zoom*Math.max(1,1.45/asp),tY=(state.H||.9)*.36;return{e:[Math.sin(cam.yaw)*Math.cos(cam.pitch)*d,tY+Math.sin(cam.pitch)*d,Math.cos(cam.yaw)*Math.cos(cam.pitch)*d],t:[0,tY,0]}}
function persp(f,a,n,fa){var t=1/Math.tan(f/2),nf=1/(n-fa);return[t/a,0,0,0,0,t,0,0,0,0,(fa+n)*nf,-1,0,0,2*fa*n*nf,0]}
function look(e,c){var z=nrm(sub(e,c)),x=nrm(cross([0,1,0],z)),y=cross(z,x);return{m:[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,e),-dot(y,e),-dot(z,e),1],x:x,y:y}}
function mul(a,b){var o=new Array(16);for(var i=0;i<4;i++)for(var j=0;j<4;j++){var s=0;for(var k=0;k<4;k++)s+=a[k*4+j]*b[i*4+k];o[i*4+j]=s}return o}
canvas.addEventListener('pointerdown',function(e){canvas.setPointerCapture&&canvas.setPointerCapture(e.pointerId);pointers[e.pointerId]=[e.clientX,e.clientY];idle=0;cam.vy=0;cam.ty=null;var ids=Object.keys(pointers);if(ids.length===2){var a=pointers[ids[0]],b=pointers[ids[1]];pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1]),z:cam.zoom}}else downAt={x:e.clientX,y:e.clientY,t:performance.now()};wake()});
canvas.addEventListener('pointermove',function(e){var p=pointers[e.pointerId];if(!p)return;var ids=Object.keys(pointers);if(ids.length>=2&&pinch){pointers[e.pointerId]=[e.clientX,e.clientY];var a=pointers[ids[0]],b=pointers[ids[1]];cam.zoom=Math.max(.62,Math.min(1.5,pinch.z*pinch.d/Math.max(20,Math.hypot(a[0]-b[0],a[1]-b[1]))));wake();return}var dx=e.clientX-p[0],dy=e.clientY-p[1];pointers[e.pointerId]=[e.clientX,e.clientY];cam.yaw-=dx*.011;cam.vy=-dx*.011;cam.pitch=Math.max(.08,Math.min(1.05,cam.pitch+dy*.006));idle=0;wake()});
function up(e){delete pointers[e.pointerId];if(Object.keys(pointers).length<2)pinch=null;if(downAt&&Math.hypot(e.clientX-downAt.x,e.clientY-downAt.y)<8&&performance.now()-downAt.t<260){var now=performance.now();if(now-lastTap<320){cam.ty=-.5;cam.tp=.42;cam.zoom=1}else{poke()}lastTap=now}downAt=null}
canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
canvas.addEventListener('wheel',function(e){e.preventDefault();cam.zoom=Math.max(.62,Math.min(1.5,cam.zoom*(1+e.deltaY*.001)));wake()},{passive:false});
function poke(){if(cur&&!cur.reduceMotion){anim.pop=0;sparkle(10)}}
function sparkle(n){if(cur&&cur.reduceMotion)return;var r=rng((performance.now()|0)+n);for(var i=0;i<n;i++){var a=r()*TAU,d=(state.R||1)*(.4+r()*.8);anim.sparks.push({p:[Math.cos(a)*d,(state.H||.9)*(.5+r()*.9),Math.sin(a)*d],t:-r()*.25,c:[[1,.86,.45],[1,1,1],[1,.5,.78]][i%3]})}}

// ---------- updates from the app ----------
function apply(cfg){if(!cfg||typeof cfg!=='object')return;var prev=cur;cur=cfg;
var structural=!prev||prev.sizeKg!==cfg.sizeKg||prev.slice!==cfg.slice||prev.candles!==cfg.candles||prev.sprinkles!==cfg.sprinkles||JSON.stringify(prev.look)!==JSON.stringify(cfg.look);
var motion=!cfg.reduceMotion&&!!prev;
if(structural){build(cfg);if(motion){anim.pop=0;if(cfg.candles&&!prev.candles){anim.candle=0;anim.flames=0}if(cfg.sprinkles&&!prev.sprinkles)anim.sprinkle=0;if(cfg.look.fruit&&prev.look.fruit!==cfg.look.fruit)anim.fruit=0;if(cfg.look.drip&&prev.look.drip!==cfg.look.drip)anim.drip=0;sparkle(14)}
 if(cfg.slice!==(prev&&prev.slice)){anim.slice=cfg.slice?1:0;if(!motion)anim.sliceT=anim.slice;if(cfg.slice){cam.ty=Math.round(cam.yaw/TAU)*TAU+.32;cam.tp=.5}}}
else if(prev.message!==cfg.message){var old=prev.message||'';drawMessage(cfg);var x0=state.msgX0||0,x1=state.msgX1||1;anim.revealTo=x1;anim.revealFrom=motion?(old&&cfg.message.indexOf(old)===0?x0+(x1-x0)*old.length/Math.max(1,cfg.message.length):x0):x1;anim.reveal=motion?0:1}
if(!prev){anim.revealFrom=anim.revealTo=1;anim.reveal=1}
target={tint:lin(cfg.colour)};if(!state.tint||!motion)state.tint=target.tint.slice();if(prev&&prev.colour!==cfg.colour&&motion)sparkle(8);
note.textContent='';canvas.setAttribute('aria-label','Interactive 3D cake illustration'+(cfg.message?', message '+cfg.message:'')+(cfg.candles?', with candles':'')+(cfg.slice?', slice view':''));wake()}
window.cakeUpdate=apply;window.addEventListener('message',function(e){var d=e&&e.data;if(d&&d.type==='cake-config')apply(d.config)});

// ---------- render loop ----------
var frame=null,last=0,time=0;
function wake(){if(!frame&&!document.hidden){last=performance.now();frame=requestAnimationFrame(draw)}}
function ease(t){t=Math.min(1,Math.max(0,t));return 1-Math.pow(1-t,3)}
function bounce(t){t=Math.min(1,Math.max(0,t));var n=7.5625,d=2.75;if(t<1/d)return n*t*t;if(t<2/d)return n*(t-=1.5/d)*t+.75;if(t<2.5/d)return n*(t-=2.25/d)*t+.9375;return n*(t-=2.625/d)*t+.984375}
function useMesh(m){var A=MESH.a;[['aP','p',3],['aN','n',3],['aC','c',3],['aK','k',2]].forEach(function(x){gl.bindBuffer(gl.ARRAY_BUFFER,m.b[x[1]]);gl.enableVertexAttribArray(A[x[0]]);gl.vertexAttribPointer(A[x[0]],x[2],gl.FLOAT,false,0,0)})}
function draw(now){frame=null;var dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;time+=dt;idle+=dt;var reduce=cur&&cur.reduceMotion,busy=false;
var dpr=Math.min(window.devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h){return}if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
gl.viewport(0,0,canvas.width,canvas.height);
// Motion state
if(!pointers||!Object.keys(pointers).length){if(cam.ty!=null){cam.yaw+=(cam.ty-cam.yaw)*(reduce?1:1-Math.exp(-dt*6));cam.pitch+=(cam.tp-cam.pitch)*(reduce?1:1-Math.exp(-dt*6));if(Math.abs(cam.ty-cam.yaw)<.002){cam.ty=null}busy=true}else if(Math.abs(cam.vy)>.0004&&!reduce){cam.yaw+=cam.vy;cam.vy*=Math.pow(.9,dt*60);busy=true}else if(!reduce&&idle>2.5){cam.yaw+=dt*.24;busy=true}}
if(state.tint&&target){var k=reduce?1:1-Math.exp(-dt*8);for(var i=0;i<3;i++)state.tint[i]+=(target.tint[i]-state.tint[i])*k;if(Math.abs(state.tint[0]-target.tint[0])+Math.abs(state.tint[1]-target.tint[1])+Math.abs(state.tint[2]-target.tint[2])>.002)busy=true}
['candle','sprinkle','fruit','drip','flames'].forEach(function(key){if(anim[key]<1){anim[key]=Math.min(1,anim[key]+dt*(key==='drip'?.7:key==='flames'?1.2:1.4));busy=true}});
if(anim.pop<1.4){anim.pop+=dt;busy=true}
if(anim.reveal<1){anim.reveal=Math.min(1,anim.reveal+dt/Math.max(.35,Math.min(1.5,(anim.revealTo-anim.revealFrom)*3)));busy=true}
if(Math.abs(anim.sliceT-anim.slice)>.001){anim.sliceT+=(anim.slice-anim.sliceT)*(reduce?1:1-Math.exp(-dt*5));busy=true}else anim.sliceT=anim.slice;
anim.sparks=anim.sparks.filter(function(s){s.t+=dt;return s.t<.9});if(anim.sparks.length)busy=true;
var pt=anim.pop,sq=reduce||pt>=1.4?0:Math.sin(pt*PI*3.2)*Math.exp(-pt*3.6)*.07,squash=[1+sq*.5,1-sq,-.06];
var E=eye(),L=look(E.e,E.t),VP=mul(persp(.52,w/h,.1,40),L.m);
// Backdrop
gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.disable(gl.BLEND);gl.useProgram(SPRITE.p);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(SPRITE.a.aUV);gl.vertexAttribPointer(SPRITE.a.aUV,2,gl.FLOAT,false,0,0);
var bg=cur?cur.backdrop:['#FFFFFF','#F6E9EF'];gl.uniform1f(SPRITE.u.uScreen,1);gl.uniform1f(SPRITE.u.uMode,4);gl.uniform1f(SPRITE.u.uAspect,w/h);gl.uniform3fv(SPRITE.u.uCol,lin(bg[0]).map(function(c){return Math.pow(c,1/2.2)}));gl.uniform3fv(SPRITE.u.uCol2,lin(bg[1]).map(function(c){return Math.pow(c,1/2.2)}));gl.drawArrays(gl.TRIANGLES,0,6);
gl.uniform1f(SPRITE.u.uScreen,0);gl.uniformMatrix4fv(SPRITE.u.uVP,false,VP);gl.uniform3fv(SPRITE.u.uSquash,squash);
// Contact shadow
gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);var Rs=(state.Rb||1.3)*1.32;gl.uniform1f(SPRITE.u.uMode,2);gl.uniform1f(SPRITE.u.uA,.42);gl.uniform3fv(SPRITE.u.uC,[0,-.062,0]);gl.uniform3fv(SPRITE.u.uAx,[Rs,0,0]);gl.uniform3fv(SPRITE.u.uAy,[0,0,Rs]);gl.drawArrays(gl.TRIANGLES,0,6);
gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.clear(gl.DEPTH_BUFFER_BIT);
// Cake
gl.useProgram(MESH.p);gl.uniformMatrix4fv(MESH.u.uVP,false,VP);gl.uniform3fv(MESH.u.uEye,E.e);gl.uniform3fv(MESH.u.uTint,state.tint||[1,1,1]);gl.uniform3fv(MESH.u.uSquash,squash);
var st=ease(anim.sliceT),off=[Math.cos(state.wc||0)*.42*(state.R||1)*st,.05*st,Math.sin(state.wc||0)*.42*(state.R||1)*st];
meshes.forEach(function(m){var T=m.piece==='slice'?off.slice():[0,0,0];if(m.kind==='candle')T[1]+=(1-bounce(anim.candle))*.9;if(m.kind==='sprinkle')T[1]+=(1-ease(anim.sprinkle))*.7;if(m.kind==='fruit')T[1]+=(1-bounce(anim.fruit))*.6;
 gl.uniform3fv(MESH.u.uT,T);gl.uniform3fv(MESH.u.uS,[1,1,1]);gl.uniform1f(MESH.u.uGrow,m.kind==='drip'?ease(anim.drip):1);gl.uniform1f(MESH.u.uTop,m.kind==='drip'?(state.H-state.b):-99);gl.uniform1f(MESH.u.uGloss,m.mat.gloss);gl.uniform1f(MESH.u.uSheen,m.mat.sheen);gl.uniform1f(MESH.u.uMetal,m.mat.metal);useMesh(m);gl.drawArrays(gl.TRIANGLES,0,m.count)});
[MESH.a.aN,MESH.a.aC,MESH.a.aK].forEach(function(a){gl.disableVertexAttribArray(a)});
// Piped message, flames and sparkles
gl.useProgram(SPRITE.p);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(SPRITE.a.aUV);gl.vertexAttribPointer(SPRITE.a.aUV,2,gl.FLOAT,false,0,0);gl.enable(gl.BLEND);gl.depthMask(false);
if(msgReady&&cur&&cur.message){var mw=(state.R-.33)*(cur.candles||cur.look.fruit?1:1.18);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,msgTex);gl.uniform1i(SPRITE.u.uTex,0);gl.uniform1f(SPRITE.u.uMode,0);gl.uniform1f(SPRITE.u.uA,1);gl.uniform1f(SPRITE.u.uReveal,anim.revealFrom+(anim.revealTo-anim.revealFrom)*ease(anim.reveal)+(anim.reveal>=1?1:0));gl.uniform3fv(SPRITE.u.uWedge,[cur.slice&&anim.sliceT>.02?1:0,state.wc||0,(state.wedge||0)/2]);gl.uniform3fv(SPRITE.u.uC,[0,(state.topY||1)+.004,0]);gl.uniform3fv(SPRITE.u.uAx,[mw,0,0]);gl.uniform3fv(SPRITE.u.uAy,[0,0,-mw/2]);gl.drawArrays(gl.TRIANGLES,0,6)}
gl.blendFunc(gl.ONE,gl.ONE);
if(cur&&cur.candles&&anim.candle>=1){var fa=ease(anim.flames);flames.forEach(function(f){var T=f.piece==='slice'?off:[0,0,0],c=add(f.p,T),sz=.055*(1+(reduce?0:.08*Math.sin(time*11+f.seed*2.1)));gl.uniform1f(SPRITE.u.uMode,1);gl.uniform1f(SPRITE.u.uTime,reduce?0:time);gl.uniform3fv(SPRITE.u.uCol,[f.seed,0,0]);gl.uniform1f(SPRITE.u.uA,fa);gl.uniform3fv(SPRITE.u.uC,c);gl.uniform3fv(SPRITE.u.uAx,scl(L.x,sz*.75));gl.uniform3fv(SPRITE.u.uAy,scl(L.y,sz*1.5));gl.drawArrays(gl.TRIANGLES,0,6)});busy=busy||!reduce}
anim.sparks.forEach(function(s){if(s.t<0)return;var life=s.t/.9,a=Math.sin(life*PI),sz=.06+.07*life;gl.uniform1f(SPRITE.u.uMode,3);gl.uniform1f(SPRITE.u.uA,a);gl.uniform3fv(SPRITE.u.uCol,s.c);gl.uniform3fv(SPRITE.u.uC,add(s.p,[0,life*.15,0]));gl.uniform3fv(SPRITE.u.uAx,scl(L.x,sz));gl.uniform3fv(SPRITE.u.uAy,scl(L.y,sz));gl.drawArrays(gl.TRIANGLES,0,6)});
gl.depthMask(true);gl.disable(gl.BLEND);
if(busy||Object.keys(pointers).length)frame=requestAnimationFrame(draw)}
window.addEventListener('resize',wake);if(window.ResizeObserver)new ResizeObserver(wake).observe(canvas);document.addEventListener('visibilitychange',function(){if(document.hidden&&frame){cancelAnimationFrame(frame);frame=null}else wake()});
apply(INITIAL);
}catch(err){note.textContent='3D preview could not start. Switch to the product photo.'}
})();`;
