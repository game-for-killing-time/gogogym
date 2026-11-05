import {ITEMS,COLORS,defaultOutfit,appearance,evolution} from './evolution.mjs';
export const DEFAULT_LOOK=Object.freeze({v:1,stage:1,outfit:Object.freeze(defaultOutfit())});
/** Cosmetic wire format only: never accepts abilities, XP, URLs or executable assets. */
export function validateLook(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.v!==1||!Number.isInteger(raw.stage)||raw.stage<1||raw.stage>5)throw Error('角色外觀格式不正確。');
 const outfit={};for(const slot of ['top','bottom','shoes','accessory']){const id=raw.outfit?.[slot];if(!ITEMS.some(i=>i.id===id&&i.slot===slot))throw Error('角色衣物不正確。');outfit[slot]=id;}
 if(!Object.hasOwn(COLORS,raw.outfit?.color))throw Error('外套顏色不正確。');outfit.color=raw.outfit.color;
 return {v:1,stage:raw.stage,outfit};
}
export function safeLook(raw){try{return validateLook(raw);}catch{return {v:1,stage:1,outfit:defaultOutfit()};}}
export function playerLook(player){const a=appearance(player);return {v:1,stage:evolution(player).stage,outfit:{...a.presets[a.active]}};}
export function lookKey(look){return JSON.stringify(validateLook(look));}
