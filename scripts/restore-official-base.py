"""Restore previously verified four-source/ten-topic bytes, never old application JS."""
import pathlib,json,hashlib,shutil
R=pathlib.Path(__file__).resolve().parents[1];old=R/'reused-base';D=R/'apps/web/dist-production';src=old/'apps/web/dist-production'
def read(p):return json.loads(p.read_text())
m=read(src/'catalog-manifest.json');im=read(src/'insights-manifest.json')
if m['data_id']!='64a7e4fc199f3d4f028c7d08523bff5f20a327af3fb8ebe34382f0d4c069be9f' or im['analysis_id']!='f899688be79afa733476823b6bfe156dc1ef9048d8c2ac336ea63270df5d5f60' or im['data_id']!=m['data_id']:raise ValueError('Wrong base data or JEV version')
if not (D/'full.html').exists():raise ValueError('Build new application first')
(D/'full.html').rename(D/'index.html')
for name in ['data','insights','downloads']:
 shutil.copytree(src/name,D/name,dirs_exist_ok=False)
for name in ['catalog-manifest.json','insights-manifest.json']:shutil.copy2(src/name,D/name)
shutil.copytree(old/'archive',R/'archive',dirs_exist_ok=True)
for part in ['analytics','sitewide']:
 shutil.copytree(old/'artifacts'/part,R/'artifacts'/part,dirs_exist_ok=True)
out=R/'artifacts/production';out.mkdir(parents=True,exist_ok=True)
for p in (old/'artifacts/production').iterdir():
 if p.name=='release.json' or p.suffix=='.zip':shutil.copy2(p,out/p.name)
count=0
for name in ['data','insights']:
 for p in (src/name).rglob('*'):
  if p.is_file():
   if hashlib.sha256(p.read_bytes()).digest()!=hashlib.sha256((D/p.relative_to(src)).read_bytes()).digest():raise ValueError('Base bytes changed')
   count+=1
(out/'eight-base-reuse.json').write_text(json.dumps({'state':'VERIFIED','run_id':35445377360,'artifact_id':10584769105,'data_id':m['data_id'],'analysis_id':im['analysis_id'],'verified_files':count,'new_model_calls':0},indent=2))
print('Base preserved:',count,'files; no model calls.')
