import sys,pathlib,unittest,copy,json
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'scripts'))
from school_classification import classify, row_dimensions
from jev_analysis import provider_config, choice, decode, excerpts, CallError
SIDS=['edb-school-directory','edb-kg-profiles','chsc-primary-profiles','chsc-secondary-profiles']
SOURCES={s:{'id':s,'edition':'fixture version','sha256':'a'*64,'url':'https://example.invalid'} for s in SIDS}
def row(fields,sid=None):return {'row':1,'fields':fields,'record_sha256':'b'*64,**({'source_id':sid} if sid else {})}
def item(level,directory=None,annual=None):return {'name':'名稱不是分類證據','level':level,'directory':directory or [],'annual':annual or []}
class Classification(unittest.TestCase):
 def test_kg_dimensions_never_conflated(self):
  obj=item('KG',[row({'資助種類':'私立'})],[row({'學校類別':'非牟利','參加幼稚園教育計劃':'有參加'},SIDS[1])]);before=copy.deepcopy(obj);r=classify(obj,SOURCES)
  self.assertEqual(r['funding_type']['value'],'PRIVATE');self.assertEqual(r['kg_operator_type']['value'],'NON_PROFIT');self.assertEqual(r['kg_scheme_participation']['value'],'PARTICIPATING');self.assertEqual(obj,before)
 def test_primary_aided_not_private(self):
  r=classify(item('PRIMARY',[row({'資助種類':'資助'})]),SOURCES);self.assertEqual(r['funding_type']['value'],'AIDED');self.assertEqual(r['kg_operator_type']['state'],'not_applicable')
 def test_unknown_does_not_default(self):
  r=classify(item('KG'),SOURCES);self.assertIsNone(r['funding_type']['value']);self.assertEqual(r['kg_scheme_participation']['state'],'not_provided')
 def test_unrecognized_retained(self):
  r=classify(item('PRIMARY',[row({'資助種類':'未來新類別'})]),SOURCES);self.assertEqual(r['funding_type']['state'],'unrecognized');self.assertEqual(r['funding_type']['evidence'][0]['raw_value'],'未來新類別')
 def test_directory_conflict_not_last_write(self):
  r=classify(item('PRIMARY',[row({'資助種類':'官立'}),row({'資助種類':'私立'})]),SOURCES);self.assertEqual(r['funding_type']['state'],'conflict');self.assertIsNone(r['funding_type']['value'])
 def test_older_annual_does_not_override(self):
  r=classify(item('PRIMARY',[row({'資助種類':'官立'})],[row({'學校類別1':'私立'},SIDS[2])]),SOURCES);self.assertEqual(r['funding_type']['value'],'GOVERNMENT');self.assertEqual(len(r['funding_type']['historical_differences']),1)
 def test_primary_session_not_funding(self):
  r=row_dimensions(SOURCES[SIDS[2]],row({'學校類別1':'直資','學校類別2':'全日'}),'PRIMARY');self.assertEqual(r['funding_type']['value'],'DSS')
 def test_kg_scheme_pending_explicit(self):
  r=row_dimensions(SOURCES[SIDS[1]],row({'學校類別':'私立獨立','參加幼稚園教育計劃':'申請審核中'}),'KG');self.assertEqual(r['kg_scheme_participation']['value'],'PENDING');self.assertIsNone(r['funding_type']['value'])
class JevContracts(unittest.TestCase):
 def test_no_credential_fallback_to_deploy_token(self):self.assertIsNone(provider_config({'CLOUDFLARE_API_TOKEN':'deployment-only','CLOUDFLARE_ACCOUNT_ID':'a'*32}))
 def test_provider_selection(self):self.assertEqual(provider_config({'OPENROUTER_API_KEY':'fixture-key'})['provider'],'openrouter')
 def test_cloudflare_price_required(self):
  with self.assertRaises(ValueError):provider_config({'JEV_CLOUDFLARE_API_TOKEN':'fixture','CLOUDFLARE_ACCOUNT_ID':'a'*32})
 def test_invalid_response_not_uncertainty(self):
  with self.assertRaises(CallError):choice({'type':'choice','choice':'A','probabilities':{'A':1},'confidence':1},['A','B'])
 def test_evidence_is_exact_substring(self):
  fields={'對學生支援':'本校課後有功課輔導。'};xs,tr=excerpts(fields);self.assertFalse(tr)
  for x in xs:self.assertEqual(fields[x['field']][x['start']:x['end']],x['text'])
 def test_absence_is_not_missing(self):
  from jev_analysis import VERDICTS
  self.assertNotEqual(VERDICTS['EXPLICITLY_ABSENT'],VERDICTS['NOT_STATED'])
 def test_fabricated_evidence_rejected(self):
  from jev_analysis import VERDICTS
  a={'type':'choice','choice':'MENTIONED','confidence':1,'probabilities':{k:1 if k=='MENTIONED' else 0 for k in VERDICTS}}
  b={'type':'choice','choice':'E0','confidence':1,'probabilities':{'E0':1,'NONE':0}}
  with self.assertRaises(CallError):decode({'answers':{'home_school':a,'home_school_evidence':b}},[{'id':'E0','field':'x','start':0,'end':2,'text':'假字'}],{'x':'原文'},['home_school'])
if __name__=='__main__':unittest.main()
