import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readSga,parseRgd,parseDictionary} from '../lib/extract-formats.mjs';
const raw=JSON.parse(fs.readFileSync('data/generated/raw.json','utf8'));
const names=parseDictionary(fs.readFileSync('resources/rgd-dictionary.txt','utf8'));
const races=['space_marines','chaos','eldar','orks','guard','tau','necrons','dark_eldar','sisters'];
const results=[];
for(const race of races){
 const entries=raw.records.filter(r=>r.id.startsWith(`attrib/ebps/races/${race}/`)&&r.data.health_ext&&!/(_sp|_hg|_advance)/.test(r.id));
 const categories={Buildings:r=>r.id.includes('/structures/'),Vehicles:r=>!r.id.includes('/structures/')&&/vehicle|monster|aircraft/.test(r.data.type_ext?.type_armour?.$REF||''),Infantry:r=>!r.id.includes('/structures/')&&/infantry|commander/.test(r.data.type_ext?.type_armour?.$REF||'')};
 for(const [category,predicate]of Object.entries(categories)){
  const record=entries.find(predicate);assert.ok(record,`${race} ${category} source exists`);
  const archive=readSga(path.join(raw.metadata.gameDirectory,record.source.archive));try{
   const member=archive.entries.find(e=>e.path===record.id);assert.ok(member);const bytes=archive.read(member);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.source.sha256);
   const reread=parseRgd(bytes,names);assert.deepEqual(reread,record.data);assert.ok(reread.health_ext.hitpoints>0);
   results.push({race,category,id:record.id,source:record.source.archive,health:reread.health_ext.hitpoints,armour:reread.type_ext.type_armour.$REF});
  }finally{archive.close();}
 }
}
fs.mkdirSync('data/generated',{recursive:true});fs.writeFileSync('data/generated/source-verification.json',JSON.stringify({datasetId:raw.metadata.datasetId,checkedAt:new Date().toISOString(),checks:results},null,2));
console.log(`Verified ${results.length} source members across nine factions and three categories against original archive bytes, SHA-256 and decoded values.`);
