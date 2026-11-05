import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalDatabase} from '../multiplayer-server/local-db.mjs';
import {handleAccount,replay} from '../account-server/handler.mjs';
import {createFirebaseVerifier} from '../account-server/auth.mjs';
const config={projectId:'test-project'};
function setup(){
 const db=createLocalDatabase();let clock=Date.parse('2026-11-05T05:00:00Z');
 const options={config,now:()=>clock,verifyToken:async token=>{if(!['alice','bob'].includes(token))throw Error();return token;}};
 return {db,advance:n=>clock+=n,call:async(path,body,uid='alice')=>{
  const r=await handleAccount(new Request('https://gym.test/api/account/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+uid,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),db,options);return {status:r.status,...await r.json()};
 }};
}
const character={name:'阿晴',accent:'#81e8bb'};
const cardioTrace=Array.from({length:24},(_,i)=>[Math.round((3+i*.9)*60),i%2?'right':'left',true]);
test('accounts fail closed without configuration or verified identity',async()=>{
 const a=setup();try{assert.equal((await a.call('me',null,'spoof')).status,401);const r=await handleAccount(new Request('https://gym.test/api/account/me'),a.db);assert.equal(r.status,503);}finally{a.db.close();}
});
test('characters isolated by verified uid and editing cannot overwrite progress',async()=>{
 const a=setup();try{assert.equal((await a.call('character',{...character,progress:{abilities:{push:9999}},uid:'bob'})).status,200);assert.equal((await a.call('me',null,'bob')).character,null);assert.equal((await a.call('me')).character.progress.abilities.push,0);assert.equal((await a.call('character',{...character,name:'<script>'})).status,400);}finally{a.db.close();}
});
test('training replay rejects forged scores and invalid input traces',()=>{
 assert.throws(()=>replay('cardio',[],1501));assert.throws(()=>replay('cardio',[[100,'left',true],[50,'right',true]],1501));
 assert.throws(()=>replay('cardio',[[1,'lift',true]],1501));const r=replay('cardio',cardioTrace,1501);assert.ok(r.qualified);assert.ok(r.score>.9);
});
test('server settlement uses time and atomic revisions; retries grant only once',async()=>{
 const a=setup();try{
  await a.call('character',character);const s=await a.call('training/start',{category:'cardio'});
  const body={id:s.id,steps:1501,events:cardioTrace,score:9999};
  assert.equal((await a.call('training/finish',body)).status,400);a.advance(26000);
  const results=await Promise.all([a.call('training/finish',body),a.call('training/finish',body)]);assert.ok(results.every(r=>r.status===200));
  const p=(await a.call('me')).character.progress;assert.equal(p.mastery.cardio,1);assert.equal(p.daily.categories.length,1);assert.ok(p.abilities.cardio<=120);
  assert.equal((await a.call('training/start',{category:'cardio'})).status,409);
  assert.equal((await a.call('training/finish',body,'bob')).status,409);
  await a.call('character',{...character,name:'晴天'});assert.equal((await a.call('me')).character.progress.mastery.cardio,1);
 }finally{a.db.close();}
});
test('server rejects expired and cross-game-day sessions',async()=>{
 const a=setup();try{await a.call('character',character);const s=await a.call('training/start',{category:'cardio'});a.advance(86400000);assert.equal((await a.call('training/finish',{id:s.id,steps:1501,events:cardioTrace})).status,409);assert.equal((await a.call('training/start',{category:'cardio'})).status,200);}finally{a.db.close();}
});
test('Firebase verifier checks signatures, audience, issuer and expiry',async()=>{
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test'};let requests=0;
 const verify=createFirebaseVerifier('test-project',{now:()=>1000000,fetcher:async()=>{requests++;return Response.json({keys:[jwk]});}});
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 async function token(claims={}){const data=encode({alg:'RS256',kid:'test'})+'.'+encode({sub:'alice',aud:'test-project',iss:'https://securetoken.google.com/test-project',iat:900,auth_time:900,exp:1100,...claims});return data+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(data))).toString('base64url');}
 assert.equal(await verify(await token()),'alice');assert.equal(await verify(await token()),'alice');assert.equal(requests,1);
 await assert.rejects(()=>verify('x.y.z'));for(const claims of [{aud:'other'},{iss:'attacker'},{exp:999},{sub:''},{iat:1100}])await assert.rejects(()=>token(claims).then(verify));
 const good=await token();const parts=good.split('.');parts[1]=encode({sub:'bob'});await assert.rejects(()=>verify(parts.join('.')));
});
