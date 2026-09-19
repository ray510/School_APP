import { z } from 'zod';
const Meta=z.object({release_id:z.string().nullable().optional(),scope:z.string().nullable().optional(),is_test:z.boolean().optional(),next_cursor:z.string().nullable().optional(),rows_read:z.number().optional(),data_status:z.string().optional()}).passthrough();
export type ResponseMeta=z.infer<typeof Meta>;
export async function getData<T extends z.ZodTypeAny>(path:string,schema:T,signal?:AbortSignal):Promise<{data:z.infer<T>;meta:ResponseMeta}> {
  if(!path.startsWith('/api/v1/'))throw new Error('Only same-origin public API requests are allowed');
  const response=await fetch(path,{signal:signal??AbortSignal.timeout(10000),cache:'no-store'});
  const body:unknown=await response.json();
  if(!response.ok){const error=z.object({error:z.object({message:z.string()})}).safeParse(body);throw new Error(error.success?error.data.error.message:'資料暫未就緒');}
  if(!body||typeof body!=='object'||!('data' in body)||!('meta' in body))throw new Error('API 回應格式不正確');
  return {data:schema.parse(body.data),meta:Meta.parse(body.meta)};
}
