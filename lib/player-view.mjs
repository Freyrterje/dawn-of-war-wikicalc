const title = value => String(value??'').replaceAll('\\','/').split('/').at(-1).replace(/\.(rgd|lua|nil)$/,'').replace(/^tp_/,'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const idFor = value => ('attrib/'+value.replace(/^attrib[\\/]/,'')).replaceAll('\\','/').replace(/\.(lua|nil)$/i,'.rgd').toLowerCase();

/** Translate generic records into the gameplay properties used by their wiki pages. */
export function playerView(entry, nameFor = ()=>null) {
  const f=entry.fields??{};
  const out={...entry,stats:{...entry.stats}};
  const add=(label,path)=>{if(f[path]!==undefined)out.stats[label]=f[path];};
  if(entry.kind==='weapon') {
    for(const [label,path] of Object.entries({
      'Minimum damage':'area_effect.weapon_damage.armour_damage.min_damage',
      'Maximum damage':'area_effect.weapon_damage.armour_damage.max_damage',
      'Minimum damage after armour':'area_effect.weapon_damage.armour_damage.min_damage_value',
      'Reload interval (s)':'reload_time','Setup time (s)':'setup_time',
      'Morale damage':'area_effect.weapon_damage.armour_damage.morale_damage',
      'Area radius':'area_effect.area_effect_information.radius'
    }))add(label,path);
    if(typeof f.accuracy==='number')out.stats['Accuracy']=`${(f.accuracy*100).toFixed(1)}%`;
    out.stats['Attack type']=f.melee_weapon?'Melee':'Ranged';
    if(!f.melee_weapon){add('Minimum range','min_range');add('Maximum range','max_range');}
    for(const [path,ref]of Object.entries(f))if(path.endsWith('.armour_type.$REF')&&path.includes('armour_piercing_types')) {
      const value=f[path.replace('.armour_type.$REF','.armour_piercing_value')];
      if(typeof value==='number'&&!ref.endsWith('tp_armour.lua'))out.stats[`${title(ref)} penetration`]=`${Number(value.toFixed(3))}%`;
    }
  }
  if(entry.kind==='abilities')for(const [label,path]of Object.entries({'Recharge time (s)':'recharge_time','Duration (s)':'duration_time','Range':'range','Area radius':'area_effect.area_effect_information.radius','Minimum damage':'area_effect.weapon_damage.armour_damage.min_damage','Maximum damage':'area_effect.weapon_damage.armour_damage.max_damage'}))add(label,path);
  if(['research','addons'].includes(entry.kind))add('Research time (s)','time_cost.time_seconds');
  if(!out.cost) {
    const prefix=entry.kind==='weapon'?'cost.cost.':'time_cost.cost.';
    out.cost={requisition:f[prefix+'requisition']??null,power:f[prefix+'power']??null};
  }
  if(!out.requirements?.length) {
    const requirements={};
    for(const [path,value]of Object.entries(f)) {
      const match=path.match(/^requirements\.(required_\d+)\.([^.]*)$/);
      if(match)(requirements[match[1]]??={})[match[2]]=value;
    }
    out.requirements=Object.values(requirements).filter(r=>r.$REF&&!r.$REF.includes('required_none'));
  }
  out.requirements=(out.requirements??[]).map(r=>{
    const keys=['structure_name','structure_name_1','structure_name_2','research_name','global_addon_name','addon_name','squad_name'];
    const refs=keys.filter(k=>r[k]).map(k=>({id:idFor(r[k]),name:nameFor(idFor(r[k]))||title(r[k])}));
    if(!refs.length)return r;
    const negative=!!r.research_must_not_be_complete;
    if(refs.length===1&&!negative)return {...refs[0],description:'Required before purchase'};
    return {name:(negative?'Must not have ':'')+refs.map(x=>x.name).join(r.$REF?.includes('either')?' or ':', ')};
  });
  return out;
}
