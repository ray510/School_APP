<template>
  <section class="panel" aria-labelledby="annual-compare-title"><h2 id="annual-compare-title">年度重點比較</h2>
    <p class="notice">目標入學年份不會改寫歷史概覽。只比較相同來源、相同概覽版本；空白不等於免費或沒有服務。</p>
    <p v-if="loading" role="status">正在讀取已配對概覽…</p><p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!loading&&!groups.length">所選學校尚未有已發布的年度配對資料。</p>
    <div v-for="group in groups" :key="group.key" class="table-scroll" tabindex="0" aria-label="年度重點比較表，可橫向捲動"><h3>概覽 {{ group.edition }}</h3>
      <table><caption>學校提供的原文資料；每格列出其資料時期</caption><thead><tr><th scope="col">項目</th><th v-for="school in schools" :key="school.school_id" scope="col">{{ school.chinese_name }}</th></tr></thead><tbody>
        <tr v-for="row in group.rows" :key="row.key"><th scope="row">{{ row.label }}</th><td v-for="school in schools" :key="school.school_id"><template v-if="cell(group.key,school.school_id,row.key)"><span v-if="cell(group.key,school.school_id,row.key)!.planned" class="badge">擬開設，非已落實</span><a v-if="cell(group.key,school.school_id,row.key)!.link" :href="cell(group.key,school.school_id,row.key)!.link!" target="_blank" rel="noopener noreferrer">查看來源收費證明書</a><span v-else>{{ cell(group.key,school.school_id,row.key)!.value }}</span><small>{{ cell(group.key,school.school_id,row.key)!.period }}</small></template><span v-else>此概覽版本尚未配對</span></td></tr>
        <tr><th scope="row">來源與版本</th><td v-for="school in schools" :key="school.school_id"><template v-if="profile(group.key,school.school_id)"><a :href="profile(group.key,school.school_id)!.profile.source_url" target="_blank" rel="noopener noreferrer">官方概覽原始檔</a><small>{{ profile(group.key,school.school_id)!.release_id }}</small></template></td></tr>
      </tbody></table>
    </div>
  </section>
</template>
<script setup lang="ts">
import {ref,watch,computed,onBeforeUnmount} from 'vue';import {z} from 'zod';import {AnnualProfile} from '@hk-school/contracts/annual';import {summarizeAnnual} from '@hk-school/contracts/pilot';import type {SchoolProfile} from '@hk-school/contracts/domain';import {getData} from '../lib/api';
const props=defineProps<{schools:SchoolProfile[];level:string}>();
const Item=z.object({profile:AnnualProfile,release_id:z.string(),scope:z.string()});const items=ref<z.infer<typeof Item>[]>([]);const loading=ref(false);const error=ref('');let controller:AbortController|undefined;
const key=(p:z.infer<typeof Item>)=>p.profile.source_id+'::'+p.profile.profile_edition;
function profile(group:string,id:string){return items.value.find(p=>key(p)===group&&p.profile.school_id===id);}
function cell(group:string,id:string,field:string){const p=profile(group,id);return p?summarizeAnnual(p.profile).find(f=>f.key===field):undefined;}
const groups=computed(()=>[...new Set(items.value.map(key))].map(group=>{const rows=new Map<string,{key:string;label:string}>();for(const p of items.value.filter(p=>key(p)===group))for(const f of summarizeAnnual(p.profile))rows.set(f.key,{key:f.key,label:f.label});return {key:group,edition:items.value.find(p=>key(p)===group)!.profile.profile_edition,rows:[...rows.values()]};}));
watch(()=>[props.level,props.schools.map(s=>s.school_id).join(',')],async()=>{
 controller?.abort();controller=new AbortController();const current=controller;items.value=[];error.value='';loading.value=true;
 try{const result=await getData('/api/v1/annual-compare?'+new URLSearchParams({level:props.level,schools:props.schools.map(s=>s.school_id).join(',')}),z.array(Item),current.signal);if(!current.signal.aborted)items.value=result.data;}catch(e){if(!current.signal.aborted)error.value=e instanceof Error?e.message:'讀取失敗';}finally{if(!current.signal.aborted)loading.value=false;}
},{immediate:true});onBeforeUnmount(()=>controller?.abort());
</script>
<style scoped>td{min-width:200px;max-width:360px;white-space:pre-wrap;overflow-wrap:anywhere}small{display:block;margin-top:8px;color:#4b5563;font-size:.8rem}</style>
