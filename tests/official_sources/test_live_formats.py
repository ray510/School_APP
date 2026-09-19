"""Synthetic regressions for actual source shapes observed 2026-09-19."""
import csv,io,unittest
from scripts.official_sources.core import read_records,normalize,link_record,ContractError
from test_contracts import resource,row,school
class ObservedFormats(unittest.TestCase):
 def test_registration_english_only_not_dropped(self):
  raw=b'<Schools><SchoolBasicInfo><SchoolNumber>123456</SchoolNumber><LocationID>0001</LocationID><SchoolNameEng>TEST SCHOOL  </SchoolNameEng><RegistrationStatusChi> </RegistrationStatusChi></SchoolBasicInfo></Schools>'
  r=resource('A02','registration',fmt='XML');f=read_records(raw,r);self.assertEqual(len(f),1);n=normalize(f[0],r,1,'a'*64);self.assertEqual(n['normalized']['name'],'TEST SCHOOL');self.assertEqual(n['raw'],f[0])
 def test_capacity_actual_spelling(self):
  raw=b'<Schools><SchoolAccommodation><SchoolNumber>123456</SchoolNumber><PremisesCode>0001</PremisesCode><SchoolNameEng>TEST</SchoolNameEng><RoomType>C</RoomType><PermittedAccommodation>20</PermittedAccommodation></SchoolAccommodation></Schools>'
  r=resource('A02','capacity',fmt='XML');f=read_records(raw,r);n=normalize(f[0],r,1,'a'*64);self.assertEqual(n['normalized']['facts']['permitted_capacity'],'20')
 def test_conflicting_capacity_spelling_not_silent(self):
  with self.assertRaises(ContractError):row('A02','capacity',{'SchoolNumber':'123456','PremisesCode':'1','SchoolNameEng':'TEST','RoomType':'C','PermittedAccommodation':'20','PermittedAccomodation':'30'})
 def test_scheme_utf16_quoted_bilingual_headers(self):
  f={'學校名稱(中文) \nSchool Name (Chinese)':'例子學校','學校名稱(英文) \nSchool Name (English)':'TEST','區域(中文) \nDistrict (Chinese)':'北區'}
  stream=io.StringIO();w=csv.DictWriter(stream,fieldnames=list(f),delimiter='\t');w.writeheader();w.writerow(f);r=resource('A06','scheme');rows=read_records(stream.getvalue().encode('utf16'),r);self.assertEqual(rows,[f]);self.assertEqual(normalize(rows[0],r,1,'a'*64)['normalized']['name'],'例子學校')
 def test_fee_empty_final_column_preserved(self):
  r=resource('A09','dss_fees');f=read_records(b'a,\n1,\n',r);self.assertEqual(f,[{'a':'1','':''}])
 def test_fee_nonempty_unnamed_column_rejected(self):
  with self.assertRaises(ContractError):read_records(b'a,\n1,x\n',resource('A09','dss_fees'))
 def test_fee_boarding_not_tuition(self):
  f={'學校名稱':'例子','學校級別':'中學','班級':'海外學生宿費','學費類別':'固定','每名學生全年學費下限($)':'5000','每名學生全年學費上限($)':'5000'};self.assertEqual(row('A09','dss_fees',f)['normalized']['facts']['charge_kind'],'BOARDING')
 def test_dss_orphan_continuation_retained(self):
  f={'編號':'','學校名稱':'','學校級別':'','地址':'','學費減免計劃網頁':'https://example.invalid/fees'};r=row('A09','dss',f);self.assertEqual(r['raw'],f);self.assertEqual(r['normalized']['scope'],'UNIDENTIFIED_SOURCE_ROW')
 def test_poa_actual_header(self):self.assertEqual(row('A11','poa_net',{'SCHOOLNET':'80','AREA':'上水','WEBPAGE':'http://www.edb.gov.hk/poa/tc-canet-80'})['normalized']['facts']['net'],'80')
 def test_sspa_actual_headers(self):self.assertEqual(row('A12','sspa_net',{'Net':'NT5','DIST':'N','Sch Code':'123456','SCH_NAME':'例子學校','NT5':'Y'})['normalized']['facts']['sspa_school_code'],'123456')
 def test_bilingual_scheme_evidence_no_campus_guess(self):
  r=row('A06','scheme',{'學校名稱 中文':'例子學校','學校名稱 英文':'TEST','區域 中文':'北區'});s=school();s['english_name']='TEST';self.assertEqual(link_record(r,[s])['state'],'EVIDENCE_LINKED')
 def test_sspa_six_digits_not_enough_without_same_name(self):
  r=row('A12','sspa_net',{'Net':'NT5','DIST':'N','Sch Code':'123456','SCH_NAME':'其他學校'});self.assertEqual(link_record(r,[school(level='SECONDARY')])['state'],'UNMATCHED')
if __name__=='__main__':unittest.main()
