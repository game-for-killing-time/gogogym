import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createLocalDatabase} from '../multiplayer-server/local-db.mjs';
import {handleMultiplayer,getSnapshot,PLAYER_TTL,ROOM_TTL} from '../multiplayer-server/handler.mjs';
import {createGymServer} from '../server.mjs';

function setup(t){
  const db=createLocalDatabase();t.after(()=>db.close());let now=1_800_000_000_000;
  const request=async(path,body,headers={})=>{
    const res=await handleMultiplayer(new Request('https://gym.example'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}),db,{now:()=>now,onError:e=>{throw e;}});
    return {status:res.status,...await res.json()};
  };
  const create=async(name='阿晴')=>request('/api/rooms',{name});
  const action=(member,verb,body={})=>request(`/api/rooms/${member.roomCode}/${verb}`,{token:member.token,...body});
  return {db,request,create,action,advance(ms){now+=ms;},snapshot:code=>getSnapshot(db,code,now)};
}
const state=(overrides={})=>({x:1000,y:590,dir:1,moving:true,emote:'',exercise:null,...overrides});

test('twelve independent members join atomically; thirteenth rejected; leaving frees one slot',async t=>{
  const q=setup(t),host=await q.create();assert.equal(host.status,201);
  const joins=await Promise.all(Array.from({length:20},(_,i)=>q.request(`/api/rooms/${host.roomCode}/join`,{name:`會員${i}`})));
  assert.equal(joins.filter(r=>r.status===201).length,11);
  assert.equal(joins.filter(r=>r.error==='ROOM_FULL').length,9);
  const snap=await q.snapshot(host.roomCode);assert.equal(snap.players.length,12);
  assert.ok(snap.players.every(p=>!('token' in p)&&!('token_hash' in p)));
  await q.action(host,'leave');const added=await q.request(`/api/rooms/${host.roomCode}/join`,{name:'後來者'});
  assert.equal(added.status,201);assert.equal(added.snapshot.players.length,12);
});

test('rooms are isolated and tokens cannot impersonate another member',async t=>{
  const q=setup(t),a=await q.create('甲'),b=await q.create('乙');
  assert.notEqual(a.roomCode,b.roomCode);
  const wrong=await q.request(`/api/rooms/${b.roomCode}/sync`,{token:a.token,seq:0,state:state()});assert.equal(wrong.status,401);
  assert.equal((await q.snapshot(b.roomCode)).players[0].name,'乙');
  const moved=await q.action(a,'sync',{seq:3,state:state()});assert.equal(moved.snapshot.players[0].x,1000);
  const stale=await q.action(a,'sync',{seq:2,state:state({x:950})});assert.equal(stale.snapshot.players[0].x,1000);
  assert.equal((await q.snapshot(b.roomCode)).players[0].x,1050);
});

test('station claims are atomic, null sync retains claim, release cannot be undone by a late state',async t=>{
  const q=setup(t),a=await q.create(),b=await q.request(`/api/rooms/${a.roomCode}/join`,{name:'小葵'});
  const claims=await Promise.all([q.action(a,'exercise',{stationKey:'bench'}),q.action(b,'exercise',{stationKey:'bench'})]);
  assert.equal(claims.filter(r=>r.status===200).length,1);assert.equal(claims.filter(r=>r.error==='STATION_BUSY').length,1);
  const winner=claims[0].status===200?a:b,loser=winner===a?b:a;
  const held=await q.action(winner,'sync',{seq:1,state:state()});assert.equal(held.snapshot.players.find(p=>p.id===winner.playerId).exercise.stationKey,'bench');
  const ex=held.snapshot.players.find(p=>p.id===winner.playerId).exercise;
  await q.action(winner,'exercise',{stationKey:null});
  const stale=await q.action(winner,'sync',{seq:2,state:state({exercise:ex})});assert.equal(stale.error,'STATION_NOT_CLAIMED');
  assert.equal((await q.action(loser,'exercise',{stationKey:'bench'})).status,200);
});

test('all five workout poses and pause state are shared with room members',async t=>{
  const q=setup(t),a=await q.create();let seq=0;
  for(const [stationKey,category,phase] of [['treadmill-1','cardio','running'],['treadmill-2','cardio','running'],['bench','push','lower'],['rower','pull','recover'],['squat','legs','rise'],['mat','core','balance']]){
    assert.equal((await q.action(a,'exercise',{stationKey})).status,200);
    const exercise={stationKey,category,phase,time:6.2,rep:2,height:.7,extension:.3,depth:.5,balance:-.2,paused:true,sprint:true};
    const synced=await q.action(a,'sync',{seq:seq++,state:state({exercise})});
    assert.equal(synced.status,200);assert.deepEqual(synced.snapshot.players[0].exercise,exercise);
  }
});

test('connection expiry removes ghosts and busy stations, and capacity remains correct on resume',async t=>{
  const q=setup(t),a=await q.create();await q.action(a,'exercise',{stationKey:'bench'});
  await q.action(a,'sync',{seq:9,state:state()});
  const resume=await q.action(a,'join');assert.equal(resume.playerId,a.playerId);assert.equal(resume.seq,9);assert.equal(resume.snapshot.players[0].exercise.stationKey,'bench');
  q.advance(PLAYER_TTL+1);assert.equal((await q.snapshot(a.roomCode)).players.length,0);
  assert.equal((await q.action(a,'sync',{seq:10,state:state()})).error,'SESSION_EXPIRED');
  const joined=await Promise.all(Array.from({length:12},(_,i)=>q.request(`/api/rooms/${a.roomCode}/join`,{name:`新人${i}`})));
  assert.ok(joined.every(r=>r.status===201));
  assert.equal((await q.action(a,'join')).error,'ROOM_FULL');
  await q.action(joined[0],'leave');const restored=await q.action(a,'join');
  assert.equal(restored.playerId,a.playerId);assert.equal(restored.expired,true);
  assert.equal(restored.snapshot.players.find(p=>p.id===a.playerId).exercise,null);
  assert.equal(restored.snapshot.players.length,12);
  q.advance(ROOM_TTL);assert.equal((await q.action(a,'join')).error,'ROOM_NOT_FOUND');
});

test('emotes expire after three seconds despite repeated same emote packets',async t=>{
  const q=setup(t),a=await q.create();
  assert.equal((await q.action(a,'sync',{seq:0,state:state({emote:'♡'})})).snapshot.players[0].emote,'♡');
  q.advance(2000);await q.action(a,'sync',{seq:1,state:state({emote:'♡'})});q.advance(1001);
  assert.equal((await q.action(a,'sync',{seq:2,state:state({emote:'♡'})})).snapshot.players[0].emote,'');
  await q.action(a,'sync',{seq:3,state:state()});
  assert.equal((await q.action(a,'sync',{seq:4,state:state({emote:'♡'})})).snapshot.players[0].emote,'♡');
});

test('malformed names, states, unclaimed workouts, origins and oversized bodies are rejected',async t=>{
  const q=setup(t);assert.equal((await q.create('  ')).error,'INVALID_NAME');assert.equal((await q.create('x'.repeat(17))).error,'INVALID_NAME');
  const a=await q.create('<晴>');assert.equal(a.snapshot.players[0].name,'晴');
  for(const bad of [{x:null},{x:-1},{x:187,y:360},{dir:1.5},{emote:'<script>'},{moving:'true'},{exercise:{stationKey:'bench',category:'push'}}])
    assert.ok((await q.action(a,'sync',{seq:0,state:state(bad)})).status>=400);
  assert.equal((await q.request('/api/rooms',{name:'test'},{origin:'https://evil.example'})).status,403);
  assert.equal((await q.request('/api/rooms',{name:'test',padding:'x'.repeat(9000)})).status,413);
  assert.equal((await q.action(a,'exercise',{stationKey:'imaginary'})).error,'INVALID_STATION');
  assert.equal((await q.snapshot(a.roomCode)).players[0].x,1050);
});

test('actual HTTP preview serves game assets and synchronizes separate network clients',async t=>{
  const server=createGymServer();server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
  assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/src/app.mjs')).status,200);assert.equal((await fetch(base+'/server.mjs')).status,404);
  const a=await post('/api/rooms',{name:'窗一'}),b=await post(`/api/rooms/${a.roomCode}/join`,{name:'窗二'});
  assert.equal(a.status,201);assert.equal(b.snapshot.players.length,2);
  await post(`/api/rooms/${a.roomCode}/sync`,{token:a.token,seq:0,state:state({x:999})});
  const seen=await post(`/api/rooms/${a.roomCode}/sync`,{token:b.token,seq:0,state:state({x:1050})});
  assert.equal(seen.snapshot.players.find(p=>p.id===a.playerId).x,999);
});

test('custom gym names persist across joining and syncing; invalid names rejected',async t=>{
  const q=setup(t),host=await q.request('/api/rooms',{name:'甲',roomName:'夜貓健身室'});
  assert.equal(host.status,201);assert.equal(host.snapshot.roomName,'夜貓健身室');
  const guest=await q.request(`/api/rooms/${host.roomCode}/join`,{name:'乙'});
  assert.equal(guest.snapshot.roomName,'夜貓健身室');
  assert.equal((await q.action(guest,'sync',{seq:0,state:state()})).snapshot.roomName,'夜貓健身室');
  assert.equal((await q.create()).snapshot.roomName,'街角健身室');
  for(const roomName of ['', ' ', '<script>', '字'.repeat(25), 42])
    assert.equal((await q.request('/api/rooms',{name:'甲',roomName})).error,'INVALID_ROOM_NAME');
});
