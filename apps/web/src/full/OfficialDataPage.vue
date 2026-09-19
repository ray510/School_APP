<template>
 <main class="wrap official-page">
  <p class="eyebrow">OFFICIAL SCHOOL DATA</p><h1>官方選校資料、空缺與校網</h1>
  <p>此區按官方結構化來源展示，不由 JEV 推算資格、費用、容量或空缺。資料與收生學年分開，沒有以舊年份推算當屆安排。</p>
  <nav class="actions" aria-label="新增資料導航"><RouterLink v-for="(name,id) in officialNames" :key="id" :to="{path:'/official-data',query:{source:id}}">{{ id }} {{ name }}</RouterLink></nav>
  <p v-if="error" role="alert">{{ error }}</p><p v-else-if="loading" role="status">正在讀取所選官方資料…</p>
  <template v-else-if="manifest&&dataset">
   <section class="panel"><h2>{{ dataset.source.title }}</h2><p class="notice">{{ dataset.source.warning }}</p>
    <p>本次收錄 {{ dataset.total_rows }} 筆來源紀錄。選取的是此來源已明確標示的最新資源版本，不表示所有內容均適用於目標入學年。</p>
    <p><a :href="dataset.source.catalog_url" target="_blank" rel="noopener noreferrer">官方資料目錄</a> · <a :href="dataset.source.dictionary_url" target="_blank" rel="noopener noreferrer">官方欄位說明</a> · <a href="/downloads/official-eight.zip" download>下載八來源資料包</a></p>
    <p v-if="sourceCode==='A11'">校網地圖使用每筆官方「校網檔案／地圖」連結。本版未繪製自行推定的界線，亦不採集家居位置。</p>
   </section>
   <form class="filters" @submit.prevent="page=1">
    <label>校名、地址、校號或校網<input v-model="query" maxlength="200" placeholder="例如上水、95、HK1" /></label>
    <label>資料資源<select v-model="resourceId"><option value="">全部所選資源（較大）</option><option v-for="r in dataset.source.resources" :key="r.resource_id" :value="r.resource_id">{{ r.name }}</option></select></label>
    <label>地區<select v-model="district"><option value="">全部地區</option><option v-for="d in districts" :key="d" :value="d">{{ d }}</option></select></label>
    <template v-if="sourceCode==='A08'"><label>年級<select v-model="grade"><option>K1</option><option>K2</option><option>K3</option></select></label><label>空缺狀態<select v-model="vacancyState"><option value="">全部（包括未知）</option><option value="Y">有學位空缺</option><option value="N">沒有學位空缺</option><option value="P">正處理候補名單</option><option value="NA">沒有相關資料</option></select></label></template>
    <label v-if="sourceCode==='A12'">中學所屬校網<select v-model="net"><option value="">全部所屬網</option><option v-for="n in nets" :key="n">{{ n }}</option></select></label>
    <label v-if="sourceCode==='A12'">服務校網（原值 Y）<select v-model="serving"><option value="">不限</option><option v-for="n in allNets" :key="n">{{ n }}</option></select></label>
    <label v-if="sourceCode==='A10'">一條龍組別<select v-model="group"><option value="">全部組別</option><option v-for="g in groups" :key="g">{{ g }}</option></select></label>
   </form>
   <p v-if="rowsLoading" role="status">正在讀取所選資源索引…</p>
   <p aria-live="polite"><strong>{{ filtered.length }}</strong> 筆符合 · 每頁40筆（不是抽樣）。</p>
   <OfficialRecordCard v-for="r in visible" :key="r.id" :record="r" :resource="dataset.source.resources.find(s=>s.resource_id===r.resource_id)" />
   <p v-if="!filtered.length&&!rowsLoading">未有符合條件的已收錄紀錄；不代表該校不存在、沒有空缺或不符合申請資格。</p>
   <div class="pagination"><button :disabled="page<=1" @click="page--">上一頁</button><span>{{ page }} / {{ pages }}</span><button :disabled="page>=pages" @click="page++">下一頁</button></div>
  </template>
 </main>
</template>
<script setup lang="ts">
import {computed,ref,watch} from 'vue';import {RouterLink,useRoute} from 'vue-router';import OfficialRecordCard from './OfficialRecordCard.vue';
import {officialNames,loadOfficialManifest,loadOfficialJSON,loadOfficialRows,vacancy,type OfficialRecord,type OfficialManifest,type OfficialDataset} from './official-data';
const route=useRoute();const manifest=ref<OfficialManifest|null>(null),dataset=ref<OfficialDataset|null>(null),error=ref(''),loading=ref(false);
const rows=ref<OfficialRecord[]>([]),rowsLoading=ref(false),serving=ref(''),group=ref('');const allNets=['HK1','HK2','HK3','HK4','KL1','KL2','KL3','KL4','KL5','NT1','NT2','NT3','NT4','NT5','NT6','NT7','NT8','NT9'];
const query=ref(''),district=ref(''),resourceId=ref(''),grade=ref('K1'),vacancyState=ref(''),net=ref(''),page=ref(1);let generation=0;
const sourceCode=computed(()=>Object.hasOwn(officialNames,String(route.query.source))?String(route.query.source):route.path==='/vacancies'?'A08':route.path==='/school-nets'?'A11':'A02');
const normalize=(v:string)=>v.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,'');
const districts=computed(()=>[...new Set(rows.value.map(r=>r.normalized.district).filter(Boolean)??[])].sort());
const groups=computed(()=>[...new Set(rows.value.map(r=>String(r.normalized.facts.group_id??'')).filter(Boolean))]);
const nets=computed(()=>[...new Set(rows.value.map(r=>r.normalized.facts.home_net).filter((x):x is string=>typeof x==='string')??[])].sort());
const filtered=computed(()=>rows.value.filter(r=>(!resourceId.value||r.resource_id===resourceId.value)&&(!district.value||r.normalized.district===district.value)&&(!group.value||r.normalized.facts.group_id===group.value)&&(!net.value||r.normalized.facts.home_net===net.value)&&(!serving.value||(r.normalized.facts.serving_nets_raw as Record<string,string>|undefined)?.[serving.value]==='Y')&&(!vacancyState.value||vacancy(r,grade.value).code===vacancyState.value)&&normalize([r.normalized.name,r.normalized.english_name,r.normalized.address,r.normalized.school_number,r.normalized.facts.net,r.normalized.facts.area,r.normalized.facts.home_net,r.normalized.facts.group_id].join(' ')).includes(normalize(query.value)))??[]);
const pages=computed(()=>Math.max(1,Math.ceil(filtered.value.length/40)));const visible=computed(()=>filtered.value.slice((page.value-1)*40,page.value*40));
watch([query,district,resourceId,grade,vacancyState,net,serving,group],()=>{page.value=1;});
watch(()=>[sourceCode.value,route.query.q],async()=>{const code=sourceCode.value;const g=++generation;loading.value=true;error.value='';query.value=typeof route.query.q==='string'?route.query.q:'';district.value='';net.value='';serving.value='';group.value='';rows.value=[];vacancyState.value='';page.value=1;try{
 const m=await loadOfficialManifest();const d=await loadOfficialJSON<OfficialDataset>('/official/'+m.bundle_id+'/'+code+'.json');
 if(d.bundle_id!==m.bundle_id||d.source.code!==code||d.total_rows!==d.source.resources.reduce((n,r)=>n+r.row_count,0))throw new Error('資料版本或紀錄數不一致');
 if(g===generation){manifest.value=m;dataset.value=d;resourceId.value=code==='A02'?d.source.resources.find(r=>r.role==='registration')?.resource_id??'':'';}
 }catch(e){if(g===generation)error.value=String(e);}finally{if(g===generation)loading.value=false;}},{immediate:true});
let rowGeneration=0;
watch([dataset,resourceId],async()=>{const d=dataset.value;if(!d)return;const generation=++rowGeneration;rowsLoading.value=true;rows.value=[];try{const result=await loadOfficialRows(d,resourceId.value);if(generation===rowGeneration)rows.value=result;}catch(e){if(generation===rowGeneration)error.value=String(e);}finally{if(generation===rowGeneration)rowsLoading.value=false;}});
</script>
<style scoped>.official-page{padding:28px 20px}.official-page nav{margin:20px 0}.official-page h1{font-size:clamp(1.5rem,4vw,2.3rem)}</style>
