import {newPlayer, completeTraining, periodKeys, CATEGORIES} from './training.mjs';
import {createSession,input,tick,sessionResult,releaseInputs} from './session.mjs';
import {objects,crops,blocked,findPath,nearestStation,stationAt} from './room.mjs';
import {camera,toScreen,toWorld,panelPosition} from './view.mjs';
import {drawExerciseActor} from './exercise-art.mjs';
import {MultiplayerClient} from './multiplayer.mjs';
import {AccountClient} from './account.mjs';
import {accountPanel} from './account-ui.mjs';

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
const storageKey='pixel-gym.player.v1';
let saveWarning='', player=load(), actor={x:1050,y:592,dir:0,walk:0}, route=[], destination=null, keys=new Set(), near=null, ready=false;
let session=null, paused=false, lastTime=0, toastTimer, currentStation=null, sessionId='', practice=false, gameCtx=null;
const art={}, frames=[];
let view={scale:1,x:0,y:0}, viewport={width:1200,height:675}, emote='',emoteUntil=0;
let goalExpanded=true;
let startingTraining=false,startGeneration=0,localMember=null,lastNetworkStatus='offline';
let accountOpen=false,accountUid=null,settling=false,trainingTrace=[],trainingSteps=0,stepRemainder=0;
let welcomeOpen=false;
const welcomeKey='pixel-gym.welcome.v1';
function rememberWelcome(){try{localStorage.setItem(welcomeKey,'seen');}catch{}}
function firstVisit(){try{return !localStorage.getItem(welcomeKey);}catch{return true;}}
function enterGuest(){rememberWelcome();welcomeOpen=false;hidePanel();if(inviteCode()&&!net.session)showRoom();}
function showWelcome(){
  show('<div class="account-heading"><div class="portrait"><img src="assets/runtime/c01-walk-v1.png" alt="C01 棕髮角色"></div><div><small>街角健身室 · 初次見面</small><h2 id="dialog-title">今日，一齊練。</h2></div></div><p>每日揀三款訓練，慢慢養成你嘅角色。<br>亦可以開房，邀請朋友一齊入場。</p><div class="welcome-choices"><button id="welcome-login" class="primary">登入／建立角色</button><p>保存雲端進度，換裝置都可以繼續。</p><button id="welcome-guest">訪客試玩</button><p>先逛逛健身室，進度只保存在此瀏覽器。</p></div>','歡迎入場');
  welcomeOpen=true;
  $('#welcome-login').onclick=()=>{rememberWelcome();showAccount();};
  $('#welcome-guest').onclick=enterGuest;
  $('#welcome-login').focus({preventScroll:true});
}
const account=new AccountClient(accountChanged);
function accountChanged(){
  const uid=account.user?.uid||null;
  if(uid!==accountUid){
    startGeneration++;releaseAll();session=null;accountUid=uid;net.leave().catch(networkError);
    player=uid?newPlayer():load();
  }
  if(account.character)player=account.character.progress;
  document.documentElement.style.setProperty('--member-accent',account.character?.accent||'#c2ccaf');
  $('#member-name').textContent=account.character?.name||localMember?.name||'街角新會員';
  updateUI();if(accountOpen)showAccount();
  else if(welcomeOpen&&account.user&&!account.loading){rememberWelcome();if(account.character)enterGuest();else showAccount();}
}
function showAccount(){
  if(session||startingTraining||settling)return;
  accountPanel({account,show,safe,onDone:()=>{hidePanel();if(inviteCode()&&!net.session)showRoom();},onLogout:async()=>{await net.leave();await account.logout();}});
  accountOpen=true;
}
const remoteMembers=new Map();
const net=new MultiplayerClient({getState:networkState,onSnapshot:receiveSnapshot,onStatus:networkStatus,onError:networkError});
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function nickname(){if(account.character)return account.character.name;try{return localStorage.getItem('pixel-gym.nickname')||'新會員';}catch{return '新會員';}}
function inviteCode(){return (new URL(location.href).searchParams.get('room')||'').toUpperCase().slice(0,6);}
function inviteLink(){const url=new URL(location.href);url.search='';url.searchParams.set('room',net.session.roomCode);url.hash='';return url.href;}
function networkState(){
  return {x:actor.x,y:actor.y,dir:actor.dir,moving:actor.walk>0,emote:performance.now()<emoteUntil?emote:null,
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
  $('#member-name').textContent=account.character?.name||localMember?.name||'街角新會員';
  updatePresence();renderRoster();updateStationAvailability();
}
function networkStatus(status){
  const previous=lastNetworkStatus;lastNetworkStatus=status;
  if(status==='offline'){
    remoteMembers.clear();localMember=null;$('#member-name').textContent=account.character?.name||'街角新會員';
    if(previous!=='offline'&&session&&!session.done){releaseAll();session=null;paused=false;hidePanel();toast('已離開連線房間，本節未扣券。');}
  }else if(status==='reconnecting'&&session&&!paused){close();toast('連線中斷，訓練已暫停，正在重新連線。');}
  updatePresence();renderRoster();
}
function networkError(error){const el=$('#room-error');if(el)el.textContent=error.message||'未能連線，請再試一次。';else toast(error.message||'未能連線，請再試一次。');}
function updatePresence(){
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
    dot.style.background=p.color;label.textContent=p.name+(p.id===net.session?.playerId?'（你）':'');
    state.textContent=p.exercise?`${names[p.exercise.category]}${p.exercise.paused?' · 暫停':'訓練中'}`:p.moving?'行走中':'休息中';li.append(dot,label,state);list.append(li);
  }
  const count=$('#room-member-count');if(count)count.textContent=`${net.snapshot?.players?.length||0} / 12 人`;
  const state=$('#room-connection');if(state)state.textContent=net.status==='online'?'同房的人會即時睇到彼此移動、訓練同表情。':'連線中斷，正在重試。';
}
function showRoom(){
  if(session||startingTraining)return;
  if(account.user&&!account.character){showAccount();return;}
  if(net.session){
    show(`<h2 id="dialog-title">一齊練，慢慢進步。</h2><div class="room-code-row"><span>房間碼 <b>${safe(net.session.roomCode)}</b></span><span id="room-member-count"></span></div><p id="room-connection"></p><label class="room-field">邀請朋友<input id="invite-link" readonly value="${safe(inviteLink())}" aria-label="邀請連結"></label><div class="actions"><button id="copy-invite" class="primary">複製邀請連結</button><button id="leave-room">離開房間</button></div><p id="room-error" role="status"></p><ul id="room-roster" class="room-roster" aria-label="同房會員"></ul>`,'共享健身室');
    renderRoster();$('#copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText(inviteLink());toast('已複製邀請連結，傳俾朋友就可以加入。');}catch{$('#invite-link').select();toast('請複製已選取的邀請連結。');}};
    $('#leave-room').onclick=async()=>{await net.leave();const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);showRoom();};
  }else{
    show(`<h2 id="dialog-title">朋友一齊嚟做 gym</h2><p>開一間最多12人嘅房，或者用朋友嘅房間碼加入。</p><label class="room-field">你的名字<input id="nickname" maxlength="16" autocomplete="nickname" value="${safe(nickname())}" placeholder="點稱呼你？"></label><div class="actions"><button id="create-room" class="primary">開新房間</button></div><form id="join-room-form"><label class="room-field">朋友的房間碼<input id="room-code" maxlength="6" autocapitalize="characters" spellcheck="false" autocomplete="off" value="${safe(inviteCode())}" placeholder="6位房間碼"></label><button id="join-room" type="submit">加入房間</button></form><p id="room-error" role="status"></p><p class="mini-note">名字會顯示俾同房朋友。訓練成長仍保存喺各自瀏覽器。</p>`,'多人健身室');
    const enter=async creating=>{
      const name=$('#nickname').value.trim(),code=$('#room-code').value.trim().toUpperCase();
    if(!name){$('#room-error').textContent='請先輸入名字。';return;}
      if(!creating&&!/^[A-Z0-9]{6}$/.test(code)){$('#room-error').textContent='請輸入6位房間碼。';return;}
      $('#create-room').disabled=$('#join-room').disabled=true;$('#room-error').textContent='正在連線…';
      try{if(creating)await net.create(name);else await net.join(code,name);try{localStorage.setItem('pixel-gym.nickname',name);}catch{}
        history.replaceState(null,'',inviteLink());showRoom();toast('已加入房間，可以一齊行走同訓練。');
      }catch(error){if($('#room-error'))$('#room-error').textContent=error.message||'未能加入，請再試一次。';if($('#create-room'))$('#create-room').disabled=$('#join-room').disabled=false;}
    };
    $('#create-room').onclick=()=>enter(true);$('#join-room-form').onsubmit=e=>{e.preventDefault();enter(false);};
  }
}
const panelOpen=()=>!dialog.hidden;
function syncControls(){
  document.body.dataset.training=String(!!session);
  for(const id of ['courses','profile','friends','emotes','help','presence','account-main'])$('#'+id).disabled=!!session||startingTraining;
  $('#goal-content').hidden=!goalExpanded||!!session;
  $('#toggle-goal').disabled=!!session;
  $('#toggle-goal').setAttribute('aria-expanded',String(!$('#goal-content').hidden));
  $('#goal-toggle-icon').textContent=$('#goal-content').hidden?'+':'−';
}
function hidePanel(){welcomeOpen=false;accountOpen=false;dialog.hidden=true;dialog.style.left='';dialog.style.top='';syncControls();canvas.focus();}
function courses(open){$('#courses-panel').hidden=!open;$('#courses').setAttribute('aria-expanded',String(open));}
$('#courses').onclick=()=>{if(session)return;hidePanel();courses($('#courses-panel').hidden);};
$('#close-courses').onclick=()=>{courses(false);$('#courses').focus();};
$('#toggle-goal').onclick=()=>{goalExpanded=!goalExpanded;syncControls();};
$('#friends').onclick=$('#presence').onclick=showRoom;
$('#account-main').onclick=()=>{rememberWelcome();showAccount();};
$('#emotes').onclick=()=>{
  show('<h2 id="dialog-title">打個招呼</h2><div class="emote-options"><button data-emote="☺" aria-label="微笑">☺</button><button data-emote="♡" aria-label="愛心">♡</button><button data-emote="✦" aria-label="加油">✦</button></div>','表情');
  for(const b of document.querySelectorAll('[data-emote]'))b.onclick=()=>{emote=b.dataset.emote;emoteUntil=performance.now()+3000;hidePanel();};
};

function load(){
  try{
    const raw=localStorage.getItem(storageKey);if(!raw)return newPlayer();
    const p=JSON.parse(raw);
    if(!CATEGORIES.every(c=>Number.isFinite(p.abilities?.[c])&&p.abilities[c]>=0&&Number.isFinite(p.mastery?.[c])&&p.mastery[c]>=0)||!Array.isArray(p.daily?.categories)||!Array.isArray(p.weekly?.days)||!Array.isArray(p.weekly?.categories)||!Number.isFinite(p.weekly?.contributions)||!p.receipts)throw Error('invalid');
    return p;
  }catch{saveWarning='無法讀取存檔，本次暫用新進度；原存檔未覆蓋。';return newPlayer();}
}
function save(){
  if(account.user)return;
  try{localStorage.setItem(storageKey,JSON.stringify(player));saveWarning='';}
  catch{saveWarning='未能儲存：進度只保留到本頁關閉。';}
}
function daily(){return player.daily.key===periodKeys(Date.now()+account.offset).day?player.daily.categories:[];}
function weekly(){return player.weekly.key===periodKeys(Date.now()+account.offset).week?player.weekly.contributions:0;}
function canTrain(category){return (!account.user||!!account.character)&&daily().length<3&&!daily().includes(category);}
function updateUI(){
  $('#account-main').textContent=account.user?(account.character?'我的會員角色':'建立角色'):'登入／建立角色';
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
  $('#total').textContent=`累積成長 ${Object.values(player.abilities).reduce((a,b)=>a+b,0)}`;
  $('#save-state').textContent=account.user?(account.error||(!account.character?'正在載入會員資料':'雲端角色 · 完成訓練後保存')):saveWarning||'本機試玩 · 登入可建立雲端角色';
}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3600);}
function show(content,tag='訓練準備',contextual=false){
  welcomeOpen=false;accountOpen=false;
  keys.clear();route=[];destination=null;$('#dialog-tag').textContent=tag;$('#dialog-body').innerHTML=content;
  courses(false);dialog.hidden=false;dialog.dataset.context=String(contextual);dialog.classList.toggle('contextual',contextual);
  if(!contextual){dialog.style.left='';dialog.style.top='';}
  syncControls();$('#close').focus({preventScroll:true});
}
function close(){
  if(welcomeOpen){enterGuest();return;}
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
    const cloudSession=!isPractice&&account.user?await account.api('training/start',{category:station.id}):null;
    if(generation!==startGeneration){releaseStation();return;}
    practice=isPractice;session=createSession(station.id);sessionId=cloudSession?.id||crypto.randomUUID();trainingTrace=[];trainingSteps=0;stepRemainder=0;paused=false;renderGame();
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
  if(settling)return;settling=true;
  const result=sessionResult(session);
  let reward={xp:0,contribution:0},message='這次練習不扣券，亦不增加能力。';
  if(!result.qualified){message='未完成足夠操作，本次不扣券。再試一次，跟住提示慢慢做。';}
  else if(!practice){
    try{
      // Refresh before settling so another tab's completed work is not silently discarded.
      if(account.user){
        show('<h2 id="dialog-title">正在保存今次努力…</h2><p>請稍等，正在確認訓練紀錄。</p>','雲端結算',true);
        const completed=await account.api('training/finish',{id:sessionId,events:trainingTrace,steps:trainingSteps});reward=completed.reward;result.score=completed.score;
      }else{
        player=load();const completed=completeTraining(player,{id:sessionId,category:session.category,score:result.score,now:Date.now()});
        player=completed.player;reward=completed.reward;save();
      }
      message=account.user?'訓練完成！已保存雲端，使用 1 張訓練券。':'訓練完成！已使用 1 張訓練券。';
    }catch(error){
      if(account.user){settling=false;show(`<h2 id="dialog-title">未能確認存檔</h2><p>${safe(error.message)}</p><p>保留今次紀錄，重試不會重複扣券。</p><div class="actions"><button id="retry-settle" class="primary">重試儲存</button></div>`,'雲端結算',true);$('#retry-settle').onclick=finish;return;}
      message='今天的正式訓練額度已變更，本次以練習結算，沒有扣券。';
    }
  }
  const category=session.category;releaseAll();session=null;settling=false;releaseStation();updateUI();
  show(`<h2 id="dialog-title">${result.qualified?'練好一點，就有進步。':'再試一組，慢慢掌握。'}</h2><div class="result-score">${Math.round(result.score*100)}<small>技巧評分 / 100</small></div><p>${message}</p><div class="reward-list"><div><b>+${reward.xp}</b><span>${names[category]}成長</span></div><div><b>+${reward.xp?1:0}</b><span>器材熟練次數</span></div><div><b>+${reward.contribution}</b><span>本週建設貢獻</span></div></div><div class="actions"><button class="primary" id="back">繼續活動</button><button id="again">再練習一次</button></div>`,'本次訓練成果',true);
  $('#back').onclick=close;$('#again').onclick=()=>start(true);
  $('#welcome').textContent=reward.xp?'今日的努力已經留下，休息一下吧。':'享受練習，找到自己的節奏。';
}
$('#help').onclick=()=>{
  show('<h2 id="dialog-title">歡迎來到街角健身室</h2><p>用方向鍵或 WASD 行走，亦可點選地板。點選器材或它的名稱，角色會自動走近；靠近後按 E 使用。右下角課表列出全部五款訓練。</p><div class="instruction">每天 3 張券，同類每天正式訓練一次。完成先扣券，自由練習不限次。香港時間每天 04:00 補回。</div><p>跑步機、臥推、划船機、深蹲架及核心墊均可使用。兩部跑步機共用心肺類別。按「房間」開房或輸入房間碼，最多12人可互相睇到移動、訓練同表情。每件器材同時一人使用。天台場景尚未開放，訓練進度仍存於各自瀏覽器。</p><div class="actions"><button id="restart">另開一份試玩進度</button></div><p class="mini-note">原進度會備份於此瀏覽器；此功能只供原型試玩。</p>','玩法說明');
  $('#restart').onclick=()=>{
    if(account.user){toast('雲端角色不使用本機重置，請先登出。');return;}
    try{localStorage.setItem(`${storageKey}.backup.${Date.now()}`,JSON.stringify(player));}
    catch{toast('未能備份原進度，請先繼續使用現有存檔。');return;}
    player=newPlayer();save();updateUI();hidePanel();toast('已備份原進度，開始新的試玩。');
  };
};
$('#profile').onclick=()=>show(`<h2 id="dialog-title">我的角色</h2><p>C01 · 棕髮新會員。每一次完成，都會留在你的紀錄。</p><div class="stats">${CATEGORIES.map(c=>`<div class="stat"><b>${names[c]}　${player.abilities[c]}</b><span>已完成 ${player.mastery[c]} 節</span></div>`).join('')}</div><p>本週個人建設貢獻：${weekly()}。此為進度預覽，天台場景尚未開放。</p>`,'會員紀錄');

const map={w:'up',ArrowUp:'up',s:'down',ArrowDown:'down',a:'left',ArrowLeft:'left',d:'right',ArrowRight:'right'};
window.addEventListener('keydown',e=>{
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
window.addEventListener('storage',e=>{if(e.key===storageKey&&!account.user){player=load();updateUI();}});
for(const b of document.querySelectorAll('[data-move]')){
  b.onpointerdown=e=>{e.preventDefault();if(session||panelOpen())return;b.setPointerCapture(e.pointerId);route=[];destination=null;keys.add(b.dataset.move);};
  b.onpointerup=b.onpointercancel=()=>keys.delete(b.dataset.move);
}
canvas.addEventListener('pointerdown',e=>{
  if(!ready||session||startingTraining)return;if(panelOpen())hidePanel();courses(false);canvas.focus();const rect=canvas.getBoundingClientRect();
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
  const label=member.name+(self?' · 你':''),width=Math.min(150,c.measureText(label).width+23);
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
  if(panelOpen()||session||startingTraining||(net.session&&net.status!=='online')){dx=dy=0;}else if(!dx&&!dy&&route.length){
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
    if(o.isPlayer){ctx.fillStyle='#222b3455';ctx.beginPath();ctx.ellipse(actor.x,actor.y-2,22,7,0,0,Math.PI*2);ctx.fill();drawActor(ctx,actor.x,actor.y,actor.dir,actor.walk?1+Math.floor(actor.walk*7)%2:0);ctx.fillStyle='#81e8bb';ctx.beginPath();ctx.moveTo(actor.x-6,actor.y-117);ctx.lineTo(actor.x+6,actor.y-117);ctx.lineTo(actor.x,actor.y-110);ctx.fill();nameplate(ctx,localMember,actor.x,actor.y-133,true);}
    else if(o.isRemote){
      const p=o.member;ctx.fillStyle='#222b3455';ctx.beginPath();ctx.ellipse(p.renderX,p.renderY-2,22,7,0,0,Math.PI*2);ctx.fill();
      drawActor(ctx,p.renderX,p.renderY,p.dir,p.moving?1+Math.floor(time/140)%2:0);nameplate(ctx,p,p.renderX,p.renderY-116);
      if(p.emote){ctx.font='bold 24px sans-serif';ctx.fillStyle=p.color;ctx.fillText(p.emote,p.renderX,p.renderY-150);}
    }
    else{
      const workout=workouts.get(o.stationKey);
      if(workout){drawActiveProp(ctx,o);drawExerciseActor(ctx,o,workout.pose,art,frames,workout.self?paused:workout.pose.paused);nameplate(ctx,workout.member,o.x,o.y-137,workout.self);}
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
      if(restored&&inviteCode()&&net.session.roomCode!==inviteCode())await net.leave();
      else if(restored){await net.release();if(localMember){actor.x=localMember.x;actor.y=localMember.y;}toast('已返回共享健身室。');}
      if(!welcomeOpen&&!accountOpen&&inviteCode()&&(!net.session||net.session.roomCode!==inviteCode()))showRoom();
    }catch(error){networkError(error);if(!welcomeOpen&&!accountOpen&&inviteCode())showRoom();}
  }catch{$('#loading').textContent='素材載入失敗，請重新整理頁面。';}
}
const showStats=$('#profile').onclick;
$('#profile').onclick=()=>{showStats();const b=document.createElement('button');b.className='primary account-entry';b.textContent=account.user?'會員角色／帳戶':'登入／建立角色';b.onclick=showAccount;$('#dialog-body').prepend(b);};
setInterval(updateUI,10000);if(firstVisit())showWelcome();init();account.init();

