const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (value, digits = 2) => value == null || value === '' ? '—' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : typeof value === 'number' ? Number.isFinite(value) ? value.toLocaleString('en-US', {maximumFractionDigits:digits}) : '—' : esc(value);
const readable = value => String(value ?? '').replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const entryUrl = id => `#entry/${encodeURIComponent(id)}`;
const category = e => ({infantry:'Infantry',vehicle:'Vehicles',vehicles:'Vehicles',building:'Buildings',buildings:'Buildings'}[String(e.category).toLowerCase()] || e.category || '');
const isCombatUnit = e => e && e.multiplayer !== false && ['Infantry','Vehicles'].includes(category(e));
const order = (a,b) => (a.factionOrder ?? 99)-(b.factionOrder ?? 99) || (a.order ?? 999)-(b.order ?? 999) || a.name.localeCompare(b.name);
const main = $('#main');
const icons = {
  Infantry:'<path d="M8 2h4v4H8zM5 9h10M7 6v7l-3 5M13 6v7l3 5M10 9v7"/>',
  Vehicles:'<path d="M3 10h14v6H3zM6 10V6h7v4M10 6V3h7M5 18h10"/><circle cx="6" cy="13" r="1"/><circle cx="14" cy="13" r="1"/>',
  Buildings:'<path d="M3 18h14M5 18V7h10v11M3 7l7-5 7 5M8 18v-5h4v5M8 9h4"/>',
  search:'<circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/>'
};
const icon = name => `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">${icons[name] || icons.Infantry}</svg>`;
let entries = [], details = new Map(), renderToken = 0, toastTimer;
let filters = {search:'',faction:'',category:''};
let armies = {left:[],right:[]}, research = {left:[],right:[]};
let calculation = null, settings = {range:20,mode:'ranged'};
try {
  const saved = JSON.parse(localStorage.getItem('wikicalc-forces-v2') || 'null');
  if (Array.isArray(saved?.armies?.left) && Array.isArray(saved?.armies?.right)) {armies=saved.armies;if(saved.research&&typeof saved.research==='object')research=saved.research;}
} catch {}

async function api(path, body) {
  const response = await fetch(path, body == null ? {signal:AbortSignal.timeout(30000)} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}
async function getEntry(id) {
  if (!details.has(id)) details.set(id,await api(`/api/entry?id=${encodeURIComponent(id)}`));
  return details.get(id);
}
function toast(message) {
  $('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500);
}
function saveForces() {
  localStorage.setItem('wikicalc-forces-v2',JSON.stringify({armies,research}));
  const count=armies.left.length+armies.right.length;
  $('#army-count').textContent=count;$('#army-count').hidden=!count;calculation=null;
}
function addToArmy(id,side) {
  const e=entries.find(e=>e.id===id);
  if (!isCombatUnit(e)) return;
  if (armies[side].length>=12) {toast('Each force supports up to 12 groups.');return;}
  armies[side].push({id,count:1,size:e.squadMin ?? 1,weaponChoices:{},leaders:[]});
  saveForces();toast(`${e.name} added to force ${side==='left'?'A':'B'}.`);
}
function renderError(error) {
  main.innerHTML=`<div class="container"><p class="eyebrow">Unable to open this page</p><h1>Please try again.</h1><div class="error">${esc(error.message)}</div><p><a class="btn" href="#wiki">Return to the field index</a></p></div>`;
}
function table(rows) {
  return `<div class="table-wrap"><table class="property-table"><tbody>${rows.map(([label,value])=>`<tr><td>${esc(label)}</td><td>${value}</td></tr>`).join('')}</tbody></table></div>`;
}
const money = cost => `${fmt(cost?.requisition)} REQ / ${fmt(cost?.power)} PWR`;
function factionNames() {return [...new Set([...entries].sort(order).map(e=>e.faction).filter(Boolean))];}

function renderWiki() {
  const factions=factionNames();
  const browse=entries.filter(e=>['Infantry','Vehicles','Buildings'].includes(category(e)));
  const counts=c=>browse.filter(e=>category(e)===c).length;
  main.innerHTML=`<section class="hero"><div class="hero-inner"><div><p class="eyebrow">Definitive Edition · Multiplayer</p><h1>Know your army.<br>Understand the trade.</h1><p class="hero-description">Explore every faction's units, vehicles, and buildings. Compare loadouts, add squad leaders, and see how an engagement changes.</p></div><div class="hero-stats"><div class="hero-stat"><strong>${factions.length}</strong><span>Factions</span></div><div class="hero-stat"><strong>${counts('Infantry')}</strong><span>Infantry</span></div><div class="hero-stat"><strong>${counts('Vehicles')}</strong><span>Vehicles</span></div><div class="hero-stat"><strong>${counts('Buildings')}</strong><span>Buildings</span></div></div></div></section><div class="container"><div class="toolbar"><div class="search">${icon('search')}<input id="search" type="search" aria-label="Search the field index" placeholder="Search units, vehicles, and buildings…" value="${esc(filters.search)}"></div><select id="faction-filter" aria-label="Filter by faction"><option value="">All factions</option>${factions.map(f=>`<option${f===filters.faction?' selected':''}>${esc(f)}</option>`).join('')}</select><select id="category-filter" aria-label="Filter by category"><option value="">All categories</option>${['Infantry','Vehicles','Buildings'].map(c=>`<option${c===filters.category?' selected':''}>${c}</option>`).join('')}</select></div><div class="index-layout"><aside class="faction-nav" aria-label="Faction index"><span class="small-label">The armies</span>${factions.map((f,i)=>`<a href="#faction-${i}" data-faction-scroll="${i}">${esc(f)}<small>${browse.filter(e=>e.faction===f).length}</small></a>`).join('')}</aside><div id="index-results"></div></div></div>`;
  const update=()=>{
    const filtered=browse.filter(e=>(!filters.faction||e.faction===filters.faction)&&(!filters.category||category(e)===filters.category)&&`${e.name} ${e.faction}`.toLowerCase().includes(filters.search.toLowerCase()));
    $('#index-results').innerHTML=filtered.length?factions.map((f,i)=>{
      const list=filtered.filter(e=>e.faction===f);if(!list.length)return '';
      return `<section class="faction-section" id="faction-${i}"><div class="section-heading"><div class="faction-title"><span class="faction-number">${String(i+1).padStart(2,'0')}</span><h2>${esc(f)}</h2></div></div><div class="categories">${['Infantry','Vehicles','Buildings'].filter(c=>!filters.category||filters.category===c).map(c=>{
        const group=list.filter(e=>category(e)===c).sort(order);
        return `<section class="category-card"><div class="category-head">${icon(c)}<h3>${c}</h3><span>${group.length}</span></div>${group.length?`<ul class="entry-list">${group.map(e=>`<li><a href="${entryUrl(e.id)}"><span>${esc(e.name)}</span><span class="arrow" aria-hidden="true">↗</span></a></li>`).join('')}</ul>`:'<p class="empty-category">No matches</p>'}</section>`;
      }).join('')}</div></section>`;
    }).join(''):'<div class="empty-state"><h2>No matches</h2><p>Try another unit name or faction.</p><button id="reset-filters" class="btn">Clear filters</button></div>';
    $('#reset-filters')?.addEventListener('click',()=>{filters={search:'',faction:'',category:''};renderWiki();});
  };
  $('#search').addEventListener('input',e=>{filters.search=e.target.value;update();});
  $('#faction-filter').addEventListener('change',e=>{filters.faction=e.target.value;update();});
  $('#category-filter').addEventListener('change',e=>{filters.category=e.target.value;update();});
  document.querySelectorAll('[data-faction-scroll]').forEach(a=>a.addEventListener('click',event=>{
    event.preventDefault();filters.faction='';filters.search='';$('#search').value='';$('#faction-filter').value='';update();$(`#faction-${a.dataset.factionScroll}`)?.scrollIntoView({behavior:'smooth'});
  }));update();
}
function friendlyRef(value) {
  if (typeof value!=='string') return String(value ?? '');
  const id='attrib/'+value.replaceAll('\\','/').replace(/\.(lua|nil)$/i,'.rgd').replace(/^attrib\//,'');
  return entries.find(e=>e.id===id)?.name || readable(value.replaceAll('\\','/').split('/').at(-1).replace(/\.(lua|rgd|nil)$/,''));
}
function requirementsList(items) {
  if (!items?.length) return '<p class="small muted">No additional requirements.</p>';
  return `<ul class="relation-list">${items.map(r=>{
    if (typeof r==='string') return `<li>${esc(r)}</li>`;
    if (r.name) return `<li>${r.id?`<a href="${entryUrl(r.id)}">${esc(r.name)}</a>`:esc(r.name)}${r.description?`<small>${esc(r.description)}</small>`:''}</li>`;
    const type=String(r.$REF||'').split('\\').at(-1).replace(/\.lua$/,'');
    const names=['structure_name','structure_name_1','structure_name_2','research_name','global_addon_name','addon_name','squad_name'].filter(k=>r[k]).map(k=>friendlyRef(r[k]));
    let text=names.join(type.includes('either')?' or ':', ');
    if(r.research_must_not_be_complete)text=`Must not have ${text}`;
    if(!text)text=Object.entries(r).filter(([k,v])=>!['$REF','is_display_requirement'].includes(k)&&['number','boolean'].includes(typeof v)).map(([k,v])=>`${readable(k)}: ${v}`).join(' · ');
    return text?`<li>${esc(text)}</li>`:'';
  }).join('')}</ul>`;
}
function itemLinks(items,empty) {
  if(!items?.length)return `<p class="small muted">${empty}</p>`;
  const unique=[...new Map(items.filter(x=>x?.name && x.resolved!==false).map(x=>[x.id||x.name,x])).values()];
  return `<ul class="relation-list">${unique.map(x=>`<li>${x.id?`<a href="${entryUrl(x.id)}">${esc(x.name)}</a>`:esc(x.name)}${x.description?`<small>${esc(x.description)}</small>`:''}</li>`).join('')}</ul>`;
}
function weaponTable(weapons) {
  if(!weapons?.length)return '<p class="small muted">This unit has no weapons.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Weapon</th><th>Damage</th><th>Accuracy</th><th>Reload</th><th>Range</th></tr></thead><tbody>${weapons.map(w=>`<tr><td>${w.id?`<a href="${entryUrl(w.id)}">${esc(w.name)}</a>`:esc(w.name)}<br><span class="small muted">${w.melee?'Melee':'Ranged'}${w.default?' · Default':''}</span></td><td>${fmt(w.minDamage)}–${fmt(w.maxDamage)}</td><td>${w.accuracy==null?'—':fmt(w.accuracy*100)+'%'}</td><td>${fmt(w.reload)} s</td><td>${w.melee?'Contact':fmt(w.minRange)+'–'+fmt(w.maxRange)}</td></tr>`).join('')}</tbody></table></div>`;
}
function leaderPanels(leaders) {
  return (leaders||[]).map(l=>`<article class="leader-profile"><h3>${esc(l.name)}</h3>${table([['Purchase cost',money(l.cost)],['Health',fmt(l.hp)],['Armour',esc(l.armorName||friendlyRef(l.armor))],['Training time',fmt(l.buildTime)+' s']])}${l.buffs?.length?`<ul class="assumption-list">${l.buffs.map(b=>`<li>${esc(b)}</li>`).join('')}</ul>`:''}${weaponTable(l.weapons)}</article>`).join('');
}
async function renderDetail(id,token) {
  main.innerHTML='<div class="loading">Opening unit details…</div>';
  const e=await getEntry(id);if(token!==renderToken)return;
  const kind=category(e)||({weapon:'Weapon',research:'Research',abilities:'Ability',addons:'Building upgrade'}[e.kind]||'Upgrade');
  const canAdd=isCombatUnit(e)&&entries.some(x=>x.id===e.id);
  const stats={...(e.stats||{})};
  const shownStats=Object.entries(stats).filter(([,v])=>v!=null&&typeof v!=='object');
  const relations=e.relations||[];
  const researchOptions=e.upgrades||[];
  const abilities=e.abilities?.length?e.abilities:relations.filter(r=>r.kind==='abilities');
  const related=(e.referencedBy||[]).filter(r=>entries.some(x=>x.id===r.id));
  const cost=e.cost||{};
  main.innerHTML=`<div class="container"><div class="breadcrumb"><a href="#wiki">Field index</a><span>/</span><span>${esc(e.faction||kind)}</span>${e.faction?`<span>/</span><span>${esc(kind)}</span>`:''}</div><div class="detail-heading"><div><p class="eyebrow">${esc(e.faction||'Definitive Edition')} · ${esc(kind)}</p><h1>${esc(e.name)}</h1></div>${canAdd?'<div class="actions"><button class="btn btn-primary" data-add="left">+ Add to force A</button><button class="btn btn-b" data-add="right">+ Add to force B</button></div>':''}</div><div class="stat-grid">${e.hp!=null?`<div class="stat-box"><strong>${fmt(e.hp)}</strong><span>Health per model</span></div>`:''}<div class="stat-box"><strong>${fmt(cost.requisition)} <small>REQ</small> / ${fmt(cost.power)} <small>PWR</small></strong><span>${e.kind==='research'?'One-time research cost':'Purchase cost'}</span></div>${canAdd&&e.squadMin!=null?`<div class="stat-box"><strong>${fmt(e.squadMin)} / ${fmt(e.squadMax)}</strong><span>Starting / max troopers</span></div>`:''}${e.armorName?`<div class="stat-box"><strong class="armour-label">${esc(e.armorName)}</strong><span>Armour class</span></div>`:''}</div><div class="detail-columns"><div>${shownStats.length?`<section class="panel"><h2>${kind==='Buildings'?'Building profile':kind==='Weapon'?'Weapon profile':'Profile'}</h2>${table(shownStats.map(([k,v])=>[k,fmt(v)]))}</section>`:''}${e.weapons?.length?`<section class="panel"><h2>Weapons</h2>${weaponTable(e.weapons)}</section>`:''}${e.leaders?.length?`<section class="panel"><h2>Squad leaders</h2><p class="small muted">Leaders join the squad with their own health and weapons. Their purchase cost is lost when they are killed.</p>${leaderPanels(e.leaders)}</section>`:''}${researchOptions.length?`<section class="panel"><h2>Research & upgrades</h2><p class="small muted">Global research is purchased once for your force and is retained when squads are lost.</p><ul class="relation-list">${researchOptions.map(r=>`<li><a href="${entryUrl(r.id)}">${esc(r.name)}</a><small>${money(r.cost)}${r.supported===false?' · Not included in trade estimates':''}</small></li>`).join('')}</ul></section>`:''}${abilities.length?`<section class="panel"><h2>Abilities</h2>${itemLinks(abilities,'No abilities.')}</section>`:''}</div><aside><section class="panel"><h2>Requirements</h2>${requirementsList(e.requirements)}</section>${canAdd?'<section class="panel"><p class="small-label">Compare an engagement</p><h2>Choose your loadout.</h2><p class="small muted">Compare squad sizes, weapons, leaders, and research against another force.</p><a class="btn" href="#calculator">Open trade calculator →</a></section>':''}${related.length?`<section class="panel"><h2>Available to</h2>${itemLinks(related,'')}</section>`:''}</aside></div></div>`;
  document.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>addToArmy(e.id,b.dataset.add)));
}

function availableResearch(side) {
  const upgrades=armies[side].flatMap(g=>details.get(g.id)?.upgrades||[]);
  const all=upgrades.filter(r=>r.supported&&!upgrades.some(other=>other.id===r.id&&other.supported===false));
  return [...new Map(all.map(r=>[r.id,r])).values()].sort((a,b)=>a.name.localeCompare(b.name));
}
function effectiveCap(e,side) {
  let cap=e.weaponUpgradeMax;
  for(const r of (e.upgrades||[]).filter(r=>research[side].includes(r.id)))for(const m of r.modifiers||[])if(m.field==='weaponUpgradeMax'&&cap!=null)cap=m.operation==='add'?cap+m.value:m.operation==='multiply'?cap*m.value:m.value;
  return cap;
}
function groupCard(g,index,side) {
  const e=details.get(g.id);if(!e)return '';
  const cap=effectiveCap(e,side),slots=[...new Set((e.weapons||[]).map(w=>w.slot))];
  g.weaponChoices ||= {};g.leaders ||= [];
  const weapons=slots.map((slot,slotIndex)=>{
    const choices=e.weapons.filter(w=>w.slot===slot),base=choices.find(w=>w.default)||choices[0];
    if(choices.length<2)return '';
    const selected=g.weaponChoices[slot],disabled=cap==null||cap===0;
    return `<div class="weapon-slot"><div><label for="weapon-${side}-${index}-${slotIndex}">${base.melee?'Melee weapon':'Ranged weapon'}${slots.length>2?' '+(slotIndex+1):''}</label><select id="weapon-${side}-${index}-${slotIndex}" data-slot="${esc(slot)}"${disabled?' disabled':''}><option value="">${esc(base.name)} (default)</option>${choices.filter(w=>w.id!==base.id&&w.selectable!==false).map(w=>`<option value="${esc(w.id)}"${selected?.id===w.id?' selected':''}>${esc(w.name)} · ${money(w.cost)}</option>`).join('')}</select></div><div><label for="weapon-count-${side}-${index}-${slotIndex}">Per squad</label><input id="weapon-count-${side}-${index}-${slotIndex}" data-slot-count="${esc(slot)}" type="number" min="1" max="${Math.min(g.size,cap??0)}" value="${selected?.count??1}"${!selected||disabled?' disabled':''}></div></div>`;
  }).join('');
  const leaders=(e.leaders||[]).map((l,i)=>{
    const selected=g.leaders.find(x=>x.id===l.id)?.count||0;
    return `<div class="leader-choice"><div><label for="leader-${side}-${index}-${i}">${esc(l.name)}</label><small>${money(l.cost)} · ${fmt(l.hp)} HP</small>${l.buffs?.length?`<small>${l.buffs.map(esc).join(' · ')}</small>`:''}${l.supported===false?'<small>Not included in trade estimates.</small>':''}</div><input id="leader-${side}-${index}-${i}" aria-label="${esc(l.name)} per squad" data-leader="${esc(l.id)}" type="number" min="0" max="${l.maxCount??1}" value="${selected}"${l.supported===false?' disabled':''}></div>`;
  }).join('');
  return `<div class="group-card" data-group="${side}:${index}"><div class="group-top"><div class="group-name"><a href="${entryUrl(g.id)}">${esc(e.name)}</a><small>${esc(e.faction)} · ${esc(category(e))}</small></div><button class="remove" data-remove="${side}:${index}" aria-label="Remove ${esc(e.name)} from force ${side==='left'?'A':'B'}">×</button></div><div class="group-fields"><div class="field"><label for="count-${side}-${index}">Squads / units</label><input id="count-${side}-${index}" data-prop="count" type="number" min="1" max="50" step="1" value="${g.count}"></div><div class="field"><label for="size-${side}-${index}">Troopers / squad</label><input id="size-${side}-${index}" data-prop="size" type="number" min="${e.squadMin??1}" max="${e.squadMax??1}" step="1" value="${g.size}"></div><div class="field"><label>Weapon upgrades</label><span class="small muted">${fmt(cap)} / squad</span></div></div>${weapons?`<details class="data-details"${Object.keys(g.weaponChoices).length?' open':''}><summary>Choose weapon upgrades</summary>${weapons}<p class="small muted">Other troopers keep their default weapon. Purchased weapons are lost with their bearer.</p></details>`:''}${leaders?`<details class="data-details"${g.leaders.length?' open':''}><summary>Add squad leaders</summary>${leaders}<p class="small muted">Leaders are additional models, separate from the trooper count. Up to ${fmt(e.maxLeaders??1)} per squad.</p></details>`:''}</div>`;
}
function researchPanel(side) {
  const options=availableResearch(side);
  if(!options.length)return '';
  return `<section class="force-research"><h3>Global research</h3><p class="small muted">Buy once for this force. Applies to eligible squads and remains after casualties.</p>${options.map(r=>`<label><input type="checkbox" data-research-side="${side}" data-research="${esc(r.id)}"${research[side].includes(r.id)?' checked':''}><span>${esc(r.name)}<small>${money(r.cost)}</small></span></label>`).join('')}</section>`;
}
function changeResearch(side,id,checked) {
  const options=availableResearch(side),selected=new Set(research[side]);
  const add=(id,seen=new Set())=>{
    if(seen.has(id))return;seen.add(id);
    const r=options.find(r=>r.id===id);if(!r)return;
    for(const required of r.requires||[])add(required,seen);
    for(const excluded of r.excludes||[])selected.delete(excluded);
    selected.add(id);
  };
  if(checked)add(id);else selected.delete(id);
  for(let i=0;i<options.length;i++)for(const r of options)if(selected.has(r.id)&&(r.requires||[]).some(id=>!selected.has(id)))selected.delete(r.id);
  research[side]=[...selected];saveForces();renderCalculator(++renderToken).catch(renderError);
}
async function renderCalculator(token) {
  main.innerHTML='<div class="loading">Preparing your forces…</div>';
  await Promise.all([...armies.left,...armies.right].map(g=>getEntry(g.id)));
  if(token!==renderToken)return;
  for(const side of ['left','right'])research[side]=research[side].filter(id=>availableResearch(side).some(r=>r.id===id));
  const candidates=entries.filter(isCombatUnit).sort(order),factions=factionNames();
  main.innerHTML=`<div class="container"><div class="calculator-intro"><div><p class="eyebrow">Multiplayer · Engagement analysis</p><h1>Compare the trade.</h1><p>Build two forces, choose their weapons and squad leaders, then compare casualties and resource losses.</p></div><a href="#wiki" class="btn">Browse the field index ↗</a></div><div class="calculator-layout">${['left','right'].map((side,i)=>`<section class="army-panel ${i?'side-b':''}"><div class="army-heading"><h2>Force ${i?'B':'A'}</h2><span>${i?'AMBER':'TEAL'} FORCE</span></div><div class="army-body"><div class="army-picker"><select id="picker-${side}" aria-label="Choose a unit for force ${i?'B':'A'}"><option value="">Choose infantry or a vehicle…</option>${factions.map(f=>`<optgroup label="${esc(f)}">${candidates.filter(e=>e.faction===f).map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</optgroup>`).join('')}</select><button class="btn btn-small" data-picker-add="${side}">+ Add</button></div>${armies[side].length?armies[side].map((g,j)=>groupCard(g,j,side)).join(''):'<div class="army-empty">No units deployed.<br>Choose infantry or a vehicle to begin.</div>'}${researchPanel(side)}</div></section>`).join('')}</div><div class="calc-settings"><div class="field"><label for="combat-mode">Engagement mode</label><select id="combat-mode"><option value="ranged"${settings.mode==='ranged'?' selected':''}>Stationary ranged</option><option value="melee"${settings.mode==='melee'?' selected':''}>Melee</option></select></div><div class="field"><label for="combat-range">Fixed separation</label><input id="combat-range" type="number" min="0" max="200" step="1" value="${settings.range}"${settings.mode==='melee'?' disabled':''}></div><button id="calculate" class="btn btn-primary"${!armies.left.length||!armies.right.length?' disabled':''}>Calculate engagement →</button></div><div id="calc-output" aria-live="polite">${calculation?renderResult(calculation):''}</div><section class="panel gameplay-assumptions"><h2>How to read the trade</h2><p class="small muted">Both forces start at full health on open ground, with unbroken morale and all required technology available. They focus the first opposing group. Losing models reduces firepower; surviving squad leaders retain their bonuses.</p><p class="small muted">These are expected-damage estimates. Movement, cover, morale breaks, activated abilities, splash victims, and firing animations can change a real fight. Melee assumes every model is in contact.</p><p class="small muted">Global research is paid for once and is never counted as a casualty loss. Troopers, leaders, and purchased weapons contribute to losses when their models die.</p></section></div>`;
  document.querySelectorAll('[data-picker-add]').forEach(b=>b.addEventListener('click',()=>{const side=b.dataset.pickerAdd,id=$(`#picker-${side}`).value;if(id){addToArmy(id,side);renderCalculator(++renderToken).catch(renderError);}}));
  document.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{const[side,index]=b.dataset.remove.split(':');armies[side].splice(Number(index),1);saveForces();renderCalculator(++renderToken).catch(renderError);}));
  document.querySelectorAll('[data-group]').forEach(card=>{
    const[side,index]=card.dataset.group.split(':'),group=armies[side][index];
    card.querySelectorAll('[data-prop]').forEach(input=>input.addEventListener('change',()=>{
      if(!input.checkValidity()){input.reportValidity();return;}group[input.dataset.prop]=Number(input.value);saveForces();renderCalculator(++renderToken).catch(renderError);
    }));
    card.querySelectorAll('[data-slot]').forEach(input=>input.addEventListener('change',()=>{
      if(input.value)group.weaponChoices[input.dataset.slot]={id:input.value,count:1};else delete group.weaponChoices[input.dataset.slot];saveForces();renderCalculator(++renderToken).catch(renderError);
    }));
    card.querySelectorAll('[data-slot-count]').forEach(input=>input.addEventListener('change',()=>{
      if(!input.checkValidity()){input.reportValidity();return;}group.weaponChoices[input.dataset.slotCount].count=Number(input.value);saveForces();$('#calc-output').innerHTML='';
    }));
    card.querySelectorAll('[data-leader]').forEach(input=>input.addEventListener('change',()=>{
      input.setCustomValidity('');const total=group.leaders.filter(l=>l.id!==input.dataset.leader).reduce((n,l)=>n+l.count,0)+Number(input.value);if(total>(details.get(group.id).maxLeaders??1))input.setCustomValidity('This squad has no more leader slots.');if(!input.checkValidity()){input.reportValidity();return;}group.leaders=group.leaders.filter(l=>l.id!==input.dataset.leader);if(Number(input.value)>0)group.leaders.push({id:input.dataset.leader,count:Number(input.value)});saveForces();$('#calc-output').innerHTML='';
    }));
  });
  document.querySelectorAll('[data-research]').forEach(input=>input.addEventListener('change',()=>changeResearch(input.dataset.researchSide,input.dataset.research,input.checked)));
  $('#combat-mode').addEventListener('change',event=>{settings.mode=event.target.value;settings.range=settings.mode==='melee'?0:20;calculation=null;renderCalculator(++renderToken).catch(renderError);});
  $('#combat-range').addEventListener('change',event=>{settings.range=Number(event.target.value);calculation=null;$('#calc-output').innerHTML='';});
  $('#calculate').addEventListener('click',calculate);
}
async function calculate() {
  // Read the visible values even when the focused input has not fired change yet.
  document.querySelectorAll('[data-group]').forEach(card=>{
    const [side,index]=card.dataset.group.split(':'),group=armies[side][index];
    card.querySelectorAll('[data-prop]').forEach(input=>{group[input.dataset.prop]=Number(input.value);});
    group.leaders=[...card.querySelectorAll('[data-leader]')].filter(input=>!input.disabled&&Number(input.value)>0).map(input=>({id:input.dataset.leader,count:Number(input.value)}));
    card.querySelectorAll('[data-slot-count]').forEach(input=>{if(group.weaponChoices[input.dataset.slotCount])group.weaponChoices[input.dataset.slotCount].count=Number(input.value);});
  });
  settings.range=Number($('#combat-range').value);
  const invalid=[...document.querySelectorAll('.calculator-layout input,.calc-settings input')].find(input=>!input.checkValidity());
  if(invalid){invalid.reportValidity();return;}
  const button=$('#calculate');button.disabled=true;button.textContent='Calculating…';
  try {
    calculation=await api('/api/calculate',{...armies,research,options:settings});
    $('#calc-output').innerHTML=renderResult(calculation);$('#calc-output').scrollIntoView({behavior:'smooth',block:'start'});
  } catch(error){$('#calc-output').innerHTML=`<div class="error"><strong>This engagement could not be calculated.</strong><br>${esc(error.message)}</div>`;}
  finally{button.disabled=false;button.textContent='Calculate engagement →';}
}
function renderResult(result) {
  const outcome=String(result.status||'No decisive result').replace(/left/gi,'Force A').replace(/right/gi,'Force B');
  const history=result.history||[];let graph='';
  if(history.length>1){
    const width=900,height=180,pad=28,maxTime=Math.max(...history.map(p=>p.time),1),maxHp=Math.max(...history.map(p=>Math.max(p.leftHp,p.rightHp)),1);
    const points=key=>history.map(p=>`${((p.time/maxTime)*(width-pad*2)+pad).toFixed(1)},${(height-pad-(p[key]/maxHp)*(height-pad*2)).toFixed(1)}`).join(' ');
    graph=`<section class="panel"><h2>Health through the engagement</h2><svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Remaining health of both forces"><path d="M${pad} ${pad}V${height-pad}H${width-pad}" fill="none" stroke="#cbd3c1"/><polyline points="${points('leftHp')}" fill="none" stroke="#346f6c" stroke-width="2.5"/><polyline points="${points('rightHp')}" fill="none" stroke="#9c7437" stroke-width="2.5"/><text x="${pad}" y="${height-8}">0 s</text><text x="${width-pad-40}" y="${height-8}">${fmt(maxTime)} s</text></svg><div class="result-legend"><span><i></i>Force A</span><span><i class="amber"></i>Force B</span></div></section>`;
  }
  const survivors=side=>side.groups?.length?`<h3 class="survivor-heading">Squad survivors</h3><div class="table-wrap"><table><thead><tr><th>Unit</th><th>Models alive</th><th>Leaders alive</th></tr></thead><tbody>${side.groups.map(g=>`<tr><td>${esc(g.name)}</td><td>${fmt(g.remainingModels)} / ${fmt(g.initialModels)}</td><td>${g.initialLeaders?`${fmt(g.remainingLeaders)} / ${fmt(g.initialLeaders)}`:"—"}</td></tr>`).join("")}</tbody></table></div>`:"";
  const panel=(side,i)=>side?`<section class="panel"><h2>Force ${i?'B':'A'}</h2>${table([['Initial expected DPS',fmt(side.initialDps)],['Starting health',fmt(side.initialHp)],['Remaining health',fmt(side.remainingHp)],['Surviving models',`${fmt(side.remainingModels)} / ${fmt(side.initialModels)}`],['Units & loadouts',money(side.armyCost??side.cost)],['Global research (retained)',money(side.researchCost??{requisition:0,power:0})],['Total investment',money(side.cost)],['Requisition lost',fmt(side.losses?.requisition)],['Power lost',fmt(side.losses?.power)]])}${survivors(side)}</section>`:'';
  return `<section class="result-section"><div class="result-title"><h2>Engagement estimate</h2><span class="pill">Expected damage</span></div><div class="result-summary"><div><span>Outcome</span><strong>${esc(outcome)}</strong></div><div><span>Elapsed engagement</span><strong>${fmt(result.time)} s</strong></div></div>${graph}<div class="result-grid">${[result.left,result.right].map(panel).join('')}</div>${result.assumptions?.length?`<details class="data-details"><summary>Engagement assumptions</summary><ul class="assumption-list">${result.assumptions.filter(a=>!/source|extract|normaliz|blueprint|dataset/i.test(a)).map(a=>`<li>${esc(a)}</li>`).join('')}</ul></details>`:''}</section>`;
}
async function route() {
  const token=++renderToken,hash=location.hash.slice(1)||'wiki';
  document.querySelectorAll('[data-nav]').forEach(link=>link.classList.toggle('active',link.dataset.nav===(hash==='calculator'?'calculator':'wiki')));
  window.scrollTo(0,0);
  try {
    if(hash.startsWith('entry/'))await renderDetail(decodeURIComponent(hash.slice(6)),token);
    else if(hash==='calculator')await renderCalculator(token);else renderWiki();
    document.title=`${hash.startsWith('entry/')?(details.get(decodeURIComponent(hash.slice(6)))?.name||'Unit details'):hash==='calculator'?'Trade calculator':'Field index'} · Dawn of War Wikicalc`;
  } catch(error){if(token===renderToken)renderError(error);}
}
async function init() {
  try {
    entries=await api('/api/entries');if(!Array.isArray(entries))entries=entries.entries||[];
    entries=entries.filter(e=>e.multiplayer!==false&&e.scope!=='variant').sort(order);
    for(const side of ['left','right']){
      armies[side]=armies[side].filter(g=>g&&entries.some(e=>e.id===g.id&&isCombatUnit(e))).slice(0,12);
      research[side]=Array.isArray(research[side])?research[side]:[];
    }
    saveForces();window.addEventListener('hashchange',route);await route();
  } catch(error){renderError(error);}
}
init();
