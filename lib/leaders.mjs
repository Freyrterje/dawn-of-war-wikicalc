// Squad leaders are purchased models, not global research.
export function normalizeLeaders(data, {source, nameOf, weapon, refId, number}) {
  const leaders=[];
  for (const [slot, option] of Object.entries(data.squad_leader_ext ?? {})) {
    if (!/^leader_\d+$/.test(slot) || !option.leader?.type) continue;
    const id=refId(option.leader.type), record=source.get(id); if(!record)continue;
    const d=record.data, h=d.health_ext ?? {}, weapons=[], modifiers=[], buffs=[], unsupported=[], conditionalAbilities=[];
    for(const [hardpoint,point] of Object.entries(d.combat_ext?.hardpoints??{})) for(const [index,w] of Object.entries(point.weapon_table??{})) {
      if(w?.weapon){const normalized=weapon(refId(w.weapon),hardpoint,index==='weapon_01');if(normalized)weapons.push(normalized);}
    }
    for(const abilityId of Object.values(d.ability_ext?.abilities??{})) {
      const ability=source.get(refId(abilityId)); if(!ability)continue;
      const a=ability.data;
      if(!a.activation?.$REF?.includes('always_on'))continue;
      const requirements=Object.values(a.requirements??{}).filter(r=>r?.$REF&&!r.$REF.includes('required_none'));
      if(requirements.length){conditionalAbilities.push({id:ability.id,name:nameOf(ability),requirements,requiresResearch:requirements.map(r=>refId(r.research_name)).filter(Boolean),supported:false,reason:'Research-activated leader ability is not yet modeled.'});continue;}
      for(const item of Object.values(a.area_effect?.weapon_damage?.modifiers??{})) {
        const m=item?.modifier;if(!m || m.$REF?.includes('no_modifier'))continue;
        const type=m.$REF?.split('\\').at(-1)?.replace('.lua','');
        // Morale, movement and activated-ability changes lie outside this stationary, unbroken-morale duel.
        if(/morale|speed|ability_recharge|ability_bonus_unit|faith|sight/.test(type))continue;
        const field=({min_damage_weapon_modifier:'minDamage',max_damage_weapon_modifier:'maxDamage',accuracy_weapon_modifier:'accuracy',reload_time_weapon_modifier:'reload',health_regeneration_modifier:'regen',health_maximum_modifier:'hp',armour_modifier:'armourValue'})[type];
        const usage=m.usage_type?.$REF??'', operation=usage.includes('multiplication')?'multiply':usage.includes('addition')?'add':usage.includes('enable')?'set':null;
        const info=a.area_effect?.area_effect_information??{};
        const scoped=(info.area_type?.$REF?.includes('effect_squad')||info.radius===0);
        if(field && operation && scoped && m.application_type?.$REF?.includes('apply_to_squad') && !m.target_type_name && (m.probability_of_applying??1)===1 && !requirements.length) {
          modifiers.push({field,operation,value:m.value,target:a.target_leader_in_squad===false?'troopers':'squad',source:ability.id,...(m.exclusive?{exclusive:true}:{})});
          if(field==='maxDamage')buffs.push(`Squad weapon damage +${Math.round((m.value-1)*100)}%`);
        } else unsupported.push(`Passive effect ${nameOf(ability)} is not yet modeled.`);
      }
    }
    const cost=option.cost_time?.cost??{}, hp=number(h.hitpoints);
    if([h.hitpoints,h.regeneration_rate,h.armour,h.armour_minimum].some(v=>number(v)===null))unsupported.push('Leader combat statistics are incomplete.');
    leaders.push({id,name:nameOf(record),hp,regen:number(h.regeneration_rate)===null?null:Math.max(0,h.regeneration_rate-(number(h.regeneration_decrease_in_combat)??0)),armor:refId(d.type_ext?.type_armour?.$REF),armourValue:number(h.armour),armourMinimum:number(h.armour_minimum),cost:{requisition:number(cost.requisition),power:number(cost.power)},buildTime:number(option.cost_time?.time_seconds),maxCount:number(option['0x1eb607b6'])??1,weapons,modifiers,buffs,conditionalAbilities,supported:hp>0&&!unsupported.length,reason:unsupported.join(' ')||null});
  }
  return leaders;
}
