import {spriteFrame} from './walk-sprite.mjs';

// Cut lines and joint pivots are in the front idle illustration's atlas coordinates.
// The back idle illustration shares this registration, 1080 pixels lower.
const pieces={
  trunk:{from:[205,152],to:[205,239],edge:[[181,147],[190,143],[218,143],[231,148],[234,176],[236,205],[241,220],[241,240],[228,246],[180,246],[165,240],[171,216],[176,195],[178,168]]},
  upper:{from:[168,160],to:[154,200],edge:[[168,149],[180,150],[178,179],[169,200],[163,209],[141,204],[140,195],[147,175],[150,161]]},
  fore:{from:[155,198],to:[152,238],edge:[[141,190],[168,195],[166,211],[164,220],[170,231],[167,245],[159,253],[143,251],[133,243],[133,228],[137,207]]},
  thigh:{from:[184,235],to:[181,283],edge:[[163,228],[201,228],[202,260],[198,275],[194,287],[184,291],[164,286],[162,272],[158,267]]},
  shin:{from:[181,281],to:[176,320],edge:[[164,276],[197,276],[196,294],[189,315],[188,326],[159,326],[161,308],[161,292]]},
  foot:{from:[176,317],to:[175,345],edge:[[160,313],[188,313],[197,330],[199,350],[145,354],[144,338],[150,324]]}
};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x||0));
const distance=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
function ease(value){const t=clamp(value);return t*t*(3-2*t);}

// Two fixed-length bones bend towards the chosen side of the line between the anchors.
function joint(a,b,first,second,side){
  const span=Math.max(.001,distance(a,b)),dx=(b[0]-a[0])/span,dy=(b[1]-a[1])/span;
  const along=clamp((first*first-second*second+span*span)/(2*span),0,span);
  const bend=Math.sqrt(Math.max(0,first*first-along*along))*side;
  return [a[0]+along*dx-bend*dy,a[1]+along*dy+bend*dx];
}

export function drawLiftingSprite(c,session,atlas,frames,look,drawBar){
  const squat=session.category==='legs',index=squat?9:0,frame=frames[index];
  const material=look?{...look,stage:1}:undefined;
  const {image,crop}=spriteFrame(atlas,frame,index,material);
  const scaleX=atlas.width/1086,scaleY=atlas.height/1448;
  const bulk=[1,1.11,1.23,1.37,1.53][(look?.stage||1)-1];

  function piece(name,a,b,width,mirror=false){
    const {from,to,edge}=pieces[name],flip=mirror?-1:1;
    const sourceAngle=Math.atan2(to[1]-from[1],flip*(to[0]-from[0]));
    const targetAngle=Math.atan2(b[1]-a[1],b[0]-a[0]);
    c.save();c.translate(...a);c.rotate(targetAngle-Math.PI/2);
    c.scale(width,distance(a,b)/distance(from,to));c.rotate(Math.PI/2-sourceAngle);
    c.scale(flip,1);c.translate(-from[0],-from[1]);
    c.beginPath();edge.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.clip();
    c.drawImage(image,crop.x,crop.y,crop.w,crop.h,frame.x/scaleX,frame.y/scaleY-(squat?1080:0),frame.w/scaleX,frame.h/scaleY);
    c.restore();
  }
  function head(dir,neck,height,tilt=0,aspect=1){
    const id=dir*3,f=frames[id],sprite=spriteFrame(atlas,f,id,material);
    const h=Math.round(f.h*.378),w=f.w*height/h*aspect;
    c.save();c.translate(...neck);c.rotate(tilt);
    c.drawImage(sprite.image,sprite.crop.x,sprite.crop.y,f.w,h,-w/2,-height+2,w,height);c.restore();
  }
  function arm(shoulder,elbow,grip,mirror=false){
    piece('upper',shoulder,elbow,.34*bulk,mirror);
    piece('fore',elbow,grip,.33*bulk,mirror);
  }
  function leg(hip,knee,ankle,sole,mirror=false){
    piece('thigh',hip,knee,.34*bulk,mirror);piece('shin',knee,ankle,.32*bulk,mirror);
    piece('foot',ankle,sole,.34,mirror);
  }
  function line(a,b,color,width){
    c.beginPath();c.moveTo(...a);c.lineTo(...b);c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.stroke();
  }
  function grip([,elbow,hand,mirror]){
    // Only the knuckles wrap in front of the metal shaft.
    c.save();c.beginPath();c.ellipse(...hand,4*bulk,3,0,0,2*Math.PI);c.clip();
    piece('fore',elbow,hand,.33*bulk,mirror);c.restore();
  }
  if(session.category==='push'){
    const barY=-45-37*clamp(session.height);
    const arms=[];
    for(const side of [-1,1]){
      leg([side*8,-26],[side*24,-30],[side*26,-4],[side*28,5],side===1);
      const shoulder=[side*(9+3*bulk),-49],hand=[side*30,barY];
      arms.push([shoulder,joint(shoulder,hand,21,19,side),hand,side===1]);
    }
    piece('trunk',[0,-50],[0,-26],.44*bulk);head(0,[0,-49],20,0,1.65);
    arms.forEach(args=>arm(...args));drawBar(c,barY,132);arms.forEach(grip);
  }else if(session.category==='pull'){
    const t=clamp(session.extension),drive=ease(t/.8),draw=ease((t-.27)/.73);
    const hip=[8+22*drive,-30],neck=[hip[0]-10+18*draw,-61];
    const hand=[-39+20*drive+35*draw,-47+2*draw];
    const shoulder=[neck[0]+1,neck[1]+3],ankle=[-34,-14];
    const elbow=joint(shoulder,hand,20,20,-1),knee=joint(hip,ankle,34,32,1);
    line([hip[0]-10,-22],[hip[0]+10,-22],'#494653',5);
    leg([hip[0]-3,-34],[knee[0]-4,knee[1]-4],[-37,-17],[-41,-12]);
    leg(hip,knee,ankle,[-38,-8]);piece('trunk',neck,hip,.26*bulk);
    head(1,neck,34,(t-.5)*.12);line([-49,-54],hand,'#413941',2);
    line([hand[0]-2,hand[1]-5],[hand[0]+3,hand[1]+5],'#39343e',4);
    arm(shoulder,elbow,hand);
  }else if(squat){
    const t=clamp(session.depth),hipY=-39+22*t,neckY=-74+28*t;
    const arms=[];
    for(const side of [-1,1]){
      leg([side*8,hipY],[side*(14+11*t),-20+3*t],[side*20,-6],[side*20,3],side===1);
      const shoulder=[side*(9+4*bulk),neckY+3],hand=[side*33,neckY+1];
      arms.push([shoulder,joint(shoulder,hand,15,14,side),hand,side===1]);
    }
    piece('trunk',[0,neckY],[0,hipY],.39*bulk);
    head(3,[0,neckY],36);arms.forEach(args=>arm(...args));
    drawBar(c,neckY+1,132);arms.forEach(grip);
  }else if(session.category==='core'){
    const lean=clamp(session.balance,-1,1),breath=Math.sin((session.time||0)*2)*.7;
    const hip=[-15,-21+3*lean],neck=[19,-29-2*lean+breath];
    const elbow=[22,-6],hand=[42,-6];
    leg([hip[0],hip[1]-3],[-37,-17],[-56,-11],[-59,-3]);
    arm([neck[0]-4,neck[1]], [18,-10],[37,-10]);
    leg(hip,[-35,-15],[-52,-8],[-55,0]);
    piece('trunk',neck,hip,.29*bulk);
    head(2,[neck[0]+3,neck[1]-2],32,.90+lean*.06);
    arm(neck,elbow,hand);
  }
}
