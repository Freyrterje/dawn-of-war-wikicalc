/** Deterministic expected-damage experiment; deliberately not an engine simulation. */
const finite = (value, name, min = 0, max = Infinity) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Missing or invalid ${name}.`);
  return value;
};
const integer = (value, name, min, max) => {
  finite(value, name, min, max);
  if (!Number.isInteger(value)) throw new Error(`${name} must be a whole number.`);
  return value;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Integrate max(floor, uniform(min,max) * multiplier), not max(floor, mean). */
export function expectedHitDamage(min, max, floor, multiplier) {
  finite(min, 'minimum damage'); finite(max, 'maximum damage', min); finite(floor, 'damage floor'); finite(multiplier, 'damage multiplier', 0, 1);
  const low = min * multiplier, high = max * multiplier;
  if (floor >= high) return floor;
  if (floor <= low) return (low + high) / 2;
  return (floor * (floor - low) + (high * high - floor * floor) / 2) / (high - low);
}

export function weaponDps(weapon, target, options = {}) {
  const mode = options.mode ?? 'ranged';
  if (!['ranged', 'melee'].includes(mode)) throw new Error('Combat mode must be ranged or melee.');
  if (Boolean(weapon.melee) !== (mode === 'melee')) return 0;
  const airborne = /(?:^|\/)tp_air_/.test(target.armor ?? '');
  if ((airborne && weapon.canAttackAir === false) || (!airborne && weapon.canAttackGround === false)) return 0;
  const range = finite(options.range ?? (mode === 'melee' ? 0 : 20), 'range');
  if (mode === 'melee') {
    if (range !== 0) throw new Error('Melee assumes contact: set fixed separation to zero.');
  } else if (range < finite(weapon.minRange, 'minimum range') || range > finite(weapon.maxRange, 'maximum range')) return 0;
  if (weapon.slaveGroup > 0) throw new Error(`Linked weapon timing is not supported for ${weapon.name ?? weapon.id}.`);
  const accuracy = finite(weapon.accuracy, 'accuracy', 0, 1);
  const reload = finite(weapon.reload, 'reload interval', Number.MIN_VALUE);
  if (typeof target.armor !== 'string' || !target.armor) throw new Error('Missing target armour type.');
  const ap = finite(weapon.armourPiercingTypes?.[target.armor] ?? weapon.armourPiercing, 'armour piercing');
  const armour = finite(target.armourValue, 'target armour value', 0, 100);
  const minimum = finite(target.armourMinimum, 'target minimum armour', 0, 100);
  const multiplier = clamp(Math.min(100 - armour + ap, 100 - minimum) / 100, 0, 1);
  return expectedHitDamage(weapon.minDamage, weapon.maxDamage, weapon.minDamageValue, multiplier) * accuracy / reload;
}

/** Supported normalized research only; unknown operations are rejected. */
export function applyModifiers(unit, modifiers = []) {
  const result = structuredClone(unit);
  const fields = new Set(['hp', 'regen', 'armourValue', 'armourMinimum', 'accuracy', 'minDamage', 'maxDamage', 'reload', 'minDamageValue', 'maxRange', 'weaponUpgradeMax']);
  for (const modifier of modifiers) {
    if (!fields.has(modifier.field) || !['multiply', 'add', 'set'].includes(modifier.operation)) throw new Error('Unsupported research modifier.');
    const targets = modifier.weaponId ? result.weapons.filter(w => w.id === modifier.weaponId) : [result];
    if (!targets.length) throw new Error('Research modifier references an unavailable weapon.');
    for (const target of targets) {
      const previous = finite(target[modifier.field], `modifier field ${modifier.field}`);
      if (!Number.isFinite(modifier.value)) throw new Error('Invalid modifier value.');
      target[modifier.field] = modifier.operation === 'multiply' ? previous * modifier.value : modifier.operation === 'add' ? previous + modifier.value : modifier.value;
      finite(target[modifier.field], `modified ${modifier.field}`);
    }
  }
  return result;
}

function makeSide(entries, name) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 12) throw new Error(`${name} needs between 1 and 12 groups.`);
  return entries.map((entry, index) => {
    let unit = entry.unit;
    if (!unit || unit.combatUnsupported) throw new Error(unit?.combatUnsupported || 'Unit data is missing.');
    const upgrades = entry.upgrades ?? [];
    const selected = upgrades.map(id => {
      const upgrade = (unit.upgrades ?? []).find(u => u.id === id && u.supported === true);
      if (!upgrade) throw new Error('This research is not supported by the combat model.');
      return upgrade;
    });
    if (new Set(upgrades).size !== upgrades.length) throw new Error('Research cannot be selected twice.');
    for(const upgrade of selected) {
      if((upgrade.requires ?? []).some(id=>!upgrades.includes(id))) throw new Error(`Select the required research before ${upgrade.name ?? upgrade.id}.`);
      if((upgrade.excludes ?? []).some(id=>upgrades.includes(id))) throw new Error('Selected research options are mutually exclusive.');
    }
    const ordered=[],visiting=new Set(),visited=new Set();
    const visit=upgrade=>{
      if(visited.has(upgrade.id))return;
      if(visiting.has(upgrade.id))throw new Error('Research dependencies contain a cycle.');
      visiting.add(upgrade.id);
      for(const id of upgrade.requires ?? [])visit(selected.find(u=>u.id===id));
      visiting.delete(upgrade.id);visited.add(upgrade.id);ordered.push(upgrade);
    };
    selected.forEach(visit);
    unit = applyModifiers(unit, ordered.flatMap(u => u.modifiers));
    const count = integer(entry.count ?? 1, 'group count', 1, 50);
    const size = integer(entry.squadSize ?? unit.squadMin ?? 1, 'squad size', unit.squadMin ?? 1, unit.squadMax ?? 1);
    const hp = finite(unit.hp, `${unit.name} health`, Number.MIN_VALUE);
    const regen = finite(unit.regen, `${unit.name} regeneration`);
    const bySlot = Map.groupBy(unit.weapons ?? [], w => w.slot ?? w.id);
    const weapons = [], loadout = [];
    let upgradedModels = 0;
    for (const [slot, choices] of bySlot) {
      const selection = entry.weaponChoices?.[slot];
      const chosenId = typeof selection === 'string' ? selection : selection?.id;
      const base = choices.find(w => w.default === true) ?? choices[0];
      const weapon = chosenId ? choices.find(w => w.id === chosenId && w.selectable !== false) : base;
      if (!weapon) throw new Error('Selected weapon is unavailable for this hardpoint.');
      if (weapon.id === base.id) { weapons.push(base); loadout.push({base, upgraded:null, upgradedModels:0}); }
      else {
        const selectedCount = integer(typeof selection === 'object' ? selection.count : size, 'upgraded weapon count', 1, size);
        upgradedModels += selectedCount;
        integer(unit.weaponUpgradeMax, 'source squad weapon upgrade cap', 0, 2000);
        if (upgradedModels > unit.weaponUpgradeMax) throw new Error('Selected weapons exceed the squad weapon upgrade cap.');
        weapons.push(base, weapon); loadout.push({base, upgraded:weapon, upgradedModels:selectedCount * count});
      }
    }
    for (const slot of Object.keys(entry.weaponChoices ?? {})) if (!bySlot.has(slot)) throw new Error('Unknown weapon hardpoint.');
    const resource = key => {
      const base = unit.cost?.[key], reinforce = unit.reinforceCost?.[key];
      if (!Number.isFinite(base) || (size !== (unit.squadMin ?? 1) && !Number.isFinite(reinforce))) return null;
      const research = selected.reduce((sum, u) => Number.isFinite(u.cost?.[key]) && sum !== null ? sum + u.cost[key] : null, 0);
      if (research === null) return null;
      const weaponCost = loadout.reduce((sum, slot) => !slot.upgraded ? sum : sum === null || !Number.isFinite(slot.upgraded.cost?.[key]) ? null : sum + slot.upgradedModels * slot.upgraded.cost[key], 0);
      if (weaponCost === null) return null;
      return count * (base + (size - (unit.squadMin ?? 1)) * (reinforce ?? 0)) + research + weaponCost;
    };
    return {id: unit.id, name: unit.name, index, unit, weapons, loadout, initialModels: count * size, models: count * size, hp, regen, frontHp: hp, cost: {requisition: resource('requisition'), power: resource('power')}};
  });
}

export const MODEL_ASSUMPTIONS = [
  'Stationary, fixed range, open ground; one selected weapon per hardpoint. Every surviving model may fire all hardpoints matching the selected combat mode.',
  'Expected hits use accuracy and uniformly distributed damage with the minimum-damage floor applied after armour. Reload time is the sustained attack interval; setup time, animations, bursts, wind-up and projectile travel are excluded.',
  'Each side focus-fires the first surviving enemy group. Within that group damage is concentrated on one model at a time. Death immediately removes that model’s future damage; damage spills to the next model within the same group.',
  'Optional weapon quantities apply per squad and respect the extracted weapon-upgrade cap. Base-weapon models are removed first; upgraded weapons survive until the remaining model count is below their quantity. Different hardpoints are treated independently.',
  'Damage and health regeneration are resolved simultaneously in 0.05-second steps. Regeneration applies to the wounded front model only. A step’s excess damage cannot move to another group.',
  'Morale remains unbroken throughout. Morale damage, morale regeneration, suppression, cover, movement, abilities, special attacks, sync kills, splash victims, shields, leaders, reinforcement and transport occupants are excluded. The source in-combat health-regeneration penalty is applied.',
  'Area-effect weapons estimate one primary target only. Melee is an all-models-engaged experiment; it does not model pathing or engagement limits. This is an expected-damage attrition estimate, not an engine replay.',
  'Resource losses allocate known group purchase costs in proportion to models lost. This is not a refund or an exact replacement bill. Unknown costs remain unavailable.'
];

export function simulateTrade(input, options = {}) {
  const step = finite(options.step ?? 0.05, 'time step', 0.005, 0.25);
  const maxTime = finite(options.maxTime ?? 600, 'time limit', 1, 1800);
  const sides = [makeSide(input.left, 'Left side'), makeSide(input.right, 'Right side')];
  if (sides.flat().reduce((n, g) => n + g.models, 0) > 2000) throw new Error('The model supports at most 2,000 total models.');
  const target = side => side.find(g => g.models > 0);
  const dps = (side, enemy) => enemy ? side.reduce((sum, group) => sum + group.loadout.reduce((total, slot) => {
    const upgraded = Math.min(group.models, slot.upgradedModels);
    return total + (group.models - upgraded) * weaponDps(slot.base, enemy.unit, options) + (upgraded ? upgraded * weaponDps(slot.upgraded, enemy.unit, options) : 0);
  }, 0), 0) : 0;
  // Validate every pairing before combat, including groups reached only after casualties.
  for (let s = 0; s < 2; s++) for (const group of sides[s]) for (const enemy of sides[1 - s]) for (const weapon of group.weapons) weaponDps(weapon, enemy.unit, options);
  const initialDps = sides.map((side, s) => dps(side, target(sides[1 - s])));
  const initialHp = sides.map(side => side.reduce((sum, g) => sum + g.models * g.hp, 0));
  const history = [];
  let time = 0;
  const health = side => side.reduce((sum, g) => sum + (g.models ? (g.models - 1) * g.hp + g.frontHp : 0), 0);
  const record = () => history.push({time, leftHp: health(sides[0]), rightHp: health(sides[1]), leftModels: sides[0].reduce((s,g)=>s+g.models,0), rightModels:sides[1].reduce((s,g)=>s+g.models,0)});
  record();
  while (time < maxTime - 1e-8 && target(sides[0]) && target(sides[1])) {
    const dt = Math.min(step, maxTime - time);
    const currentTargets = sides.map(target);
    const damage = sides.map((side, s) => dps(side, currentTargets[1 - s]) * dt);
    for (let s = 0; s < 2; s++) {
      const group = currentTargets[s];
      let hit = Math.max(0, damage[1 - s] - group.regen * dt);
      if (damage[1 - s] < group.regen * dt) group.frontHp = Math.min(group.hp, group.frontHp + group.regen * dt - damage[1 - s]);
      while (group.models && hit >= group.frontHp - 1e-9) { hit -= group.frontHp; group.models--; group.frontHp = group.models ? group.hp : 0; }
      if (group.models) group.frontHp -= hit;
      // Previously targeted survivors can regenerate after focus fire moves to another group.
      for (const other of sides[s]) if (other !== group && other.models) other.frontHp = Math.min(other.hp, other.frontHp + other.regen * dt);
    }
    time += dt;
    if (time >= (history.length * Math.max(1, maxTime / 300)) || !target(sides[0]) || !target(sides[1])) record();
  }
  if (history.at(-1).time !== time) record();
  const remaining = sides.map(side => side.reduce((sum, g) => sum + g.models, 0));
  const summarize = (side, s) => {
    const total = (key, losses) => side.reduce((sum,g)=> sum === null || g.cost[key] === null ? null : sum + g.cost[key] * (losses ? (1 - g.models / g.initialModels) : 1), 0);
    return {initialDps:initialDps[s], initialHp:initialHp[s], remainingHp:health(side), remainingModels:remaining[s], initialModels:side.reduce((sum,g)=>sum+g.initialModels,0), cost:{requisition:total('requisition',false),power:total('power',false)}, losses:{requisition:total('requisition',true),power:total('power',true)}, groups:side.map(g=>({id:g.id,name:g.name,initialModels:g.initialModels,remainingModels:g.models,remainingHp:g.models ? (g.models-1)*g.hp+g.frontHp : 0}))};
  };
  return {status:remaining[0] === 0 && remaining[1] === 0 ? 'mutual destruction' : remaining[0] === 0 ? 'right wins' : remaining[1] === 0 ? 'left wins' : 'time limit', time, timeLimit:maxTime, step, left:summarize(sides[0],0), right:summarize(sides[1],1), history, assumptions:MODEL_ASSUMPTIONS};
}
