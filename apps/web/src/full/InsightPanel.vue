<template>
 <section class="panel insight-panel" data-testid="sitewide-insights"><div class="heading"><div><p class="eyebrow">JEV · SOURCE-BASED INSIGHTS</p><h2>{{ ids.length>1?'深入教學與支援比較':'JEV 選校重點與查詢方向' }}</h2></div><RouterLink to="/sources#jev-source">來源及分析方法 →</RouterLink></div>
 <p v-if="loading" aria-live="polite">正在讀取有來源證據的分析…</p><p v-if="error" role="alert">{{ error }} 原始學校資料仍可查看。</p>
 <p>以概覽文字整理實際安排，並提供向學校查詢的方向；不是學校評分。只展示所選來源版本，未提及與沒有提供分開。</p>
 <div v-for="tag in tags" :key="tag" class="insight-topic"><h3>{{ extendedTopics[tag].label }}</h3><p class="muted">查詢方向：{{ extendedTopics[tag].question }}</p><div class="insight-grid">
  <article v-for="s in items" :key="s.id" :data-school="s.id"><h4 v-if="items.length>1">{{ s.name }}</h4><template v-for="topic in s.topics.filter(t=>t.id===tag)" :key="topic.id"><strong>{{ comparisonStatus[topic.cell.status]??topic.cell.status }}</strong><p v-if="topic.cell.evidence" class="excerpt">{{ excerpt(topic.cell.evidence.text) }}</p><p v-else>沒有可展示的肯定證據；不能据此推定學校不提供。</p><small v-if="topic.cell.edition">{{ topic.cell.edition }} · 第 {{ topic.cell.row }} 筆</small><details v-if="topic.cell.evidence"><summary>查看完整引文及資料來源</summary><blockquote>{{ topic.cell.evidence.text }}</blockquote><p>原始欄位：{{ topic.cell.evidence.field }}</p><p v-if="topic.cell.status==='REVIEW'">此項待覆核，不能當成確定安排。</p><RouterLink :to="{path:'/sources',query:{source:topic.cell.source_id},hash:'#'+topic.cell.source_id}">查看這份來源 →</RouterLink><small>{{ topic.cell.model }}</small></details></template></article>
 </div></div>
 <p class="muted">同一主題有提及不代表課時、內容或品質相同；請以目標學年公告核實。</p>
 </section>
</template>
<script setup lang="ts">
import {ref,watch} from 'vue';import {RouterLink} from 'vue-router';import {insightFor,extendedTopics,type SchoolInsight} from './sitewide';import {comparisonStatus} from './comparison';
const props=defineProps<{ids:string[];dataId:string}>();const items=ref<SchoolInsight[]>([]),loading=ref(false),error=ref('');const tags=Object.keys(extendedTopics);let generation=0;
const excerpt=(text:string)=>{const chars=Array.from(text);return chars.slice(0,170).join('')+(chars.length>170?'…':'');};
watch(()=>props.ids.join(',')+props.dataId,async()=>{const gen=++generation;loading.value=true;error.value='';items.value=[];try{const result=await Promise.all(props.ids.map(id=>insightFor(id,props.dataId)));if(gen===generation)items.value=result;}catch(e){if(gen===generation)error.value=String(e);}finally{if(gen===generation)loading.value=false;}},{immediate:true});
</script>
<style scoped>
.insight-topic{padding:18px 0;border-bottom:1px solid #dce5e9}.insight-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}.insight-grid article{min-width:0;background:#f5f8f7;padding:18px;border-radius:10px}.insight-grid h4{margin-top:0}.excerpt,blockquote{white-space:pre-wrap;overflow-wrap:anywhere}blockquote{margin:0;border-left:3px solid #176751;padding-left:14px}details{font-size:14px}@media(max-width:600px){.insight-grid{grid-template-columns:1fr}}
</style>
