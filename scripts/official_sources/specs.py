"""Official source roles; actual raw contracts are verified at ingestion."""
from dataclasses import dataclass
@dataclass(frozen=True)
class Spec:
    code: str
    slug: str
    title: str
    dictionary: str
    roles: tuple[str, ...]
    warning: str
BASE='https://www.edb.gov.hk/attachment/datagovhk/'
SPECS=(
 Spec('A02','hk-edb-schinfo-registration-info','學校註冊資料','https://www.edb.gov.hk/attachment/tc/student-parents/sch-info/sch-search/sch-registration-info/DataSpec_SchoolRegistrationInformation_tc.pdf',('registration','premises','capacity'),'不包括官立學校。校舍代碼不等於地點標識；課室與宿舍容額分開，不加總為學校學額或剩餘名額。'),
 Spec('A06','hk-edb-kgjoinkes-kg-join-kes','參加幼稚園教育計劃名單',BASE+'DataSpec_Scheme_Kindergartens_List_tc.pdf',('scheme',),'只可證明所示學年名單有列出。沒有列出不等於已核實不參加，不以歷史版覆蓋當屆狀態。'),
 Spec('A07','hk-edb-freekg-not-joining-scheme-list','非計劃幼稚園的 K1 收生安排名單',BASE+'DataSpec_kindergartens_not_joining_scheme_tc.pdf',('non_scheme_admission',),'收生學年與不參加教育計劃的基準學年分開；每項收生措施可有不同適用值。'),
 Spec('A08','hk-edb-freekg-k1-k3-vacancy-information','K1–K3 學位空缺',BASE+'DataSpec_K1-K3_vacancy_information_tc.pdf',('vacancy',),'Y／N／P／NA 是空缺狀態，不是數量。保留官方資料截至日期，不保證即時有位或獲錄取。'),
 Spec('A09','hk-edb-dss-dds-school-list','直資學校及學費資料',BASE+'DataSpec_DSS_School_Info_tc.pdf',('dss','dss_fees'),'逐學年、級別和班級列示學費。下限／上限是範圍，不取平均或宣稱包含所有開支。'),
 Spec('A10','hk-edb-tts2-through-train-school-list','一條龍學校名單',BASE+'DataSpec_Through-train-schools-tc.pdf',('through_train',),'這份名單涵蓋資助學校；直資及私立的一條龍安排須另向學校查詢。名單不等於無條件保證直升。'),
 Spec('A11','hk-edb-itmospoa-poa-schoolnet-list','小一學校網範圍',BASE+'DataSpec_POA_SchoolNet-tc.pdf',('poa_net',),'CSV 包含校網、涵蓋地區和官方校網檔案網址，並非已核實多邊形。地圖連回官方；不按最近學校推算住址校網。'),
 Spec('A12','hk-edb-sspa-sspa-schservingnet','升中校網及服務地區',BASE+'DataSpec_SSPA_SchServingNet_tc.pdf',('sspa_net',),'學校所屬網與服務其他網分開；來源校號須再以名錄編號、校名及學段核對；不單凭數字相同連接校址。未列入不能推定學校不存在或不能申請。'),
)
SPEC_BY_CODE={s.code:s for s in SPECS}
VACANCIES={'Y':'有學位空缺','N':'沒有學位空缺','P':'正處理候補名單上的申請','NA':'沒有相關資料'}
NETS=tuple([f'HK{i}' for i in range(1,5)]+[f'KL{i}' for i in range(1,6)]+[f'NT{i}' for i in range(1,10)])
