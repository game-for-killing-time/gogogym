import {cp,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=path.resolve(root,'dist');
if(path.dirname(output)!==path.resolve(root)||path.basename(output)!=='dist')throw Error('Invalid build directory');
await rm(output,{recursive:true,force:true});
const play=path.join(output,'play');await mkdir(play,{recursive:true});
for(const file of ['index.html','style.css','src','assets/runtime','assets/art-reference/gym-background-v1.png','assets/art-reference/props-p01-p20-v1.png']){
 const target=path.join(play,file);await mkdir(path.dirname(target),{recursive:true});await cp(path.join(root,file),target,{recursive:true});
}
for(const folder of ['characters','wardrobe','backgrounds','ui','muscles'])await cp(path.join(root,'assets/evolution/v1',folder),path.join(play,'assets/evolution/v1',folder),{recursive:true});
await cp(path.join(root,'assets/evolution/v1/hotzones.json'),path.join(play,'assets/evolution/v1/hotzones.json'));
await cp(path.join(root,'assets/evolution/v2/characters'),path.join(play,'assets/evolution/v2/characters'),{recursive:true});
console.log('Built game assets in dist/play; server code and design documents excluded.');
