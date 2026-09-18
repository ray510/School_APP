import {mkdirSync,writeFileSync} from 'node:fs';
import {demoBundles,hash,validateBundle,importSql,publicationSql} from '../../tools/cli/src/pipeline';
import {EventInput,eventImportSql,eventIdentity} from '../../tools/cli/src/events';
mkdirSync('artifacts',{recursive:true});
const bundle=demoBundles()[0];const second=demoBundles()[1];
const {manifest_hash:_oldHash,release_id:_oldId,...newContent}=structuredClone(bundle);
newContent.profiles[0].chinese_name+='（第二版）';
const manifestHash=hash(newContent);const updated=validateBundle({...newContent,manifest_hash:manifestHash,release_id:'rel_'+manifestHash.slice(0,32)});
const command={id:bundle.release_id,channel:bundle.channel,operation:'publish' as const,revision:0,previous:null,actor:'test'};
const eventInput=EventInput.parse({source_id:'test-events',source_url:'https://example.invalid/test-events',publisher:'Synthetic tests only',raw_path:'not-loaded-here',raw_sha256:'a'.repeat(64),level:'PRIMARY',entry_year:2027,route:'TEST',official_cycle_label:'SYNTHETIC',is_test:true,events:[{id:'synthetic-event-one',title:'NOT A REAL ADMISSION DATE',level:'PRIMARY',entry_year:2027,route:'TEST',school_id:null,starts_on:'2027-01-01',ends_on:null,starts_at:null,ends_at:null,source_url:'https://example.invalid/test-events',verified:true,reviewed_at:'2026-09-18T00:00:00Z'}]});
const event=eventIdentity(eventInput);
writeFileSync('artifacts/publication-fixtures.json',JSON.stringify({
  bundle,second,updated,
  unapproved:importSql(bundle),
  approved:importSql(bundle,{reviewer:'test-reviewer',reviewed_at:bundle.created_at}),
  publish:publicationSql(command),
  conflict:publicationSql({...command,actor:'concurrent-other-actor'}),
  rollback:publicationSql({...command,operation:'rollback',revision:1,previous:bundle.release_id}),
  badChannel:publicationSql({...command,channel:'profiles:PRIMARY'}),
  updatedApproved:importSql(updated,{reviewer:'test-reviewer',reviewed_at:updated.created_at}),
  updatedPublish:publicationSql({...command,id:updated.release_id,revision:1,previous:bundle.release_id}),
  revertToOriginal:publicationSql({...command,operation:'rollback',revision:2,previous:updated.release_id}),
  eventApproved:eventImportSql(eventInput,'test-reviewer'),
  eventPublish:publicationSql({id:event.releaseId,channel:event.channel,operation:'publish',revision:0,previous:null,actor:'test-reviewer'})
},null,2));
