// C01 exercise poses. Sprite heads retain the approved character identity;
// articulated bodies use two-world-pixel clusters so every pose follows input.
// Draw props first. Active P04 omits its upper bar; P03 omits its fixed bar
// (atlas-relative y 70..134) while retaining the two rack posts.
const P={ink:'#332d35',skin:'#e7b487',skinLight:'#f4cda0',skinShade:'#b77b60',
  shirt:'#cbd0c4',shirtLight:'#e9e8d8',shirtShade:'#8f9c98',
  shorts:'#354858',shortsLight:'#516776',shortsShade:'#283542',
  shoe:'#e7e5d8',shoeShade:'#aeb6ae',metal:'#a8a5a4',metalLight:'#ded7bd',
  plate:'#494653',plateLight:'#706b77'};
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number.isFinite(v)?v:0));
const snap=v=>Math.round(v/2)*2;

function box(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(snap(x),snap(y),Math.max(2,snap(w)),Math.max(2,snap(h)));}
function stroke(c,a,b,width,color){
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]))/2));
  for(let i=0;i<=steps;i++){
    const t=i/steps;box(c,a[0]+(b[0]-a[0])*t-width/2,a[1]+(b[1]-a[1])*t-width/2,width,width,color);
  }
}
function shape(c,points,color,outline=true){
  const minY=snap(Math.min(...points.map(p=>p[1]))), maxY=snap(Math.max(...points.map(p=>p[1])));
  for(let y=minY;y<maxY;y+=2){
    const hits=[];
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];
      if((a[1]<=y+1&&b[1]>y+1)||(b[1]<=y+1&&a[1]>y+1)) hits.push(a[0]+(y+1-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    }
    hits.sort((a,b)=>a-b);
    for(let i=0;i+1<hits.length;i+=2)box(c,hits[i],y,hits[i+1]-hits[i],2,color);
  }
  if(outline)for(let i=0;i<points.length;i++)stroke(c,points[i],points[(i+1)%points.length],2,P.ink);
}
function limb(c,a,b,width=10,near=true){
  stroke(c,a,b,width+4,P.ink);stroke(c,a,b,width,near?P.skin:P.skinShade);
  if(near)stroke(c,[a[0]-2,a[1]-2],[b[0]-2,b[1]-2],Math.max(2,width-6),P.skinLight);
}
function shoe(c,x,y,dir=1){
  const left=dir<0?x-11:x-7;
  shape(c,[[left+3,y-8],[left+12,y-8],[left+17,y-2],[left+17,y+4],[left,y+4],[left,y-2]],P.shoe);
  box(c,left+2,y+1,13,3,P.shoeShade);box(c,left+5,y-5,5,2,'#fff3d7');
}
function head(c,art,frames,frame,x,y,height=31,widthHeight=height){
  const r=frames[frame];if(!r)return;
  const cropH=Math.round(r.h*.37),width=widthHeight*r.w/cropH;
  c.drawImage(art.actor,r.x,r.y,r.w,cropH,Math.round(x-width/2),Math.round(y),Math.round(width),height);
}
function shadow(c,x,y,w=70){
  c.save();c.globalAlpha=.22;
  box(c,x-w/2+6,y-3,w-12,8,'#1c2029');box(c,x-w/2,y,w,4,'#1c2029');c.restore();
}
function bar(c,y,width=130){
  const edge=width/2;
  box(c,-edge-3,y-3,width+6,8,P.ink);box(c,-edge,y-1,width,4,P.metal);
  box(c,-edge+4,y-1,width-8,2,P.metalLight);
  for(const side of [-1,1]){
    for(const [offset,h,w] of [[edge-14,30,10],[edge-5,24,7]]){
      const x=side<0?-offset-w:offset;
      shape(c,[[x+2,y-h/2],[x+w-2,y-h/2],[x+w,y-h/2+4],[x+w,y+h/2-4],[x+w-2,y+h/2],[x+2,y+h/2],[x,y+h/2-4],[x,y-h/2+4]],P.plate);
      box(c,x+2,y-h/2+4,2,h-8,P.plateLight);
    }
  }
  box(c,-34,y,7,2,P.plateLight);box(c,28,y,7,2,P.plateLight);
}
function shorts(c,points){
  shape(c,points,P.shorts);const left=Math.min(...points.map(p=>p[0])),top=Math.min(...points.map(p=>p[1]));
  box(c,left+4,top+4,10,4,P.shortsLight);
}

function bench(c,s,art,frames){
  const lift=clamp(s.height),barY=-51-lift*40;
  // Foreshortened upper body lies on the cushion; feet stay on the floor.
  shadow(c,0,0,78);
  limb(c,[-12,-26],[-29,-13],12,false);limb(c,[12,-26],[29,-13],12);
  limb(c,[-29,-13],[-30,2],10,false);limb(c,[29,-13],[31,2],10);
  shoe(c,-33,6,-1);shoe(c,34,6,1);
  shorts(c,[[-20,-39],[20,-39],[23,-23],[9,-19],[0,-25],[-10,-19],[-23,-23]]);
  shape(c,[[-22,-56],[20,-56],[22,-46],[15,-34],[-15,-34],[-22,-45]],P.shirt);
  shape(c,[[-10,-53],[10,-53],[13,-43],[7,-37],[-11,-38]],P.shirtLight,false);
  box(c,14,-49,5,11,P.shirtShade);box(c,-14,-38,24,3,P.shirtShade);
  limb(c,[-16,-54],[-32,-43-lift*23],11,false);
  limb(c,[-32,-43-lift*23],[-32,barY],9,false);
  limb(c,[16,-54],[33,-43-lift*23],11);
  limb(c,[33,-43-lift*23],[32,barY],9);
  head(c,art,frames,0,0,-78,24,30);
  bar(c,barY,132);
  // Fingers remain in front of the bar at both ends of the lift.
  box(c,-36,barY-2,9,6,P.skinShade);box(c,-34,barY-2,5,4,P.skinLight);
  box(c,29,barY-2,9,6,P.skinShade);box(c,29,barY-2,5,4,P.skinLight);
}
function row(c,s,art,frames){
  const pull=clamp(s.extension),hipX=13+pull*16,shoulderX=hipX-7+pull*15;
  const hipY=-33,shoulderY=-67,handX=-28+pull*53,handY=-53+pull*5;
  // Fixed footplate, sliding seat, and handle cable make the stroke readable.
  shadow(c,hipX,-5,68);
  box(c,hipX-12,hipY+8,28,8,P.ink);box(c,hipX-10,hipY+8,24,4,P.plateLight);
  limb(c,[hipX-1,hipY],[-8,-42+pull*13],12,false);limb(c,[-8,-42+pull*13],[-34,-20],10,false);
  shoe(c,-38,-18,-1);
  limb(c,[hipX+5,hipY+4],[-3,-32+pull*10],12);limb(c,[-3,-32+pull*10],[-29,-15],10);
  shoe(c,-32,-11,-1);
  shorts(c,[[hipX-10,hipY-9],[hipX+13,hipY-8],[hipX+15,hipY+7],[hipX-5,hipY+11],[hipX-14,hipY+2]]);
  shape(c,[[shoulderX-10,shoulderY],[shoulderX+12,shoulderY+2],[hipX+12,hipY-5],[hipX-9,hipY-4]],P.shirt);
  shape(c,[[shoulderX-6,shoulderY+3],[shoulderX+5,shoulderY+5],[hipX+4,hipY-9],[hipX-7,hipY-8]],P.shirtLight,false);
  stroke(c,[shoulderX+10,shoulderY+8],[hipX+10,hipY-8],4,P.shirtShade);
  const elbowX=shoulderX-18+pull*17,elbowY=-45;
  limb(c,[shoulderX-4,shoulderY+5],[elbowX,elbowY],9,false);
  limb(c,[elbowX,elbowY],[handX,handY],8,false);
  limb(c,[shoulderX+7,shoulderY+8],[elbowX+7,elbowY+7],10);
  limb(c,[elbowX+7,elbowY+7],[handX+3,handY+4],8);
  stroke(c,[-49,-54],[handX-3,handY],2,P.ink);
  stroke(c,[handX-4,handY-4],[handX+5,handY+9],5,P.ink);
  box(c,handX-3,handY-2,6,7,P.skinLight);
  head(c,art,frames,3,shoulderX-1,shoulderY-29,31);
}
function squat(c,s,art,frames){
  const depth=clamp(s.depth),hipY=-40+depth*25,shoulderY=-77+depth*31;
  const kneeX=20+depth*12,kneeY=-22+depth*6,barY=shoulderY+2;
  shadow(c,0,3,77);
  limb(c,[-11,hipY],[-kneeX,kneeY],13,false);limb(c,[-kneeX,kneeY],[-23,-3],10,false);
  limb(c,[11,hipY],[kneeX,kneeY],13);limb(c,[kneeX,kneeY],[23,-3],10);
  shoe(c,-25,3,-1);shoe(c,26,3,1);
  shorts(c,[[-18,hipY-9],[18,hipY-9],[22,hipY+6],[6,hipY+12],[0,hipY+7],[-7,hipY+12],[-22,hipY+6]]);
  shape(c,[[-19,shoulderY],[19,shoulderY],[15,hipY-7],[-15,hipY-7]],P.shirt);
  shape(c,[[-11,shoulderY+5],[9,shoulderY+5],[8,hipY-11],[-10,hipY-11]],P.shirtLight,false);
  stroke(c,[13,shoulderY+8],[12,hipY-10],4,P.shirtShade);
  // Wide elbows and hands grip the shoulder-level bar, never an overhead press.
  limb(c,[-17,shoulderY+7],[-34,shoulderY+13],10,false);
  limb(c,[-34,shoulderY+13],[-37,barY],8,false);
  limb(c,[17,shoulderY+7],[34,shoulderY+13],10);
  limb(c,[34,shoulderY+13],[37,barY],8);
  head(c,art,frames,9,0,shoulderY-30,32);
  bar(c,barY,132);
  box(c,-40,barY-3,8,7,P.skinShade);box(c,-38,barY-3,4,5,P.skinLight);
  box(c,34,barY-3,8,7,P.skinShade);box(c,34,barY-3,4,5,P.skinLight);
}
function balance(c,s,art,frames){
  const lean=clamp(s.balance,-1,1),hipY=-35+lean*5,shoulderY=-42-lean*4;
  // Side-on forearm plank, with the pelvis tilting as the balance meter drifts.
  shadow(c,0,-5,116);
  limb(c,[-18,hipY+5],[-43,-24],11,false);limb(c,[-43,-24],[-54,-7],9,false);
  shoe(c,-58,-5,-1);
  limb(c,[-12,hipY+9],[-34,-19],12);limb(c,[-34,-19],[-47,-3],10);
  shoe(c,-52,0,-1);
  shorts(c,[[-26,hipY-5],[-7,hipY-8],[0,hipY+9],[-18,hipY+16],[-29,hipY+8]]);
  shape(c,[[-11,hipY-7],[22,shoulderY-5],[28,shoulderY+13],[-5,hipY+12]],P.shirt);
  shape(c,[[-7,hipY-4],[21,shoulderY-1],[21,shoulderY+6],[-3,hipY+5]],P.shirtLight,false);
  stroke(c,[-4,hipY+10],[24,shoulderY+11],4,P.shirtShade);
  limb(c,[21,shoulderY+5],[29,-17],10,false);limb(c,[29,-17],[44,-17],9,false);
  limb(c,[25,shoulderY+12],[28,-8],11);limb(c,[28,-8],[47,-8],9);
  box(c,45,-13,10,8,P.skinLight);
  head(c,art,frames,6,34,shoulderY-26,30);
}

/** All positions are in the room's 1200 × 675 world coordinates. */
export function drawExerciseActor(ctx,station,session,art,frames,paused=false){
  if(!station||!session||!art.actor||!frames?.length)return;
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(Math.round(station.x),Math.round(station.y));
  switch(session.category){
    case 'cardio':{
      const frame=paused?0:1+Math.floor((session.time||0)*(session.sprint?10:6))%2;
      const r=frames[9+frame];
      if(r){const height=100,width=height*r.w/r.h;shadow(ctx,0,-23,49);ctx.drawImage(art.actor,r.x,r.y,r.w,r.h,Math.round(-width/2),-123,Math.round(width),height);}
      break;
    }
    case 'push':bench(ctx,session,art,frames);break;
    // P02's seat and footplate sit twenty pixels above its floor anchor.
    case 'pull':ctx.translate(0,-20);row(ctx,session,art,frames);break;
    case 'legs':squat(ctx,session,art,frames);break;
    case 'core':balance(ctx,session,art,frames);break;
  }
  ctx.restore();
}
