import {mkdir,copyFile,readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
await mkdir(new URL('data/',root),{recursive:true});await mkdir(new URL('public/',root),{recursive:true});
const source=new URL('../content/server/donald.json',root);
const dataset=JSON.parse(await readFile(source,'utf8'));
if(!dataset.cards?.length)throw Error('Generate canonical content/server/donald.json first.');
await copyFile(source,new URL('data/donald.json',root));
await copyFile(new URL('../assets/artwork/donald-portrait.png',root),new URL('public/trump-art.png',root));
// Optional pack artwork: assets/artwork/packs/<pack-id>.png -> public/packs/<pack-id>.png
await mkdir(new URL('public/packs/',root),{recursive:true});
const packArt=new URL('../assets/artwork/packs/',root);
for(const f of await readdir(packArt).catch(()=>[]))if(f.endsWith('.png'))await copyFile(new URL(f,packArt),new URL('public/packs/'+f,root));
console.log('Prepared canonical card content and artwork.');
