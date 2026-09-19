<template><section class="panel" data-testid="official-eight-comparison"><h2>新增官方來源對照：計劃、空缺及升學安排</h2>
 <p>與上方歷史概覽分開。每項保留自身版本；學位空缺狀態不是數量，註冊容額不作剩餘名額。目標 {{ year }}/{{ year+1 }} 不會改寫來源學年。</p>
 <p v-if="error" class="notice">{{ error }}</p><p v-else-if="loading" role="status">正在讀取官方對照…</p>
 <template v-else><div class="comparison"><table><thead><tr><th>官方來源</th><th v-for="s in schools" :key="s.id">{{ s.name }}</th></tr></thead><tbody>
 <tr v-for="code in codes" :key="code"><th>{{ officialNames[code] }}</th><td v-for="s in schools" :key="s.id"><template v-for="r in selected(s.id,code)" :key="r.id"><p><strong v-if="r.association.state!=='EVIDENCE_LINKED'">待核對候選：</strong>{{ describe(r) }}</p><small>{{ resource(r)?.name }}<span v-if="r.normalized.as_of"> · 資料截至 {{ r.normalized.as_of }}</span></small></template><span v-if="!selected(s.id,code).length">{{ code==='A02'&&s.classification.funding_type.value==='GOVERNMENT'?'官立學校不在此註冊資料範圍':'未有可核對紀錄；不推定否定結果' }}</span><p><RouterLink :to="{path:'/official-data',query:{source:code,q:s.name}}">查閱完整來源及原文 →</RouterLink></p></td></tr>
 </tbody></table></div><button @click="exportData">匯出新增官方對照 JSON</button></template>
</section></template>
<script setup lang="ts">
import {computed,ref,watch} from 'vue';import {RouterLink} from 'vue-router';import {download,type School} from './catalog';
import {officialNames,loadOfficialManifest,loadOfficialJSON,vacancy,showFact,type OfficialManifest,type OfficialRecord} from './official-data';
const props=defineProps<{schools:School[];dataId:string;year:number}>();const manifest=ref<OfficialManifest|null>(null),rows=ref<Record<string,OfficialRecord[]>>({}),error=ref(''),loading=ref(false);let generation=0;
const codes=computed(()=>props.schools[0]?.level==='KG'?['A02','A06','A07','A08']:['A02','A09','A10','A12']);
const selected=(id:string,code:string)=>(rows.value[id]??[]).filter(r=>r.code===code&&(!['premises','capacity'].includes(r.role)));
const resource=(r:OfficialRecord)=>manifest.value?.sources.flatMap(s=>s.resources).find(x=>x.resource_id===r.resource_id);
function describe(r:OfficialRecord):string{const f=r.normalized.facts;
 if(r.role==='vacancy')return ['K1','K2','K3'].map(g=>g+'：'+vacancy(r,g).label).join('；');
 if(r.role==='scheme')return '所示學年教育計劃名單有列出；不是所有學年的保證。';
 if(r.role==='non_scheme_admission')return '收生學年 '+r.normalized.admission_year+'；非計劃基準學年 '+r.normalized.reference_year+'。措施見原文。';
 if(r.role==='dss_fees')return String(f.grade)+' · '+showFact(f.charge_kind)+' HKD '+showFact(f.fee_min)+(f.fee_min!==f.fee_max?'–'+showFact(f.fee_max):'')+'／年';
 if(r.role==='dss')return '所示學年直資名單有列出，另有學費減免／獎學金資料。';
 if(r.role==='through_train')return '資助一條龍組別 '+showFact(f.group_id)+'。'+String(f.remarks??'');
 if(r.role==='sspa_net'){const serving=f.serving_nets_raw as Record<string,string>;return '所屬 '+showFact(f.home_net)+'；服務網原值為 Y：'+Object.keys(serving).filter(k=>serving[k]==='Y').join('、');}
 return showFact(f.registration_status)+' · '+showFact(f.session);}
watch(()=>props.schools.map(s=>s.id).join(',')+props.dataId,async()=>{const g=++generation;loading.value=true;error.value='';try{const m=await loadOfficialManifest();if(m.base_data_id!==props.dataId)throw new Error('補充資料版本與名錄不符');const pairs=await Promise.all(props.schools.map(async s=>{if(!m.school_ids.includes(s.id))return [s.id,[]] as const;const p=await loadOfficialJSON<{school_id:string;bundle_id:string;rows:OfficialRecord[]}>('/official/'+m.bundle_id+'/schools/'+s.id+'.json');if(p.school_id!==s.id||p.bundle_id!==m.bundle_id)throw new Error('官方對照身份不符');return [s.id,p.rows] as const;}));if(g===generation){manifest.value=m;rows.value=Object.fromEntries(pairs);}}catch(e){if(g===generation)error.value=String(e);}finally{if(g===generation)loading.value=false;}},{immediate:true});
function exportData(){download('school-official-comparison.json',JSON.stringify({base_data_id:props.dataId,bundle_id:manifest.value?.bundle_id,entry_year:props.year,schools:props.schools.map(s=>({id:s.id,name:s.name,records:rows.value[s.id]??[]})),sources:manifest.value?.sources},null,2));}
</script>
<style scoped>.comparison{overflow-x:auto}table{min-width:720px;width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:12px;text-align:left;vertical-align:top;border-bottom:1px solid #dfe5e5;overflow-wrap:anywhere}small{display:block}</style>
