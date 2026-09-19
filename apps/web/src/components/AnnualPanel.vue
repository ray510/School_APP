<template>
 <section class="panel"><h2>年度概覽與來源證據</h2><p class="notice">概覽年份不是目標入學年份。以下是學校提供的資料，不是平台對教學質素的認證，也不保證當屆安排相同。</p>
 <p v-if="loading" role="status">正在讀取已配對年度概覽…</p><p v-if="error" class="notice error" role="alert">{{ error }}</p>
 <p v-if="!loading&&!error&&!profiles.length" class="empty">此校尚未有完成跨來源識別審核並已發佈的年度概覽。不會以同名學校資料代替。</p>
 <article v-for="item in profiles" :key="item.release_id+item.profile.record_hash" class="card">
  <h3>{{ item.profile.profile_edition }} · {{ item.profile.school_name }}</h3>
  <p>試點配對：校名、地址、聯絡及來源識別資料經逐項比對。範圍為北區試點，並非全港已核實。</p>
  <p v-if="item.profile.level==='KG'" class="notice warning">幼稚園年度概覽屬校址整體，本輪只連接一個上午班名錄紀錄。托兒服務收費不會當作 K1 學費；其他班別尚未合併。</p>
  <dl class="data-list"><template v-for="field in summarizeAnnual(item.profile)" :key="field.key"><dt>{{ field.label }}</dt><dd class="annual-value"><span v-if="field.planned" class="badge">擬開設</span><a v-if="field.link" :href="field.link" target="_blank" rel="noopener noreferrer">查看來源收費證明書（須核對其適用年份）</a><span v-else>{{ field.value }}</span><small>{{ field.period }}</small><small>原欄位：{{ field.sourceLabel }}</small></dd></template></dl>
  <p><a :href="item.profile.source_url" target="_blank" rel="noopener noreferrer">官方原始資料</a> · 取得日期 {{ item.profile.fetched_at.slice(0,10) }}</p>
  <details><summary>查看全部原文欄位及配對證據</summary><label>搜尋概覽欄位<input v-model="keyword" maxlength="100" placeholder="例如：學費、校車" /></label>
   <dl class="data-list"><template v-for="fact in matching(item.profile)" :key="fact.label"><dt>{{ fact.label }}</dt><dd class="annual-value">{{ fact.value??'未提供' }}<small v-if="fact.reference_period">{{ fact.reference_period }}</small></dd></template></dl>
   <p>來源版本：{{ item.profile.catalogue_label }}</p><p>原始檔 SHA-256：{{ item.profile.raw_sha256 }}</p><p>紀錄雜湊：{{ item.profile.record_hash }}</p><p>審核者：{{ item.profile.identity_evidence.reviewer }}（AI 協助來源核對，非官方或人工認證）</p><p>核對日期：{{ item.profile.identity_evidence.reviewed_at }}</p><p>資料版本：{{ item.release_id }}</p>
  </details>
 </article></section>
</template>
<script setup lang="ts">
import {ref,watch,onBeforeUnmount} from 'vue';import {z} from 'zod';import {AnnualProfile,type AnnualSchoolProfile} from '@hk-school/contracts/annual';import {summarizeAnnual} from '@hk-school/contracts/pilot';import {getData} from '../lib/api';
const props=defineProps<{schoolId:string;level:string}>();const Item=z.object({profile:AnnualProfile,release_id:z.string(),scope:z.string()});const profiles=ref<z.infer<typeof Item>[]>([]);const keyword=ref('');const loading=ref(false);const error=ref('');let controller:AbortController|undefined;
watch(()=>[props.schoolId,props.level],async()=>{controller?.abort();controller=new AbortController();const current=controller;profiles.value=[];error.value='';loading.value=true;
 try{const result=await getData('/api/v1/annual-profiles?'+new URLSearchParams({school:props.schoolId,level:props.level}),z.array(Item),current.signal);if(!current.signal.aborted)profiles.value=result.data;}catch(e){if(!current.signal.aborted)error.value=e instanceof Error?e.message:'讀取失敗';}finally{if(!current.signal.aborted)loading.value=false;}
},{immediate:true});onBeforeUnmount(()=>controller?.abort());
function matching(profile:AnnualSchoolProfile){const needle=keyword.value.trim().toLowerCase();return profile.facts.filter(fact=>!needle||fact.label.toLowerCase().includes(needle));}
</script>
<style scoped>.annual-value{white-space:pre-wrap;overflow-wrap:anywhere}details{margin-top:20px;overflow-wrap:anywhere}small{display:block;color:#4b5563;margin-top:6px}</style>
