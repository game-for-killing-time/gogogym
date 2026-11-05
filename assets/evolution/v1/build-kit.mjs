import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const write=(file,data)=>fs.writeFileSync(path.join(root,file),data);
const svg=(w,h,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const outline=(w,h,inset=4)=>`M${inset+12} ${inset}H${w-inset-12}V${inset+4}H${w-inset-4}V${inset+12}H${w-inset}V${h-inset-12}H${w-inset-4}V${h-inset-4}H${w-inset-12}V${h-inset}H${inset+12}V${h-inset-4}H${inset+4}V${h-inset-12}H${inset}V${inset+12}H${inset+4}V${inset+4}H${inset+12}Z`;
const ui=[];
function add(name,w,h,body,label){write(`ui/${name}.svg`,svg(w,h,body));ui.push({id:name,label,file:`ui/${name}.svg`,width:w,height:h,kind:'svg-ui',status:'editable'});}
for(const [name,w,h,fill,stroke,label] of [
 ['panel',480,560,'#192332','#FFF0D3','詳情面板'],['ribbon',1000,180,'#192332','#FFF0D3','進化路線底板'],
 ['button-default',280,64,'#192332','#FFF0D3','一般按鈕'],['button-primary',280,64,'#81E8BB','#FFF0D3','主要按鈕'],
 ['button-hover',280,64,'#31534F','#81E8BB','懸停按鈕'],['button-pressed',280,64,'#59B894','#FFF0D3','按下按鈕'],
 ['button-disabled',280,64,'#303944','#727C87','停用按鈕'],['item-tile',240,240,'#293442','#98A4AD','物品底板'],
 ['item-selected',240,240,'#254840','#81E8BB','選取物品底板'],['muscle-chip',240,56,'#192332','#FFF0D3','肌群標籤底板'],
 ['muscle-chip-selected',240,56,'#81E8BB','#FFF0D3','已選肌群底板'],['stage-badge',128,44,'#FFF0D3','#192332','階段標章']]){
 add(name,w,h,`<path d="${outline(w,h)}" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="${outline(w,h,10)}" fill="none" stroke="${stroke}" opacity=".2" stroke-width="2"/>`,label);
}
add('progress-track',400,24,'<rect x="2" y="2" width="396" height="20" rx="10" fill="#465263" stroke="#FFF0D3" stroke-width="2"/>','進度條底');
add('progress-fill',400,24,'<rect x="3" y="3" width="394" height="18" rx="9" fill="#81E8BB"/>','進度條填色（以裁切控制數值）');
add('selection-ring',64,64,'<circle cx="32" cy="32" r="26" fill="#81E8BB" fill-opacity=".15" stroke="#81E8BB" stroke-width="4"/><circle cx="32" cy="32" r="8" fill="#FFF0D3"/>','肌群選取點');
const icons={
 back:'<path d="M38 14L20 32l18 18M20 32h32"/>',close:'<path d="M18 18l28 28M46 18L18 46"/>',
 check:'<path d="M13 33l13 13 26-29"/>',lock:'<rect x="17" y="28" width="30" height="25" rx="3"/><path d="M23 28V19a9 9 0 0 1 18 0v9M32 37v7"/>',
 rotate:'<path d="M48 25a18 18 0 1 0 1 17M48 12v14H34"/>',
 hanger:'<path d="M26 17a6 6 0 1 1 9 5l-3 4v4L10 44v6h44v-6L32 30"/>',
 top:'<path d="M22 12l-12 8 7 12 7-4v25h24V28l7 4 7-12-12-8c-7 8-20 8-28 0Z" transform="translate(-4)"/>',
 bottoms:'<path d="M18 12h28l5 40H35l-3-23-3 23H13Z"/>',
 shoes:'<path d="M13 24l10 4 7-9 8 17 15 6v11H9V33ZM28 33l10 3M33 40l10 3M10 47h41"/>',
 accessories:'<path d="M14 34a18 18 0 0 1 36 0v7H14ZM14 41H5v6h35l10-6M31 16v18"/>',
 dumbbell:'<path d="M8 23v18M16 17v30M24 24v16M40 24v16M48 17v30M56 23v18M24 32h16"/>',
 info:'<circle cx="32" cy="32" r="23"/><path d="M32 29v16M32 18v3"/>',
 sparkle:'<path d="M32 8l6 18 18 6-18 6-6 18-6-18-18-6 18-6Z"/>',
 heart:'<path d="M32 51L11 30C0 15 22 3 32 21 42 3 64 15 53 30Z"/>',
 front:'<circle cx="32" cy="15" r="8"/><path d="M22 27h20l8 20M22 27L14 47M24 29v25M40 29v25M24 39h16"/>',
 backview:'<circle cx="32" cy="15" r="8"/><path d="M22 27h20l8 20M22 27L14 47M24 29v25M40 29v25M32 28v16"/>'
};
for(const [name,body] of Object.entries(icons))add(`icon-${name}`,64,64,`<g fill="none" stroke="#FFF0D3" stroke-width="4" stroke-linecap="square" stroke-linejoin="round">${body}</g>`,name);
const regions={
 chest:['胸肌','M18 25Q26 18 31 25V38Q22 44 15 35ZM46 25Q38 18 33 25V38Q42 44 49 35Z'],
 shoulder:['肩部','M14 22Q6 25 7 37L17 38 22 26ZM50 22Q58 25 57 37L47 38 42 26Z'],
 biceps:['二頭肌','M10 29Q4 36 7 47L16 47Q21 40 17 31ZM54 29Q60 36 57 47L48 47Q43 40 47 31Z'],
 triceps:['三頭肌','M9 28L17 29 18 45 10 50 5 40ZM55 28L47 29 46 45 54 50 59 40Z'],
 core:['腹／核心','M24 22H40L42 50 32 56 22 50Z'],
 back:['背肌','M14 19L26 15 32 20 38 15 50 19 46 36 38 51H26L18 36Z'],
 glutes:['臀部','M18 20Q25 16 31 23V45Q19 52 13 40ZM46 20Q39 16 33 23V45Q45 52 51 40Z'],
 quads:['大腿前側','M17 12H29L28 43 22 53 15 43ZM35 12H47L49 43 42 53 36 43Z'],
 hamstrings:['大腿後側','M16 12L29 13 27 45 20 53 14 40ZM48 12L35 13 37 45 44 53 50 40Z'],
 calves:['小腿','M17 12H28L30 32 23 54H17L20 34 15 25ZM36 12H47L49 25 44 34 47 54H41L34 32Z']
};
for(const [id,[label,d]] of Object.entries(regions)){
 write(`muscles/${id}.svg`,svg(64,64,`<path d="${d}" fill="#81E8BB" fill-opacity=".65" stroke="#FFF0D3" stroke-width="2"/>`));
 ui.push({id:`muscle-${id}`,label,file:`muscles/${id}.svg`,width:64,height:64,kind:'muscle-icon',status:'schematic-not-anatomical-mask'});
}
write('vector-manifest.json',JSON.stringify(ui,null,2));
console.log(`Saved ${ui.length} individual vector assets.`);
