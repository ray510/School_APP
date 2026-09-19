/** KG-only projection. Preserve source files and saved IDs; merge display aliases only through existing evidence links. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolveProfiles,identityText} from '../apps/web/src/full/profile-links';
import type {School,Manifest,Summary} from '../apps/web/src/full/catalog';
const dist='apps/web/dist-production';const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const m:Manifest=read(dist+'/catalog-manifest.json'),i=read(dist+'/insights-manifest.json'),o=read(dist+'/official-manifest.json');
if(i.data_id!==m.data_id||o.base_data_id!==m.data_id)throw new Error('Base bundles differ');
const index:Summary[]=read(dist+'/data/'+m.data_id+'/index.json');
const raw=index.filter(s=>s.level==='KG').map(s=>read(dist+'/data/'+m.data_id+'/schools/'+s.id+'.json') as School);
const resolved=raw.map(s=>resolveProfiles(s,raw.filter(d=>d.id!==s.id&&identityText(d.name)===identityText(s.name)),m.sources));
const groups=new Map<string,School[]>();
for(const s of resolved){const a=s.annual.length===1?s.annual[0]:null;const key=a?`${a.source_id}:${a.row}:${a.record_sha256}`:s.id;groups.set(key,[...(groups.get(key)??[]),s]);}
const records=[];
for(const ss of groups.values()){
 ss.sort((a,b)=>Number(Boolean(b.directory.length))-Number(Boolean(a.directory.length))||a.id.localeCompare(b.id));const s=ss[0];
 const official=new Map<string,unknown>();
 for(const x of ss){if(!o.school_ids.includes(x.id))continue;const rows=read(`${dist}/official/${o.bundle_id}/schools/${x.id}.json`).rows;for(const r of rows)if(['registration','scheme','non_scheme_admission','vacancy'].includes(r.role))official.set(r.id,r);}
 const insights=read(`${dist}/insights/${i.analysis_id}/schools/${s.id}.json`);
 records.push({id:s.id,aliases:ss.map(x=>x.id),name:s.name,address:s.address,district:s.district,sessions:[...new Set(ss.flatMap(x=>x.sessions))],classification:s.classification,annual:s.annual,directory:s.directory,insights:insights.topics,official:[...official.values()],profile_resolution:s.profile_resolution});
}
const seen=raw.flatMap(s=>s.annual).map(a=>a.source_id+':'+a.row+':'+a.record_sha256);if(new Set(seen).size!==962)throw new Error('KG profile coverage changed');
mkdirSync('artifacts/kg-parent',{recursive:true});writeFileSync('artifacts/kg-parent/inputs.json',JSON.stringify({schema:1,data_id:m.data_id,analysis_id:i.analysis_id,official_bundle_id:o.bundle_id,source_groups:raw.length,profile_count:seen.length,sources:m.sources,events:read(`${dist}/data/${m.data_id}/events.json`).filter((e:{level:string})=>e.level==='KG'),records}));
console.log(JSON.stringify({kg_only:true,original_groups:raw.length,parent_cards:records.length,annual_rows:seen.length}));
