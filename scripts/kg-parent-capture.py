"""Capture public KG fee certificates and reviewed school-page candidates.
No forms, login, private data, model calls, redirects to unrelated hosts or disabled TLS.
All current KG profile rows remain covered even when a document is unavailable.
"""
import pathlib,json,hashlib,urllib.request,urllib.parse,urllib.error,concurrent.futures,time,datetime,subprocess,threading
from html.parser import HTMLParser
ROOT=pathlib.Path('captured-parent');ROOT.mkdir(exist_ok=True)
BASE=pathlib.Path('base/apps/web/dist-production');m=json.loads((BASE/'catalog-manifest.json').read_text());data=BASE/'data'/m['data_id']
class Text(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.parts=[];self.skip=0
 def handle_starttag(self,t,a):
  if t in ('script','style'):self.skip+=1
  if t in ('p','div','br','li','tr','td','h1','h2','h3','h4'):self.parts.append('\n')
 def handle_endtag(self,t):
  if t in ('script','style'):self.skip=max(0,self.skip-1)
 def handle_data(self,s):
  if not self.skip:self.parts.append(s)
class Redirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  old=urllib.parse.urlparse(req.full_url);new=urllib.parse.urlparse(newurl)
  if new.scheme!='https' or old.hostname!=new.hostname:raise ValueError('Unapproved redirect')
  return super().redirect_request(req,fp,code,msg,headers,newurl)
tasks={};profiles=[]
for f in sorted((data/'schools').glob('*.json')):
 s=json.loads(f.read_text())
 if s['level']!='KG':continue
 for a in s['annual']:
  code=a['fields'].get('學校編號','');url=a['fields'].get('收費證明書','');u=urllib.parse.urlparse(url)
  profiles.append({'row':a['row'],'record_sha256':a['record_sha256'],'code':code,'url':url})
  if u.hostname=='applications.edb.gov.hk' and u.path.startswith('/schoolsearch/schoolfee/') and u.path.endswith('.pdf'):
   tasks['fee-'+code]={'id':'fee-'+code,'url':urllib.parse.urlunparse(u._replace(scheme='https')),'role':'fee_certificate','school_number':code}
# Exact publicly referenced pages; this is explicitly a first-phase supplement, not full school-site coverage.
for key,url in [
 ('edb-k1','https://www.edb.gov.hk/tc/edu-system/preprimary-kindergarten/kindergarten-k1-admission-arrangements/2728_admission_arrangements.html'),
 ('ssckg-admission','https://www.ssckg.edu.hk/school-notice/'),
 ('hoching-hours','https://www.hochingkg.edu.hk/'),
 ('tpmk-arrangements','https://tpmk.edu.hk/zh-hant/入學資訊/'),
 ('ymcafr-hours','https://www.ymcahk.org.hk/cnsfr/tc/joyful_learning/timetables/index.html'),
 ('waichow-admission','https://www.sswckge.edu.hk/新生入學/新生報名資料-2/'),
 ('waichow-hours','https://www.sswckge.edu.hk/校園資訊/上課時間/'),
 ('rhenish-home','https://sskg.ppe.rhenish.org/'),
 ('ymca-admission','https://www.sscymca.edu.hk/?page_id=721')]:tasks[key]={'id':key,'url':url,'role':'public_school_page'}
if len(profiles)!=962 or len(tasks)>1100:raise ValueError('Unexpected source scope; review before capture')
lock=threading.Lock();total=0;start=time.monotonic()
def capture(t):
 global total
 out={**t,'status':'FAILED','captured_at':None}
 if time.monotonic()-start>720:return {**out,'reason':'CAPTURE_TIME_BUDGET'}
 url=urllib.parse.quote(t['url'],safe=':/?&=%');req=urllib.request.Request(url,headers={'User-Agent':'HK-School-Guide-Public-Evidence/1.0'})
 try:
  time.sleep(.3)
  with urllib.request.build_opener(Redirect()).open(req,timeout=12) as r:
   raw=r.read(3000001);ctype=r.headers.get('content-type','')
  if len(raw)>3000000:raise ValueError('DOCUMENT_SIZE_LIMIT')
  with lock:
   total+=len(raw)
   if total>300000000:raise ValueError('CAPTURE_BYTE_BUDGET')
  pdf=t['role']=='fee_certificate'
  if pdf and not raw.startswith(b'%PDF'):raise ValueError('NOT_PDF')
  path=ROOT/(t['id']+('.pdf' if pdf else '.html'));path.write_bytes(raw)
  if pdf:
   subprocess.run(['pdftotext','-layout',str(path),str(ROOT/(t['id']+'.txt'))],check=True,capture_output=True,timeout=15)
   text=(ROOT/(t['id']+'.txt')).read_text(encoding='utf8')
  else:
   p=Text();p.feed(raw.decode('utf-8-sig',errors='strict'));text='\n'.join(x.strip() for x in ''.join(p.parts).splitlines() if x.strip());(ROOT/(t['id']+'.txt')).write_text(text,encoding='utf8')
  out.update(status='CAPTURED',path=path.name,text_path=t['id']+'.txt',sha256=hashlib.sha256(raw).hexdigest(),text_sha256=hashlib.sha256(text.encode()).hexdigest(),bytes=len(raw),captured_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
 except Exception as e:out['reason']=type(e).__name__+': '+str(e)[:240]
 return out
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as p:results=list(p.map(capture,tasks.values()))
report={'schema':1,'base_data_id':m['data_id'],'profiles':profiles,'documents':results,'attempted':len(results),'captured':sum(x['status']=='CAPTURED' for x in results),'bytes':total,'verification':'RAW_CAPTURE_NOT_FACT_PUBLICATION','finished_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(ROOT/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k not in ('profiles','documents')},ensure_ascii=False))
