import test from 'node:test';
import assert from 'node:assert/strict';
import {camera,toScreen,toWorld,panelPosition} from '../src/view.mjs';
test('screen click round trips through cropped and zoomed cameras',()=>{
  for(const [w,h] of [[1280,800],[390,844],[844,390]])for(const training of [false,true]){
    const v=camera(w,h,{x:615,y:518},training),p={x:615,y:553};
    const roundtrip=toWorld(toScreen(p,v),v);
    assert.ok(Math.abs(roundtrip.x-p.x)<.0001&&Math.abs(roundtrip.y-p.y)<.0001);
    assert.ok(v.scale*1200>=w&&v.scale*675>=h);
  }
});
test('portrait camera keeps player above movement buttons and panels stay within screen',()=>{
  for(const [w,h] of [[320,800],[390,844],[1280,800],[844,390]]){
    const v=camera(w,h,{x:1050,y:592},true);
    if(w<=600)assert.ok(toScreen({x:1050,y:592},v).y<h-200);
    const pw=Math.min(410,w-24),ph=180;
    const p=panelPosition(w,h,pw,ph,{x:w+100,y:h+100});
    assert.ok(p.left>=0&&p.left+pw<=w&&p.top>=0&&p.top+ph<=h);
  }
});
