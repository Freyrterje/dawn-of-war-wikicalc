import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDataset,refId,number} from '../lib/normalize.mjs';
const entityId='attrib/ebps/races/space_marines/troops/test.rgd';
const squadId='attrib/sbps/races/space_marines/test.rgd';
function fixture(){return {metadata:{datasetId:'synthetic'},strings:{'100':'Test Squad'},records:[
 {id:entityId,source:{archive:'synthetic'},data:{health_ext:{hitpoints:250,regeneration_rate:1,regeneration_decrease_in_combat:1,armour:100,armour_minimum:2},type_ext:{type_armour:{$REF:'type_armour\\tp_infantry_heavy_med.lua'}},cost_ext:{time_cost:{time_seconds:5,cost:{requisition:40,power:0}}},combat_ext:{hardpoints:{hardpoint_01:{weapon_table:{weapon_01:{weapon:'weapon\\test.lua'},weapon_02:{weapon:'weapon\\upgrade.lua'}}}}}}},
 {id:squadId,source:{archive:'synthetic'},data:{squad_ui_ext:{ui_info:{screen_name_id:'$100'}},squad_loadout_ext:{trooper_base:{type:'ebps\\races\\space_marines\\troops\\test.lua'},unit_min:4,unit_max:8},squad_cap_ext:{squad_cap_usage:2,support_cap_usage:0}}},
 ...['test','upgrade'].map(name=>({id:`attrib/weapon/${name}.rgd`,source:{archive:'synthetic'},data:{accuracy:0.6,reload_time:1,melee_weapon:false,area_effect:{weapon_damage:{armour_damage:{min_damage:10,max_damage:20,min_damage_value:1,armour_piercing:100}}}}})),{id:'attrib/racebps/test.rgd',data:{race_details:{playable:true},race_path:{squad_path:'Races/space_marines'},starting_squads:{squad_01:'test'}}}]};}
test('stable IDs normalize slashes, extension and case',()=>{assert.equal(refId('EBPS\\Races\\Unit.LUA'),'attrib/ebps/races/unit.rgd');assert.equal(refId(''),null);assert.equal(number(0),0);assert.equal(number(undefined),null);});
test('squad costs and production time derive from initial count, not maximum count',()=>{const e=normalizeDataset(fixture()).entries[0];assert.equal(e.id,squadId);assert.equal(e.entityId,entityId);assert.equal(e.name,'Test Squad');assert.equal(e.hp,250);assert.equal(e.cost.requisition,160);assert.equal(e.cost.power,0);assert.equal(e.cost.faith,null);assert.equal(e.buildTime,20);assert.equal(e.squadMin,4);assert.equal(e.squadMax,8);assert.equal(e.provenance.cost.multiplier,4);});
test('combat regeneration subtracts the source penalty while wiki stats retain baseline',()=>{const e=normalizeDataset(fixture()).entries[0];assert.equal(e.regen,0);assert.equal(e.stats['Health regeneration / s'],1);});
test('hardpoint alternatives do not become simultaneous default weapons',()=>{const e=normalizeDataset(fixture()).entries[0];assert.equal(e.weapons.length,2);assert.deepEqual(e.weapons.filter(w=>w.default).map(w=>w.id),['attrib/weapon/test.rgd']);});
test('support-cap monsters are vehicles while squad-cap monsters remain infantry',()=>{const r=fixture();r.records[0].data.type_ext.type_armour.$REF='type_armour\\tp_monster_high.lua';r.records[1].data.squad_cap_ext={support_cap_usage:3,squad_cap_usage:0};assert.equal(normalizeDataset(r).entries[0].category,'Vehicles');r.records[1].data.squad_cap_ext={support_cap_usage:0,squad_cap_usage:5};assert.equal(normalizeDataset(r).entries[0].category,'Infantry');});
test('missing health never produces an invented playable entry',()=>{const r=fixture();delete r.records[0].data.health_ext.hitpoints;assert.equal(normalizeDataset(r).entries.length,0);});
test('unrecruitable honour guard and cinematic squads are omitted',()=>{for(const suffix of ['_hg_dxp3','_dxp3_nis']){const r=fixture();r.records[1].id=r.records[1].id.replace('.rgd',suffix+'.rgd');assert.equal(normalizeDataset(r).entries.length,0);}});
test('linked weapon groups preserve their unsupported timing identity',()=>{const r=fixture();r.records[2].data.weapon_slave_group=1;r.records[2].data.weapon_slave_group_master=false;const w=normalizeDataset(r).entries[0].weapons.find(w=>w.default);assert.equal(w.slaveGroup,1);assert.equal(w.slaveGroupMaster,false);});

test('multiplayer production rejects campaign requirements but accepts reachable summons with sp names',()=>{
 const r=fixture();const base=r.records.find(x=>x.id===squadId);
 const campaign=structuredClone(base);campaign.id=squadId.replace('test.rgd','campaign.rgd');campaign.data.squad_requirement_ext={requirements:{required_1:{$REF:'requirements/required_human_player_metamap_game.lua',is_human_player_in_a_metamap_game:true}}};
 const summon=structuredClone(base);summon.id=squadId.replace('test.rgd','bodyguard_sp.rgd');
 r.records.push(campaign,summon);r.records[0].data.spawner_ext={squad_table:{squad_01:campaign.id}};r.records[0].data.direct_spawn_ext={spawned_squad:'bodyguard_sp'};
 assert.deepEqual(new Set(normalizeDataset(r).entries.map(e=>e.id)),new Set([squadId,summon.id]));
});
test('leaders keep independent health, purchase cost and trooper-only damage aura',()=>{
 const r=fixture(),id=entityId.replace('test.rgd','leader.rgd'),leader=structuredClone(r.records[0]);leader.id=id;leader.data.health_ext.hitpoints=700;leader.data.ability_ext={abilities:{ability_01:'abilities/test_leadership.lua'}};
 r.records[1].data.squad_leader_ext={max_leaders:1,leader_1:{leader:{type:id},cost_time:{cost:{requisition:80,power:30},time_seconds:20}}};
 r.records.push(leader,{id:'attrib/abilities/test_leadership.rgd',data:{activation:{$REF:'always_on'},target_leader_in_squad:false,area_effect:{area_effect_information:{radius:0},weapon_damage:{modifiers:{modifier_01:{modifier:{$REF:'modifiers\\max_damage_weapon_modifier.lua',value:1.15,application_type:{$REF:'apply_to_squad'},usage_type:{$REF:'multiplication'}}}}}}}});
 const e=normalizeDataset(r).entries[0],l=e.leaders[0];assert.equal(e.maxLeaders,1);assert.equal(l.hp,700);assert.deepEqual(l.cost,{requisition:80,power:30});assert.equal(l.weapons.length,2);assert.equal(l.supported,true);assert.deepEqual(l.modifiers[0],{field:'maxDamage',operation:'multiply',value:1.15,target:'troopers',source:'attrib/abilities/test_leadership.rgd'});assert.equal(e.cost.power,0);
});
