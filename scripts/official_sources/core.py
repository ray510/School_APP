from __future__ import annotations
import csv, datetime as dt, hashlib, io, json, re, unicodedata
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET
from .specs import SPEC_BY_CODE, NETS, VACANCIES

VERSION = 'official-eight-v2-live-contracts'
class ContractError(ValueError): pass

def canonical(v): return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
def digest(v): return hashlib.sha256(v if isinstance(v,bytes) else canonical(v).encode('utf8')).hexdigest()
def norm(v): return re.sub(r'\s+', '', unicodedata.normalize('NFKC', str(v or ''))).casefold()
def safe_url(v):
    try:
        u=urlsplit(v)
        return v if u.scheme=='https' and u.hostname and not u.username and not u.password else None
    except (TypeError,ValueError): return None

def get(fields, *aliases, required=False):
    # Header normalisation only; original header/value map is retained separately.
    found=[(k,v) for k,v in fields.items() if norm(k) in {norm(a) for a in aliases}]
    if len({v for _,v in found})>1: raise ContractError('Conflicting header aliases: '+str(aliases))
    if not found and required: raise ContractError('Required field absent: '+str(aliases))
    return found[0][1] if found else ''

def code(v, width):
    text=str(v).strip()
    return text.zfill(width) if re.fullmatch(r'\d{1,'+str(width)+'}',text) else None

def number(v):
    text=unicodedata.normalize('NFKC',str(v)).strip()
    if ',' in text:
        if not re.fullmatch(r'\d{1,3}(?:,\d{3})+(?:\.\d+)?', text): raise ContractError('Invalid thousands grouping')
        text=text.replace(',','')
    if not text or text.upper() in ('N/A','NA','N.A.') or text in ('-','—','不適用'): return None
    try:
        n=Decimal(text)
        if not n.is_finite() or n<0: raise InvalidOperation
        return str(n)
    except InvalidOperation: raise ContractError('Not a non-negative numeric source value: '+str(v)) from None

def date_value(v):
    if not str(v).strip(): return None
    for fmt in ('%d/%m/%Y','%Y-%m-%d'):
        try: return dt.datetime.strptime(str(v).strip(),fmt).date().isoformat()
        except ValueError: pass
    raise ContractError('Unrecognised source date: '+str(v))

def years(title, code_):
    values=[]
    for a,b in re.findall(r'(20\d{2})\s*[/／-]\s*(20\d{2}|\d{2})(?!\d)',unicodedata.normalize('NFKC',title)):
        start=int(a);end=int(b) if len(b)==4 else start//100*100+int(b)
        if end!=start+1: continue
        if start not in values: values.append(start)
    if code_=='A07':
        return {'reference_year':values[1] if len(values)>1 else None, 'admission_year':values[0] if values else None}
    return {'reference_year':values[0] if len(values)==1 else None,'admission_year':None}

def role_for(code_, name, fmt):
    if code_=='A02':
        if fmt!='XML': return None
        if '基本註冊' in name: return 'registration'
        if '校舍資料' in name: return 'premises'
        if '容額' in name: return 'capacity'
        return None
    if fmt!='CSV': return None
    if '簡體' in name or '简体' in name: return None
    if not any(x in name for x in ('繁體','繁体','Traditional Chinese')): return None
    return ('dss_fees' if '學費' in name else 'dss') if code_=='A09' else SPEC_BY_CODE[code_].roles[0]

def plan_resources(code_, package):
    spec=SPEC_BY_CODE[code_]
    if package.get('name')!=spec.slug: raise ContractError('Unexpected dataset')
    selected=[];omitted=[]
    for resource in package.get('resources',[]):
        title=resource.get('name') or '';fmt=(resource.get('format') or '').upper()
        role=role_for(code_,title,fmt)
        item={'code':code_,'role':role,'resource_id':resource.get('id'), 'name':title,'format':fmt,
              'url':resource.get('url'),'catalogue_modified_at':resource.get('last_modified'),**years(title,code_)}
        if not item['resource_id']: raise ContractError('Resource ID missing')
        if role: selected.append(item)
        else: omitted.append({**item,'selection_reason':'FORMAT_OR_LANGUAGE_NOT_SELECTED'})
    output=[]
    for role in spec.roles:
        candidates=[r for r in selected if r['role']==role]
        if not candidates: raise ContractError('No suitable live resource for '+code_+':'+role)
        def yr(r): return r['admission_year'] if code_=='A07' else r['reference_year']
        known=[yr(r) for r in candidates if yr(r) is not None]
        newest=max(known) if known else None
        for r in candidates:
            if newest is None or yr(r)==newest: output.append(r)
            else: omitted.append({**r,'selection_reason':'OLDER_OR_UNLABELLED_EDITION'})
    return output,omitted

XML_REQUIRED={
 'registration':('SchoolNumber','LocationID','RegistrationStatusChi'),
 'premises':('SchoolNumber','PremisesCode'),
 'capacity':('SchoolNumber','PremisesCode','RoomType'),
}
def read_records(raw, resource):
    if len(raw)>350_000_000: raise ContractError('Resource byte bound exceeded')
    fmt=resource['format'];role=resource['role']
    if fmt=='XML':
        if re.search(br'<!\s*(?:DOCTYPE|ENTITY)',raw,re.I): raise ContractError('DTD/entities are not accepted')
        root=ET.fromstring(raw);rows=[]
        local=lambda name:name.rsplit('}',1)[-1]
        if local(root.tag) not in ('Schools','r'): raise ContractError('Unknown XML root')
        for element in root:
            children=list(element);names=[local(c.tag) for c in children]
            if not set(XML_REQUIRED[role]).issubset(names):
                raise ContractError('XML row missing required identifiers; no silent row exclusion')
            if role=='capacity' and not any(n in names for n in ('PermittedAccommodation','PermittedAccomodation')):raise ContractError('Missing accommodation capacity field')
            if len(names)!=len(set(names)) or any(list(c) for c in children):
                raise ContractError('Nested/duplicate XML row fields require a reviewed adapter')
            rows.append(dict(zip(names,[c.text or '' for c in children])))
        if not rows: raise ContractError('No expected XML records; verify document schema')
        return rows
    if fmt!='CSV': raise ContractError('Unsupported data representation')
    encoding='utf-16' if role=='scheme' and raw.startswith((b'\xff\xfe',b'\xfe\xff')) else resource.get('encoding','utf-8-sig')
    if encoding not in ('utf-8-sig','big5hkscs','utf-16'): raise ContractError('Unreviewed encoding')
    text=raw.decode(encoding,errors='strict')
    if '\x00' in text or '\ufffd' in text or text.lstrip().lower().startswith(('<html','<!doctype')):
        raise ContractError('Invalid text/HTML instead of data')
    reader=csv.DictReader(io.StringIO(text,newline=''),strict=True,delimiter='\t' if role=='scheme' and encoding=='utf-16' else ',')
    headers=reader.fieldnames or []
    if not headers or len({norm(h) for h in headers})!=len(headers) or any(not h.strip() for h in headers) and not (role=='dss_fees' and headers[-1]=='' and all(h.strip() for h in headers[:-1])):
        raise ContractError('Invalid or ambiguous CSV headers')
    rows=list(reader)
    if not rows or any(None in r or any(v is None for v in r.values()) for r in rows):
        raise ContractError('Empty resource or ragged CSV; refusing partial row loss')
    if role=='dss_fees' and '' in headers and any(r[''] for r in rows):raise ContractError('Unnamed fee column is not empty')
    return rows

def normalize(fields, resource, row_no, raw_hash):
    role=resource['role'];code_=resource['code']
    n={'name':'','english_name':'','school_number':None,'location_id':None,'level':None,'district':'','address':'',
       'facts':{},'as_of':None, 'scope':'SOURCE_RECORD', **years(resource['name'],code_)}
    facts=n['facts'];name=lambda:(get(fields,'學校名稱','School Chinese Name','SchoolNameChi','學校名稱 中文','學校名稱(中文) \nSchool Name (Chinese)') or get(fields,'School English Name','SchoolNameEng')).strip()
    if role in XML_REQUIRED:
        n.update(name=(get(fields,'SchoolNameChi').strip() or get(fields,'SchoolNameEng',required=True).strip()),english_name=get(fields,'SchoolNameEng').strip(),
                 school_number=code(get(fields,'SchoolNumber',required=True),6))
        if n['school_number'] is None: raise ContractError('Invalid six-digit SchoolNumber')
        if role=='registration':
            loc=code(get(fields,'LocationID',required=True),4)
            if loc is None: raise ContractError('Invalid LocationID')
            n.update(location_id=loc,scope='SCHOOL_CAMPUS',district=get(fields,'DistrictChi'),address=get(fields,'SchoolAddressChi'),
                level={'幼稚園':'KG','小學':'PRIMARY','中學':'SECONDARY'}.get(get(fields,'SchoolLevelChi').strip()))
            facts.update(registration_status=get(fields,'RegistrationStatusChi',required=True),
                registration_number=get(fields,'SchoolRegistrationNumber'),registered_on=date_value(get(fields,'RegistrationDate')),
                provisional_on=date_value(get(fields,'ProvisionalRegistrationDate')),session=get(fields,'SchoolSessionChi'))
        else:
            n.update(scope='SCHOOL_PREMISES',address=(get(fields,'PremisesDescChi').strip() or get(fields,'PremisesDescEng').strip()))
            facts.update(premises_code=code(get(fields,'PremisesCode',required=True),4),premises_description=(get(fields,'PremisesDescChi').strip() or get(fields,'PremisesDescEng').strip()))
            if role=='capacity':
                kind=get(fields,'RoomType',required=True).strip()
                if kind not in ('C','B'): raise ContractError('Unrecognised RoomType')
                facts.update(room_type='CLASSROOM' if kind=='C' else 'BOARDING',room_no=get(fields,'RoomNo'),
                    subpremises_code=get(fields,'SubPremisesCode'),permitted_capacity=number(get(fields,'PermittedAccommodation','PermittedAccomodation',required=True)),
                    kg_whole_day_capacity=number(get(fields,'PermittedAccommodationKGWD')),remarks=get(fields,'RemarksChi'))
    elif role=='scheme':
        n.update(name=name(),english_name=get(fields,'學校名稱 英文','學校名稱(英文) \nSchool Name (English)'),district=get(fields,'區域 中文','地區','區域','區域(中文) \nDistrict (Chinese)',required=True),level='KG',scope='INSTITUTION_LISTING')
        facts['scheme_listed']=True
    elif role=='non_scheme_admission':
        n.update(name=name(),address=get(fields,'學校地址',required=True),level='KG',scope='CAMPUS_LISTING')
        facts.update(non_scheme_in_reference_year=True,participates_in_k1_arrangement=True)
        for aliases,key in [(('網上/不設限額派表','網上／不設限額派表'),'application_distribution'),(('「一人不佔多位」措施','一人不佔多位措施'),'single_place'),(('經教育局發放K1-K3學位空缺資訊','經教育局發放 K1-K3 學位空缺資訊'),'vacancy_publication')]:
            v=get(fields,*aliases)
            facts[key]={'raw':v,'value':{'Y':True,'N':False}.get(v.strip().upper())}
    elif role=='vacancy':
        scrn=get(fields,'SCRN',required=True).strip()
        m=re.fullmatch(r'(\d{6})[-／/](\d{4})',unicodedata.normalize('NFKC',scrn))
        if not m: raise ContractError('SCRN must explicitly identify school and campus')
        n.update(name=name(),english_name=get(fields,'School English Name'),school_number=m[1],location_id=m[2],level='KG',scope='SCHOOL_CAMPUS',district=get(fields,'District',required=True),as_of=date_value(get(fields,'As At Date',required=True)))
        if n['as_of'] is None: raise ContractError('Vacancy snapshot date missing')
        vacancies={}
        for grade in ('K1','K2','K3'):
            v=get(fields,grade+' Vacancy Status')
            state=v.strip().upper()
            if state and state not in VACANCIES: raise ContractError('Unrecognised vacancy state')
            vacancies[grade]={'code':state or None,'label':VACANCIES.get(state,'來源未提供此級別'),'raw':v}
        if not any(v['code'] for v in vacancies.values()): raise ContractError('Vacancy grade columns missing')
        facts['vacancies']=vacancies
    elif role in ('dss','dss_fees'):
        n.update(name=name(),level={'小學':'PRIMARY','中學':'SECONDARY'}.get(get(fields,'學校級別',required=True)),scope='INSTITUTION_LISTING')
        if not n['level'] and any(get(fields,k) for k in ('編號','學校名稱','學校級別')): raise ContractError('Unrecognised DSS level')
        if not n['level']:
            n.update(name='附加學費減免連結（來源未重列校名）',scope='UNIDENTIFIED_SOURCE_ROW')
        if role=='dss':
            n.update(address=get(fields,'地址',required=True),district=get(fields,'地區'))
            facts.update(listing_number=get(fields,'編號'),dss_listed=True,phone=get(fields,'電話'),website=get(fields,'學校網址'),
                         fee_remission_url=get(fields,'學費減免計劃網頁'),scholarship_url=get(fields,'獎學金計劃網頁'))
        else:
            low=get(fields,'每名學生全年學費($)下限*','每名學生全年學費($)下限','每名學生全年學費下限($)',required=True)
            high=get(fields,'每名學生全年學費($)上限*','每名學生全年學費($)上限','每名學生全年學費上限($)',required=True)
            lo=number(low);hi=number(high);kind=get(fields,'學費類別',required=True)
            if lo is not None and hi is not None and Decimal(lo)>Decimal(hi): raise ContractError('Fee range reversed')
            if kind.strip()=='固定' and lo!=hi: raise ContractError('Fixed fee endpoints conflict')
            facts.update(listing_number=get(fields,'編號'),charge_kind='BOARDING' if '宿費' in get(fields,'班級') else 'TUITION',grade=get(fields,'班級',required=True),fee_kind=kind,fee_min=lo,fee_max=hi,currency='HKD',period='ANNUAL')
    elif role=='through_train':
        n.update(name=name(),district=get(fields,'地區','區域',required=True),scope='RELATION_GROUP')
        group=get(fields,'組別編號',required=True).strip()
        facts.update(group_id=group or None,remarks=get(fields,'備註'),scope_note='AIDED_SCHOOLS_ONLY')
    elif role=='poa_net':
        net=get(fields,'SCHOOLNET','SCHOOLNAME',required=True).strip()
        if not re.fullmatch(r'\d{1,3}',net): raise ContractError('SCHOOLNET is a net number, not a school name')
        n.update(name='小一校網 '+net,level='PRIMARY',scope='PRIMARY_NET_AREA')
        facts.update(net=net,area=get(fields,'AREA',required=True),map_url=get(fields,'WEBPAGE',required=True),geometry_status='NOT_PROVIDED_IN_CSV')
    elif role=='sspa_net':
        net=get(fields,'Net',required=True).strip().upper()
        if net not in NETS: raise ContractError('Unrecognised secondary net')
        n.update(name=get(fields,'Sch_Name',required=True),level='SECONDARY',scope='SSPA_SCHOOL_LISTING')
        facts.update(home_net=net,district_code=get(fields,'Dist'),sspa_school_code=get(fields,'Sch Code','Sch_Code',required=True),
                     serving_nets_raw={k:get(fields,k) for k in NETS})
        # The source code is preserved, not assumed to identify a campus.
    else: raise ContractError('Unknown source role')
    if not n['name']: raise ContractError('Missing display name')
    n['district']=n['district'].strip();n['address']=n['address'].strip()
    n['facts']={k:v.strip() if isinstance(v,str) else v for k,v in facts.items()}
    return {'id':'official_'+digest([code_,resource['resource_id'],row_no])[:24], 'code':code_,'role':role,'resource_id':resource['resource_id'],
            'row':row_no,'raw':fields,'record_sha256':digest(fields),'resource_sha256':raw_hash,'normalized':n}

DISTRICTS={'NORTH':'北區','CENTRALANDWESTERN':'中西區','CENTRAL&WESTERN':'中西區','EASTERN':'東區','港島東':'東區',
'WANCHAI':'灣仔區','SOUTHERN':'南區','YAUTSIMMONG':'油尖旺區','SHAMSHUIPO':'深水埗區','KOWLOONCITY':'九龍城區',
'WONGTAISIN':'黃大仙區','KWUNTONG':'觀塘區','TSUENWAN':'荃灣區','TUENMUN':'屯門區','YUENLONG':'元朗區',
'TAIPO':'大埔區','SAIKUNG':'西貢區','SHATIN':'沙田區','KWAITSING':'葵青區','葵涌及青衣':'葵青區','ISLANDS':'離島區'}
def district(v):
    v=unicodedata.normalize('NFKC',str(v)).replace(' ','').upper()
    v=DISTRICTS.get(v,v)
    return v.removesuffix('區')

def identities(school):
    result=set()
    for r in school.get('directory',[]):
        v=r.get('fields',{}).get('SCHOOL NO.','')
        if re.fullmatch(r'\d{12}',v): result.add((v[:6],v[6:10]))
    for r in school.get('annual',[]):
        f=r['fields'];s=code(f.get('學校編號',''),6);loc=code(f.get('校址編號',''),4)
        if s and loc: result.add((s,loc))
    return result

def link_record(record, schools):
    """Evidence-bearing display link only; never rewrite canonical classification."""
    n=record['normalized'];candidates=[]
    for school in schools:
        if norm(n['name']) not in {norm(school['name']),norm(school.get('english_name',''))}: continue
        if n['level'] and school['level']!=n['level']: continue
        ident=identities(school)
        if n['school_number']:
            if n['location_id']:
                if (n['school_number'],n['location_id']) not in ident: continue
                method='SCHOOL_NUMBER_CAMPUS_AND_NAME'
            else:
                if not any(a==n['school_number'] for a,_ in ident): continue
                method='SCHOOL_NUMBER_NAME_INSTITUTION_ONLY'
            candidates.append((school,method))
        elif n['address'] and norm(n['address'])==norm(school['address']): candidates.append((school,'EXACT_NORMALIZED_NAME_ADDRESS_LEVEL'))
        elif n['scope']=='SSPA_SCHOOL_LISTING' and code(n['facts'].get('sspa_school_code',''),6) in {a for a,_ in ident}:
            candidates.append((school,'SOURCE_SCHOOL_CODE_NAME_AND_LEVEL_INSTITUTION'))
        elif n['scope']=='INSTITUTION_LISTING' and n['english_name'] and norm(n['english_name'])==norm(school.get('english_name','')) and n['district'] and district(n['district'])==district(school['district']):
            candidates.append((school,'BILINGUAL_NAME_DISTRICT_INSTITUTION'))
        elif n['scope']=='INSTITUTION_LISTING' and n['district'] and district(n['district'])==district(school['district']): candidates.append((school,'NAME_DISTRICT_INSTITUTION_CANDIDATE'))
        elif n['scope'] in ('RELATION_GROUP','SSPA_SCHOOL_LISTING'):
            candidates.append((school,'NAME_INSTITUTION_CANDIDATE'))
    if not candidates:return {'state':'UNMATCHED','links':[]}
    if any('CANDIDATE' in method for _,method in candidates):
        return {'state':'REVIEW_REQUIRED','links':[{'school_id':s['id'],'method':m,'scope':n['scope']} for s,m in candidates]}
    campus_keys=set()
    for s,_m in candidates:campus_keys.update(identities(s))
    if n['scope']!='SCHOOL_PREMISES' and len(campus_keys)>1:
        return {'state':'AMBIGUOUS','links':[{'school_id':s['id'],'method':m,'scope':n['scope']} for s,m in candidates]}
    return {'state':'EVIDENCE_LINKED','links':[{'school_id':s['id'],'method':m,'scope':n['scope']} for s,m in candidates]}
