<template>
 <article class="panel official-record">
  <h3>{{ record.normalized.name }}</h3>
  <p><strong>{{ resource?.name }}</strong> · 第 {{ record.row }} 筆</p>
  <p v-if="record.normalized.reference_year!==null">資料／計劃基準學年：{{ yearText(record.normalized.reference_year) }}</p>
  <p v-if="record.normalized.admission_year!==null">適用收生學年：{{ yearText(record.normalized.admission_year) }}</p>
  <p v-if="record.normalized.address">{{ record.normalized.address }}</p>
  <p v-if="record.normalized.school_number">學校編號 {{ record.normalized.school_number }}<span v-if="record.normalized.location_id">／校址 {{ record.normalized.location_id }}</span></p>
  <p v-if="record.normalized.scope==='SCHOOL_PREMISES'" class="notice">以下是學校層級的校舍／房間紀錄，未將校舍代碼當成此校址標識。容額不是剩餘學額，沒有合計。</p>
  <template v-if="record.role==='vacancy'">
   <p>官方空缺資料截至：<strong>{{ record.normalized.as_of }}</strong><span v-if="oldSnapshot(record.normalized.as_of)"> · 此快照已超過七天或日期未明，請直接向學校確認。</span></p>
   <div class="tags"><span v-for="g in ['K1','K2','K3']" :key="g">{{ g }}：{{ vacancy(record,g).label }}</span></div>
  </template>
  <dl class="facts"><template v-for="(value,key) in visibleFacts" :key="key"><dt>{{ factLabels[key]||key }}</dt><dd><a v-if="typeof value==='string'&&safeLink(value)" :href="safeLink(value)!" target="_blank" rel="noopener noreferrer">查看官方資料 ↗</a><span v-else>{{ showFact(value) }}</span></dd></template></dl>
  <details v-if="record.role==='sspa_net'"><summary>查看其他服務校網原值</summary><p>所屬網與服務網不是同一欄位。以下只呈現原始標記，不以未核實代碼推斷申請資格。</p><dl class="facts"><template v-for="(v,k) in served" :key="k"><dt>{{ k }}</dt><dd>{{ showFact(v) }}</dd></template></dl></details>
  <p v-if="record.association.state==='EVIDENCE_LINKED'">來源關聯：<RouterLink v-for="l in record.association.links" :key="l.school_id" :to="'/schools/'+l.school_id">查看相符學校紀錄 → </RouterLink></p>
  <p v-else class="notice">{{ record.association.state==='REVIEW_REQUIRED'?'此項只是待核對候選（名稱／地區相符），不是已確認同校址；請核對官方原文。':'跨來源關聯尚未核實；原始紀錄保留，沒有按同名強制合併。' }}</p>
  <details @toggle="reveal"><summary>全部原始欄位、來源及版本</summary><p v-if="rawError" role="alert">{{ rawError }}</p><SourceFields v-if="rawFields" :fields="rawFields" /><p v-else>正在讀取原文…</p><p>擷取：{{ resource?.evidence.fetched_at }}（原始資料日期見上方，不等同本頁擷取時間）</p><p>紀錄 SHA256：<code>{{ record.record_sha256 }}</code></p><a v-if="resource" :href="resource.download_url" download>下載此版本原始資料{{ resource.download_encoding==='gzip'?'（GZIP壓縮）':'' }}</a></details>
 </article>
</template>
<script setup lang="ts">
import {computed,ref,watch} from 'vue';import {RouterLink} from 'vue-router';import SourceFields from './SourceFields.vue';import {safeLink} from './catalog';
import {loadOfficialRaw,factLabels,showFact,yearText,vacancy,oldSnapshot,type OfficialRecord,type OfficialResource} from './official-data';
const props=defineProps<{record:OfficialRecord;resource?:OfficialResource}>();
const rawFields=ref<Record<string,string>|null>(null),rawError=ref('');watch(()=>props.record.id,()=>{rawFields.value=null;rawError.value='';});
async function reveal(event:Event){if(!(event.target as HTMLDetailsElement).open||rawFields.value)return;const id=props.record.id;try{const raw=await loadOfficialRaw(props.record);if(id===props.record.id)rawFields.value=raw;}catch(e){rawError.value=String(e);}}
const visibleFacts=computed(()=>Object.fromEntries(Object.entries(props.record.normalized.facts).filter(([k])=>!['vacancies','serving_nets_raw'].includes(k))));
const served=computed(()=>props.record.normalized.facts.serving_nets_raw as Record<string,string>|undefined);
</script>
<style scoped>.official-record code{overflow-wrap:anywhere}.official-record dd{white-space:pre-wrap}.official-record h3{margin-top:0}</style>
