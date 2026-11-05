import {defaultOutfit} from './evolution.mjs';
import {garmentStyle} from './garments.mjs';
export const ASSETS='assets/evolution/v1/';
const images=new Map(),portraits=new Map();
export function imageAsset(url){if(!images.has(url))images.set(url,new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>{images.delete(url);reject(Error('角色素材載入失敗，請重試。'));};im.src=url;}));return images.get(url);}
const rgb=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16));
const canvas=()=>{const c=document.createElement('canvas');c.width=1024;c.height=1536;return c;};
/** Authored garments retain shading. Width profiles fit the five physiques while
 * preserving head, pose registration and foot anchors. Originals remain untouched. */
export async function characterPortrait(stage=1,facing='front',outfit=defaultOutfit()){
 stage=Math.max(1,Math.min(5,Math.round(stage)));facing=facing==='back'?'back':'front';
 const key=JSON.stringify([stage,facing,outfit]);if(portraits.has(key))return portraits.get(key);
 const pending=(async()=>{
  const style=garmentStyle({v:1,stage,outfit}),fitted=style.jacket||style.tee||style.joggers,sourceStage=fitted?3:stage;
  const upper=style.jacket?`${ASSETS}characters/c01-stage-03-street-jacket-${facing}.png`:style.tee?`assets/evolution/v2/characters/c01-tee-joggers-${facing}.png`:`${ASSETS}characters/c01-stage-0${sourceStage}-${facing}.png`;
  const lower=style.joggers?`assets/evolution/v2/characters/c01-tee-joggers-${facing}.png`:`${ASSETS}characters/c01-stage-0${sourceStage}-${facing}.png`;
  const [topImage,bottomImage]=await Promise.all([imageAsset(upper),imageAsset(lower)]),c=canvas(),ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(topImage,0,0,1024,1536);if(lower!==upper){ctx.clearRect(0,815,1024,721);ctx.drawImage(bottomImage,0,815,1024,721,0,815,1024,721);}
  const data=ctx.getImageData(0,0,1024,1536),px=data.data;
  const recolor=(i,color,base)=>{const col=rgb(color),lum=px[i]*.3+px[i+1]*.59+px[i+2]*.11,f=Math.max(.28,Math.min(1.28,lum/base));for(let k=0;k<3;k++)px[i+k]=Math.min(255,Math.round(col[k]*f));};
  for(let y=440;y<1430;y++)for(let x=100;x<930;x++){
   const i=(y*1024+x)*4;if(px[i+3]<100)continue;const r=px[i],g=px[i+1],b=px[i+2],lum=r*.3+g*.59+b*.11,skin=r>g*1.12&&r>b*1.23;
   if(style.jacket&&y<815&&lum>40&&(y>=470||g>r*1.1&&g>b*1.02)&&(y<734||x>375&&x<650)&&!(y<550&&x>448&&x<596)){
    const green=g>r*1.1&&g>b*1.02,inside=x>230&&x<790;
    if(outfit.top==='top-02-street-jacket'){if(green&&outfit.color!=='mint')recolor(i,style.top,165);}
    else if(inside){const sleeve=x<395||x>635;recolor(i,outfit.top==='top-06-varsity-jacket'&&sleeve?style.cream:style.top,green?160:195);}
   }
   if(outfit.top==='top-03-power-tank'&&y>480+(sourceStage===1?60:0)&&y<815+(sourceStage===1?40:0)&&!skin&&x>290&&x<740&&lum>45)recolor(i,style.top,175);
   if(outfit.bottom==='bottom-03-light-shorts'&&y>=815+(sourceStage===1?40:0)&&y<1040&&x>280&&x<750&&!skin&&lum>45)recolor(i,style.pants,95);
   if(outfit.shoes==='shoes-02-navy-runners'&&y>1285&&lum>90)recolor(i,style.shoe,200);
  }
  ctx.putImageData(data,0,0);
  if(style.jacket&&outfit.top!=='top-02-street-jacket'){
   const back=facing==='back';ctx.strokeStyle=style.cream;ctx.lineWidth=5;
   if(outfit.top==='top-05-night-jacket'){ctx.beginPath();ctx.moveTo(418,572);ctx.lineTo(512,625);ctx.lineTo(609,572);ctx.stroke();}
   if(outfit.top==='top-06-varsity-jacket'&&!back){for(const y of [588,646,704,762]){ctx.fillStyle=style.cream;ctx.beginPath();ctx.arc(490,y,5,0,Math.PI*2);ctx.fill();}ctx.font='bold 30px sans-serif';ctx.fillStyle=style.cream;ctx.fillText('G',601,584);}
  }
  const headShift=sourceStage===1?45:0;
  if(outfit.accessory==='accessory-01-headband'){
   ctx.strokeStyle='#37313b';ctx.lineWidth=25;ctx.beginPath();ctx.moveTo(408,306+headShift);ctx.quadraticCurveTo(510,325+headShift,620,305+headShift);ctx.stroke();ctx.strokeStyle=style.cream;ctx.lineWidth=17;ctx.stroke();ctx.strokeStyle='#73b99f';ctx.lineWidth=4;ctx.stroke();
  }
  if(outfit.accessory==='accessory-02-wristbands'){
   const xs=sourceStage===1?[333,691]:sourceStage===5?[205,812]:sourceStage===4?[253,764]:[291,720];
   for(const x of xs){ctx.save();ctx.translate(x,846+(sourceStage===1?36:0));ctx.rotate(x<500?.2:-.2);ctx.fillStyle=style.ink;ctx.fillRect(-33,-14,66,32);ctx.fillStyle='#73c5a6';ctx.fillRect(-30,-11,60,26);ctx.fillStyle=style.cream;ctx.fillRect(-30,-2,60,5);ctx.restore();}
  }
  if(outfit.accessory==='accessory-03-towel'){
   const y=sourceStage===1?565:510;
   const stroke=(w,col)=>{ctx.strokeStyle=col;ctx.lineWidth=w;ctx.lineCap='round';ctx.beginPath();if(facing==='back'){ctx.moveTo(436,y);ctx.quadraticCurveTo(510,y+52,583,y);}else{ctx.moveTo(446,y);ctx.quadraticCurveTo(435,y+74,445,y+176);ctx.moveTo(584,y);ctx.quadraticCurveTo(600,y+84,587,y+185);}ctx.stroke();};stroke(37,style.ink);stroke(29,style.cream);if(facing==='front'){ctx.strokeStyle='#73b99f';ctx.lineWidth=6;for(const [x,z]of [[445,y+154],[588,y+162]]){ctx.beginPath();ctx.moveTo(x-13,z);ctx.lineTo(x+13,z);ctx.stroke();}}
  }
  if(!fitted||stage===3)return c;
  const result=canvas(),r=result.getContext('2d');r.imageSmoothingEnabled=false;
  const body=[.74,.87,1,1.19,1.40][stage-1],waist=[.84,.92,1,1.12,1.25][stage-1],legs=[.80,.90,1,1.15,1.31][stage-1],ankle=[.93,.97,1,1.05,1.10][stage-1];
  const knots=[[0,1],[440,1],[550,body],[680,body],[815,waist],[1010,legs],[1230,legs],[1300,ankle],[1536,ankle]];
  for(let y=0;y<1536;y+=2){let j=0;while(j<knots.length-2&&y>knots[j+1][0])j++;const [ya,a]=knots[j],[yb,b]=knots[j+1],k=a+(b-a)*(y-ya)/(yb-ya);r.drawImage(c,0,y,1024,2,512-512*k,y,1024*k,2);}
  return result;
 })();portraits.set(key,pending);pending.catch(()=>portraits.delete(key));if(portraits.size>16)portraits.delete(portraits.keys().next().value);return pending;
}
export async function paintPortrait(canvas,stage,facing,outfit){const token={};canvas.renderToken=token;try{const image=await characterPortrait(stage,facing,outfit);if(canvas.renderToken!==token||!canvas.isConnected)return;canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);canvas.dispatchEvent(new Event('portraitready'));}catch(e){if(canvas.isConnected){canvas.setAttribute('aria-label',e.message);canvas.dispatchEvent(new CustomEvent('portraiterror',{detail:e.message}));}}}
