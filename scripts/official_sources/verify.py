"""Independent offline raw/shard/ZIP reconciliation before any publication."""
import argparse,csv,gzip,hashlib,io,json,pathlib,xml.etree.ElementTree as ET,zipfile
from collections import Counter
from .core import digest,canonical,normalize

def verify(dist):
 def read(p):return json.loads(p.read_text(encoding='utf8'))
 m=read(dist/'official-manifest.json');base=read(dist/'catalog-manifest.json')
 assert m['state']=='VERIFIED' and m['base_data_id']==base['data_id']
 assert {s['code'] for s in m['sources']}=={'A02','A06','A07','A08','A09','A10','A11','A12'}
 all_ids=set();counts=Counter();by_role=Counter();raw_files=[];detail_count=0;maxbytes=0
 for source in m['sources']:
  d=read(dist/'official'/m['bundle_id']/(source['code']+'.json'))
  assert d['bundle_id']==m['bundle_id'] and d['total_rows']==sum(r['row_count'] for r in source['resources'])
  for r in source['resources']:
   p=dist/r['download_url'].lstrip('/');raw=p.read_bytes();raw=gzip.decompress(raw) if r['download_encoding']=='gzip' else raw
   assert hashlib.sha256(raw).hexdigest()==r['evidence']['sha256'];raw_files.append((r['path'],r['evidence']['sha256']))
   if r['format']=='XML':
    xml=ET.fromstring(raw);original=[{c.tag.rsplit('}',1)[-1]:c.text or '' for c in row} for row in xml]
   else:
    utf16=raw.startswith((b'\xff\xfe',b'\xfe\xff'));original=list(csv.DictReader(io.StringIO(raw.decode('utf-16' if utf16 else 'utf-8-sig'),newline=''),delimiter='\t' if utf16 else ','))
   assert len(original)==r['row_count'];g=next(g for g in d['index_groups'] if g['resource_id']==r['resource_id']);seen=[]
   for url in g['urls']:
    part=read(dist/url.lstrip('/'));assert part['bundle_id']==m['bundle_id'];details={}
    for short in part['rows']:
     assert 'raw' not in short and short['detail_url'].startswith('/official/'+m['bundle_id']+'/details/')
     if short['detail_url'] not in details:
      full=read(dist/short['detail_url'].lstrip('/'));assert full['bundle_id']==m['bundle_id'];details[short['detail_url']]={x['id']:x for x in full['rows']}
     row=details[short['detail_url']][short['id']];assert row['raw']==original[row['row']-1]
     assert row['record_sha256']==digest(row['raw']) and row['resource_sha256']==r['evidence']['sha256']
     assert row['normalized']==normalize(row['raw'],r,row['row'],r['evidence']['sha256'])['normalized']
     assert {k:v for k,v in short.items() if k!='detail_url'}=={k:v for k,v in row.items() if k!='raw'}
     assert row['id'] not in all_ids;all_ids.add(row['id']);seen.append(row['row']);counts[row['code']]+=1;by_role[row['role']]+=1;detail_count+=1
   assert sorted(seen)==list(range(1,len(original)+1))
 assert detail_count==m['stats']['source_records'] and dict(counts)==m['stats']['by_source'] and dict(by_role)==m['stats']['by_role']
 archive=dist/'downloads/official-eight.zip';assert hashlib.sha256(archive.read_bytes()).hexdigest()==m['download_sha256']
 with zipfile.ZipFile(archive) as z:
  for path,sha in raw_files:assert hashlib.sha256(z.read(path)).hexdigest()==sha
  archived=json.loads(z.read('all-records.json'));assert len(archived)==detail_count and {r['id'] for r in archived}==all_ids
 maxbytes=max(p.stat().st_size for p in (dist/'official'/m['bundle_id']).rglob('*') if p.is_file())
 assert maxbytes<24*1024*1024 and archive.stat().st_size<24*1024*1024
 report={'status':'PASS','bundle_id':m['bundle_id'],'base_data_id':m['base_data_id'],'source_records':detail_count,'by_source':dict(counts),'by_role':dict(by_role),'raw_resources':len(raw_files),'excluded_rows':0,'synthetic_records':0,'max_asset_bytes':maxbytes,'download_sha256':m['download_sha256']}
 print(canonical(report));return report
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--dist',type=pathlib.Path,default=pathlib.Path('apps/web/dist-production'));p.add_argument('--report',type=pathlib.Path,default=pathlib.Path('artifacts/official-eight/verification.json'));a=p.parse_args();r=verify(a.dist);a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8')
