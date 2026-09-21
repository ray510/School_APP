/** Dedicated public, read-only release. No database or admin bindings; never changes staging. */
import {kindergartenApi} from './kg-assets';
interface ProductionEnv {ASSETS:Fetcher;APP_ENV:string;CATALOG_OWNER:string}
export default {
 async fetch(request:Request,env:ProductionEnv):Promise<Response>{
  const u=new URL(request.url),requestId=crypto.randomUUID();const headers={'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex','X-Request-ID':requestId};
  if(!['GET','HEAD'].includes(request.method))return new Response(JSON.stringify({error:'METHOD_NOT_ALLOWED'}),{status:405,headers:{...headers,Allow:'GET, HEAD'}});
  if(u.pathname==='/api/v1/health'){
   try{const r=await env.ASSETS.fetch(new Request(new URL('/catalog-manifest.json',request.url)));if(!r.ok)throw new Error();const m=await r.json() as {environment:string;data_id:string;coverage_status:string;sources:Array<{rows:number;published_rows:number;excluded_rows:number}>};
    const ok=env.APP_ENV==='production'&&env.CATALOG_OWNER==='ray510/HK_APP'&&m.environment==='production'&&m.coverage_status==='COMPLETE_SELECTED_OFFICIAL_RESOURCES'&&m.sources.length===4&&m.sources.every(s=>s.rows>0&&s.rows===s.published_rows&&s.excluded_rows===0);
    return new Response(JSON.stringify({data:{environment:'production',readiness:ok?'ok':'error',data_status:ok?'published':'unavailable',data_id:m.data_id,storage:'versioned-static-assets',database:'not_required',sources:m.sources.length,coverage:m.coverage_status}}),{status:ok?200:503,headers});
   }catch{return new Response(JSON.stringify({error:'DATA_UNAVAILABLE'}),{status:503,headers});}
  }
  const kindergarten=await kindergartenApi(request,env,requestId);if(kindergarten)return kindergarten;
  if(u.pathname==='/api'||u.pathname.startsWith('/api/'))return new Response(JSON.stringify({error:'NOT_FOUND'}),{status:404,headers});
  return env.ASSETS.fetch(request);
 }
};
