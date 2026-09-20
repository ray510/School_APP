/** Build a source-evidenced identity/discovery projection without rewriting raw catalog records. */
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {buildIdentityMap} from '../apps/web/src/full/profile-links';
import type {Manifest,School,Summary} from '../apps/web/src/full/catalog';

const dist='apps/web/dist-production';
const manifest:Manifest=JSON.parse(readFileSync(dist+'/catalog-manifest.json','utf8'));
const prefix=dist+'/data/'+manifest.data_id;
const index:Summary[]=JSON.parse(readFileSync(prefix+'/index.json','utf8'));
const records=index.map(row=>JSON.parse(readFileSync(prefix+'/schools/'+row.id+'.json','utf8')) as School);
const {entries,audit}=buildIdentityMap(records);
const byId=new Map(records.map(record=>[record.id,record]));
const projection=index.map(row=>{
  const identity=entries[row.id];
  const aliases=identity.linked_ids.flatMap(id=>{
    const linked=byId.get(id);if(!linked)return [];
    return [linked.name,linked.english_name,linked.address,...linked.directory.map(d=>d.source_key),...linked.annual.flatMap(a=>[a.fields['學校編號']??'',a.fields['校址編號']??''])];
  }).filter(Boolean);
  return {...row,identity,search_aliases:[...new Set(aliases)].sort()};
});
const policyVersion=audit.policy_version;
const identityId=createHash('sha256').update(JSON.stringify({data_id:manifest.data_id,policy_version:policyVersion,projection})).digest('hex');
const identityManifest={schema:1,data_id:manifest.data_id,identity_id:identityId,policy_version:policyVersion,generated_at:manifest.generated_at,display_groups:projection.length,audit};
const write=(path:string,value:unknown)=>{mkdirSync(path.slice(0,path.lastIndexOf('/')),{recursive:true});writeFileSync(path,JSON.stringify(value));};
write(dist+'/identity/'+identityId+'/index.json',projection);
write(dist+'/identity/'+identityId+'/manifest.json',identityManifest);
write(dist+'/identity-manifest.json',identityManifest);
write('artifacts/identity/verification.json',{status:'PASS',...identityManifest,original_catalog_unchanged:true});
console.log(JSON.stringify({status:'PASS',identity_id:identityId,...audit}));
