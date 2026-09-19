/** Independent full-catalog source join audit and exact user-reported regression. No network. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolveProfiles,identityText} from '../apps/web/src/full/profile-links';
import {allDayTotal} from '../apps/web/src/full/parent-comparison';
import {cohortKey,compareJev} from '../apps/web/src/full/comparison';
import type {Manifest,School,Summary} from '../apps/web/src/full/catalog';
const root='apps/web/dist-production',m:Manifest=JSON.parse(readFileSync(root+'/catalog-manifest.json','utf8'));
const p=root+'/data/'+m.data_id,index:Summary[]=JSON.parse(readFileSync(p+'/index.json','utf8'));
const hashes=new Map<string,string>(),records=new Map<string,School>();
for(const s of index){const raw=readFileSync(p+'/schools/'+s.id+'.json');hashes.set(s.id,createHash('sha256').update(raw).digest('hex'));records.set(s.id,JSON.parse(raw.toString('utf8')));}
const byName=new Map<string,School[]>();for(const s of records.values()){const key=s.level+':'+identityText(s.name);const list=byName.get(key)??[];list.push(s);byName.set(key,list);}
const require=(condition:unknown,message:string)=>{if(!condition)throw new Error(message);};
const resolved=new Map<string,School>();let linked=0;const levelCounts:Record<string,number>={};const linkRows=new Set<string>();
for(const original of records.values()){
 const candidates=byName.get(original.level+':'+identityText(original.name))!.filter(x=>x.id!==original.id);
 const updated=resolveProfiles(original,candidates,m.sources);resolved.set(original.id,updated);
 require(updated.id===original.id,'Saved school ID changed');require(JSON.stringify(updated.directory)===JSON.stringify(original.directory),'Raw directory changed');
 for(const link of updated.profile_resolution?.links??[]){const donor=records.get(link.from_school_id)!;const raw=donor.annual.find(a=>a.source_id===link.source_id&&a.row===link.row&&a.record_sha256===link.record_sha256);require(raw,'Missing source evidence');require(updated.annual.includes(raw!),'Linked profile rewritten');linkRows.add(link.source_id+':'+link.row);}
 if(updated.profile_resolution?.links.length){linked++;levelCounts[original.level]=(levelCounts[original.level]??0)+1;}
}
const ids=['school_2468a6d82a2fad7b858cd5b6','school_b579ecbc45cca6d4f62c20c9','school_7f49a973a6708cfc096def61'];
const expectedRows=[384,380,413],expectedTotals=[90,0,74];
const schools=ids.map((id,i)=>{const s=resolved.get(id)!;require(s,'User school missing');require(s.annual.length===1,'Exact user school still lacks one profile');require(s.annual[0].row===expectedRows[i],'Wrong annual row attached');require(s.classification.kg_operator_type.value==='NON_PROFIT','Operator classification missing');require(s.classification.kg_scheme_participation.value==='PARTICIPATING','Scheme missing');require(allDayTotal(s.annual[0])===expectedTotals[i],'Parent facts differ');require(s.annual[0].fields['課程規劃'],'Curriculum missing');return s;});
const topics=compareJev(schools,cohortKey(schools[0].annual[0].source_id,schools[0].annual[0].edition));
require(topics.every(t=>t.cells.every(c=>c.status!=='NO_PROFILE'&&c.model==='jev-1.13.0')),'Actual selected JEV evidence not available');
for(const [id,hash] of hashes)require(createHash('sha256').update(readFileSync(p+'/schools/'+id+'.json')).digest('hex')===hash,'Source file modified');
const report={status:'PASS',data_id:m.data_id,source_rows:m.stats.source_record_count,original_school_files:records.size,original_files_unchanged:true,additional_display_groups_linked:linked,by_level:levelCounts,distinct_linked_annual_rows:linkRows.size,selected:schools.map(s=>({id:s.id,name:s.name,annual_row:s.annual[0].row,fields:Object.keys(s.annual[0].fields).length,whole_day_students:allDayTotal(s.annual[0]),proof:s.profile_resolution,jev:s.semantic_annotations.map(a=>({source_id:a.source_id,row:a.row,status:a.status,model:a.model_returned}))})),topics};
mkdirSync('artifacts/production',{recursive:true});writeFileSync('artifacts/production/parent-comparison-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,linked,levelCounts,selected:report.selected.map(s=>({name:s.name,row:s.annual_row,fields:s.fields,whole_day:s.whole_day_students}))}));
