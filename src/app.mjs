import {newPlayer, periodKeys, CATEGORIES} from './training.mjs';
import {createSession,input,tick,sessionResult,releaseInputs} from './session.mjs';
import {objects,crops,blocked,findPath,nearestStation,stationAt} from './room.mjs';
import {camera,toScreen,toWorld,panelPosition} from './view.mjs';
import {drawExerciseActor,drawWalkingActor} from './exercise-art.mjs';
import {playerLook,safeLook} from './appearance-model.mjs';
import {EvolutionUI} from './evolution-ui.mjs';
import {splitReward} from './evolution.mjs';
import {MultiplayerClient} from './multiplayer.mjs';
import {LocalProfiles,PROFILE_KEY,activeCharacter} from './local-profile.mjs';
import {localProfilePanel} from './local-profile-ui.mjs';

const $=s=>document.querySelector(s), canvas=$('#room'),ctx=canvas.getContext('2d'), dialog=$('#dialog');
const names={push:'推力',pull:'拉力',legs:'腿部',core:'核心',cardio:'心肺'};
const exercises={
  cardio:{length:'25 秒',hint:'腳印到中線時，按 <b>A / D</b> 左右踏步。<br>按住 <b>Shift</b> 衝刺，放開回氣。',actions:[['left','A · 左腳'],['right','D · 右腳'],['sprint','Shift · 衝刺']]},
  push:{length:'6 次動作',hint:'按住 <b>空白鍵</b> 發力，進入右方綠區時放開。<br>回落至左方綠區，再按一下接住。',actions:[['lift','SPACE · 按住發力 → 放開 → 接住']]},
  pull:{length:'6 次動作',hint:'按住 <b>空白鍵</b> 拉動手柄，到綠區時放開。<br>等手柄回收，再開始下一次。',actions:[['row','SPACE · 按住拉動 → 綠區放開']]},
  legs:{length:'6 次動作',hint:'按住 <b>空白鍵</b> 慢慢下蹲，到綠區時放開。<br>角色會穩定起身，再開始下一次。',actions:[['squat','SPACE · 按住下蹲 → 綠區放開']]},
  core:{length:'25 秒',hint:'按住 <b>A / D</b> 向左或向右修正重心。<br>將指標保持在中央綠區，放開即可停止修正。',actions:[['left','A · 向左修正'],['right','D · 向右修正']]},
};
const inputSources=new Map();
const profiles=new LocalProfiles(localStorage,navigator.locks);
let profile=null,entered=false,trainingCharacterId='',trainingProfileId='';
let saveWarning='', player=load(), actor={x:1050,y:592,dir:0,walk:0}, route=[], destination=null, keys=new Set(), near=null, ready=false;
let session=null, paused=false, lastTime=0, toastTimer, currentStation=null, sessionId='', practice=false, gameCtx=null;
const art={}, frames=[];
let view={scale:1,x:0,y:0}, viewport={width:1200,height:675}, emote='',emoteUntil=0;
let goalExpanded=true;
let startingTraining=false,startGeneration=0,localMember=null,lastNetworkStatus='offline';
let accountOpen=false,settling=false,trainingTrace=[],trainingSteps=0,stepRemainder=0;
let characterUI=null;
function profileChanged(next){
  profile=next;player=activeCharacter(profile)?.progress||newPlayer();
  document.documentElement.style.setProperty('--member-accent',activeCharacter(profile)?.accent||'#c2ccaf');
  $('#member-name').textContent=profile?.name||'本機新玩家';
  saveWarning='';updateUI();
}
function showAccount(){
  if(session||startingTraining||settling)return;
  characterUI?.close(true);
  localProfilePanel({store:profiles,show,safe,onChanged:profileChanged,
    beforeChange:async()=>{await net.leave();entered=false;},
    onEnter:()=>{entered=true;hidePanel();if(inviteCode()&&!net.session)showRoom();}});
  accountOpen=true;
}
const remoteMembers=new Map();
const net=new MultiplayerClient({getState:networkState,onSnapshot:receiveSnapshot,onStatus:networkStatus,onError:networkError});
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function nickname(){return profile?.name||'新會員';}
function inviteCode(){return (new URL(location.href).searchParams.get('room')||'').toUpperCase().slice(0,6);}
function inviteLink(){const url=new URL(location.href);url.search='';url.searchParams.set('room',net.session.roomCode);url.hash='';return url.href;}
function networkState(){
  return {x:actor.x,y:actor.y,dir:actor.dir,moving:actor.walk>0,look:playerLook(player),emote:performance.now()<emoteUntil?emote:null,
    exercise:session?{stationKey:currentStation.stationKey,category:session.category,time:session.time,phase:session.phase,rep:session.rep,height:session.height,extension:session.extension,depth:session.depth,balance:session.balance,sprint:session.sprint,paused}:null};
}
function receiveSnapshot(snapshot){
  const present=new Set();
  for(const member of snapshot.players){
    if(member.id===net.session?.playerId){localMember=member;continue;}
    present.add(member.id);
    const previous=remoteMembers.get(member.id);
    remoteMembers.set(member.id,{...member,renderX:previous?.renderX??member.x,renderY:previous?.renderY??member.y,
      pose:previous?.exercise?.stationKey===member.exercise?.stationKey?previous?.pose:member.exercise?{...member.exercise}:null,receivedAt:performance.now()});
  }
  for(const id of remoteMembers.keys())if(!present.has(id))remoteMembers.delete(id);
  if(session&&!session.done&&net.status==='online'&&localMember&&!localMember.exercise){
    releaseAll();session=null;paused=false;hidePanel();toast('器材位置已釋放，請重新選擇訓練。');
  }
  $('#member-name').textContent=profile?.name||'本機新玩家';
  updatePresence();renderRoster();updateStationAvailability();
}
function networkStatus(status){
  const previous=lastNetworkStatus;lastNetworkStatus=status;
  if(status==='offline'){
    remoteMembers.clear();localMember=null;$('#member-name').textContent=profile?.name||'本機新玩家';
    if(previous!=='offline'&&session&&!session.done){releaseAll();session=null;paused=false;hidePanel();toast('已離開連線房間，本節未扣券。');}
  }else if(status==='reconnecting'&&session&&!paused){close();toast('連線中斷，訓練已暫停，正在重新連線。');}
  updatePresence();renderRoster();
}
function networkError(error){const el=$('#room-error');if(el)el.textContent=error.message||'未能連線，請再試一次。';else toast(error.message||'未能連線，請再試一次。');}
function updatePresence(){
  $('#gym-name').textContent=net.snapshot?.roomName||'街角健身室';
  $('#gym-name').title=$('#gym-name').textContent;
  const count=net.snapshot?.players?.length||0;
  $('#presence').textContent=net.status==='online'?`● ${count} / 12 人在線`:net.status==='reconnecting'?'◌ 正在重新連線':net.status==='connecting'?'◌ 正在加入房間':'● 開房邀請朋友';
  $('#presence').dataset.status=net.status;
}
function stationUser(station){return [...remoteMembers.values()].find(p=>p.exercise?.stationKey===station.stationKey);}
function updateStationAvailability(){
  const notice=$('#station-availability');if(!notice||!currentStation||session)return;
  const owner=stationUser(currentStation),unavailable=!!owner||!!net.session&&net.status!=='online';
  notice.textContent=owner?`${owner.name} 正在使用，可以先揀另一件器材。`:net.session&&net.status!=='online'?'正在重新連線，連線恢復後可開始。':canTrain(currentStation.id)?'完成先扣 1 張券。':daily().includes(currentStation.id)?'今日已完成此類，可繼續練習。':'今日額度已用完，可繼續練習。';
  $('#formal').disabled=startingTraining||unavailable||!canTrain(currentStation.id);$('#practice').disabled=startingTraining||unavailable;
}
function renderRoster(){
  const list=$('#room-roster');if(!list)return;list.replaceChildren();
  for(const p of net.snapshot?.players||[]){
    const li=document.createElement('li'),dot=document.createElement('i'),label=document.createElement('span'),state=document.createElement('small');
    dot.style.background=p.color;label.textContent=p.id===net.session?.playerId?'你':p.name;
    state.textContent=`第 ${safeLook(p.look).stage} 階 · `+(p.exercise?`${names[p.exercise.category]}${p.exercise.paused?' · 暫停':'訓練中'}`:p.moving?'行走中':'休息中');li.append(dot,label,state);list.append(li);
  }
  const count=$('#room-member-count');if(count)count.textContent=`${net.snapshot?.players?.length||0} / 12 人`;
  const state=$('#room-connection');if(state)state.textContent=net.status==='online'?'同房的人會睇到彼此體型、穿搭、移動同訓練。':'連線中斷，正在重試。';
}
function showRoom(){
  if(session||startingTraining)return;
  if(!entered||!activeCharacter(profile)){showAccount();return;}
  if(net.session){
    show(`<h2 id="dialog-title">${safe(net.snapshot?.roomName||"街角健身室")}</h2><div class="room-code-row"><span>房間碼 <b>${safe(net.session.roomCode)}</b></span><span id="room-member-count"></span></div><p id="room-connection"></p><label class="room-field">邀請朋友<input id="invite-link" readonly value="${safe(inviteLink())}" aria-label="邀請連結"></label><div class="actions"><button id="copy-invite" class="primary">複製邀請連結</button><button id="leave-room">離開房間</button></div><p id="room-error" role="status"></p><ul id="room-roster" class="room-roster" aria-label="同房會員"></ul>`,'共享健身室');
    renderRoster();$('#copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText(inviteLink());toast('已複製邀請連結，傳俾朋友就可以加入。');}catch{$('#invite-link').select();toast('請複製已選取的邀請連結。');}};
    $('#leave-room').onclick=async()=>{await net.leave();const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);showRoom();};
  }else{
    show(`<h2 id="dialog-title">朋友一齊嚟做 gym</h2><p>開一間最多12人嘅房，或者用朋友嘅房間碼加入。</p><label class="room-field">你的名字<input id="nickname" readonly maxlength="16" autocomplete="nickname" value="${safe(nickname())}" placeholder="點稱呼你？"></label><label class="room-field">健身室名稱<input id="room-name" maxlength="24" value="街角健身室" placeholder="幫健身室改個名"></label><div class="actions"><button id="create-room" class="primary">開新房間</button></div><form id="join-room-form"><label class="room-field">朋友的房間碼<input id="room-code" maxlength="6" autocapitalize="characters" spellcheck="false" autocomplete="off" value="${safe(inviteCode())}" placeholder="6位房間碼"></label><button id="join-room" type="submit">加入房間</button></form><p id="room-error" role="status"></p><p class="mini-note">同房朋友會看見你的名字、體型及已儲存穿搭。訓練成長仍保存在本機。</p>`,'多人健身室');
    const enter=async creating=>{
      const name=nickname(),code=$('#room-code').value.trim().toUpperCase();
    if(!name){$('#room-error').textContent='請先輸入名字。';return;}
      if(creating&&!$('#room-name').value.trim()){$('#room-error').textContent='請輸入健身室名稱。';return;}
      if(!creating&&!/^[A-Z0-9]{6}$/.test(code)){$('#room-error').textContent='請輸入6位房間碼。';return;}
      $('#create-room').disabled=$('#join-room').disabled=true;$('#room-error').textContent='正在連線…';
      try{if(creating)await net.create(name,$('#room-name').value.trim());else await net.join(code,name);try{localStorage.setItem('pixel-gym.nickname',name);}catch{}
        history.replaceState(null,'',inviteLink());showRoom();toast('已加入房間，可以一齊行走同訓練。');
      }catch(error){if($('#room-error'))$('#room-error').textContent=error.message||'未能加入，請再試一次。';if($('#create-room'))$('#create-room').disabled=$('#join-room').disabled=false;}
    };
    $('#create-room').onclick=()=>enter(true);$('#join-room-form').onsubmit=e=>{e.preventDefault();enter(false);};
  }
}
const panelOpen=()=>!dialog.hidden||!!characterUI?.isOpen;
function syncControls(){
  document.body.dataset.training=String(!!session);
  for(const id of ['courses','profile','friends','emotes','help','presence'])$('#'+id).disabled=!!session||startingTraining;
  $('#goal-content').hidden=!goalExpanded||!!session;
  $('#toggle-goal').disabled=!!session;
  $('#toggle-goal').setAttribute('aria-expanded',String(!$('#goal-content').hidden));
  $('#goal-toggle-icon').textContent=$('#goal-content').hidden?'+':'−';
}
function hidePanel(){accountOpen=false;dialog.hidden=true;dialog.style.left='';dialog.style.top='';syncControls();canvas.focus();}
function courses(open){$('#courses-panel').hidden=!open;$('#courses').setAttribute('aria-expanded',String(open));}
$('#courses').onclick=()=>{if(session)return;hidePanel();courses($('#courses-panel').hidden);};
$('#close-courses').onclick=()=>{courses(false);$('#courses').focus();};
$('#toggle-goal').onclick=()=>{goalExpanded=!goalExpanded;syncControls();};
$('#friends').onclick=$('#presence').onclick=showRoom;

$('#emotes').onclick=()=>{
  show('<h2 id="dialog-title">打個招呼</h2><div class="emote-options"><button data-emote="☺" aria-label="微笑">☺</button><button data-emote="♡" aria-label="愛心">♡</button><button data-emote="✦" aria-label="加油">✦</button></div>','表情');
  for(const b of document.querySelectorAll('[data-emote]'))b.onclick=()=>{emote=b.dataset.emote;emoteUntil=performance.now()+3000;hidePanel();};
};

function load(){
  try{profile=profiles.read();return activeCharacter(profile)?.progress||newPlayer();}
  catch{saveWarning='本機存檔讀取失敗，原檔未覆蓋。';return newPlayer();}
}
function daily(){return profile?.daily.key===periodKeys(Date.now()).day?profile.daily.categories:[];}
function weekly(){return player.weekly.key===periodKeys(Date.now()).week?player.weekly.contributions:0;}
function canTrain(category){return (entered&&!!activeCharacter(profile))&&daily().length<3&&!daily().includes(category);}
function updateUI(){
  document.documentElement.style.setProperty('--member-accent',activeCharacter(profile)?.accent||'#c2ccaf');

  const count=3-daily().length;
  $('#tickets').textContent=`${count} / 3`;
  $('#daily-count').textContent=`${daily().length} / 3`;
  $('#daily-bar').style.width=`${daily().length/3*100}%`;
  $('#ticket-icons').textContent=Array.from({length:3},(_,i)=>i<count?'▰':'▱').join(' ');
  for(const c of CATEGORIES){
    $(`#${c}-state`).textContent=daily().includes(c)?'✓ 已完成':count?'前往':'可練習';
    $(`[data-course="${c}"]`).classList.toggle('completed',daily().includes(c));
  }
  $('#date').textContent=new Intl.DateTimeFormat('zh-HK',{month:'2-digit',day:'2-digit',timeZone:'Asia/Hong_Kong'}).format(new Date());
  $('#goal-count').textContent=`${weekly()} / 8`;
  $('#goal-bar').style.width=`${Math.min(100,weekly()/8*100)}%`;

  characterUI?.refresh();
  $('#save-state').textContent=saveWarning||'本機自動存檔 · 請定期匯出備份';
  $('#member-name').textContent=profile?.name||'本機新玩家';
}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3600);}
function show(content,tag='訓練準備',contextual=false){
  accountOpen=false;
  keys.clear();route=[];destination=null;$('#dialog-tag').textContent=tag;$('#dialog-body').innerHTML=content;
  courses(false);dialog.hidden=false;dialog.dataset.context=String(contextual);dialog.classList.toggle('contextual',contextual);
  if(!contextual){dialog.style.left='';dialog.style.top='';}
  syncControls();$('#close').focus({preventScroll:true});
}
function close(){
  if(characterUI?.isOpen){characterUI.close();return;}
  if(!entered){toast('請先建立或選擇角色入場。');return;}
  if(settling)return;
  if(startingTraining){startGeneration++;hidePanel();return;}
  if(session&&!session.done){
    paused=true;
    releaseAll();
    show('<h2 id="dialog-title">先休息一下？</h2><p>離開不扣券，也不會獲得成長。</p><div class="actions"><button id="resume" class="primary">繼續訓練</button><button id="quit">離開這一節</button></div>','訓練暫停',true);
    $('#resume').onclick=()=>{if(net.session&&net.status!=='online'){toast('正在重新連線，請稍等一下。');return;}paused=false;renderGame();};
    $('#quit').onclick=()=>{session=null;paused=false;releaseStation();hidePanel();};
  }else{session=null;hidePanel();}
}
$('#close').onclick=close;
function goTo(station){
  if(!entered){showAccount();return;}
  if(!ready||session||startingTraining)return;
  hidePanel();courses(false);
  const o=typeof station==='string'?objects.filter(o=>o.id===station).sort((a,b)=>Math.hypot(actor.x-a.approach.x,actor.y-a.approach.y)-Math.hypot(actor.x-b.approach.x,actor.y-b.approach.y))[0]:station;
  if(!o)return;destination=o;route=findPath(actor,o.approach);
  if(Math.hypot(actor.x-o.approach.x,actor.y-o.approach.y)<25){route=[];destination=null;choose(o);}
  else if(!route.length){destination=null;toast('請先行到中央通道，再揀器材。');}
  else{toast(`行去${o.name}，準備開始。`);canvas.focus();}
}
for(const button of document.querySelectorAll('[data-course]'))button.onclick=()=>goTo(button.dataset.course);
$('#near').onclick=()=>near&&choose(near);
function choose(o){
  currentStation=o;session=null;paused=false;
  const available=canTrain(o.id),exercise=exercises[o.id];
  show(`<h2 id="dialog-title">${o.name}</h2><span class="mode-tag">${names[o.id]}訓練 · ${exercise.length}</span><div class="instruction">${exercise.hint}</div><p id="station-availability"></p><div class="actions"><button id="formal" class="primary" ${available?'':'disabled'}>正式訓練 · 1 張券</button><button id="practice">自由練習</button></div>`,'器材準備',true);
  $('#formal').onclick=()=>start(false);$('#practice').onclick=()=>start(true);
  updateStationAvailability();
}
function releaseStation(){if(net.session)net.release().catch(networkError);}
async function start(isPractice){
  if(startingTraining)return;
  if(!isPractice&&!canTrain(currentStation.id)){choose(currentStation);return;}
  if(net.session&&net.status!=='online'){toast('連線恢復後就可以開始。');return;}
  const generation=++startGeneration,station=currentStation;
  startingTraining=true;syncControls();updateStationAvailability();
  try{
    if(net.session)await net.claim(station.stationKey);
    if(generation!==startGeneration){releaseStation();return;}
    if(!entered||!activeCharacter(profile))throw Error('請先選擇角色入場。');
    trainingCharacterId=profile.activeId;trainingProfileId=profile.id;
    if(generation!==startGeneration){releaseStation();return;}
    practice=isPractice;session=createSession(station.id);sessionId=crypto.randomUUID();trainingTrace=[];trainingSteps=0;stepRemainder=0;paused=false;renderGame();
  }catch(error){releaseStation();if(generation===startGeneration){toast(error.message||'未能開始訓練，請再試一次。');choose(station);}}
  finally{startingTraining=false;syncControls();updateStationAvailability();}
}
function renderGame(){
  const exercise=exercises[session.category];
  show(`<div class="training-top"><h2 id="dialog-title">${currentStation.name}</h2><span id="exercise-progress"></span><span>${practice?'自由練習':'正式訓練'}</span></div><canvas id="exercise" width="400" height="65" aria-label="訓練指標，跟隨下方提示操作"></canvas><p class="feedback" id="feedback" aria-live="polite"></p><div class="game-buttons">${exercise.actions.map(([action,label])=>`<button class="${exercise.actions.length===1?'primary hold':''}" data-action="${action}"${session.category==='cardio'&&action!=='sprint'?'':' aria-pressed="false"'}>${label}</button>`).join('')}</div>`,'訓練進行中 · Esc 暫停',true);
  gameCtx=$('#exercise').getContext('2d');
  for(const b of document.querySelectorAll('[data-action]')){
    b.onpointerdown=e=>{e.preventDefault();if(!session||paused)return;b.setPointerCapture(e.pointerId);sendInput(b.dataset.action,`pointer:${e.pointerId}`,true);};
    b.onpointerup=e=>sendInput(b.dataset.action,`pointer:${e.pointerId}`,false);
    b.onpointercancel=b.onlostpointercapture=e=>{
      if(inputSources.get(b.dataset.action)?.has(`pointer:${e.pointerId}`)&&session&&!paused)close();
    };
    b.onclick=e=>{if(e.detail===0&&session&&!paused){const action=b.dataset.action;sendInput(action,'accessible',!inputSources.get(action)?.has('accessible'));if(session.category==='cardio'&&action!=='sprint')sendInput(action,'accessible',false);}};
  }
  exerciseFrame();
}
function sendInput(action,source,down){
  if(!session||paused||!action)return;
  const sources=inputSources.get(action)||new Set(),wasDown=sources.size>0;
  if(down)sources.add(source);else sources.delete(source);
  inputSources.set(action,sources);
  if(wasDown!==!!sources.size){trainingTrace.push([trainingSteps,action,!!sources.size]);input(session,action,!!sources.size);}
  const b=$(`[data-action="${action}"]`);if(b){b.classList.toggle('pressed',!!sources.size);if(b.hasAttribute('aria-pressed'))b.setAttribute('aria-pressed',String(!!sources.size));}
}
function keyboardAction(e){
  if(!session)return null;
  if(e.code==='Space')return {push:'lift',pull:'row',legs:'squat'}[session.category]||null;
  if(['cardio','core'].includes(session.category)){
    if(e.code==='KeyA'||e.code==='ArrowLeft')return 'left';
    if(e.code==='KeyD'||e.code==='ArrowRight')return 'right';
    if(e.key==='Shift'&&session.category==='cardio')return 'sprint';
  }
  return null;
}
async function finish(){
  if(settling||!session)return;settling=true;
  const finishingSession=session;
  const result=sessionResult(session);
  let reward={xp:0,contribution:0},message='這次練習不扣券，亦不增加能力。';
  if(!result.qualified){message='未完成足夠操作，本次不扣券。再試一次，跟住提示慢慢做。';}
  else if(!practice){
    try{
      const completed=await profiles.settle(trainingProfileId,trainingCharacterId,{id:sessionId,category:session.category,score:result.score,now:Date.now()});
      if(session!==finishingSession)return;
      profileChanged(completed.profile);reward=completed.reward;
      message='訓練完成！已保存本機，使用 1 張共用訓練券。';
    }catch(error){
      if(session!==finishingSession)return;
      settling=false;saveWarning='本節尚未儲存，請重試或匯出備份。';updateUI();
      show(`<h2 id="dialog-title">本節未能儲存</h2><p>${safe(error.message)}</p><p>請保留此頁重試；同一節不會重複派獎。若每日額度已用完，可以放棄本次獎勵。</p><div class="actions"><button id="retry-settle" class="primary">重試儲存</button><button id="abandon-settle">放棄本次獎勵</button></div>`,'本機存檔',true);
      $('#retry-settle').onclick=finish;
      $('#abandon-settle').onclick=()=>{session=null;releaseStation();player=load();saveWarning='';updateUI();hidePanel();};return;
    }
  }

  const category=session.category;releaseAll();session=null;settling=false;releaseStation();updateUI();
  show(`<h2 id="dialog-title">${result.qualified?'練好一點，就有進步。':'再試一組，慢慢掌握。'}</h2><div class="result-score">${Math.round(result.score*100)}<small>技巧評分 / 100</small></div><p>${message}</p>${reward.xp?`<p>${splitReward(category,reward.xp).map(m=>`${m.name} +${m.xp}`).join(" · ")||"心肺耐力成長"}</p>`:""}<div class="reward-list"><div><b>+${reward.xp}</b><span>${names[category]}成長</span></div><div><b>+${reward.xp?1:0}</b><span>器材熟練次數</span></div><div><b>+${reward.contribution}</b><span>本週建設貢獻</span></div></div><div class="actions"><button class="primary" id="back">繼續活動</button><button id="again">再練習一次</button><button id="view-growth">查看肌群</button></div>`,'本次訓練成果',true);
  $('#back').onclick=close;$('#again').onclick=()=>start(true);$('#view-growth').onclick=openCharacter;
  $('#welcome').textContent=reward.xp?'今日的努力已經留下，休息一下吧。':'享受練習，找到自己的節奏。';
}
$('#help').onclick=()=>{
  show('<h2 id="dialog-title">街角健身室</h2><p>方向鍵或 WASD 移動，E 使用器材。每日五個角色共用三張券，同類只計一次；自由練習不限次。香港時間每日 04:00 重置。</p><p>角色選擇內可建立最多五個角色、編輯名字及配色、匯出／匯入整份存檔。切換角色會先離開多人房間。角色及進度只保存於此瀏覽器，清除網站資料可能令存檔遺失。</p><p>多人房間最多十二人，暱稱及動作會傳送給同房玩家。無需 Email 或密碼。角色頁可查看肌群與五階體型、保存三套穿搭；同房玩家會看到目前外觀。舊雲端角色保留但不會自動匯入。</p>','玩法說明');
};

const map={w:'up',ArrowUp:'up',s:'down',ArrowDown:'down',a:'left',ArrowLeft:'left',d:'right',ArrowRight:'right'};
window.addEventListener('keydown',e=>{
  if(characterUI?.isOpen)return;
  if(e.key==='Escape'){e.preventDefault();if(panelOpen())close();else courses(false);return;}
  if(panelOpen()){
    if(session&&!paused){
      const action=keyboardAction(e);
      if(action){e.preventDefault();if(!e.repeat)sendInput(action,e.code,true);}
    }return;
  }
  if(['BUTTON','INPUT'].includes(document.activeElement?.tagName))return;
  const direction=map[e.key]||map[e.key.toLowerCase()];
  if(direction){e.preventDefault();keys.add(direction);route=[];destination=null;}
  if(e.key.toLowerCase()==='e'&&near){e.preventDefault();choose(near);}
});
window.addEventListener('keyup',e=>{
  keys.delete(map[e.key]||map[e.key.toLowerCase()]);
  const action=keyboardAction(e);if(action){e.preventDefault();sendInput(action,e.code,false);}
});
function releaseAll(){keys.clear();inputSources.clear();if(session){if(!session.done)trainingTrace.push([trainingSteps,'release',false]);releaseInputs(session);}}
window.addEventListener('blur',()=>{releaseAll();if(session&&!session.done&&!paused)close();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseAll();if(session&&!session.done&&!paused)close();}});
window.addEventListener('storage',e=>{if(e.key===PROFILE_KEY||e.key===null){
  const oldId=profile?.id,oldCharacter=profile?.activeId,oldName=profile?.name;player=load();
  if(profile?.id!==oldId||profile?.activeId!==oldCharacter||profile?.name!==oldName){characterUI?.close();startGeneration++;releaseAll();session=null;settling=false;entered=false;net.leave().catch(networkError);showAccount();}
  else if(accountOpen&&!session)showAccount();updateUI();
}});
for(const b of document.querySelectorAll('[data-move]')){
  b.onpointerdown=e=>{e.preventDefault();if(!entered||session||panelOpen())return;b.setPointerCapture(e.pointerId);route=[];destination=null;keys.add(b.dataset.move);};
  b.onpointerup=b.onpointercancel=()=>keys.delete(b.dataset.move);
}
canvas.addEventListener('pointerdown',e=>{
  if(!ready||session||startingTraining||!entered)return;if(panelOpen())hidePanel();courses(false);canvas.focus();const rect=canvas.getBoundingClientRect();
  const {x,y}=toWorld({x:e.clientX-rect.left,y:e.clientY-rect.top},view);
  const clicked=stationAt({x,y});
  if(clicked){goTo(clicked);return;}
  destination=null;route=findPath(actor,{x,y});if(!route.length)toast('點一下空地，就可以行過去。');
});

function drawProp(c,type,x,y,w,h){const r=crops[type];c.drawImage(art.props,...r,x-w/2,y-h,w,h);}
function drawActiveProp(c,o){
  const [sx,sy,sw,sh]=crops[o.type];
  const strip=(x,y,w,h,dy=y)=>c.drawImage(art.props,sx+x,sy+y,w,h,o.x-o.w/2+x*o.w/sw,o.y-o.h+dy*o.h/sh,w*o.w/sw,h*o.h/sh);
  if(o.id==='push')strip(0,105,sw,sh-105);
  else if(o.id==='legs'){
    strip(0,0,sw,69);strip(0,136,sw,sh-136);
    // Keep both rack posts while the animated bar replaces the atlas bar.
    strip(56,140,30,67,69);strip(196,140,30,67,69);
  }else if(!o.flat)drawProp(c,o.type,o.x,o.y,o.w,o.h);
}
function drawActor(c,x,y,dir,frame,height=103){
  const r=frames[dir*3+frame];if(!r)return;const width=height*r.w/r.h;
  c.drawImage(art.actor,r.x,r.y,r.w,r.h,x-width/2,y-height,width,height);
}
function nameplate(c,member,x,y,self=false){
  if(!member)return;c.font='bold 11px Microsoft JhengHei';c.textAlign='center';
  const label=self?'你':member.name,width=Math.min(150,c.measureText(label).width+23);
  c.fillStyle='#192332ed';c.beginPath();c.roundRect(x-width/2,y-14,width,21,4);c.fill();
  c.fillStyle=member.color;c.fillRect(x-width/2+5,y-7,5,5);c.fillStyle='#fff0d3';c.fillText(label,x+4,y,135);
}
function updateRemotePoses(dt,time){
  for(const p of remoteMembers.values()){
    const mix=Math.min(1,dt*12);p.renderX+=(p.x-p.renderX)*mix;p.renderY+=(p.y-p.renderY)*mix;
    if(p.exercise){
      p.pose||={...p.exercise};
      for(const field of ['height','extension','depth','balance'])p.pose[field]+=(p.exercise[field]-p.pose[field])*mix;
      for(const field of ['category','phase','rep','paused','sprint','stationKey'])p.pose[field]=p.exercise[field];
      p.pose.time=p.exercise.time+(p.exercise.paused?0:Math.min(.35,(time-p.receivedAt)/1000));
    }else p.pose=null;
  }
}
function roomFrame(dt,time){
  updateRemotePoses(dt,time);
  let dx=(keys.has('right')?1:0)-(keys.has('left')?1:0),dy=(keys.has('down')?1:0)-(keys.has('up')?1:0);
  if(!entered||panelOpen()||session||startingTraining||(net.session&&net.status!=='online')){dx=dy=0;}else if(!dx&&!dy&&route.length){
    const p=route[0],dist=Math.hypot(p.x-actor.x,p.y-actor.y);
    if(dist<4){route.shift();}else{dx=(p.x-actor.x)/dist;dy=(p.y-actor.y)/dist;}
  }
  if(dx||dy){
    const length=Math.hypot(dx,dy);dx/=length;dy/=length;
    const nx=actor.x+dx*160*dt,ny=actor.y+dy*160*dt;
    if(!blocked(nx,actor.y))actor.x=nx;if(!blocked(actor.x,ny))actor.y=ny;
    actor.dir=Math.abs(dx)>Math.abs(dy)?dx<0?1:2:dy<0?3:0;actor.walk+=dt;
  }else actor.walk=0;
  if(destination&&!route.length&&!panelOpen()){const o=destination;destination=null;if(Math.hypot(actor.x-o.approach.x,actor.y-o.approach.y)<30)choose(o);}
  const contextual=panelOpen()&&dialog.dataset.context==='true';
  const focus=contextual?{x:currentStation.x,y:currentStation.y}:actor;
  view=camera(viewport.width,viewport.height,focus,contextual);
  const dpr=Math.min(devicePixelRatio||1,2);
  ctx.setTransform(dpr*view.scale,0,0,dpr*view.scale,dpr*view.x,dpr*view.y);
  ctx.drawImage(art.background,0,0,1200,675);
  // A floor-only overscan lets portrait cameras keep the player above touch controls.
  if(viewport.width<=600)ctx.drawImage(art.background,400,780,500,150,0,675,1200,225);
  for(const o of objects.filter(o=>o.wall||o.flat))drawProp(ctx,o.type,o.x,o.y,o.w,o.h);
  if(route.length){const p=route.at(-1);ctx.strokeStyle='#fff0d399';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y,10,5,0,0,Math.PI*2);ctx.stroke();}
  const workouts=new Map();
  for(const p of remoteMembers.values())if(p.exercise)workouts.set(p.exercise.stationKey,{member:p,pose:p.pose});
  if(session)workouts.set(currentStation.stationKey,{member:localMember,pose:session,self:true});
  const sorted=[...objects.filter(o=>!o.wall&&(!o.flat||workouts.has(o.stationKey))),...(!session?[{isPlayer:true,y:actor.y}]:[]),
    ...[...remoteMembers.values()].filter(p=>!p.exercise).map(p=>({isRemote:true,member:p,y:p.renderY}))].sort((a,b)=>a.y-b.y);
  for(const o of sorted){
    if(o.isPlayer){ctx.fillStyle='#222b3455';ctx.beginPath();ctx.ellipse(actor.x,actor.y-2,22,7,0,0,Math.PI*2);ctx.fill();drawWalkingActor(ctx,actor.x,actor.y,actor.dir,time/1000,actor.walk>0,art,frames,playerLook(player));ctx.fillStyle='#81e8bb';ctx.beginPath();ctx.moveTo(actor.x-6,actor.y-117);ctx.lineTo(actor.x+6,actor.y-117);ctx.lineTo(actor.x,actor.y-110);ctx.fill();nameplate(ctx,localMember,actor.x,actor.y-133,true);}
    else if(o.isRemote){
      const p=o.member;ctx.fillStyle='#222b3455';ctx.beginPath();ctx.ellipse(p.renderX,p.renderY-2,22,7,0,0,Math.PI*2);ctx.fill();
      drawWalkingActor(ctx,p.renderX,p.renderY,p.dir,time/1000,p.moving,art,frames,safeLook(p.look));nameplate(ctx,p,p.renderX,p.renderY-116);
      if(p.emote){ctx.font='bold 24px sans-serif';ctx.fillStyle=p.color;ctx.fillText(p.emote,p.renderX,p.renderY-150);}
    }
    else{
      const workout=workouts.get(o.stationKey);
      if(workout){drawActiveProp(ctx,o);drawExerciseActor(ctx,o,workout.pose,art,frames,workout.self?paused:workout.pose.paused,workout.self?playerLook(player):safeLook(workout.member.look));nameplate(ctx,workout.member,o.x,o.y-137,workout.self);}
      else drawProp(ctx,o.type,o.x,o.y,o.w,o.h);
    }
  }
  for(const o of objects.filter(o=>o.id)){
    ctx.font='bold 12px Microsoft JhengHei';ctx.textAlign='center';ctx.fillStyle='#192332e8';ctx.beginPath();ctx.roundRect(o.x-42,o.y+8,84,24,5);ctx.fill();ctx.fillStyle=workouts.has(o.stationKey)?'#f2c28e':'#fff0d3';ctx.fillText(o.name,o.x,o.y+24);
  }
  near=nearestStation(actor);
  $('#near').hidden=!near||panelOpen()||!!session;
  if(near){
    $('#near').textContent=`E · ${near.name} · ${stationUser(near)?'使用中':canTrain(near.id)?'開始訓練':'自由練習'}`;
    const point=toScreen({x:near.x,y:near.y+42},view);
    $('#near').style.left=`${Math.max(115,Math.min(viewport.width-115,point.x))}px`;
    $('#near').style.top=`${Math.min(viewport.height-190,point.y)}px`;
  }
  if(contextual){
    const pos=panelPosition(viewport.width,viewport.height,dialog.offsetWidth,dialog.offsetHeight,toScreen(currentStation,view));
    dialog.style.left=`${pos.left}px`;dialog.style.top=`${pos.top}px`;
  }
  if(emote&&time<emoteUntil&&!session){ctx.font='bold 25px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff0d3';ctx.fillText(emote,actor.x,actor.y-125);}
}
function exerciseFrame(){
  const c=gameCtx,s=session;if(!c||!s)return;
  c.clearRect(0,0,400,65);c.textAlign='left';c.font='11px Microsoft JhengHei';
  if(s.category==='cardio'){
    $('#exercise-progress').textContent=`剩餘 ${Math.max(0,Math.ceil(25-s.time))} 秒`;
    c.fillStyle='#c1cbc7';c.fillText('體力',5,11);c.fillStyle='#59676f';c.fillRect(37,3,358,7);c.fillStyle=s.stamina<20?'#ebaa72':'#81e8bb';c.fillRect(37,3,358*s.stamina/100,7);
    c.fillStyle='#0d1b26aa';c.fillRect(4,23,392,38);c.fillStyle='#81e8bb33';c.fillRect(181,23,38,38);c.fillStyle='#fff0d3';c.fillRect(199,19,2,46);
    for(const b of s.beats){const x=200+(b.at-s.time)*115;if(x<18||x>382||b.hit)continue;c.fillStyle=b.side==='left'?'#81e8bb':'#f2c28e';c.beginPath();c.roundRect(x-12,28,24,28,4);c.fill();c.fillStyle='#192332';c.textAlign='center';c.font='bold 13px sans-serif';c.fillText(b.side==='left'?'A':'D',x,48);}
  }else if(s.category==='core'){
    $('#exercise-progress').textContent=`剩餘 ${Math.max(0,Math.ceil(25-s.time))} 秒`;
    c.textAlign='center';c.fillStyle='#fff0d3';c.fillText(`← A 修正　　穩定 ${Math.floor(s.stableTime)} 秒　　D 修正 →`,200,13);
    c.fillStyle='#0d1b26aa';c.fillRect(8,29,384,23);c.strokeStyle='#c2ccaf';c.strokeRect(8,29,384,23);
    c.fillStyle='#81e8bb99';c.fillRect(152,30,96,21);c.fillStyle=Math.abs(s.balance)<=.25?'#fff0d3':'#f2b28e';c.fillRect(6+(s.balance+1)*192,24,5,33);
  }else{
    $('#exercise-progress').textContent=`第 ${Math.min(6,s.rep+1)} / 6 次`;
    const isPush=s.category==='push',active=['charge','pull','descend'].includes(s.phase);
    const position=isPush?s.height:s.category==='pull'?s.extension:s.depth;
    const caption=isPush?(s.phase==='charge'?'進入右方綠區時放開 →':s.phase==='lower'?'← 回落綠區時按一下接住':'放鬆，準備下一次'):active?(s.category==='pull'?'按住拉動 → 綠區放開':'按住下蹲 → 綠區放開'):s.phase==='rest'?'放鬆，準備下一次':s.category==='pull'?'← 手柄回收中，稍等一下':'← 穩定起身中，稍等一下';
    c.textAlign='center';c.fillStyle='#fff0d3';c.fillText(caption,200,13);
    c.fillStyle='#0d1b26aa';c.fillRect(8,29,384,23);c.strokeStyle='#c2ccaf';c.strokeRect(8,29,384,23);
    c.fillStyle='#81e8bb99';c.fillRect(8+(s.phase==='lower'?.09:.7)*384,30,.16*384,21);
    c.fillStyle='#fff0d3';c.fillRect(6+position*384,24,5,33);
  }
  if($('#feedback').textContent!==s.feedback)$('#feedback').textContent=s.feedback;
}
function frame(now){
  const dt=Math.min(.05,(now-lastTime)/1000||0);lastTime=now;
  if(ready){roomFrame(dt,now);if(session&&!paused&&!settling&&!session.done){stepRemainder+=dt;while(stepRemainder>=1/60&&!session.done){tick(session,1/60);trainingSteps++;stepRemainder-=1/60;}exerciseFrame();if(session.done)finish();}}
  requestAnimationFrame(frame);
}
async function init(){
  updateUI();
  try{
    await Promise.all(Object.entries({background:'assets/art-reference/gym-background-v1.png',props:'assets/art-reference/props-p01-p20-v1.png',actor:'assets/runtime/c01-walk-v1.png'}).map(([key,url])=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{art[key]=img;resolve();};img.onerror=reject;img.src=url;})));
    // Find alpha bounds within each authored cell; no labels or neighbouring cells are included.
    const probe=document.createElement('canvas');probe.width=art.actor.width;probe.height=art.actor.height;const pc=probe.getContext('2d',{willReadFrequently:true});pc.drawImage(art.actor,0,0);const pixels=pc.getImageData(0,0,probe.width,probe.height).data;
    for(let row=0;row<4;row++)for(let col=0;col<3;col++){
      const x0=Math.round(col*probe.width/3),x1=Math.round((col+1)*probe.width/3),y0=Math.round(row*probe.height/4),y1=Math.round((row+1)*probe.height/4);let minX=x1,minY=y1,maxX=x0,maxY=y0;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(pixels[(y*probe.width+x)*4+3]>120){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
      frames.push({x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1});
    }
    function resize(){
      const rect=canvas.getBoundingClientRect();viewport={width:rect.width,height:rect.height};
      const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.imageSmoothingEnabled=false;
    }
    resize();new ResizeObserver(resize).observe(canvas);syncControls();ready=true;$('#loading').hidden=true;requestAnimationFrame(frame);
    try{
      const restored=await net.restore();
      if(restored&&!entered){await net.leave();return;}
      if(restored&&inviteCode()&&net.session.roomCode!==inviteCode())await net.leave();
      else if(restored){await net.release();if(localMember){actor.x=localMember.x;actor.y=localMember.y;}toast('已返回共享健身室。');}
      if(entered&&!accountOpen&&inviteCode()&&(!net.session||net.session.roomCode!==inviteCode()))showRoom();
    }catch(error){networkError(error);if(entered&&!accountOpen&&inviteCode())showRoom();}
  }catch{$('#loading').textContent='素材載入失敗，請重新整理頁面。';}
}
function openCharacter(){if(session||startingTraining||settling)return;if(!entered){showAccount();return;}releaseAll();route=[];destination=null;hidePanel();courses(false);characterUI.open();}
characterUI=new EvolutionUI({getPlayer:()=>player,getName:()=>nickname()+' · 角色 '+(profile.characters.findIndex(c=>c.id===profile.activeId)+1),canTrain,accountLabel:()=> '角色選擇／備份',storageLabel:()=> '穿搭隨目前角色保存；匯出備份會包含全部角色衣櫃。',onAccount:showAccount,onTrain:goTo,onClose:syncControls,onSave:async(slot,outfit)=>{
 const expectedProfile=profile.id,expectedCharacter=profile.activeId;
 const next=await profiles.saveAppearance(expectedProfile,expectedCharacter,slot,outfit);
 profileChanged(next);if(net.session)net.syncNow().catch(networkError);
}});
$('#profile').onclick=openCharacter;
setInterval(updateUI,10000);showAccount();init();
