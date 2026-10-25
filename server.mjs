import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { openDatabase, readMetadata, readEntry } from './lib/database.mjs';
import { simulateTrade } from './lib/combat.mjs';
import { playerView } from './lib/player-view.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const databasePath = resolve(root, 'data/wikicalc.sqlite');
if (!existsSync(databasePath)) {
  console.error('No dataset found. Run node scripts/import.mjs first.');
  process.exit(1);
}
const db = openDatabase(databasePath);
const catalogue = db.prepare('SELECT summary FROM entries').all().map(r=>JSON.parse(r.summary)).filter(e=>e.multiplayer===true);
const playableIds = new Set(catalogue.map(e=>e.id));
const combatIds = new Set(catalogue.filter(e=>['Infantry','Vehicles'].includes(e.category)).map(e=>e.id));
const allowedRelation = r => !['ebps','sbps'].includes(r.kind) || playableIds.has(r.id);
const send = (res, code, value) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};
const staticFiles = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'], ['/styles.css', 'styles.css']]);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/meta') return send(res, 200, readMetadata(db));
    if (req.method === 'GET' && url.pathname === '/api/entries') {
      const entries = catalogue.toSorted((a,b)=>(a.factionOrder??99)-(b.factionOrder??99)||(a.order??999)-(b.order??999));
      return send(res, 200, entries);
    }
    if (req.method === 'GET' && url.pathname === '/api/entry') {
      const entry = readEntry(db, url.searchParams.get('id'));
      if(entry && ['ebps','sbps'].includes(entry.kind) && !playableIds.has(entry.id)) return send(res,404,{error:'This unit is not available in the multiplayer roster.'});
      if(entry) {
        entry.relations = entry.relations.filter(allowedRelation);
        entry.referencedBy = entry.referencedBy.filter(allowedRelation);
      }
      return send(res, entry ? 200 : 404, entry ? playerView(entry,id=>db.prepare('SELECT name FROM records WHERE id=?').get(id)?.name) : { error: 'Entry not found.' });
    }
    if (req.method === 'POST' && url.pathname === '/api/calculate') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, {error:'Cross-origin requests are not allowed.'});
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 65536) return send(res, 413, { error: 'Request too large.' });
      }
      const input = JSON.parse(body);
      const side = rows => {
        if (!Array.isArray(rows) || rows.length < 1 || rows.length > 12) throw new Error('Choose 1–12 groups on each side.');
        return rows.map(row => {
          if(!combatIds.has(row.id)) throw new Error('Choose a multiplayer infantry unit or vehicle. Buildings and campaign units cannot enter a trade.');
          const unit = readEntry(db, row.id);
          if (!unit || !unit.calculable) throw new Error(`${unit?.name ?? 'Unit'} cannot be used in this combat estimate.`);
          return { unit, count: Number(row.count ?? 1), squadSize: Number(row.size ?? unit.squadMin ?? 1), weaponChoices: row.weaponChoices, leaders:row.leaders ?? [], upgrades: row.researchIds ?? row.upgrades ?? [] };
        });
      };
      const result = simulateTrade({left:side(input.left),right:side(input.right),research:input.research}, input.options ?? {});
      return send(res, 200, result);
    }
    if (req.method === 'GET' && staticFiles.has(url.pathname)) {
      const file = staticFiles.get(url.pathname);
      res.writeHead(200, {'Content-Type': `${types[extname(file)]}; charset=utf-8`, 'Cache-Control':'no-cache'});
      return res.end(readFileSync(resolve(root, 'public', file)));
    }
    send(res, 404, { error: 'Not found.' });
  } catch (error) { send(res, 400, { error: error.message }); }
});
const port = Number(process.env.PORT ?? 4173);
server.listen(port, '127.0.0.1', () => console.log(`Dawn of War Wikicalc: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
