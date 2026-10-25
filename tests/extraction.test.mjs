import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
import {parseRgd,parseUcs,parseDictionary,readSga} from '../lib/extract-formats.mjs';
import {parseModule} from '../lib/extract.mjs';

test('UCS preserves localized text and numeric identifiers',()=>{assert.deepEqual(parseUcs(Buffer.from('\ufeff100\tSpace Marine Squad\r\n101\tÉlite\r\n','utf16le')),{'100':'Space Marine Squad','101':'Élite'});});
test('module parser keeps precedence indexes and ignores comments',()=>{assert.deepEqual(parseModule('[global]\n; ignored\nArchiveFile.2 = Second\nArchiveFile.1 = First ; comment\n'),{'archivefile.2':'Second','archivefile.1':'First'});});
test('dictionary retains hash identities and explicit references',()=>{const names=parseDictionary('0x12345678=health # comment');assert.equal(names.get(0x12345678),'health');assert.equal(names.get(0x49d60fae),'$REF');});
test('RGD distinguishes zero, false, unknown hashes and references',()=>{
 const entries=[[1,0,Buffer.alloc(4)],[2,2,Buffer.from([0])],[0x49d60fae,3,Buffer.from('type_armour\\tp_infantry_low.lua\0')]];
 const base=4+entries.length*12;const table=Buffer.alloc(base+entries.reduce((n,e)=>n+e[2].length,0));table.writeUInt32LE(entries.length);let offset=0;
 entries.forEach(([hash,type,value],i)=>{let p=4+i*12;table.writeUInt32LE(hash,p);table.writeUInt32LE(type,p+4);table.writeUInt32LE(offset,p+8);value.copy(table,base+offset);offset+=value.length;});
 const header=Buffer.alloc(52);header.write('Relic Chunky\r\n\x1a\0');header.writeUInt32LE(1,16);header.writeUInt32LE(1,20);header.write('DATAAEGD',24);header.writeUInt32LE(1,32);header.writeUInt32LE(table.length+8,36);header.writeUInt32LE(table.length,48);
 const value=parseRgd(Buffer.concat([header,table]),parseDictionary('0x1=health\n0x49d60fae=reference'));
 assert.equal(value.health,0);assert.equal(value['0x00000002'],false);assert.equal(value.$REF,'type_armour\\tp_infantry_low.lua');assert.equal(value.missing,undefined);
 assert.throws(()=>parseRgd(Buffer.alloc(60)),/Not an RGD/);
});
test('SGA v2 directory, compression and member offsets are decoded',()=>{
 const content=Buffer.from('independent synthetic archive payload '.repeat(10)),compressed=deflateSync(content),strings=Buffer.from('attrib\0unit.rgd\0');
 const toc=Buffer.alloc(24+12+20+strings.length);toc.writeUInt32LE(24,6);toc.writeUInt16LE(1,10);toc.writeUInt32LE(36,12);toc.writeUInt16LE(1,16);toc.writeUInt32LE(56,18);toc.writeUInt16LE(1,34);toc.writeUInt32LE(7,36);toc.writeUInt32LE(0x20,40);toc.writeUInt32LE(compressed.length,48);toc.writeUInt32LE(content.length,52);strings.copy(toc,56);
 const head=Buffer.alloc(180);head.write('_ARCHIVE');head.writeUInt32LE(2,8);head.writeUInt32LE(toc.length,172);head.writeUInt32LE(180+toc.length,176);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wikicalc-sga-'));try{const filename=path.join(dir,'fixture.sga');fs.writeFileSync(filename,Buffer.concat([head,toc,compressed]));const archive=readSga(filename);try{assert.equal(archive.entries[0].path,'attrib/unit.rgd');assert.deepEqual(archive.read(archive.entries[0]),content);}finally{archive.close();}}finally{fs.rmSync(dir,{recursive:true});}
});
