"""Per-source-record cohorts with exact denominators and separate AI status.
No school ranking, admission probability, implicit identity join or AI arithmetic.
"""
import json, pathlib, collections
from school_classification import row_dimensions
from jev_analysis import TAGS, POLICY, placeholder
ROOT=pathlib.Path(__file__).resolve().parents[1]

def assemble(inputs, records):
    sources={s['id']:s for s,_,_ in inputs}
    path=ROOT/'artifacts/analytics/results.json'
    report=json.loads(path.read_text(encoding='utf8')) if path.exists() else {
        'schema':1,'policy_version':POLICY,'provider':None,'model_requested':None,'model_returned':[],
        'status':'PARTIAL_OR_UNAVAILABLE','reason':'ANALYSIS_NOT_RUN','items':[],
        'quality_status':'NOT_HUMAN_CALIBRATED','usage':{'requests':0,'input_tokens':None,'output_tokens':None},
        'source_hashes':{s['id']:s['sha256'] for s,_,_ in inputs[1:]}}
    if report.get('policy_version')!=POLICY or report['source_hashes']!={s['id']:s['sha256'] for s,_,_ in inputs[1:]}:
        raise ValueError('Analysis source or policy does not match current official source bytes')
    lookup={}
    for result in report['items']:
        key=(result['source_id'],result['row'],result['record_sha256'])
        if key in lookup:raise ValueError('Duplicate analysis source record')
        lookup[key]=result
    expected={(r['source_id'],r['row'],r['record_sha256']) for item in records for r in item['annual']}
    if path.exists() and set(lookup)!=expected:raise ValueError('Analysis coverage must account for every annual row, including errors')
    entries=[]
    for item in records:
        item['semantic_annotations']=[]
        for sid,rows in [('edb-school-directory',item['directory']),('annual',item['annual'])]:
            for r in rows:
                source=sources[r['source_id'] if sid=='annual' else sid]
                base={'school_id':item['id'],'name':item['name'],'source_id':source['id'],
                    'edition':source['edition'],'row':r['row'],'record_sha256':r['record_sha256'],'level':item['level'],
                    'district':r['fields'].get('分區',r['fields'].get('地區',r['fields'].get('區域',''))),
                    'classification':row_dimensions(source,r,item['level'])}
                if sid=='annual':
                    result=lookup.get((source['id'],r['row'],r['record_sha256']),{
                        'source_id':source['id'],'row':r['row'],'record_sha256':r['record_sha256'],
                        **placeholder('NOT_ANALYZED','ANALYSIS_NOT_RUN')})
                    for label in result['labels'].values():
                        e=label.get('evidence')
                        if e and r['fields'].get(e['field'],'')[e['start']:e['end']]!=e['text']:
                            raise ValueError('AI evidence does not equal original source substring')
                    item['semantic_annotations'].append(result)
                    base.update(analysis_status=result['status'],labels=result['labels'])
                else:base.update(analysis_status='NOT_APPLICABLE',labels={})
                entries.append(base)
    counts=dict(collections.Counter(e['source_id'] for e in entries))
    if counts!={s['id']:s['rows'] for s,_,_ in inputs}:raise ValueError('Cohort counts do not equal source rows')
    summary={k:v for k,v in report.items() if k not in ('items','source_hashes','generated_at')}
    summary.update(schema=1,cohort_unit='SOURCE_RECORD',cohort_counts=counts,
        tag_definitions={k:{'label':v[0],'definition':v[1]} for k,v in TAGS.items()},
        status_counts=dict(collections.Counter(e['analysis_status'] for e in entries if e['source_id']!='edb-school-directory')))
    return {**summary,'entries':entries}
