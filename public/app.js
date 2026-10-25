const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (value, digits = 2) => value == null || value === '' ? '—' : typeof value === 'number' ? Number.isFinite(value) ? value.toLocaleString('en-US', {maximumFractionDigits: digits}) : '—' : esc(value);
const readable = value => String(value ?? '').replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase());
const category = entry => ({infantry:'Infantry',vehicle:'Vehicles',vehicles:'Vehicles',building:'Buildings',buildings:'Buildings'}[String(entry.category).toLowerCase()] || entry.category || 'Other');
const entryUrl = id => `#entry/${encodeURIComponent(id)}`;
const main = $('#main');
const icons = {
  Infantry:'<path d="M8 2h4v4H8zM5 9h10M7 6v7l-3 5M13 6v7l3 5M10 9v7"/>',
  Vehicles:'<path d="M3 10h14v6H3zM6 10V6h7v4M10 6V3h7M5 18h10"/><circle cx="6" cy="13" r="1"/><circle cx="14" cy="13" r="1"/>',
  Buildings:'<path d="M3 18h14M5 18V7h10v11M3 7l7-5 7 5M8 18v-5h4v5M8 9h4"/>',
  search:'<circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/>'
};
const icon = name => `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">${icons[name] || icons.Infantry}</svg>`;
let entries = [], meta = {}, details = new Map(), renderToken = 0, toastTimer;
let filters = {search:'',faction:'',category:'',variants:false};
let armies = {left:[],right:[]};
try {const saved = JSON.parse(localStorage.getItem('wikicalc-armies') || 'null'); if (saved?.left && saved?.right) armies = saved;} catch {}
let calculation = null;
let settings = {range:20,mode:'ranged'};

async function api(path, body) {
  const response = await fetch(path, body == null ? {signal:AbortSignal.timeout(30000)} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
async function getEntry(id) {
  if (!details.has(id)) details.set(id, await api(`/api/entry?id=${encodeURIComponent(id)}`));
  return details.get(id);
}
function toast(message) {const node = $('#toast');node.textContent = message;node.classList.add('show');clearTimeout(toastTimer);toastTimer = setTimeout(() => node.classList.remove('show'),3500);}
function saveArmies() {localStorage.setItem('wikicalc-armies',JSON.stringify(armies));updateCount();calculation = null;}
function updateCount() {const count = armies.left.length + armies.right.length;$('#army-count').textContent = count;$('#army-count').hidden = !count;}
function addToArmy(id, side) {
  const entry = entries.find(e => e.id === id) || details.get(id);
  if (!entry) return;
  if (armies[side].length >= 12) {toast('Each force supports up to 12 groups.');return;}
  armies[side].push({id,count:1,size:entry.squadMin ?? 1,weaponChoices:{},researchIds:[]});
  saveArmies();toast(`${entry.name} added to force ${side === 'left' ? 'A' : 'B'}.`);
}
function datasetStamp() {return `<div class="dataset-strip"><span class="status-dot"></span><span>EXTRACTED FROM YOUR LOCAL INSTALLATION</span><span>·</span><span>${esc(meta.version || 'Dawn of War: Definitive Edition')}</span><a href="#dataset">Dataset ${esc((meta.datasetId || 'details').slice(0,10))} ↗</a></div>`;}
function renderError(error) {main.innerHTML = `<div class="container"><p class="eyebrow">Archive unavailable</p><h1>Unable to open this record.</h1><div class="error">${esc(error.message)}</div><p class="small muted" style="margin-top:20px">Check that the local server is running and a game dataset has been imported.</p><a class="btn" href="#wiki">Return to the field index</a></div>`;}
function table(rows, className = 'property-table') {return `<div class="table-wrap"><table class="${className}"><tbody>${rows.map(([label,value]) => `<tr><td>${esc(label)}</td><td>${value}</td></tr>`).join('')}</tbody></table></div>`;}
function scalar(value) {if (value == null) return '—';if (typeof value === 'object') return esc(JSON.stringify(value));return fmt(value);}
function describeRequirement(item) {
  if (!item || typeof item !== 'object' || !item.$REF) return item;
  const label = readable(item.$REF.split('\\').at(-1).replace(/\.lua$/,'').replace(/^required_/,''));
  const parts = Object.entries(item).filter(([k])=>k!=='$REF'&&k!=='is_display_requirement').map(([k,v])=>`${readable(k)}: ${typeof v==='string' ? v.replaceAll('\\','/').split('/').at(-1).replace(/\.lua$/,'').replaceAll('_',' ') : v}`);
  return {name:label,reason:parts.join(' · ')};
}
function links(items, empty = 'No linked records are available.') {
  if (!items?.length) return `<p class="small muted">${empty}</p>`;
  const total = items.length; items = items.filter(item => typeof item === 'string' || item.resolved !== false).slice(0,60).map(describeRequirement);
  return `${total > 60 ? '<p class="small muted">Showing up to 60 resolved links. All references remain searchable in source fields.</p>' : ''}<ul class="relation-list">${items.map(item => typeof item === 'string' ? `<li>${esc(item)}</li>` : `<li>${item.id && item.resolved !== false ? `<a href="${entryUrl(item.id)}">${esc(item.name || item.id)}</a>` : esc(item.name || item.value || item.id || JSON.stringify(item))}${item.field || item.kind ? `<small>${esc(item.kind || item.field)}</small>` : ''}${item.reason ? `<small>${item.supported===false ? 'Not selectable: ' : ''}${esc(item.reason)}</small>`:''}</li>`).join('')}</ul>`;
}

function renderWiki() {
  const factions = [...new Set(entries.map(e => e.faction).filter(Boolean))].sort();
  const browse = entries.filter(e => ['Infantry','Vehicles','Buildings'].includes(category(e)) && (filters.variants || e.scope !== 'variant'));
  const countOf = cat => browse.filter(e => category(e) === cat).length;
  main.innerHTML = `<section class="hero"><div class="hero-inner"><div><p class="eyebrow">Definitive Edition · Field reference</p><h1>Know your army.<br>Understand the trade.</h1><p class="hero-description">Explore units, weapons, and structures straight from the game files. Build opposing forces and examine the numbers behind an engagement.</p></div><div class="hero-stats"><div class="hero-stat"><strong>${factions.length}</strong><span>Factions</span></div><div class="hero-stat"><strong>${countOf('Infantry')}</strong><span>Infantry records</span></div><div class="hero-stat"><strong>${countOf('Vehicles')}</strong><span>Vehicle records</span></div><div class="hero-stat"><strong>${countOf('Buildings')}</strong><span>Building records</span></div></div></div></section>${datasetStamp()}<div class="container"><div class="toolbar"><div class="search">${icon('search')}<input id="search" type="search" placeholder="Search units, structures, and source IDs…" aria-label="Search the field index" value="${esc(filters.search)}"></div><select id="faction-filter" aria-label="Filter by faction"><option value="">All factions</option>${factions.map(f => `<option${f === filters.faction ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select><select id="category-filter" aria-label="Filter by category"><option value="">All categories</option>${['Infantry','Vehicles','Buildings'].map(c => `<option${c === filters.category ? ' selected' : ''}>${c}</option>`).join('')}</select></div><label class="variant-toggle"><input id="variant-filter" type="checkbox"${filters.variants ? ' checked':''}> Include campaign and scripted variants</label><div class="index-layout"><aside class="faction-nav" aria-label="Faction index"><span class="small-label">The armies</span>${factions.map((f,i) => `<a href="#faction-${i}" data-faction-scroll="${i}">${esc(f)}<small>${browse.filter(e => e.faction === f).length}</small></a>`).join('')}</aside><div id="index-results"></div></div></div>`;
  const update = () => {
    const search = filters.search.toLowerCase();
    const filtered = browse.filter(e => (!filters.faction || e.faction === filters.faction) && (!filters.category || category(e) === filters.category) && (!search || `${e.name} ${e.id} ${e.faction}`.toLowerCase().includes(search)));
    $('#index-results').innerHTML = filtered.length ? factions.map((f,i) => {
      const list = filtered.filter(e => e.faction === f);
      if (!list.length) return '';
      return `<section class="faction-section" id="faction-${i}"><div class="section-heading"><div class="faction-title"><span class="faction-number">${String(i+1).padStart(2,'0')}</span><h2>${esc(f)}</h2></div><span>${list.length} records</span></div><div class="categories">${['Infantry','Vehicles','Buildings'].filter(c => !filters.category || c === filters.category).map(c => {
        const group = list.filter(e => category(e) === c).sort((a,b) => a.name.localeCompare(b.name));
        return `<section class="category-card"><div class="category-head">${icon(c)}<h3>${c}</h3><span>${group.length}</span></div>${group.length ? `<ul class="entry-list">${group.map(e => `<li><a href="${entryUrl(e.id)}"><span>${esc(e.name)}</span><span class="arrow" aria-hidden="true">↗</span></a></li>`).join('')}</ul>` : '<p class="empty-category">No matching records</p>'}</section>`;
      }).join('')}</div></section>`;
    }).join('') : `<div class="empty-state"><h2>No matching records</h2><p>Try a different name, faction, or category.</p><button id="reset-filters" class="btn">Clear filters</button></div>`;
    $('#reset-filters')?.addEventListener('click',() => {filters = {search:'',faction:'',category:'',variants:false};renderWiki();});
  };
  $('#variant-filter').addEventListener('change',event => {filters.variants = event.target.checked;renderWiki();});
  $('#search').addEventListener('input',event => {filters.search = event.target.value;update();});
  $('#faction-filter').addEventListener('change',event => {filters.faction = event.target.value;update();});
  $('#category-filter').addEventListener('change',event => {filters.category = event.target.value;update();});
  document.querySelectorAll('[data-faction-scroll]').forEach(a => a.addEventListener('click',event => {event.preventDefault();const id = a.dataset.factionScroll;filters.faction = '';filters.search = '';$('#search').value = '';$('#faction-filter').value = '';update();$(`#faction-${id}`)?.scrollIntoView({behavior:'smooth'});}));
  update();
}

function weaponTable(weapons) {
  if (!weapons?.length) return '<p class="small muted">No weapon records are linked to this entry.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Weapon</th><th>Damage</th><th>Accuracy</th><th>Reload</th><th>Range</th></tr></thead><tbody>${weapons.map(w => `<tr><td>${w.id ? `<a href="${entryUrl(w.id)}">${esc(w.name || w.id.split('/').pop())}</a>` : esc(w.name || 'Weapon')}<br><span class="muted small">${w.melee ? 'Melee' : 'Ranged'}${w.slot ? ` · ${esc(w.slot.replace('hardpoint_', 'HP '))}` : ''}${w.default ? ' · Default' : ''}</span></td><td>${fmt(w.minDamage ?? w.damageMin)}–${fmt(w.maxDamage ?? w.damageMax)}</td><td>${w.accuracy == null ? '—' : `${fmt(w.accuracy * 100)}%`}</td><td>${fmt(w.reload ?? w.reloadTime)} s</td><td>${w.melee ? 'Contact' : fmt(w.minRange)+'–'+fmt(w.maxRange)}</td></tr>`).join('')}</tbody></table></div>`;
}
async function renderDetail(id, token) {
  main.innerHTML = '<div class="loading">Opening source record…</div>';
  const entry = await getEntry(id);
  if (token !== renderToken) return;
  const base = entries.find(e => e.id === id) || entry;
  const source = entry.source || {};
  const stats = {...(entry.stats || {})};
  if (entry.kind === 'weapon') for (const [label,path] of Object.entries({'Minimum damage':'area_effect.weapon_damage.armour_damage.min_damage','Maximum damage':'area_effect.weapon_damage.armour_damage.max_damage','Minimum damage floor':'area_effect.weapon_damage.armour_damage.min_damage_value','Accuracy':'accuracy','Reload time (s)':'reload_time','Minimum range':'min_range','Maximum range':'max_range','Setup time (s)':'setup_time','Melee weapon':'melee_weapon','Area-effect radius':'area_effect.area_effect_information.radius'})) stats[label] = entry.fields?.[path] ?? null;
  const cost = entry.cost || {requisition:entry.fields?.['cost.cost.requisition'] ?? entry.fields?.['time_cost.cost.requisition'],power:entry.fields?.['cost.cost.power'] ?? entry.fields?.['time_cost.cost.power']};
  const relations = entry.relations || [];
  const partition = expression => relations.filter(r => expression.test(`${r.field} ${r.kind} ${r.id}`));
  const requirements = entry.requirements?.length ? entry.requirements : partition(/requirement/);
  const abilities = entry.abilities?.length ? entry.abilities : partition(/abilit/);
  const upgrades = entry.upgrades?.length ? entry.upgrades : partition(/research|upgrade|addon/);
  const otherRelations = relations.filter(r => !/requirement|abilit|research|upgrade|addon/.test(`${r.field} ${r.kind} ${r.id}`));
  const isUnit = ['Infantry','Vehicles','Buildings'].includes(category(entry));
  main.innerHTML = `<div class="container"><div class="breadcrumb"><a href="#wiki">Field index</a><span>/</span><span>${esc(entry.faction || entry.kind || 'Source record')}</span><span>/</span><span>${esc(category(entry))}</span></div><div class="detail-heading"><div><p class="eyebrow">${esc(entry.faction || entry.kind || 'Archive record')} · ${esc(category(entry))}</p><h1>${esc(entry.name || id)}</h1><p>Local game data · ${esc(meta.version || 'Definitive Edition')}</p></div>${isUnit ? `<div class="actions"><button class="btn btn-primary" data-add="left">+ Add to force A</button><button class="btn btn-b" data-add="right">+ Add to force B</button></div>` : ''}</div>${entry.warnings?.length ? `<div class="notice" style="margin-bottom:24px">${entry.warnings.map(esc).join('<br>')}</div>` : ''}<div class="stat-grid"><div class="stat-box"><strong>${isUnit ? fmt(entry.hp) : esc(readable(entry.kind))}</strong><span>${isUnit ? 'Health per model' : 'Source record type'}</span></div><div class="stat-box"><strong>${fmt(cost.requisition)} <small style="font:11px sans-serif">REQ</small> / ${fmt(cost.power)} <small style="font:11px sans-serif">PWR</small></strong><span>Base cost</span></div><div class="stat-box"><strong>${fmt(entry.squadMin)} / ${fmt(entry.squadMax)}</strong><span>Starting / max squad</span></div><div class="stat-box"><strong style="font-size:20px">${esc(entry.armorName || (entry.armor ? readable(String(entry.armor).replace(/^.*[\\/]/,'').replace(/\.(lua|rgd)$/,'')) : '—'))}</strong><span>Armour class</span></div></div><div class="detail-columns"><div><section class="panel"><h2>${isUnit ? 'Unit profile' : 'Record profile'}</h2>${Object.keys(stats).length ? table(Object.entries(stats).map(([key,value]) => [readable(key),scalar(value)])) : table([['Health',fmt(entry.hp)],['Health regeneration',fmt(entry.regen)],['Movement speed',fmt(entry.speed)],['Production time',fmt(entry.buildTime)],['Armour',fmt(entry.armor)]])}<p class="small muted" style="margin:14px 0 0">A dash means the value is unavailable or does not apply. Zero is shown explicitly.</p></section><section class="panel"><h2>Weapons & hardpoints</h2>${weaponTable(entry.weapons)}<p class="small muted" style="margin:14px 0 0">Damage is the source weapon range before target armour. The calculator applies its stated engagement assumptions.</p></section><section class="panel"><h2>Research & upgrades</h2>${links(upgrades,'No research or upgrade links were found for this record.')}</section><section class="panel"><h2>Abilities & requirements</h2><h3>Abilities</h3>${links(abilities,'No ability links were found.')}<h3 style="margin-top:22px">Requirements</h3>${links(requirements,'No requirement links were found.')}<p class="small muted" style="margin-top:14px">Inspect the source fields for requirement conditions and modifier values.</p></section><section class="panel"><h2>Source fields</h2><p class="small muted">The extracted field paths below preserve the original record structure for verification.</p><input id="field-search" type="search" aria-label="Filter source fields" placeholder="Filter fields, e.g. health, cost, morale…"><div id="source-fields" style="margin-top:12px"></div></section></div><aside><section class="panel"><p class="small-label">Record provenance</p><h2>From the installation</h2>${table([['Module',fmt(source.module)],['Archive',`<span class="mono">${esc(source.archive || source.file || '—')}</span>`],['Member',`<span class="mono">${esc(source.member || id)}</span>`]])}<details class="data-details"><summary>Identifiers & checksum</summary><p class="mono">${esc(id)}</p><p class="mono">${esc(source.sha256 || source.hash || 'Checksum available in dataset manifest')}</p></details>${entry.entityId ? `<p class="small muted">Base model: <a href="${entryUrl(entry.entityId)}" style="text-decoration:underline">${esc(entry.entityId.split('/').at(-1))}</a></p>` : ''}${entry.provenance ? `<details class="data-details"><summary>Displayed value provenance</summary><pre class="raw-data">${esc(JSON.stringify(entry.provenance,null,2))}</pre></details>` : ''}<a class="small" href="#dataset">View dataset & extraction details ↗</a></section>${isUnit ? `<section class="panel"><p class="small-label">Compare an engagement</p><h2>Put the data to work.</h2><p class="small muted">Add this record to either force, then choose squad sizes and inspect the model assumptions.</p><a class="btn" href="#calculator">Open trade calculator →</a></section>` : ''}<section class="panel"><h2>Related records</h2>${links(otherRelations)}</section>${entry.referencedBy?.length ? `<section class="panel"><h2>Used by</h2>${links(entry.referencedBy)}</section>` : ''}</aside></div></div>`;
  document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click',() => addToArmy(base.id,button.dataset.add)));
  let fields = entry.fields || {};
  if (Array.isArray(fields)) fields = Object.fromEntries(fields.map(f => [f.path || f.name,f.value]));
  const renderFields = search => {
    const rows = Object.entries(fields).filter(([key,value]) => `${key} ${JSON.stringify(value)}`.toLowerCase().includes(search.toLowerCase()));
    $('#source-fields').innerHTML = rows.length ? `<p class="small muted">${rows.length} matching fields · showing ${Math.min(rows.length,100)}. Narrow the filter to inspect specific values.</p>` + table(rows.slice(0,100).map(([key,value]) => [key,`<span class="source-value">${scalar(value)}</span>`])) : '<p class="small muted">No matching source fields.</p>';
  };
  $('#field-search').addEventListener('input',event => renderFields(event.target.value));renderFields('');
}

function groupCard(group,index,side) {
  const e = details.get(group.id) || entries.find(e => e.id === group.id) || {name:group.id};
  const options = e.weaponOptions || e.weapons || [];
  const research = e.researchOptions || e.supportedResearch || (e.upgrades || []).filter(r => r.supported === true);
  let upgradeCap = e.weaponUpgradeMax;
  for (const r of research.filter(r => group.researchIds?.includes(r.id))) for (const m of r.modifiers || []) if (m.field === 'weaponUpgradeMax' && upgradeCap != null) upgradeCap = m.operation === 'add' ? upgradeCap + m.value : m.operation === 'multiply' ? upgradeCap * m.value : m.value;
  const slots = [...new Set(options.map(w => w.slot))];
  group.weaponChoices ||= {}; group.researchIds ||= [];
  const loadout = slots.map(slot => {
    const choices = options.filter(w => w.slot === slot);
    const base = choices.find(w => w.default) || choices[0];
    if (choices.length < 2) return '';
    const selected = group.weaponChoices[slot];
    const disabled = upgradeCap == null || upgradeCap === 0;
    return '<div class="weapon-slot"><div><label for="weapon-'+side+'-'+index+'-'+esc(slot)+'">'+esc(readable(slot))+'</label><select id="weapon-'+side+'-'+index+'-'+esc(slot)+'" data-slot="'+esc(slot)+'"'+(disabled?' disabled':'')+'><option value="">'+esc(base.name || base.id)+' (default)</option>'+choices.filter(w=>w.id!==base.id && w.selectable!==false).map(w=>'<option value="'+esc(w.id)+'"'+(selected?.id===w.id?' selected':'')+'>'+esc(w.name || w.id)+'</option>').join('')+'</select></div><div><label for="weapon-count-'+side+'-'+index+'-'+esc(slot)+'">Per squad</label><input id="weapon-count-'+side+'-'+index+'-'+esc(slot)+'" type="number" data-slot-count="'+esc(slot)+'" min="1" max="'+Math.min(group.size,upgradeCap ?? 0)+'" value="'+(selected?.count ?? 1)+'"'+(!selected || disabled?' disabled':'')+'></div></div>';
  }).join('');
  return '<div class="group-card" data-group="'+side+':'+index+'"><div class="group-top"><div class="group-name"><a href="'+entryUrl(group.id)+'">'+esc(e.name)+'</a><small>'+esc(e.faction || '')+' · '+esc(category(e))+'</small></div><button class="remove" data-remove="'+side+':'+index+'" aria-label="Remove '+esc(e.name)+' from force '+(side==='left'?'A':'B')+'">×</button></div><div class="group-fields"><div class="field"><label for="count-'+side+'-'+index+'">Squads / units</label><input id="count-'+side+'-'+index+'" type="number" min="1" max="50" step="1" data-prop="count" value="'+esc(group.count)+'"></div><div class="field"><label for="size-'+side+'-'+index+'">Models / squad</label><input id="size-'+side+'-'+index+'" type="number" min="'+esc(e.squadMin ?? 1)+'" max="'+esc(e.squadMax ?? e.squadMin ?? 1)+'" step="1" data-prop="size" value="'+esc(group.size)+'"></div><div class="field"><label>Weapon upgrade limit</label><span class="small muted">'+fmt(upgradeCap)+' / squad</span></div></div>'+(loadout ? '<details class="data-details"'+(Object.keys(group.weaponChoices).length?' open':'')+'><summary>Choose weapon upgrades</summary>'+loadout+'<p class="small muted">Unassigned models keep the default weapon. Shared upgrade limits are checked; infrastructure prerequisites are assumed available.</p></details>' : '')+(research.length?'<div class="group-research"><span class="small-label">Supported research</span>'+research.map(r=>'<label><input type="checkbox" data-research="'+esc(r.id)+'"'+(group.researchIds.includes(r.id)?' checked':'')+'>'+esc(r.name || r.id)+'</label>').join('')+'</div>':'')+(e.calculable===false?'<p class="small muted" style="margin-bottom:0">This record may not have enough data for the supported combat model.</p>':'')+'</div>';
}
async function renderCalculator(token) {
  main.innerHTML = '<div class="loading">Preparing the trade calculator…</div>';
  await Promise.all([...armies.left,...armies.right].map(g => getEntry(g.id).catch(() => null)));
  if (token !== renderToken) return;
  const candidates = entries.filter(e => ['Infantry','Vehicles','Buildings'].includes(category(e)) && e.scope !== 'variant').sort((a,b) => `${a.faction} ${a.name}`.localeCompare(`${b.faction} ${b.name}`));
  main.innerHTML = `<div class="container"><div class="calculator-intro"><div><p class="eyebrow">Engagement analysis</p><h1>Compare the trade.</h1><p>Assemble both forces and examine an expected-damage engagement. Model losses reduce firepower as the fight progresses.</p></div><a href="#wiki" class="btn">Browse the field index ↗</a></div><div class="calculator-layout">${['left','right'].map((side,i) => `<section class="army-panel ${i ? 'side-b':''}"><div class="army-heading"><h2>Force ${i ? 'B':'A'}</h2><span>${i ? 'AMBER':'TEAL'} FORCE</span></div><div class="army-body"><div class="army-picker"><select id="picker-${side}" aria-label="Choose a unit for force ${i ? 'B':'A'}"><option value="">Choose a unit or structure…</option>${[...new Set(candidates.map(e => e.faction))].map(f => `<optgroup label="${esc(f)}">${candidates.filter(e => e.faction === f).map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</optgroup>`).join('')}</select><button class="btn btn-small" data-picker-add="${side}">+ Add</button></div>${armies[side].length ? armies[side].map((g,j) => groupCard(g,j,side)).join('') : '<div class="army-empty">No units deployed.<br>Choose a unit above or add one from its wiki page.</div>'}</div></section>`).join('')}</div><div class="calc-settings"><div class="field"><label for="combat-mode">Engagement mode</label><select id="combat-mode"><option value="ranged"${settings.mode === 'ranged' ? ' selected':''}>Stationary ranged</option><option value="melee"${settings.mode === 'melee' ? ' selected':''}>Melee</option></select></div><div class="field"><label for="combat-range">Fixed separation (game units)</label><input id="combat-range" type="number" min="0" max="200" step="1" value="${settings.range}"></div><button id="calculate" class="btn btn-primary"${!armies.left.length || !armies.right.length ? ' disabled':''}>Calculate engagement →</button></div><div id="calc-output" aria-live="polite">${calculation ? renderResult(calculation):''}</div><section class="panel" style="margin-top:28px"><h2>Read the model before the result.</h2><p class="small muted">This is an expected-damage estimate, not the game engine. Both forces start at full health and engage at a fixed separation. Losing a model reduces that force’s active firepower. The result is sensitive to loadout, targeting, and the mechanics listed below.</p><div class="notice"><strong>Scope & exclusions</strong><br>Movement, cover, morale state changes, active abilities, reinforcement during combat, and spatial area-of-effect hits are not represented unless the calculation explicitly says otherwise. Unsupported weapon mechanics may prevent a result. A stationary range comparison does not predict pursuit or a real match.</div><details class="data-details"><summary>How to interpret time and resources</summary><p class="small muted">Time is the model’s elapsed engagement time. Resource figures retain requisition and power as separate resources. Starting health divided by starting DPS is only a stationary damage estimate; it does not account for attrition. Read any warnings returned with each calculation.</p></details></section></div>`;
  document.querySelectorAll('[data-picker-add]').forEach(button => button.addEventListener('click',() => {const side = button.dataset.pickerAdd;const id = $(`#picker-${side}`).value;if (id) {addToArmy(id,side);renderCalculator(++renderToken).catch(renderError);}}));
  document.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click',() => {const [side,index] = button.dataset.remove.split(':');armies[side].splice(Number(index),1);saveArmies();renderCalculator(++renderToken).catch(renderError);}));
  document.querySelectorAll('[data-group]').forEach(card => {
    const [side,index] = card.dataset.group.split(':');
    card.querySelectorAll('[data-prop]').forEach(input => input.addEventListener('change',() => {const value = Number(input.value);if (!Number.isInteger(value) || value < Number(input.min) || value > Number(input.max)) {input.reportValidity();return;}armies[side][index][input.dataset.prop] = value;saveArmies();$('#calc-output').innerHTML = '';}));
    card.querySelectorAll('[data-slot]').forEach(input => input.addEventListener('change',() => {
      const group = armies[side][index], slot = input.dataset.slot;
      if (input.value) group.weaponChoices[slot] = {id:input.value,count:1}; else delete group.weaponChoices[slot];
      saveArmies();renderCalculator(++renderToken).catch(renderError);
    }));
    card.querySelectorAll('[data-slot-count]').forEach(input => input.addEventListener('change',() => {
      if (!input.checkValidity()) {input.reportValidity();return;}
      armies[side][index].weaponChoices[input.dataset.slotCount].count = Number(input.value);
      saveArmies();$('#calc-output').innerHTML = '';
    }));
    card.querySelectorAll('[data-research]').forEach(input => input.addEventListener('change',() => {const group = armies[side][index];group.researchIds = [...card.querySelectorAll('[data-research]:checked')].map(i => i.dataset.research);saveArmies();renderCalculator(++renderToken).catch(renderError);}));
  });
  $('#combat-mode').addEventListener('change',event => {settings.mode = event.target.value;settings.range = settings.mode === 'melee' ? 0 : 20;$('#combat-range').value = settings.range;calculation = null;$('#calc-output').innerHTML = '';});
  $('#combat-range').addEventListener('change',event => {settings.range = Number(event.target.value);calculation = null;$('#calc-output').innerHTML = '';});
  $('#calculate').addEventListener('click',calculate);
}
async function calculate() {
  const button = $('#calculate');
  const invalid = [...document.querySelectorAll('.calculator-layout input,.calc-settings input')].find(input => !input.checkValidity());
  if (invalid) {invalid.reportValidity();return;}
  button.disabled = true;button.textContent = 'Calculating…';
  try {
    calculation = await api('/api/calculate',{...armies,options:settings});
    $('#calc-output').innerHTML = renderResult(calculation);
    $('#calc-output').scrollIntoView({behavior:'smooth',block:'start'});
  } catch(error) {$('#calc-output').innerHTML = `<div class="error" style="margin-top:24px"><strong>This engagement could not be calculated.</strong><br>${esc(error.message)}</div>`;}
  finally {button.disabled = false;button.textContent = 'Calculate engagement →';}
}
function renderResult(result) {
  if (result.error) return '<div class="error">'+esc(result.error)+'</div>';
  const status = result.status || result.winner || 'No decisive result';
  const outcome = status.replace(/left/gi,'Force A').replace(/right/gi,'Force B');
  const warnings = result.warnings || [];
  const sides = [result.left,result.right];
  const history = result.history || [];
  let graph = '';
  if (history.length > 1) {
    const width=900,height=180,pad=28,maxTime=Math.max(...history.map(p=>p.time),1),maxHp=Math.max(...history.map(p=>Math.max(p.leftHp,p.rightHp)),1);
    const points = key => history.map(p=>((p.time/maxTime)*(width-pad*2)+pad).toFixed(1)+','+(height-pad-(p[key]/maxHp)*(height-pad*2)).toFixed(1)).join(' ');
    graph='<section class="panel"><h2>Health through the engagement</h2><p class="chart-label">Total remaining health · '+fmt(maxTime)+' seconds</p><svg class="chart" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Remaining health of both forces over the engagement"><path d="M'+pad+' '+pad+'V'+(height-pad)+'H'+(width-pad)+'" fill="none" stroke="#cbd3c1"/><polyline points="'+points('leftHp')+'" fill="none" stroke="#346f6c" stroke-width="2.5"/><polyline points="'+points('rightHp')+'" fill="none" stroke="#9c7437" stroke-width="2.5"/><text x="'+pad+'" y="'+(height-8)+'">0 s</text><text x="'+(width-pad-40)+'" y="'+(height-8)+'">'+fmt(maxTime)+' s</text></svg><div class="result-legend"><span><i></i>Force A</span><span><i class="amber"></i>Force B</span></div><p class="small muted">Health can recover where the source provides combat regeneration. Model deaths reduce the active weapon count.</p></section>';
  }
  const sidePanel=(side,i)=>side?'<section class="panel"><h2>Force '+(i?'B':'A')+'</h2>'+table([['Initial expected DPS',fmt(side.initialDps)],['Starting health',fmt(side.initialHp)],['Remaining health',fmt(side.remainingHp)],['Surviving models',fmt(side.remainingModels)+' / '+fmt(side.initialModels)],['Starting requisition',fmt(side.cost?.requisition)],['Starting power',fmt(side.cost?.power)],['Requisition lost',fmt(side.losses?.requisition)],['Power lost',fmt(side.losses?.power)]])+'</section>':'';
  return '<section class="result-section"><div class="result-title"><h2>Engagement estimate</h2><span class="pill">Expected damage model</span></div><div class="result-summary"><div><span>Model outcome</span><strong>'+esc(outcome)+'</strong><p>Under the selected assumptions</p></div><div><span>Elapsed engagement</span><strong>'+fmt(result.time ?? result.duration)+' s</strong></div></div>'+(warnings.length?'<div class="notice" style="margin-bottom:20px">'+warnings.map(esc).join('<br>')+'</div>':'')+graph+'<div class="result-grid">'+sides.map(sidePanel).join('')+'</div>'+(result.assumptions?.length?'<section class="panel"><h2>Calculation assumptions</h2><ul class="assumption-list">'+result.assumptions.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul></section>':'')+'<details class="data-details"><summary>Full calculation details</summary><pre class="raw-data">'+esc(JSON.stringify(result,null,2))+'</pre></details></section>';
}

function renderDataset() {
  const counts = meta.counts || {};
  const limitations = meta.limitations || [];
  main.innerHTML = `<div class="container"><div class="breadcrumb"><a href="#wiki">Field index</a><span>/</span><span>Data & sources</span></div><p class="eyebrow">Audit the archive</p><h1>Grounded in your game.</h1><p class="dataset-intro">Every displayed game value starts with your local Dawn of War: Definitive Edition installation. Source identifiers, field paths, and archive provenance let you trace a record back to its origin.</p><div class="dataset-grid"><section class="panel"><h2>Dataset identity</h2>${table([['Game version',fmt(meta.version)],['Imported',meta.importedAt ? esc(new Date(meta.importedAt).toLocaleString('en-GB')):'—'],['Dataset fingerprint',`<span class="mono">${esc(meta.datasetId || '—')}</span>`],['Visible index entries',fmt(entries.filter(e => ['Infantry','Vehicles','Buildings'].includes(category(e))).length)],...Object.entries(counts).map(([key,value]) => [readable(key),scalar(value)])])}</section><section class="panel"><h2>What the numbers mean</h2><p class="small muted">The wiki preserves source values. Unavailable fields are shown as a dash; a real zero remains zero. Base values do not automatically include research, campaign bonuses, or activated abilities.</p><p class="small muted">Squads and individual entities are distinct game records. Squad composition, weapon hardpoints, and linked requirements are available on the corresponding record page.</p><a class="btn" href="#calculator">Explore the trade model →</a></section></div><section class="panel"><h2>Coverage & known limitations</h2>${limitations.length ? `<ul class="relation-list">${limitations.map(item => `<li>${esc(typeof item === 'string' ? item : JSON.stringify(item))}</li>`).join('')}</ul>` : '<p class="small muted">Inspect individual source records and the project README for extraction and model scope. The dataset does not claim to reproduce every game mechanic.</p>'}</section><section class="panel"><h2>Source manifest</h2><p class="small muted">The manifest records the dataset identity and the source archive metadata produced by the importer.</p><details class="data-details"><summary>Inspect the complete manifest</summary><pre class="raw-data">${esc(JSON.stringify(meta,null,2))}</pre></details></section><section class="panel"><h2>Reference structure</h2><p class="small muted">The faction → infantry / vehicles / buildings organization follows the useful structure of the <a href="https://warhammer-guide.ru/wiki/Dawn_of_War_Players_Guide.html" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">Dawn of War Player’s Guide</a>. Its historical game values are not used as a substitute for installed data.</p></section></div>`;
}

async function route() {
  const token = ++renderToken;
  const hash = location.hash.slice(1) || 'wiki';
  document.querySelectorAll('[data-nav]').forEach(link => link.classList.toggle('active',link.dataset.nav === (hash.startsWith('entry/') ? 'wiki' : hash)));
  window.scrollTo(0,0);
  try {
    if (hash.startsWith('entry/')) await renderDetail(decodeURIComponent(hash.slice(6)),token);
    else if (hash === 'calculator') await renderCalculator(token);
    else if (hash === 'dataset') renderDataset();
    else renderWiki();
    document.title = `${hash.startsWith('entry/') ? (details.get(decodeURIComponent(hash.slice(6)))?.name || 'Source record') : hash === 'calculator' ? 'Trade calculator' : hash === 'dataset' ? 'Data & sources' : 'Field index'} · Dawn of War Wikicalc`;
  } catch(error) {if (token === renderToken) renderError(error);}
}
async function init() {
  try {
    [entries,meta] = await Promise.all([api('/api/entries'),api('/api/meta')]);
    if (!Array.isArray(entries)) entries = entries.entries || [];
    armies.left = armies.left.filter(g => entries.some(e => e.id === g.id));
    armies.right = armies.right.filter(g => entries.some(e => e.id === g.id));
    updateCount();window.addEventListener('hashchange',route);await route();
  } catch(error) {renderError(error);}
}
init();
