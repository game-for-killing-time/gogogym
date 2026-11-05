import {newPlayer,completeTraining,periodKeys,CATEGORIES} from './training.mjs';
export const PROFILE_KEY='gogogym.local-profile.v1',LEGACY_KEY='pixel-gym.player.v1';
export const ACCENTS=['#81e8bb','#f2c28e','#b7b8f5','#edabb8','#a9c9f5'];
const bad=()=>{throw Error('存檔格式不正確，原有資料未更改。');};
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const number=x=>Number.isSafeInteger(x)&&x>=0&&x<=1e9;
export function cleanName(x){if(typeof x!=='string'||!x.trim()||[...x.trim()].length>16||/[<>\x00-\x1f\x7f]/.test(x))throw Error('名字請填寫 1 至 16 個字，不使用特殊標記。');return x.trim();}
const key=x=>x===null||typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x);
function categories(x,max=5){if(!Array.isArray(x)||x.length>max||new Set(x).size!==x.length||x.some(c=>!CATEGORIES.includes(c)))bad();return [...x];}
function daily(x){if(!obj(x)||!key(x.key))bad();return {key:x.key,categories:categories(x.categories,3)};}
export function validateProgress(x){
 if(!obj(x)||!obj(x.abilities)||!obj(x.mastery)||!obj(x.weekly)||!obj(x.receipts))bad();
 const p=newPlayer();for(const c of CATEGORIES){if(!number(x.abilities[c])||!number(x.mastery[c]))bad();p.abilities[c]=x.abilities[c];p.mastery[c]=x.mastery[c];}
 p.daily=daily(x.daily);const w=x.weekly;
 if(!key(w.key)||!Array.isArray(w.days)||w.days.length>7||w.days.some(d=>!d||!key(d))||new Set(w.days).size!==w.days.length||!number(w.contributions)||w.contributions>12)bad();
 p.weekly={key:w.key,days:[...w.days],categories:categories(w.categories),contributions:w.contributions};
 if(Object.keys(x.receipts).length>20000)bad();
 for(const [id,r] of Object.entries(x.receipts)){if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||['__proto__','constructor','prototype'].includes(id)||!obj(r)||!number(r.xp)||r.xp>120||![0,1].includes(r.contribution))bad();Object.defineProperty(p.receipts,id,{value:{xp:r.xp,contribution:r.contribution},enumerable:true,writable:true,configurable:true});}
 return p;
}
export function validateProfile(x){
 if(!obj(x)||x.format!=='gogogym-local'||x.version!==1||typeof x.id!=='string'||!/^[\w-]{1,80}$/.test(x.id)||!Array.isArray(x.characters)||x.characters.length<1||x.characters.length>5)bad();
 const characters=x.characters.map(c=>{if(!obj(c)||typeof c.id!=='string'||!/^[\w-]{1,80}$/.test(c.id)||!ACCENTS.includes(c.accent))bad();return {id:c.id,name:cleanName(c.name),accent:c.accent,progress:validateProgress(c.progress)};});
 if(new Set(characters.map(c=>c.id)).size!==characters.length||!characters.some(c=>c.id===x.activeId))bad();
 return {format:'gogogym-local',version:1,id:x.id,name:cleanName(x.name),activeId:x.activeId,daily:daily(x.daily),characters};
}
export function parseBackup(text){if(typeof text!=='string'||new TextEncoder().encode(text).length>2_000_000)throw Error('存檔上限為 2 MB。');let data;try{data=JSON.parse(text);}catch{bad();}return validateProfile(data);}
function encodeProfile(profile){const raw=JSON.stringify(profile);if(new TextEncoder().encode(raw).length>2_000_000)throw Error('存檔已超過 2 MB，請先匯出備份。');return raw;}
export const activeCharacter=p=>p?.characters.find(c=>c.id===p.activeId)||null;
export function settleProfile(profile,characterId,training){
 const next=validateProfile(profile),c=activeCharacter(next);if(c.id!==characterId)throw Error('角色已切換，本節未儲存，請重新開始。');
 const result=completeTraining({...c.progress,daily:next.daily},training);c.progress=result.player;next.daily=structuredClone(result.player.daily);return {profile:next,reward:result.reward};
}
export class LocalProfiles{
 constructor(storage,locks){this.storage=storage;this.locks=locks;}
 read(){const raw=this.storage.getItem(PROFILE_KEY);return raw?parseBackup(raw):null;}
 async change(fn){
  if(!this.locks)throw Error('此瀏覽器未支援安全本機存檔，請使用新版 Chrome、Edge、Firefox 或 Safari。');
  return this.locks.request(PROFILE_KEY,()=>{const next=validateProfile(fn(this.read()));this.storage.setItem(PROFILE_KEY,encodeProfile(next));return next;});
 }
 create(profileName,name,accent){return this.change(p=>{
  if(!ACCENTS.includes(accent))bad();if(p?.characters.length>=5)throw Error('最多建立 5 個角色，可編輯現有角色名字及配色。');
  let progress=newPlayer();if(!p){const old=this.storage.getItem(LEGACY_KEY);if(old)progress=validateProgress(JSON.parse(old));}
  const c={id:crypto.randomUUID(),name:cleanName(name),accent,progress};
  if(!p)p={format:'gogogym-local',version:1,id:crypto.randomUUID(),name:cleanName(profileName),daily:structuredClone(progress.daily),characters:[],activeId:c.id};
  p.name=cleanName(profileName);p.characters.push(c);return p;
 });}
 edit(id,name,accent,profileName){return this.change(p=>{if(!p||!ACCENTS.includes(accent))bad();const c=p.characters.find(c=>c.id===id);if(!c)bad();c.name=cleanName(name);c.accent=accent;p.name=cleanName(profileName);return p;});}
 select(id){return this.change(p=>{if(!p?.characters.some(c=>c.id===id))bad();p.activeId=id;return p;});}
 async settle(profileId,id,training){let reward;const profile=await this.change(p=>{if(p?.id!==profileId)throw Error('玩家檔案已改變，請重新入場。');const result=settleProfile(p,id,training);reward=result.reward;return result.profile;});return {profile,reward};}
 snapshot(){return this.storage.getItem(PROFILE_KEY);}
 replace(candidate,expected){
  if(!this.locks)throw Error('請使用支援本機存檔的新版瀏覽器。');
  return this.locks.request(PROFILE_KEY,()=>{
  const raw=this.snapshot();if(raw!==expected)throw Error('其他分頁已更新存檔，請重新選擇檔案再確認。');
  let current=null;try{current=this.read();}catch{}
  const next=validateProfile(candidate),today=periodKeys(Date.now()).day;
  // Importing an older backup should not replenish today's shared allowance.
  const used=[...new Set([...(current?.daily.key===today?current.daily.categories:[]),...(next.daily.key===today?next.daily.categories:[])])];
  if(used.length>3)throw Error('兩份存檔今日已用類別合共超過三類，請明日重置後再匯入。');
  next.daily={key:today,categories:used};
  const encoded=encodeProfile(next);
  if(raw)this.storage.setItem(PROFILE_KEY+'.previous',raw);
  this.storage.setItem(PROFILE_KEY,encoded);
  return next;
 });}
}
