import {Hono} from 'hono';
import {z} from 'zod';
import {AnnualProfile,AnnualQuery} from '@hk-school/contracts/annual';
import {Profile,Level} from '@hk-school/contracts/domain';
import type {HonoEnvironment} from '../env';
const api=new Hono<HonoEnvironment>();
api.get('/annual-profiles',async c=>{
  const query=AnnualQuery.parse(c.req.query());
  if(!c.env?.DB||c.get('environment')==='invalid')return c.json({error:{code:'NOT_READY',message:'年度資料庫尚未就緒'},meta:{request_id:c.get('request_id')}},503);
  const conditions=["m.status='PUBLISHED'","h.channel LIKE 'annual:%'",'p.school_id=?','p.level=?','p.identity_verified=1','p.is_test=0'];
  const params:string[]=[query.school,query.level];if(query.edition){conditions.push('p.profile_edition=?');params.push(query.edition);}
  const result=await c.env.DB.prepare(`SELECT p.content_json,m.release_id,m.scope FROM release_heads h JOIN release_manifests m ON m.release_id=h.release_id AND m.channel=h.channel JOIN annual_release_items i ON i.release_id=m.release_id JOIN annual_profile_versions p ON p.annual_profile_id=i.annual_profile_id WHERE ${conditions.join(' AND ')} ORDER BY p.profile_edition DESC,p.source_record_key LIMIT 31`).bind(...params).all<{content_json:string;release_id:string;scope:string}>();
  if(result.results.length>30)return c.json({error:{code:'LIMIT_EXCEEDED',message:'請選擇特定概覽版本'},meta:{request_id:c.get('request_id')}},400);
  return c.json({data:result.results.map(row=>({profile:AnnualProfile.parse(JSON.parse(row.content_json)),release_id:row.release_id,scope:row.scope})),meta:{request_id:c.get('request_id'),data_status:result.results.length?'published':'empty',rows_read:result.meta.rows_read}});
});
api.get('/annual-compare',async c=>{
  const level=Level.parse(c.req.query('level'));
  const schools=z.array(Profile.shape.school_id).min(2).max(4).parse((c.req.query('schools')??'').split(','));
  if(new Set(schools).size!==schools.length)throw new z.ZodError([{code:'custom',path:['schools'],message:'Duplicate schools'}]);
  if(!c.env?.DB||c.get('environment')==='invalid')return c.json({error:{code:'NOT_READY',message:'年度資料庫尚未就緒'},meta:{request_id:c.get('request_id')}},503);
  const result=await c.env.DB.prepare(`SELECT p.content_json,m.release_id,m.scope FROM release_heads h JOIN release_manifests m ON m.release_id=h.release_id AND m.channel=h.channel JOIN annual_release_items i ON i.release_id=m.release_id JOIN annual_profile_versions p ON p.annual_profile_id=i.annual_profile_id WHERE m.status='PUBLISHED' AND h.channel LIKE 'annual:%' AND p.level=? AND p.school_id IN (${schools.map(()=>'?').join(',')}) AND p.identity_verified=1 AND p.is_test=0 ORDER BY p.profile_edition DESC,p.school_id LIMIT 41`).bind(level,...schools).all<{content_json:string;release_id:string;scope:string}>();
  if(result.results.length>40)return c.json({error:{code:'LIMIT_EXCEEDED',message:'概覽版本過多，請使用個別學校頁'},meta:{request_id:c.get('request_id')}},400);
  return c.json({data:result.results.map(row=>({profile:AnnualProfile.parse(JSON.parse(row.content_json)),release_id:row.release_id,scope:row.scope})),meta:{request_id:c.get('request_id'),release_ids:[...new Set(result.results.map(row=>row.release_id))],missing_schools:schools.filter(id=>!result.results.some(row=>JSON.parse(row.content_json).school_id===id)),data_status:result.results.length?'published':'empty'}});
});
api.onError((error,c)=>c.json({error:{code:error instanceof z.ZodError?'INVALID_INPUT':'NOT_READY',message:error instanceof z.ZodError?'年度資料查詢參數不正確':'年度概覽暫未可用'},meta:{request_id:c.get('request_id')}},error instanceof z.ZodError?400:503));
export default api;
