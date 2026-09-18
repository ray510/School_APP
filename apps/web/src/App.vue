<template>
  <div class="app">
    <header>
      <h1>香港年度選校資訊平台</h1>
      <p class="subtitle">Phase 1 開發中</p>
    </header>
    <main>
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<style scoped>
.app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

header {
  text-align: center;
  margin-bottom: 40px;
  border-bottom: 1px solid #eee;
  padding-bottom: 20px;
}

h1 {
  margin: 0 0 8px 0;
  font-size: 28px;
}

.subtitle {
  color: #666;
  margin: 0;
  font-size: 14px;
}

main {
  min-height: calc(100vh - 200px);
}
</style>
