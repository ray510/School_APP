<template>
 <section class="panel"><h2>概覽文字標籤與證據</h2><p class="notice">標籤由 JEV 協助整理送審原文片段；不是服務品質、學生適合度或錄取評分。尚未經人工標註集校準，請核對原文；「片段未提及」不等於學校沒有提供。</p>
  <p v-if="!annotations.length">本資料組沒有直接對應的年度概覽。基本名錄仍然完整顯示。</p>
  <article v-for="a in annotations" :key="a.source_id+':'+a.row"><h3>{{ sources.find(s=>s.id===a.source_id)?.edition }} · 來源第 {{ a.row }} 筆</h3>
   <p v-if="a.status!=='ANALYZED'">此紀錄{{ a.status==='NOT_ANALYZED'?'未完成模型分析':'的模型結果不可用' }}，不會用關鍵字猜測補成 AI 結論。</p>
   <details v-for="(r,tag) in a.labels" :key="tag" class="tag-evidence"><summary>{{ tagNames[tag]||tag }}：{{ statusNames[r.status]||r.status }}</summary>
    <template v-if="r.evidence"><p>來源欄位：{{ r.evidence.field }} · 字元 {{ r.evidence.start }}–{{ r.evidence.end }}</p><blockquote>{{ r.evidence.text }}</blockquote><small>逐字複製自所示來源；不是模型生成引文。</small></template>
    <p v-else>沒有可展示的肯定證據；不推定有或沒有。</p>
    <p v-if="r.reason" class="muted">處理狀態：{{ r.reason }}</p>
   </details>
   <p class="muted">模型：{{ a.model_returned||a.model_requested||'未呼叫' }} · 僅分析送審片段{{ a.excerpts_truncated?'，未包含全部文字':'' }}。</p>
  </article>
 </section>
</template>
<script setup lang="ts">
import {tagNames,statusNames,type Annotation} from './analytics';import type {Source} from './catalog';
defineProps<{annotations:Annotation[];sources:Source[]}>();
</script>
