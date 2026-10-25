import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedHitDamage, weaponDps, applyModifiers, simulateTrade } from '../lib/combat.mjs';

// Synthetic fixtures exercise mathematics only; never shipped as game statistics.
const gun = {id:'synthetic-gun',slot:'primary',accuracy:1,minDamage:10,maxDamage:10,minDamageValue:0,reload:1,armourPiercing:100,armourPiercingTypes:{},minRange:0,maxRange:30,melee:false};
const unit = {id:'synthetic-unit',name:'Synthetic test unit',hp:100,regen:0,armor:'test',armourValue:100,armourMinimum:0,squadMin:1,squadMax:10,cost:{requisition:50,power:0},reinforceCost:{requisition:50,power:0},weapons:[gun]};
const entry = (changes = {}, config = {}) => ({unit:{...structuredClone(unit),...changes},count:1,...config});
test('armour type overrides fallback, and numeric armour and floor are respected', () => {
  assert.equal(weaponDps({...gun,armourPiercingTypes:{test:25}},unit),2.5);
  assert.equal(weaponDps({...gun,armourPiercing:0},{...unit,armourValue:50}),5);
  assert.equal(weaponDps({...gun,minDamageValue:4},{...unit,armourMinimum:90}),4);
  assert.equal(weaponDps({...gun,armourPiercingTypes:{test:0}},unit),0);
});
test('minimum damage integrates over random damage instead of flooring the mean', () => {
  assert.equal(expectedHitDamage(0,10,5,1),6.25);
  assert.equal(expectedHitDamage(0,10,5,0),5);
  assert.equal(expectedHitDamage(10,10,0,0.5),5);
});
test('range and melee mode gate weapons; accuracy scales expected damage', () => {
  assert.equal(weaponDps(gun,unit,{range:31}),0);
  assert.equal(weaponDps({...gun,accuracy:0.5},unit),5);
  assert.equal(weaponDps({...gun,melee:true},unit),0);
  assert.equal(weaponDps({...gun,melee:true},unit,{mode:'melee',range:0}),10);
  assert.equal(weaponDps({...gun,melee:true,minRange:null,maxRange:null},unit,{mode:'melee',range:0}),10);
  assert.throws(()=>weaponDps({...gun,melee:true},unit,{mode:'melee',range:20}),/contact/);
});
test('source target permissions gate air and ground; linked timing fails closed', () => {
  assert.equal(weaponDps({...gun,canAttackAir:false},{...unit,armor:'attrib/type_armour/tp_air_med.rgd'}),0);
  assert.equal(weaponDps({...gun,canAttackGround:false},unit),0);
  assert.throws(()=>weaponDps({...gun,slaveGroup:1},unit),/Linked weapon timing/);
});
test('missing actual values are rejected rather than assumed to be zero', () => {
  assert.throws(()=>weaponDps({...gun,reload:null},unit),/reload/);
  assert.throws(()=>weaponDps(gun,{...unit,armourValue:null}),/armour value/);
  assert.throws(()=>simulateTrade({left:[entry({regen:null})],right:[entry()]}),/regeneration/);
});
test('equal sides die simultaneously, avoiding first-side advantage', () => {
  const result = simulateTrade({left:[entry()],right:[entry()]});
  assert.equal(result.status,'mutual destruction');
  assert.ok(Math.abs(result.time-10)<0.051);
  assert.equal(result.left.losses.requisition,50);
});
test('attrition reduces damage as models die', () => {
  const result = simulateTrade({left:[entry({}, {squadSize:2})],right:[entry({hp:200})]});
  assert.equal(result.status,'left wins');
  assert.equal(result.left.remainingModels,1);
  assert.ok(result.time>10 && result.time<10.1);
  assert.equal(result.left.losses.requisition,50);
});
test('regeneration can create a time-limit stalemate', () => {
  const result = simulateTrade({left:[entry({regen:10})],right:[entry({regen:10})]},{maxTime:2});
  assert.equal(result.status,'time limit');
  assert.equal(result.left.remainingHp,100);
});
test('one default weapon per slot, without double counting choices', () => {
  const weapons = [gun,{...gun,id:'replacement',minDamage:20,maxDamage:20}];
  const normal = simulateTrade({left:[entry({weapons})],right:[entry()]});
  assert.equal(normal.left.initialDps,10);
  const chosen = simulateTrade({left:[entry({weapons,weaponUpgradeMax:1},{weaponChoices:{primary:{id:'replacement',count:1}}})],right:[entry()]});
  assert.equal(chosen.left.initialDps,20);
  assert.throws(()=>simulateTrade({left:[entry({}, {weaponChoices:{primary:'unknown'}})],right:[entry()]}),/unavailable/);
});
test('partial weapon upgrades retain baseline firepower and enforce source caps', () => {
  const weapons = [gun,{...gun,id:'heavy',minDamage:40,maxDamage:40,cost:{requisition:20,power:10}}];
  const choice = {primary:{id:'heavy',count:1}};
  const result = simulateTrade({left:[entry({weapons,weaponUpgradeMax:1},{squadSize:3,weaponChoices:choice})],right:[entry()]});
  assert.equal(result.left.initialDps,60);
  assert.equal(result.left.cost.requisition,170);
  assert.throws(()=>simulateTrade({left:[entry({weapons,weaponUpgradeMax:0},{weaponChoices:choice})],right:[entry()]}),/cap/);
  assert.throws(()=>simulateTrade({left:[entry({weapons},{weaponChoices:choice})],right:[entry()]}),/cap/);
});
test('supported modifiers are isolated and unknown modifiers fail closed', () => {
  const changed = applyModifiers(unit,[{field:'hp',operation:'multiply',value:2},{field:'accuracy',operation:'multiply',value:0.5,weaponId:gun.id}]);
  assert.equal(changed.hp,200);
  assert.equal(changed.weapons[0].accuracy,0.5);
  assert.equal(unit.hp,100);
  assert.equal(unit.weapons[0].accuracy,1);
  assert.throws(()=>applyModifiers(unit,[{field:'unknown',operation:'set',value:1}]),/Unsupported/);
});
test('unknown resource cost remains null', () => {
  const result = simulateTrade({left:[entry({cost:{requisition:null,power:0}})],right:[entry()]});
  assert.equal(result.left.cost.requisition,null);
  assert.equal(result.left.losses.requisition,null);
  assert.equal(result.left.cost.power,0);
});
test('group selection and numerical convergence', () => {
  const input = {left:[entry({}, {squadSize:3})],right:[entry({hp:250}),entry({hp:50})]};
  const coarse = simulateTrade(input,{step:0.05});
  const fine = simulateTrade(input,{step:0.025});
  assert.equal(coarse.status,fine.status);
  assert.ok(Math.abs(coarse.time-fine.time)<0.1);
  assert.equal(coarse.right.remainingModels,0);
});
