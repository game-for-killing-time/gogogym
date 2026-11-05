import test from 'node:test';
import assert from 'node:assert/strict';
import {objects,blocked,findPath,nearestStation,stationAt} from '../src/room.mjs';

const stations=objects.filter(o=>o.id);

test('five training categories have six individually selectable facilities',()=>{
  assert.deepEqual([...new Set(stations.map(o=>o.id))].sort(),['cardio','core','legs','pull','push']);
  assert.equal(stations.length,6);
  assert.equal(new Set(stations.map(o=>o.stationKey)).size,6);
  for(const station of stations){
    assert.ok(station.name);
    assert.equal(blocked(station.approach.x,station.approach.y),false,station.stationKey);
    assert.equal(nearestStation(station.approach),station);
    assert.equal(stationAt({x:station.x,y:station.y-station.h/2}),station);
    assert.equal(stationAt({x:station.x,y:station.y+32}),station,'name badge bottom is clickable');
  }
  const treadmills=stations.filter(o=>o.type==='treadmill');
  assert.equal(treadmills.length,2);
  assert.ok(treadmills.every(o=>o.id==='cardio'),'both machines use the same daily category allowance');
});

test('every facility can be reached from the entrance and every other facility without crossing furniture',()=>{
  const points=[{x:1050,y:592},...stations.map(o=>o.approach)];
  for(const start of points)for(const target of points){
    if(start===target)continue;
    const route=findPath(start,target);
    assert.ok(route.length,`${JSON.stringify(start)} to ${JSON.stringify(target)}`);
    assert.deepEqual(route.at(-1),target);
    let previous=start;
    for(const waypoint of route){
      const samples=Math.ceil(Math.hypot(waypoint.x-previous.x,waypoint.y-previous.y));
      for(let i=0;i<=samples;i++){
        const t=samples?i/samples:0;
        assert.equal(blocked(previous.x+(waypoint.x-previous.x)*t,previous.y+(waypoint.y-previous.y)*t),false,'route stays on walkable floor');
      }
      previous=waypoint;
    }
  }
});

test('station proximity selects the closest approach and respects its distance limit',()=>{
  const bench=stations.find(o=>o.id==='push');
  assert.equal(nearestStation({x:600,y:550},300),bench,'must not select the first category inside the radius');
  assert.equal(nearestStation({x:1050,y:592}),undefined);
  assert.equal(nearestStation(bench.approach,0),bench);
  assert.equal(nearestStation({x:bench.approach.x+1,y:bench.approach.y},0),undefined);
});

test('hit testing follows scene draw order and ignores ordinary furniture',()=>{
  assert.equal(stationAt({x:95,y:480}),undefined);
  assert.equal(stationAt({x:1100,y:600}),undefined);
  const mat=stations.find(o=>o.id==='core');
  const cover={type:'test-furniture',x:mat.x,y:mat.y+1,w:50,h:50};
  objects.push(cover);
  try{assert.equal(stationAt({x:mat.x,y:mat.y-15}),undefined);}
  finally{objects.pop();}
});

test('paths preserve walkable edge clicks and reject invalid or obstructed targets',()=>{
  const entrance={x:1050,y:592};
  for(const target of [{x:438,y:653},{x:35,y:450},{x:1158,y:592}]){
    const route=findPath(entrance,target);
    assert.ok(route.length);
    assert.deepEqual(route.at(-1),target);
  }
  for(const target of [{x:NaN,y:592},{x:Infinity,y:0},{x:438,y:675},{x:615,y:518},null])assert.deepEqual(findPath(entrance,target),[]);
  assert.deepEqual(findPath(entrance,entrance),[]);
  assert.equal(nearestStation(null),undefined);
  assert.equal(stationAt({x:NaN,y:0}),undefined);
});
