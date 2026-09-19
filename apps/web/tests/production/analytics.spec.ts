import {test,expect} from '@playwright/test';import type {Manifest,Summary} from '../../src/full/catalog';import type {AnalyticsData} from '../../src/full/analytics';
test('separate school funding, KG operator nature and scheme participation',async({page,request})=>{
 const m:Manifest=await(await request.get('/catalog-manifest.json')).json();const index:Summary[]=await(await request.get('/data/'+m.data_id+'/index.json')).json();
 const school=index.find(s=>s.name==='上水惠州公立學校'&&s.directory_rows)!;expect(school.classification.funding_type.value).toBe('AIDED');
 await page.goto('/schools/'+school.id);await expect(page.getByRole('heading',{name:'官方資助類別：資助'})).toBeVisible();
 const kg=index.find(s=>s.level==='KG'&&s.classification.kg_operator_type.value==='NON_PROFIT'&&s.classification.kg_scheme_participation.value==='PARTICIPATING')!;expect(kg).toBeTruthy();
 await page.goto('/schools/'+kg.id);await expect(page.getByRole('heading',{name:'幼稚園營辦性質：非牟利'})).toBeVisible();await expect(page.getByRole('heading',{name:'幼稚園教育計劃：參加幼稚園教育計劃'})).toBeVisible();
 await page.goto('/schools?level=KG&collection=annual&kg_operator=NON_PROFIT&kg_scheme=PARTICIPATING');await expect(page.locator('.school-card').first()).toContainText('非牟利');await expect(page.locator('.school-card').first()).toContainText('參加幼稚園教育計劃');
});
test('analytics counts every source record and exposes model coverage honestly',async({page,request})=>{
 const m:Manifest=await(await request.get('/catalog-manifest.json')).json();const a:AnalyticsData=await(await request.get('/data/'+m.data_id+'/analytics.json')).json();expect(a.entries.length).toBe(m.stats.source_record_count);expect(a.cohort_unit).toBe('SOURCE_RECORD');expect(a.quality_status).toBe('NOT_HUMAN_CALIBRATED');
 for(const s of m.sources)expect(a.entries.filter(r=>r.source_id===s.id)).toHaveLength(s.rows);
 const calls:string[]=[];page.on('request',r=>{if(r.method()!=='GET')calls.push(r.url());});await page.goto('/analytics');await expect(page.getByRole('heading',{name:'資料分析',exact:true})).toBeVisible();await expect(page.getByTestId('cohort-size')).toHaveText(String(m.sources.find(s=>s.id==='chsc-primary-profiles')!.rows));
 await page.getByLabel('統計來源與版本').selectOption('edb-kg-profiles');await expect(page.getByTestId('cohort-size')).toHaveText(String(m.sources.find(s=>s.id==='edb-kg-profiles')!.rows));await expect(page.getByRole('heading',{name:'幼稚園營辦性質',exact:true})).toBeVisible();
 if(!a.provider)await expect(page.getByText('未取得可用的 JEV 分析結果；分類與下方來源統計仍可使用。')).toBeVisible();
 await expect(page.getByRole('button',{name:'匯出目前分析 JSON'})).toBeVisible();expect(calls).toEqual([]);
});
