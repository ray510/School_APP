<template>
  <div class="not-found">
    <div class="content">
      <h2>404 - 找不到頁面</h2>
      <p>抱歉，您要找的頁面不存在。</p>
      <RouterLink to="/" class="back-link">返回首頁</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<style scoped>
.not-found {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.content {
  text-align: center;
}

h2 {
  font-size: 32px;
  color: #333;
  margin-bottom: 16px;
}

p {
  color: #666;
  margin-bottom: 24px;
  font-size: 16px;
}

.back-link {
  display: inline-block;
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  text-decoration: none;
  border-radius: 4px;
}

.back-link:hover {
  background-color: #0056b3;
}
</style>
