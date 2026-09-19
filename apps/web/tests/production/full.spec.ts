import {test,expect} from '@playwright/test';
import type {Manifest,Summary,School} from '../../src/full/catalog';
test('complete official resources, all levels and full field records',async({page,request})=>{
 const health=await request.get('/api/v1/health');expect(health.status()).toBe(200);expect((await health.json()).data.environment).toBe('production');
 const m:Manifest=await (await request.get('/catalog-manifest.json')).json();expect(m.sources).toHaveLength(4);expect(m.sample_limit).toBeNull();expect(m.synthetic_records).toBe(0);expect(m.sources.every(s=>s.rows===s.published_rows&&s.excluded_rows===0)).toBe(true);
 const index:Summary[]=await(await request.get('/data/'+m.data_id+'/index.json')).json();expect(index.reduce((n,s)=>n+s.directory_rows,0)).toBe(m.sources[0].rows);expect(index.reduce((n,s)=>n+s.annual_rows,0)).toBe(m.stats.annual_rows);expect(index.some(s=>s.level==='SPECIAL')).toBe(true);
 await page.goto('/');await expect(page.getByRole('heading',{name:'選校，從完整資料開始。'})).toBeVisible();await expect(page.locator('body')).not.toContainText('小樣本範圍');await expect(page.locator('body')).not.toContainText('測試預覽');
 for(const level of ['KG','PRIMARY','SECONDARY']){const items=index.filter(s=>s.level===level&&s.annual_rows);expect(items.length).toBeGreaterThan(100);await page.goto('/schools?level='+level+'&collection=annual');await expect(page.getByRole('checkbox',{name:'選入比較'})).toHaveCount(24);await page.getByRole('checkbox',{name:'選入比較'}).nth(0).check();await page.getByRole('checkbox',{name:'選入比較'}).nth(1).check();await page.getByRole('button',{name:'比較已選 2/4'}).click();await expect(page.getByRole('heading',{name:'學校資料比較'})).toBeVisible();await expect(page.locator('tbody tr').first()).toBeVisible();
  const school:School=await(await request.get('/data/'+m.data_id+'/schools/'+items[0].id+'.json')).json();expect(Object.keys(school.annual[0].fields).length).toBeGreaterThan(80);await page.goto('/schools/'+school.id+'?year=2027');await expect(page.getByRole('heading',{name:'年度概覽完整欄位'})).toBeVisible();await expect(page.locator('.source-fields').first()).toBeVisible();
  // Clear comparison selection by starting a fresh app load before choosing another stage.
 }
 await page.goto('/sources');await expect(page.getByRole('heading',{name:'資料來源與完整性'})).toBeVisible();await expect(page.locator('td strong').filter({hasText:'100%'})).toHaveCount(4);
 const missing=await request.get('/api/no-such-endpoint');expect(missing.status()).toBe(404);expect(missing.headers()['content-type']).toContain('application/json');
});
test('private notes remain local, unknown admissions remain unknown',async({page,request})=>{
 const m:Manifest=await(await request.get('/catalog-manifest.json')).json();const index:Summary[]=await(await request.get('/data/'+m.data_id+'/index.json')).json();const school=index.find(s=>s.level==='PRIMARY'&&s.annual_rows)!;
 const secret='private-production-'+Date.now();const urls:string[]=[];page.on('request',r=>urls.push(r.url()+(r.postData()??'')));
 await page.goto('/schools/'+school.id+'?year=2027');await page.getByRole('button',{name:'加入私人清單'}).click();await expect(page.getByRole('status')).toHaveText('已儲存於此瀏覽器。');await page.goto('/shortlist');await page.getByRole('textbox',{name:'私人筆記'}).fill(secret);await page.getByRole('button',{name:'儲存筆記與進度'}).click();await expect(page.getByRole('status')).toHaveText('已儲存於此瀏覽器。');await page.reload();await expect(page.getByRole('textbox',{name:'私人筆記'})).toHaveValue(secret);expect(urls.some(u=>u.includes(secret))).toBe(false);
 await page.goto('/calendar?year=2028');await expect(page.getByText('未有此學年已核實事件；沒有沿用舊年份日期。')).toBeVisible();await page.goto('/calendar?year=2027');await expect(page.getByRole('button',{name:'匯出已核實事件 ICS'})).toBeVisible();
});
