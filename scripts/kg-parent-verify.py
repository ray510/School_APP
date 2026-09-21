"""Independent output reconciliation: sources, original IDs, model quotes and fees."""
import pathlib,json,hashlib,collections,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from scripts.kg_parent.facts import is_generic_guidance
root=pathlib.Path('.');dist=root/'apps/web/dist-production';out=root/'artifacts/kg-parent'
def read(p):return json.loads(p.read_text())
m=read(dist/'kg-parent-manifest.json');folder=dist/'kg-parent'/m['bundle_id'];idx=read(folder/'index.json');aliases=read(folder/'aliases.json');prepared=read(out/'prepared.json');source={r['id']:r for r in prepared['records']};inputs=read(out/'inputs.json');original={r['id']:r for r in inputs['records']}
assert m['schema']==2
assert len(aliases)==m['source_groups']==1759 and len(idx)==m['parent_cards'];assert len(source)==len(idx)
seen=set();quotes=0;fee_rows=0
for entry in idx:
 s=read(folder/'schools'/(entry['id']+'.json'));o=original[s['id']]
 assert s['aliases']==o['aliases'] and s['name']==o['name']
 assert s['profile']==(o['annual'][0] if len(o['annual'])==1 else None)
 scopes={(x['year'],x['grade']):x for x in entry['application_scopes']}
 assert set(scopes)=={(x['year'],x['grade']) for x in s['application_steps']}
 for key,scope in scopes.items():
  steps=[x['action'] for x in s['application_steps'] if (x['year'],x['grade'])==key];assert scope['summary']==steps[0] and scope['next_step']==steps[min(1,len(steps)-1)]
 assert entry['school_event_years']==sorted({e['entry_year'] for e in s['events']})
 supported=[x['evidence']['text'] for x in s['parent_analysis']['selections'].values() if x.get('state')=='SUPPORTED' and x.get('evidence')]
 assert (entry['parent_highlight'] is None)==(not supported)
 if entry['parent_highlight']:assert entry['parent_highlight']['text'] in supported
 if s['profile']:
  p=s['profile'];seen.add((p['source_id'],p['row'],p['record_sha256']))
  for selection in s['parent_analysis']['selections'].values():
   e=selection.get('evidence')
   if e:assert e['record_sha256']==p['record_sha256'] and p['fields'][e['field']]==e['text'];quotes+=1
 for selection in s['parent_analysis']['selections'].values():
  e=selection.get('evidence')
  if e:assert not is_generic_guidance(e['text'])
 sources=s.get('school_sources',{});assert sources.get('target_entry_year')==2027
 for field in ('application','form','fees','hours'):
  state=sources['fields'][field];assert state['status'] in {'NOT_RUN','CANDIDATE','REVIEW','FETCH_FAILED','NOT_FOUND','PUBLISHED'}
  for page in sources.get('pages',[]):
   path=root/'captured-parent'/'school-sources'/page['path']
   if path.exists():assert hashlib.sha256(path.read_bytes()).hexdigest()==page['sha256']
 for f in s['fees']['rows']:
  d=s['fees']['document'];text=(root/'captured-parent'/d['text_path']).read_text();assert text[f['evidence_start']:f['evidence_end']]==f['evidence_text'];assert f['cents']*f['periods']==f['annual_cents'];fee_rows+=1
 for h in s['hours']:assert any(h['evidence'] in d['text'] and h['source_url']==d['url'] for d in s['new_pages'])
 for step in s['application_steps']:assert any(step['evidence'] in d['text'] and step['source_url']==d['url'] for d in s['new_pages'])
assert len(seen)==962
for name,digest in read(out/'base-hashes.json').items():assert hashlib.sha256((dist/name).read_bytes()).hexdigest()==digest,name
for f in dist.rglob('*'):
 if f.is_file():assert f.stat().st_size<24*1024*1024,str(f)
report={'status':'PASS','aliases':len(aliases),'cards':len(idx),'profiles':len(seen),'model_quotes_exact':quotes,'fee_rows_exact':fee_rows,'unchanged_base_files':len(read(out/'base-hashes.json')),'phase':'KG_ONLY','human_usability_test':'NOT_RUN'}
(out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
