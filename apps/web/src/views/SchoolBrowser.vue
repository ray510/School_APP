<template>
  <div class="row"><h1>{{ route.name==='school'?'學校資料':route.name==='compare'?'學校比較':'尋找學校' }}</h1><RouterLink to="/shortlist">我的私人清單</RouterLink></div>
  <form v-if="route.name==='schools'" class="panel filters" @submit.prevent="search">
    <label>入學學年<input v-model.number="year" type="number" min="2000" max="2100" required /></label>
    <label>學段<select v-model="level"><option value="KG">幼稚園</option><option value="PRIMARY">小學</option><option value="SECONDARY">中學</option></select></label>
    <label>校名關鍵字<input v-model="q" maxlength="200" placeholder="中文或英文校名" /></label>
    <label>地區（來源原文）<input v-model="district" maxlength="120" placeholder="留空顯示所有" /></label>
    <label>資助類別（來源原文）<input v-model="funding" maxlength="120" placeholder="留空顯示所有" /></label><button type="submit">搜尋</button>
  </form>
  <p class="notice">目標：{{ year }}/{{ year+1 }} 入學。以下概覽只作背景，並非已核實的當屆招生資料。班別未知不代表全日班。</p>
  <p v-if="meta.is_test" class="notice warning" role="status">測試資料：以下學校及收費只供本機功能測試，並非真實學校。</p>
  <p v-if="meta.scope==='canary'" class="notice warning">小樣本範圍：不是全港完整名錄，搜尋未見不代表該校不存在。</p>
  <p v-if="message" class="notice" role="status">{{ message }}</p>
  <p v-if="loading" role="status">正在讀取已發佈資料…</p><p v-else-if="error" class="notice error" role="alert">{{ error }}</p>
  <section v-else-if="!schools.length" class="empty"><h2>尚未有可顯示的學校</h2><p>可能未發佈資料，或目前版本没有符合條件的紀錄。請調整篩選，或查看資料來源狀態。</p><RouterLink to="/sources">查看資料來源</RouterLink></section>
  <template v-else>
    <div v-if="route.name==='schools'" class="actions"><button :disabled="selected.length<2" @click="compare">比較已選 {{ selected.length }}/4 校</button><span class="muted">同一學段、同一版本</span></div>
    <div v-if="route.name==='compare'" class="panel table-scroll" tabindex="0" aria-label="學校比較表，可橫向捲動"><table><caption>固定資料版本比較；收費不包含未提供項目</caption><thead><tr><th scope="col">比較項目</th><th v-for="school in schools" :key="school.item_key" scope="col">{{ school.chinese_name }}</th></tr></thead><tbody>
      <tr v-for="row in comparisons" :key="row.title"><th scope="row">{{ row.title }}</th><td v-for="school in schools" :key="school.item_key">{{ row.value(school) }}</td></tr>
      <tr><th scope="row">操作</th><td v-for="school in schools" :key="school.item_key"><button @click="bookmark(school)">加入私人清單</button></td></tr>
    </tbody></table></div>
    <div v-else :class="route.name==='schools'?'grid':'detail'">
      <article v-for="school in schools" :key="school.item_key" class="card">
        <span v-if="school.is_test" class="badge">測試學校</span>
        <label v-if="route.name==='schools'" class="check-label"><input type="checkbox" :checked="selected.includes(school.item_key)" :disabled="selected.length>=4&&!selected.includes(school.item_key)" @change="toggle(school.item_key)" />選入比較</label>
        <h2><RouterLink :to="detailLink(school)">{{ school.chinese_name }}</RouterLink></h2><p class="muted">{{ school.english_name }}</p>
        <dl class="data-list"><dt>地區</dt><dd>{{ school.district??'未提供' }}</dd><dt>資助類別</dt><dd>{{ school.funding??'未提供' }}</dd><dt>地址</dt><dd>{{ school.chinese_address||school.english_address||'未提供' }}</dd><dt>班別</dt><dd>{{ sessionText(school.session) }}</dd><dt>學費</dt><dd>{{ feeLabel(school.fee) }}</dd><dt>概覽版本</dt><dd>{{ school.profile_edition??'未提供（基本名錄）' }}</dd><dt>資料描述時期</dt><dd>{{ school.source_reference_period??'來源時期未核實' }}</dd><dt>取得時間</dt><dd>{{ dateLabel(school.fetched_at) }}</dd></dl>
        <template v-if="route.name==='school'"><p>來源編號：{{ school.school_no }}；校址與班別對應可能尚待核實。</p><p v-if="school.telephone">聯絡電話：{{ school.telephone }}</p><p v-if="school.website"><a :href="school.website" target="_blank" rel="noopener noreferrer">學校網站（外部連結）</a></p></template>
        <div class="actions"><button @click="bookmark(school)">加入私人清單</button><a :href="school.source_url" target="_blank" rel="noopener noreferrer">原始資料來源</a></div>
      </article>
    </div>
    <div v-if="meta.next_cursor&&route.name==='schools'" class="actions"><button @click="nextPage">下一頁</button></div>
    <p class="muted">資料版本：{{ meta.release_id }}<span v-if="typeof meta.rows_read==='number'"> · 本次查詢讀取 {{ meta.rows_read }} 行</span></p>
  </template>
</template>
<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';import { RouterLink, useRoute, useRouter } from 'vue-router';import { z } from 'zod';
import { Profile, entryKey, feeLabel, type SchoolProfile } from '@hk-school/contracts/domain';
import { getData, type ResponseMeta } from '../lib/api';import { loadPrivate, savePrivate } from '../lib/private-store';
const route=useRoute();const router=useRouter();const year=ref(new Date().getFullYear()+1);const level=ref('PRIMARY');const q=ref('');const district=ref('');const funding=ref('');
const schools=ref<SchoolProfile[]>([]);const selected=ref<string[]>([]);const meta=ref<ResponseMeta>({});const loading=ref(false);const error=ref('');const message=ref('');let abort:AbortController|undefined;
const sessionText=(value:string)=>({AM:'上午',PM:'下午',ALL_DAY:'全日',UNKNOWN:'未核實／未提供'})[value]??'未提供';
const dateLabel=(value:string)=>new Date(value).toLocaleString('zh-HK',{timeZone:'Asia/Hong_Kong'});
const comparisons:Array<{title:string;value:(school:SchoolProfile)=>string}>=[{title:'地區',value:s=>s.district??'未提供'},{title:'資助類別',value:s=>s.funding??'未提供'},{title:'地址',value:s=>s.chinese_address||s.english_address},{title:'班別',value:s=>sessionText(s.session)},{title:'學費',value:s=>feeLabel(s.fee)},{title:'費用所屬時期',value:s=>s.fee.reference_period??'未提供'},{title:'概覽版本',value:s=>s.profile_edition??'基本名錄／版本未提供'},{title:'資料時期',value:s=>s.source_reference_period??'未核實'}];
function scalar(value:unknown,fallback=''):string{return typeof value==='string'?value:fallback;}
watch(()=>route.fullPath,async()=>{
  abort?.abort();abort=new AbortController();const controller=abort;
  level.value=scalar(route.query.level,'PRIMARY');year.value=Number(scalar(route.query.year,String(new Date().getFullYear()+1)));q.value=scalar(route.query.q);district.value=scalar(route.query.district);funding.value=scalar(route.query.funding);
  selected.value=[];error.value='';message.value='';schools.value=[];meta.value={};loading.value=true;
  const params=new URLSearchParams();for(const [key,value] of Object.entries(route.query)){if(typeof value==='string')params.set(key,value);}params.set('level',level.value);params.set('year',String(year.value));
  const path=route.name==='school'?`/schools/${encodeURIComponent(String(route.params.id))}`:route.name==='compare'?'/compare':'/schools';
  try{const result=await getData('/api/v1'+path+'?'+params,z.array(Profile),controller.signal);if(!controller.signal.aborted){schools.value=result.data;meta.value=result.meta;}}
  catch(e){if(!controller.signal.aborted)error.value=e instanceof Error?e.message:'讀取失敗';}
  finally{if(!controller.signal.aborted)loading.value=false;}
},{immediate:true});
onBeforeUnmount(()=>abort?.abort());
function search(){void router.push({path:'/schools',query:{level:level.value,year:year.value,q:q.value,district:district.value,funding:funding.value}});}
function detailLink(school:SchoolProfile){return {path:`/schools/${school.school_id}`,query:{level:school.level,year:year.value,release:meta.value.release_id??undefined}};}
function toggle(key:string){selected.value=selected.value.includes(key)?selected.value.filter(id=>id!==key):[...selected.value,key].slice(0,4);}
function compare(){void router.push({path:'/compare',query:{ids:selected.value.join(','),level:level.value,year:year.value,release:meta.value.release_id??undefined}});}
function nextPage(){void router.push({path:'/schools',query:{...route.query,cursor:meta.value.next_cursor??undefined}});}
async function bookmark(school:SchoolProfile){
  try{const stored=await loadPrivate();const entry={school_id:school.school_id,item_key:school.item_key,level:school.level,entry_year:year.value,name:school.chinese_name,status:'considering' as const,note:'',updated_at:new Date().toISOString()};
    if(stored.data.entries.some(item=>entryKey(item)===entryKey(entry))){message.value='已在此入學年度的私人清單；沒有覆蓋現有筆記。';return;}
    stored.data.entries.push(entry);await savePrivate(stored.data,stored.revision);message.value='已加入私人清單，資料只存在此瀏覽器。';
  }catch(e){message.value=e instanceof Error?e.message:'未能儲存私人資料';}
}
</script>
