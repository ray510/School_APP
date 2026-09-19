<template>
 <a class="skip" href="#content">跳至比較內容</a>
 <header><div class="wrap header"><RouterLink class="brand" to="/">香港選校年鑑<span>HK SCHOOL GUIDE</span></RouterLink><nav aria-label="主要導覽"><RouterLink to="/schools">全港選校</RouterLink><RouterLink to="/schools?collection=annual">年度概覽</RouterLink><RouterLink to="/calendar">招生日期</RouterLink><RouterLink to="/shortlist">私人清單</RouterLink><RouterLink to="/analytics">資料分析</RouterLink><RouterLink to="/sources">資料來源</RouterLink></nav></div></header>
 <main id="content" class="wrap compare-page">
  <h1>學校資料比較</h1><p>同學段兩至四項。先看 JEV 原文分析，再比較官方資料；不作學校排名、錄取概率或學生適合度評分。</p>
  <RouterLink to="/schools?collection=annual">← 繼續選校</RouterLink>
  <p v-if="loading" role="status">正在載入同一資料版本的學校與 JEV 分析…</p>
  <p v-else-if="error" role="alert" class="alert">{{ error }} <button @click="load">重新載入</button></p>
  <template v-else-if="manifest&&schools.length>=2">
   <KGDecisionComparison v-if="schools.every(s=>s.level==='KG')" :schools="schools" :year="year" :sources="manifest.sources" :cohort="cohort" />
   <InsightPanel :ids="schools.map(s=>s.id)" :data-id="manifest.data_id" /><section class="panel" aria-labelledby="jev-comparison-heading" data-testid="jev-comparison">
    <div class="heading"><div><p class="eyebrow">JEV EVIDENCE COMPARISON</p><h2 id="jev-comparison-heading">JEV 證據比較</h2></div><button @click="exportComparison">匯出比較分析 JSON</button></div>
    <p>使用已發布的 JEV 分析結果，並由程式整理共同點及記載差異；本頁不即時重跑模型，也不傳送你的私人筆記。</p>
    <p class="notice">目標入學學年：{{ year }}/{{ year+1 }}。分析以原文概覽版本及送審片段為準，並非當屆服務保證。待覆核、未分析、回應無效及未提及分開顯示；模型結果尚未經真人標註集校準。</p>
    <div class="filters"><label class="wide">比較來源版本<select v-if="cohorts.length" v-model="cohort"><option v-for="c in cohorts" :key="c.key" :value="c.key">{{ c.label }}（{{ c.schools }}/{{ schools.length }} 項有直接對應）</option></select><span v-else>所選資料組均沒有直接對應的年度概覽。</span></label><label>顯示分析主題<select v-model="topicFilter"><option value="all">全部六個主題</option><option value="common">共同提及</option><option value="different">記載差異</option><option value="uncertain">尚未能比較</option></select></label></div>
    <p data-testid="comparison-coverage">所選 {{ schools.length }} 項中，{{ analysedCount }} 項取得本版本模型回應；各主題仍可能需要覆核。</p>
    <div class="comparison" role="region" aria-label="JEV 各校文字證據對照" tabindex="0">
     <table data-testid="jev-comparison-table"><caption>六個文字主題按學校分欄；展開可見原文、來源行號及模型版本。</caption><thead><tr><th scope="col">主題與對照摘要</th><th v-for="s in schools" :key="s.id" scope="col"><RouterLink :to="schoolLink(s.id)">{{ s.name }}</RouterLink><small>{{ s.address }}</small></th></tr></thead>
      <tbody><tr v-for="topic in shown" :key="topic.id" :data-topic="topic.id"><th scope="row"><strong>{{ topic.label }}</strong><p class="relation-summary">{{ topic.summary }}</p></th>
       <td v-for="cell in topic.cells" :key="cell.school_id" :data-state="cell.status"><strong>{{ comparisonStatus[cell.status] }}</strong>
        <small v-if="cell.edition">{{ cell.edition }} · 第 {{ cell.row }} 筆</small>
        <p v-if="cell.status==='NO_PROFILE'||cell.status==='VERSION_MISMATCH'"><RouterLink :to="{path:'/schools',query:{q:cell.name,collection:'annual',year:String(year)}}">查閱同名年度概覽 →</RouterLink><small>請核對地址後重新選入比較；不自動借用其他校址資料。</small></p>
        <details v-if="cell.evidence" class="compare-evidence"><summary>查看原文證據</summary><p>來源欄位：{{ cell.evidence.field }}<br />字元 {{ cell.evidence.start }}–{{ cell.evidence.end }}（Unicode code points）</p><blockquote>{{ cell.evidence.text }}</blockquote><a v-if="sourceURL(cell.source_id)" :href="sourceURL(cell.source_id)!" target="_blank" rel="noopener noreferrer">官方來源 ↗</a><p v-if="cell.status==='REVIEW'">此引文只供覆核，不能當成已確認標籤。</p></details>
        <small v-else-if="cell.status==='NOT_STATED'">只表示送審片段沒有提及，不能推定學校沒有提供。</small>
        <small v-if="cell.model">模型：{{ cell.model }}</small><small v-if="cell.excerpts_truncated">原文曾截取，並非全文判斷。</small><small v-if="cell.reason">{{ cell.reason }}</small>
       </td>
      </tr></tbody>
     </table>
    </div>
    <p v-if="!shown.length">此篩選沒有相應主題；可切換「全部六個主題」。</p>
    <details class="compare-provenance"><summary>資料版本與比較方法</summary><p>資料 ID：<code>{{ manifest.data_id }}</code></p><p>比較方法：{{ COMPARISON_VERSION }}。同一來源版本逐校對照；只用所選資料組內，來源 ID、行號及紀錄 hash 全部一致的模型結果。共同提及不代表內容或品質相同。</p><p>資料擷取時間不是服務生效日期。信心值不是正確率，不能用作排名。</p></details>
   </section>
   <section class="panel" aria-labelledby="official-comparison-heading"><h2 id="official-comparison-heading">官方資料比較</h2><p>分類、時間及收費原文不由 JEV 重寫；未知值不當成零。</p>
    <div class="comparison" role="region" aria-label="各校官方欄位比較" tabindex="0"><table data-testid="official-comparison"><thead><tr><th scope="col">比較項目</th><th v-for="s in schools" :key="s.id" scope="col"><RouterLink :to="schoolLink(s.id)">{{ s.name }}</RouterLink></th></tr></thead><tbody><tr v-for="label in officialLabels" :key="label"><th scope="row">{{ label }}</th><td v-for="s in schools" :key="s.id"><template v-for="([,value,period],i) in fieldsFor(s).filter(x=>x[0]===label)" :key="i"><span>{{ display(value) }}</span><small>{{ period }}</small></template><span v-if="!fieldsFor(s).some(x=>x[0]===label)">來源未提供此項</span></td></tr></tbody></table></div>
   </section>
  </template>
 </main><footer class="wrap"><strong>香港選校年鑑</strong><p>獨立非官方平台 · JEV 原文分析不是學校評分</p><RouterLink to="/sources">來源及完整性</RouterLink> · <RouterLink to="/about">私隱</RouterLink></footer>
</template>
<script setup lang="ts">
import InsightPanel from './InsightPanel.vue';
import {computed,ref,watch} from 'vue';
import {RouterLink,useRoute} from 'vue-router';
import {readJSON,safeLink,download,display,fieldsFor,type School,type Manifest,type Summary} from './catalog';
import {loadSchoolDetails} from './profile-links';
import KGDecisionComparison from './KGDecisionComparison.vue';
import {cohortsFor,compareJev,comparisonStatus,cohortKey} from './comparison';
const COMPARISON_VERSION='source-linked-parent-comparison-v2';
const route=useRoute(),schools=ref<School[]>([]),manifest=ref<Manifest|null>(null),loading=ref(true),error=ref(''),cohort=ref(''),topicFilter=ref('all');let generation=0;
const year=computed(()=>{const n=Number(route.query.year);return Number.isInteger(n)&&n>=2000&&n<=2100?n:new Date().getFullYear()+1;});
const cohorts=computed(()=>cohortsFor(schools.value,manifest.value?.sources??[]));
const topics=computed(()=>schools.value.length>=2?compareJev(schools.value,cohort.value):[]);
const shown=computed(()=>topics.value.filter(t=>topicFilter.value==='all'||topicFilter.value==='common'&&t.relation==='COMMON_MENTION'||topicFilter.value==='different'&&['EXPLICIT_DIFFERENCE','DOCUMENTATION_DIFFERENCE'].includes(t.relation)||topicFilter.value==='uncertain'&&t.relation==='INSUFFICIENT'));
const analysedCount=computed(()=>schools.value.filter(s=>{const profiles=s.annual.filter(a=>cohortKey(a.source_id,a.edition)===cohort.value);if(profiles.length!==1)return false;const p=profiles[0];const aa=(s.semantic_annotations??[]).filter(a=>a.source_id===p.source_id&&a.row===p.row&&a.record_sha256===p.record_sha256);return aa.length===1&&aa[0].status==='ANALYZED';}).length);
const officialLabels=computed(()=>[...new Set(schools.value.flatMap(s=>fieldsFor(s).map(x=>x[0])))]);
const schoolLink=(id:string)=>({path:'/schools/'+id,query:{year:String(year.value)}});
const sourceURL=(id:string|null)=>safeLink(manifest.value?.sources.find(s=>s.id===id)?.catalog_url);
async function load(){const gen=++generation;loading.value=true;error.value='';schools.value=[];manifest.value=null;try{
 const ids=String(route.query.ids??'').split(',').filter(Boolean);
 if(ids.length<2||ids.length>4||new Set(ids).size!==ids.length||ids.some(id=>!/^school_[a-f0-9]{24}$/.test(id)))throw new Error('請選擇兩至四個不同的同學段資料項目。');
 const m=await readJSON<Manifest>('/catalog-manifest.json');
 if(m.environment!=='production'||!/^([a-f0-9]){64}$/.test(m.data_id)||m.coverage_status!=='COMPLETE_SELECTED_OFFICIAL_RESOURCES')throw new Error('資料版本未通過核對。');
 const index=await readJSON<Summary[]>('/data/'+m.data_id+'/index.json');
 const rows=await Promise.all(ids.map(id=>loadSchoolDetails(m,id,index)));
 if(rows.some((s,i)=>s.id!==ids[i]||!Array.isArray(s.annual)||!Array.isArray(s.directory))||new Set(rows.map(s=>s.level)).size!==1)throw new Error('請比較相同學段的學校，並確認資料版本一致。');
 if(gen!==generation)return;manifest.value=m;schools.value=rows;cohort.value=cohortsFor(rows,m.sources)[0]?.key??'';topicFilter.value='all';
 }catch(e){if(gen===generation)error.value=e instanceof Error?e.message:'比較資料暫時未能載入。';}finally{if(gen===generation)loading.value=false;}}
function exportComparison(){if(!manifest.value)return;download('hk-school-jev-comparison.json',JSON.stringify({schema:1,method:COMPARISON_VERSION,inference_mode:'REUSE_PUBLISHED_JEV_RESULTS',data_id:manifest.value.data_id,entry_year:year.value,cohort_key:cohort.value,quality_status:'NOT_HUMAN_CALIBRATED',school_ids:schools.value.map(s=>s.id),profile_links:schools.value.map(s=>({school_id:s.id,resolution:s.profile_resolution??null})),sources:manifest.value.sources.filter(s=>topics.value.some(t=>t.cells.some(c=>c.source_id===s.id))),topics:topics.value},null,2));}
watch(()=>route.fullPath,()=>void load(),{immediate:true});
</script>
<style scoped>
.compare-page{padding-top:2rem}.compare-page .comparison{width:100%;overflow:auto}.compare-page table{min-width:740px;width:100%;border-collapse:collapse;text-align:left;table-layout:fixed}.compare-page th,.compare-page td{padding:1rem;vertical-align:top;border-bottom:1px solid #dfe5e5;overflow-wrap:anywhere}.compare-page th:first-child{width:24%}.compare-page small{display:block;margin:.5rem 0;line-height:1.6}.compare-page caption{text-align:left;padding:.8rem;font-weight:normal}.relation-summary{font-weight:normal;line-height:1.7}.compare-evidence summary{cursor:pointer;margin:.8rem 0}.compare-evidence blockquote{white-space:pre-wrap;overflow-wrap:anywhere;border-left:3px solid #28666b;padding:.8rem;margin:.5rem 0;background:#f4f8f7;font-weight:normal}.compare-provenance code{overflow-wrap:anywhere}.compare-provenance{margin-top:1rem}.compare-page :focus-visible{outline:3px solid #28666b;outline-offset:3px}@media(max-width:600px){.compare-page th,.compare-page td{padding:.7rem}.compare-page .heading{display:block}.compare-page .heading button{margin-top:1rem}}
</style>
