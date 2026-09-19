<template>
 <section class="panel" aria-labelledby="next-date"><h2 id="next-date">{{ year }}/{{ year+1 }} 下一個重要日期</h2>
 <p>共同程序必須符合其適用條件；不是每間學校的個別報名或面試通知。未列出事件不代表學校尚未接受報名。</p>
 <p v-if="loading" role="status">正在讀取核實事件…</p><p v-if="error" role="alert">{{ error }}</p>
 <p v-if="!loading&&!error&&!upcoming.length" class="empty">尚未有適用此學段及入學學年的未過期核實事件。</p>
 <article v-for="event in upcoming.slice(0,4)" :key="event.id" class="card"><span class="badge">{{ event.school_id?'個別學校公告':'有條件適用的共同程序' }}</span><h3>{{ event.title }}</h3><p><strong>{{ eventDateRange(event) }}</strong> · {{ eventStatus(event) }}</p><p>{{ event.applicability }}</p><p>{{ event.description }}</p><p>下一個日期：{{ nextEventDate(event) }}（日期範圍開始後顯示其最後一日，並非保證當日仍在辦公）</p><a :href="event.source_url" target="_blank" rel="noopener noreferrer">核對公告來源</a><small>來源核對：{{ event.reviewed_at.slice(0,10) }}</small></article>
 <div class="actions"><RouterLink :to="{path:'/calendar',query:{level,year:String(year),school:schoolId}}">查看相關招生日曆</RouterLink><button v-if="upcoming.length" @click="download">匯出相關核實事件 ICS</button></div>
 </section>
</template>
<script setup lang="ts">
import {ref,watch,computed,onBeforeUnmount} from 'vue';import {RouterLink} from 'vue-router';import {z} from 'zod';import {AdmissionEvent,type PublicEvent} from '@hk-school/contracts/domain';import {eventDateRange,eventStatus,nextEventDate} from '@hk-school/contracts/pilot';import {toCalendar} from '@hk-school/contracts/calendar';import {getData} from '../lib/api';import {downloadText} from '../lib/private-store';
const props=defineProps<{schoolId:string;level:string;year:number}>();const events=ref<PublicEvent[]>([]);const error=ref('');const loading=ref(false);let controller:AbortController|undefined;
const upcoming=computed(()=>events.value.filter(e=>nextEventDate(e)!==null).sort((a,b)=>nextEventDate(a)!.localeCompare(nextEventDate(b)!)));
watch(()=>[props.schoolId,props.level,props.year],async()=>{controller?.abort();controller=new AbortController();const current=controller;events.value=[];error.value='';loading.value=true;try{const response=await getData('/api/v1/events?'+new URLSearchParams({school:props.schoolId,level:props.level,year:String(props.year)}),z.array(AdmissionEvent),current.signal);if(!current.signal.aborted)events.value=response.data;}catch(e){if(!current.signal.aborted)error.value=e instanceof Error?e.message:'讀取失敗';}finally{if(!current.signal.aborted)loading.value=false;}},{immediate:true});
onBeforeUnmount(()=>controller?.abort());function download(){downloadText('school-related-dates.ics',toCalendar(upcoming.value),'text/calendar; charset=utf-8');}
</script>
<style scoped>small{display:block;color:#4b5563}</style>
