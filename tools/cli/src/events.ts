/** Reviewed event import is local-only and requires raw evidence plus explicit per-event confirmation. */
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {z} from 'zod';
import {AdmissionEvent,Level,SafeUrl,Year} from '@hk-school/contracts/domain';
import {hash,quote,executeLocal} from './pipeline';
export const EventInput=z.object({
  source_id:z.string().regex(/^[a-z0-9-]{1,100}$/),source_url:SafeUrl,publisher:z.string().min(1).max(200),
  raw_path:z.string().min(1).max(2000),raw_sha256:z.string().regex(/^[a-f0-9]{64}$/),
  level:Level,entry_year:Year,route:z.string().min(1).max(120),official_cycle_label:z.string().min(1).max(200),
  is_test:z.boolean(),events:z.array(AdmissionEvent).max(15)
}).strict().superRefine((input,context)=>{
  if(new Set(input.events.map(event=>event.id)).size!==input.events.length)context.addIssue({code:'custom',message:'Duplicate event IDs'});
  if(input.events.some(event=>event.level!==input.level||event.entry_year!==input.entry_year||event.route!==input.route||event.source_url!==input.source_url))context.addIssue({code:'custom',message:'Mixed event level, cohort, route or source'});
});
export type ReviewedEvents=z.infer<typeof EventInput>;
export function eventReviewHash(input:ReviewedEvents):string {
  const {raw_path:_path,...subject}=EventInput.parse(input);return hash(subject);
}
export function eventIdentity(input:ReviewedEvents):{releaseId:string;channel:string;subjectHash:string}{
  const subjectHash=eventReviewHash(input);return {releaseId:'rel_'+subjectHash.slice(0,32),channel:`${input.is_test?'test:':''}events:${input.level}:${input.entry_year}:${hash(input.route).slice(0,12)}`,subjectHash};
}
export function eventImportSql(input:ReviewedEvents,actor:string):string {
  EventInput.parse(input);if(!actor.trim()||actor.length>100)throw new Error('Reviewer required');
  const {releaseId,channel,subjectHash}=eventIdentity(input);const q=quote;const now=new Date().toISOString();
  const snapshot='evs_'+hash([input.source_id,input.raw_sha256]).slice(0,32);const cycle=`${input.level}:${input.entry_year}:${hash(input.route).slice(0,12)}`;
  const sql=[
    `INSERT OR IGNORE INTO sources(source_id,catalog_url,publisher,contract_status,enabled) VALUES(${q(input.source_id)},${q(input.source_url)},${q(input.publisher)},'CONTRACT_VERIFIED',1);`,
    `INSERT OR IGNORE INTO source_snapshots(snapshot_id,source_id,raw_hash,parser_version,fetched_at) VALUES(${q(snapshot)},${q(input.source_id)},${q(input.raw_sha256)},'reviewed-event-input-v1',${q(now)});`,
    `INSERT OR IGNORE INTO admission_cycles(cycle_id,level,entry_year_start,grade_code,official_cycle_label,admission_route) VALUES(${q(cycle)},${q(input.level)},${input.entry_year},${q(({KG:'K1',PRIMARY:'P1',SECONDARY:'S1'})[input.level])},${q(input.official_cycle_label)},${q(input.route)});`,
    `INSERT OR IGNORE INTO release_manifests(release_id,channel,status,scope,entry_year_start,item_count,manifest_hash,source_snapshots,normalizer_version,created_at) VALUES(${q(releaseId)},${q(channel)},'READY_FOR_REVIEW',${q(input.is_test?'test':'full')},${input.entry_year},${input.events.length},${q(subjectHash)},${q(JSON.stringify([snapshot]))},'reviewed-event-input-v1',${q(now)});`
  ];
  for(const event of input.events){
    const semanticHash=hash(event);const version='ev_'+semanticHash;
    sql.push(`INSERT OR IGNORE INTO event_versions(event_version_id,event_id,semantic_hash,level,entry_year_start,school_id,starts_sort,verified,is_test,content_json) VALUES(${q(version)},${q(event.id)},${q(semanticHash)},${q(event.level)},${event.entry_year},${q(event.school_id)},${q(event.starts_on??event.starts_at!)},1,${input.is_test?1:0},${q(JSON.stringify(event))});`);
    sql.push(`INSERT OR IGNORE INTO event_release_items(release_id,event_id,event_version_id) VALUES(${q(releaseId)},${q(event.id)},${q(version)});`);
  }
  sql.push(`INSERT OR IGNORE INTO review_decisions(decision_id,release_id,subject_hash,decision,actor_id,evidence_json,created_at) VALUES(${q('review_'+subjectHash)},${q(releaseId)},${q(subjectHash)},'APPROVED',${q(actor)},${q(JSON.stringify({event_ids:input.events.map(event=>event.id),raw_sha256:input.raw_sha256}))},${q(now)});`);
  sql.push(`UPDATE release_manifests SET status='APPROVED' WHERE release_id=${q(releaseId)} AND status='READY_FOR_REVIEW';`);
  return sql.join('\n');
}
export function reviewedEventsCommand(options:{input:string;out?:string;environment?:string;reviewer?:string;confirmHash?:string;confirmEvents?:string}):void {
  const buffer=readFileSync(options.input);if(buffer.length>1000000)throw new Error('Event input exceeds 1 MB');
  const input=EventInput.parse(JSON.parse(buffer.toString('utf8')));const identity=eventIdentity(input);
  const raw=readFileSync(resolve(dirname(options.input),input.raw_path));if(raw.length>5_000_000)throw new Error('Raw event evidence exceeds 5 MB');
  if(createHash('sha256').update(raw).digest('hex')!==input.raw_sha256)throw new Error('Raw event evidence hash mismatch');
  if(!options.reviewer){
    if(!options.out)throw new Error('Review output path required');
    mkdirSync(dirname(options.out),{recursive:true});writeFileSync(options.out,JSON.stringify({identity,input,required_event_confirmations:input.events.map(event=>event.id),notice:'Review the exact dates, cohort, admission route and source; this does not publish.'},null,2));console.log(JSON.stringify(identity));return;
  }
  if(options.environment!=='local')throw new Error('BLOCKED: event writes remain local only');
  const confirmations=(options.confirmEvents??'').split(',').filter(Boolean).sort();const expected=input.events.map(event=>event.id).sort();
  if(options.confirmHash!==identity.subjectHash||JSON.stringify(confirmations)!==JSON.stringify(expected))throw new Error('Exact reviewed hash and every event ID must be confirmed');
  if(input.events.some(event=>Date.parse(event.reviewed_at)>Date.now()+60000))throw new Error('Review time cannot be in the future');
  const archive=resolve('archive','reviewed-events',input.raw_sha256);mkdirSync(archive,{recursive:true});writeFileSync(resolve(archive,'raw.bin'),raw);
  executeLocal(eventImportSql(input,options.reviewer));console.log(JSON.stringify({...identity,status:'APPROVED_NOT_PUBLISHED',is_test:input.is_test}));
}
