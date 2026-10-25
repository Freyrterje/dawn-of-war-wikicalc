import { attachResearch } from './research.mjs';
const factions = {space_marines:'Space Marines',chaos:'Chaos',eldar:'Eldar',orks:'Orks',guard:'Imperial Guard',imperial_guard:'Imperial Guard',tau:'Tau Empire',necrons:'Necrons',necron:'Necrons',dark_eldar:'Dark Eldar',sisters:'Sisters of Battle',sisters_of_battle:'Sisters of Battle'};
export const number = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
export function refId(value) {
  if (typeof value !== 'string' || !value) return null;
  return (value.startsWith('attrib/') ? value : 'attrib/' + value).replaceAll('\\','/').replace(/\.(lua|nil)$/i,'.rgd').toLowerCase();
}
export function flatten(value, prefix = '', out = {}) {
  for (const [key,v] of Object.entries(value ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (v && typeof v === 'object') flatten(v,path,out); else out[path] = v;
  }
  return out;
}
const values = obj => Object.entries(obj ?? {}).filter(([k,v])=> k !== '$REF' && v && typeof v === 'object').sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v);
const human = text => text?.split('/').at(-1)?.replace(/\.(rgd|lua|nil)$/,'').replace(/^tp_/,'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()) ?? 'Unknown';
const costs = v => ({requisition:number(v?.requisition),power:number(v?.power),faith:number(v?.faith),souls:number(v?.souls)});
const scaleCosts = (v,n) => Object.fromEntries(Object.entries(v).map(([k,x])=>[k,x === null || n === null ? null : x*n]));

export function normalizeDataset(raw) {
  const source = new Map(raw.records.map(r=>[r.id,r]));
  const localize = key => raw.strings?.[String(key).replace(/^\$/,'')] ?? null;
  const nameOf = r => {
    const d = r.data;
    const key = d.squad_ui_ext?.ui_info?.screen_name_id ?? d.ui_ext?.ui_info?.screen_name_id ?? d.ui_info?.screen_name_id ?? d.screen_name_id;
    return localize(key) || human(r.id);
  };
  const records = raw.records.map(r=>({id:r.id,kind:r.id.split('/')[1],name:nameOf(r),source:r.source,fields:flatten(r.data)}));
  const normalized = new Map(records.map(r=>[r.id,r]));
  const relations=[];
  for (const r of records) for (const [field,value] of Object.entries(r.fields)) {
    if (typeof value !== 'string' || !/\.(lua|nil|rgd)$/i.test(value)) continue;
    const target = refId(value);
    if (!/^attrib\/(ebps|sbps|weapon|research|abilities|addons)\//.test(target)) continue;
    relations.push({source:r.id,field,target,resolved:source.has(target)});
  }
  const weapon = (id,slot,isDefault) => {
    const r=source.get(id); if(!r) return null;
    const d=r.data,damage=d.area_effect?.weapon_damage?.armour_damage;
    const ap={};
    for(const e of values(damage?.armour_piercing_types)) {
      const armor=refId(e.armour_type?.$REF); if(armor) ap[armor]=number(e.armour_piercing_value);
    }
    return {id,name:nameOf(r),slot,default:isDefault,selectable:true,source:r.source,
      accuracy:number(d.accuracy),minDamage:number(damage?.min_damage),maxDamage:number(damage?.max_damage),minDamageValue:number(damage?.min_damage_value),
      armourPiercing:number(damage?.armour_piercing),armourPiercingTypes:ap,reload:number(d.reload_time),minRange:number(d.min_range),maxRange:number(d.max_range),
      melee:d.melee_weapon,areaEffect:number(d.area_effect?.area_effect_information?.radius),setupTime:number(d.setup_time),moraleDamage:number(damage?.morale_damage),
      cost:costs(d.cost?.cost),buildTime:number(d.cost?.time_seconds),canAttackAir:d.can_attack_air_units,canAttackGround:d.can_attack_ground_units,slaveGroup:number(d.weapon_slave_group),slaveGroupMaster:d.weapon_slave_group_master,
      requirements:values(d.requirements),squadMax:number(d.squad_max)};
  };
  const entries=[];
  for(const r of raw.records) {
    const kind=r.id.split('/')[1];
    if(!['ebps','sbps'].includes(kind)) continue;
    const race=r.id.match(/\/races\/([^/]+)\//)?.[1],faction=factions[race];
    if(!faction) continue;
    const d=r.data;
    const entity=kind==='sbps'?source.get(refId(d.squad_loadout_ext?.trooper_base?.type)):r;
    if(!entity) continue;
    const ed=entity.data;
    if(kind==='ebps'&&!r.id.includes('/structures/')) continue;
    const hp=number(ed.health_ext?.hitpoints);
    if(hp===null) continue;
    const category=kind==='ebps'?'Buildings':d.squad_cap_ext?.support_cap_usage>0||ed.type_ext?.type_armour?.$REF?.match(/vehicle|air/)?'Vehicles':'Infantry';
    const min=kind==='sbps'?number(d.squad_loadout_ext?.unit_min):1;
    const max=kind==='sbps'?number(d.squad_loadout_ext?.unit_max):1;
    const e={...normalized.get(r.id),faction,category,scope:/(?:_sp(?:_|\.)|_hg(?:_|\.)|_nis(?:_|\.)|single_player|_advance|_veteran|_campaign|_prisoner|_stronghold)/.test(r.id)||ed.type_ext?.single_player_only?'variant':'standard',
      entityId:entity.id,entitySource:entity.source,hp,regen:number(ed.health_ext?.regeneration_rate),regenerationDecreaseInCombat:number(ed.health_ext?.regeneration_decrease_in_combat),
      armourValue:number(ed.health_ext?.armour),armourMinimum:number(ed.health_ext?.armour_minimum),armor:refId(ed.type_ext?.type_armour?.$REF),
      speed:number(ed.moving_ext?.speed_max),squadMin:min,squadMax:max,
      cost:scaleCosts(costs(ed.cost_ext?.time_cost?.cost),min),buildTime:number(ed.cost_ext?.time_cost?.time_seconds)===null?null:ed.cost_ext.time_cost.time_seconds*min,
      reinforceCost:costs(d.squad_reinforce_ext?.cost?.cost),reinforceTime:number(d.squad_reinforce_ext?.cost?.time_seconds),weaponUpgradeMax:number(d.squad_reinforce_ext?.max_upgrades),
      weapons:[],abilities:[],requirements:[],upgrades:[],warnings:[],provenance:{hp:{id:entity.id,field:'health_ext.hitpoints'},regen:{id:entity.id,field:'health_ext.regeneration_rate'},cost:{id:entity.id,field:'cost_ext.time_cost.cost',multiplier:min},squadMin:{id:r.id,field:'squad_loadout_ext.unit_min'}}};
    e.armorName=localize(ed.type_ext?.type_armour?.screen_name_id)||human(e.armor);
    for(const [slot,hpData] of Object.entries(ed.combat_ext?.hardpoints??{}).sort(([a],[b])=>a.localeCompare(b))) {
      if(slot==='$REF')continue;
      for(const [index,w] of Object.entries(hpData.weapon_table??{}).sort(([a],[b])=>a.localeCompare(b))) {
        if(!w?.weapon)continue;
        const nw=weapon(refId(w.weapon),slot,index==='weapon_01');if(nw)e.weapons.push(nw);
      }
    }
    const allFields={...flatten(ed),...flatten(d)};
    const refs=(regex)=>Object.entries(allFields).filter(([k,v])=>regex.test(k)&&typeof v==='string'&&/\.(lua|rgd)$/.test(v)).map(([field,v])=>({id:refId(v),name:normalized.get(refId(v))?.name??human(v),field}));
    e.abilities=refs(/ability_\d+$/);
    e.requirements=values(d.squad_requirement_ext?.requirements??d.requirements??ed.requirement_ext?.requirements).filter(v=>!v.$REF?.includes('required_none'));
    e.stats={'Health per model':hp,'Health regeneration / s':e.regen,'Armour class':e.armorName,'Armour value':e.armourValue,'Minimum armour':e.armourMinimum,'Movement speed':e.speed,'Base build time (s)':e.buildTime,'Starting squad size':min,'Maximum squad size':max,'Reinforcement time (s)':e.reinforceTime,'Weapon upgrade limit':e.weaponUpgradeMax,'Sight radius':number(ed.sight_ext?.sight_radius),'Morale':number(d.squad_morale_ext?.default),'Morale regeneration / s':number(d.squad_morale_ext?.rate),'Morale recovery threshold':number(d.squad_morale_ext?.broken_min_morale)};
    e.fields=kind==='sbps'?{...Object.fromEntries(Object.entries(flatten(ed)).map(([k,v])=>[`entity.${k}`,v])),...flatten(d)}:flatten(d);
    if(!e.weapons.length)e.warnings.push('No mounted weapon is present in this blueprint.');
    if(e.scope==='variant')e.warnings.push('Campaign or scripted variant; availability may depend on mission scripts.');
    if(faction==='Necrons')e.warnings.push('Build time is the blueprint baseline. Strategic-point production bonuses are not applied.');
    if(e.regen!==null&&e.regenerationDecreaseInCombat) {e.regen=Math.max(0,e.regen-e.regenerationDecreaseInCombat);e.warnings.push('Combat uses regeneration reduced by the source in-combat penalty.');}
    if(ed.health_ext?.invulnerable)e.warnings.push('Invulnerable blueprint is excluded from combat.');
    e.calculable=hp>0&&[e.regen,e.armourValue,e.armourMinimum,min,max].every(v=>v!==null)&&!ed.health_ext?.invulnerable;
    entries.push(e);
  }
  attachResearch(entries,raw,records);
  return {metadata:{...raw.metadata,version:'Dawn of War: Definitive Edition • installed dataset',importedAt:new Date().toISOString(),counts:{records:records.length,entries:entries.length,factions:new Set(entries.map(e=>e.faction)).size},limitations:['Blueprint statistics reflect the selected module stack, not campaign scripts or live game state.','Campaign and scripted variants are available through the variants filter.','Missing fields are shown as unavailable; zero is a real source value.','Combat excludes morale breaks, cover, abilities, splash victims, animation timing and leaders.']},records,entries,relations};
}
