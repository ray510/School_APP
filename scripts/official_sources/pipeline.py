"""Explicit public capture and offline publication build. No deployment or AI calls."""
from __future__ import annotations
import gzip
import argparse, datetime as dt, hashlib, json, pathlib, shutil, sys, time, urllib.error, urllib.request, zipfile
from collections import Counter, defaultdict
from urllib.parse import urlsplit, urlunsplit
from .core import ContractError, VERSION, canonical, digest, plan_resources, read_records, normalize, link_record, norm
from .specs import SPECS, SPEC_BY_CODE
HOSTS={'data.gov.hk','www.edb.gov.hk','edb.gov.hk','applications.edb.gov.hk'}
MAX_TOTAL=500_000_000

def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def write(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(canonical(obj)+'\n',encoding='utf8');temp.replace(path)
def read(path): return json.loads(path.read_text(encoding='utf8'))
def checked_url(url):
    u=urlsplit(url)
    if u.scheme not in ('http','https') or u.hostname not in HOSTS or u.username or u.password or u.port not in (None,80,443):
        raise ContractError('Unapproved public data endpoint')
    return urlunsplit(('https',u.hostname,u.path,u.query,''))
class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        return super().redirect_request(req,fp,code,msg,headers,checked_url(newurl))
class Fetcher:
    def __init__(self):self.total=0
    def get(self,url,limit=350_000_000):
        url=checked_url(url)
        for attempt in range(2):
            try:
                req=urllib.request.Request(url,headers={'User-Agent':'HK-School-Guide-Official-Source-Capture/1.0','Accept-Encoding':'identity'})
                with urllib.request.build_opener(SafeRedirect()).open(req,timeout=35) as response:
                    raw=response.read(limit+1)
                    if len(raw)>limit:raise ContractError('Response exceeds permitted bound')
                    self.total+=len(raw)
                    if self.total>MAX_TOTAL:raise ContractError('Capture total exceeds safety bound')
                    headers={k:response.headers.get(k) for k in ('Content-Type','Last-Modified','ETag')}
                    return raw,{'url':url,'final_url':checked_url(response.url),'fetched_at':now(),'http_status':response.status,'headers':headers,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
            except urllib.error.HTTPError as exc:
                if exc.code not in (429,500,502,503,504) or attempt: raise
            except (urllib.error.URLError,TimeoutError):
                if attempt:raise
            time.sleep(2)
        raise ContractError('Retry exhausted')

def capture(out):
    out.mkdir(parents=True,exist_ok=True)
    if (out/'capture.json').exists():raise ContractError('Use a new capture directory; snapshots are immutable')
    client=Fetcher();sources=[]
    for spec in SPECS:
        entry={'code':spec.code,'dataset':spec.slug,'title':spec.title,'catalog_url':'https://data.gov.hk/tc-data/dataset/'+spec.slug,
               'dictionary_url':spec.dictionary,'warning':spec.warning,'state':'DISCOVERED','resources':[],'not_selected':[]}
        try:
            raw,meta=client.get('https://data.gov.hk/tc-data/api/3/action/package_show?id='+spec.slug,8_000_000)
            obj=json.loads(raw)
            if obj.get('success') is not True:raise ContractError('Official metadata request unsuccessful')
            package=obj['result'];selected,omitted=plan_resources(spec.code,package)
            entry.update(title=package['title'],metadata=meta,not_selected=omitted,state='EVALUATED')
            (out/(spec.code+'-catalogue.json')).write_bytes(raw)
            if len(selected)>25:raise ContractError('Unexpected number of selected resources; review plan')
            for resource in selected:
                r={**resource,'state':'DISCOVERED'}
                try:
                    payload,evidence=client.get(r['url'])
                    suffix='.xml' if r['format']=='XML' else '.csv'
                    filename=evidence['sha256']+suffix
                    dest=out/'raw'/filename;dest.parent.mkdir(exist_ok=True)
                    dest.write_bytes(payload)
                    r.update(evidence=evidence,path='raw/'+filename,state='FETCHED')
                    rows=read_records(payload,r)
                    normal=[normalize(fields,r,i,evidence['sha256']) for i,fields in enumerate(rows,1)]
                    if len(rows)!=len(normal) or any(x['raw']!=f for x,f in zip(normal,rows)):
                        raise ContractError('Round-trip source reconciliation failure')
                    filename='records/'+spec.code+'-'+digest(r['resource_id'])[:12]+'.json'
                    write(out/filename,normal)
                    r.update(state='VERIFIED',row_count=len(rows),field_names=sorted({k for row in rows for k in row}),records_path=filename,records_sha256=digest(normal))
                except Exception as exc:
                    r.update(state='BLOCKED',error=type(exc).__name__+': '+str(exc)[:350])
                entry['resources'].append(r)
            entry['state']='VERIFIED' if entry['resources'] and all(r['state']=='VERIFIED' for r in entry['resources']) else 'BLOCKED'
        except Exception as exc:
            entry.update(state='BLOCKED',error=type(exc).__name__+': '+str(exc)[:350])
        sources.append(entry)
        write(out/'capture-progress.json',{'state':'IN_PROGRESS_NOT_PUBLISHABLE','generated_at':now(),'sources':sources})
        print(spec.code,entry['state'],entry.get('error',''),flush=True)
    result={'schema':1,'contract_version':VERSION,'generated_at':now(),'sources':sources,
            'state':'VERIFIED' if all(s['state']=='VERIFIED' for s in sources) else 'BLOCKED','model_calls':0,'remote_writes':0,
            'scope':'Latest explicitly-labelled Traditional Chinese resource per role; all rows and raw fields; no record sampling.'}
    write(out/'capture.json',result)
    return result

def build(inp,dist):
    capture_=read(inp/'capture.json')
    if capture_.get('state')!='VERIFIED': raise ContractError('All eight sources must pass capture; no partial publication')
    if capture_.get('contract_version')!=VERSION: raise ContractError('Contract version mismatch')
    sources=capture_['sources']
    if {s['code'] for s in sources}!={s.code for s in SPECS} or len(sources)!=8:raise ContractError('Eight distinct sources required')
    base=read(dist/'catalog-manifest.json');base_id=base['data_id']
    if base.get('environment')!='production' or base.get('synthetic_records')!=0:raise ContractError('Verified real production base required')
    school_paths=sorted((dist/'data'/base_id/'schools').glob('*.json'))
    if not school_paths:raise ContractError('Base school records unavailable')
    schools=[read(p) for p in school_paths]
    names=defaultdict(list)
    for s in schools:
        for name_key in {norm(s['name']),norm(s.get('english_name',''))}-{''}:names[name_key].append(s)
    all_rows=[];public_sources=[];raw_files={}
    for source in sources:
        print('VERIFY',source['code'],flush=True)
        public={k:v for k,v in source.items() if k!='metadata'}
        public['resources']=[]
        if source['state']!='VERIFIED':raise ContractError('Unverified source')
        for r in source['resources']:
            if r['state']!='VERIFIED':raise ContractError('Unverified resource')
            rp=inp/r['path']
            if rp.resolve().parent!=(inp/'raw').resolve():raise ContractError('Unsafe source path')
            raw=rp.read_bytes()
            if hashlib.sha256(raw).hexdigest()!=r['evidence']['sha256']:raise ContractError('Raw resource hash changed')
            rows=read_records(raw,r)
            normal=[normalize(f,r,i,r['evidence']['sha256']) for i,f in enumerate(rows,1)]
            if digest(normal)!=r['records_sha256'] or len(normal)!=r['row_count']:raise ContractError('Independent rebuild differs')
            for row in normal:row['association']=link_record(row,names.get(norm(row['normalized']['name']),[]))
            all_rows.extend(normal)
            raw_files[r['path']]=raw
            public['resources'].append({**r,'records_path':None})
        public_sources.append(public)
    if len({r['id'] for r in all_rows})!=len(all_rows):raise ContractError('Duplicate resource/row identity')
    # Same-edition DSS list number, full name and level provide a traceable fee join.
    dss=defaultdict(list)
    def dss_key(row):
        n=row['normalized'];return (n['reference_year'],norm(n['name']),n['level'],n['facts'].get('listing_number'))
    for row in all_rows:
        if row['role']=='dss' and row['normalized']['facts'].get('listing_number'):dss[dss_key(row)].append(row)
    for row in all_rows:
        if row['role']=='dss_fees':
            peers=dss.get(dss_key(row),[])
            if len(peers)==1 and peers[0]['association']['state']=='EVIDENCE_LINKED':
                row['association']={'state':'EVIDENCE_LINKED','via_record_id':peers[0]['id'],'links':[{**l,'method':l['method']+'+SAME_EDITION_DSS_FEE_LIST_KEY_NAME_LEVEL'} for l in peers[0]['association']['links']]}
    by_school=defaultdict(list)
    for row in all_rows:
        if row['association']['state'] in ('EVIDENCE_LINKED','REVIEW_REQUIRED'):
            for link in row['association']['links']:by_school[link['school_id']].append(row)
    group_map=defaultdict(list)
    for r in all_rows:
        if r['role']=='through_train' and r['normalized']['facts']['group_id']:
            group_map[(r['resource_id'],r['normalized']['facts']['group_id'])].append(r['id'])
    content_hash=hashlib.sha256(canonical({'base_data_id':base_id,'contract_version':VERSION,'sources':public_sources}).encode())
    for row in all_rows:content_hash.update(canonical(row).encode())
    bundle_id=content_hash.hexdigest();folder=dist/'official'/bundle_id
    folder.mkdir(parents=True,exist_ok=False)
    for relative,raw in raw_files.items():
        name=pathlib.Path(relative).name
        if len(raw)>20_000_000:
            name+='.gz';(folder/name).write_bytes(gzip.compress(raw,mtime=0))
        else:(folder/name).write_bytes(raw)
    summaries={}
    for s in public_sources:
        print('WRITE',s['code'],flush=True)
        groups=[]
        for r in s['resources']:
            name=pathlib.Path(r['path']).name;raw=raw_files[r['path']]
            if len(raw)>20_000_000:name+='.gz'
            r['download_url']='/official/'+bundle_id+'/'+name
            r['download_encoding']='gzip' if name.endswith('.gz') else 'identity'
            source_rows=[x for x in all_rows if x['resource_id']==r['resource_id']]
            index_urls=[]
            for offset in range(0,len(source_rows),400):
                part=source_rows[offset:offset+400];stem=s['code']+'-'+r['role']+'-'+str(offset//400)
                detail_url='/official/'+bundle_id+'/details/'+stem+'.json'
                write(folder/'details'/(stem+'.json'),{'bundle_id':bundle_id,'rows':part})
                compact=[]
                for row in part:
                    summary={k:v for k,v in row.items() if k!='raw'}
                    summary['detail_url']=detail_url;compact.append(summary);summaries[row['id']]=summary
                index_url='/official/'+bundle_id+'/indexes/'+stem+'.json';index_urls.append(index_url)
                write(folder/'indexes'/(stem+'.json'),{'bundle_id':bundle_id,'rows':compact})
            groups.append({'resource_id':r['resource_id'],'row_count':len(source_rows),'urls':index_urls})
        write(folder/(s['code']+'.json'),{'schema':1,'bundle_id':bundle_id,'source':s,'index_groups':groups,'total_rows':sum(g['row_count'] for g in groups)})
    for sid,rows in by_school.items():write(folder/'schools'/(sid+'.json'),{'schema':1,'bundle_id':bundle_id,'school_id':sid,'rows':[summaries[r['id']] for r in rows]})
    registration_numbers={r['normalized']['school_number'] for r in all_rows if r['role']=='registration'}
    premise_keys={(r['normalized']['school_number'],r['normalized']['facts']['premises_code']) for r in all_rows if r['role']=='premises'}
    cross={'premises_without_registration':sum(r['role']=='premises' and r['normalized']['school_number'] not in registration_numbers for r in all_rows),
      'capacity_without_premises':sum(r['role']=='capacity' and (r['normalized']['school_number'],r['normalized']['facts']['premises_code']) not in premise_keys for r in all_rows)}
    stats={'source_datasets':8,'resources':sum(len(s['resources']) for s in sources),'source_records':len(all_rows),
           'association_states':dict(Counter(r['association']['state'] for r in all_rows)),
           'school_groups_with_evidence_links':len({l['school_id'] for r in all_rows if r['association']['state']=='EVIDENCE_LINKED' for l in r['association']['links']}),'school_groups_with_candidates_or_links':len(by_school),'through_train_groups':len(group_map),
           'by_source':dict(Counter(r['code'] for r in all_rows)),'by_role':dict(Counter(r['role'] for r in all_rows)),
           'cross_file_checks':cross,'excluded_rows':0,'synthetic_records':0}
    manifest={'schema':1,'contract_version':VERSION,'state':'VERIFIED','bundle_id':bundle_id,'base_data_id':base_id,'generated_at':now(),
              'sources':public_sources,'stats':stats,'school_ids':sorted(by_school),'model_calls':0,
              'scope':capture_['scope'],'geometry_status':'OFFICIAL_MAP_LINKS_ONLY_NO_ADDRESS_TO_NET_INFERENCE'}
    write(folder/'manifest.json',manifest)
    write(folder/'through-train-groups.json',[{'resource_id':k[0],'group_id':k[1],'record_ids':v} for k,v in group_map.items()])
    downloads=dist/'downloads';downloads.mkdir(exist_ok=True)
    archive=downloads/'official-eight.zip';print('ARCHIVE',len(all_rows),flush=True)
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        z.writestr('manifest.json',canonical(manifest))
        with z.open('all-records.json','w') as output:
            output.write(b'[')
            for i,row in enumerate(all_rows):
                if i:output.write(b',')
                output.write(canonical(row).encode())
            output.write(b']')
        for path,raw in raw_files.items():z.writestr(path,raw)
        for source in sources:z.write(inp/(source['code']+'-catalogue.json'),'metadata/'+source['code']+'.json')
    manifest['download_sha256']=hashlib.sha256(archive.read_bytes()).hexdigest()
    write(dist/'official-manifest.json',manifest)
    files=[p for p in folder.rglob('*') if p.is_file()]
    if max([archive.stat().st_size]+[p.stat().st_size for p in files])>=24*1024*1024:raise ContractError('Static asset too large')
    report={'state':'OFFLINE_BUILD_VERIFIED_NOT_DEPLOYED','bundle_id':bundle_id,'base_data_id':base_id,**stats,'checked_at':now(),'download_sha256':manifest['download_sha256'],'download_bytes':archive.stat().st_size,'max_asset_bytes':max(p.stat().st_size for p in files)}
    write(inp/'build-report.json',report);print(canonical(report));return manifest

def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
    c=sub.add_parser('capture');c.add_argument('--out',type=pathlib.Path,required=True)
    b=sub.add_parser('build');b.add_argument('--input',type=pathlib.Path,required=True);b.add_argument('--dist',type=pathlib.Path,required=True)
    a=p.parse_args()
    try:
        if a.command=='capture':return 0 if capture(a.out)['state']=='VERIFIED' else 2
        build(a.input,a.dist);return 0
    except Exception as exc: print(type(exc).__name__+': '+str(exc),file=sys.stderr);return 2
if __name__=='__main__':raise SystemExit(main())
