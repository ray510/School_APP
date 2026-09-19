"""Public reproducibility bundle; contains only official data and model evidence, never secrets."""
import pathlib,json,zipfile,hashlib,shutil
ROOT=pathlib.Path(__file__).resolve().parents[1];dist=ROOT/'apps/web/dist-production'
def read(p):return json.loads(p.read_text(encoding='utf8'))
m=read(dist/'catalog-manifest.json');a=read(dist/'insights-manifest.json')
if a['data_id']!=m['data_id']:raise ValueError('Insights/source identity mismatch')
raw_dir=dist/'downloads/sources';raw_dir.mkdir(parents=True,exist_ok=True)
for s in m['sources']:
 raw=ROOT/'archive'/s['id']/s['sha256']/'raw.csv';b=raw.read_bytes()
 if hashlib.sha256(b).hexdigest()!=s['sha256']:raise ValueError('Source archive hash mismatch')
 (raw_dir/(s['id']+'.csv')).write_bytes(b)
folder=dist/'insights'/a['analysis_id'];out=ROOT/'artifacts/sitewide';out.mkdir(parents=True,exist_ok=True)
path=out/('school-insights-'+a['analysis_id'][:16]+'.zip')
with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 z.writestr('original-source-manifest.json',json.dumps(m,ensure_ascii=False))
 z.write(out/'inference.json','inference.json');z.write(out/'verification.json','verification.json')
 for p in sorted(folder.rglob('*.json')):z.write(p,'insights/'+str(p.relative_to(folder)))
 z.writestr('README.txt','Source record based JEV evidence. No rankings. Historical editions retained. Not human-calibrated. Original full data remains separately archived.\n')
b=path.read_bytes()
if len(b)>24*1024*1024:raise ValueError('Analysis download exceeds safe static-asset limit')
shutil.copy2(path,dist/'downloads/school-analysis.zip')
meta={'analysis_id':a['analysis_id'],'data_id':m['data_id'],'zip':path.name,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
(out/'release.json').write_text(json.dumps(meta,indent=2))
(dist/'downloads/analysis-checksums.json').write_text(json.dumps(meta,indent=2))
print(json.dumps({'status':'PASS',**meta}))
