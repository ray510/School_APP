"""Independent output reconciliation: sources, original IDs, model quotes and fees."""
import pathlib,json,hashlib,collections,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from scripts.kg_parent.facts import is_generic_guidance
root=pathlib.Path('.');dist=root/'apps/web/dist-production';out=root/'artifacts/kg-parent'
def read(p):return json.loads(p.read_text())
def dedupe(items):
 result=[];seen=set()
 for item in items:
  key=(item.get('field'),item.get('value'),item.get('url','').rstrip('/') or '/',item.get('target_year'))
  if key not in seen:seen.add(key);result.append(item)
 return result
m=read(dist/'kg-parent-manifest.json');folder=dist/'kg-parent'/m['bundle_id'];idx=read(folder/'index.json');aliases=read(folder/'aliases.json');prepared=read(out/'prepared.json');source={r['id']:r for r in prepared['records']};inputs=read(out/'inputs.json');original={r['id']:r for r in inputs['records']}
assert m['schema']==2
assert len(aliases)==m['source_groups']==1759 and len(idx)==m['parent_cards']==1025;assert len(source)==len(idx)
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
 sources=s.get('school_sources',{});assert sources.get('target_entry_year')==2027 and set(sources.get('fields',{}))=={'application','form','fees','hours'}
 failures=sources.get('fetch_failures',[])
 for failure in failures:
  assert failure.get('reason_code') and failure.get('reason') and failure.get('checked_url') and failure.get('checked_at')
 if sources.get('discovery_status')=='FETCH_FAILED':assert failures
 if sources.get('discovery_status')=='NOT_FOUND':assert sources.get('reason_code') and sources.get('reason')
 issue={k:failures[0][k] for k in ('reason_code','reason','checked_url','checked_at') if failures[0].get(k)} if sources.get('discovery_status')=='FETCH_FAILED' and failures else ({k:sources[k] for k in ('reason_code','reason') if sources.get(k)} if sources.get('reason_code') else None)
 assert entry.get('school_source_issue')==issue
 source_root=(root/'captured-parent'/'school-sources').resolve();page_facts={field:[] for field in ('application','form','fees','hours')}
 for page in sources.get('pages',[]):
  path=(source_root/page['path']).resolve();text_path=(source_root/page['text_path']).resolve()
  assert path.is_relative_to(source_root) and text_path.is_relative_to(source_root)
  assert path.is_file() and text_path.is_file()
  assert hashlib.sha256(path.read_bytes()).hexdigest()==page['sha256']
  assert hashlib.sha256(text_path.read_bytes()).hexdigest()==page['text_sha256']
  for field,facts in page.get('facts',{}).items():
   assert field in page_facts;page_facts[field].extend(facts)
 for field in ('application','form','fees','hours'):
  state=sources['fields'][field];assert state['status'] in {'CANDIDATE','REVIEW','FETCH_FAILED','NOT_FOUND','PUBLISHED'}
  evidence=dedupe(page_facts[field]);target=[e for e in evidence if e.get('target_year')==2027];ordered=(target+[e for e in evidence if e.get('target_year')!=2027])[:20]
  assert state['evidence_count']==state['total_evidence_count']==len(evidence) and state['target_evidence_count']==len(target) and state['evidence']==ordered
  if state['status']=='CANDIDATE':assert target
  if state['status']=='PUBLISHED':assert state['review_status']=='APPROVED' and state['publication_status']=='PUBLISHED'
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
