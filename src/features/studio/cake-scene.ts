/** Offline, original WebGL geometry. A design illustration, never a claimed product scan. */
export function cakeScene({
  colour,
  message,
  candles,
  caramel,
  reduceMotion,
}: {
  colour: string;
  message: string;
  candles: boolean;
  caramel: boolean;
  reduceMotion: boolean;
}) {
  const config = JSON.stringify({
    colour,
    message,
    candles,
    caramel,
    reduceMotion,
  }).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f8f0e9}canvas{width:100%;height:100%;display:block;touch-action:none}#note{position:absolute;bottom:7px;left:8px;right:8px;text-align:center;font:500 11px system-ui;color:#71515b;pointer-events:none}</style></head><body><canvas aria-label="Interactive three dimensional cake design"></canvas><div id="note"></div><script>
const config=${config},canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:false});
if(!gl){document.getElementById('note').textContent='3D is unavailable here. Switch to the product photo.';}else{
const vs='attribute vec3 p;attribute vec3 n;attribute vec3 c;uniform float yaw;uniform float pitch;uniform float aspect;varying vec3 N;varying vec3 C;varying vec3 P;void main(){mat3 ry=mat3(cos(yaw),0.,sin(yaw),0.,1.,0.,-sin(yaw),0.,cos(yaw));mat3 rx=mat3(1.,0.,0.,0.,cos(pitch),sin(pitch),0.,-sin(pitch),cos(pitch));vec3 v=rx*ry*p;N=rx*ry*n;C=c;P=v;float z=4.4-v.z;gl_Position=vec4(v.x*2.8/aspect,v.y*2.8,1.00669*z-.200669,z);}';
const fs='precision mediump float;varying vec3 N;varying vec3 C;varying vec3 P;void main(){vec3 normal=normalize(N);vec3 light=normalize(vec3(-.6,1.,1.8));float diffuse=max(dot(normal,light),0.);float spec=pow(max(dot(reflect(-light,normal),normalize(vec3(0.,0.,4.)-P)),0.),38.);float grain=sin(P.x*177.)*sin(P.y*193.)*sin(P.z*181.)*.012;vec3 color=C*(.48+.52*diffuse)+vec3(.30)*spec+grain;gl_FragColor=vec4(color,1.);}';
function shader(kind,source){let s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);return s}const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);gl.useProgram(program);gl.enable(gl.DEPTH_TEST);gl.clearColor(.973,.941,.914,1);
const vertices=[],normals=[],colors=[];const hex=config.colour.replace('#',''),cream=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);
function triangle(a,b,c,n,col){for(const v of [a,b,c]){vertices.push(...v);normals.push(...n);colors.push(...col)}}
function cylinder(radius,bottom,top,col,x=0,z=0,segments=96){for(let i=0;i<segments;i++){let a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2,m=(a+b)/2;let p=[x+Math.cos(a)*radius,bottom,z+Math.sin(a)*radius],q=[x+Math.cos(b)*radius,bottom,z+Math.sin(b)*radius],r=[q[0],top,q[2]],s=[p[0],top,p[2]];triangle(p,q,r,[Math.cos(m),0,Math.sin(m)],col);triangle(p,r,s,[Math.cos(m),0,Math.sin(m)],col);triangle([x,top,z],s,r,[0,1,0],col);}}
// A bevelled board, soft cream body and a finely rounded icing edge.
cylinder(1.24,-.59,-.53,[.79,.69,.48]);cylinder(1.18,-.53,-.51,[.96,.89,.74]);cylinder(1.02,-.51,.47,cream);cylinder(1.015,.47,.50,cream.map(c=>Math.min(1,c*1.025)));
// Caramel is a white cream cake with a restrained caramel crown and irregular drips.
if(config.caramel){cylinder(.91,.501,.507,[.71,.40,.17]);for(let i=0;i<18;i++){let a=i/18*Math.PI*2,h=.05+(Math.sin(i*7.2)+1)*.08;cylinder(.035,.48-h,.49,[.73,.43,.19],Math.cos(a)*1.007,Math.sin(a)*1.007,12);}}
// Small piped cream rosettes around the crown.
for(let i=0;i<24;i++){let a=i/24*Math.PI*2,x=Math.cos(a)*.90,z=Math.sin(a)*.90;for(let j=0;j<4;j++)cylinder(.074-j*.014,.50+j*.024,.526+j*.024,cream,x,z,14);}
if(config.candles)for(let i=0;i<9;i++){let a=i/9*Math.PI*2,x=Math.cos(a)*.72,z=Math.sin(a)*.72;cylinder(.018,.53,.88,[.85,.25,.53],x,z,12);cylinder(.004,.88,.91,[.25,.18,.15],x,z,6);}
function buffer(name,data){let b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);let attr=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,3,gl.FLOAT,false,0,0)}buffer('p',vertices);buffer('n',normals);buffer('c',colors);
let yaw=-.25,pitch=.39,drag=null,frame=null;
function draw(){frame=null;const d=Math.min(window.devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==w*d||canvas.height!==h*d){canvas.width=w*d;canvas.height=h*d;}gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(gl.getUniformLocation(program,'yaw'),yaw);gl.uniform1f(gl.getUniformLocation(program,'pitch'),pitch);gl.uniform1f(gl.getUniformLocation(program,'aspect'),w/h);gl.drawArrays(gl.TRIANGLES,0,vertices.length/3);}
function render(){if(!frame)frame=requestAnimationFrame(draw)}canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)};canvas.onpointermove=e=>{if(!drag)return;yaw+=(e.clientX-drag[0])*.012;pitch=Math.max(.1,Math.min(.75,pitch+(e.clientY-drag[1])*.006));drag=[e.clientX,e.clientY];render()};canvas.onpointerup=()=>{drag=null};canvas.onpointercancel=()=>{drag=null};window.addEventListener('resize',render);document.addEventListener('visibilitychange',()=>{if(document.hidden&&frame){cancelAnimationFrame(frame);frame=null}else render()});
document.getElementById('note').textContent=config.message||'Drag to turn · design illustration';render();}
</script></body></html>`;
}
