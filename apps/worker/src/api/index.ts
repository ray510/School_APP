import {Hono} from 'hono';
import type {HonoEnvironment} from '../env';
import {inspectReadiness,publishedChannels} from '../readiness';
import catalog from './catalog';import annual from './annual';
const api=new Hono<HonoEnvironment>();
api.get('/v1/health',async c=>{
  const result=await inspectReadiness(c.env?.APP_ENV,c.env?.DB,undefined,c.env?.ALLOW_TEST_DATA==='true');
  return c.json({data:result.data,meta:{request_id:c.get('request_id'),environment:result.data.environment}},result.status);
});
api.get('/v1/manifest',async c=>{
  if(c.get('environment')==='invalid'||!c.env?.DB)return c.json({error:{code:'NOT_READY',message:'Environment or database unavailable'},meta:{request_id:c.get('request_id')}},503);
  try{const all=await publishedChannels(c.env.DB);const channels=all.filter(channel=>!channel.channel.startsWith('test:')||(c.get('environment')==='local'&&c.env.ALLOW_TEST_DATA==='true'));return c.json({data:{channels},meta:{request_id:c.get('request_id'),environment:c.get('environment')}});}
  catch{return c.json({error:{code:'NOT_READY',message:'Published data unavailable'},meta:{request_id:c.get('request_id')}},503);}
});
api.route('/v1',annual);api.route('/v1',catalog);
api.all('*',c=>c.json({error:{code:'NOT_FOUND',message:'API endpoint not found'},meta:{request_id:c.get('request_id')}},404));
export default api;
