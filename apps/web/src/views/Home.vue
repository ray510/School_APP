<template>
  <div class="home">
    <section class="welcome">
      <h2>歡迎使用香港年度選校資訊平台</h2>
      <p>本平台提供幼稚園、小學、中學的資訊查詢與比較服務。</p>
    </section>

    <section class="status">
      <h3>系統狀態</h3>
      <div class="status-info">
        <p v-if="health">
          <span class="label">環境：</span><strong>{{ health.environment }}</strong>
        </p>
        <p v-if="health">
          <span class="label">狀態：</span><strong>{{ health.readiness }}</strong>
        </p>
        <p v-if="health">
          <span class="label">時間：</span><span>{{ new Date(health.timestamp).toLocaleString('zh-HK') }}</span>
        </p>
      </div>
      <p class="note">📌 本平台正在 Phase 1 開發中，功能逐步完善。</p>
    </section>

    <section class="quick-links">
      <h3>快速連結</h3>
      <ul>
        <li><RouterLink to="/schools">瀏覽學校</RouterLink></li>
        <li><RouterLink to="/shortlist">我的選校清單</RouterLink></li>
        <li><RouterLink to="/about">關於本平台</RouterLink></li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import type { HealthResponse } from '@hk-school/contracts';

const health = ref<HealthResponse | null>(null);

onMounted(async () => {
  try {
    const response = await fetch('/api/v1/health');
    const data = await response.json();
    health.value = data.data;
  } catch (error) {
    console.error('Failed to fetch health:', error);
  }
});
</script>

<style scoped>
.home {
  padding: 20px 0;
}

section {
  margin-bottom: 40px;
}

h2 {
  font-size: 24px;
  margin-bottom: 12px;
}

h3 {
  font-size: 18px;
  margin-bottom: 16px;
  border-bottom: 2px solid #007bff;
  padding-bottom: 8px;
}

.welcome p {
  font-size: 16px;
  color: #666;
  line-height: 1.6;
}

.status-info {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 4px;
  margin-bottom: 12px;
}

.status-info p {
  margin: 8px 0;
  font-size: 14px;
}

.label {
  color: #666;
}

.note {
  color: #666;
  font-size: 14px;
  margin: 0;
}

.quick-links ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.quick-links li {
  margin-bottom: 8px;
}

.quick-links a {
  color: #007bff;
  text-decoration: none;
}

.quick-links a:hover {
  text-decoration: underline;
}
</style>
