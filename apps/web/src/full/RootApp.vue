<template><ComparePage v-if="route.path==='/compare'" /><FullApp v-else /></template>
<script setup lang="ts">
import {useRoute} from 'vue-router';
import FullApp from './FullApp.vue';
import ComparePage from './ComparePage.vue';
const route=useRoute();
</script>
