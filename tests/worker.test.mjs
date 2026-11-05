import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import {createLocalDatabase} from '../multiplayer-server/local-db.mjs';
test('Cloudflare entry preserves invites, isolates API routing and serves assets',async()=>{
 const env={ASSETS:{fetch:()=>new Response('asset')}};
 const redirect=await worker.fetch(new Request('https://gym.test/?room=ABC123'),env);
 assert.equal(redirect.headers.get('location'),'https://gym.test/play/?room=ABC123');
 assert.equal((await worker.fetch(new Request('https://gym.test/api/account/me'),env)).status,503);
 assert.equal(await (await worker.fetch(new Request('https://gym.test/play/style.css'),env)).text(),'asset');
 const db=createLocalDatabase();try{
  const bound={...env,DB:db};
  assert.equal((await (await worker.fetch(new Request('https://gym.test/api/account/config'),bound)).json()).enabled,true);
  assert.equal((await worker.fetch(new Request('https://gym.test/api/account/me'),bound)).status,401);
 }finally{db.close();}
});
