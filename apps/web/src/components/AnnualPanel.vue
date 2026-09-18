<template>
  <section class="panel"><h2>年度概覽與來源證據</h2><p>概覽版本不是你的目標入學年份。以下內容為學校向官方概覽提供的資料，並非平台對教學質素的評分或當屆收生承諾。</p>
    <button v-if="!loaded" :disabled="loading" @click="load">{{ loading?'正在讀取年度概覽…':'查看已審核年度概覽' }}</button>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="loaded&&!profiles.length" class="empty">此校尚未有完成跨來源識別審核並已發佈的年度概覽。請透過基本資料頁的官方來源核對，不會以同名學校資料代替。</p>
    <label v-if="profiles.length">搜尋概覽欄位<input v-model="keyword" maxlength="100" placeholder="例如：教學語言、校車、學費" /></label>
    <article v-for="item in profiles" :key="item.release_id+item.profile.record_hash" class="card">
      <h3>{{ item.profile.profile_edition }} · {{ item.profile.school_name }}</h3>
      <p class="muted">來源版本原名：{{ item.profile.catalogue_label }}</p><p v-if="item.scope!=='full'" class="notice warning">此資料發佈為小樣本範圍，不代表此版本已覆蓋全部學校。</p>
      <p><a :href="item.profile.source_url" target="_blank" rel="noopener noreferrer">官方原始資料</a> · 取得日期 {{ item.profile.fetched_at.slice(0,10) }}</p>
      <dl class="data-list"><template v-for="fact in matching(item.profile)" :key="fact.label"><dt>{{ fact.label }}</dt><dd class="annual-value"><span v-if="fact.is_planned" class="badge">擬開設</span>{{ fact.value??'未提供' }}<small v-if="fact.reference_period">（欄位明示時期：{{ fact.reference_period }}）</small></dd></template></dl>
      <details><summary>識別及版本證據</summary><p>原始檔 SHA-256：{{ item.profile.raw_sha256 }}</p><p>紀錄雜湊：{{ item.profile.record_hash }}</p><p>跨來源對應已核對；審核日期：{{ item.profile.identity_evidence.reviewed_at.slice(0,10) }}</p><p>未標示確切時期的欄位，不會從入學年份推算。</p></details>
    </article>
  </section>
</template>
<script setup lang="ts">
import {ref,watch} from 'vue';import {z} from 'zod';
import {AnnualProfile,type AnnualSchoolProfile} from '@hk-school/contracts/annual';import {getData} from '../lib/api';
const props=defineProps<{schoolId:string;level:string}>();
const Item=z.object({profile:AnnualProfile,release_id:z.string(),scope:z.string()});const profiles=ref<z.infer<typeof Item>[]>([]);const keyword=ref('');const loaded=ref(false);const loading=ref(false);const error=ref('');
watch(()=>[props.schoolId,props.level],()=>{profiles.value=[];loaded.value=false;error.value='';});
async function load(){loading.value=true;error.value='';const school=props.schoolId;const level=props.level;try{const result=await getData('/api/v1/annual-profiles?'+new URLSearchParams({school,level}),z.array(Item));if(props.schoolId===school&&props.level===level){profiles.value=result.data;loaded.value=true;}}catch(e){error.value=e instanceof Error?e.message:'讀取失敗';}finally{loading.value=false;}}
function matching(profile:AnnualSchoolProfile){const needle=keyword.value.trim().toLowerCase();return profile.facts.filter(fact=>!needle||fact.label.toLowerCase().includes(needle));}
</script>
<style scoped>.annual-value{white-space:pre-wrap;overflow-wrap:anywhere}details{margin-top:20px;overflow-wrap:anywhere}small{display:block}</style>
