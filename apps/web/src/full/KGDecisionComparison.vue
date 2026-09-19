<template>
 <section class="panel parent-comparison" data-testid="parent-comparison" aria-labelledby="parent-heading">
  <p class="eyebrow">從實際安排看差異</p><h2 id="parent-heading">先看會影響選校的差異</h2>
  <p v-if="sameFoundation" class="foundation">所選 {{ schools.length }} 項概覽均列為「非牟利、參加幼稚園教育計劃、本地課程」。這些共同標籤不足以分辨學校；下面直接比較教學、照顧及支援安排。</p>
  <p v-else>先看同版概覽中的實際安排，再用下方 JEV 證據判斷交叉核對；沒有資料不代表學校沒有服務。</p>
  <p class="muted">以下重點由官方欄位及固定規則整理，不冒稱新一輪 JEV 推論。概覽版本：{{ versions.join('／')||'未有同版資料' }}；目標入學 {{ year }}/{{ year+1 }} 的名額、學費及安排仍需確認。</p>
  <div class="decision-cards">
   <article v-for="s in schools" :key="s.id" class="decision-card" :data-school="s.id">
    <h3>{{ s.name }}</h3><p class="classifications">{{ classificationSummary(s) }}</p>
    <template v-if="profile(s)">
     <h4>教學模式</h4><blockquote>{{ excerpt(s,teachingField(s),'curriculum')||'此欄位未提供可用文字。' }}</blockquote>
     <h4>語文安排</h4><blockquote v-if="excerpt(s,'學習_教學模式及活動','language')">{{ excerpt(s,'學習_教學模式及活動','language') }}</blockquote><p v-else>此教學欄位未列出可直接擷取的語文安排，請核對全文及向學校查詢。</p>
     <h4>全日照顧要留意</h4><p data-testid="care-meaning">{{ careMeaning(s,profile(s)) }}</p>
     <p class="quick-facts">註冊課室：{{ display(profile(s)?.fields['註冊課室數目']) }}　音樂室：{{ display(profile(s)?.fields['音樂室']) }}　戶外遊戲場地：{{ display(profile(s)?.fields['戶外遊戲場地']) }}</p>
     <details><summary>來源與配對依據</summary><p>{{ profile(s)?.edition }} · 第 {{ profile(s)?.row }} 筆。上方引文取自「課程規劃／學習_教學模式及活動」，下方可查看完整原文。</p><p v-for="p in s.profile_resolution?.links" :key="p.record_sha256">學校／校址：{{ p.school_number }}／{{ p.location_id }}；{{ p.checks.join('、') }}<span v-if="p.address_differs">。地址版本有差異：名錄「{{ p.directory_address }}」；概覽「{{ p.profile_address }}」。沒有隱藏或改寫地址。</span></p><a v-if="sourceUrl(s)" :href="sourceUrl(s)!" target="_blank" rel="noopener noreferrer">官方概覽來源</a></details>
    </template>
    <p v-else class="notice">暫未能以來源證據確認同校址概覽；不借用其他學校資料。此限制只影響本項，其他學校仍顯示完整內容。</p>
   </article>
  </div>
  <div class="priority-tabs" role="group" aria-label="選擇關注的選校安排"><button v-for="(topic,key) in parentTopics" :key="key" :class="{light:focus!==key}" :aria-pressed="focus===key" @click="focus=key">{{ topic.title }}</button></div>
  <h3>{{ parentTopics[focus].title }}</h3><p class="interpretation">{{ parentTopics[focus].meaning }}</p>
  <div class="comparison" tabindex="0" role="region" aria-label="按選校需要比較官方安排"><table class="parent-facts" data-testid="parent-facts"><caption>原始安排按所示概覽版本比較；長段落可以展開。金額未計算成總學費。</caption><thead><tr><th scope="col">實際安排</th><th v-for="s in schools" :key="s.id" scope="col">{{ s.name }}</th></tr></thead><tbody>
   <tr v-for="field in parentTopics[focus].fields" :key="field" :data-field="field"><th scope="row">{{ fieldLabels[field]||field }}</th><td v-for="s in schools" :key="s.id">
    <template v-if="field==='收費證明書'"><a v-if="safeLink(value(s,field))" :href="safeLink(value(s,field))!" target="_blank" rel="noopener noreferrer">查看核准收費文件</a><span v-else>來源未提供連結</span><small>尚未在本頁核實 {{ year }}/{{ year+1 }} 學費，不以托兒服務收費或註冊費代替。</small></template>
    <details v-else-if="value(s,field).length>180"><summary>{{ display(value(s,field)).slice(0,180) }}…（展開全文）</summary><p class="full-text">{{ display(value(s,field)) }}</p></details>
    <span v-else>{{ display(value(s,field)) }}</span>
   </td></tr>
  </tbody></table></div>
  <details class="source-note"><summary>數字及年份應該點理解？</summary><p>學生數、師生比例、容額及用品費是概覽各欄位的填報資料，基準時點未必相同；不是即時名額、班級人數或2027/28價目。全日班合計只在K1、K2、K3三個原始欄位都明確提供整數時相加。師生比例不代表小班保證。</p></details>
 </section>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue';
import {display,safeLink,type School,type Source} from './catalog';
import {classificationSummary} from './classification';
import {parentTopics,fieldLabels,selectedProfile,fieldValue,careMeaning,exactExcerpt,type ParentTopic} from './parent-comparison';
const props=defineProps<{schools:School[];sources:Source[];year:number;cohort?:string}>();
const focus=ref<ParentTopic>('care');
const profile=(s:School)=>selectedProfile(s,props.cohort??'');
const versions=computed(()=>[...new Set(props.schools.map(s=>profile(s)?.edition).filter((v):v is string=>Boolean(v)))]);
const sameFoundation=computed(()=>props.schools.length>=2&&props.schools.every(s=>{const a=profile(s);return a?.fields['學校類別']==='非牟利'&&a.fields['參加幼稚園教育計劃']==='有參加'&&a.fields['課程類別']==='本地';}));
const teachingField=(s:School)=>/Plan|Review/.test(profile(s)?.fields['課程規劃']??'')?'課程規劃':'學習_教學模式及活動';
const value=(s:School,f:string)=>fieldValue(s,profile(s),f);
const excerpt=(s:School,f:string,topic:'curriculum'|'language'|'support')=>exactExcerpt(profile(s)?.fields[f],topic);
const sourceUrl=(s:School)=>safeLink(props.sources.find(x=>x.id===profile(s)?.source_id)?.catalog_url);
</script>
<style scoped>
.parent-comparison .foundation{padding:1rem;border-left:4px solid #28666b;background:#f4f8f7}.decision-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem;margin:1.25rem 0}.decision-card{border:1px solid #dce4e4;border-radius:12px;padding:1.15rem;min-width:0}.decision-card h3{margin-top:0}.decision-card h4{margin-bottom:.5rem}.decision-card blockquote{margin:.3rem 0 1rem;padding-left:.7rem;border-left:2px solid #9abbb8;white-space:pre-wrap;line-height:1.75;font-size:.95rem}.decision-card p,.decision-card blockquote{overflow-wrap:anywhere}.classifications{font-size:.9rem;color:#245b57}.quick-facts{font-size:.9rem}.priority-tabs{display:flex;flex-wrap:wrap;gap:.6rem;margin:1.5rem 0 1rem}.priority-tabs button{font-size:.92rem}.interpretation{padding:.85rem;background:#f5f5f1;border-radius:8px;line-height:1.7}.parent-facts{min-width:700px;width:100%;border-collapse:collapse;table-layout:fixed;text-align:left}.parent-facts th,.parent-facts td{padding:1rem;vertical-align:top;border-bottom:1px solid #dfe5e5;overflow-wrap:anywhere}.parent-facts th:first-child{width:20%}.parent-facts small{display:block;margin-top:.6rem}.parent-facts caption{text-align:left;margin:.7rem 0}.parent-facts summary{cursor:pointer;line-height:1.7}.full-text{white-space:pre-wrap;line-height:1.8}.source-note{margin-top:1rem}details summary{cursor:pointer}@media(max-width:600px){.decision-cards{grid-template-columns:1fr}.parent-comparison{padding:1rem}.priority-tabs button{flex:1 1 45%;min-height:44px}}
</style>
