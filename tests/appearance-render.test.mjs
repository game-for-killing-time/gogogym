import test from 'node:test';
import assert from 'node:assert/strict';
import {drawExerciseActor,drawWalkingActor} from '../src/exercise-art.mjs';
import {DEFAULT_LOOK,validateLook,playerLook} from '../src/appearance-model.mjs';
import {newPlayer} from '../src/training.mjs';
import {ITEMS} from '../src/evolution.mjs';
const frames=Array.from({length:12},()=>({x:0,y:0,w:80,h:100})),art={actor:{id:'c01',width:1086,height:1448}};
// Supply the canvas operations used to build cached frames in this DOM-free test.
// The real atlas, pixel masks and rendered silhouettes are checked in the browser.
globalThis.document={createElement:()=>({getContext:()=>({
 drawImage(){},getImageData:(_,__,w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
 putImageData(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}
})})};
function record(fn){const calls=[],c=new Proxy({},{get:(_,name)=>(...args)=>calls.push([name,...args]),set:(_,key,value)=>{calls.push([key,value]);return true;}});fn(c);return calls;}
const render=(look,category)=>record(c=>drawExerciseActor(c,{x:600,y:500},{category,time:2,height:.5,extension:.5,depth:.5,balance:.2},art,frames,false,look));
test('each lifting motion follows its input and uses the equipped artwork for the entire figure',()=>{
 const look={...DEFAULT_LOOK,outfit:{...DEFAULT_LOOK.outfit,top:'top-04-coral-tee',accessory:'accessory-02-wristbands'}};
 for(const [category,control] of [['push','height'],['pull','extension'],['legs','depth'],['core','balance']]){
  const pose=value=>record(c=>drawExerciseActor(c,{x:0,y:0},{category,[control]:value,time:0},art,frames,false,look));
  const start=pose(0),finish=pose(1);
  assert.notDeepEqual(start,finish,category);
  assert.deepEqual(start,pose(0),category);
  const blits=finish.filter(([op])=>op==='drawImage');
  assert.ok(blits.length>=10,category);
  assert.ok(blits.every(([,image])=>image!==art.actor),category);
 }
});
test('the default room avatar uses the whole illustrated frame at a fixed foot anchor',()=>{
 const atlasFrames=frames.map((f,i)=>({...f,x:i*100}));
 for(let dir=0;dir<4;dir++)for(const [time,moving,step] of [[0,false,0],[0,true,1],[.18,true,2]]){
  const calls=record(c=>drawWalkingActor(c,200,300,dir,time,moving,art,atlasFrames,DEFAULT_LOOK));
  const blits=calls.filter(([op])=>op==='drawImage');
  assert.equal(blits.length,1);
  const [,image,x,,width,height,,,displayWidth,displayHeight]=blits[0];
  assert.equal(image,art.actor);assert.equal(x,100*(dir*3+step));
  assert.deepEqual([width,height],[80,100]);assert.equal(displayHeight,103);
  assert.equal(blits[0][7]+displayHeight,300);assert.equal(displayWidth,82);
 }
});
test('all wardrobe slots render in every training category and body size without nonfinite geometry',()=>{
 for(const stage of [1,3,5])for(const item of ITEMS)for(const category of ['push','pull','legs','core','cardio']){
  const look={v:1,stage,outfit:{...DEFAULT_LOOK.outfit,[item.slot]:item.id}},calls=render(look,category);
  assert.ok(calls.some(([op])=>op==='drawImage'));assert.ok(calls.flat(2).every(v=>typeof v!=='number'||Number.isFinite(v)));
 }
});
test('interleaved players keep their own size, clothes and accessories in all poses',()=>{
 const a={v:1,stage:1,outfit:{...DEFAULT_LOOK.outfit}},b={v:1,stage:5,outfit:{...DEFAULT_LOOK.outfit,top:'top-06-varsity-jacket',bottom:'bottom-02-training-joggers',shoes:'shoes-02-navy-runners',accessory:'accessory-01-headband'}};
 for(const category of ['push','pull','legs','core','cardio']){const first=render(a,category),different=render(b,category),after=render(a,category);assert.notDeepEqual(first,different);assert.deepEqual(first,after);}
 for(let dir=0;dir<4;dir++){const first=record(c=>drawWalkingActor(c,0,0,dir,2,true,art,frames,a));record(c=>drawWalkingActor(c,0,0,dir,2,true,art,frames,b));assert.deepEqual(record(c=>drawWalkingActor(c,0,0,dir,2,true,art,frames,a)),first);}
});
test('progress-derived appearance contains only display fields',()=>{const p=newPlayer();p.abilities={push:6000,pull:6000,legs:6000,core:6000,cardio:0};const look=playerLook(p);assert.equal(look.stage,5);assert.deepEqual(Object.keys(look),['v','stage','outfit']);assert.deepEqual(validateLook({...look,private:'ignored'}),look);});
