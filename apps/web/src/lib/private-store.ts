import { PrivateExport, type PrivateData } from '@hk-school/contracts/domain';
export interface PrivateSnapshot {revision:number;data:PrivateData}
const EMPTY:PrivateData={schema_version:1,entries:[],events:[]};
function open():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('hk-school-guide-private-v1',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('private');};
    request.onerror=()=>reject(new Error('此瀏覽器未能開啟私人儲存，請匯出備份或檢查私隱模式。'));
    request.onblocked=()=>reject(new Error('請關閉其他舊版本分頁再試。'));
    request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
  });
}
export async function loadPrivate():Promise<PrivateSnapshot>{
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('private','readonly');const request=tx.objectStore('private').get('state');let snapshot:PrivateSnapshot;
    request.onsuccess=()=>{
      try{const raw=request.result as PrivateSnapshot|undefined;snapshot=raw?{revision:raw.revision,data:PrivateExport.parse(raw.data)}:{revision:0,data:structuredClone(EMPTY)};}
      catch{tx.abort();}
    };
    tx.oncomplete=()=>{db.close();resolve(snapshot);};
    tx.onabort=tx.onerror=()=>{db.close();reject(new Error('私人資料讀取失敗；未覆蓋原有資料。'));};
  });
}
export async function savePrivate(data:PrivateData,expectedRevision:number):Promise<PrivateSnapshot>{
  const checked=PrivateExport.parse(data);const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('private','readwrite');const store=tx.objectStore('private');const get=store.get('state');
    let error='儲存失敗，可能空間不足。';const next={revision:expectedRevision+1,data:checked};
    get.onsuccess=()=>{
      const old=get.result as PrivateSnapshot|undefined;
      if((old?.revision??0)!==expectedRevision){error='另一分頁已修改資料，請重新整理後再儲存。';tx.abort();return;}
      store.put(next,'state');
    };
    tx.oncomplete=()=>{db.close();resolve(next);};
    tx.onabort=tx.onerror=()=>{db.close();reject(new Error(error));};
  });
}
export function downloadText(name:string,text:string,type='application/json'):void{
  const url=URL.createObjectURL(new Blob([text],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
