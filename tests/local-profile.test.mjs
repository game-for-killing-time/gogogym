import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalProfiles,PROFILE_KEY,LEGACY_KEY,parseBackup,activeCharacter,settleProfile} from '../src/local-profile.mjs';
import {newPlayer,completeTraining} from '../src/training.mjs';
import {defaultOutfit,appearance} from '../src/evolution.mjs';
function setup(){const values=new Map();let chain=Promise.resolve();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};const locks={request:(_,fn)=>{const result=chain.then(fn);chain=result.catch(()=>{});return result;}};return {values,storage,store:new LocalProfiles(storage,locks)};}
const now=Date.parse('2026-11-05T06:00:00Z');
const training=(id,category)=>({id,category,score:1,now});

test('wardrobe belongs to one character, survives backup and concurrent training without resetting shared tickets',async()=>{
 const {store}=setup();let p=await store.create('玩家','一號','#81e8bb');const owner=p.id,first=p.activeId;
 p=await store.create('玩家','二號','#f2c28e');const second=p.characters[1].id;
 p.characters[0].progress.mastery.push=12;p.characters[0].progress.completedWeeks=['2026-10-26'];
 await store.replace(p,store.snapshot());
 const outfit={...defaultOutfit(),top:'top-02-street-jacket',color:'coral'};
 await Promise.all([store.saveAppearance(owner,first,2,outfit),store.settle(owner,first,training('wear-and-train','core'))]);
 p=store.read();assert.equal(p.daily.categories.length,1);assert.deepEqual(appearance(p.characters[0].progress).presets[2],outfit);assert.equal(appearance(p.characters[1].progress).active,0);
 assert.equal(p.characters[0].progress.lastTraining.category,'core');assert.deepEqual(p.characters[0].progress.completedWeeks,['2026-10-26']);
 const backup=parseBackup(JSON.stringify(p));await store.replace(backup,store.snapshot());assert.deepEqual(store.read(),backup);
 await store.select(second);await assert.rejects(()=>store.saveAppearance(owner,first,1,defaultOutfit()));
 await assert.rejects(()=>store.saveAppearance('stale-profile',second,0,defaultOutfit()));
 await assert.rejects(()=>store.saveAppearance(owner,second,0,outfit));
 p=await store.select(first);assert.deepEqual(appearance(activeCharacter(p).progress).presets[2],outfit);assert.equal(p.daily.categories.length,1);
});

test('invalid imported clothing or weekly history cannot silently discard existing wardrobe',async()=>{
 const {store}=setup();let p=await store.create('玩家','一號','#81e8bb');p=await store.saveAppearance(p.id,p.activeId,1,defaultOutfit());
 for(const change of [x=>x.appearance.active=3,x=>x.appearance.presets[0].top='external-image.png',x=>x.appearance.presets[0].top='top-02-street-jacket',x=>x.completedWeeks=['invalid'],x=>x.lastTraining={category:'legs',xp:999,at:new Date(now).toISOString()}]){
  const candidate=structuredClone(p);change(candidate.characters[0].progress);assert.throws(()=>parseBackup(JSON.stringify(candidate)));assert.deepEqual(store.read(),p);
 }
});
test('legacy progress becomes first role only; five character cap and edits preserve growth',async()=>{
 const {store,storage}=setup();const old=completeTraining(newPlayer(),training('legacy','push')).player;storage.setItem(LEGACY_KEY,JSON.stringify(old));
 let p=await store.create('玩家','一號','#81e8bb');assert.equal(activeCharacter(p).progress.mastery.push,1);assert.equal(p.daily.categories[0],'push');assert.equal(storage.getItem(LEGACY_KEY),JSON.stringify(old));
 for(let i=2;i<=5;i++)p=await store.create('玩家',`${i}號`,'#f2c28e');assert.equal(p.characters[1].progress.mastery.push,0);
 await assert.rejects(()=>store.create('玩家','第六個','#81e8bb'));
 p=await store.edit(p.activeId,'新名字','#edabb8','新玩家');assert.equal(activeCharacter(p).progress.mastery.push,1);
});
test('shared daily cap survives character switches while rewards stay with trained character',async()=>{
 const {store}=setup();let p=await store.create('玩家','一號','#81e8bb');const first=p.activeId;p=await store.create('玩家','二號','#f2c28e');const second=p.characters[1].id;
 p=(await store.settle(p.id,first,training('s1','push'))).profile;p=await store.select(second);
 await assert.rejects(()=>store.settle(p.id,second,training('s2','push')));
 await store.settle(p.id,second,training('s3','pull'));p=(await store.settle(p.id,second,training('s4','legs'))).profile;
 await assert.rejects(()=>store.settle(p.id,second,training('s5','core')));assert.equal(p.characters[0].progress.mastery.pull,0);assert.equal(p.characters[1].progress.mastery.pull,1);
 const next=settleProfile(p,second,{...training('tomorrow','push'),now:now+86400000}).profile;assert.equal(next.daily.categories.length,1);
});
test('concurrent tabs and duplicate receipts never double grant; stale role rejected',async()=>{
 const {store}=setup();const p=await store.create('玩家','一號','#81e8bb');await Promise.all([store.settle(p.id,p.activeId,training('same','core')),store.settle(p.id,p.activeId,training('same','core'))]);assert.equal(activeCharacter(store.read()).progress.mastery.core,1);
 const next=await store.create('玩家','二號','#81e8bb');await store.select(next.characters[1].id);await assert.rejects(()=>store.settle(p.id,p.activeId,training('stale','legs')));
});
test('backup roundtrip, malformed imports and prototype keys',async()=>{
 const {store}=setup();const p=await store.create('玩家','一號','#81e8bb');assert.deepEqual(parseBackup(JSON.stringify(p)),p);
 for(const change of [x=>x.version=2,x=>x.characters.push(x.characters[0]),x=>x.characters[0].progress.abilities.core=-1,x=>x.characters[0].name='<script>',x=>x.activeId='missing',x=>x.characters[0].progress.receipts=JSON.parse('{"__proto__":{"xp":1,"contribution":0}}')]){const copy=structuredClone(p);change(copy);assert.throws(()=>parseBackup(JSON.stringify(copy)));}
 assert.throws(()=>parseBackup('x'.repeat(2_000_001)));assert.throws(()=>parseBackup('not json'));assert.deepEqual(store.read(),p);
});
test('import saves previous copy, detects intervening change and can recover corrupt storage',async()=>{
 const {store,storage}=setup();const p=await store.create('玩家','一號','#81e8bb'),expected=store.snapshot();await store.edit(p.activeId,'改名','#81e8bb','玩家');await assert.rejects(()=>store.replace(p,expected));
 const prior=store.snapshot();await store.replace(p,prior);assert.equal(storage.getItem(PROFILE_KEY+'.previous'),prior);
 storage.setItem(PROFILE_KEY,'broken');await store.replace(p,'broken');assert.equal(storage.getItem(PROFILE_KEY+'.previous'),'broken');assert.equal(store.read().name,'玩家');
});
test('storage failure leaves existing save intact',async()=>{
 const {store,storage}=setup();const p=await store.create('玩家','一號','#81e8bb');storage.setItem=()=>{throw Error('QuotaExceeded');};await assert.rejects(()=>store.edit(p.activeId,'改名','#81e8bb','玩家'));assert.deepEqual(store.read(),p);
});
