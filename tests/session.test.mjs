import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,input,tick,sessionResult} from '../src/session.mjs';
import {findPath,blocked,objects} from '../src/room.mjs';
function advance(s,time){while(s.time<time&&!s.done)tick(s,Math.min(.01,time-s.time));}

test('idle sessions do not qualify for rewards',()=>{
  for(const category of ['cardio','push']){const s=createSession(category);advance(s,60);assert.equal(s.done,true);assert.equal(sessionResult(s).qualified,false);}
});
test('alternating accurately timed running beats score fully, repeated presses cannot farm a beat',()=>{
  const s=createSession('cardio');
  for(const beat of s.beats){advance(s,beat.at);input(s,beat.side);const score=s.points;input(s,beat.side);assert.equal(s.points,score);}
  advance(s,26);assert.equal(sessionResult(s).qualified,true);assert.ok(sessionResult(s).score>.99);
});
test('wrong-side input uses the beat, sprint drains stamina and recovery restores it',()=>{
  const s=createSession('cardio');advance(s,3);input(s,'right');input(s,'left');assert.equal(s.points,0);
  input(s,'sprint');advance(s,5);assert.ok(s.stamina<70);input(s,'sprint',false);advance(s,8);assert.ok(s.stamina>90);
});
test('bench press rewards controlled lift and catch, with six distinct repetitions',()=>{
  const s=createSession('push');
  for(let rep=0;rep<6;rep++){
    input(s,'lift',true);while(s.height<.78)tick(s,.01);input(s,'lift',false);
    assert.equal(s.phase,'lower');while(s.height>.17)tick(s,.01);input(s,'lift',true);
    const score=s.points;input(s,'lift',true);assert.equal(s.points,score);
    while(s.phase==='rest'&&!s.done)tick(s,.01);
  }
  assert.equal(s.rep,6);assert.ok(sessionResult(s).score>.95);assert.equal(sessionResult(s).qualified,true);
});
test('both stations can be reached from entrance without crossing collision areas',()=>{
  for(const station of objects.filter(o=>o.id)){
    const route=findPath({x:1050,y:592},station.approach);
    assert.ok(route.length>0);for(const p of route)assert.equal(blocked(p.x,p.y),false);
    assert.ok(Math.hypot(route.at(-1).x-station.approach.x,route.at(-1).y-station.approach.y)<14);
  }
  assert.deepEqual(findPath({x:1050,y:592},{x:0,y:0}),[]);
});
