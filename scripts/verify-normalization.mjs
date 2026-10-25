import fs from 'node:fs';
import assert from 'node:assert/strict';
import {normalizeDataset,refId} from '../lib/normalize.mjs';
const raw=JSON.parse(fs.readFileSync('data/generated/raw.json','utf8'));
const byId=new Map(raw.records.map(r=>[r.id,r]));
const races=['space_marines','chaos','eldar','orks','guard','tau','necrons','dark_eldar','sisters'];
const normalized=normalizeDataset(raw);
const samples=[];
for(const race of races)for(const category of ['Infantry','Vehicles','Buildings']){
 const entry=normalized.entries.find(e=>e.multiplayer&&e.category===category&&e.id.includes('/races/'+race+'/'));
 assert.ok(entry, race+' '+category);samples.push({race,category,record:byId.get(entry.id)});
}
const reports=[];
for(const sample of samples){
 const e=normalized.entries.find(e=>e.id===sample.record.id);assert.ok(e,e?.id);const d=byId.get(e.entityId).data;
 assert.equal(e.category,sample.category,`${e.name} category`);assert.equal(e.hp,d.health_ext.hitpoints);assert.equal(e.armor,refId(d.type_ext.type_armour.$REF));
 const count=sample.category==='Buildings'?1:sample.record.data.squad_loadout_ext.unit_min;
 for(const resource of ['requisition','power','faith','souls'])assert.equal(e.cost[resource],typeof d.cost_ext?.time_cost?.cost?.[resource]==='number'?d.cost_ext.time_cost.cost[resource]*count:null,`${e.id} ${resource}`);
 assert.equal(e.buildTime,d.cost_ext.time_cost.time_seconds*count);assert.equal(e.regen,Math.max(0,d.health_ext.regeneration_rate-d.health_ext.regeneration_decrease_in_combat));
 for(const w of e.weapons.filter(w=>w.default)){assert.equal(w.id,refId(d.combat_ext.hardpoints[w.slot].weapon_table.weapon_01.weapon));const wd=byId.get(w.id).data;assert.equal(w.accuracy,wd.accuracy);assert.equal(w.reload,wd.reload_time);assert.equal(w.minDamage,wd.area_effect.weapon_damage.armour_damage.min_damage);}
 reports.push({id:e.id,name:e.name,race:sample.race,category:e.category,health:e.hp,cost:e.cost,buildTime:e.buildTime,entity:e.entityId,source:e.entitySource.archive});
}
fs.writeFileSync('data/generated/normalization-verification.json',JSON.stringify({datasetId:raw.metadata.datasetId,checks:reports},null,2));
console.log(`Verified ${reports.length} normalized entries: nine factions × infantry, vehicles and buildings; health, armour, costs, production times, regeneration and default weapon fields match raw source records.`);
