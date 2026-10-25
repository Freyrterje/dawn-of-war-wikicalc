import test from 'node:test';
import assert from 'node:assert/strict';
import {playerView} from '../lib/player-view.mjs';

test('weapon profile preserves zero damage and formats gameplay values',()=>{
  const view=playerView({kind:'weapon',fields:{accuracy:0.5,melee_weapon:true,'area_effect.weapon_damage.armour_damage.min_damage':0,'cost.cost.requisition':0,'cost.cost.power':0}});
  assert.equal(view.stats['Minimum damage'],0);
  assert.equal(view.stats.Accuracy,'50.0%');
  assert.equal(view.stats['Attack type'],'Melee');
  assert.equal(view.cost.power,0);
});
test('requirements use game names and retain forbidden-research meaning',()=>{
  const view=playerView({requirements:[{$REF:'requirements\\required_research.lua',research_name:'research\\tech.lua',research_must_not_be_complete:true}]},()=> 'Technology');
  assert.equal(view.requirements[0].name,'Must not have Technology');
});
