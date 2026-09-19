<template><div class="source-link-bar"><RouterLink to="/sources">資料來源中心</RouterLink><span>查看官方名錄、概覽年份、招生公告及 JEV 分析依據</span></div></template>
<script setup lang="ts">import {RouterLink} from 'vue-router';</script>
<style scoped>.source-link-bar{padding:9px 20px;text-align:center;background:#e7efeb;font-size:13px;display:flex;justify-content:center;gap:14px;flex-wrap:wrap}.source-link-bar a{font-weight:700}@media(max-width:600px){.source-link-bar span{display:none}}</style>
