// Player's Guide overview order, https://warhammer-guide.ru/wiki/Dawn_of_War_Players_Guide.html
// Names here use the installed English localization; ordering is independent of filenames.
const rosters = {
 'Space Marines': ['Servitor|Scout Marine Squad|Space Marine Squad|Assault Marine Squad|Grey Knights|Terminator Squad|Assault Terminator Veteran|Skull Probe|Apothecary|Force Commander|Librarian|Chaplain','Rhino Transport|Land Speeder|Dreadnought|Hellfire Dreadnought|Land Speeder Tempest|Predator|Whirlwind|Land Raider','Stronghold|Listening Post|Plasma Generator|Thermo Plasma Generator|Chapel-Barracks|Armory|Machine Cult|Sacred Artifact|Orbital Relay|Heavy Bolter Turret|Mine Field'],
 'Chaos': ['Heretic|Cultist Squad|Chaos Space Marines|Raptor Squad|Khorne Berzerkers|Horror Squad|Possessed Squad|Obliterator Squad|Chaos Lord|Chaos Sorcerer|Daemon Prince|Bloodthirster','Chaos Rhino Transport|Defiler|Chaos Predator|Hell Talon','Desecrated Stronghold|Listening Post|Plasma Generator|Thermo Plasma Generator|Chaos Temple|Chaos Armory|Sacrificial Circle|Machine Pit|Daemon Pit|Heavy Bolter Turret|Mine Field'],
 'Eldar': ['Bonesinger|Guardian Squad|Ranger Squad|Howling Banshee Squad|Dark Reaper Squad|Fire Dragons|Warp Spider Squad|Harlequin|Farseer|Seer Council|Avatar','Falcon Grav Tank|Vyper|Wraithlord|Nightwing|Shuriken Cannon Platform|Brightlance Platform|Fire Prism','Webway Assembly|Listening Shrine|Plasma Generator|Thermo Plasma Generator|Webway Gate|Aspect Portal|Soul Shrine|Support Portal|Support Platform|Mine Field'],
 'Orks': ['Gretchin Squad|Slugga Boy Squad|Shoota Boy Squad|Stormboyz Squad|TankBustaz Squad|Nob Squad|Flash Gitz|Mega Armored Nobz|Mad Dok|Big Mek|Warboss','Wartrukk|Wartrak|Killa Kan|Fighta-Bomma|Looted Tank|Squiggoth',"Settlement|Da Listening Post|Generator|Bigga Generator|Waaagh! Banner|Da Boyz Hut|Pile O Gunz!|Da Mek Shop|Mine Field"],
 'Imperial Guard':['Techpriest Enginseer|Guardsmen|Heavy Weapons Team|Kasrkin|Ogryns|Command Squad|Commissar|Psyker|Priest|Assassin','Chimera|Sentinel|Hellhound|Basilisk|Marauder Bomber|Leman Russ Battle Tank|Baneblade','Field Command|Listening Post|Plasma Generator|Thermo Plasma Generator|Infantry Command|Tactica Control|Mechanized Command|Mars Pattern Command|Heavy Bolter Turret|Mine Field'],
 'Tau Empire':['Earth Caste Builder|XV15 Stealth Team|Vespid Stingwing Strain|Fire Warrior Team|Kroot Carnivore Squad|Kroot Shaper|Pathfinder Team|XV88 Broadside Battlesuit|XV8 Crisis Battlesuit|Kroot Hound Pack|Tau Commander|Ethereal|Fire Warrior Bodyguard','Devilfish Troop Carrier|Skyray Missile Gunship|Drone Squad|Drone Harbinger|Barracuda|Hammerhead Gunship|Krootox|Greater Knarloc|Harbinger Drones',"Cadre Headquarters|Listening Post|Plasma Generator|Thermo Plasma Generator|Tau Barracks|Path to Enlightenment|Kroot Shaping Center|Vehicle Beacon|Kauyon Command Post|Mont'ka Command Post|Coalition Center"],
 'Necrons':['Builder Scarabs|Necron Warriors|Wraith|Flayed Ones|Immortals|Pariahs|Necron Lord|Essence of the Nightbringer|Essence of the Deceiver','Tomb Spyder|Attack Scarabs|Destroyer|Heavy Destroyer|Lord Destroyer|Restored Monolith','Necron Monolith|Obelisk|Plasma Generator|Thermo Plasma Generator|Summoning Core|Forbidden Archive|Greater Summoning Core|Energy Core|Gauss Turret'],
 'Dark Eldar':['Tortured Slave|Mandrake Squad|Warrior Squad|Hellion Squad|Scourge Squad|Wych Squad|Warp Beast Pack|Archon|Haemonculus','Reaver Jetbike|Raider|Talos|Raven|Ravager|Dais of Destruction',"Kabal Fortress|Tower of Loathing|Plasma Generator|Thermo Plasma Generator|Slave Chamber|Hall of Blood|Haemonculus' Laboratory|Dark Foundry|Wych-Cult Arena|Soul Cage"],
 'Sisters of Battle':['Ecclesiarchal Servitor|Missionary|Battle Sister Squad|Seraphim Squad|Celestian Squad|Death-Cult Assassin|Sister Repentia Squad|Canoness|Avenging Angel|Confessor|Living Saint','Rhino Transport|Immolator|Lightning Fighter|Exorcist|Penitent Engine','Ecclesiarchal Chapel|Listening Post|Plasma Generator|Thermo Plasma Generator|Adepta Sororitas Convent|Pristine Sanctuary|Manufactorum|Holy Reliquary|Shrine of the Living Saint|Inferno Turret|Purgatus Mine Field']
};
const key = name => name.toLowerCase().replace(/[^a-z0-9]/g,'');
export function applyFieldOrder(entries) {
 for(const entry of entries){
  entry.factionOrder=Object.keys(rosters).indexOf(entry.faction);
  const groups=rosters[entry.faction]??[];
  const categoryIndex=groups.findIndex(group=>group.split('|').some(name=>key(name)===key(entry.name)));
  // The reference groups battlesuits, monstrous creatures and platforms by their player-facing role.
  if(categoryIndex>=0)entry.category=['Infantry','Vehicles','Buildings'][categoryIndex];
  const names=(groups[categoryIndex]??'').split('|');
  const index=names.findIndex(name=>key(name)===key(entry.name));
  entry.order=index<0?999:index;
 }
 entries.sort((a,b)=>a.factionOrder-b.factionOrder || ['Infantry','Vehicles','Buildings'].indexOf(a.category)-['Infantry','Vehicles','Buildings'].indexOf(b.category)||a.order-b.order||a.name.localeCompare(b.name));
}
