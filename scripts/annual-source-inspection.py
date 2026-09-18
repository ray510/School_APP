"""Explicit read-only annual source inspection; delimiters are source-specific, never guessed."""
import csv, io, json, hashlib, pathlib, re, urllib.request, urllib.parse, urllib.error, datetime, collections
ROOT=pathlib.Path(__file__).resolve().parents[1]
REPORT=json.loads((ROOT/'artifacts/source-probe.json').read_text())
ALLOWED={'www.edb.gov.hk','www.chsc.hk','data.gov.hk'}
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):return None
OPENER=urllib.request.build_opener(NoRedirect)
def read(url):
    for _ in range(3):
        parsed=urllib.parse.urlsplit(url)
        if parsed.scheme!='https' or parsed.hostname not in ALLOWED or parsed.username or parsed.password:raise ValueError('URL outside explicit source allowlist')
        try:
            with OPENER.open(urllib.request.Request(url,headers={'User-Agent':'HK-School-Guide/0.2 source-inspection'}),timeout=30) as response:
                raw=response.read(10_000_001)
                if len(raw)>10_000_000:raise ValueError('File exceeds 10 MB')
                return raw,url
        except urllib.error.HTTPError as error:
            if error.code not in (301,302,303,307,308):raise
            url=urllib.parse.urljoin(url,error.headers['Location'])
    raise ValueError('Too many redirects')
results=[]
for source in REPORT['sources']:
    if source['source_id']=='edb-school-directory':continue
    try:
        resources=[r for r in source.get('resources',[]) if r.get('format','').lower()=='csv' and 'Traditional Chinese' in r.get('name','')]
        if not resources:raise ValueError('No explicitly named Traditional Chinese CSV in catalogue')
        selected=max(resources,key=lambda r:tuple(int(y) for y in re.findall(r'20\d{2}',r['name'])))
        url=selected['url']
        if url.startswith('http://www.edb.gov.hk/'):url='https://'+url[len('http://'):]
        raw,final_url=read(url);text=raw.decode('utf-8-sig',errors='strict')
        if text.lstrip().startswith('<'):raise ValueError('HTML response is not a delimited resource')
        delimiter='^' if source['source_id']=='edb-kg-profiles' else ','
        reader=csv.DictReader(io.StringIO(text),delimiter=delimiter);rows=list(reader)
        if len(reader.fieldnames or [])<20 or any(None in row or any(v is None for v in row.values()) for row in rows):raise ValueError('Unexpected source width or uneven records')
        digest=hashlib.sha256(raw).hexdigest();destination=ROOT/'archive'/source['source_id']/digest;destination.mkdir(parents=True,exist_ok=True);(destination/'raw.csv').write_bytes(raw)
        record={'source_id':source['source_id'],'status':'RAW_INSPECTED_NOT_MAPPED','catalogue_label':selected['name'],'catalogue_url':selected['url'],'fetched_url':final_url,'sha256':digest,'bytes':len(raw),'delimiter':delimiter,'row_count':len(rows),'headers':reader.fieldnames,'duplicate_headers':{k:n for k,n in collections.Counter(reader.fieldnames).items() if n>1},'sample':rows[:1],'fetched_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'limitations':'Latest named CSV in this fetched catalogue is not asserted latest website edition. No admission-year inference or automatic identity approval.'}
        (destination/'metadata.json').write_text(json.dumps(record,ensure_ascii=False,indent=2));results.append(record)
    except Exception as error:results.append({'source_id':source['source_id'],'status':'BLOCKED','reason':str(error)})
(ROOT/'artifacts/annual-source-contracts.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
for record in results:
    print(json.dumps({k:v for k,v in record.items() if k not in ('sample','headers')},ensure_ascii=False))
