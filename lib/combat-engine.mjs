import { applyModifiers, weaponDps } from './combat.mjs';

const finite = (v, label, min=0, max=Infinity) => {
  if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`Missing or invalid ${label}.`);
  return v;
};
const integer = (v,label,min,max) => {
  finite(v,label,min,max);if(!Number.isInteger(v))throw new Error(`${label} must be a whole number.`);return v;
};
const resources = ['requisition','power'];
const sum = values => values.some(v=>!Number.isFinite(v)) ? null : values.reduce((a,b)=>a+b,0);
const addCost = (...costs) => Object.fromEntries(resources.map(k=>[k,sum(costs.map(c=>c?.[k]))]));
const sumCost = models => Object.fromEntries(resources.map(k=>[k,sum(models.map(m=>m.cost?.[k]))]));
const profile = unit => ({id:unit.id,name:unit.name,hp:unit.hp,regen:unit.regen,armor:unit.armor,armourValue:unit.armourValue,armourMinimum:unit.armourMinimum,weapons:unit.weapons??[]});

function globalResearch(entries, requested=[]) {
  const ids=[...new Set([...requested,...entries.flatMap(e=>e.upgrades??[])])];
  const selected=new Map();
  for(const id of ids) {
    const candidates=entries.flatMap(e=>(e.unit?.upgrades??[]).filter(u=>u.id===id));
    if(!candidates.length||candidates.some(u=>u.supported!==true))throw new Error('Selected global research has an unsupported effect on this force.');
    selected.set(id,candidates[0]);
  }
  for(const upgrade of selected.values()) {
    if((upgrade.requires??[]).some(id=>!selected.has(id)))throw new Error(`Select the required research before ${upgrade.name??upgrade.id}.`);
    if((upgrade.excludes??[]).some(id=>selected.has(id)))throw new Error('Selected research options are mutually exclusive.');
  }
  const ordered=[],visiting=new Set(),visited=new Set();
  const visit=id=>{
    if(visited.has(id))return;if(visiting.has(id))throw new Error('Research dependencies contain a cycle.');
    visiting.add(id);for(const dep of selected.get(id).requires??[])visit(dep);
    visiting.delete(id);visited.add(id);ordered.push(id);
  };
  ids.forEach(visit);
  return {ids:ordered,items:ordered.map(id=>selected.get(id)),cost:Object.fromEntries(resources.map(k=>[k,sum([...selected.values()].map(u=>u.cost?.[k]))]))};
}

function prepareGroup(entry,index,research) {
  if(!entry.unit||entry.unit.combatUnsupported)throw new Error(entry.unit?.combatUnsupported||'Unit data is missing.');
  if(entry.unit.category==='Buildings')throw new Error('Only infantry and vehicles can be compared.');
  const applicable=research.ids.map(id=>entry.unit.upgrades?.find(u=>u.id===id)).filter(Boolean);
  const unit=applyModifiers(entry.unit,applicable.flatMap(u=>u.modifiers));
  const count=integer(entry.count??1,'group count',1,50);
  const size=integer(entry.squadSize??unit.squadMin??1,'squad size',unit.squadMin??1,unit.squadMax??1);
  finite(unit.hp,`${unit.name} health`,Number.MIN_VALUE);finite(unit.regen,`${unit.name} regeneration`);
  const slots=Map.groupBy(unit.weapons??[],w=>w.slot??w.id),loadout=[];
  let upgradedCount=0;
  for(const [slot,choices]of slots) {
    const selected=entry.weaponChoices?.[slot],id=typeof selected==='string'?selected:selected?.id;
    const base=choices.find(w=>w.default===true)??choices[0];
    const chosen=id?choices.find(w=>w.id===id&&w.selectable!==false):base;
    if(!chosen)throw new Error('Selected weapon is unavailable for this hardpoint.');
    const n=chosen.id===base.id?0:integer(typeof selected==='object'?selected.count:size,'upgraded weapon count',1,size);
    upgradedCount+=n;loadout.push({base,chosen,n});
  }
  if(upgradedCount){integer(unit.weaponUpgradeMax,'source squad weapon upgrade cap',0,2000);if(upgradedCount>unit.weaponUpgradeMax)throw new Error('Selected weapons exceed the squad weapon upgrade cap.');}
  for(const slot of Object.keys(entry.weaponChoices??{}))if(!slots.has(slot))throw new Error('Unknown weapon hardpoint.');
  const selections=(entry.leaders??[]).map(x=>typeof x==='string'?{id:x,count:1}:x);
  if(new Set(selections.map(x=>x.id)).size!==selections.length)throw new Error('Select each squad leader type only once.');
  let leaderCount=0;
  const leaders=selections.map(selection=>{
    const leader=unit.leaders?.find(l=>l.id===selection.id);
    if(!leader||leader.supported===false)throw new Error(leader?.reason||'This squad leader is unavailable.');
    const n=integer(selection.count??1,'leader count',1,leader.maxCount??1);leaderCount+=n;
    finite(leader.hp,`${leader.name} health`,Number.MIN_VALUE);finite(leader.regen,`${leader.name} regeneration`);
    return {leader,count:n};
  });
  if(leaderCount>integer(unit.maxLeaders??(leaders.length?null:0),'squad leader limit',0,20))throw new Error('Selected leaders exceed the squad leader limit.');
  const squads=[];
  for(let squadIndex=0;squadIndex<count;squadIndex++) {
    const squad={models:[],auraCache:new Map(),signature:null};
    for(let i=0;i<size;i++) {
      const weapons=loadout.map(slot=>i>=size-slot.n?slot.chosen:slot.base);
      const purchase=Object.fromEntries(resources.map(k=>[k,i<(unit.squadMin??1)?Number.isFinite(unit.cost?.[k])?unit.cost[k]/(unit.squadMin??1):null:unit.reinforceCost?.[k]??null]));
      const weaponCosts=loadout.filter(slot=>slot.n&&i>=size-slot.n).map(slot=>slot.chosen.cost);
      const base=profile(unit);base.weapons=weapons;
      squad.models.push({base,hp:base.hp,maxHp:base.hp,cost:addCost(purchase,...weaponCosts),leader:false,upgraded:weaponCosts.length>0,aura:[],key:`trooper:${weapons.map(w=>w.id).join('|')}`});
    }
    // The casualty policy is explicit: ordinary troopers, upgraded troopers, leaders.
    squad.models.sort((a,b)=>Number(a.upgraded)-Number(b.upgraded));
    for(const {leader,count:n}of leaders)for(let i=0;i<n;i++) {
      const base=profile(leader);base.weapons=[...Map.groupBy(base.weapons,w=>w.slot??w.id).values()].map(choices=>choices.find(w=>w.default===true)??choices[0]);
      squad.models.push({base,hp:base.hp,maxHp:base.hp,cost:leader.cost,leader:true,leaderId:leader.id,aura:leader.modifiers??[],key:`leader:${leader.id}`});
    }
    squads.push(squad);
  }
  const models=squads.flatMap(s=>s.models);
  return {id:unit.id,name:unit.name,index,squads,models,initialModels:models.length};
}

function makeSide(entries,name,requested) {
  if(!Array.isArray(entries)||!entries.length||entries.length>12)throw new Error(`${name} needs between 1 and 12 groups.`);
  if(!Array.isArray(requested??[]))throw new Error('Research selections must be a list.');
  const research=globalResearch(entries,requested);
  const groups=entries.map((e,i)=>prepareGroup(e,i,research));
  return {groups,models:groups.flatMap(g=>g.models),research};
}

const alive = model=>model.hp>1e-9;
function target(side) {
  for(const group of side.groups)for(const squad of group.squads)for(const model of squad.models)if(alive(model))return {group,squad,model};
  return null;
}
function effectiveProfile(squad,model) {
  const livingLeaders=squad.models.filter(m=>m.leader&&alive(m));
  const signature=livingLeaders.map(m=>m.leaderId).join('|');
  if(squad.signature!==signature){squad.signature=signature;squad.auraCache.clear();}
  if(squad.auraCache.has(model.key))return squad.auraCache.get(model.key);
  const result=structuredClone(model.base);
  for(const source of livingLeaders)for(const m of source.aura) {
    if(m.target==='troopers'&&model.leader)continue;
    if(m.target==='leader'&&model!==source)continue;
    const weaponFields=['minDamage','maxDamage','accuracy','reload','minDamageValue','maxRange'];
    const targets=weaponFields.includes(m.field)?result.weapons.filter(w=>!m.weaponId||w.id===m.weaponId):[result];
    if(!['multiply','add','set'].includes(m.operation)||!['hp','regen','armourValue','armourMinimum',...weaponFields].includes(m.field))throw new Error('Unsupported squad leader bonus.');
    for(const dest of targets) {
      finite(dest[m.field],`leader bonus ${m.field}`);finite(m.value,'leader bonus value',-Infinity);
      dest[m.field]=m.operation==='multiply'?dest[m.field]*m.value:m.operation==='add'?dest[m.field]+m.value:m.value;
      finite(dest[m.field],`modified ${m.field}`);
    }
  }
  squad.auraCache.set(model.key,result);return result;
}
const allModels=side=>side.models;
const health=side=>allModels(side).reduce((n,m)=>n+m.hp,0);
const remaining=side=>allModels(side).filter(alive).length;
function refreshHealth(side, initial=false) {
  for(const group of side.groups)for(const squad of group.squads)for(const model of squad.models)if(alive(model)) {
    model.maxHp=finite(effectiveProfile(squad,model).hp,'effective health',Number.MIN_VALUE);
    model.hp=initial?model.maxHp:Math.min(model.hp,model.maxHp);
  }
}

export const MODEL_ASSUMPTIONS=[
  'Both forces start at full health on open ground. Ranged combat uses a fixed separation; melee assumes all models can engage at contact.',
  'Expected damage uses accuracy, armour penetration, the damage floor and reload intervals. Setup, animation, burst and projectile timing are excluded.',
  'Each force focus-fires the first surviving squad in list order. Within a squad ordinary troopers die first, then weapon carriers, then leaders. This explicit casualty order is a scenario assumption, not a prediction of targeting in a match.',
  'Squad leaders have their own health, armour, weapons and purchase cost. Supported squad bonuses apply while the relevant leader is alive and cease when that leader dies.',
  'Health bonuses start at full modified health. Losing a health bonus clamps current health to the new maximum without healing; this is a model assumption.',
  'Global research applies to every eligible squad in a force, is purchased once per force, and is retained after all squads die. It is never counted as resources lost.',
  'Losses count the purchase cost assigned to killed models and their equipped squad weapons. Initial squad cost is divided among its initial troopers; reinforced troopers and leaders retain their own purchase cost.',
  'Damage is simultaneous in short time steps shortened to the next model death. The next target uses its own armour, and surviving models immediately determine subsequent damage. Regeneration uses in-combat rates.',
  'Morale stays unbroken. Movement, cover, abilities other than supported leader bonuses, splash victims, sync kills, resurrection, reinforcement and transport occupants are excluded.'
];

export function simulateTrade(input,options={}) {
  const step=finite(options.step??0.05,'time step',0.005,0.25),maxTime=finite(options.maxTime??600,'time limit',1,1800);
  const sides=[makeSide(input.left,'Left side',input.research?.left),makeSide(input.right,'Right side',input.research?.right)];
  if(sides.reduce((n,s)=>n+allModels(s).length,0)>2000)throw new Error('The model supports at most 2,000 total models.');
  // Cache damage per immutable effective attacker/defender pair; leader deaths create new profiles.
  const damageCache=new WeakMap();
  const damagePerSecond=(attacker,defender)=>{
    let targets=damageCache.get(attacker);if(!targets){targets=new WeakMap();damageCache.set(attacker,targets);}
    if(!targets.has(defender))targets.set(defender,attacker.weapons.reduce((n,w)=>n+weaponDps(w,defender,options),0));
    return targets.get(defender);
  };
  const dps=(side,enemy)=>{
    if(!enemy)return 0;
    const defender=effectiveProfile(enemy.squad,enemy.model);
    let total=0;for(const group of side.groups)for(const squad of group.squads)for(const model of squad.models)if(alive(model))total+=damagePerSecond(effectiveProfile(squad,model),defender);
    return total;
  };
  sides.forEach(side=>refreshHealth(side,true));
  const initialDps=sides.map((s,i)=>dps(s,target(sides[1-i]))),initialHp=sides.map(health),history=[];
  let time=0;
  const record=()=>history.push({time,leftHp:health(sides[0]),rightHp:health(sides[1]),leftModels:remaining(sides[0]),rightModels:remaining(sides[1])});
  record();
  while(time<maxTime-1e-8&&target(sides[0])&&target(sides[1])) {
    const targets=sides.map(target),rates=sides.map((s,i)=>dps(s,targets[1-i]));
    let dt=Math.min(step,maxTime-time);
    for(let i=0;i<2;i++) {
      const netDamage=rates[1-i]-finite(effectiveProfile(targets[i].squad,targets[i].model).regen,'regeneration');
      if(netDamage>0)dt=Math.min(dt,targets[i].model.hp/netDamage);
    }
    const damage=rates.map(rate=>rate*dt);
    const regen=sides.map(s=>s.groups.flatMap(g=>g.squads.flatMap(squad=>squad.models.filter(alive).map(model=>({model,rate:finite(effectiveProfile(squad,model).regen,'regeneration')})))));
    for(let i=0;i<2;i++) {
      for(const {model,rate}of regen[i]) {
        model.hp=Math.min(model.maxHp,Math.max(0,model.hp+rate*dt-(model===targets[i].model?damage[1-i]:0)));
        if(model.hp<1e-9)model.hp=0;
      }
    }
    sides.forEach(side=>refreshHealth(side));
    time+=dt;
    if(time>=history.length*Math.max(1,maxTime/300)||!target(sides[0])||!target(sides[1]))record();
  }
  if(history.at(-1).time!==time)record();
  const counts=sides.map(remaining);
  const summarize=(side,i)=>{
    const models=allModels(side),armyCost=sumCost(models),researchCost=side.research.cost;
    return {initialDps:initialDps[i],initialHp:initialHp[i],remainingHp:health(side),remainingModels:counts[i],initialModels:models.length,armyCost,researchCost,cost:addCost(armyCost,researchCost),losses:sumCost(models.filter(m=>!alive(m))),research:side.research.items.map(r=>({id:r.id,name:r.name,cost:r.cost})),groups:side.groups.map(g=>({id:g.id,name:g.name,initialModels:g.initialModels,remainingModels:g.models.filter(alive).length,remainingHp:g.models.reduce((n,m)=>n+m.hp,0),initialLeaders:g.models.filter(m=>m.leader).length,remainingLeaders:g.models.filter(m=>m.leader&&alive(m)).length,losses:sumCost(g.models.filter(m=>!alive(m)))}))};
  };
  return {status:counts[0]===0&&counts[1]===0?'mutual destruction':counts[0]===0?'right wins':counts[1]===0?'left wins':'time limit',time,timeLimit:maxTime,step,left:summarize(sides[0],0),right:summarize(sides[1],1),history,assumptions:MODEL_ASSUMPTIONS};
}
