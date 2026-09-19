"""Verify classification provenance, full cohort accounting and verbatim AI evidence."""
import json,pathlib,collections,sys
from school_classification import classify,row_dimensions
from jev_analysis import TAGS,VERDICTS
ROOT=pathlib.Path(__file__).resolve().parents[1];D=ROOT/'apps/web/dist-production'
def read(p):return json.loads(p.read_text(encoding='utf8'))
m=read(D/'catalog-manifest.json');folder=D/'data'/m['data_id'];index=read(folder/'index.json');a=read(folder/'analytics.json');sources={s['id']:s for s in m['sources']}
assert a['cohort_unit']=='SOURCE_RECORD';assert len(a['entries'])==m['stats']['source_record_count'];assert a['cohort_counts']=={s['id']:s['rows'] for s in m['sources']}
look={(e['source_id'],e['row'],e['record_sha256']):e for e in a['entries']};assert len(look)==len(a['entries']);labels=collections.Counter();evidence_count=0
for entry in index:
 item=read(folder/'schools'/(entry['id']+'.json'));assert item['classification']==entry['classification']==classify(item,sources)
 for row in item['directory']+item['annual']:
  sid=row.get('source_id','edb-school-directory');result=look[(sid,row['row'],row['record_sha256'])]
  assert result['school_id']==item['id'];assert result['classification']==row_dimensions(sources[sid],row,item['level'])
  if sid=='edb-school-directory':assert result['analysis_status']=='NOT_APPLICABLE';continue
  assert set(result['labels'])==set(TAGS)
  for label in result['labels'].values():
   assert label['status'] in set(VERDICTS)|{'REVIEW','NOT_ANALYZED','API_ERROR','INVALID_RESPONSE'};labels[label['status']]+=1
   evidence=label.get('evidence')
   if evidence:
    assert row['fields'][evidence['field']][evidence['start']:evidence['end']]==evidence['text'];evidence_count+=1
   if label['status'] in ('MENTIONED','EXPLICITLY_ABSENT'):assert evidence and result['analysis_status']=='ANALYZED' and a['provider']
assert sum(labels.values())==m['stats']['annual_rows']*len(TAGS)
# Example regression expectations are checked against source records, not school names as an algorithm.
for name,expected in [('上水惠州公立學校','AIDED'),('粉嶺公立學校','AIDED'),('粉嶺官立中學','GOVERNMENT')]:
 items=[s for s in index if s['name']==name and s['directory_rows']];assert items,name
 assert all(s['classification']['funding_type']['value']==expected for s in items),name
report={'status':'PASS','raw_cohort_rows':len(a['entries']),'annual_rows':m['stats']['annual_rows'],'tag_states':dict(labels),'evidence_spans':evidence_count,'provider':a['provider'],'inference_status':a['status'],'inference_reason':a.get('reason')}
(ROOT/'artifacts/analytics/verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False))
