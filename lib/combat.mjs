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
    const owner = modifier.leaderId ? result.leaders?.find(l => l.id === modifier.leaderId) : result;
    if (!owner) throw new Error('Research modifier references an unavailable squad leader.');
    const targets = modifier.weaponId ? owner.weapons.filter(w => w.id === modifier.weaponId) : [owner];
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

export { simulateTrade, MODEL_ASSUMPTIONS } from './combat-engine.mjs';
