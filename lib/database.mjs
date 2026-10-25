import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
export const decodeRecord = value => JSON.parse(typeof value === 'string' ? value : gunzipSync(value).toString('utf8'));
const encodeRecord = value => gzipSync(JSON.stringify(value));

export function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL,
      faction TEXT, category TEXT, source TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY REFERENCES records(id), name TEXT NOT NULL,
      faction TEXT, category TEXT, kind TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS relations (
      source_id TEXT NOT NULL REFERENCES records(id), field TEXT NOT NULL,
      target_id TEXT NOT NULL, resolved INTEGER NOT NULL,
      PRIMARY KEY(source_id, field, target_id));
    CREATE INDEX IF NOT EXISTS entry_filters ON entries(faction, category);
    CREATE INDEX IF NOT EXISTS relation_targets ON relations(target_id);`);
  if (!db.prepare('PRAGMA table_info(entries)').all().some(c=>c.name==='summary')) db.exec('ALTER TABLE entries ADD COLUMN summary TEXT');
  return db;
}

export function replaceDataset(db, { metadata, records, entries, relations }) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM relations; DELETE FROM entries; DELETE FROM records; DELETE FROM metadata;');
    const record = db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?)');
    for (const r of records) record.run(r.id, r.kind, r.name, r.faction ?? null, r.category ?? null, JSON.stringify(r.source), encodeRecord(r));
    const entry = db.prepare('INSERT INTO entries VALUES (?,?,?,?,?,?,?)');
    for (const e of entries) {
      const summary = Object.fromEntries(['id','name','faction','category','kind','scope','hp','armor','cost','squadMin','squadMax','calculable','warnings'].map(k=>[k,e[k]]));
      entry.run(e.id, e.name, e.faction ?? null, e.category ?? null, e.kind, encodeRecord(e), JSON.stringify(summary));
    }
    const relation = db.prepare('INSERT OR IGNORE INTO relations VALUES (?,?,?,?)');
    for (const r of relations) relation.run(r.source, r.field, r.target, r.resolved ? 1 : 0);
    const meta = db.prepare('INSERT INTO metadata VALUES (?,?)');
    for (const [k, v] of Object.entries(metadata)) meta.run(k, JSON.stringify(v));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function readMetadata(db) {
  return Object.fromEntries(db.prepare('SELECT key,value FROM metadata').all().map(r => [r.key, JSON.parse(r.value)]));
}

export function readEntry(db, id) {
  const row = db.prepare('SELECT data FROM entries WHERE id = ?').get(id)
    ?? db.prepare('SELECT data FROM records WHERE id = ?').get(id);
  if (!row) return null;
  const entry = decodeRecord(row.data);
  entry.relations = db.prepare(`SELECT r.field, r.target_id AS id, r.resolved, t.name, t.kind
    FROM relations r LEFT JOIN records t ON r.target_id=t.id WHERE r.source_id=? AND t.kind IN ('ebps','sbps','weapon','research','abilities','addons') LIMIT 300`).all(id);
  entry.referencedBy = db.prepare(`SELECT DISTINCT r.source_id AS id, t.name, t.kind
    FROM relations r JOIN records t ON t.id=r.source_id WHERE r.target_id=? LIMIT 200`).all(id);
  return entry;
}
