"""Four additional source-evidenced JEV topics, never overwrite the six published topics.
Public source text only. Bounded fresh inference; absent keys fail this release.
"""
import concurrent.futures, hashlib, json, os, pathlib, sys, threading
import jev_analysis as jev
ROOT=pathlib.Path(__file__).resolve().parents[1]
POLICY='school-decision-evidence-v1'
TOPICS={
 'inquiry_play':('遊戲及探究教學','明確描述由學生參與的遊戲、探究、專題、方案或實作學習安排；只有愉快學習或創新願景口號不算。'),
 'transition_support':('入學適應及升學銜接','明確描述新生適應、親子適應、幼小或小中銜接、升學輔導或生涯規劃活動；只列招生日期或升學率不算。'),
 'wellbeing_support':('情緒及輔導支援','明確描述情緒教育、輔導、社工、心理或朋輩支援措施；只稱關愛學生不算。'),
 'arts_sports':('藝術及體育活動','明確描述音樂、戲劇、舞蹈、視藝、體能或體育學習活動；只有場地設備或全人發展口號不算。'),
}
CASES=[('inquiry_play','學生在科學專題中提出問題、實驗及討論結果。','MENTIONED'),('transition_support','新生可參加親子適應週及小一模擬課程。','MENTIONED'),('wellbeing_support','本校重視全人發展。','NOT_STATED'),('arts_sports','本校不提供任何藝術或體育活動。','EXPLICITLY_ABSENT')]
def validate_response(result):
 if result.get('model')!='jev-1.13.0':raise jev.CallError('MODEL_VERSION_MISMATCH')
def run():
 jev.TAGS=TOPICS
 old=ROOT/'reused/apps/web/dist-production'
 manifest=json.loads((old/'catalog-manifest.json').read_text(encoding='utf8'))
 folder=old/'data'/manifest['data_id']
 tasks={}
 for path in sorted((folder/'schools').glob('*.json')):
  for a in json.loads(path.read_text(encoding='utf8'))['annual']:
   key=(a['source_id'],a['row'],a['record_sha256'])
   if key in tasks:raise ValueError('Duplicate raw annual source record')
   tasks[key]=a
 if len(tasks)!=manifest['stats']['annual_rows']:raise ValueError('Incomplete raw annual task coverage')
 key=os.environ.get('TYPESAFE_API_KEY')
 if not key:raise ValueError('TYPESAFE_API_KEY is unavailable; existing live release is not replaced')
 cfg=jev.provider_config({'TYPESAFE_API_KEY':key,'JEV_PROVIDER':'typesafe'})
 client=jev.Client(cfg,max_usd=0.80,max_requests=2200)
 tests=[]
 for tag,text,expected in CASES:
  ex=[{'id':'E0','field':'text','start':0,'end':len(text),'text':text}]
  r=client.ask({'excerpts':ex},jev.questions_for(ex,[tag]));validate_response(r)
  labels=jev.decode(r,ex,{'text':text},[tag]);actual=labels[tag]['proposed_verdict']
  tests.append({'tag':tag,'expected':expected,'actual':actual,'pass':actual==expected})
 if not all(t['pass'] for t in tests):raise ValueError('JEV live contract canary failed; no publication')
 cache=ROOT/'artifacts/sitewide-cache';cache.mkdir(parents=True,exist_ok=True)
 progress=0;lock=threading.Lock()
 def process(a):
  nonlocal progress
  base={k:a[k] for k in ('source_id','edition','row','record_sha256')}
  ex,truncated=jev.excerpts(a['fields'])
  if not ex:return {**base,**jev.placeholder('NOT_ANALYZED','NO_ANALYSABLE_TEXT')}
  qs=jev.questions_for(ex);state={'excerpts':ex};digest=jev.sha({'state':state,'questions':qs,'model':cfg['model'],'policy':POLICY})
  path=cache/(digest+'.json');hit=False
  try:
   if path.exists():
    saved=json.loads(path.read_text(encoding='utf8'))
    if saved.get('key')!=digest or saved.get('hash')!=jev.sha(saved.get('response')):raise jev.CallError('CACHE_INTEGRITY_ERROR')
    result=saved['response'];hit=True
   else:result=client.ask(state,qs)
   validate_response(result);labels=jev.decode(result,ex,a['fields'])
   if not hit:jev.write(path,{'key':digest,'hash':jev.sha(result),'response':result})
   output={**base,'status':'ANALYZED','labels':labels,'model_requested':cfg['model'],'model_returned':result['model'],'excerpts_truncated':truncated,'cache_hit':hit}
  except jev.CallError as e:
   output={**base,**jev.placeholder('INVALID_RESPONSE' if str(e) in ('INVALID_RESPONSE','EVIDENCE_MISMATCH','MODEL_VERSION_MISMATCH') else 'API_ERROR',str(e))}
  with lock:
   progress+=1
   if progress%200==0:print(jev.stable({'processed':progress,'total':len(tasks),'usage':client.usage()}),flush=True)
  return output
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:items=list(pool.map(process,tasks.values()))
 from collections import Counter
 counts=dict(Counter(a['status'] for a in items))
 report={'schema':1,'policy_version':POLICY,'data_id':manifest['data_id'],'generated_at':jev.now(),'provider':'typesafe','model':'jev-1.13.0','quality_status':'NOT_HUMAN_CALIBRATED','scope':'SELECTED_SOURCE_EXCERPTS','source_hashes':{s['id']:s['sha256'] for s in manifest['sources']},'topics':{k:{'label':v[0],'definition':v[1]} for k,v in TOPICS.items()},'canary':{'status':'PASS','scope':'synthetic contract checks, not human school evaluation','cases':tests},'status_counts':counts,'usage':client.usage(),'items':items}
 jev.write(ROOT/'artifacts/sitewide/inference.json',report)
 print(jev.stable({k:v for k,v in report.items() if k!='items'}))
 # Never replace a working release with a largely failed new analysis batch.
 if counts.get('ANALYZED',0)<len(tasks)*.95:raise ValueError('Less than 95% valid source responses; preserve current release')
if __name__=='__main__':run()
