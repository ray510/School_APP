"""Fetch only the four explicitly reviewed public admissions sources. Never infer dates."""
import hashlib, html, json, pathlib, re, subprocess, urllib.request, urllib.parse
from datetime import datetime, timezone
from html.parser import HTMLParser
ROOT = pathlib.Path(__file__).resolve().parents[1]
class Text(HTMLParser):
    def __init__(self): super().__init__(); self.parts=[]; self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'): self.skip+=1
    def handle_endtag(self,tag):
        if tag in ('script','style'): self.skip=max(0,self.skip-1)
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)
def normalize(s):return re.sub(r'\s+', '', html.unescape(s))
for source in json.loads((ROOT/'data/pilot/admission-sources.json').read_text()):
    parsed=urllib.parse.urlparse(source['url'])
    if parsed.scheme!='https' or parsed.hostname not in ('www.edb.gov.hk','www.aogkg.edu.hk'):raise ValueError('Unexpected source origin')
    with urllib.request.urlopen(urllib.request.Request(source['url'],headers={'User-Agent':'HK-School-Guide/0.3 source evidence'}),timeout=35) as response:
        if urllib.parse.urlparse(response.url).hostname!=parsed.hostname:raise ValueError('Cross-host redirect rejected')
        raw=response.read(5_000_001)
        if len(raw)>5_000_000:raise ValueError('Source byte limit')
    digest=hashlib.sha256(raw).hexdigest();directory=ROOT/'archive/pilot-events'/source['id']/digest;directory.mkdir(parents=True,exist_ok=True)
    path=directory/('raw.pdf' if source['format']=='pdf' else 'raw.html');path.write_bytes(raw)
    if source['format']=='pdf':
        if not raw.startswith(b'%PDF'):raise ValueError('PDF expected')
        text=subprocess.check_output(['pdftotext','-layout',str(path),'-'],timeout=15).decode('utf-8')
    else:
        parser=Text();parser.feed(raw.decode('utf-8-sig'));text=' '.join(parser.parts)
    plain=normalize(text);missing=[s for s in source['expected'] if normalize(s) not in plain]
    if missing:raise ValueError(source['id']+': reviewed date/year anchors missing: '+repr(missing))
    (directory/'text.txt').write_text(text)
    metadata={**source,'raw_sha256':digest,'fetched_at':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'reviewer':'assistant-source-review/2026-09-19','human_review':False,'validation':'reviewed anchors present; not a substitute for continued source review'}
    (directory/'metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
    (ROOT/'artifacts/pilot').mkdir(parents=True,exist_ok=True)
    (ROOT/'artifacts/pilot'/ (source['id']+'.json')).write_text(json.dumps({**metadata,'raw_path':str(path.relative_to(ROOT))},ensure_ascii=False,indent=2))
    print(json.dumps({'source':source['id'],'sha256':digest,'status':'CAPTURED_REVIEWED_ANCHORS'},ensure_ascii=False))
