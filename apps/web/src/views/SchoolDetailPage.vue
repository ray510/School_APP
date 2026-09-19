<template><SchoolBrowser /><AnnualPanel :key="String(route.params.id)" :school-id="String(route.params.id)" :level="level" /><AdmissionsPanel :school-id="String(route.params.id)" :level="level" :year="year" /></template>
<script setup lang="ts">
import AdmissionsPanel from '../components/AdmissionsPanel.vue';
import {computed} from 'vue';import {useRoute} from 'vue-router';import SchoolBrowser from './SchoolBrowser.vue';import AnnualPanel from '../components/AnnualPanel.vue';
const route=useRoute();const level=computed(()=>typeof route.query.level==='string'?route.query.level:'PRIMARY');
const year=computed(()=>Number(typeof route.query.year==='string'?route.query.year:new Date().getFullYear()+1));
</script>
