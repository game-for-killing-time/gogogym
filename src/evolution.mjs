export const MUSCLES={
 chest:{name:'胸肌',sources:{push:.6},view:'front',change:'胸部輪廓逐步加厚'},
 shoulder:{name:'肩部',sources:{push:.25,pull:.15},view:'front',change:'肩膀逐步變得寬闊'},
 biceps:{name:'二頭肌',sources:{pull:.25},view:'front',change:'上臂線條逐步飽滿'},
 triceps:{name:'三頭肌',sources:{push:.15},view:'back',change:'手臂後側逐步變厚'},
 core:{name:'腹／核心',sources:{core:1},view:'front',change:'腰腹輪廓逐步結實'},
 back:{name:'背肌',sources:{pull:.6},view:'back',change:'背部逐步展開成倒三角'},
 quads:{name:'大腿前側',sources:{legs:.4},view:'front',change:'大腿前側逐步變厚'},
 glutes:{name:'臀部',sources:{legs:.25},view:'back',change:'臀部輪廓逐步結實'},
 hamstrings:{name:'大腿後側',sources:{legs:.2},view:'back',change:'大腿後側逐步飽滿'},
 calves:{name:'小腿',sources:{legs:.15},view:'front',change:'小腿線條逐步清晰'},
};
export const CATEGORY_NAMES={push:'推力',pull:'拉力',legs:'腿部',core:'核心',cardio:'心肺'};
export const STAGES=[{name:'起步',total:0,min:0},{name:'精實',total:1200,min:200},{name:'結實',total:4800,min:800},{name:'壯碩',total:12000,min:2000},{name:'大隻佬',total:24000,min:4000}];
const strength=['push','pull','legs','core'];
const amount=v=>Number.isFinite(v)&&v>=0?v:0;
export function musclePoints(player,id){return Math.round(Object.entries(MUSCLES[id].sources).reduce((sum,[cat,weight])=>sum+amount(player.abilities?.[cat])*weight,0)*100)/100;}
export function levelProgress(points){points=amount(points);const level=Math.floor((1+Math.sqrt(1+points*.08))/2);const current=points-50*level*(level-1),needed=level*100;return {level,current,needed,remaining:needed-current,ratio:current/needed};}
export function evolution(player){const values=strength.map(k=>amount(player.abilities?.[k])),total=values.reduce((a,b)=>a+b,0);let stage=1;for(let i=1;i<STAGES.length;i++)if(total>=STAGES[i].total&&Math.min(...values)>=STAGES[i].min)stage=i+1;const next=STAGES[stage];return {stage,total,next,requirements:next?[{name:'整體成長',value:total,target:next.total},...strength.map((k,i)=>({name:CATEGORY_NAMES[k],value:values[i],target:next.min}))]:[]};}
export function splitReward(category,xp){return Object.entries(MUSCLES).filter(([,m])=>m.sources[category]).map(([id,m])=>({id,name:m.name,xp:Math.round(xp*m.sources[category]*100)/100}));}
const count=p=>Object.values(p.mastery||{}).reduce((a,b)=>a+amount(b),0);
const weeks=p=>new Set((p.completedWeeks||[]).filter(x=>typeof x==='string')).size;
export const ITEMS=[
 {id:'top-01-basic-tank',name:'基本背心',slot:'top',rule:'入會即擁有',unlocked:()=>true},
 {id:'top-02-street-jacket',name:'街角外套',slot:'top',rule:'累積完成 12 節訓練',unlocked:p=>count(p)>=12},
 {id:'top-03-power-tank',name:'力量背心',slot:'top',rule:'完成 3 節推力訓練',unlocked:p=>amount(p.mastery?.push)>=3},
 {id:'top-04-coral-tee',name:'珊瑚短袖',slot:'top',rule:'累積完成 6 節訓練',unlocked:p=>count(p)>=6},
 {id:'top-05-night-jacket',name:'夜跑外套',slot:'top',rule:'完成 4 週挑戰（每週參與 4 天）',unlocked:p=>weeks(p)>=4},
 {id:'top-06-varsity-jacket',name:'會員紀念外套',slot:'top',rule:'完成 8 週挑戰（每週參與 4 天）',unlocked:p=>weeks(p)>=8},
 {id:'bottom-01-navy-shorts',name:'深藍短褲',slot:'bottom',rule:'入會即擁有',unlocked:()=>true},
 {id:'bottom-02-training-joggers',name:'訓練長褲',slot:'bottom',rule:'完成 6 節腿部訓練',unlocked:p=>amount(p.mastery?.legs)>=6},
 {id:'bottom-03-light-shorts',name:'淺色短褲',slot:'bottom',rule:'累積完成 9 節訓練',unlocked:p=>count(p)>=9},
 {id:'shoes-01-white-trainers',name:'白色運動鞋',slot:'shoes',rule:'入會即擁有',unlocked:()=>true},
 {id:'shoes-02-navy-runners',name:'深藍跑鞋',slot:'shoes',rule:'完成 6 節心肺訓練',unlocked:p=>amount(p.mastery?.cardio)>=6},
 {id:'none',name:'不戴配件',slot:'accessory',rule:'入會即擁有',unlocked:()=>true},
 {id:'accessory-01-headband',name:'頭帶',slot:'accessory',rule:'累積完成 3 節訓練',unlocked:p=>count(p)>=3},
 {id:'accessory-02-wristbands',name:'護腕',slot:'accessory',rule:'完成 3 節拉力訓練',unlocked:p=>amount(p.mastery?.pull)>=3},
 {id:'accessory-03-towel',name:'運動毛巾',slot:'accessory',rule:'完成 3 節核心訓練',unlocked:p=>amount(p.mastery?.core)>=3},
];
export const COLORS={mint:{name:'薄荷綠',value:'#81e8bb'},coral:{name:'珊瑚色',value:'#e58f80'},navy:{name:'深藍',value:'#687aab'}};
export const PRESETS=['日常','訓練','合照'];
export function defaultOutfit(){return {top:'top-01-basic-tank',bottom:'bottom-01-navy-shorts',shoes:'shoes-01-white-trainers',accessory:'none',color:'mint'};}
export function validateOutfit(outfit,player){if(!outfit||typeof outfit!=='object')throw Error('穿搭資料不完整。');const clean={};for(const slot of ['top','bottom','shoes','accessory']){const item=ITEMS.find(i=>i.slot===slot&&i.id===outfit[slot]);if(!item||!item.unlocked(player))throw Error('這件衣物尚未解鎖。');clean[slot]=item.id;}if(!Object.hasOwn(COLORS,outfit.color))throw Error('請選擇有效顏色。');clean.color=outfit.color;return clean;}
export function appearance(player){const raw=player.appearance||{},presets=PRESETS.map((_,i)=>{try{return validateOutfit(raw.presets?.[i],player);}catch{return defaultOutfit();}});return {active:Number.isInteger(raw.active)&&raw.active>=0&&raw.active<3?raw.active:0,presets};}
export function saveOutfit(player,slot,outfit){if(!Number.isInteger(slot)||slot<0||slot>2)throw Error('穿搭位置不正確。');const next=structuredClone(player),a=appearance(player);a.presets[slot]=validateOutfit(outfit,player);a.active=slot;next.appearance=a;return next;}
