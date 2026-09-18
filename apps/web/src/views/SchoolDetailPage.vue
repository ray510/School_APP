<template><SchoolBrowser /><AnnualPanel :key="String(route.params.id)" :school-id="String(route.params.id)" :level="level" /></template>
<script setup lang="ts">
import {computed} from 'vue';import {useRoute} from 'vue-router';import SchoolBrowser from './SchoolBrowser.vue';import AnnualPanel from '../components/AnnualPanel.vue';
const route=useRoute();const level=computed(()=>typeof route.query.level==='string'?route.query.level:'PRIMARY');
</script>
