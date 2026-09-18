<template>
  <h1>私人選校清單</h1><p class="notice">資料只存在此瀏覽器，沒有同步到伺服器。清除網站資料或更換裝置可能遺失；請定期匯出備份。</p>
  <p v-if="message" role="status" class="notice">{{ message }}</p><p v-if="error" role="alert" class="notice error">{{ error }}</p>
  <div class="panel actions"><button :disabled="!ready" @click="exportData">匯出備份</button><label>匯入 JSON 備份<input type="file" accept="application/json,.json" @change="readFile" /></label><button class="secondary" :disabled="!ready" @click="clearAll">刪除全部私人資料</button></div>
  <section v-if="preview" class="panel"><h2>匯入預覽</h2><p>{{ preview.entries.length }} 項選校記錄、{{ preview.events.length }} 項私人事件；{{ conflicts }} 項現有選校記錄發生鍵值衝突。</p><p>請明確選擇衝突處理方式。未確認前不會寫入。</p><div class="actions"><button @click="applyImport(false)">合併並保留現有衝突項目</button><button class="secondary" @click="applyImport(true)">合併並採用匯入的衝突項目</button><button class="secondary" @click="preview=null">取消匯入</button></div></section>
  <section v-if="ready&&!snapshot.data.entries.length" class="empty"><h2>清單目前是空的</h2><RouterLink to="/schools?level=PRIMARY&amp;year=2027">先瀏覽學校並加入清單</RouterLink></section>
  <article v-for="entry in snapshot.data.entries" :key="entryKey(entry)" class="card"><h2>{{ entry.name }}</h2><p>{{ entry.entry_year }}/{{ entry.entry_year+1 }} · {{ entry.level }}</p><label>申請進度<select v-model="entry.status"><option value="considering">考慮中</option><option value="preparing">準備資料</option><option value="applied">已申請</option><option value="waiting">等待通知</option><option value="result_received">已收到結果</option></select></label><label>私人筆記（請勿填寫身份證明或兒童敏感資料）<textarea v-model="entry.note" maxlength="4000" /></label><div class="actions"><button @click="persist">儲存筆記與進度</button><button class="secondary" @click="remove(entryKey(entry))">移除此學校</button></div></article>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';import { RouterLink } from 'vue-router';
import { PrivateExport, readPrivateImport, entryKey, type PrivateData } from '@hk-school/contracts/domain';
import { loadPrivate, savePrivate, downloadText, type PrivateSnapshot } from '../lib/private-store';
const snapshot=ref<PrivateSnapshot>({revision:0,data:{schema_version:1,entries:[],events:[]}});const ready=ref(false);const message=ref('');const error=ref('');const preview=ref<PrivateData|null>(null);
const conflicts=computed(()=>preview.value?.entries.filter(incoming=>snapshot.value.data.entries.some(old=>entryKey(old)===entryKey(incoming))).length??0);
onMounted(async()=>{try{snapshot.value=await loadPrivate();ready.value=true;}catch(e){error.value=String(e);}});
async function persist(){try{for(const entry of snapshot.value.data.entries)entry.updated_at=new Date().toISOString();snapshot.value=await savePrivate(snapshot.value.data,snapshot.value.revision);message.value='已儲存於此瀏覽器。';error.value='';}catch(e){error.value=String(e);}}
async function remove(key:string){snapshot.value.data.entries=snapshot.value.data.entries.filter(entry=>entryKey(entry)!==key);await persist();}
async function clearAll(){if(!window.confirm('刪除所有選校記錄、筆記及私人事件？此操作不能復原，請先匯出備份。'))return;snapshot.value.data={schema_version:1,entries:[],events:[]};await persist();}
function exportData(){downloadText('hk-school-private-backup.json',JSON.stringify(PrivateExport.parse(snapshot.value.data),null,2));}
async function readFile(event:Event){try{const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;if(file.size>1000000)throw new Error('檔案超過 1 MB');preview.value=readPrivateImport(await file.text());error.value='';}catch(e){error.value=String(e);preview.value=null;}}
async function applyImport(replace:boolean){
  if(!preview.value||!ready.value)return;
  try{const entries=new Map(snapshot.value.data.entries.map(entry=>[entryKey(entry),entry]));for(const incoming of preview.value.entries){if(replace||!entries.has(entryKey(incoming)))entries.set(entryKey(incoming),incoming);}
    const events=new Map(snapshot.value.data.events.map(event=>[event.id,event]));for(const incoming of preview.value.events){if(replace||!events.has(incoming.id))events.set(incoming.id,incoming);}
    const merged=PrivateExport.parse({schema_version:1,entries:[...entries.values()],events:[...events.values()]});snapshot.value=await savePrivate(merged,snapshot.value.revision);preview.value=null;message.value='已按選定衝突規則合併，未上傳資料。';
  }catch(e){error.value=String(e);}
}
</script>
