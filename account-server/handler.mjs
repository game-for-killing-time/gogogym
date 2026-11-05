import {newPlayer,completeTraining,CATEGORIES,periodKeys} from '../src/training.mjs';
import {createSession,tick,input,releaseInputs,sessionResult} from '../src/session.mjs';
export const ACCENTS=['#81e8bb','#f2c28e','#b7b8f5','#edabb8'];
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const query=(db,sql,...v)=>db.prepare(sql).bind(...v);
const first=(db,sql,...v)=>query(db,sql,...v).first();
const view=row=>row?{name:row.name,accent:row.accent,progress:JSON.parse(row.progress),revision:row.revision}:null;
// Replay a bounded input trace at the same fixed simulation step used by the client.
export function replay(category,events,steps){
  if(!Number.isInteger(steps)||steps<1||steps>7200||!Array.isArray(events)||events.length>1200)fail(400,'訓練紀錄不完整。');
  const allowed={push:['lift'],pull:['row'],legs:['squat'],core:['left','right'],cardio:['left','right','sprint']}[category];
  let prior=-1;
  for(const e of events){if(!Array.isArray(e)||e.length!==3||!Number.isInteger(e[0])||e[0]<prior||e[0]<0||e[0]>=steps||(!allowed.includes(e[1])&&e[1]!=='release')||typeof e[2]!=='boolean')fail(400,'訓練紀錄不正確。');prior=e[0];}
  const s=createSession(category);let at=0;
  for(let i=0;i<steps;i++){
    if(s.done)fail(400,'訓練紀錄超出完成時間。');
    while(events[at]?.[0]===i){const e=events[at++];if(e[1]==='release')releaseInputs(s);else input(s,e[1],e[2]);}
    tick(s,1/60);
  }
  const result=sessionResult(s);if(!result.qualified)fail(400,'未完成足夠有效操作，本次不扣券。');return result;
}
export async function handleAccount(request,db,{verifyToken,config=null,now=Date.now}={}){
  const url=new URL(request.url);if(!url.pathname.startsWith('/api/account'))return null;
  try{
    if(url.pathname==='/api/account/config'&&request.method==='GET')return json({enabled:!!config,config});
    if(!config||!verifyToken)fail(503,'會員登入尚未開放，暫時可繼續本機試玩。');
    if(!['GET','POST'].includes(request.method))fail(405,'不支援此操作。');
    if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)fail(403,'請從遊戲網站操作。');
    let uid;try{uid=await verifyToken(request.headers.get('authorization')?.replace(/^Bearer /,''));}catch{fail(401,'登入已失效，請重新登入。');}
    const time=now(),path=url.pathname;
    if(path==='/api/account/me'&&request.method==='GET')return json({character:view(await first(db,'SELECT * FROM gym_accounts WHERE uid=?',uid)),serverTime:time});
    if(request.method!=='POST')fail(405,'請使用儲存操作。');
    if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'需要 JSON 資料。');
    const raw=await request.text();if(new TextEncoder().encode(raw).length>65536)fail(413,'資料過大。');
    let body;try{body=JSON.parse(raw);}catch{fail(400,'資料格式錯誤。');}if(!body||Array.isArray(body))fail(400,'資料格式錯誤。');
    if(path==='/api/account/character'){
      const name=typeof body.name==='string'?body.name.trim():'';
      if(!name||[...name].length>16||/[<>\x00-\x1f\x7f]/.test(name)||!ACCENTS.includes(body.accent))fail(400,'請填寫1至16字名字及選擇會員配色。');
      await query(db,`INSERT INTO gym_accounts(uid,name,accent,progress,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(uid) DO UPDATE SET name=excluded.name,accent=excluded.accent,updated_at=excluded.updated_at`,uid,name,body.accent,JSON.stringify(newPlayer()),time,time).run();
    }else{
      const account=await first(db,'SELECT * FROM gym_accounts WHERE uid=?',uid);if(!account)fail(409,'請先建立角色。');
      if(path==='/api/account/training/start'){
        if(!CATEGORIES.includes(body.category))fail(400,'器材類別不正確。');
        // Validate the daily limit using authoritative time without granting a reward.
        try{completeTraining(JSON.parse(account.progress),{id:'check',category:body.category,score:0,now:time});}catch{fail(409,'今日此類訓練已完成，或訓練券已用完。');}
        const id=crypto.randomUUID();
        await db.batch([query(db,'DELETE FROM gym_training_sessions WHERE uid=? AND (result IS NULL OR expires_at<?)',uid,time),query(db,'INSERT INTO gym_training_sessions(id,uid,category,started_at,expires_at) VALUES(?,?,?,?,?)',id,uid,body.category,time,time+30*60000)]);
        return json({id,serverTime:time});
      }else if(path==='/api/account/training/finish'){
        const s=await first(db,'SELECT * FROM gym_training_sessions WHERE id=? AND uid=?',body.id,uid);if(!s)fail(404,'找不到本節訓練，請重新開始。');
        if(s.result)return json({...JSON.parse(s.result),character:view(account),serverTime:time});
        if(s.expires_at<time||periodKeys(s.started_at).day!==periodKeys(time).day)fail(409,'本節已逾時或跨越每日重置，請重新開始。');
        const result=replay(s.category,body.events,body.steps);
        if(body.steps/60*1000>time-s.started_at+250)fail(400,'訓練時間不正確。');
        for(let attempt=0;attempt<5;attempt++){
          const current=await first(db,'SELECT * FROM gym_accounts WHERE uid=?',uid);let settled;
          try{settled=completeTraining(JSON.parse(current.progress),{id:s.id,category:s.category,score:result.score,now:time});}catch{fail(409,'每日訓練額度已變更，請重新載入進度。');}
          const payload={reward:settled.reward,score:result.score};
          const changed=await query(db,'UPDATE gym_accounts SET progress=?,revision=revision+1,updated_at=? WHERE uid=? AND revision=?',JSON.stringify(settled.player),time,uid,current.revision).run();
          if(changed.meta.changes){await query(db,'UPDATE gym_training_sessions SET result=? WHERE id=? AND uid=?',JSON.stringify(payload),s.id,uid).run();return json({...payload,character:view(await first(db,'SELECT * FROM gym_accounts WHERE uid=?',uid)),serverTime:time});}
        }
        fail(409,'進度正由另一裝置更新，請重試。');
      }else fail(404,'找不到此操作。');
    }
    return json({character:view(await first(db,'SELECT * FROM gym_accounts WHERE uid=?',uid)),serverTime:time});
  }catch(error){return json({message:error.status?error.message:'暫時未能儲存，請稍後重試。'},error.status||500);}
}
