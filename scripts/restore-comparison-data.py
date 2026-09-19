"""Reuse a pinned, actually inferred dataset. Rebuild only UI; make zero model calls.
Read-only toward source archives. Run from repository root after downloading the
explicit artifact ID into reused/. Do not select an artifact by duplicate name.
"""
import pathlib,sys,json,hashlib,shutil,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
OLD=ROOT/'reused/apps/web/dist-production';NEW=ROOT/'apps/web/dist-production';OUT=ROOT/'artifacts/production'
DATA='64a7e4fc199f3d4f028c7d08523bff5f20a327af3fb8ebe34382f0d4c069be9f'
ZIP_SHA='da527c1095bac9715062695050a670eb91e745d16c9aec079efa319afacad4d1'
def read(p):return json.loads(p.read_text(encoding='utf8'))
def sha(b):return hashlib.sha256(b).hexdigest()
def stable(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def require(condition,message):
 if not condition:raise ValueError(message)
m=read(OLD/'catalog-manifest.json');require(m['data_id']==DATA,'Unexpected inference data version')
require(m['environment']=='production' and m['synthetic_records']==0 and m['sample_limit'] is None,'Not full production source data')
bundle=(OLD/'downloads/school-data.zip').read_bytes();require(sha(bundle)==ZIP_SHA,'Pinned inference archive hash mismatch')
with zipfile.ZipFile(OLD/'downloads/school-data.zip') as z:
 require(z.testzip() is None,'Damaged archive');subject=json.loads(z.read('catalog.json'))
 require(sha(stable(subject))==DATA,'Data ID does not match actual full catalog content')
 require(json.loads(z.read('manifest.json'))==m,'Manifest differs from immutable archive')
 require(subject['analytics']['provider']=='typesafe','Dataset has no actual TypeSafe results')
 require(subject['analytics']['status_counts'].get('ANALYZED',0)>0,'Inference absent')
folder=OLD/'data'/DATA
require(read(folder/'analytics.json')==subject['analytics'],'Analysis differs from archived source')
require(read(folder/'events.json')==subject['events'],'Events changed')
for record in subject['records']:require(read(folder/'schools'/(record['id']+'.json'))==record,'School differs from archive: '+record['id'])
require((NEW/'full.html').is_file(),'New UI build is required before attaching data')
NEW.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
for relative in ['data/'+DATA,'downloads']:
 target=NEW/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copytree(OLD/relative,target,dirs_exist_ok=True)
shutil.copy2(OLD/'catalog-manifest.json',NEW/'catalog-manifest.json')
shutil.copytree(ROOT/'reused/archive',ROOT/'archive',dirs_exist_ok=True)
shutil.copytree(ROOT/'reused/artifacts/analytics',ROOT/'artifacts/analytics',dirs_exist_ok=True)
release=read(ROOT/'reused/artifacts/production/release.json')
require(release['data_id']==DATA and release['zip_sha256']==ZIP_SHA and release['zip']=='school-data-'+DATA[:16]+'.zip','Release provenance mismatch')
shutil.copy2(ROOT/'reused/artifacts/production/release.json',OUT/'release.json')
(OUT/release['zip']).write_bytes(bundle)
(NEW/'full.html').rename(NEW/'index.html')
# Prove no data bytes changed when adding this comparison UI.
count=0
for p in folder.rglob('*'):
 if p.is_file():require(sha(p.read_bytes())==sha((NEW/'data'/DATA/p.relative_to(folder)).read_bytes()),'Reused data bytes changed');count+=1
report={'status':'PASS','reuse_run_id':35434941445,'reuse_attempt':2,'reuse_artifact_id':10581563399,'data_id':DATA,'zip_sha256':ZIP_SHA,'verified_data_files':count,'provider':'typesafe','model_calls_this_release':0,'mode':'UI_ONLY_REUSE_ACTUAL_JEV_RESULTS'}
(OUT/'comparison-data-reuse.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))
