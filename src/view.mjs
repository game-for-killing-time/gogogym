const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function camera(width,height,focus,training=false){
  const scale=Math.max(width/1200,height/675);
  const floorHeight=width<=600?900:675;
  return {scale,x:clamp(width/2-focus.x*scale,width-1200*scale,0),y:clamp(height*(width<=600?.48:training?.42:.62)-focus.y*scale,height-floorHeight*scale,0)};
}
export function toScreen(point,view){return {x:point.x*view.scale+view.x,y:point.y*view.scale+view.y};}
export function toWorld(point,view){return {x:(point.x-view.x)/view.scale,y:(point.y-view.y)/view.scale};}
export function panelPosition(width,height,panelWidth,panelHeight,anchor){
  const maxTop=Math.max(110,height-panelHeight-(width<=600?110:98));
  let left=anchor.x-panelWidth/2,top=anchor.y+28;
  if(width>600&&top>maxTop){
    left=anchor.x+105;
    if(left+panelWidth>width-12)left=anchor.x-105-panelWidth;
    top=anchor.y-panelHeight/2;
  }
  return {left:clamp(left,12,Math.max(12,width-panelWidth-12)),top:clamp(top,110,maxTop)};
}
