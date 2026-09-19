"""Reuse actual completed inference only when every public input remains byte-identical.
The original run paid for the model calls; this recovery step performs none.
"""
import pathlib,json,hashlib,shutil,collections
root=pathlib.Path('.');old=root/'reused-kg/artifacts/kg-parent';out=root/'artifacts/kg-parent'
def digest(raw):return hashlib.sha256(raw).hexdigest()
expected={'prepared.json':'aef38b8a6d8c77646fcc202c13525cf472bdbc6ea133eebcd24c1fc735792b75','inference.json':'61d0a23ccd0aa7c0c6d1fa71e3f3d6bb78661c884a1f92ff36f6172b2df0d8bb'}
for name,sha in expected.items():
 if digest((old/name).read_bytes())!=sha:raise ValueError('Pinned inference artifact digest mismatch: '+name)
if (out/'prepared.json').read_bytes()!=(old/'prepared.json').read_bytes():raise ValueError('Public inputs changed; run fresh inference explicitly instead of reusing')
p=json.loads((out/'prepared.json').read_text());r=json.loads((old/'inference.json').read_text())
if p['policy']!=r['policy'] or r['policy']!='kg-parent-evidence-v1' or r['provider']!='typesafe' or r['model']!='jev-1.13.0' or r['canary']!='PASS_TRANSPORT_NOT_ACCURACY':raise ValueError('Inference contract differs')
profiles={s['id']:s['profile'] for s in p['records'] if s['profile']}
if len(r['results'])!=len(profiles) or {x['id'] for x in r['results']}!=set(profiles):raise ValueError('Inference coverage differs')
for result in r['results']:
 profile=profiles[result['id']]
 if result['profile_hash']!=profile['record_sha256']:raise ValueError('Wrong profile hash')
 for decision in result['selections'].values():
  e=decision.get('evidence')
  if e and (profile['fields'].get(e['field'])!=e['text'] or e['record_sha256']!=profile['record_sha256']):raise ValueError('Source quote mismatch')
counts=dict(collections.Counter(x['status'] for x in r['results']))
if counts!=r['status_counts'] or counts.get('ANALYZED',0)<len(profiles)*.95:raise ValueError('Inference validity gate failed')
shutil.copy2(old/'inference.json',out/'inference.json')
proof={'status':'VERIFIED_EXACT_INPUT_REUSE','original_run':35454325243,'original_artifact':10587409572,'original_commit':'10a38b87ae120c602964b9cefab4b6d2c8bafa18','original_inference_sha256':expected['inference.json'],'prepared_sha256':expected['prepared.json'],'new_model_calls_this_step':0,'original_usage':r['usage'],'scope':'Reuse existing actual inference, not a new model execution; original errors retained'}
(out/'inference-reuse.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2));print(json.dumps(proof,ensure_ascii=False))
