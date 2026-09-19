import assert from 'node:assert/strict';
const base='http://127.0.0.1:8787';let checks=0;const queryCosts=[];
async function request(path,status=200){const response=await fetch(base+path);assert.equal(response.status,status,path);assert.match(response.headers.get('content-type')??'',/application\/json/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');checks++;const body=await response.json();if(typeof body.meta?.rows_read==='number')queryCosts.push({path,main_query_rows_read:body.meta.rows_read});return body;}
for(const level of ['KG','PRIMARY','SECONDARY']){
  const result=await request(`/api/v1/schools?level=${level}&year=2027`);assert.equal(result.data.length,2);assert.equal(result.meta.is_test,true);
  const ids=result.data.map(p=>p.item_key).join(',');
  const compared=await request(`/api/v1/compare?level=${level}&year=2027&ids=${encodeURIComponent(ids)}&release=${result.meta.release_id}`);assert.equal(compared.data.length,2);
  const detail=await request(`/api/v1/schools/${result.data[0].school_id}?level=${level}&year=2027&release=${result.meta.release_id}`);assert.equal(detail.data[0].school_id,result.data[0].school_id);
  const annual=await request(`/api/v1/annual-profiles?school=${result.data[0].school_id}&level=${level}`);assert.deepEqual(annual.data,[]);
}
const first=await request('/api/v1/schools?level=PRIMARY&year=2027&limit=1&q='+encodeURIComponent('測試'));assert.ok(first.meta.next_cursor);
const second=await request('/api/v1/schools?level=PRIMARY&year=2027&limit=1&q='+encodeURIComponent('測試')+'&cursor='+encodeURIComponent(first.meta.next_cursor));assert.notEqual(first.data[0].item_key,second.data[0].item_key);
await request('/api/v1/schools?level=PRIMARY&year=2027&limit=41',400);await request('/api/v1/schools?level=PRIMARY&year=2027&cursor=broken',400);await request('/api/v1/schools?level=PRIMARY&year=2027&release=not-published',400);
const injection=await request('/api/v1/schools?level=PRIMARY&year=2027&q='+encodeURIComponent("' OR 1=1 --"));assert.equal(injection.data.length,0);
const events=await request('/api/v1/events?level=PRIMARY&year=2027');assert.equal(events.data.length,0);
const calendar=await fetch(base+'/api/v1/events.ics?level=PRIMARY&year=2027');assert.equal(calendar.status,200);assert.ok(!(await calendar.text()).includes('BEGIN:VEVENT'));checks++;
await request('/api/v1/admin/publish',404);await request('/api',404);
const buildResponse=await fetch(base+'/build-info.json');assert.equal(buildResponse.status,200);const build=await buildResponse.json();assert.equal(build.environment,'local');assert.equal(build.indexing_enabled,false);checks++;
const html=await fetch(base+'/');assert.match(html.headers.get('content-security-policy')??'',/object-src 'none'/);assert.equal(html.headers.get('x-content-type-options'),'nosniff');assert.match(html.headers.get('x-robots-tag')??'',/noindex/);checks++;
console.log(JSON.stringify({suite:'actual-workerd-catalog-http',checks,status:'PASS',remote:false,queryCosts,note:'Main query row reads only; not complete request or account-wide cost'}));
