<template><section class="panel"><h2>官方註冊、計劃、空缺及校網補充資料</h2>
 <p v-if="error" class="notice">{{ error }}</p><p v-else-if="loading" role="status">正在核對官方補充紀錄…</p>
 <template v-else><p v-if="funding==='GOVERNMENT'">官立學校不在 A02 註冊資料範圍；沒有 A02 紀錄不代表未註冊。</p>
 <p v-if="!rows.length">未有足夠識別證據可把新增來源直接連到此資料組。<RouterLink :to="{path:'/official-data',query:{source:level==='KG'?'A08':'A02'}}">到完整來源查詢</RouterLink>；沒有推算否定結論。</p>
 <p v-if="rows.length">下列分開列出已核對關聯及待核對候選；候選不會改寫學校分類。目標入學年 {{ year }}/{{ year+1 }} 不會改寫來源的基準學年。</p>
 <OfficialRecordCard v-for="r in rows.slice(0,limit)" :key="r.id" :record="r" :resource="resources.find(s=>s.resource_id===r.resource_id)" />
 <button v-if="rows.length>limit" @click="limit+=30">顯示其餘官方紀錄</button></template></section></template>
<script setup lang="ts">
import {ref,watch} from 'vue';import {RouterLink} from 'vue-router';import OfficialRecordCard from './OfficialRecordCard.vue';
import {loadOfficialManifest,loadOfficialJSON,type OfficialRecord,type OfficialResource} from './official-data';
const props=defineProps<{schoolId:string;dataId:string;level:string;funding:string|null;year:number}>();const rows=ref<OfficialRecord[]>([]),resources=ref<OfficialResource[]>([]),loading=ref(false),error=ref(''),limit=ref(30);let generation=0;
watch(()=>[props.schoolId,props.dataId],async()=>{const g=++generation;loading.value=true;error.value='';rows.value=[];limit.value=30;try{
 const m=await loadOfficialManifest();if(m.base_data_id!==props.dataId)throw new Error('官方補充資料與現有名錄版本未對齊，暫不合併顯示。');
 resources.value=m.sources.flatMap(s=>s.resources);if(!m.school_ids.includes(props.schoolId))return;
 const d=await loadOfficialJSON<{school_id:string;bundle_id:string;rows:OfficialRecord[]}>('/official/'+m.bundle_id+'/schools/'+props.schoolId+'.json');
 if(d.school_id!==props.schoolId||d.bundle_id!==m.bundle_id)throw new Error('來源身份或版本不一致');
 if(g===generation){const priority=['vacancy','scheme','non_scheme_admission','dss_fees','dss','through_train','sspa_net','registration','premises','capacity'];rows.value=d.rows.sort((a,b)=>priority.indexOf(a.role)-priority.indexOf(b.role));}
 }catch(e){if(g===generation)error.value=String(e);}finally{if(g===generation)loading.value=false;}},{immediate:true});
</script>
