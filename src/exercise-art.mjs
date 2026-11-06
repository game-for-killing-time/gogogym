import {drawWalkSprite} from './walk-sprite.mjs';
import {drawLiftingSprite} from './lifting-sprite.mjs';
const P={ink:'#332d35',metal:'#a8a5a4',metalLight:'#ded7bd',plate:'#494653',plateLight:'#706b77'};
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
export function drawExerciseActor(ctx,station,session,art,frames,paused=false,look){
  if(!station||!session||!art.actor||!frames?.length)return;
  ctx.save();
  ctx.imageSmoothingEnabled=false;
  ctx.translate(Math.round(station.x),Math.round(station.y));
  if(session.category==='cardio'){
    drawWalkSprite(ctx,0,-23,3,session.time||0,!paused,art.actor,frames,look,session.sprint);
  }else{
    if(session.category==='pull')ctx.translate(0,-20);
    drawLiftingSprite(ctx,session,art.actor,frames,look,bar);
  }
  ctx.restore();
}
export function drawWalkingActor(ctx,x,y,dir,time,moving,art,frames,look){
  if(!art.actor||!frames.length)return;
  ctx.save();
  ctx.imageSmoothingEnabled=false;
  drawWalkSprite(ctx,x,y,dir,time,moving,art.actor,frames,look);
  ctx.restore();
}
