import {mkdirSync,writeFileSync} from 'node:fs';
import {demoBundles,importSql,publicationSql} from '../../tools/cli/src/pipeline';
mkdirSync('artifacts',{recursive:true});
const bundle=demoBundles()[0];const second=demoBundles()[1];
const command={id:bundle.release_id,channel:bundle.channel,operation:'publish' as const,revision:0,previous:null,actor:'test'};
writeFileSync('artifacts/publication-fixtures.json',JSON.stringify({
  bundle,second,
  unapproved:importSql(bundle),
  approved:importSql(bundle,{reviewer:'test-reviewer',reviewed_at:bundle.created_at}),
  publish:publicationSql(command),
  conflict:publicationSql({...command,actor:'concurrent-other-actor'}),
  rollback:publicationSql({...command,operation:'rollback',revision:1,previous:bundle.release_id}),
  badChannel:publicationSql({...command,channel:'profiles:PRIMARY'})
},null,2));
