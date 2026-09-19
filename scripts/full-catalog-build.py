"""Lossless full-source publication. No sampling, canonical identity approval or remote writes.
Every original row and cell is assigned to exactly one displayed record and verified by hash.
Same-name/address grouping is a presentation aid, never an official identity determination.
"""
import csv, io, json, hashlib, pathlib, re, collections, unicodedata, datetime, zipfile, sys, html
ROOT=pathlib.Path(__file__).resolve().parents[1]
DIST=ROOT/'apps/web/dist-production'
OUT=ROOT/'artifacts/production'
SOURCES=['edb-school-directory','edb-kg-profiles','chsc-primary-profiles','chsc-secondary-profiles']
LABELS=['教育局學校位置及資料','幼稚園及幼稚園暨幼兒中心概覽','家校會小學概覽','家校會中學概覽']
LEVELS={'KINDERGARTEN':'KG','KINDERGARTEN-CUM-CHILD CARE CENTRES':'KG','PRIMARY':'PRIMARY','SECONDARY':'SECONDARY'}
CATALOGS=['https://data.gov.hk/tc-data/dataset/hk-edb-schinfo-school-location-and-information','https://data.gov.hk/tc-data/dataset/hk-edb-kgjoinkes-kg-profile','https://data.gov.hk/tc-data/dataset/chsc-chsc-primary-school-profiles','https://data.gov.hk/tc-data/dataset/chsc-chsc-secondary-school-profiles']
def dumps(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'),sort_keys=True)
def sha(v):return hashlib.sha256(v if isinstance(v,bytes) else v.encode('utf-8')).hexdigest()
def norm(v):return unicodedata.normalize('NFC',v).strip()
def plain(v):return html.unescape(re.sub('<[^>]+>','',re.sub(r'<br\s*/?>','\n',v,flags=re.I)))
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(dumps(v)+'\n',encoding='utf-8')
def make_record(level,name,address):
    key=[level,norm(name),norm(address)]
    return {'id':'school_'+sha(dumps(key))[:24],'level':level,'name':name,'english_name':'','address':address,'district':'','funding':'','category':'','sessions':[], 'directory':[], 'annual':[], 'association':'SOURCE_RECORD_ONLY'}
def read_sources():
    probe=json.loads((ROOT/'artifacts/source-probe.json').read_text(encoding='utf-8'))
    annual=json.loads((ROOT/'artifacts/annual-source-contracts.json').read_text(encoding='utf-8'))
    results=[]
    for i,s in enumerate(SOURCES):
        m=next(x for x in (probe['sources'] if i==0 else annual) if x['source_id']==s)
        if i==0 and m.get('status')!='LIVE_VERIFIED':raise ValueError('Directory probe did not succeed')
        digest=m.get('raw_sha256') or m.get('sha256')
        path=ROOT/'archive'/s/digest/'raw.csv'
        raw=path.read_bytes()
        if sha(raw)!=digest:raise ValueError('Original source checksum mismatch: '+s)
        reader=csv.DictReader(io.StringIO(raw.decode('utf-8-sig',errors='strict')),delimiter='^' if i==1 else ',')
        rows=list(reader);headers=reader.fieldnames
        if not headers or len(headers)!=len(set(headers)) or not rows or any(None in r or any(v is None for v in r.values()) for r in rows):raise ValueError('Malformed source: '+s)
        required=(['SCHOOL NO.','中文名稱','中文地址','SESSION','SCHOOL LEVEL'] if i==0 else ['學校名稱', '地址' if i==1 else '學校地址'])
        if any(k not in headers for k in required):raise ValueError('Required source fields missing')
        if i>0 and len(rows)!=m['row_count']:raise ValueError('Independent parser count differs')
        source={'id':s,'label':LABELS[i],'edition':m.get('catalogue_label','學校位置及資料（按擷取日期）'),'catalog_url':CATALOGS[i], 'url':m.get('fetched_url') or m.get('url') or m.get('resolved_url') or CATALOGS[i], 'fetched_at':m['fetched_at'],'sha256':digest,'rows':len(rows),'columns':len(headers),'headers':headers,'published_rows':len(rows),'excluded_rows':0,'coverage':1.0}
        results.append((source,rows,raw))
    return results

def build():
    inputs=read_sources();records={};source_refs={};seen_refs=set()
    for n,row in enumerate(inputs[0][1],1):
        level=LEVELS.get(row['SCHOOL LEVEL'].strip().upper(),'OTHER')
        if row['ENGLISH CATEGORY']=='Aided Special Schools':level='SPECIAL'
        name=row['中文名稱'] or row['ENGLISH NAME'];address=row['中文地址'] or row['ENGLISH ADDRESS']
        if not name.strip():raise ValueError('Unnamed directory record; manual correction required, not silently excluded')
        item=make_record(level,name,address);item=records.setdefault(item['id'],item)
        item.update(english_name=row['ENGLISH NAME'],district=row['分區'],funding=row['資助種類'],category=row['中文類別'])
        session=row['學校授課時間']
        if session and session not in item['sessions']:item['sessions'].append(session)
        item['directory'].append({'row':n,'source_key':row['SCHOOL NO.'],'fields':row,'record_sha256':sha(dumps(row))})
        source_refs[(SOURCES[0],n)]=item['id']
    directory_count=len(records)
    for (source,rows,_raw),level in zip(inputs[1:],['KG','PRIMARY','SECONDARY']):
        for n,row in enumerate(rows,1):
            item=make_record(level,row['學校名稱'],row.get('地址',row.get('學校地址','')))
            item=records.setdefault(item['id'],item)
            if not item['district']:item['district']=row.get('地區',row.get('區域',''))
            if not item['funding']:item['funding']=row.get('學校類別1',row.get('學校類別',''))
            if not item['category']:item['category']=row.get('課程類別','')
            item['annual'].append({'source_id':source['id'],'edition':source['edition'],'row':n,'fields':row,'record_sha256':sha(dumps(row))})
            if item['directory']:item['association']='EXACT_REPORTED_NAME_ADDRESS_GROUP_NOT_CANONICAL_APPROVAL'
            source_refs[(source['id'],n)]=item['id']
    # Independently reconcile every row, every column and every raw value. Duplicate source keys remain visible.
    for source,rows,_raw in inputs:
        for n,row in enumerate(rows,1):
            rid=source_refs[(source['id'],n)];item=records[rid]
            output=next(x for x in (item['directory'] if source['id']==SOURCES[0] else item['annual']) if x['row']==n and (source['id']==SOURCES[0] or x['source_id']==source['id']))
            if output['fields']!=row or output['record_sha256']!=sha(dumps(row)):raise ValueError('Lossless reconciliation failed')
            seen_refs.add((source['id'],n))
    if len(seen_refs)!=sum(s['rows'] for s,_,_ in inputs):raise ValueError('Row coverage is not complete')
    ordered=sorted(records.values(),key=lambda x:(x['level'],x['name'],x['id']))
    # Preserve already source-reviewed events, with current source captures; event coverage remains separate.
    events=[]
    for event in json.loads((ROOT/'data/pilot/events.json').read_text(encoding='utf-8')):
        evidence=json.loads((ROOT/'artifacts/pilot'/ (event['source_id']+'.json')).read_text(encoding='utf-8'))
        raw=(ROOT/evidence['raw_path']).read_bytes()
        if sha(raw)!=evidence['raw_sha256']:raise ValueError('Admission source integrity failure')
        item={**event,'source_url':evidence['url'],'evidence_sha256':evidence['raw_sha256'],'checked_at':evidence['fetched_at'],'human_review':False,'school_catalog_ids':[]}
        if event['school_id']:
            # Explicit school-specific source, independently match its stated school name, not any arbitrary ID.
            if event['source_id']!='aogkg-k1-2027-admission':raise ValueError('School event mapping requires explicit evidence')
            item['school_catalog_ids']=[r['id'] for r in ordered if r['level']=='KG' and r['name']=='粉嶺神召會幼稚園']
            if not item['school_catalog_ids']:raise ValueError('Published school event has no displayed school')
        events.append(item)
    subject={'schema':1,'sources':[s for s,_,_ in inputs],'records':ordered,'events':events}
    data_id=sha(dumps(subject));data=DIST/'data'/data_id
    index=[]
    for item in ordered:
        compact={k:item[k] for k in ['id','name','english_name','address','district','level','funding','category','sessions','association']}
        compact['directory_rows']=len(item['directory']);compact['annual_rows']=len(item['annual'])
        compact['source_ids']=list(dict.fromkeys(([SOURCES[0]] if item['directory'] else [])+[x['source_id'] for x in item['annual']]))
        compact['school_numbers']=[d['source_key'] for d in item['directory']]
        index.append(compact);write(data/'schools'/ (item['id']+'.json'),item)
    write(data/'index.json',index);write(data/'events.json',events)
    stats={'source_record_count':len(seen_refs),'display_groups':len(ordered),'directory_display_groups':directory_count,'by_level':dict(collections.Counter(r['level'] for r in ordered)), 'directory_rows_by_level':dict(collections.Counter(r['level'] for r in ordered for _ in r['directory'])),'annual_rows':sum(len(r['annual']) for r in ordered),'unassociated_annual_rows':sum(len(r['annual']) for r in ordered if not r['directory']), 'grouping':'same reported name + address + level; original source rows retained; not certified unique school identities'}
    manifest={'schema':1,'owner':'ray510/HK_APP','environment':'production','data_id':data_id,'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'coverage_status':'COMPLETE_SELECTED_OFFICIAL_RESOURCES','sources':[s for s,_,_ in inputs],'stats':stats,'event_count':len(events),'event_coverage':'SELECTED_SOURCE_REVIEWED_NOT_ALL_SCHOOL_NOTICES','synthetic_records':0,'sample_limit':None,'identity_approval':'NOT_ASSERTED_BY_PRESENTATION_GROUPING','validation':{'all_source_rows_accounted':True,'all_original_cells_preserved':True,'independent_annual_counts':True},'official_current_primary_website':'https://www.chsc.hk/primary','version_note':'來源欄位以所示概覽版本為準；小學概覽2026網上版已發布，CSV版本與網站未必同步。'}
    write(data/'manifest.json',manifest)
    write(DIST/'catalog-manifest.json',manifest)
    OUT.mkdir(parents=True,exist_ok=True)
    # Portable full dataset archive, publicly downloadable. Includes original CSVs and field-preserving JSON.
    bundle=OUT/('school-data-'+data_id[:16]+'.zip')
    with zipfile.ZipFile(bundle,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for source,_,raw in inputs:z.writestr('raw/'+source['id']+'.csv',raw)
        z.writestr('manifest.json',dumps(manifest));z.writestr('catalog.json',dumps(subject))
        z.writestr('README.txt','來源：教育局及家庭與學校合作事宜委員會。原始資料條款：https://data.gov.hk/tc/terms-and-conditions\n全量是所列來源版本的所有紀錄及原始欄位，不等於所有學校當屆招生公告已發布。\n')
    write(OUT/'release.json',{'data_id':data_id,'zip':bundle.name,'zip_sha256':sha(bundle.read_bytes()),'manifest':manifest})
    download=DIST/'downloads';download.mkdir(parents=True,exist_ok=True);(download/'school-data.zip').write_bytes(bundle.read_bytes())
    write(DIST/'downloads/checksums.json',{'school-data.zip':sha(bundle.read_bytes()),'data_id':data_id})
    if (DIST/'full.html').exists():(DIST/'full.html').rename(DIST/'index.html')
    # No staging labels are removed blindly; full-data UI is a separate production entry.
    write(OUT/'coverage.json',manifest)
    print(dumps({'status':'FULL_SOURCE_RECONCILED','data_id':data_id,'sources':[(s['id'],s['rows'],s['columns']) for s,_,_ in inputs],**stats,'events':len(events)}))
    return manifest
if __name__=='__main__':build()
