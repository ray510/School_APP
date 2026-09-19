"""Restore immutable data only; never copy old application JS into a new release."""
import pathlib,shutil,json,hashlib,zipfile
root=pathlib.Path('.');source=root/'base/apps/web/dist-production';dest=root/'apps/web/dist-production';out=root/'artifacts/production';out.mkdir(parents=True,exist_ok=True)
if not (dest/'full.html').is_file():raise ValueError('New application build required')
(dest/'full.html').rename(dest/'index.html')
excluded={'assets','index.html','full.html','build-info.json','_headers'};hashes={}
for f in source.rglob('*'):
 if not f.is_file():continue
 relative=f.relative_to(source)
 if relative.parts[0] in excluded:continue
 target=dest/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,target);hashes[str(relative)]=hashlib.sha256(f.read_bytes()).hexdigest()
for folder in ['production','analytics','sitewide','official-eight']:
 src=root/'base/artifacts'/folder
 if src.exists():shutil.copytree(src,root/'artifacts'/folder,dirs_exist_ok=True)
# Reconstruct exact same base release archive from published download, preserving its metadata.
m=json.loads((dest/'catalog-manifest.json').read_text());basearchive=out/('school-data-'+m['data_id'][:16]+'.zip');shutil.copy2(dest/'downloads/school-data.zip',basearchive)
with zipfile.ZipFile(basearchive) as z:
 for source_info in m['sources']:
  raw=z.read('raw/'+source_info['id']+'.csv')
  if hashlib.sha256(raw).hexdigest()!=source_info['sha256']:raise ValueError('Base raw source digest mismatch')
  path=root/'archive'/source_info['id']/source_info['sha256']/'raw.csv';path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw)
r=json.loads((out/'release.json').read_text());assert r['data_id']==m['data_id'];assert hashlib.sha256(basearchive.read_bytes()).hexdigest()==r['zip_sha256']
(root/'artifacts/kg-parent').mkdir(exist_ok=True);(root/'artifacts/kg-parent/base-hashes.json').write_text(json.dumps(hashes));print('IMMUTABLE_BASE_RESTORED',len(hashes))
