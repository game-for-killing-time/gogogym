import {objects, blocked} from '../src/room.mjs';

export const CAPACITY=12, PLAYER_TTL=20_000, ROOM_TTL=24*60*60*1000;
export const COLORS=['#81e8bb','#f2c28e','#a9c9f5','#efb4c3','#d6c2f4','#eee69e','#9edbd8','#e9aa80','#c4dd97','#b9c6e8','#d3b49c','#b8e3ce'];
const stations=new Map(objects.filter(o=>o.stationKey).map(o=>[o.stationKey,o]));
const phases={push:['charge','lower','rest'],pull:['pull','recover','rest'],legs:['descend','rise','rest'],core:['balance'],cardio:['running']};
const allowedEmotes=new Set(['','☺','♡','✦']), encoder=new TextEncoder();
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
class ApiError extends Error{constructor(status,error,message){super(message);this.status=status;this.error=error;}}
const fail=(status,error,message)=>{throw new ApiError(status,error,message);};
const statement=(db,sql,...args)=>db.prepare(sql).bind(...args);
const first=(db,sql,...args)=>statement(db,sql,...args).first();
const run=(db,sql,...args)=>statement(db,sql,...args).run();
const changes=result=>Number(result.meta?.changes??result.changes??0);
const cutoff=now=>now-PLAYER_TTL;
const newToken=()=>crypto.randomUUID()+crypto.randomUUID();
const hash=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))),v=>v.toString(16).padStart(2,'0')).join('');
function roomCode(){const a=new Uint8Array(6);crypto.getRandomValues(a);return Array.from(a,v=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[v%32]).join('');}
function nameOf(value){
  if(typeof value!=='string')fail(400,'INVALID_NAME','請輸入暱稱。');
  const name=value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f<>]/g,'').trim();
  if(!name||Array.from(name).length>16)fail(400,'INVALID_NAME','暱稱請使用 1 至 16 個字。');
  return name;
}
function gymNameOf(value){
  if(value===undefined)return '街角健身室';
  if(typeof value!=='string')fail(400,'INVALID_ROOM_NAME','請輸入健身室名稱。');
  const name=value.normalize('NFKC').trim();
  if(!name||Array.from(name).length>24||/[\u0000-\u001f\u007f-\u009f<>]/.test(name))fail(400,'INVALID_ROOM_NAME','健身室名稱請使用 1 至 24 個字，不可含標籤或控制字元。');
  return name;
}
function finite(value,min,max,label){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(400,'INVALID_STATE',`${label}不正確。`);return value;}
function integer(value,min,max,label){finite(value,min,max,label);if(!Number.isSafeInteger(value))fail(400,'INVALID_STATE',`${label}不正確。`);return value;}
function stateOf(state,player){
  if(!state||typeof state!=='object'||Array.isArray(state))fail(400,'INVALID_STATE','角色狀態不正確。');
  const x=finite(state.x,35,1158,'位置'),y=finite(state.y,263,653,'位置'),dir=integer(state.dir,0,3,'方向');
  if(blocked(x,y))fail(400,'INVALID_STATE','角色位置不可通行。');
  if(typeof state.moving!=='boolean')fail(400,'INVALID_STATE','移動狀態不正確。');
  const emote=state.emote??'';
  if(!allowedEmotes.has(emote))fail(400,'INVALID_STATE','表情不正確。');
  let exercise=null;
  if(state.exercise!=null){
    const e=state.exercise,s=stations.get(e.stationKey);
    if(!s||s.stationKey!==player.station_key||e.category!==s.id)fail(409,'STATION_NOT_CLAIMED','請先取得器材位置。');
    if(!phases[s.id].includes(e.phase))fail(400,'INVALID_STATE','訓練階段不正確。');
    exercise={stationKey:s.stationKey,category:s.id,time:finite(e.time,0,3600,'時間'),phase:e.phase,rep:integer(e.rep??0,0,6,'次數'),height:finite(e.height??0,0,1,'動作'),extension:finite(e.extension??0,0,1,'動作'),depth:finite(e.depth??0,0,1,'動作'),balance:finite(e.balance??0,-1,1,'重心'),sprint:e.sprint===true,paused:e.paused===true};
  }
  return {x,y,dir,moving:state.moving,emote,exercise};
}
function initialExercise(s){return {stationKey:s.stationKey,category:s.id,time:0,phase:phases[s.id][0],rep:0,height:0,extension:0,depth:0,balance:0,sprint:false,paused:false};}
async function readBody(request){
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail(415,'JSON_REQUIRED','請使用 JSON 請求。');
  if(Number(request.headers.get('content-length'))>8192)fail(413,'BODY_TOO_LARGE','請求過大。');
  const reader=request.body?.getReader();let bytes=0,chunks=[];
  if(!reader)fail(400,'INVALID_JSON','請求內容不正確。');
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192){await reader.cancel();fail(413,'BODY_TOO_LARGE','請求過大。');}chunks.push(value);}
  const all=new Uint8Array(bytes);let offset=0;for(const value of chunks){all.set(value,offset);offset+=value.length;}
  let body;try{body=JSON.parse(new TextDecoder().decode(all));}catch{fail(400,'INVALID_JSON','請求內容不正確。');}
  if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'INVALID_JSON','請求內容不正確。');
  return body;
}
async function room(db,code,now){
  if(!await first(db,'SELECT code FROM gym_rooms WHERE code = ? AND expires_at > ?',code,now))fail(404,'ROOM_NOT_FOUND','找不到房間，請確認房間碼或建立新房間。');
}
async function member(db,code,token,now,allowExpired=false){
  if(typeof token!=='string'||token.length!==72)fail(401,'INVALID_SESSION','房間連線已失效，請重新加入。');
  const p=await first(db,'SELECT * FROM gym_players WHERE room_code = ? AND token_hash = ?',code,await hash(token));
  if(!p)fail(401,'INVALID_SESSION','房間連線已失效，請重新加入。');
  if(!allowExpired&&p.seen_at<=cutoff(now))fail(401,'SESSION_EXPIRED','連線已逾時，正在重新加入房間。');
  return p;
}
export async function getSnapshot(db,code,now=Date.now()){
  const result=await statement(db,'SELECT id,name,color,x,y,dir,moving,station_key,exercise_json,emote,emote_until FROM gym_players WHERE room_code = ? AND seen_at > ? ORDER BY joined_at,id',code,cutoff(now)).all();
  const gym=await first(db,'SELECT name FROM gym_rooms WHERE code = ?',code);
  return {roomCode:code,roomName:gym?.name||'街角健身室',capacity:CAPACITY,serverTime:now,players:result.results.map(p=>({id:p.id,name:p.name,color:p.color,x:p.x,y:p.y,dir:p.dir,moving:!!p.moving,emote:p.emote_until>now?p.emote:'',exercise:p.station_key&&p.exercise_json?JSON.parse(p.exercise_json):null,connected:true}))};
}
async function addMember(db,code,name,now){
  const token=newToken(),id=crypto.randomUUID(),color=COLORS[Math.floor(Math.random()*COLORS.length)];
  const inserted=await run(db,`INSERT INTO gym_players(id,room_code,token_hash,name,color,seen_at,joined_at)
    SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM gym_players WHERE room_code = ? AND seen_at > ?) < ?`,id,code,await hash(token),name,color,now,now,code,cutoff(now),CAPACITY);
  if(!changes(inserted))fail(409,'ROOM_FULL','房間已滿 12 人，請稍後再加入。');
  return {roomCode:code,playerId:id,token,seq:-1,snapshot:await getSnapshot(db,code,now)};
}
/** Stateless handler shared by Node preview and hosted D1 Worker. */
export async function handleMultiplayer(request,db,options={}){
  const url=new URL(request.url),pathname=url.pathname;
  if(!pathname.startsWith('/api/rooms'))return null;
  try{
    if(request.method!=='POST')fail(405,'METHOD_NOT_ALLOWED','請使用 POST 請求。');
    const origin=request.headers.get('origin');
    if(origin&&origin!==url.origin)fail(403,'ORIGIN_REJECTED','此房間只接受同一網站的請求。');
    const body=await readBody(request),now=options.now?options.now():Date.now();
    if(pathname==='/api/rooms'){
      const name=nameOf(body.name),roomName=gymNameOf(body.roomName);
      await run(db,'DELETE FROM gym_rooms WHERE code IN (SELECT code FROM gym_rooms WHERE expires_at <= ? LIMIT 10)',now);
      if((await first(db,'SELECT COUNT(*) AS total FROM gym_rooms')).total>=1000)fail(503,'SERVER_BUSY','房間暫時已滿，請稍後再試。');
      for(let attempt=0;attempt<6;attempt++){
        const code=roomCode(),made=await run(db,'INSERT OR IGNORE INTO gym_rooms(code,created_at,expires_at,name) VALUES(?,?,?,?)',code,now,now+ROOM_TTL,roomName);
        if(changes(made))return response(await addMember(db,code,name,now),201);
      }
      fail(503,'SERVER_BUSY','暫時未能建立房間，請稍後再試。');
    }
    const match=pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/(join|sync|exercise|leave)$/i);
    if(!match)fail(404,'NOT_FOUND','找不到這項房間操作。');
    const code=match[1].toUpperCase(),action=match[2].toLowerCase();await room(db,code,now);
    if(action==='join'){
      if(body.token){
        const p=await member(db,code,body.token,now,true),expired=p.seen_at<=cutoff(now);
        const renewed=await run(db,`UPDATE gym_players SET seen_at=?,moving=0,
          station_key=CASE WHEN seen_at<=? THEN NULL ELSE station_key END,
          exercise_json=CASE WHEN seen_at<=? THEN NULL ELSE exercise_json END
          WHERE id=? AND token_hash=? AND (seen_at > ? OR (SELECT COUNT(*) FROM gym_players WHERE room_code=? AND seen_at>?) < ?)`,now,cutoff(now),cutoff(now),p.id,p.token_hash,cutoff(now),code,cutoff(now),CAPACITY);
        if(!changes(renewed))fail(409,'ROOM_FULL','房間已滿 12 人，請稍後再加入。');
        return response({roomCode:code,playerId:p.id,token:body.token,seq:p.seq,resumed:true,expired,snapshot:await getSnapshot(db,code,now)});
      }
      return response(await addMember(db,code,nameOf(body.name),now),201);
    }
    const p=await member(db,code,body.token,now,action==='leave');
    if(action==='leave'){
      await run(db,'DELETE FROM gym_players WHERE id=? AND token_hash=?',p.id,p.token_hash);
      return response({left:true,snapshot:await getSnapshot(db,code,now)});
    }
    if(action==='exercise'){
      const station=body.stationKey===null?null:stations.get(body.stationKey);
      if(body.stationKey!==null&&!station)fail(400,'INVALID_STATION','找不到這款器材。');
      const updated=station
        ? await run(db,`UPDATE gym_players SET station_key=?,exercise_json=?,moving=0,seen_at=? WHERE id=? AND token_hash=?
            AND NOT EXISTS (SELECT 1 FROM gym_players other WHERE other.room_code=? AND other.station_key=? AND other.seen_at>? AND other.id<>?)`,station.stationKey,JSON.stringify(initialExercise(station)),now,p.id,p.token_hash,code,station.stationKey,cutoff(now),p.id)
        : await run(db,'UPDATE gym_players SET station_key=NULL,exercise_json=NULL,moving=0,seen_at=? WHERE id=? AND token_hash=?',now,p.id,p.token_hash);
      if(!changes(updated))fail(409,'STATION_BUSY','這件器材有人使用中，請先選另一款。');
      return response({snapshot:await getSnapshot(db,code,now)});
    }
    const seq=integer(body.seq,0,Number.MAX_SAFE_INTEGER,'同步次序');
    if(seq<=p.seq)return response({snapshot:await getSnapshot(db,code,now)});
    const state=stateOf(body.state,p),newEmote=state.emote&&state.emote!==p.emote_input;
    const result=await run(db,`UPDATE gym_players SET x=?,y=?,dir=?,moving=?,seq=?,seen_at=?,
      exercise_json=CASE WHEN station_key IS ? THEN ? ELSE exercise_json END,
      emote=?,emote_until=?,emote_input=? WHERE id=? AND token_hash=? AND seq<? AND seen_at>?`,
      state.x,state.y,state.dir,state.exercise?0:Number(state.moving),seq,now,p.station_key,
      state.exercise?JSON.stringify(state.exercise):p.exercise_json,
      state.emote?state.emote:'',newEmote?now+3000:p.emote_until,state.emote,p.id,p.token_hash,seq,cutoff(now));
    if(!changes(result))await member(db,code,body.token,now);
    return response({snapshot:await getSnapshot(db,code,now)});
  }catch(error){
    if(error instanceof ApiError)return response({error:error.error,message:error.message},error.status);
    options.onError?.(error);
    return response({error:'SERVER_ERROR',message:'房間暫時未能連線，請稍後再試。'},500);
  }
}
