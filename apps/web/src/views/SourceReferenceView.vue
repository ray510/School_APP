<template>
  <section>
    <h1>年度概覽原文</h1>
    <p class="notice">以下按官方来源與概覽版本展示，未與基本名錄作確定身份配對。概覽版本不等於入學年份；原文內的日期及收費不會自動變成當屆招生安排。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <label>概覽來源 <select v-model="selectedSource" @change="loadIndex"><option v-for="source in sources" :key="source.id" :value="source.id">{{ labels[source.level] }} — {{ source.edition }}</option></select></label>
    <p v-if="activeSource">{{ activeSource.rows }} 筆來源紀錄；{{ activeSource.columns }} 欄。<a :href="activeSource.source_url" target="_blank" rel="noopener noreferrer">官方原始來源</a></p>
    <label>搜尋學校 <input v-model="query" type="search" maxlength="200" placeholder="校名或地址" @input="page=1" /></label>
    <p v-if="loading" role="status">正在讀取…</p>
    <template v-else-if="!selectedRecord">
      <p>符合條件：{{ filtered.length }} 筆；第 {{ page }} 頁</p>
      <article v-for="record in visible" :key="record.id" class="card"><h2>{{ record.name }}</h2><p>{{ record.address }}</p><button @click="openRecord(record.id)">查看原文欄位</button></article>
      <button :disabled="page<=1" @click="page--">上一頁</button> <button :disabled="page*20>=filtered.length" @click="page++">下一頁</button>
    </template>
    <article v-if="selectedRecord" class="card">
      <button @click="selectedRecord=null">返回列表</button>
      <h2>{{ selectedRecord.name }}</h2><p>{{ selectedRecord.address }}</p>
      <p>配對狀態：獨立來源紀錄，未確認跨來源身份。內容保留原文；空白代表來源未提供。</p>
      <dl><template v-for="(value,label) in selectedRecord.fields" :key="label"><dt>{{ label }}</dt><dd>{{ value || '未提供' }}</dd></template></dl>
    </article>
  </section>
</template>
<script setup lang="ts">
import {ref,computed,onMounted,onBeforeUnmount} from 'vue';
import {z} from 'zod';
import {SafeUrl} from '@hk-school/contracts/domain';
const SourceId=z.enum(['edb-kg-profiles','chsc-primary-profiles','chsc-secondary-profiles']);
const Source=z.object({id:SourceId,level:z.enum(['KG','PRIMARY','SECONDARY']),edition:z.string(),source_url:SafeUrl,raw_sha256:z.string().regex(/^[a-f0-9]{64}$/),fetched_at:z.string(),rows:z.number(),columns:z.number()});
const Entry=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),name:z.string(),address:z.string(),source_record_key:z.string()});
const RecordData=z.object({name:z.string(),address:z.string(),identity_link_status:z.literal('UNLINKED_SOURCE_RECORD'),fields:z.record(z.string())});
const labels={KG:'幼稚園',PRIMARY:'小學',SECONDARY:'中學'};
const sources=ref<z.infer<typeof Source>[]>([]);const selectedSource=ref<z.infer<typeof SourceId>>('chsc-primary-profiles');
const records=ref<z.infer<typeof Entry>[]>([]);const selectedRecord=ref<z.infer<typeof RecordData>|null>(null);
const query=ref('');const page=ref(1);const loading=ref(false);const error=ref('');let controller:AbortController|undefined;
const activeSource=computed(()=>sources.value.find(s=>s.id===selectedSource.value));
const filtered=computed(()=>{const q=query.value.trim().normalize('NFC').toLowerCase();return records.value.filter(r=>(r.name+' '+r.address).normalize('NFC').toLowerCase().includes(q));});
const visible=computed(()=>filtered.value.slice((page.value-1)*20,page.value*20));
async function json(path:string,signal:AbortSignal):Promise<unknown>{const r=await fetch(path,{signal,cache:'no-store'});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw new Error('Source reference files are not available');return r.json();}
async function loadIndex(){controller?.abort();controller=new AbortController();const signal=controller.signal;loading.value=true;error.value='';selectedRecord.value=null;page.value=1;
  try{const data=z.object({records:z.array(Entry)}).parse(await json('/source-reference/'+selectedSource.value+'/index.json',signal));if(!signal.aborted)records.value=data.records;}
  catch{if(!signal.aborted){records.value=[];error.value='年度資料未載入。測試站資料包尚未安裝，或來源暫時無法讀取。';}}finally{if(!signal.aborted)loading.value=false;}
}
async function openRecord(id:string){controller?.abort();controller=new AbortController();const signal=controller.signal;loading.value=true;error.value='';
  try{const data=RecordData.parse(await json('/source-reference/'+selectedSource.value+'/'+id+'.json',signal));if(!signal.aborted)selectedRecord.value=data;}
  catch{if(!signal.aborted)error.value='未能讀取原文紀錄。';}finally{if(!signal.aborted)loading.value=false;}
}
onMounted(async()=>{controller=new AbortController();try{sources.value=z.object({sources:z.array(Source)}).parse(await json('/source-reference/manifest.json',controller.signal)).sources;await loadIndex();}catch{error.value='未安裝年度來源資料包；不會顯示示範學校。';}});
onBeforeUnmount(()=>controller?.abort());
</script>
<style scoped>
.notice{padding:1rem;border-left:4px solid #967333;background:#fff8e7;line-height:1.7}label{display:block;margin:1rem 0}select,input{display:block;max-width:100%;padding:.6rem}.card{padding:1rem;border:1px solid #ddd;margin:1rem 0}dl{display:grid;grid-template-columns:minmax(110px,1fr) minmax(0,3fr);gap:.7rem}dt{font-weight:600}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:600px){dl{display:block}dd{margin:.3rem 0 1rem}}
</style>
