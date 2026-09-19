<template><SourceLinkBar /><KGParentPage v-if="route.path==='/'||route.path==='/kindergarten'||route.path.startsWith('/kindergarten/')" /><OfficialDataPage v-else-if="['/official-data','/vacancies','/school-nets'].includes(route.path)" /><template v-else-if="route.path==='/sources'"><SourceHub /><OfficialSourcesSummary /></template><ComparePage v-else-if="route.path==='/compare'" /><FullApp v-else /></template>
<script setup lang="ts">
import KGParentPage from './kg/KGParentPage.vue';
import {useRoute} from 'vue-router';
import FullApp from './FullApp.vue';import ComparePage from './ComparePage.vue';import SourceHub from './SourceHub.vue';import SourceLinkBar from './SourceLinkBar.vue';
import OfficialDataPage from './OfficialDataPage.vue';import OfficialSourcesSummary from './OfficialSourcesSummary.vue';
const route=useRoute();
</script>
