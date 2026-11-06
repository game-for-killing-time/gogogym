import {garmentStyle} from './garments.mjs';

// Wrist anchors in the original 1086 × 1448 atlas. Each stride has a different arm pose.
const wrists = [
  [[151,223],[253,223]], [[492,205],[599,207]], [[827,224],[928,197]],
  [[210,577]], [[495,553],[580,565]], [[847,544],[926,557]],
  [[191,943]], [[485,930],[580,911]], [[850,928],[924,908]],
  [[153,1303],[254,1303]], [[492,1285],[596,1294]], [[832,1303],[928,1273]]
];
const cache = new WeakMap();
const rgb = hex => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const clamp = value => Math.max(0,Math.min(1,value));
const canvas = (width,height) => Object.assign(document.createElement('canvas'),{width,height});

function dressedFrame(atlas,frame,index,look) {
  const cloth=garmentStyle(look), {outfit}=cloth;
  const bitmap=canvas(frame.w,frame.h), ctx=bitmap.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(atlas,frame.x,frame.y,frame.w,frame.h,0,0,frame.w,frame.h);
  const pixels=ctx.getImageData(0,0,frame.w,frame.h), data=pixels.data;
  const top=rgb(cloth.top), sleeve=rgb(cloth.sleeve), pants=rgb(cloth.pants), shoes=rgb(cloth.shoe);
  const mint=rgb('#80c8aa'), cream=rgb(cloth.cream), side=index>=3&&index<9;
  const wristPoints=wrists[index].map(([x,y])=>[x*atlas.width/1086-frame.x,y*atlas.height/1448-frame.y]);
  for(let y=0;y<frame.h;y++){
    const v=y/frame.h;
    for(let x=0;x<frame.w;x++){
      const i=4*(y*frame.w+x);
      if(data[i+3]<80)continue;
      const [r,g,b]=[data[i],data[i+1],data[i+2]], light=.3*r+.59*g+.11*b;
      const u=x/frame.w, skin=r>g*1.09&&r>b*1.22;
      let dye=null, reference=185;
      if(v>.365&&v<.615&&!skin&&light>55&&b>=g*.94&&outfit.top!=='top-01-basic-tank'){
        dye=top;
        if(index<3&&cloth.jacket&&Math.abs(u-.5)<.014)dye=cream;
        if(outfit.top==='top-05-night-jacket'&&Math.abs(v-(.51-.13*Math.abs(u-.5)))<.009)dye=cream;
      }
      if((cloth.jacket||cloth.tee)&&skin&&v>.385&&v<(cloth.jacket?.70:.49)){
        const arm=side||Math.abs(u-.5)>.13;
        const hand=wristPoints.some(([wx,wy])=>Math.abs(x-wx)<frame.h*.075&&y>=wy);
        if(arm&&!hand){dye=sleeve;reference=205;}
      }
      if(v>.575&&v<.83&&!skin&&light>28&&light<125&&b>r&&outfit.bottom!=='bottom-01-navy-shorts'){
        dye=pants;reference=75;
      }
      if(cloth.joggers&&v>.67&&v<.88&&skin){dye=pants;reference=207;}
      if(v>.83&&outfit.shoes==='shoes-02-navy-runners'&&!skin&&light>60){dye=shoes;reference=186;}
      if(outfit.accessory==='accessory-02-wristbands'&&skin&&wristPoints.some(([wx,wy])=>Math.abs(x-wx)<frame.h*.063&&Math.abs(y-wy)<frame.h*.014)){dye=mint;reference=202;}
      if(dye){const k=Math.max(.32,Math.min(1.3,light/reference));for(let j=0;j<3;j++)data[i+j]=dye[j]*k;}
    }
  }
  ctx.putImageData(pixels,0,0);
  ctx.globalCompositeOperation='source-atop';
  function seam(points,color,width){
    ctx.beginPath();points.forEach(([u,v],i)=>ctx[i?'lineTo':'moveTo'](u*frame.w,v*frame.h));
    ctx.strokeStyle=color;ctx.lineWidth=width*frame.h;ctx.lineCap='round';ctx.stroke();
  }
  if(outfit.accessory==='accessory-01-headband'){
    const band=[[.04,.181],[.49,.195],[.94,.175]];
    seam(band,'#4a4946',.032);seam(band,cloth.cream,.025);seam(band,'#81c1a6',.009);
  }
  if(outfit.accessory==='accessory-03-towel'){
    const ends=index>=9?[[[.29,.399],[.46,.419],[.68,.399]]]:side?[[[.48,.387],[.51,.431],[.49,.536]]]:[[[.345,.397],[.36,.458],[.342,.554]],[[.645,.397],[.65,.46],[.665,.544]]];
    for(const end of ends){seam(end,'#605953',.042);seam(end,cloth.cream,.031);}
  }
  if(cloth.stage===1)return bitmap;
  const factor=[0,.11,.23,.37,.53][cloth.stage-1], fitted=canvas(Math.ceil(frame.w*(1+factor)),frame.h);
  const dest=fitted.getContext('2d');dest.imageSmoothingEnabled=false;
  for(let y=0;y<frame.h;y++){
    const v=y/frame.h, shoulder=clamp((v-.35)/.075), waist=clamp((v-.5)/.17);
    const weight=shoulder*(1-.38*waist)*(1-.65*clamp((v-.78)/.13));
    const w=Math.round(frame.w*(1+weight*factor));
    dest.drawImage(bitmap,0,y,frame.w,1,Math.round((fitted.width-w)/2),y,w,1);
  }
  return fitted;
}

export function drawWalkSprite(ctx,x,y,dir,time,moving,atlas,frames,look,sprint=false){
  const step=moving?1+Math.floor(time*(sprint?11:7))%2:0, index=dir*3+step, frame=frames[index];
  if(!frame)return;
  const o=look?.outfit;
  const plain=!o||(look.stage===1&&o.top==='top-01-basic-tank'&&o.bottom==='bottom-01-navy-shorts'&&o.shoes==='shoes-01-white-trainers'&&o.accessory==='none');
  let image=atlas, crop=frame;
  if(!plain){
    let framesByLook=cache.get(atlas);
    if(!framesByLook){framesByLook=new Map();cache.set(atlas,framesByLook);}
    const key=[look.stage,o.top,o.bottom,o.shoes,o.accessory,o.color,index].join('/');
    image=framesByLook.get(key);
    if(!image){
      image=dressedFrame(atlas,frame,index,look);
      if(framesByLook.size>=160)framesByLook.delete(framesByLook.keys().next().value);
      framesByLook.set(key,image);
    }
    crop={x:0,y:0,w:image.width,h:image.height};
  }
  const h=103,w=Math.round(h*crop.w/crop.h);
  ctx.drawImage(image,crop.x,crop.y,crop.w,crop.h,Math.round(x-w/2),Math.round(y-h),w,h);
}
