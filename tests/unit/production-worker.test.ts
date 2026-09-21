import {describe,expect,it} from 'vitest';
import worker from '../../apps/worker/src/production';

const ids=['school_111111111111111111111111','school_222222222222222222222222','school_333333333333333333333333'];
function bindings(bundleChar:string){
 const bundle=bundleChar.repeat(64),rows=[
  {id:ids[0],aliases:[ids[0],'school_aaaaaaaaaaaaaaaaaaaaaaaa'],name:'甲幼稚園',address:'北區甲街',district:'北區'},
  {id:ids[1],aliases:[ids[1]],name:'乙幼稚園',address:'北區乙街',district:'北區'},
  {id:ids[2],aliases:[ids[2]],name:'Gamma Kindergarten',address:'Central',district:'中西區'},
 ],manifest={schema:2,phase:'KG_ONLY',bundle_id:bundle,parent_cards:3,source_groups:4,annual_profiles:3};
 const assets={
  '/kg-parent-manifest.json':manifest,
  [`/kg-parent/${bundle}/index.json`]:rows,
  ...Object.fromEntries(rows.map(row=>[`/kg-parent/${bundle}/schools/${row.id}.json`,{...row,profile:null,fees:{status:'UNKNOWN',rows:[]}}])),
 };
 return {APP_ENV:'production',CATALOG_OWNER:'ray510/HK_APP',ASSETS:{fetch:async(request:Request)=>{const body=assets[new URL(request.url).pathname as keyof typeof assets];return body?Response.json(body):new Response('missing',{status:404});}}} as unknown as Parameters<typeof worker.fetch>[1];
}
async function get(path:string,env=bindings('a')){return worker.fetch(new Request('https://schools.finpulsx.win'+path),env);}

describe('production kindergarten asset API',()=>{
 it('filters and paginates the compact school index with a bundle-bound cursor',async()=>{
  const env=bindings('b'),first=await get('/api/v1/kindergartens?district='+encodeURIComponent('北區')+'&limit=1',env);expect(first.status).toBe(200);const one=await first.json() as any;
  expect(one.data.map((row:any)=>row.name)).toEqual(['甲幼稚園']);expect(one.meta).toMatchObject({total:2,parent_cards:3,source_groups:4});expect(one.meta.next_cursor).toBeTypeOf('string');
  const second=await get('/api/v1/kindergartens?district='+encodeURIComponent('北區')+'&limit=1&cursor='+encodeURIComponent(one.meta.next_cursor),env);expect((await second.json() as any).data[0].name).toBe('乙幼稚園');
 const changed=await get('/api/v1/kindergartens?district='+encodeURIComponent('中西區')+'&limit=1&cursor='+encodeURIComponent(one.meta.next_cursor),env);expect(changed.status).toBe(400);
  const normalized=await get('/api/v1/kindergartens?q='+encodeURIComponent('ＧＡＭＭＡ'),env);expect((await normalized.json() as any).data.map((row:any)=>row.id)).toEqual([ids[2]]);
  expect((await get('/api/v1/kindergartens?limit=41',env)).status).toBe(400);expect((await get('/api/v1/kindergartens?q=a&q=b',env)).status).toBe(400);
 });
 it('resolves bounded ids in request order and rejects mixed filters',async()=>{
  const env=bindings('c'),alias='school_aaaaaaaaaaaaaaaaaaaaaaaa',result=await get('/api/v1/kindergartens?ids='+ids[2]+','+alias,env);expect(result.status).toBe(200);expect((await result.json() as any).data.map((row:any)=>row.id)).toEqual([ids[2],ids[0]]);
  expect((await get('/api/v1/kindergartens?ids='+ids[0]+'&q=x',env)).status).toBe(400);
 });
 it('loads canonical detail through an alias without accepting arbitrary paths',async()=>{
  const env=bindings('d'),result=await get('/api/v1/kindergartens/school_aaaaaaaaaaaaaaaaaaaaaaaa',env);expect(result.status).toBe(200);const body=await result.json() as any;expect(body.data.id).toBe(ids[0]);expect(body.meta.bundle_id).toBe('d'.repeat(64));
  const missing=await get('/api/v1/kindergartens/school_ffffffffffffffffffffffff',env);expect(missing.status).toBe(404);expect(missing.headers.get('x-request-id')).toBeTruthy();
  expect((await get('/api/v1/kindergartens/../../catalog-manifest.json',env)).status).toBe(404);
 });
 it('keeps the public Worker read-only and fails closed on inconsistent coverage',async()=>{
  const env=bindings('e');expect((await worker.fetch(new Request('https://schools.finpulsx.win/api/v1/kindergartens',{method:'POST'}),env)).status).toBe(405);
  const broken=bindings('f') as any,original=broken.ASSETS.fetch;broken.ASSETS.fetch=async(request:Request)=>{const response=await original(request);if(new URL(request.url).pathname.includes('/index.json'))return Response.json([]);return response;};
  const response=await get('/api/v1/kindergartens',broken);expect(response.status).toBe(503);expect((await response.json() as any).error.code).toBe('DATA_UNAVAILABLE');
 });
});
