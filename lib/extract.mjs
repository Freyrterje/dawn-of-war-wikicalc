import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readSga,parseRgd,parseDictionary,parseUcs} from './extract-formats.mjs';
export const DEFAULT_GAME='C:\\Program Files (x86)\\Steam\\steamapps\\common\\Dawn of War Definitive Edition';
const sha=b=>createHash('sha256').update(b).digest('hex');
const norm=s=>s.replaceAll('\\','/').toLowerCase();
export function parseModule(text){const values={};for(const line of text.split(/\r?\n/)){const m=line.match(/^\s*([^;[=]+?)\s*=\s*(.*?)\s*(?:;.*)?$/);if(m)values[m[1].toLowerCase()]=m[2];}return values;}
function numbered(config,prefix){return Object.entries(config).filter(([key])=>key.startsWith(prefix+'.')).sort(([a],[b])=>Number(a.split('.')[1])-Number(b.split('.')[1])).map(([,value])=>value);}
function* walk(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,e.name);if(e.isDirectory())yield* walk(p);else if(e.isFile())yield p;}}
export function extractGame(game=DEFAULT_GAME){
 const dictionary=parseDictionary(fs.readFileSync(fileURLToPath(new URL('../resources/rgd-dictionary.txt',import.meta.url)),'utf8'));
 const modules=[],seen=new Set(),sources=[],records=new Map(),strings={},stringSources={},overrides=[],warnings=[];
 function visit(name){if(seen.has(name.toLowerCase()))return;seen.add(name.toLowerCase());const filename=path.join(game,name+'.module'),bytes=fs.readFileSync(filename),config=parseModule(bytes.toString('utf8'));modules.push({name,config,sha256:sha(bytes)});for(const dep of numbered(config,'requiredmod'))visit(dep);}
 visit('DoWDE');
 function accept(member,bytes,source){member=norm(member);const hash=sha(bytes);if(member.endsWith('.rgd')){if(records.has(member)){overrides.push({id:member,winner:records.get(member).source.archive,shadowed:source.archive});return;}try{records.set(member,{id:member,source:{...source,member,sha256:hash},data:parseRgd(bytes,dictionary)});}catch(e){throw Error(`${source.archive}:${member}: ${e.message}`);}}else if(member.endsWith('.ucs')){for(const [id,text]of Object.entries(parseUcs(bytes))){if(!(id in strings)){strings[id]=text;stringSources[id]={...source,member,sha256:hash};}}}}
 for(const mod of modules){const folder=path.join(game,mod.config.modfolder),expand=s=>s.replaceAll('%LOCALE%','Locale\\English');
  for(const rel of numbered(mod.config,'datafolder')){const dir=path.join(folder,expand(rel));for(const f of walk(dir)){if(!/\.(rgd|ucs)$/i.test(f))continue;accept(path.relative(dir,f),fs.readFileSync(f),{module:mod.name,archive:norm(path.relative(game,f)),kind:'loose'});}}
  // English UCS can also live directly in the locale folder, outside Data.
  for(const f of walk(path.join(folder,'Locale','English'))){if(f.toLowerCase().endsWith('.ucs'))accept(path.basename(f),fs.readFileSync(f),{module:mod.name,archive:norm(path.relative(game,f)),kind:'loose'});}
  for(const rel of numbered(mod.config,'archivefile')){const filename=path.join(folder,expand(rel)+'.sga');if(!fs.existsSync(filename)){warnings.push(`Missing declared archive: ${norm(path.relative(game,filename))}`);continue;}const archive=readSga(filename);try{const relevant=archive.entries.filter(e=>/\.(rgd|ucs)$/i.test(e.path));const source={module:mod.name,archive:norm(path.relative(game,filename)),kind:'sga'};sources.push({...source,size:fs.statSync(filename).size,entries:archive.entries.length,relevantEntries:relevant.length});for(const entry of relevant)accept(entry.path,archive.read(entry),source);}finally{archive.close();}}
 }
 for(const f of walk(path.join(game,'Engine','Locale','English'))){if(f.toLowerCase().endsWith('.ucs'))accept(path.basename(f),fs.readFileSync(f),{module:'Engine',archive:norm(path.relative(game,f)),kind:'loose'});}
 const ordered=[...records.values()].sort((a,b)=>a.id.localeCompare(b.id));const unknownFields=new Set();function inspect(v){if(v&&typeof v==='object')for(const[k,x]of Object.entries(v)){if(k.startsWith('0x'))unknownFields.add(k);inspect(x);}}for(const r of ordered)inspect(r.data);
 if(unknownFields.size)warnings.push(`${unknownFields.size} field-name hashes are not in the dictionary; their values remain available under hexadecimal keys.`);
 const fingerprint=sha(JSON.stringify({modules:modules.map(m=>({name:m.name,sha256:m.sha256})),records:ordered.map(r=>[r.id,r.source.sha256,r.source.archive]),strings,stringSources}));
 return {metadata:{schemaVersion:1,game:'Dawn of War: Definitive Edition',rootModule:'DoWDE',locale:'English',datasetId:fingerprint,extractedAt:new Date().toISOString(),gameDirectory:game,modules,sources,warnings,unknownFields:[...unknownFields].sort(),recordCount:ordered.length,stringCount:Object.keys(strings).length,overrides,precedence:'First declared data folder, then first declared archive, then required modules recursively; first matching virtual path wins.'},strings,stringSources,records:ordered};
}
