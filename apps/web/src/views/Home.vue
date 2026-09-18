<template>
  <section class="hero"><p class="eyebrow">香港 · 幼稚園 · 小學 · 中學</p><h1>把選校資料，整理成下一步。</h1><p>按入學年份瀏覽學校、並排比較，再用私人清單跟進。每項資料保留來源；當屆尚未公布的日期不會由往年推算。</p></section>
  <form class="panel filters" @submit.prevent="start"><label>入學學年<select v-model="year"><option v-for="y in years" :key="y" :value="y">{{ y }}/{{ y+1 }}</option></select></label><label>學段<select v-model="level"><option value="KG">幼稚園</option><option value="PRIMARY">小學</option><option value="SECONDARY">中學</option></select></label><button type="submit">開始選校</button></form>
  <div class="grid"><article class="card"><h2>同一口徑比較</h2><p>每次比較最多四校，固定同一學段及資料版本。未知、免費及不適用分開顯示。</p></article><article class="card"><h2>私人清單只留本機</h2><p>筆記及申請進度存在此瀏覽器。可匯出備份；不要求兒童姓名、成績或身份證明。</p></article><article class="card"><h2>年度安排不混用</h2><p>概覽版本與入學學年不同。未核實的招生事件不會加入官方日曆。</p></article></div>
  <p class="notice">開發预覽：沒有已發佈資料時會顯示空狀態。本機啟用 synthetic demo 後，所有測試學校均會清楚標示。</p>
</template>
<script setup lang="ts">
import { ref } from 'vue';import { useRouter } from 'vue-router';
const current=new Date().getFullYear();const years=Array.from({length:4},(_,i)=>current+i);const year=ref(current+1);const level=ref('PRIMARY');const router=useRouter();
function start(){void router.push({path:'/schools',query:{level:level.value,year:year.value}});}
</script>
