<template>
  <main class="home">
    <h2>香港年度選校資訊平台</h2>
    <p>開發中：學校搜尋、比較及年度招生資訊尚未開放。</p>
    <section aria-labelledby="status-heading" aria-live="polite">
      <h3 id="status-heading">系統狀態</h3>
      <p v-if="loading">正在讀取狀態…</p>
      <p v-else-if="error" role="alert">{{ error }}</p>
      <dl v-else-if="health">
        <dt>環境</dt><dd>{{ health.environment }}</dd>
        <dt>資料庫</dt><dd>{{ health.database }}</dd>
        <dt>服務狀態</dt><dd>{{ health.readiness }}</dd>
        <dt>公開資料</dt><dd>{{ health.data_status === 'published' ? '已有公開版本' : '未有可用的公開資料' }}</dd>
        <dt>核對時間</dt><dd>{{ new Date(health.timestamp).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' }) }}（香港時間）</dd>
      </dl>
      <p>服務能回應，並不代表已有正式學校資料。未公布的日期不會以示範資料填補。</p>
    </section>
  </main>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { HealthResponseSchema, type HealthResponse } from '@hk-school/contracts';
const health = ref<HealthResponse | null>(null);
const loading = ref(true);
const error = ref('');
onMounted(async () => {
  try {
    const response = await fetch('/api/v1/health', { signal: AbortSignal.timeout(10000) });
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('data' in body)) throw new Error('Invalid response');
    const result = HealthResponseSchema.safeParse(body.data);
    if (!result.success) throw new Error('Invalid health contract');
    if (!response.ok && response.status !== 503) throw new Error('Unexpected response');
    health.value = result.data;
  } catch {
    error.value = '未能取得系統狀態。請確認本機 Worker 已啟動。';
  } finally {
    loading.value = false;
  }
});
</script>
<style scoped>
.home { max-width: 760px; margin: auto; padding: 24px; line-height: 1.7; }
section { margin-top: 24px; border: 1px solid #ddd; border-radius: 8px; padding: 20px; }
dl { display: grid; grid-template-columns: 100px 1fr; gap: 8px; }
dd { margin: 0; overflow-wrap: anywhere; }
</style>
