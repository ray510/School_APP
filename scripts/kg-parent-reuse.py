"""Reuse completed source selections only while every selected profile quote is unchanged.
Other public context is not re-analysed and the proof records that no new model call occurred.
"""
import pathlib,json,hashlib,collections
from kg_parent.build import reuse_profile_results
root=pathlib.Path('.');old=root/'reused-kg/artifacts/kg-parent';out=root/'artifacts/kg-parent'
def digest(raw):return hashlib.sha256(raw).hexdigest()
expected={'prepared.json':'aef38b8a6d8c77646fcc202c13525cf472bdbc6ea133eebcd24c1fc735792b75','inference.json':'61d0a23ccd0aa7c0c6d1fa71e3f3d6bb78661c884a1f92ff36f6172b2df0d8bb'}
for name,sha in expected.items():
 if digest((old/name).read_bytes())!=sha:raise ValueError('Pinned inference artifact digest mismatch: '+name)
p=json.loads((out/'prepared.json').read_text(encoding='utf8'));r=json.loads((old/'inference.json').read_text(encoding='utf8'))
if p['policy']!=r['policy'] or r['policy']!='kg-parent-evidence-v1' or r['provider']!='typesafe' or r['model']!='jev-1.13.0' or r['canary']!='PASS_TRANSPORT_NOT_ACCURACY':raise ValueError('Inference contract differs')
r={**r,'results':reuse_profile_results(p,r['results'])}
counts=dict(collections.Counter(x['status'] for x in r['results']))
if counts!=r['status_counts'] or counts.get('ANALYZED',0)<len(r['results'])*.95:raise ValueError('Inference validity gate failed')
(out/'inference.json').write_text(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n',encoding='utf8')
proof={'status':'VERIFIED_SOURCE_EXACT_SELECTION_REUSE','original_run':35454325243,'original_artifact':10587409572,'original_commit':'10a38b87ae120c602964b9cefab4b6d2c8bafa18','original_inference_sha256':expected['inference.json'],'original_prepared_sha256':expected['prepared.json'],'current_prepared_sha256':digest((out/'prepared.json').read_bytes()),'reused_profile_count':len(r['results']),'new_model_calls_this_step':0,'original_usage':r['usage'],'scope':'Existing selections remapped only where the exact annual-profile record hash and selected quote still match; changed fee and school-source context was not re-analysed'}
(out/'inference-reuse.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(proof,ensure_ascii=False))
