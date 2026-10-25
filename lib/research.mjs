const base = id => typeof id === 'string' ? id.replaceAll('\\','/').split('/').at(-1).replace(/\.(lua|rgd|nil)$/i,'').toLowerCase() : '';
const objects = obj => Object.entries(obj ?? {}).filter(([key,value]) => key !== '$REF' && value && typeof value === 'object').sort(([a],[b])=>a.localeCompare(b));
const fields = {health_maximum_modifier:'hp',health_regeneration_modifier:'regen',armour_modifier:'armourValue',armour_minimum_modifier:'armourMinimum',accuracy_weapon_modifier:'accuracy',min_damage_weapon_modifier:'minDamage',max_damage_weapon_modifier:'maxDamage',min_damage_value_weapon_modifier:'minDamageValue',reload_time_weapon_modifier:'reload',max_range_weapon_modifier:'maxRange',max_upgrades_squad_modifier:'weaponUpgradeMax'};
const operations = {tp_mod_usage_multiplication:'multiply',tp_mod_usage_addition:'add',tp_mod_usage_override:'set'};
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Attach source-targeted research and its research prerequisites, scoped to each entry. */
export function attachResearch(entries, raw, records) {
  const available=raw.multiplayerResearchIds?new Set(raw.multiplayerResearchIds):null;
  const research = raw.records.filter(r=>r.id.startsWith('attrib/research/')&&(!available||available.has(r.id)));
  const byName = new Map(research.map(r=>[base(r.id),r]));
  const names = new Map(records.map(r=>[r.id,r.name]));
  for (const entry of entries) {
    const entity = base(entry.entityId), squad = base(entry.id);
    const entityTargets=new Map([[entity,{}],...(entry.leaders??[]).map(l=>[base(l.entityId??l.id),{leaderId:l.id}])]);
    const weaponTargets=new Map();
    for(const owner of [entry,...(entry.leaders??[])])for(const w of owner.weapons??[]) {
      const key=base(w.id),target={weaponId:w.id,...(owner===entry?{}:{leaderId:owner.id})};
      const targets=weaponTargets.get(key)??[];
      if(!targets.some(t=>t.weaponId===target.weaponId&&t.leaderId===target.leaderId))targets.push(target);
      weaponTargets.set(key,targets);
    }
    const relevant = modifier => {
      const target = base(modifier.target_type_name), application = base(modifier.application_type?.$REF);
      if (!target) return false;
      return entityTargets.has(target) || target === squad || weaponTargets.has(target);
    };
    const seeds = research.filter(r=>objects(r.data.modifiers).some(([,m])=>base(m.$REF)!=='no_modifier' && relevant(m)));
    const attached = new Map();
    const attach = r => {
      if(attached.has(r.id))return;
      const d = r.data, reasons = [], modifiers = [], requires = [], excludes = [];
      const item = {id:r.id,name:names.get(r.id) ?? base(r.id),source:r.source,supported:false,modifiers,cost:{requisition:numeric(d.time_cost?.cost?.requisition),power:numeric(d.time_cost?.cost?.power)},buildTime:numeric(d.time_cost?.time_seconds),requires,excludes,requirements:objects(d.requirements).map(([,v])=>v).filter(v=>base(v.$REF)!=='required_none'),reason:null};
      attached.set(r.id,item);
      for (const [key,m] of objects(d.modifiers)) {
        const type = base(m.$REF), application = base(m.application_type?.$REF), target = base(m.target_type_name);
        if(type==='no_modifier')continue;
        if(!target) { reasons.push(`Unscoped modifier ${type} is not modeled.`); continue; }
        if(!relevant(m))continue;
        const field=fields[type], operation=operations[base(m.usage_type?.$REF)];
        const targets=application==='tp_mod_apply_to_weapon_type'?(weaponTargets.get(target)??[]):
          application==='tp_mod_apply_to_entity_type'&&entityTargets.has(target)&&['hp','regen','armourValue','armourMinimum'].includes(field)?[entityTargets.get(target)]:
          application==='tp_mod_apply_to_squad_type'&&target===squad&&field==='weaponUpgradeMax'?[{}]:[];
        if(!field || !operation || !targets.length || m.probability_of_applying !== 1 || m.exclusive || m.shield_of_faith || numeric(m.value)===null) {
          reasons.push(`Modifier ${key} (${type}) has unsupported behavior for this entry.`);continue;
        }
        for(const scoped of targets)modifiers.push({field,operation,value:m.value,...scoped,sourceField:`modifiers.${key}`,sourceId:r.id});
      }
      for(const requirement of item.requirements) {
        const type=base(requirement.$REF);
        if(type==='required_research') {
          const dependency=byName.get(base(requirement.research_name));
          if(!dependency){reasons.push('A research prerequisite could not be resolved.');continue;}
          if(requirement.research_must_not_be_complete) excludes.push(dependency.id);
          else {requires.push(dependency.id);attach(dependency);}
        } else if(!['required_structure','required_structure_either','global_required_addon','required_total_pop','required_squad_cap','required_cumulative_squad_cap','required_none'].includes(type)) reasons.push(`Requirement ${type} is not modeled.`);
      }
      item.requires=[...new Set(requires)];item.excludes=[...new Set(excludes)];
      item.supported=reasons.length===0;
      item.reason=reasons.length ? [...new Set(reasons)].join(' ') : modifiers.length ? 'All modifiers affecting this entry are supported; infrastructure prerequisites are assumed satisfied.' : 'Research prerequisite: no direct modeled effect on this entry; infrastructure prerequisites are assumed satisfied.';
    };
    seeds.forEach(attach);
    // A research whose prerequisite cannot be modeled must also be disabled.
    for(let pass=0;pass<attached.size;pass++) {
      let changed=false;
      for(const item of attached.values()) if(item.supported && item.requires.some(id=>!attached.get(id)?.supported)) {item.supported=false;item.reason='A required research has unsupported effects or requirements.';changed=true;}
      if(!changed)break;
    }
    entry.upgrades=[...attached.values()].sort((a,b)=>a.name.localeCompare(b.name));
  }
  return entries;
}
