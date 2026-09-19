"""Deterministic classification by source field, never by school name or AI.
All raw values remain in their source records. Different source editions are not
silently merged into one opinion. A historical mismatch is shown as such.
"""
VERSION = 'school-classification-v1'
FUNDING = {
    '官立': 'GOVERNMENT', '資助': 'AIDED', '直資': 'DSS',
    '直接資助計劃': 'DSS', '私立': 'PRIVATE',
    '私立獨立學校計劃': 'PIS', '英基學校協會': 'ESF', '按位津貼': 'CAPUT',
}
OPERATOR = {'非牟利': 'NON_PROFIT', '私立獨立': 'PRIVATE_INDEPENDENT'}
SCHEME = {'有參加': 'PARTICIPATING', '沒有參加': 'NOT_PARTICIPATING', '申請審核中': 'PENDING'}
LABELS = {**{v:k for k,v in FUNDING.items()}, 'DSS':'直資',
    'NON_PROFIT':'非牟利', 'PRIVATE_INDEPENDENT':'私立獨立',
    'PARTICIPATING':'參加幼稚園教育計劃', 'NOT_PARTICIPATING':'未參加幼稚園教育計劃',
    'PENDING':'幼稚園教育計劃申請審核中'}

def decision(evidence, mapping, applicable=True):
    if not applicable:
        return {'value': None, 'label':'不適用', 'state':'not_applicable', 'evidence':[]}
    present=[e for e in evidence if e['raw_value'].strip() and e['raw_value'].strip() not in ('-', 'N.A.', 'N/A')]
    values={mapping[e['raw_value'].strip()] for e in present if e['raw_value'].strip() in mapping}
    if not present:
        value=None; state='not_provided'; label='來源未提供'
    elif any(e['raw_value'].strip() not in mapping for e in present):
        value=None; state='unrecognized'; label='來源分類待核對'
    elif len(values)>1:
        value=None; state='conflict'; label='同來源分類有衝突'
    else:
        value=next(iter(values)); state='known'; label=LABELS[value]
    return {'value':value,'label':label,'state':state,'evidence':evidence}

def ref(source, row, field, raw):
    return {'source_id':source['id'], 'edition':source['edition'], 'source_sha256':source['sha256'],
        'source_url':source['url'], 'row':row['row'], 'record_sha256':row['record_sha256'],
        'field':field,'raw_value':raw,'reference_period':None}

def row_dimensions(source, row, level):
    fields=row['fields']; sid=source['id']; kg=level=='KG'
    f='資助種類' if sid=='edb-school-directory' else ('學校類別1' if sid=='chsc-primary-profiles' else '學校類別')
    # KG annual 學校類別 is operator nature, not funding.
    funding=[] if sid=='edb-kg-profiles' else [ref(source,row,f,fields.get(f,''))]
    operator=[ref(source,row,'學校類別',fields.get('學校類別',''))] if sid=='edb-kg-profiles' else []
    scheme=[ref(source,row,'參加幼稚園教育計劃',fields.get('參加幼稚園教育計劃',''))] if sid=='edb-kg-profiles' else []
    return {'funding_type':decision(funding,FUNDING), 'kg_operator_type':decision(operator,OPERATOR,kg),
        'kg_scheme_participation':decision(scheme,SCHEME,kg)}

def classify(item, source_map):
    directory=[row_dimensions(source_map['edb-school-directory'],r,item['level']) for r in item['directory']]
    annual=[row_dimensions(source_map[r['source_id']],r,item['level']) for r in item['annual']]
    output={'version':VERSION}
    for key,mapping in [('funding_type',FUNDING),('kg_operator_type',OPERATOR),('kg_scheme_participation',SCHEME)]:
        candidates=directory if key=='funding_type' and directory else annual
        evidence=[e for d in candidates for e in d[key]['evidence']]
        answer=decision(evidence,mapping,key=='funding_type' or item['level']=='KG')
        historical=[d[key] for d in annual if d[key]['state']=='known' and d[key]['value']!=answer['value']]
        answer['historical_differences']=historical if key=='funding_type' and directory else []
        output[key]=answer
    return output
