"""Reconcile an exact downloaded public artifact; no network, secrets or inference."""
import argparse,pathlib,json,hashlib
from .core import VERSION,ContractError,plan_resources,read_records,normalize,digest
from .pipeline import write,now,read
from .specs import SPECS

def convert(inp,out):
 if (out/'capture.json').exists():raise ContractError('Snapshot already exists')
 captured=read(inp/'capture.json');by_code={x['code']:x for x in captured}
 if len(by_code)!=8:raise ContractError('Need all eight raw captures')
 sources=[]
 for spec in SPECS:
  raw_catalog=(inp/(spec.code+'.json')).read_bytes();meta=by_code[spec.code]['metadata']
  if hashlib.sha256(raw_catalog).hexdigest()!=meta['sha256']:raise ContractError('Catalogue hash differs')
  package=json.loads(raw_catalog)['result'];plan,omitted=plan_resources(spec.code,package)
  entry={'code':spec.code,'dataset':spec.slug,'title':package['title'],'catalog_url':'https://data.gov.hk/tc-data/dataset/'+spec.slug,'dictionary_url':spec.dictionary,'warning':spec.warning,'metadata':meta,'resources':[],'not_selected':omitted,'state':'BLOCKED'}
  out.mkdir(parents=True,exist_ok=True);(out/(spec.code+'-catalogue.json')).write_bytes(raw_catalog)
  for r in plan:
   dest=dict(r)
   try:
    found=[x for x in by_code[spec.code]['resources'] if x['resource_id']==r['resource_id']]
    if len(found)!=1 or found[0]['state']!='FETCHED_NOT_VALIDATED':raise ContractError('Selected raw resource unavailable')
    ev=found[0]['evidence'];rp=(inp/ev['file']).resolve()
    if rp.parent!=(inp/'raw').resolve():raise ContractError('Unexpected raw path')
    raw=rp.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=ev['sha256']:raise ContractError('Raw hash differs')
    filename='raw/'+ev['sha256']+'.'+r['format'].lower();(out/'raw').mkdir(exist_ok=True);(out/filename).write_bytes(raw)
    dest.update(evidence=ev,path=filename,state='FETCHED')
    rows=read_records(raw,r);normal=[normalize(f,r,i,ev['sha256']) for i,f in enumerate(rows,1)]
    if any(n['raw']!=f for n,f in zip(normal,rows)) or len(rows)!=len(normal):raise ContractError('Raw rows changed')
    records='records/'+spec.code+'-'+digest(r['resource_id'])[:12]+'.json';write(out/records,normal)
    dest.update(state='VERIFIED',row_count=len(rows),field_names=sorted({k for f in rows for k in f}),records_path=records,records_sha256=digest(normal))
   except Exception as e:dest.update(state='BLOCKED',error=type(e).__name__+': '+str(e))
   entry['resources'].append(dest)
  entry['state']='VERIFIED' if all(x['state']=='VERIFIED' for x in entry['resources']) else 'BLOCKED';sources.append(entry)
  print(spec.code,[(r['role'],r['state'],r.get('row_count'),r.get('error')) for r in entry['resources']],flush=True)
 result={'schema':1,'contract_version':VERSION,'generated_at':now(),'sources':sources,'state':'VERIFIED' if all(s['state']=='VERIFIED' for s in sources) else 'BLOCKED','model_calls':0,'remote_writes':0,'scope':'Latest explicitly-labelled Traditional Chinese resource per role in captured official catalogue; all original records; no sampling.'}
 write(out/'capture.json',result);return result
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--input',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args();raise SystemExit(0 if convert(a.input,a.out)['state']=='VERIFIED' else 2)
