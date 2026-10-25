import assert from 'node:assert/strict';
const base = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const get = async path => {
  const res = await fetch(base+path); assert.equal(res.status,200,path); return res.json();
};
const entries = await get('/api/entries');
assert.equal(new Set(entries.map(e=>e.faction)).size,9);
for(const faction of new Set(entries.map(e=>e.faction))) for(const category of ['Infantry','Vehicles','Buildings']) assert(entries.some(e=>e.faction===faction&&e.category===category),`${faction} ${category}`);
const marine = entries.find(e=>e.id.endsWith('/space_marine_squad_tactical.rgd'));
const guard = entries.find(e=>e.id.endsWith('/guard_squad_guardsmen.rgd'));
assert(marine&&guard);
const detail = await get('/api/entry?id='+encodeURIComponent(marine.id));
assert.equal(detail.hp,390);
assert.equal(detail.cost.requisition,200);
assert(detail.source.sha256);
assert(detail.weapons.some(w=>w.default));
const calculate = async body => {
  const res = await fetch(base+'/api/calculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:res.status,body:await res.json()};
};
const selection = id=>({id,count:1});
const result = await calculate({left:[selection(guard.id)],right:[selection(marine.id)],options:{range:20}});
assert.equal(result.status,200,JSON.stringify(result.body));
assert(result.body.left.initialDps>0&&result.body.right.initialDps>0);
assert(result.body.time>0);
const invalid = await calculate({left:[{id:marine.id,count:0}],right:[selection(guard.id)]});
assert.equal(invalid.status,400);
const slot = detail.weapons.find(w=>!w.default&&w.name==='Heavy Bolter');
if(slot) {
  const loadout = await calculate({left:[{id:marine.id,count:1,weaponChoices:{[slot.slot]:{id:slot.id,count:2}}}],right:[selection(guard.id)],options:{range:20}});
  assert.equal(loadout.status,200,JSON.stringify(loadout.body));
  assert(loadout.body.left.initialDps>result.body.right.initialDps);
  const illegal = await calculate({left:[{id:marine.id,count:1,weaponChoices:{[slot.slot]:{id:slot.id,count:3}}}],right:[selection(guard.id)]});
  assert.equal(illegal.status,400);
  const capacity = detail.upgrades.find(r=>r.supported&&r.name==='Heavy Weapon Increase');
  assert(capacity,'Source-derived capacity research is available');
  const upgraded = await calculate({left:[{id:marine.id,count:1,researchIds:[capacity.id],weaponChoices:{[slot.slot]:{id:slot.id,count:4}}}],right:[selection(guard.id)]});
  assert.equal(upgraded.status,200,JSON.stringify(upgraded.body));
}
const melee = await calculate({left:[selection(marine.id)],right:[selection(marine.id)],options:{mode:'melee',range:0}});
assert.equal(melee.status,200,JSON.stringify(melee.body));
assert.equal(melee.body.status,'mutual destruction');
const html=await fetch(base+'/');assert.equal(html.status,200);assert((await html.text()).includes('Dawn of War Wikicalc'));
console.log(JSON.stringify({checks:'HTTP index, all factions/categories, detail provenance, real combat, invalid counts, partial loadouts and upgrade caps passed',dataset:(await get('/api/meta')).datasetId,guardVsMarine:{status:result.body.status,time:result.body.time,leftDps:result.body.left.initialDps,rightDps:result.body.right.initialDps}},null,2));
