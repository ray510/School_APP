<template>
 <section><p class="eyebrow">SOURCE-BASED ANALYTICS</p><h1>資料分析</h1><p>統計由程式計算。每次只選一份來源版本，分母是原始紀錄數，不是去重後獨立學校數；不混合名錄與概覽作學校排名。</p>
 <p v-if="error" role="alert">{{ error }}</p><p v-else-if="!data" role="status">正在載入分析資料…</p>
 <template v-else>
  <div class="panel"><h2>JEV 分析狀態</h2><p v-if="data.provider">供應商：{{ data.provider }} · 模型：{{ data.model_returned.join('、')||data.model_requested }}</p><p v-else>未取得可用的 JEV 分析結果；分類與下方來源統計仍可使用。</p>
   <p v-if="data.reason">原因：{{ data.reason }}。未分析不會被當成「未提及」。</p>
   <p>已完成模型分析 {{ data.status_counts.ANALYZED||0 }} ／ {{ manifest.stats.annual_rows }} 筆年度來源紀錄；尚未經人工標註校準。</p>
   <p class="muted">只將公開來源片段送至模型；不傳送家長筆記。數字、分類、比例及圖表由程式處理。</p>
  </div>
  <form class="filters" @submit.prevent><label class="wide">統計來源與版本<select v-model="sourceId"><option v-for="s in manifest.sources" :key="s.id" :value="s.id">{{ s.label }} — {{ s.rows }} 筆</option></select></label><label>學段<select v-model="level"><option value="">此來源全部學段</option><option v-for="[k,v] in Object.entries(levels)" :key="k" :value="k">{{ v }}</option></select></label><label>地區<select v-model="district"><option value="">全部地區</option><option v-for="d in districts" :key="d" :value="d">{{ d||'來源未提供' }}</option></select></label></form>
  <p class="notice">{{ manifest.sources.find(s=>s.id===sourceId)?.edition }}。目前分母：<strong data-testid="cohort-size">{{ cohort.length }}</strong> 筆來源紀錄。入學年份不會重寫此來源版本。</p>
  <section class="panel"><h2>官方分類分布</h2><p>按本份來源欄位計算；不以其他年份或同名學校資料補值。</p>
   <div v-for="[key,title] in dimensions" :key="key"><h3>{{ title }}</h3><table class="analytics-table"><thead><tr><th>來源分類</th><th>紀錄數</th><th>佔目前分母</th></tr></thead><tbody><tr v-for="row in dimensionCounts(cohort,key)" :key="row.label"><td>{{ row.label }}</td><td>{{ row.count }}</td><td>{{ percentage(row.count,cohort.length) }}</td></tr></tbody></table></div>
  </section>
  <section v-if="sourceId!=='edb-school-directory'" class="panel"><h2>概覽文字提及分布</h2><p>JEV 標籤只描述送審片段。未提及、明確否定、待覆核、未分析及呼叫錯誤各自計數，分母包含全部所選紀錄。</p>
   <div class="comparison"><table class="analytics-table"><thead><tr><th>文字標籤</th><th v-for="(label,status) in statusNames" :key="status">{{ label }}</th></tr></thead><tbody><tr v-for="(label,tag) in tagNames" :key="tag"><th>{{ label }}</th><td v-for="(_,status) in statusNames" :key="status">{{ tagCounts(cohort,tag)[status]||0 }}</td></tr></tbody></table></div>
   <form class="filters" @submit.prevent><label>查看標籤<select v-model="tag"><option value="">全部紀錄</option><option v-for="(label,id) in tagNames" :key="id" :value="id">{{ label }}</option></select></label><label>處理狀態<select v-model="status"><option value="">所有狀態</option><option v-for="(label,id) in statusNames" :key="id" :value="id">{{ label }}</option></select></label></form>
  </section>
  <section class="panel"><h2>來源紀錄及證據入口</h2><p>篩選符合 {{ matches.length }} 筆；按來源行號顯示，沒有按品質或錄取機會排序。</p><button @click="exportRows">匯出目前分析 JSON</button><ol class="analytics-records"><li v-for="r in visible" :key="r.source_id+':'+r.row"><RouterLink :to="'/schools/'+r.school_id">{{ r.name }}</RouterLink> · 來源第 {{ r.row }} 筆 · {{ r.district||'地區未提供' }}<span v-if="tag"> · {{ statusNames[r.labels[tag]?.status]||'未分析' }}</span></li></ol><button v-if="visible.length<matches.length" class="light" @click="limit+=40">顯示更多紀錄</button></section>
 </template></section>
</template>
<script setup lang="ts">
import {ref,computed,watch} from 'vue';import {RouterLink} from 'vue-router';import {readJSON,download,levels,type Manifest} from './catalog';import {dimensionCounts,percentage,tagCounts,tagNames,statusNames,type AnalyticsData} from './analytics';
const props=defineProps<{manifest:Manifest}>();const data=ref<AnalyticsData|null>(null),error=ref('');const sourceId=ref('chsc-primary-profiles'),level=ref(''),district=ref(''),tag=ref(''),status=ref(''),limit=ref(40);
const sourceRows=computed(()=>data.value?.entries.filter(r=>r.source_id===sourceId.value)??[]);
const districts=computed(()=>[...new Set(sourceRows.value.map(r=>r.district))].filter(Boolean).sort());
const cohort=computed(()=>sourceRows.value.filter(r=>(!level.value||r.level===level.value)&&(!district.value||r.district===district.value)));
const dimensions=computed<Array<['funding_type'|'kg_operator_type'|'kg_scheme_participation',string]>>(()=>sourceId.value==='edb-kg-profiles'?[['kg_operator_type','幼稚園營辦性質'],['kg_scheme_participation','幼稚園教育計劃']]:[['funding_type','來源資助類別']]);
const matches=computed(()=>cohort.value.filter(r=>!tag.value||!status.value||r.labels[tag.value]?.status===status.value).sort((a,b)=>a.row-b.row));const visible=computed(()=>matches.value.slice(0,limit.value));
watch(sourceId,()=>{district.value='';level.value='';tag.value='';status.value='';limit.value=40;});watch([level,district,tag,status],()=>{limit.value=40;});
watch(()=>props.manifest.data_id,async(id)=>{try{const d=await readJSON<AnalyticsData>('/data/'+id+'/analytics.json');if(d.schema!==1||d.cohort_unit!=='SOURCE_RECORD'||d.entries.length!==props.manifest.stats.source_record_count)throw new Error('分析資料版本或分母不一致。');data.value=d;}catch(e){error.value=String(e);}},{immediate:true});
function exportRows(){download('school-source-analysis.json',JSON.stringify({data_id:props.manifest.data_id,source_id:sourceId.value,denominator:cohort.value.length,unit:'SOURCE_RECORD',quality_status:data.value?.quality_status,records:matches.value},null,2));}
</script>

<style>
/* Evidence analytics uses native tables and exact-count denominators, not rankings. */
.analytics-table{width:100%;border-collapse:collapse;margin:1rem 0;text-align:left}.analytics-table th,.analytics-table td{padding:.7rem;border-bottom:1px solid #dfe5e5}.analytics-records{padding-left:1.25rem}.analytics-records li{margin:.6rem 0}.tag-evidence{padding:.75rem 0;border-bottom:1px solid #dfe5e5}.tag-evidence summary{cursor:pointer}.tag-evidence blockquote{white-space:pre-wrap;overflow-wrap:anywhere;border-left:3px solid #28666b;padding:1rem;margin:.7rem 0;background:#f4f8f7}.classification-field{margin-bottom:1rem}.classification-field p{overflow-wrap:anywhere}
</style>
