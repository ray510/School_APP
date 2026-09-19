<template><section class="wrap panel" id="additional-official-sources"><h2>新增八項官方選校來源</h2>
 <p v-if="error">{{ error }}</p><p v-else-if="!manifest">正在讀取新增來源狀態…</p>
 <template v-else><p>八個資料集，共 {{ manifest.stats.resources }} 份所選資源、{{ manifest.stats.source_records }} 筆原始紀錄；不是獨立學校數。</p>
 <article v-for="s in manifest.sources" :key="s.code" class="panel"><h3>{{ s.code }} {{ s.title }}</h3><p>{{ s.warning }}</p>
 <p><RouterLink :to="{path:'/official-data',query:{source:s.code}}">搜尋及查看資料</RouterLink> · <a :href="s.catalog_url" target="_blank" rel="noopener noreferrer">官方來源</a></p>
 <details v-for="r in s.resources" :key="r.resource_id"><summary>{{ r.name }} · {{ r.row_count }} 筆</summary><p>擷取時間：{{ r.evidence.fetched_at }}。來源狀態：已擷取並通過程式資料驗證，不是官方認證。</p><p>{{ r.field_names.join('、') }}</p><a :href="r.download_url" download>下載原始 {{ r.format }}{{ r.download_encoding==='gzip'?'（GZIP壓縮）':'' }}</a><p><code>{{ r.evidence.sha256 }}</code></p></details></article>
 <a href="/downloads/official-eight.zip" download>下載全部新增來源及可追溯紀錄</a></template></section></template>
<script setup lang="ts">
import {onMounted,ref} from 'vue';import {RouterLink} from 'vue-router';import {loadOfficialManifest,type OfficialManifest} from './official-data';
const manifest=ref<OfficialManifest|null>(null),error=ref('');onMounted(()=>{void loadOfficialManifest().then(m=>{manifest.value=m;}).catch(e=>{error.value=String(e);});});
</script><style scoped>code{overflow-wrap:anywhere}</style>
