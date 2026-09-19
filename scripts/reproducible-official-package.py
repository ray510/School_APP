"""Reproducible ZIP headers and captured-source dates, independent of build time."""
import pathlib,json,zipfile,hashlib,os
R=pathlib.Path(__file__).resolve().parents[1];D=R/'apps/web/dist-production';P=D/'official-manifest.json'
m=json.loads(P.read_text(encoding='utf8'));m['generated_at']=max(r['evidence']['fetched_at'] for s in m['sources'] for r in s['resources'])
manifest={k:v for k,v in m.items() if k!='download_sha256'}
def text(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n'
def info(name):
 z=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));z.compress_type=zipfile.ZIP_DEFLATED;z.external_attr=0o100644<<16;return z
archive=D/'downloads/official-eight.zip';temp=archive.with_suffix('.repro.zip')
with zipfile.ZipFile(archive) as original,zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as target:
 for name in sorted(original.namelist()):target.writestr(info(name),text(manifest).encode() if name=='manifest.json' else original.read(name))
os.replace(temp,archive);m['download_sha256']=hashlib.sha256(archive.read_bytes()).hexdigest();P.write_text(text(m),encoding='utf8');(D/'official'/m['bundle_id']/'manifest.json').write_text(text(manifest),encoding='utf8')
rp=R/'artifacts/official-eight/build-report.json';r=json.loads(rp.read_text(encoding='utf8'));r.update(download_sha256=m['download_sha256'],download_bytes=archive.stat().st_size,archive_reproducibility='FIXED_ZIP_HEADERS_AND_CAPTURE_TIMESTAMP');rp.write_text(text(r),encoding='utf8')
print('Reproducible source ZIP',m['bundle_id'],m['download_sha256'])
