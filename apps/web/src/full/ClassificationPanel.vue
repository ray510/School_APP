<template>
 <section class="panel" aria-labelledby="classification-heading"><h2 id="classification-heading">分類與原文依據</h2>
  <p v-if="level==='KG'" class="notice">幼稚園的私人營辦、非牟利性質、教育計劃參與，是三個不同維度；「私人營辦」不表示沒有政府資助。</p>
  <div v-for="[key,title] in dimensions" :key="key" class="classification-field"><h3>{{ title }}：{{ classification[key].label }}</h3>
   <p v-if="classification[key].state==='not_provided'">此資料組沒有可對應的來源欄位，沒有推算分類。</p>
   <details v-if="classification[key].evidence.length"><summary>查看分類原文與版本</summary>
    <p v-for="(e,i) in classification[key].evidence" :key="i"><strong>{{ e.field }}：{{ e.raw_value||'空欄位' }}</strong><br />{{ e.edition }} · 第 {{ e.row }} 筆 · <a v-if="safeLink(e.source_url)" :href="safeLink(e.source_url)!" target="_blank" rel="noopener noreferrer">原始來源</a></p>
   </details>
   <p v-if="classification[key].historical_differences?.length" class="notice">歷史概覽分類與名錄不同；保留各自版本，沒有用舊值覆蓋名錄。</p>
  </div>
 </section>
</template>
<script setup lang="ts">
import {computed} from 'vue';import {safeLink} from './catalog';import type {Classification} from './classification';
const props=defineProps<{classification:Classification;level:string}>();
const dimensions=computed<Array<['funding_type'|'kg_operator_type'|'kg_scheme_participation',string]>>(()=>props.level==='KG'?[['kg_operator_type','幼稚園營辦性質'],['kg_scheme_participation','幼稚園教育計劃'],['funding_type','教育局名錄營辦分類（不是資助判定）']]:[['funding_type','官方資助類別']]);
</script>
