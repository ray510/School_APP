"""Deterministic facts; the model never creates amounts, opening times or deadlines."""
import re,unicodedata,decimal,datetime

def norm(v):return re.sub(r'[\s，,。.;；()（）\-]','',unicodedata.normalize('NFKC',v)).upper()
def amount(v):
 if 'FREE' in v:return 0
 return int(decimal.Decimal(v.replace(',',''))*100)
def certificate(text,name,address):
 """Accept only the unambiguous supported EDB layout; retain raw PDF for everything else."""
 head=text[:text.find('Course / Class')]
 if norm(name) not in norm(head) or not address or norm(address) not in norm(head):return {'status':'IDENTITY_REVIEW','rows':[]}
 dates=set(re.findall(r'With effect from\s*:\s*(\d{2}\.\d{2}\.\d{4})',text))
 if len(dates)!=1:return {'status':'DATE_REVIEW','rows':[]}
 effective=datetime.datetime.strptime(next(iter(dates)),'%d.%m.%Y').date().isoformat()
 if 'FEES AFTER DEDUCTION OF GOVERNMENT' not in text or 'BEFORE DEDUCTION' in text:return {'status':'LAYOUT_REVIEW','rows':[],'effective_from':effective}
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
 return {'status':'PARSED_NOT_HUMAN_REVIEWED','effective_from':effective,'basis':'AFTER_GOVERNMENT_SUBSIDY_IF_ELIGIBLE','rows':out}

def source_fact(value,field,profile):
 return {'value':value,'field':field,'source_id':profile['source_id'],'edition':profile['edition'],'row':profile['row'],'record_sha256':profile['record_sha256'],'state':'REPORTED' if str(value).strip() not in ('','-','N.A.') else 'UNKNOWN'}
