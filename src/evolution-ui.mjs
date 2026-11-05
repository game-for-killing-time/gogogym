import {MUSCLES,CATEGORY_NAMES,STAGES,ITEMS,COLORS,PRESETS,defaultOutfit,appearance,evolution,musclePoints,levelProgress} from './evolution.mjs';
import {ASSETS,paintPortrait} from './character-art.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('zh-HK',{maximumFractionDigits:1}).format(n);
const icon=name=>`<img class="ev-icon" src="${ASSETS}ui/icon-${name}.svg" alt="">`;
const groups={top:'上衣',bottom:'下裝',shoes:'鞋履',accessory:'配件'};
const apparatus={push:'臥推',pull:'划船機',legs:'深蹲架',core:'核心訓練墊',cardio:'跑步機'};
export class EvolutionUI{
 constructor(options){Object.assign(this,options);this.root=document.createElement('section');this.root.id='evolution';this.root.hidden=true;this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-label','角色進化');document.body.append(this.root);this.zones=[];
  this.root.addEventListener('click',e=>{const b=e.target.closest('[data-ev]');if(b&&!b.disabled)this.action(b.dataset.ev,b.dataset.id);});
  this.root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.close();}if(e.key==='Tab'){const list=[...this.root.querySelectorAll('button:not(:disabled),a[href]')].filter(x=>x.getClientRects().length);const i=list.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();list.at(-1)?.focus();}else if(!e.shiftKey&&i===list.length-1){e.preventDefault();list[0]?.focus();}}});
  this.zonesPromise=fetch(`${ASSETS}hotzones.json`).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{this.zones=d.regions;if(this.isOpen)this.render();}).catch(()=>{this.note='身體選取圖載入失敗，仍可用肌群按鈕查看。';if(this.isOpen)this.render();});
 }
 get isOpen(){return !this.root.hidden;}
 open(){this.returnFocus=document.activeElement;this.tab='muscles';this.facing='front';this.muscle='chest';this.stage=evolution(this.getPlayer()).stage;this.category='top';this.filter='all';this.slot=appearance(this.getPlayer()).active;this.draft={...appearance(this.getPlayer()).presets[this.slot]};this.item=this.draft.top;this.note='';this.saving=false;this.root.hidden=false;document.querySelector('.scene').inert=true;document.body.classList.add('evolution-open');this.render();this.root.querySelector('[data-ev="close"]').focus();}
 close(force=false){if(this.saving&&!force)return;this.root.hidden=true;document.querySelector('.scene').inert=false;document.body.classList.remove('evolution-open');this.onClose?.();this.returnFocus?.focus();}
 refresh(){if(this.isOpen&&!this.saving&&this.playerSnapshot!==JSON.stringify(this.getPlayer()))this.render();}
 get dirty(){return JSON.stringify(this.draft)!==JSON.stringify(appearance(this.getPlayer()).presets[this.slot])||this.slot!==appearance(this.getPlayer()).active;}
 async action(action,id){if(this.saving)return;
  if(action==='close'){this.close();return;}
  if(action==='account'){this.close();this.onAccount();return;}
  if(action==='tab'){this.tab=id;if(id==='wardrobe')this.stage=evolution(this.getPlayer()).stage;}
  if(action==='face'){this.facing=id;const visible=this.visibleMuscles();if(!visible.includes(this.muscle))this.muscle=id==='back'?'back':'chest';}
  if(action==='muscle'){this.muscle=id;}
  if(action==='stage'){this.stage=Number(id);}
  if(action==='current'){this.stage=evolution(this.getPlayer()).stage;}
  if(action==='category'){this.category=id;this.item=this.draft[id];}
  if(action==='filter'){this.filter=this.filter==='all'?'owned':'all';}
  if(action==='item'){const item=ITEMS.find(i=>i.id===id);if(!item)return;this.item=id;if(item.unlocked(this.getPlayer())){this.draft[item.slot]=id;this.note='試穿中；儲存後才套用到角色。';}else this.note=`尚未解鎖：${item.rule}`;}
  if(action==='color'){this.draft.color=id;this.note='顏色已試穿，記得儲存。';}
  if(action==='preset'){this.slot=Number(id);this.draft={...appearance(this.getPlayer()).presets[this.slot]};this.item=this.draft[this.category];this.note='已載入穿搭；儲存後套用。';}
  if(action==='cancel'){this.slot=appearance(this.getPlayer()).active;this.draft={...appearance(this.getPlayer()).presets[this.slot]};this.item=this.draft[this.category];this.note='已還原儲存的穿搭。';}
  if(action==='save'){this.saving=true;this.note='正在儲存穿搭…';this.render();try{await this.onSave(this.slot,this.draft);this.draft={...appearance(this.getPlayer()).presets[this.slot]};this.note='穿搭已儲存。';}catch(e){this.note=e.message||'未能儲存，請重試。';}finally{this.saving=false;}this.render();return;}
  if(action==='train'){this.close();this.onTrain(id);return;}
  this.render(action,id);
 }
 visibleMuscles(){return this.facing==='front'?['shoulder','biceps','quads','chest','core','calves']:['shoulder','triceps','hamstrings','back','glutes','calves'];}
 render(focusAction,focusId){const p=this.getPlayer(),ev=evolution(p),state=appearance(p),viewStage=this.tab==='wardrobe'?ev.stage:this.stage;
  this.playerSnapshot=JSON.stringify(p);const focused=document.activeElement?.closest('[data-ev]');if(!focusAction&&this.root.contains(focused)){focusAction=focused.dataset.ev;focusId=focused.dataset.id;}
  const saved=state.presets[state.active],wear=this.tab==='wardrobe'?this.draft:defaultOutfit(),scroll=this.root.scrollTop;
  this.root.innerHTML=`<header class="ev-header"><button data-ev="close">${icon('back')}<span>返回健身室</span></button><h1>角色進化</h1><nav aria-label="角色頁籤"><button data-ev="tab" data-id="muscles" aria-pressed="${this.tab==='muscles'}">${icon('front')}肌群</button><button data-ev="tab" data-id="wardrobe" aria-pressed="${this.tab==='wardrobe'}">${icon('hanger')}衣櫃</button></nav><button class="ev-account" data-ev="account">${esc(this.accountLabel())}</button></header>
   <div class="ev-content ${this.tab==='wardrobe'?'ev-wardrobe':''}"><section class="ev-stage" aria-label="角色預覽"><div class="ev-name"><strong>${esc(this.getName())}</strong><span>第 ${viewStage} 階・${STAGES[viewStage-1].name}</span>${viewStage!==ev.stage?`<button data-ev="current">返回目前第 ${ev.stage} 階</button>`:''}</div>
    <div class="ev-model"><canvas class="ev-portrait" width="1024" height="1536" role="img" aria-label="C01 第${viewStage}階${this.facing==='front'?'正面':'背面'}"></canvas>${this.tab==='muscles'?this.hotspots(viewStage):''}</div>
    ${this.tab==='muscles'?`<div class="ev-muscle-list">${this.visibleMuscles().map((id,i)=>{const l=levelProgress(musclePoints(p,id));return `<button class="ev-muscle ev-pos-${i}" data-ev="muscle" data-id="${id}" aria-pressed="${id===this.muscle}"><img src="${ASSETS}muscles/${id}.svg" alt=""><span>${MUSCLES[id].name}</span><small>Lv.${l.level}</small></button>`;}).join('')}</div>`:''}
    <div class="ev-turn"><button data-ev="face" data-id="front" aria-pressed="${this.facing==='front'}">正面</button><button data-ev="face" data-id="back" aria-pressed="${this.facing==='back'}">背面</button></div><p class="ev-caption">${this.tab==='wardrobe'?'以目前體型試穿':viewStage!==ev.stage?'體型預覽 · 肌群數值為你的實際進度':'點選身體或肌群名稱，查看成長'}</p>
    ${this.tab==='wardrobe'?`<div class="ev-presets">${PRESETS.map((name,i)=>`<button data-ev="preset" data-id="${i}" aria-pressed="${i===this.slot}">${icon('hanger')}${name}${i===state.active?'<small>使用中</small>':''}</button>`).join('')}</div>`:''}</section>
    ${this.tab==='muscles'?this.details(p,ev):this.wardrobe(p)}
   </div>${this.tab==='muscles'?this.timeline(p,ev):''}<div class="ev-notice" role="status">${esc(this.note)}</div>`;
  const portrait=this.root.querySelector('.ev-portrait');portrait.addEventListener('portraiterror',e=>{this.root.querySelector('.ev-notice').textContent=e.detail;});paintPortrait(portrait,viewStage,this.facing,wear);
  if(this.saving)this.root.querySelectorAll('button').forEach(b=>b.disabled=true);
  this.root.scrollTop=scroll;if(focusAction){[...this.root.querySelectorAll('[data-ev]')].find(b=>b.dataset.ev===focusAction&&(focusId===undefined||b.dataset.id===focusId))?.focus({preventScroll:true});}
 }
 hotspots(stage){const zones=this.zones.filter(z=>z.character===`characters/c01-stage-0${stage}-${this.facing}.png`);return `<div class="ev-hotspots">${zones.map(z=>{const id=z.id.split('-').at(-1);return z.ellipses.map(([x,y,rx,ry],i)=>`<button class="ev-hotspot ${id===this.muscle?'selected':''}" style="left:${(x-rx)/10.24}%;top:${(y-ry)/15.36}%;width:${rx/5.12}%;height:${ry/7.68}%" data-ev="muscle" data-id="${id}" aria-label="查看${MUSCLES[id].name}${i?'右側':'左側'}" aria-pressed="${id===this.muscle}"></button>`).join('');}).join('')}</div>`;}
 details(p,ev){const m=MUSCLES[this.muscle],xp=musclePoints(p,this.muscle),level=levelProgress(xp),last=p.lastTraining,recent=last&&m.sources[last.category]?last.xp*m.sources[last.category]:0;
  const selected=STAGES[this.stage-1],locked=this.stage>ev.stage;
  return `<aside class="ev-details ev-panel"><div class="ev-detail-title"><img src="${ASSETS}muscles/${this.muscle}.svg" alt=""><h2>${m.name}</h2><b>Lv.${level.level} <span>→ Lv.${level.level+1}</span></b></div><div class="ev-xp">${fmt(level.current)} <small>/ ${fmt(level.needed)}</small></div><div class="ev-progress" role="progressbar" aria-label="${m.name}升級進度" aria-valuemin="0" aria-valuemax="${level.needed}" aria-valuenow="${level.current}"><i style="width:${level.ratio*100}%"></i><span>${Math.floor(level.ratio*100)}%</span></div><p class="ev-remaining">距離升級還差 <b>${fmt(level.remaining)}</b> 點</p>
   <div class="ev-info"><strong>最近一次訓練</strong><p>${last?`${apparatus[last.category]}　${recent?`${m.name} +${fmt(recent)}`:'本次未增加此肌群'}`:'完成第一節訓練，留下你的進步。'}</p></div>
   <div class="ev-info"><strong>外觀變化</strong><p>${m.change}。累積全身成長，解鎖下一階體型。</p></div>
   <div class="ev-before-after">${[ev.stage,Math.min(5,ev.stage+1)].map((s,i)=>`<figure><img src="${ASSETS}characters/c01-stage-0${s}-${this.facing}.png" alt="第${s}階體型"><figcaption>${i?ev.stage===5?'最高階':'下一階目標':'目前體型'}</figcaption></figure>`).join('<span>›</span>')}</div>
   <div class="ev-training-links">${Object.entries(m.sources).map(([cat,weight])=>`<button class="ev-primary" data-ev="train" data-id="${cat}">${icon('dumbbell')}前往${apparatus[cat]} <small>${Math.round(weight*100)}% 成長</small></button><p>${this.canTrain(cat)?'可正式訓練 · 完成使用 1 張券':'今日此類不可正式訓練 · 可自由練習（不增加成長）'}</p>`).join('')}</div>
   <details class="ev-requirements" ${locked?'open':''}><summary>${locked?`第 ${this.stage} 階解鎖條件`:'下一階條件及五類能力'}</summary>${(locked?[{name:'整體成長',value:ev.total,target:selected.total},...['push','pull','legs','core'].map(k=>({name:CATEGORY_NAMES[k],value:p.abilities[k],target:selected.min}))]:ev.requirements).map(r=>`<p><span>${r.name}</span><b>${fmt(r.value)} / ${fmt(r.target)} ${r.value>=r.target?'✓':''}</b></p>`).join('')}<p>心肺耐力 <b>${fmt(p.abilities.cardio)} 點</b></p><small>心肺獨立累積；不直接增加肌肉體積。缺席不扣進度。</small></details></aside>`;
 }
 timeline(p,ev){return `<section class="ev-timeline ev-panel" aria-label="體型成長路線"><div><h2>體型成長路線</h2><p>每一次訓練，<br>都會留下變化。</p></div>${STAGES.map((s,i)=>`<button data-ev="stage" data-id="${i+1}" aria-pressed="${this.stage===i+1}" aria-label="預覽第${i+1}階${s.name}${i+1>ev.stage?'，未解鎖':''}"><img src="${ASSETS}characters/c01-stage-0${i+1}-front.png" alt=""><span><b>${i+1}</b> ${s.name}${i+1>ev.stage?icon('lock'):i+1===ev.stage?'<small>目前</small>':''}</span></button>`).join('')}</section>`;}
 wardrobe(p){const categoryItems=ITEMS.filter(i=>i.slot===this.category),owned=categoryItems.filter(i=>i.unlocked(p)),items=this.filter==='owned'?owned:categoryItems,item=ITEMS.find(i=>i.id===this.item)||categoryItems[0];return `<aside class="ev-closet ev-panel"><div class="ev-closet-top"><nav aria-label="衣物分類">${Object.entries(groups).map(([id,name])=>`<button data-ev="category" data-id="${id}" aria-pressed="${this.category===id}">${icon({top:'top',bottom:'bottoms',shoes:'shoes',accessory:'accessories'}[id])}${name}</button>`).join('')}</nav><button class="ev-filter" data-ev="filter" aria-pressed="${this.filter==='owned'}">已擁有 ${owned.length} / ${categoryItems.length} ${this.filter==='owned'?'· 只看擁有':'· 全部'}</button></div>
   <div class="ev-items">${items.map(i=>`<button class="ev-item ${!i.unlocked(p)?'locked':''}" data-ev="item" data-id="${i.id}" aria-pressed="${this.item===i.id}">${i.id==='none'?'<span class="ev-none">—</span>':`<img src="${ASSETS}wardrobe/${i.id}.png" alt="">`}<b>${i.name}</b><small>${!i.unlocked(p)?`${icon('lock')}${i.rule}`:this.draft[i.slot]===i.id?'試穿中':'已擁有'}</small></button>`).join('')}</div>
   <div class="ev-item-info">${item.id!=='none'?`<img src="${ASSETS}wardrobe/${item.id}.png" alt="">`:''}<div><h2>${item.name}</h2><p>取得方式：${item.rule}</p></div>${this.draft.top==='top-02-street-jacket'?`<fieldset><legend>外套顏色</legend>${Object.entries(COLORS).map(([id,col])=>`<button data-ev="color" data-id="${id}" style="--swatch:${col.value}" aria-label="${col.name}" aria-pressed="${this.draft.color===id}">${this.draft.color===id?'✓':''}</button>`).join('')}</fieldset>`:''}</div>
   <div class="ev-save"><p>衣著只改變外觀，保留肌群成長。</p><button data-ev="cancel" ${!this.dirty?'disabled':''}>取消試穿</button><button class="ev-primary" data-ev="save" ${!this.dirty?'disabled':''}>${this.saving?'儲存中…':'儲存穿搭'}</button></div><p class="ev-cloud">${esc(this.storageLabel())}</p></aside>`;}
}
