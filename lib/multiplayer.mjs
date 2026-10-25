const ref = value => typeof value === 'string' && value ? ('attrib/' + value.replace(/^attrib[\\/]/i, '')).replaceAll('\\', '/').replace(/\.(lua|nil)$/i, '.rgd').toLowerCase() : null;
const objects = value => Object.values(value ?? {}).filter(v => v && typeof v === 'object');
const basename = id => id.split('/').at(-1).replace(/\.rgd$/, '');

/** Requirements that cannot be satisfied in a multiplayer match. */
export function multiplayerBlocked(data) {
  if (data.type_ext?.single_player_only) return true;
  const requirements = data.squad_requirement_ext?.requirements ?? data.requirement_ext?.requirements ?? data.requirements;
  return objects(requirements).some(r => {
    const type = (r.$REF ?? '').replaceAll('\\', '/');
    return (/required_human_player_metamap_game\.lua$/.test(type) && r.is_human_player_in_a_metamap_game === true)
      || (/required_(?:squad_)?cap\.lua$/.test(type) && (r.max_cap === 0 || r.max_squad_cap === 0));
  });
}

/** Resolve the build menu, production and explicit transformation/summon graph. */
export function multiplayerRoster(raw) {
  const records = new Map(raw.records.map(r => [r.id, r]));
  const active = new Set(), origins = new Map(), research = new Set(), queue = [];
  const resolve = (name, kind, race) => {
    if (!name || typeof name !== 'string') return null;
    if (/[\\/]/.test(name)) return ref(name);
    return raw.records.find(r => r.id.startsWith(`attrib/${kind}/races/${race}/`) && basename(r.id) === name.toLowerCase())?.id ?? null;
  };
  const enqueue = (id, origin) => {
    // Unused legacy structures and non-combat UI actions, verified against the multiplayer roster.
    if (/\/(necron_summoning_core_big|necron_tunnel|space_marine_orbital_relay|dark_eldar_squad_slave_murdered)\.rgd$/.test(id??'')) return;
    // Automatch enables flyers; retain the corresponding Scarab/Spyder blueprints only.
    if (/_no_flyer_/.test(id??'')) return;
    const record = records.get(id);
    if (!record || active.has(id) || multiplayerBlocked(record.data)) return;
    active.add(id); origins.set(id, origin); queue.push(record);
  };
  for (const race of raw.records.filter(r => r.id.startsWith('attrib/racebps/') && r.data.race_details?.playable)) {
    const racePath = race.data.race_path?.squad_path?.replaceAll('\\','/').split('/').at(-1)?.toLowerCase();
    if (!racePath) continue;
    for (const [key,name] of Object.entries(race.data.starting_squads ?? {})) if (key !== '$REF') enqueue(resolve(name,'sbps',racePath),race.id);
    for (const [key,name] of Object.entries(race.data.starting_buildings ?? {})) if (key !== '$REF') enqueue(resolve(name,'ebps',racePath),race.id);
    // Engineers expose eligible structure_buildable_ext blueprints in the race's build menu.
    for (const r of raw.records) if (r.id.startsWith(`attrib/ebps/races/${racePath}/structures/`) && r.data.structure_buildable_ext && !/(?:_sp(?:_|\.)|_nis(?:_|\.)|single_player)/.test(r.id)) enqueue(r.id,race.id+':build_menu');
  }
  while (queue.length) {
    const r = queue.shift(), d = r.data, race = r.id.match(/\/races\/([^/]+)\//)?.[1];
    if (!race) continue;
    for (const [key,name] of Object.entries(d.research_ext?.research_table ?? {})) if(key!=='$REF' && name) research.add(ref(name));
    for (const [key,name] of Object.entries(d.spawner_ext?.squad_table ?? {})) if (key !== '$REF') enqueue(resolve(name,'sbps',race),r.id+':production');
    if (d.squad_loadout_ext?.trooper_base?.type) enqueue(ref(d.squad_loadout_ext.trooper_base.type),r.id+':trooper');
    for (const [key,name] of Object.entries(d.possess_ext ?? {})) if (/^squad_replacement\d?_name$/.test(key)) enqueue(resolve(name,'sbps',race),r.id+':transformation');
    enqueue(resolve(d.direct_spawn_ext?.spawned_squad,'sbps',race),r.id+':summon');
    // Entrenchment changes the state of an existing team; it is not a second recruitable squad.
  }
  return {active,origins,research};
}
