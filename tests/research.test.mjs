import test from 'node:test';
import assert from 'node:assert/strict';
import {attachResearch} from '../lib/research.mjs';
import {simulateTrade} from '../lib/combat.mjs';
const mod = (type,target='marine',app='entity_type')=>({$REF:`modifiers\\${type}.lua`,target_type_name:target,application_type:{$REF:`type_modifierapplicationtype\\tp_mod_apply_to_${app}.lua`},usage_type:{$REF:'type_modifierusagetype\\tp_mod_usage_multiplication.lua'},value:1.5,probability_of_applying:1,exclusive:false,shield_of_faith:false});
const research=(name,modifiers,requirements={})=>({id:`attrib/research/${name}.rgd`,data:{modifiers,requirements,time_cost:{cost:{requisition:100,power:50}}}});
const entry=()=>({id:'attrib/sbps/races/test/squad.rgd',entityId:'attrib/ebps/races/test/marine.rgd',weapons:[{id:'attrib/weapon/bolter.rgd'}]});
test('research scopes exact entity and weapon type, preserving source modifier paths',()=>{
  const e=entry(),raw={records:[research('health',{modifier_01:mod('health_maximum_modifier'),modifier_02:mod('max_damage_weapon_modifier','bolter','weapon_type'),modifier_03:mod('unknown','unrelated')})]};
  attachResearch([e],raw,[]);
  assert.equal(e.upgrades[0].supported,true);
  assert.deepEqual(e.upgrades[0].modifiers.map(m=>m.field),['hp','maxDamage']);
  assert.equal(e.upgrades[0].modifiers[1].weaponId,'attrib/weapon/bolter.rgd');
  assert.equal(e.upgrades[0].modifiers[0].sourceField,'modifiers.modifier_01');
});
test('a relevant unsupported effect disables the complete upgrade',()=>{
  const e=entry();attachResearch([e],{records:[research('mixed',{modifier_01:mod('health_maximum_modifier'),modifier_02:mod('enable_armour_2')})]},[]);
  assert.equal(e.upgrades[0].supported,false);
});

test('squad weapon capacity research maps only to the exact squad',()=>{
  const e=entry();
  const m={...mod('max_upgrades_squad_modifier','squad','squad_type'),value:2,usage_type:{$REF:'type_modifierusagetype\\tp_mod_usage_addition.lua'}};
  attachResearch([e],{records:[research('capacity',{modifier_01:m})]},[]);
  assert.equal(e.upgrades[0].supported,true);
  assert.deepEqual(e.upgrades[0].modifiers[0].field,'weaponUpgradeMax');
});
test('research dependencies are retained and unsupported prerequisites disable dependents',()=>{
  const e=entry(),first=research('first',{modifier_01:mod('unknown')});
  const next=research('next',{modifier_01:mod('health_maximum_modifier')},{required_1:{$REF:'requirements\\required_research.lua',research_name:'research\\first.lua',research_must_not_be_complete:false}});
  attachResearch([e],{records:[first,next]},[]);
  assert.equal(e.upgrades.find(u=>u.id===next.id).supported,false);
  assert.deepEqual(e.upgrades.find(u=>u.id===next.id).requires,[first.id]);
});
test('combat validates research prerequisite selection and applies prerequisite first',()=>{
  const a={id:'a',supported:true,modifiers:[{field:'hp',operation:'add',value:10}],cost:{requisition:0,power:0}};
  const b={id:'b',supported:true,requires:['a'],modifiers:[{field:'hp',operation:'multiply',value:2}],cost:{requisition:0,power:0}};
  const unit={id:'u',hp:100,regen:0,armor:'a',armourValue:100,armourMinimum:0,squadMin:1,squadMax:1,weapons:[],upgrades:[a,b],cost:{requisition:1,power:0}};
  assert.throws(()=>simulateTrade({left:[{unit,upgrades:['b']}],right:[{unit}]},{maxTime:1}),/required research/);
  const result=simulateTrade({left:[{unit,upgrades:['b','a']}],right:[{unit}]},{maxTime:1});
  assert.equal(result.left.initialHp,220);
});

test('research includes leader-specific health and weapons without changing troopers',()=>{
  const e=entry();e.leaders=[{id:'leader-slot',entityId:'attrib/ebps/races/test/exarch.rgd',weapons:[{id:'attrib/weapon/exarch_gun.rgd'}]}];
  attachResearch([e],{records:[research('leader_upgrade',{modifier_01:mod('health_maximum_modifier','exarch'),modifier_02:mod('max_damage_weapon_modifier','exarch_gun','weapon_type')})]},[]);
  assert.equal(e.upgrades[0].supported,true);
  assert.deepEqual(e.upgrades[0].modifiers.map(m=>m.leaderId),['leader-slot','leader-slot']);
});

test('research absent from multiplayer production is excluded',()=>{
  const e=entry(),r=research('campaign',{modifier_01:mod('health_maximum_modifier')});
  attachResearch([e],{records:[r],multiplayerResearchIds:[]},[]);
  assert.equal(e.upgrades.length,0);
});
