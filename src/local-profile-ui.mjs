import {ACCENTS,parseBackup,activeCharacter} from './local-profile.mjs';
const labels=['薄荷','蜂蜜','紫藤','櫻花','晴空'];
const abilityNames={push:'推力',pull:'拉力',legs:'腿部',core:'核心',cardio:'心肺'};
export function localProfilePanel({store,show,safe,onChanged,onEnter,beforeChange}){
 const $=s=>document.querySelector(s);
 const status='<p id="local-error" role="status" aria-live="polite"></p>';
 const portrait='<div class="portrait"><img src="assets/runtime/c01-walk-v1.png" alt="C01 棕髮角色"></div>';
 const run=async fn=>{const buttons=[...document.querySelectorAll('#dialog-body button')];buttons.forEach(b=>b.disabled=true);try{await fn();}catch(e){if($('#local-error'))$('#local-error').textContent=e.message||'未能儲存，請先匯出備份並檢查瀏覽器儲存空間。';}finally{buttons.forEach(b=>b.disabled=false);}};
 const backupControls='<div class="local-backups"><button id="export-profile">匯出全部角色</button><label class="import-label">匯入存檔<input id="import-profile" type="file" accept="application/json,.json"></label></div>';
 function bindBackup(p){
  $('#export-profile').disabled=!p;
  $('#export-profile').onclick=()=>run(async()=>{const latest=store.read();if(!latest)throw Error('尚未建立玩家檔案。');const blob=new Blob([JSON.stringify(latest,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`gogogym-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#local-error').textContent='已開始下載備份，請確認檔案已保存。';});
  $('#import-profile').onchange=e=>{const file=e.target.files[0];if(!file)return;run(async()=>{if(file.size>2_000_000)throw Error('請選擇 2 MB 以下的 JSON 存檔。');const candidate=parseBackup(await file.text()),expected=store.snapshot();
   show(`<h2 id="dialog-title">確認匯入玩家檔案</h2><p>玩家：${safe(candidate.name)} · ${candidate.characters.length} 個角色</p><ul>${candidate.characters.map(c=>`<li>${safe(c.name)} · 累積成長 ${Object.values(c.progress.abilities).reduce((a,b)=>a+b,0)}</li>`).join('')}</ul><p>匯入會取代此瀏覽器目前全部角色。建議先取消並匯出舊檔；本機亦會保留一份覆蓋前副本。今天已用的訓練額度會保留。</p><div class="actions"><button id="confirm-import" class="primary">確認取代並匯入</button><button id="cancel-import">取消</button></div>${status}`,'匯入備份');
   $('#cancel-import').onclick=render;$('#confirm-import').onclick=()=>run(async()=>{await beforeChange();const next=await store.replace(candidate,expected);onChanged(next);render();$('#local-error').textContent='匯入完成，請選擇角色入場。';});
  });};
 }
 function form(p,c=null){
  show(`<div class="account-heading">${portrait}<div><small>只存在你的瀏覽器</small><h2 id="dialog-title">${c?'編輯角色':p?'新增角色':'建立本機玩家檔案'}</h2></div></div><form id="local-character-form"><label class="room-field">玩家暱稱<input id="local-player-name" maxlength="16" required value="${safe(p?.name||'')}" placeholder="不用真名，無需 Email 或密碼"></label><label class="room-field">角色名字<input id="local-character-name" maxlength="16" required value="${safe(c?.name||'')}" placeholder="朋友會看到這個名字"></label><fieldset class="accent-options"><legend>角色名牌配色</legend>${ACCENTS.map((a,i)=>`<label><input type="radio" name="local-accent" value="${a}" ${(c?.accent||ACCENTS[p?.characters.length||0])===a?'checked':''}><i style="background:${a}"></i>${labels[i]}</label>`).join('')}</fieldset><p class="mini-note">目前人物造型沿用 C01。五個角色獨立成長，共用每日三張券。同一瀏覽器的使用者都能開啟此檔案。</p>${!p?'<p class="mini-note">如有舊訪客進度，會保留為第一個角色；舊原始存檔不會刪除。</p>':''}<div class="actions"><button class="primary" type="submit">${c?'儲存修改':'建立角色'}</button>${p?'<button type="button" id="cancel-character">返回角色選擇</button>':''}</div></form>${status}${backupControls}<p class="mini-note">清除網站資料可能令存檔遺失，請定期匯出備份。舊雲端角色不會自動搬入本機。</p>`,'本機玩家檔案');
  if(p)$('#cancel-character').onclick=render;
  $('#local-character-form').onsubmit=e=>{e.preventDefault();const name=$('#local-character-name').value,owner=$('#local-player-name').value,accent=$('input[name="local-accent"]:checked').value;run(async()=>{await beforeChange();const next=c?await store.edit(c.id,name,accent,owner):await store.create(owner,name,accent);onChanged(next);render();});};bindBackup(p);
 }
 function render(){
  let p;try{p=store.read();}catch(e){show(`<h2 id="dialog-title">未能讀取本機存檔</h2><p>${safe(e.message)}</p><p>原檔未覆蓋。可以匯入有效備份恢復，覆蓋前會保留原始資料副本。</p>${backupControls}${status}`,'存檔讀取失敗');bindBackup(null);return;}
  if(!p){form(null);return;}
  show(`<div class="account-heading">${portrait}<div><small>${safe(p.name)} · 本機玩家檔案</small><h2 id="dialog-title">今日，用邊個角色？</h2></div></div><p class="mini-note">最多 5 個角色，共用每日 3 張訓練券。上次使用：${safe(activeCharacter(p).name)}</p><div class="character-slots">${Array.from({length:5},(_,i)=>{const c=p.characters[i];return c?`<div class="character-slot ${c.id===p.activeId?'selected':''}" style="--slot-accent:${c.accent}"><span class="slot-number">0${i+1}</span><div><b>${safe(c.name)}</b><small>累積成長 ${Object.values(c.progress.abilities).reduce((a,b)=>a+b,0)}</small><details><summary>能力紀錄</summary>${Object.entries(abilityNames).map(([key,label])=>`<small>${label} ${c.progress.abilities[key]} · ${c.progress.mastery[key]} 節</small>`).join('')}</details></div><button class="primary" data-enter="${safe(c.id)}">選用入場</button><button data-edit="${safe(c.id)}" aria-label="編輯 ${safe(c.name)}">編輯</button></div>`:`<button class="empty-slot" data-add>＋ 建立角色 ${i+1}</button>`;}).join('')}</div>${backupControls}<p class="mini-note">角色及進度只存在此瀏覽器。換裝置請先匯出，再在另一部裝置匯入。</p>${status}`,'角色選擇');
  for(const b of document.querySelectorAll('[data-add]'))b.onclick=()=>form(store.read());
  for(const b of document.querySelectorAll('[data-edit]'))b.onclick=()=>{const latest=store.read();form(latest,latest.characters.find(c=>c.id===b.dataset.edit));};
  for(const b of document.querySelectorAll('[data-enter]'))b.onclick=()=>run(async()=>{await beforeChange();const next=await store.select(b.dataset.enter);onChanged(next);onEnter();});
  bindBackup(p);
 }
 render();
}
