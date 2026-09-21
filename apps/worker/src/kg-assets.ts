interface KindergartenEnv {ASSETS:Fetcher}
interface KGManifest {schema:number;phase:string;bundle_id:string;parent_cards:number;source_groups:number;annual_profiles:number}
interface KGSummary {id:string;aliases:string[];name:string;address:string;district:string;[key:string]:unknown}
interface Catalog {manifest:KGManifest;rows:KGSummary[];byId:Map<string,KGSummary>;districts:string[]}
class InputError extends Error {}
class DataError extends Error {}
let cached:{bundleId:string;catalog:Promise<Catalog>}|undefined;
const schoolId=/^school_[a-f0-9]{24}$/;
const allowed=new Set(['district','q','limit','cursor','ids']);

function headers(requestId:string):HeadersInit{return {'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex','X-Request-ID':requestId};}
function response(request:Request,requestId:string,payload:unknown,status=200):Response{return new Response(request.method==='HEAD'?null:JSON.stringify(payload),{status,headers:headers(requestId)});}
async function assetJSON<T>(request:Request,env:KindergartenEnv,path:string):Promise<T>{
 const result=await env.ASSETS.fetch(new Request(new URL(path,request.url),{method:'GET'}));
 if(!result.ok||!result.headers.get('content-type')?.includes('application/json'))throw new DataError('幼稚園資料暫未能載入');
 try{return await result.json() as T;}catch{throw new DataError('幼稚園資料格式無法解析');}
}
function manifestValid(value:KGManifest):boolean{return value?.schema===2&&value.phase==='KG_ONLY'&&/^[a-f0-9]{64}$/.test(value.bundle_id)&&Number.isSafeInteger(value.parent_cards)&&value.parent_cards>0&&Number.isSafeInteger(value.source_groups)&&value.source_groups>=value.parent_cards;}
async function catalog(request:Request,env:KindergartenEnv):Promise<Catalog>{
 const manifest=await assetJSON<KGManifest>(request,env,'/kg-parent-manifest.json');
 if(!manifestValid(manifest))throw new DataError('幼稚園資料版本未通過核對');
 if(cached?.bundleId===manifest.bundle_id)return cached.catalog;
 const pending=(async()=>{
  const rows=await assetJSON<KGSummary[]>(request,env,`/kg-parent/${manifest.bundle_id}/index.json`);
  if(!Array.isArray(rows)||rows.length!==manifest.parent_cards)throw new DataError('幼稚園資料覆蓋不一致');
  const byId=new Map<string,KGSummary>(),aliases=new Set<string>();
  for(const row of rows){
   if(!row||!schoolId.test(row.id)||!Array.isArray(row.aliases)||typeof row.name!=='string'||typeof row.address!=='string'||typeof row.district!=='string')throw new DataError('幼稚園索引格式不正確');
   for(const id of [row.id,...row.aliases]){if(!schoolId.test(id)||byId.has(id)&&byId.get(id)!==row)throw new DataError('幼稚園索引身份不一致');byId.set(id,row);}
   for(const id of row.aliases)aliases.add(id);
  }
  if(aliases.size!==manifest.source_groups)throw new DataError('幼稚園來源分組覆蓋不一致');
  return {manifest,rows,byId,districts:[...new Set(rows.map(row=>row.district).filter(Boolean))].sort()};
 })();
 cached={bundleId:manifest.bundle_id,catalog:pending};
 try{return await pending;}catch(error){if(cached?.catalog===pending)cached=undefined;throw error;}
}
function one(params:URLSearchParams,key:string):string|undefined{const values=params.getAll(key);if(values.length>1)throw new InputError(`${key} 不可重複`);return values[0]??undefined;}
function encodeCursor(value:unknown):string{const bytes=new TextEncoder().encode(JSON.stringify(value));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function decodeCursor(value:string):unknown{if(value.length>2048)throw new InputError('無效分頁游標');try{const base=value.replaceAll('-','+').replaceAll('_','/');const binary=atob(base+'='.repeat((4-base.length%4)%4));return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary,char=>char.charCodeAt(0))));}catch{throw new InputError('無效分頁游標');}}
function listQuery(url:URL,catalogValue:Catalog):{rows:KGSummary[];total:number;next:string|null}{
 for(const key of url.searchParams.keys())if(!allowed.has(key))throw new InputError(`不支援的查詢參數：${key}`);
 const ids=one(url.searchParams,'ids'),district=(one(url.searchParams,'district')??'').trim(),q=(one(url.searchParams,'q')??'').trim().normalize('NFKC').toLocaleLowerCase(),cursor=one(url.searchParams,'cursor'),limitRaw=one(url.searchParams,'limit');
 if(q.length>200||district.length>100)throw new InputError('搜尋條件過長');
 if(ids!==undefined){
  if(cursor||district||q)throw new InputError('ids 不可與分頁或搜尋條件混用');
  const requested=ids.split(',').filter(Boolean);if(!requested.length||requested.length>50||requested.some(id=>!schoolId.test(id)))throw new InputError('學校編號不正確');
  const unique=[...new Set(requested)],rows=unique.map(id=>catalogValue.byId.get(id)).filter((row):row is KGSummary=>Boolean(row));
  return {rows,total:rows.length,next:null};
 }
 const limit=limitRaw===undefined?12:/^[1-9]\d*$/.test(limitRaw)?Number(limitRaw):NaN;if(!Number.isSafeInteger(limit)||limit<1||limit>40)throw new InputError('limit 必須為 1 至 40');
 const context=JSON.stringify({district,q,limit});let offset=0;
 if(cursor){const parsed=decodeCursor(cursor) as {bundle?:unknown;offset?:unknown;context?:unknown};if(!parsed||typeof parsed!=='object'||parsed.bundle!==catalogValue.manifest.bundle_id||parsed.context!==context||!Number.isSafeInteger(parsed.offset)||Number(parsed.offset)<0)throw new InputError('篩選或資料版本已改變，請重新搜尋');offset=Number(parsed.offset);}
 const rows=catalogValue.rows.filter(row=>(!district||row.district===district)&&(!q||(row.name+row.address).normalize('NFKC').toLocaleLowerCase().includes(q)));
 if(offset>rows.length)throw new InputError('無效分頁游標');const page=rows.slice(offset,offset+limit),next=offset+limit<rows.length?encodeCursor({bundle:catalogValue.manifest.bundle_id,offset:offset+limit,context}):null;
 return {rows:page,total:rows.length,next};
}

export async function kindergartenApi(request:Request,env:KindergartenEnv,requestId:string):Promise<Response|null>{
 const url=new URL(request.url),match=url.pathname.match(/^\/api\/v1\/kindergartens\/(school_[a-f0-9]{24})$/);
 if(url.pathname!=='/api/v1/kindergartens'&&!match)return null;
 try{
  const value=await catalog(request,env);
  if(match){
   if(url.search)throw new InputError('單校查詢不接受額外參數');const summary=value.byId.get(match[1]);if(!summary)return response(request,requestId,{error:{code:'NOT_FOUND',message:'找不到這間幼稚園'},meta:{request_id:requestId,bundle_id:value.manifest.bundle_id}},404);
   const school=await assetJSON<Record<string,unknown>>(request,env,`/kg-parent/${value.manifest.bundle_id}/schools/${summary.id}.json`);if(school.id!==summary.id)throw new DataError('幼稚園詳情身份不一致');
   return response(request,requestId,{data:school,meta:{request_id:requestId,bundle_id:value.manifest.bundle_id}});
  }
  const result=listQuery(url,value);
  return response(request,requestId,{data:result.rows,meta:{request_id:requestId,bundle_id:value.manifest.bundle_id,total:result.total,next_cursor:result.next,districts:value.districts,parent_cards:value.manifest.parent_cards,source_groups:value.manifest.source_groups}});
 }catch(error){
  if(error instanceof InputError)return response(request,requestId,{error:{code:'INVALID_INPUT',message:error.message},meta:{request_id:requestId}},400);
  return response(request,requestId,{error:{code:'DATA_UNAVAILABLE',message:error instanceof DataError?error.message:'幼稚園資料暫未就緒'},meta:{request_id:requestId}},503);
 }
}
