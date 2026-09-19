import {test,expect} from '@playwright/test';
import type {Manifest,School,Summary} from '../../src/full/catalog';
import type {AnalyticsData} from '../../src/full/analytics';
import {cohortKey,compareJev} from '../../src/full/comparison';

test('Jev comparison reuses real inference with original evidence for two to four schools',async({page,request,baseURL})=>{
 test.setTimeout(120000);
 const m:Manifest=await(await request.get('/catalog-manifest.json')).json();
 const index:Summary[]=await(await request.get('/data/'+m.data_id+'/index.json')).json();
 const analytics:AnalyticsData=await(await request.get('/data/'+m.data_id+'/analytics.json')).json();
 if(process.env.SCHOOL_PRODUCTION_EXPECTED_SHA){const build=await(await request.get('/build-info.json')).json();expect(build.git_sha).toBe(process.env.SCHOOL_PRODUCTION_EXPECTED_SHA);}
 expect(analytics.provider).toBe('typesafe');expect(analytics.model_returned).toContain('jev-1.13.0');
 const external:string[]=[],writes:string[]=[];const origin=new URL(baseURL!).origin;
 page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url());if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==origin)external.push(r.url());});
 for(const level of ['KG','PRIMARY','SECONDARY']){
  const candidates=analytics.entries.filter(e=>e.level===level&&e.analysis_status==='ANALYZED'&&Object.values(e.labels).some(label=>label.evidence));
  const ids=[...new Set(candidates.map(e=>e.school_id))].slice(0,4);expect(ids).toHaveLength(4);
  const records:School[]=await Promise.all(ids.map(async id=>(await request.get('/data/'+m.data_id+'/schools/'+id+'.json')).json()));
  for(const count of [2,4]){
   const navigation=await page.goto('/compare?ids='+ids.slice(0,count).join(',')+'&year=2027');
   expect(navigation).not.toBeNull();
   expect(navigation!.headers()['cache-control']).toContain('no-transform');
   expect(navigation!.headers()['content-security-policy']).toContain("script-src 'self'");
   expect(navigation!.headers()['content-security-policy']).toContain("connect-src 'self'");
   expect(navigation!.headers()['content-security-policy']).not.toContain('unsafe-inline');
   expect(await navigation!.text()).not.toContain('static.cloudflareinsights.com');
   await expect(page.getByRole('heading',{name:'JEV 證據比較',exact:true})).toBeVisible();
   const table=page.getByTestId('jev-comparison-table');await expect(table.locator('tbody tr')).toHaveCount(6);await expect(table.locator('thead th')).toHaveCount(count+1);
   await expect(page.getByTestId('official-comparison')).toBeVisible();await expect(page.getByTestId('comparison-coverage')).toContainText(String(count)+' 項取得');
   const a=records[0].annual[0];const expected=compareJev(records.slice(0,count),cohortKey(a.source_id,a.edition));
   for(const topic of expected){const row=table.locator('tr[data-topic="'+topic.id+'"]');await expect(row.locator('td')).toHaveCount(count);for(let i=0;i<count;i++)await expect(row.locator('td').nth(i)).toHaveAttribute('data-state',topic.cells[i].status);}
   const quote=table.locator('details.compare-evidence').first();await quote.locator('summary').click();await expect(quote.locator('blockquote')).toBeVisible();
   await page.screenshot({path:test.info().outputPath('jev-compare-'+level+'-'+count+'.png'),fullPage:true});
  }
 }
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'匯出比較分析 JSON'}).click();const download=await downloadPromise;const path=await download.path();expect(path).toBeTruthy();
 const fs=await import('node:fs/promises');const report=JSON.parse(await fs.readFile(path!,'utf8'));expect(report.inference_mode).toBe('REUSE_PUBLISHED_JEV_RESULTS');expect(report.data_id).toBe(m.data_id);expect(report.school_ids).toHaveLength(4);expect(report.topics).toHaveLength(6);expect(report).not.toHaveProperty('notes');
 expect(writes).toEqual([]);expect(external).toEqual([]);
 const primary=index.find(s=>s.level==='PRIMARY'&&s.annual_rows)!;const kg=index.find(s=>s.level==='KG'&&s.annual_rows)!;
 await page.goto('/compare?ids='+primary.id+','+kg.id);await expect(page.getByRole('alert')).toContainText('相同學段');await expect(page.getByTestId('jev-comparison')).toHaveCount(0);
});

test('Jev comparison preserves missing profiles and invalid inference as unknown',async({page,request})=>{
 const m:Manifest=await(await request.get('/catalog-manifest.json')).json();const index:Summary[]=await(await request.get('/data/'+m.data_id+'/index.json')).json();
 const analytics:AnalyticsData=await(await request.get('/data/'+m.data_id+'/analytics.json')).json();
 const bad=analytics.entries.find(e=>e.analysis_status==='INVALID_RESPONSE')!;expect(bad).toBeTruthy();
 const good=analytics.entries.find(e=>e.level===bad.level&&e.analysis_status==='ANALYZED'&&e.source_id===bad.source_id)!;
 await page.goto('/compare?ids='+bad.school_id+','+good.school_id);await expect(page.getByTestId('jev-comparison-table').locator('td[data-state="INVALID_RESPONSE"]')).toHaveCount(6);
 const norm=(v:string)=>v.normalize('NFKC').toUpperCase().replace(/\s+/g,'');
 const missing=index.find(s=>s.level===bad.level&&!s.annual_rows&&!index.some(a=>a.level===s.level&&a.annual_rows>0&&norm(a.name)===norm(s.name)))!;expect(missing).toBeTruthy();
 await page.goto('/compare?ids='+missing.id+','+good.school_id);await expect(page.getByTestId('jev-comparison-table').locator('td[data-state="NO_PROFILE"]')).toHaveCount(6);await expect(page.getByTestId('official-comparison')).toBeVisible();
 await page.reload();await expect(page.getByTestId('jev-comparison-table').locator('tbody tr')).toHaveCount(6);
 await page.goto('/compare?ids='+good.school_id+','+good.school_id);await expect(page.getByRole('alert')).toContainText('不同');
});
