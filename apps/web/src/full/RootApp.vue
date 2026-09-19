<template><SourceLinkBar /><SourceHub v-if="route.path==='/sources'" /><ComparePage v-else-if="route.path==='/compare'" /><FullApp v-else /></template>
<script setup lang="ts">
import {useRoute} from 'vue-router';
import FullApp from './FullApp.vue';import ComparePage from './ComparePage.vue';import SourceHub from './SourceHub.vue';import SourceLinkBar from './SourceLinkBar.vue';
const route=useRoute();
</script>
