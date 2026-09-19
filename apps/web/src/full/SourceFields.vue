<template>
 <div class="field-tools"><label>搜尋欄位或內容<input v-model="q" placeholder="例如：學費、教學語言、支援" /></label><label class="check"><input v-model="raw" type="checkbox" />顯示原始字串</label><span>{{ entries.length }} / {{ Object.keys(fields).length }} 個欄位</span></div>
 <dl class="source-fields"><template v-for="[key,value] in entries" :key="key"><dt>{{ key }}</dt><dd><a v-if="safeLink(value)" :href="safeLink(value)!" target="_blank" rel="noopener noreferrer">{{ value }}</a><span v-else>{{ raw ? (value === '' ? '（原始空字串）' : value) : display(value) }}</span></dd></template></dl>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue';import {display,safeLink,normalized} from './catalog';
const props=defineProps<{fields:Record<string,string>}>();const q=ref('');const raw=ref(false);const entries=computed(()=>Object.entries(props.fields).filter(([k,v])=>normalized(k+v).includes(normalized(q.value))));
</script>
