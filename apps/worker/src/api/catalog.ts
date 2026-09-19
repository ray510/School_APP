import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { AdmissionEvent, Level, Profile, Search, Year } from '@hk-school/contracts/domain';
import { toCalendar } from '@hk-school/contracts/calendar';
import type { HonoEnvironment } from '../env';
type C=Context<HonoEnvironment>;
type Release={release_id:string;channel:string;scope:string;item_count:number;published_at:string};
class InputError extends Error {}
const api=new Hono<HonoEnvironment>();
function meta(c:C,release:Release|null,extra:Record<string,unknown>={}) {
  return {request_id:c.get('request_id'),environment:c.get('environment'),release_id:release?.release_id??null,scope:release?.scope??null,is_test:release?.channel.startsWith('test:')??false,data_status:release?'published':'empty',...extra};
}
function permitTest(c:C):boolean{return c.get('environment')==='local'&&c.env.ALLOW_TEST_DATA==='true';}
async function releaseFor(c:C,level:string,pinned?:string):Promise<Release|null>{
  const allowed=[`profiles:${level}`,...(permitTest(c)?[`test:profiles:${level}`]:[])];
  for(const channel of allowed){
    const statement=pinned?c.env.DB.prepare("SELECT release_id,channel,scope,item_count,published_at FROM release_manifests WHERE release_id=? AND channel=? AND status='PUBLISHED'").bind(pinned,channel):c.env.DB.prepare("SELECT m.release_id,m.channel,m.scope,m.item_count,m.published_at FROM release_heads h JOIN release_manifests m ON m.release_id=h.release_id AND m.channel=h.channel WHERE h.channel=? AND m.status='PUBLISHED'").bind(channel);
    const found=await statement.first<Release>();if(found)return found;
  }
  if(pinned)throw new InputError('指定版本並非此學段可用的已發佈版本');return null;
}
function unpack(content:string){return Profile.parse(JSON.parse(content));}
function parseQuery(c:C){const params=c.req.query();return Search.parse({...params,year:params.year??new Date().getUTCFullYear()+1});}
api.use('*',async(c,next)=>{if(c.get('environment')==='invalid'||!c.env?.DB)return c.json({error:{code:'NOT_READY',message:'環境或資料庫未就緒'},meta:meta(c,null)},503);await next();});
api.get('/schools',async c=>{
  const query=parseQuery(c);const context={level:query.level,q:query.q,district:query.district,funding:query.funding,has_annual:query.has_annual};let last='';let pinned=query.release;
  if(query.cursor){
    let cursor:unknown;try{cursor=JSON.parse(decodeURIComponent(atob(query.cursor)));}catch{throw new InputError('無效分頁游標');}
    const parsed=z.object({release:z.string().max(120),last:z.string().max(240),context:z.string().max(1400)}).strict().parse(cursor);
    if(parsed.context!==JSON.stringify(context)||(pinned&&pinned!==parsed.release))throw new InputError('篩選或資料版本已改變，請重新搜尋');pinned=parsed.release;last=parsed.last;
  }
  const release=await releaseFor(c,query.level,pinned);
  if(!release)return c.json({data:[],meta:meta(c,null,{next_cursor:null,entry_year:query.year,admission_status:'not_verified'})});
  const clauses=['s.release_id=?','s.level=?','s.item_key>?'];const params:Array<string|number>=[release.release_id,query.level,last];
  if(!permitTest(c))clauses.push('s.is_test=0');
  if(query.has_annual)clauses.push("EXISTS(SELECT 1 FROM annual_profile_versions a JOIN annual_release_items ai ON ai.annual_profile_id=a.annual_profile_id JOIN release_heads ah ON ah.release_id=ai.release_id JOIN release_manifests am ON am.release_id=ah.release_id AND am.channel=ah.channel WHERE a.school_id=s.school_id AND a.level=s.level AND a.identity_verified=1 AND a.is_test=0 AND ah.channel LIKE 'annual:%' AND am.status='PUBLISHED')");
  if(query.q){clauses.push('instr(s.normalized_name,?)>0');params.push(query.q);}if(query.district){clauses.push('s.district=?');params.push(query.district);}if(query.funding){clauses.push('s.funding=?');params.push(query.funding);}
  const result=await c.env.DB.prepare(`SELECT s.item_key,p.content_json FROM school_search s JOIN profile_versions p ON p.profile_version_id=s.profile_version_id WHERE ${clauses.join(' AND ')} ORDER BY s.item_key LIMIT ?`).bind(...params,query.limit+1).all<{item_key:string;content_json:string}>();
  const more=result.results.length>query.limit;const rows=result.results.slice(0,query.limit);
  const cursor=more?btoa(encodeURIComponent(JSON.stringify({release:release.release_id,last:rows[rows.length-1].item_key,context:JSON.stringify(context)}))):null;
  return c.json({data:rows.map(row=>unpack(row.content_json)),meta:meta(c,release,{next_cursor:cursor,entry_year:query.year,admission_status:'not_verified',rows_read:result.meta.rows_read})});
});
api.get('/schools/:id',async c=>{
  const query=parseQuery(c);const id=Profile.shape.school_id.parse(c.req.param('id'));const release=await releaseFor(c,query.level,query.release);
  if(!release)return c.json({error:{code:'NOT_FOUND',message:'未有此學段已發佈資料'},meta:meta(c,null)},404);
  const result=await c.env.DB.prepare(`SELECT p.content_json FROM school_search s JOIN profile_versions p ON p.profile_version_id=s.profile_version_id WHERE s.release_id=? AND s.school_id=? ${permitTest(c)?'':'AND s.is_test=0'} ORDER BY s.item_key LIMIT 20`).bind(release.release_id,id).all<{content_json:string}>();
  if(!result.results.length)return c.json({error:{code:'NOT_FOUND',message:'此版本找不到學校'},meta:meta(c,release)},404);
  return c.json({data:result.results.map(row=>unpack(row.content_json)),meta:meta(c,release,{entry_year:query.year,admission_status:'not_verified',rows_read:result.meta.rows_read})});
});
api.get('/compare',async c=>{
  const level=Level.parse(c.req.query('level'));const year=Year.parse(c.req.query('year'));const ids=z.array(z.string().min(1).max(240)).min(2).max(4).parse((c.req.query('ids')??'').split(','));
  if(new Set(ids).size!==ids.length)throw new InputError('比較項目不得重複');
  const pinned=z.string().max(120).optional().parse(c.req.query('release'));const release=await releaseFor(c,level,pinned);if(!release)throw new InputError('未有可比較的已發佈資料');
  const result=await c.env.DB.prepare(`SELECT s.item_key,p.content_json FROM school_search s JOIN profile_versions p ON p.profile_version_id=s.profile_version_id WHERE s.release_id=? AND s.level=? AND s.item_key IN (${ids.map(()=>'?').join(',')}) ${permitTest(c)?'':'AND s.is_test=0'}`).bind(release.release_id,level,...ids).all<{item_key:string;content_json:string}>();
  if(result.results.length!==ids.length)throw new InputError('項目必須屬於同一學段及同一已發佈版本');const byId=new Map(result.results.map(row=>[row.item_key,unpack(row.content_json)]));
  return c.json({data:ids.map(id=>byId.get(id)),meta:meta(c,release,{entry_year:year,rows_read:result.meta.rows_read})});
});
api.get('/sources',async c=>{const result=await c.env.DB.prepare('SELECT source_id,catalog_url,publisher,contract_status,enabled,last_checked_at,last_successful_fetch_at FROM sources ORDER BY source_id LIMIT 30').all();return c.json({data:result.results,meta:meta(c,null)});});
async function events(c:C){
  const level=Level.parse(c.req.query('level'));const year=Year.parse(c.req.query('year'));
  const school=z.string().regex(/^sch_[a-zA-Z0-9_-]{1,80}$/).optional().parse(c.req.query('school'));
  const result=await c.env.DB.prepare("SELECT e.content_json FROM release_heads h JOIN release_manifests m ON m.release_id=h.release_id AND m.channel=h.channel JOIN event_release_items i ON i.release_id=m.release_id JOIN event_versions e ON e.event_version_id=i.event_version_id WHERE m.status='PUBLISHED' AND h.channel LIKE 'events:%' AND e.level=? AND e.entry_year_start=? AND e.verified=1 AND e.is_test=0 AND (? IS NULL OR e.school_id IS NULL OR e.school_id=?) ORDER BY e.starts_sort,e.event_id LIMIT 201").bind(level,year,school??null,school??null).all<{content_json:string}>();
  if(result.results.length>200)throw new InputError('事件超過匯出上限，請縮窄收生範圍');return result.results.map(row=>AdmissionEvent.parse(JSON.parse(row.content_json)));
}
api.get('/events',async c=>c.json({data:await events(c),meta:meta(c,null,{admission_status:'verified_events_only'})}));
api.get('/events.ics',async c=>new Response(toCalendar(await events(c)),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="school-events.ics"','Cache-Control':'no-store'}}));
api.onError((error,c)=>{
  if(error instanceof z.ZodError||error instanceof InputError)return c.json({error:{code:'INVALID_INPUT',message:error instanceof InputError?error.message:'查詢參數不正確'},meta:meta(c,null)},400);
  return c.json({error:{code:'NOT_READY',message:'資料暫未就緒，請稍後再試'},meta:meta(c,null)},503);
});
export default api;
