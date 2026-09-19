"""Synthetic contract fixtures, not assertions about real schools or live datasets."""
import copy, datetime as dt, json, pathlib, tempfile, unittest
from scripts.official_sources.core import *
from scripts.official_sources.specs import SPECS, SPEC_BY_CODE
from scripts.official_sources.pipeline import checked_url, build

def resource(code_,role,title='2025/26 資料 (繁體中文)',fmt='CSV'):
 return {'code':code_,'role':role,'name':title,'resource_id':'test-'+role,'format':fmt}
def row(code_,role,fields,title='2025/26 資料 (繁體中文)'):
 return normalize(fields,resource(code_,role,title),1,'a'*64)
def school(name='例子學校',num='123456',loc='0001',level='KG',address='例子一號',district_='北區'):
 return {'id':'example_'+loc,'name':name,'address':address,'district':district_,'level':level,'directory':[{'fields':{'SCHOOL NO.':num+loc+'13'}}],'annual':[]}

class Decoding(unittest.TestCase):
 def test_quoted_empty(self):self.assertEqual(len(read_records(b'a,b\n1,""\n2,x\n',resource('A06','scheme'))),2)
 def test_multiline(self):self.assertEqual(read_records(b'a,b\n1,"x\ny"\n',resource('A06','scheme'))[0]['b'],'x\ny')
 def test_duplicates_rejected(self):
  with self.assertRaises(ContractError):read_records(b'a,a\n1,2\n',resource('A06','scheme'))
 def test_ragged_rejected(self):
  with self.assertRaises(ContractError):read_records(b'a,b\n1\n',resource('A06','scheme'))
 def test_html_rejected(self):
  with self.assertRaises(ContractError):read_records(b'<!doctype html><html/>',resource('A06','scheme'))
 def test_encoding_not_guessed(self):
  with self.assertRaises(UnicodeDecodeError):read_records('a\n中文'.encode('big5'),resource('A06','scheme'))
 def test_explicit_big5(self):self.assertEqual(read_records('a\n中文'.encode('big5'),{**resource('A06','scheme'),'encoding':'big5hkscs'})[0]['a'],'中文')
 def test_xml_namespace(self):
  raw=b'<r xmlns="urn:x"><s><SchoolNumber>123456</SchoolNumber><LocationID>0001</LocationID><SchoolNameChi>test</SchoolNameChi><RegistrationStatusChi>registered</RegistrationStatusChi></s></r>'
  self.assertEqual(read_records(raw,resource('A02','registration',fmt='XML'))[0]['LocationID'],'0001')
 def test_xml_entities_rejected(self):
  with self.assertRaises(ContractError):read_records(b'<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x/>',resource('A02','registration',fmt='XML'))
 def test_xml_unknown_shape_blocked(self):
  with self.assertRaises(ContractError):read_records(b'<records><item><id>1</id></item></records>',resource('A02','registration',fmt='XML'))

class Temporal(unittest.TestCase):
 def test_two_years_kept_separate(self):self.assertEqual(years('參加2026/27 K1而於2025/26學年非計劃','A07'),{'reference_year':2025,'admission_year':2026})
 def test_no_year_not_invented(self):self.assertEqual(years('最新校網','A11'),{'reference_year':None,'admission_year':None})
 def test_dmy(self):self.assertEqual(date_value('03/09/2026'),'2026-09-03')
 def test_impossible_date(self):
  with self.assertRaises(ContractError):date_value('31/02/2026')
 def test_invalid_academic_year_not_repaired(self):self.assertIsNone(years('2025/28','A06')['reference_year'])
 def test_a07_missing_base_not_guessed(self):self.assertIsNone(years('2026/27 K1名單','A07')['reference_year'])

class Normalization(unittest.TestCase):
 def vacancy_fields(self):return {'District':'NORTH','SCRN':'123456-0001','School Chinese Name':'例子學校','K1 Vacancy Status':'P','K2 Vacancy Status':'N','K3 Vacancy Status':'NA','As At Date':'01/09/2026'}
 def test_vacancy_four_states_not_numbers(self):
  f=self.vacancy_fields();r=row('A08','vacancy',f);self.assertEqual(r['normalized']['facts']['vacancies']['K1']['code'],'P');self.assertEqual(r['raw'],f);self.assertEqual(r['normalized']['as_of'],'2026-09-01')
 def test_vacancy_yes_distinct_no(self):
  f=self.vacancy_fields();f['K1 Vacancy Status']='Y';self.assertEqual(row('A08','vacancy',f)['normalized']['facts']['vacancies']['K1']['label'],'有學位空缺')
 def test_vacancy_unknown_code_blocks(self):
  f=self.vacancy_fields();f['K1 Vacancy Status']='3'
  with self.assertRaises(ContractError):row('A08','vacancy',f)
 def test_vacancy_requires_date(self):
  f=self.vacancy_fields();f['As At Date']=''
  with self.assertRaises(ContractError):row('A08','vacancy',f)
 def test_scrn_not_arbitrary_numeric(self):
  f=self.vacancy_fields();f['SCRN']='123'
  with self.assertRaises(ContractError):row('A08','vacancy',f)
 def test_missing_k3_not_no(self):
  f=self.vacancy_fields();del f['K3 Vacancy Status'];self.assertIsNone(row('A08','vacancy',f)['normalized']['facts']['vacancies']['K3']['code'])
 def test_scheme_name_and_district(self):
  r=row('A06','scheme',{'學校名稱 中文':'例子學校','學校名稱 英文':'example','區域 中文':'北區'});self.assertTrue(r['normalized']['facts']['scheme_listed']);self.assertEqual(r['normalized']['scope'],'INSTITUTION_LISTING')
 def test_admission_measure_not_scheme(self):
  r=row('A07','non_scheme_admission',{'學校名稱':'例子學校','學校地址':'例子一號','網上/不設限額派表':'Y','「一人不佔多位」措施':'N'},'參加2026/27而於2025/26學年非計劃 (繁體中文)')
  self.assertEqual(r['normalized']['admission_year'],2026);self.assertEqual(r['normalized']['reference_year'],2025);self.assertFalse(r['normalized']['facts']['single_place']['value'])
 def fee_fields(self):return {'學校名稱':'例子學校','學校級別':'中學','班級':'S1','學費類別':'範圍','每名學生全年學費($)下限*':'0','每名學生全年學費($)上限*':'20,000'}
 def test_dss_fee_zero_not_unknown(self):
  r=row('A09','dss_fees',self.fee_fields());self.assertEqual(r['normalized']['facts']['fee_min'],'0');self.assertEqual(r['normalized']['facts']['fee_max'],'20000')
 def test_fee_order(self):
  f=self.fee_fields();f['每名學生全年學費($)下限*']='30000'
  with self.assertRaises(ContractError):row('A09','dss_fees',f)
 def test_fixed_fee_must_agree(self):
  f=self.fee_fields();f['學費類別']='固定'
  with self.assertRaises(ContractError):row('A09','dss_fees',f)
 def test_unknown_fee_stays_unknown(self):self.assertIsNone(number('N.A.'))
 def test_nan_rejected(self):
  with self.assertRaises(ContractError):number('NaN')
 def test_capacity_room_not_total(self):
  r=row('A02','capacity',{'SchoolNumber':'123456','SchoolNameChi':'例子學校','PremisesCode':'0002','RoomType':'C','RoomNo':'1','PermittedAccomodation':'30','PermittedAccommodationKGWD':'20'});n=r['normalized'];self.assertIsNone(n['location_id']);self.assertEqual(n['facts']['permitted_capacity'],'30');self.assertEqual(n['facts']['kg_whole_day_capacity'],'20');self.assertNotIn('total_capacity',n['facts'])
 def test_dorm_separate(self):
  r=row('A02','capacity',{'SchoolNumber':'123456','SchoolNameChi':'例子學校','PremisesCode':'0002','RoomType':'B','PermittedAccomodation':'10'});self.assertEqual(r['normalized']['facts']['room_type'],'BOARDING')
 def test_through_train_original_group(self):
  r=row('A10','through_train',{'組別編號':'7','學校名稱':'例子學校','地區':'北區','備註':'原文'});self.assertEqual(r['normalized']['facts']['group_id'],'7');self.assertEqual(r['normalized']['facts']['scope_note'],'AIDED_SCHOOLS_ONLY')
 def test_blank_group_not_forward_filled(self):self.assertIsNone(row('A10','through_train',{'組別編號':'','學校名稱':'例子','地區':'北區'})['normalized']['facts']['group_id'])
 def test_poa_schoolname_is_net(self):
  r=row('A11','poa_net',{'SCHOOLNAME':'95','AREA':'例子區域','WEBPAGE':'https://www.edb.gov.hk/map.pdf'});self.assertEqual(r['normalized']['facts']['net'],'95');self.assertEqual(r['normalized']['facts']['geometry_status'],'NOT_PROVIDED_IN_CSV')
 def test_sspa_code_not_edb_code(self):
  r=row('A12','sspa_net',{'Net':'NT1','Dist':'N','Sch_Code':'123','Sch_Name':'例子學校','NT2':'Y'});self.assertIsNone(r['normalized']['school_number']);self.assertEqual(r['normalized']['facts']['serving_nets_raw']['NT2'],'Y')

class Linking(unittest.TestCase):
 def registration(self):return row('A02','registration',{'SchoolNumber':'123456','LocationID':'0001','SchoolNameChi':'例子學校','RegistrationStatusChi':'已註冊'})
 def test_campus_code_required(self):self.assertEqual(link_record(self.registration(),[school(loc='0002')])['state'],'UNMATCHED')
 def test_same_campus_link(self):self.assertEqual(link_record(self.registration(),[school()])['state'],'EVIDENCE_LINKED')
 def test_same_name_other_school_rejected(self):self.assertEqual(link_record(self.registration(),[school(num='888888')])['state'],'UNMATCHED')
 def test_raw_source_immutable(self):
  r=self.registration();copy_=copy.deepcopy(r);link_record(r,[school()]);self.assertEqual(r,copy_)
 def test_nfkc_name(self):
  r=self.registration();r['normalized']['name']='例子學校（分校）';self.assertEqual(link_record(r,[school(name='例子學校(分校)')])['state'],'EVIDENCE_LINKED')
 def test_name_district_candidate_not_automatic_approval(self):
  r=row('A06','scheme',{'學校名稱 中文':'例子學校','區域 中文':'北區'});self.assertEqual(link_record(r,[school()])['state'],'REVIEW_REQUIRED')
 def test_different_district_not_candidate(self):
  r=row('A06','scheme',{'學校名稱 中文':'例子學校','區域 中文':'南區'});self.assertEqual(link_record(r,[school()])['state'],'UNMATCHED')
 def test_admission_address_match(self):
  r=row('A07','non_scheme_admission',{'學校名稱':'例子學校','學校地址':'例子一號'});self.assertEqual(link_record(r,[school()])['state'],'EVIDENCE_LINKED')

class PlanningAndProtection(unittest.TestCase):
 def test_all_eight_unique(self):self.assertEqual(len({s.code for s in SPECS}),8)
 def test_all_three_registration_roles_required(self):
  with self.assertRaises(ContractError):plan_resources('A02',{'name':SPEC_BY_CODE['A02'].slug,'resources':[]})
 def test_latest_title_not_fetch_time(self):
  p={'name':SPEC_BY_CODE['A06'].slug,'resources':[{'id':str(y),'name':f'{y}/{str(y+1)[2:]} (繁體中文)','format':'CSV','url':'https://www.edb.gov.hk/a.csv'} for y in (2024,2025)]}
  chosen,omitted=plan_resources('A06',p);self.assertEqual(len(chosen),1);self.assertEqual(chosen[0]['reference_year'],2025);self.assertEqual(len(omitted),1)
 def test_simplified_not_included(self):self.assertIsNone(role_for('A06','2025/26 (簡體中文)','CSV'))
 def test_official_http_upgrade(self):self.assertEqual(checked_url('http://www.edb.gov.hk/a.csv'),'https://www.edb.gov.hk/a.csv')
 def test_ssrf_private_host(self):
  with self.assertRaises(ContractError):checked_url('https://127.0.0.1/a')
 def test_userinfo_rejected(self):
  with self.assertRaises(ContractError):checked_url('https://secret@www.edb.gov.hk/a')
 def test_not_silent_subdomains(self):
  with self.assertRaises(ContractError):checked_url('https://www.edb.gov.hk.evil.test/a')
 def test_incomplete_capture_never_builds(self):
  with tempfile.TemporaryDirectory() as folder:
   p=pathlib.Path(folder);(p/'capture.json').write_text('{"state":"BLOCKED"}')
   with self.assertRaises(ContractError):build(p,p/'dist')
 def test_bad_scheme_year_does_not_override(self):self.assertEqual(years('2025/2027 資料','A06')['reference_year'],None)
if __name__=='__main__':unittest.main()
