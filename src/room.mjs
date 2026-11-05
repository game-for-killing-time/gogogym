// Source rectangles are manually selected to exclude atlas labels and adjacent props.
export const crops={
  treadmill:[80,22,180,243],rower:[330,80,265,175],squat:[620,13,275,254],bench:[947,53,239,212],weights:[1255,43,248,211],
  locker:[655,320,215,220],vending:[983,315,150,230],towels:[1250,365,270,174],sofa:[25,616,298,145],table:[375,660,210,100],
  plant:[680,586,160,184],notice:[1235,607,250,166],clock:[390,841,145,139],mat:[336,387,262,138]
};
export const objects=[
  {type:'notice',x:712,y:188,w:118,h:80,wall:true},{type:'clock',x:890,y:136,w:58,h:58,wall:true},
  {type:'treadmill',x:187,y:360,w:116,h:157,id:'cardio',stationKey:'treadmill-1',name:'跑步機 1',approach:{x:187,y:397}},
  {type:'treadmill',x:325,y:360,w:116,h:157,id:'cardio',stationKey:'treadmill-2',name:'跑步機 2',approach:{x:325,y:397}},
  {type:'rower',x:494,y:354,w:150,h:99,id:'pull',stationKey:'rower',name:'划船機',approach:{x:494,y:392}},
  {type:'squat',x:747,y:365,w:180,h:166,id:'legs',stationKey:'squat',name:'深蹲架',approach:{x:747,y:406}},
  {type:'weights',x:952,y:352,w:160,h:135},
  {type:'bench',x:615,y:518,w:167,h:148,id:'push',stationKey:'bench',name:'臥推',approach:{x:615,y:553}},
  {type:'locker',x:95,y:532,w:125,h:128},
  {type:'vending',x:231,y:532,w:86,h:132},
  {type:'towels',x:369,y:522,w:135,h:87},
  {type:'sofa',x:868,y:550,w:180,h:88},
  {type:'table',x:870,y:620,w:119,h:57},
  {type:'plant',x:1058,y:441,w:74,h:85},
  {type:'mat',x:438,y:632,w:155,h:70,flat:true,id:'core',stationKey:'mat',name:'核心訓練墊',approach:{x:438,y:644}}
];
export function nearestStation(point,maxDistance=53) {
  if(!validPoint(point)||!Number.isFinite(maxDistance)||maxDistance<0)return undefined;
  let nearest, distance=maxDistance;
  for(const station of objects.filter(o=>o.id)) {
    const next=Math.hypot(point.x-station.approach.x,point.y-station.approach.y);
    if(next<=distance&&(!nearest||next<distance)){nearest=station;distance=next;}
  }
  return nearest;
}
export function stationAt(point) {
  if(!validPoint(point))return undefined;
  // Name badges are drawn last, including the portion below each prop's base.
  const badge=[...objects].reverse().find(o=>o.id&&point.x>=o.x-42&&point.x<=o.x+42&&point.y>=o.y+8&&point.y<=o.y+32);
  if(badge)return badge;
  // Match the room's painter order so foreground furniture cannot select a station behind it.
  const ordered=[...objects.filter(o=>o.wall||o.flat),...objects.filter(o=>!o.wall&&!o.flat).sort((a,b)=>a.y-b.y)];
  const prop=ordered.reverse().find(o=>point.x>=o.x-o.w/2&&point.x<=o.x+o.w/2&&point.y>=o.y-o.h&&point.y<=o.y+8);
  return prop?.id?prop:undefined;
}
function validPoint(point){return !!point&&Number.isFinite(point.x)&&Number.isFinite(point.y);}
export function blocked(x,y) {
  if(!Number.isFinite(x)||!Number.isFinite(y))return true;
  if(x<35||x>1158||y<263||y>653) return true;
  // Entrance's raised wall cannot be walked through.
  if(x>946&&y>350&&y<393) return true;
  return objects.some(o=>!o.wall&&!o.flat&&x>o.x-o.w/2-12&&x<o.x+o.w/2+12&&y>o.y-37&&y<o.y+12);
}
export function findPath(start,target) {
  if(!validPoint(start)||!validPoint(target)||blocked(start.x,start.y)||blocked(target.x,target.y))return [];
  if(start.x===target.x&&start.y===target.y)return [];
  const step=14;
  const clearSegment=(a,b)=>{
    const samples=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2);
    for(let i=0;i<=samples;i++) {
      const t=samples?i/samples:0;
      if(blocked(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t))return false;
    }
    return true;
  };
  // Grid rounding near a machine or the bottom wall must not place a walkable click inside it.
  const snap=point=>{
    const x=Math.round(point.x/step),y=Math.round(point.y/step),candidates=[];
    for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)candidates.push({x:(x+dx)*step,y:(y+dy)*step});
    return candidates.sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))
      .find(candidate=>clearSegment(point,candidate));
  };
  const source=snap(start),destination=snap(target);
  if(!source||!destination)return [];
  const sx=source.x/step,sy=source.y/step,tx=destination.x/step,ty=destination.y/step;
  const key=(x,y)=>`${x},${y}`;
  const queue=[[sx,sy]], visited=new Map([[key(sx,sy),null]]);
  for(let i=0;i<queue.length;i++) {
    const [x,y]=queue[i];
    if(x===tx&&y===ty) {
      const route=[];let k=key(x,y);
      while(k!==null){const [px,py]=k.split(',').map(Number);route.push({x:px*step,y:py*step});k=visited.get(k);}
      route.reverse();
      if(route[0].x===start.x&&route[0].y===start.y)route.shift();
      if(destination.x!==target.x||destination.y!==target.y)route.push({x:target.x,y:target.y});
      return route;
    }
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx,ny=y+dy,k=key(nx,ny);
      if(!visited.has(k)&&clearSegment({x:x*step,y:y*step},{x:nx*step,y:ny*step})){visited.set(k,key(x,y));queue.push([nx,ny]);}
    }
  }
  return [];
}
