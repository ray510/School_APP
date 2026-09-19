"""Validate published rows and cells independently from the catalog builder, using archived raw sources."""
import pathlib,json,hashlib,csv,io,collections,zipfile
R=pathlib.Path(__file__).resolve().parents[1];D=R/'apps/web/dist-production'
m=json.loads((D/'catalog-manifest.json').read_text());data=D/'data'/m['data_id'];index=json.loads((data/'index.json').read_text());assert len(index)==m['stats']['display_groups']
assert len({r['id'] for r in index})==len(index)
actual=collections.defaultdict(dict)
for entry in index:
 r=json.loads((data/'schools'/(entry['id']+'.json')).read_text());assert r['id']==entry['id'];assert r['directory'] or r['annual'];assert entry['directory_rows']==len(r['directory']);assert entry['annual_rows']==len(r['annual'])
 for row in r['directory']:
  s='edb-school-directory';assert row['row'] not in actual[s];actual[s][row['row']]=row['fields']
 for row in r['annual']:
  s=row['source_id'];assert row['row'] not in actual[s];actual[s][row['row']]=row['fields']
for source in m['sources']:
 raw=(R/'archive'/source['id']/source['sha256']/'raw.csv').read_bytes();assert hashlib.sha256(raw).hexdigest()==source['sha256'];reader=csv.DictReader(io.StringIO(raw.decode('utf-8-sig')),delimiter='^' if source['id']=='edb-kg-profiles' else ',');rows=list(reader)
 assert source['rows']==source['published_rows']==len(rows)==len(actual[source['id']]);assert source['columns']==len(reader.fieldnames);assert source['excluded_rows']==0
 for n,row in enumerate(rows,1):assert actual[source['id']][n]==row
assert len(json.loads((data/'events.json').read_text()))==m['event_count'];assert m['synthetic_records']==0 and m['sample_limit'] is None
with zipfile.ZipFile(D/'downloads/school-data.zip') as z:assert z.testzip() is None;assert json.loads(z.read('manifest.json'))['data_id']==m['data_id']
files=[p for p in D.rglob('*') if p.is_file()];assert len(files)<20000;assert max(p.stat().st_size for p in files)<25*1024*1024
print(json.dumps({'status':'PASS','full_rows_and_cells':sum(len(r) for r in actual.values()),'sources':len(actual),'files':len(files),'synthetic':0,'excluded':0}))
