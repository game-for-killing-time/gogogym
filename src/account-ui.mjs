import {authMessage} from './account.mjs';
const colors=[['#81e8bb','薄荷'],['#f2c28e','蜂蜜'],['#b7b8f5','紫藤'],['#edabb8','櫻花']];
export function accountPanel({account,show,safe,onDone,onLogout}){
  const $=s=>document.querySelector(s),character=account.character;
  const portrait='<div class="portrait"><img src="assets/runtime/c01-walk-v1.png" alt="C01 棕髮角色"></div>';
  const error='<p id="account-error" role="status" aria-live="polite"></p>';
  const run=async fn=>{
    const buttons=[...document.querySelectorAll('#dialog-body button')];buttons.forEach(b=>b.disabled=true);
    try{await fn();}catch(e){if($('#account-error'))$('#account-error').textContent=authMessage(e);}finally{buttons.forEach(b=>b.disabled=false);}
  };
  if(account.user){
    if(account.loading){show('<h2 id="dialog-title">正在取回你的會員紀錄…</h2><p>請稍等，準備好就可以入場。</p>','雲端會員');return;}
    if(account.error){show(`<h2 id="dialog-title">未能載入會員紀錄</h2><p>${safe(account.error)}</p><div class="actions"><button id="reload-account">重新載入</button><button id="logout-account">登出</button></div>${error}`,'會員服務');$('#reload-account').onclick=()=>run(async()=>{account.error='';await account.refresh();onDone();});$('#logout-account').onclick=()=>run(onLogout);return;}
    show(`<div class="account-heading">${portrait}<div><small>街角健身室 · 會員證</small><h2 id="dialog-title">${character?'我的角色':'由今日開始，留下進步。'}</h2></div></div><p>${character?'改個名字，揀返今日嘅心情。':'建立你的第一個角色。之後登入，就可以繼續訓練。'}</p><form id="character-form"><label class="room-field">角色名字<input id="character-name" maxlength="16" required autocomplete="nickname" value="${safe(character?.name||'')}" placeholder="朋友會點稱呼你？"></label><fieldset class="accent-options"><legend>會員配色</legend>${colors.map(([c,n])=>`<label><input type="radio" name="accent" value="${c}" ${(character?.accent||colors[0][0])===c?'checked':''}><i style="background:${c}"></i>${n}</label>`).join('')}</fieldset><p class="mini-note">目前造型：C01 棕髮、灰背心。配色用於會員證；更多髮型及服裝稍後加入。</p><div class="actions"><button class="primary" type="submit">${character?'保存角色':'建立角色並入場'}</button><button type="button" id="logout-account">登出</button></div></form>${error}`,'雲端會員');
    $('#character-form').onsubmit=e=>{e.preventDefault();const name=$('#character-name').value,accent=$('input[name="accent"]:checked').value;run(async()=>{await account.create(name,accent);onDone();});};
    $('#logout-account').onclick=()=>run(onLogout);return;
  }
  show(`<div class="account-heading">${portrait}<div><small>街角健身室 · 歡迎返嚟</small><h2 id="dialog-title">你嘅角色，等緊你。</h2></div></div><p>登入後保存角色與訓練進度，換裝置都可以繼續。</p>${account.enabled?'':'<p class="account-notice">會員登入尚未開放。你可以先繼續本機試玩，原有進度會保留。</p>'}<button class="google-login" id="google-login" ${account.enabled?'':'disabled'}>使用 Google 登入</button><form id="login-form"><label class="room-field">Email<input id="account-email" type="email" required autocomplete="email" ${account.enabled?'':'disabled'}></label><label class="room-field">密碼<input id="account-password" type="password" required minlength="6" autocomplete="current-password" ${account.enabled?'':'disabled'}></label><div class="actions"><button class="primary" type="submit" ${account.enabled?'':'disabled'}>登入</button><button type="button" id="register-account" ${account.enabled?'':'disabled'}>建立帳戶</button></div></form><div class="account-links"><button id="reset-password" ${account.enabled?'':'disabled'}>忘記密碼</button><button id="guest-play">繼續本機試玩</button></div>${error}<p class="mini-note">本機試玩與雲端角色分開保存，舊進度不會自動覆蓋雲端角色。</p>`,'會員登入');
  $('#login-form').onsubmit=e=>{e.preventDefault();run(()=>account.login($('#account-email').value,$('#account-password').value));};
  $('#register-account').onclick=()=>{if($('#login-form').reportValidity())run(()=>account.login($('#account-email').value,$('#account-password').value,true));};
  $('#google-login').onclick=()=>run(()=>account.google());
  $('#reset-password').onclick=()=>run(async()=>{const email=$('#account-email');if(!email.value||!email.reportValidity())throw Error('請先填寫 Email。');await account.reset(email.value);$('#account-error').textContent='如有符合的帳戶，你將收到重設密碼電郵。';});
  $('#guest-play').onclick=onDone;
}
