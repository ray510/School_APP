"""Real baseline plus pilot SQL in SQLite; no network and no provider claims."""
import hashlib,json,pathlib,sqlite3
R=pathlib.Path(__file__).resolve().parents[1]
m=json.loads((R/'artifacts/pilot/manifest.json').read_text());b=json.loads((R/'artifacts/test-site/manifest.json').read_text())
db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
for f in sorted((R/'migrations').glob('*.sql')):db.executescript(f.read_text())
for c in b['chunks']:db.executescript((R/'artifacts/test-site'/c['file']).read_text())
before=db.execute("SELECT channel,release_id,revision FROM release_heads ORDER BY channel").fetchall()
for repeat in range(2):
 for c in m['chunks']:
  raw=(R/'artifacts/pilot'/c['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==c['sha256'];db.executescript(raw.decode())
 assert db.execute('SELECT COUNT(*) FROM annual_profile_versions').fetchone()[0]==30
 assert db.execute('SELECT COUNT(*) FROM event_versions').fetchone()[0]==15
 assert db.execute('SELECT COUNT(*) FROM publication_commands').fetchone()[0]==10
 assert db.execute('SELECT COUNT(*) FROM audit_events').fetchone()[0]==10
 assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
 assert db.execute("SELECT channel,release_id,revision FROM release_heads WHERE channel LIKE 'profiles:%' ORDER BY channel").fetchall()==before
 assert all(r[0]==1 for r in db.execute('SELECT revision FROM release_heads'))
 for stream in m['manifests']:
  assert db.execute('SELECT release_id FROM release_heads WHERE channel=?',(stream['channel'],)).fetchone()[0]==stream['release_id']
print(json.dumps({'status':'PASS','kind':'SQLite—not remote D1','annual':30,'events':15,'commands':10,'audit':10,'replays':2,'baseline_unchanged':True}))
