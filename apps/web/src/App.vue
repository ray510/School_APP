<template>
  <a class="skip-link" href="#main">跳至主要內容</a>
  <header class="site-header">
    <div class="shell header-row"><RouterLink class="brand" to="/">香港選校年鑑 <small>測試預覽</small></RouterLink>
      <nav aria-label="主要導覽"><RouterLink to="/schools?level=PRIMARY&amp;year=2027">選校資料</RouterLink><RouterLink to="/source-reference">年度概覽原文</RouterLink><RouterLink to="/shortlist">私人清單</RouterLink><RouterLink to="/calendar">招生日曆</RouterLink><RouterLink to="/sources">資料來源</RouterLink></nav>
    </div>
  </header>
  <aside class="shell" aria-label="測試站資料限制">測試版本，資料覆蓋不完整。基本名錄與年度原文分開展示；未核實的身份配對、收費及招生日期不會推算。</aside>
  <main id="main" class="shell" tabindex="-1"><RouterView /></main>
  <footer class="shell footer">非官方平台。概覽資料不等於當屆收生安排；請核對學校及教育局最新公告。<RouterLink to="/about">私隱與資料限制</RouterLink></footer>
</template>
<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>
