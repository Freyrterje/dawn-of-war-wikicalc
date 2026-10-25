import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, replaceDataset, readEntry, readMetadata } from '../lib/database.mjs';

test('dataset replacement is idempotent and retains null versus zero', () => {
  const db = openDatabase(':memory:');
  const dataset = {metadata:{datasetId:'fixture'},records:[{id:'a',kind:'entity',name:'Fixture',source:{archive:'fixture'}}],entries:[{id:'a',kind:'entity',name:'Fixture',hp:0,regen:null}],relations:[]};
  replaceDataset(db,dataset);
  replaceDataset(db,dataset);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entries').get().n,1);
  assert.equal(readEntry(db,'a').hp,0);
  assert.equal(readEntry(db,'a').regen,null);
  assert.equal(readMetadata(db).datasetId,'fixture');
  db.close();
});

test('failed replacement rolls back to the previous complete dataset', () => {
  const db = openDatabase(':memory:');
  replaceDataset(db,{metadata:{datasetId:'previous'},records:[],entries:[],relations:[]});
  assert.throws(()=>replaceDataset(db,{metadata:{datasetId:'broken'},records:[],entries:[{id:'missing',kind:'entity',name:'Bad'}],relations:[]}));
  assert.equal(readMetadata(db).datasetId,'previous');
  db.close();
});
