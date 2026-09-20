"""Deterministic facts; the model never creates amounts, opening times or deadlines."""
import re,unicodedata,decimal,datetime

def norm(v):return re.sub(r'[\s，,。.;；()（）\-]','',unicodedata.normalize('NFKC',v)).upper()
def amount(v):
 if 'FREE' in v:return 0
 return int(decimal.Decimal(v.replace(',',''))*100)
def certificate(text,name,address,school_number_match=False):
 """Parse only evidenced EDB fee-certificate layouts.

 Identity normally needs name+address. For the official EDB fee endpoint, callers may
 additionally attest that the profile school number exactly matches the requested
 fee-document school number; this can safely handle certificates listing multiple
 premises without borrowing another school's fee.
 """
 head=text[:text.find('Course / Class')]
 name_ok=norm(name) in norm(head)
 address_ok=bool(address and norm(address) in norm(head))
 if not name_ok or (not address_ok and not school_number_match):return {'status':'IDENTITY_REVIEW','rows':[]}
 identity_basis='NAME_AND_ADDRESS' if address_ok else 'EDB_SCHOOL_NUMBER_AND_NAME'
 dates=set(re.findall(r'With effect from\s*:\s*(\d{2}\.\d{2}\.\d{4})',text))
 if len(dates)!=1:return {'status':'DATE_REVIEW','rows':[],'identity_basis':identity_basis}
 effective=datetime.datetime.strptime(next(iter(dates)),'%d.%m.%Y').date().isoformat()
 if 'BEFORE DEDUCTION' in text:return {'status':'LAYOUT_REVIEW','rows':[],'effective_from':effective,'identity_basis':identity_basis}
 after_subsidy='FEES AFTER DEDUCTION OF GOVERNMENT' in text
 standard_layout=all(marker in text for marker in ('FEES CERTIFICATE','Course / Class','Tuition Fee','Inclusive Fee'))
 if not after_subsidy and not standard_layout:return {'status':'LAYOUT_REVIEW','rows':[],'effective_from':effective,'identity_basis':identity_basis}
 basis='AFTER_GOVERNMENT_SUBSIDY_IF_ELIGIBLE' if after_subsidy else 'APPROVED_FEES_CERTIFICATE'
 row_re=re.compile(r'(?m)^\s*(NURSERY|LOWER KINDERGARTEN|UPPER KINDERGARTEN) (AM|PM|WHOLE-DAY)\s*$')
 matches=list(row_re.finditer(text));out=[]
 line_re=re.compile(r'(?P<price>免費\s+FREE|[\d,]+\.\d{2})\s+-\s+(?P<periods>\d{1,2})/-\s+(?P<total>免費\s+FREE|[\d,]+\.\d{2})')
 for k,match in enumerate(matches):
  end=matches[k+1].start() if k+1<len(matches) else text.find('With effect from',match.end())
  block=text[match.end():end];values=list(line_re.finditer(block))
  if not 1<=len(values)<=2:return {'status':'LAYOUT_REVIEW','rows':[],'effective_from':effective}
  if len(values)==2 and '(MEAL CHARGE)' not in block:return {'status':'LAYOUT_REVIEW','rows':[],'effective_from':effective}
  for n,v in enumerate(values):
   price=amount(v['price']);periods=int(v['periods']);total=amount(v['total'])
   if not 1<=periods<=12 or total!=price*periods or total>100000000:return {'status':'ARITHMETIC_REVIEW','rows':[],'effective_from':effective}
   out.append({'grade':{'NURSERY':'K1','LOWER KINDERGARTEN':'K2','UPPER KINDERGARTEN':'K3'}[match[1]],'session':{'AM':'AM','PM':'PM','WHOLE-DAY':'WD'}[match[2]],'category':'tuition' if n==0 else 'meal','cents':price,'periods':periods,'annual_cents':total,'evidence_text':v[0],'evidence_start':match.end()+v.start(),'evidence_end':match.end()+v.end()})
 keys=[(r['grade'],r['session'],r['category']) for r in out]
 if not out or len(keys)!=len(set(keys)):return {'status':'LAYOUT_REVIEW','rows':[],'effective_from':effective}
 return {'status':'PARSED_NOT_HUMAN_REVIEWED','effective_from':effective,'basis':basis,'identity_basis':identity_basis,'rows':out}

def source_fact(value,field,profile):
 return {'value':value,'field':field,'source_id':profile['source_id'],'edition':profile['edition'],'row':profile['row'],'record_sha256':profile['record_sha256'],'state':'REPORTED' if str(value).strip() not in ('','-','N.A.') else 'UNKNOWN'}
