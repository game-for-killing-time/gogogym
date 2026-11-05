import {safeLook} from './appearance-model.mjs';
import {COLORS} from './evolution.mjs';
export const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
export const shade=(hex,n)=>'#'+hex.slice(1).match(/../g).map(s=>Math.max(0,Math.min(255,parseInt(s,16)+n)).toString(16).padStart(2,'0')).join('');
export function garmentStyle(raw){
 const look=safeLook(raw),o=look.outfit,top=o.top;
 const jacket=top.includes('jacket'),tee=top.includes('tee');
 const color=top==='top-01-basic-tank'?'#bcb9c9':top==='top-03-power-tank'?'#343744':top==='top-04-coral-tee'?'#de8175':top==='top-05-night-jacket'?'#35445f':top==='top-06-varsity-jacket'?'#333c52':COLORS[o.color].value;
 return {...look,top:color,light:shade(color,25),dark:shade(color,-34),ink:'#37313b',cream:'#eee1c6',jacket,tee,
  sleeve:top==='top-06-varsity-jacket'?'#e2d4b9':color,pants:o.bottom==='bottom-03-light-shorts'?'#d7ccb4':o.bottom==='bottom-02-training-joggers'?'#35424d':'#414259',
  joggers:o.bottom==='bottom-02-training-joggers',shoe:o.shoes==='shoes-02-navy-runners'?'#465875':'#e9e2dc',
  torso:[.82,.96,1.12,1.32,1.55][look.stage-1],bulk:[.72,.87,1.05,1.3,1.65][look.stage-1]};
}
function path(c,pts,fill,stroke,width=2){c.beginPath();pts.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.lineJoin='round';c.stroke();}}
function line(c,pts,color,width){c.beginPath();pts.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';c.lineCap='round';c.stroke();}
/** Four material corners follow the shoulders and hips in any pose. */
export function drawGarment(c,q,s,{back=false,unit=1}={}){
 const uv=(u,v)=>mix(mix(q[0],q[1],u),mix(q[3],q[2],u),v),poly=(pts,color,stroke)=>path(c,pts.map(p=>uv(...p)),color,stroke,unit*1.5),seam=(pts,color,width=1)=>line(c,pts.map(p=>uv(...p)),color,width*unit);
 c.save();path(c,q,s.top,s.ink,2*unit);c.beginPath();q.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.clip();
 poly([[0,0],[.15,.14],[.13,.74],[.28,1],[0,1]],s.dark);poly([[.18,.17],[.42,.12],[.38,.6],[.2,.72]],s.light);poly([[.86,0],[1,0],[1,1],[.74,.94]],s.dark);
 const top=s.outfit.top;
 if(top==='top-02-street-jacket'){
  poly([[0,.51],[.36,.64],[.43,1],[0,1]],s.cream);poly([[.65,.64],[1,.51],[1,1],[.59,1]],s.cream);
  if(!back)poly([[.43,0],[.58,0],[.6,1],[.42,1]],'#bcb9c9');
 }else if(top==='top-05-night-jacket'){seam([[.08,.31],[.49,.51],[.93,.31]],'#b6cad9',2.3);}
 if(s.jacket){
  seam([[.04,.96],[.96,.96]],s.cream,2);
  if(!back){
   if(top==='top-06-varsity-jacket'){seam([[.5,.08],[.5,.98]],s.cream,1.3);for(const v of [.24,.43,.62,.81]){const p=uv(.51,v);c.fillStyle=s.cream;c.fillRect(p[0]-unit,p[1]-unit,2*unit,2*unit);}}
   else{for(const x of top==='top-02-street-jacket'?[.42,.6]:[.5]){seam([[x,.03],[x,.98]],s.cream,1.8);seam([[x,.04],[x,.98]],s.ink,.65);const p=uv(x,.73);c.fillStyle=s.cream;c.fillRect(p[0],p[1],unit*1.5,unit*3);}}
   seam([[.16,.68],[.25,.84]],s.ink,1.4);seam([[.82,.68],[.73,.84]],s.ink,1.4);
  }else seam([[.15,.24],[.85,.24]],s.light,1.2);
  if(back)seam([[.27,.02],[.5,.1],[.73,.02]],s.cream,2);else{poly([[.27,0],[.39,-.04],[.5,.16],[.39,.24]],s.light,s.cream);poly([[.61,-.04],[.73,0],[.61,.24],[.5,.16]],s.dark,s.cream);}
 }else{
  seam([[.28,.02],[.34,back?.10:.19],[.5,back?.13:.25],[.68,back?.10:.19],[.74,.02]],top==='top-03-power-tank'?s.cream:s.dark,1.8);
  seam([[.12,.91],[.88,.91]],s.dark,1);
  if(s.tee){seam([[.29,.03],[.37,.16],[.53,.19],[.69,.12],[.75,.03]],s.light,1);}
 }
 seam([[.22,.55],[.45,.6],[.36,.66]],s.dark,.8);seam([[.66,.78],[.81,.74]],s.light,1);
 if(top==='top-06-varsity-jacket'&&!back){const p=uv(.75,.36);c.fillStyle=s.cream;c.fillRect(p[0],p[1],unit*3,unit*4);c.fillStyle=s.top;c.fillRect(p[0]+unit,p[1]+unit,unit*2,unit*2);}
 c.restore();
 if(s.outfit.accessory==='accessory-03-towel'){
  if(back){line(c,[uv(.2,.03),uv(.5,.14),uv(.8,.03)],s.ink,6*unit);line(c,[uv(.2,.03),uv(.5,.14),uv(.8,.03)],s.cream,4*unit);}
  else for(const u of [.23,.79]){const pts=[uv(u,-.04),uv(u-.02,.3),uv(u+.015,.67)];line(c,pts,s.ink,6*unit);line(c,pts,s.cream,4.4*unit);line(c,[uv(u-.05,.61),uv(u+.08,.61)],'#70bca0',unit);}
 }
}
export function clothSegment(c,a,b,width,color,{unit=1,cuff=false,stripe=false,stripeColor='#eee1c6'}={}){
 const length=Math.hypot(b[0]-a[0],b[1]-a[1])||1,pad=2*unit/length;const start=mix(a,b,-pad),end=mix(a,b,1+pad);a=start;b=end;
 const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,n=[-dy/len,dx/len],off=(p,w)=>[p[0]+n[0]*w,p[1]+n[1]*w];
 path(c,[off(a,width*.48),off(mix(a,b,.35),width*.55),off(b,width*.38),off(b,-width*.38),off(mix(a,b,.35),-width*.55),off(a,-width*.48)],color,'#37313b',unit*1.5);
 line(c,[off(mix(a,b,.13),-width*.22),off(mix(a,b,.65),-width*.2)],shade(color,24),unit*1.8);
 line(c,[off(mix(a,b,.55),width*.3),off(mix(a,b,.65),0)],shade(color,-32),unit);
 if(stripe)line(c,[off(a,-width*.34),off(b,-width*.25)],stripeColor,unit*1.5);
 if(cuff){line(c,[off(mix(a,b,.9),-width*.38),off(mix(a,b,.9),width*.38)],shade(color,-38),unit*3);line(c,[off(mix(a,b,.92),-width*.35),off(mix(a,b,.92),width*.35)],'#eee1c6',unit);}
}
export function wristband(c,a,b,width,unit=1){const p=mix(a,b,.87);clothSegment(c,p,mix(a,b,.99),width,'#74c5a6',{unit,cuff:true});}
