import {inflateSync} from 'node:zlib';
import {openSync,readSync,closeSync} from 'node:fs';

const norm=s=>s.replaceAll('\\','/').toLowerCase();
function cstr(b,p,wide=false){let e=p;while(e<b.length&&(wide?b.readUInt16LE(e):b[e]))e+=wide?2:1;return b.toString(wide?'utf16le':'utf8',p,e);}
export function readSga(path){
 const fd=openSync(path,'r');
 const read=(offset,size)=>{const b=Buffer.alloc(size);if(readSync(fd,b,0,size,offset)!==size)throw Error('Truncated SGA');return b;};
 try{
 const head=read(0,180);if(head.toString('ascii',0,8)!=='_ARCHIVE'||head.readUInt32LE(8)!==2)throw Error('Only SGA v2 is supported');
 const h=read(180,head.readUInt32LE(172)),base=head.readUInt32LE(176);
 const dirs=h.readUInt32LE(6),nd=h.readUInt16LE(10),files=h.readUInt32LE(12),nf=h.readUInt16LE(16),strings=h.readUInt32LE(18);
 const parents={};for(let i=0;i<nd;i++){let p=dirs+i*12,name=cstr(h,strings+h.readUInt32LE(p));for(let j=h.readUInt16LE(p+8);j<h.readUInt16LE(p+10);j++)parents[j]=name;}
 const entries=[];for(let i=0;i<nf;i++){const p=files+i*20;entries.push({path:norm([parents[i],cstr(h,strings+h.readUInt32LE(p))].filter(Boolean).join('/')),offset:base+h.readUInt32LE(p+8),compressed:h.readUInt32LE(p+12),size:h.readUInt32LE(p+16)});}
 return {entries,read(entry){const b=read(entry.offset,entry.compressed);const out=entry.compressed===entry.size?b:inflateSync(b);if(out.length!==entry.size)throw Error('SGA size mismatch');return out;},close(){closeSync(fd);}};
 }catch(e){closeSync(fd);throw e;}
}
export function parseDictionary(text){const map=new Map();for(const line of text.split(/\r?\n/)){const m=line.match(/^\s*0x([0-9a-f]+)\s*=\s*([^#\s]+)/i);if(m)map.set(parseInt(m[1],16),m[2]);}map.set(0x49d60fae,'$REF');return map;}
export function parseRgd(b,names=new Map()){
 if(b.toString('ascii',0,12)!=='Relic Chunky')throw Error('Not an RGD');const version=b.readUInt32LE(16);if(version!==1&&version!==3)throw Error('Unsupported RGD version');
 let p=version===1?24:36;while(p+20<=b.length){const type=b.toString('ascii',p,p+8),length=b.readUInt32LE(p+12),n=b.readUInt32LE(p+16);let start=p+20+n+(version===3?8:0);if(type==='DATAAEGD'){const size=b.readUInt32LE(start+4),data=b.subarray(start+8,start+8+size);if(data.length!==size)throw Error('Truncated RGD data');return table(data,0,names,0);}p=start+length;}throw Error('Missing DATAAEGD');
}
function table(b,p,names,depth){if(depth>80)throw Error('RGD nesting limit');const count=b.readUInt32LE(p),base=p+4+count*12;if(base>b.length)throw Error('Invalid RGD table');const result={};for(let i=0;i<count;i++){const q=p+4+i*12,hash=b.readUInt32LE(q),type=b.readUInt32LE(q+4),pos=base+b.readUInt32LE(q+8),name=names.get(hash)||'0x'+hash.toString(16).padStart(8,'0');let value;switch(type){case 0:value=b.readFloatLE(pos);break;case 1:value=b.readUInt32LE(pos);break;case 2:value=!!b.readUInt8(pos);break;case 3:value=cstr(b,pos);break;case 4:value=cstr(b,pos,true);break;case 100:case 101:value=table(b,pos,names,depth+1);break;default:throw Error(`Unsupported RGD value type ${type}`);}result[name]=value;}return result;}
export function parseUcs(b){const text=b[0]===255&&b[1]===254?b.toString('utf16le'):b.toString('utf8'),strings={};for(const line of text.split(/\r?\n/)){const m=line.match(/^\uFEFF?(\d+)\s+(.+)$/);if(m)strings[m[1]]=m[2];}return strings;}
