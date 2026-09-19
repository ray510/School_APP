import {test,expect} from '@playwright/test';import type {InsightManifest,InsightSummary,SchoolInsight} from '../../src/full/sitewide';
test('source centre documents every original resource and separates AI from official data',async({page,request})=>{
 const m=await(await request.get('/catalog-manifest.json')).json();const i:InsightManifest=await(await request.get('/insights-manifest.json')).json();expect(i.data_id).toBe(m.data_id);expect(i.annual_rows).toBe(m.stats.annual_rows);expect(i.status_counts.ANALYZED).toBeGreaterThanOrEqual(i.annual_rows*.95);
 const external:string[]=[];page.on('request',r=>{if(new URL(r.url()).origin!==new URL(page.url()).origin&&r.url().startsWith('https:')&& !r.isNavigationRequest())external.push(r.url());});
 await page.goto('/sources');await expect(page.getByRole('heading',{name:'資料來源與完整性',exact:true})).toBeVisible();await expect(page.locator('.source-card')).toHaveCount(4);
 for(const s of m.sources){const card=page.locator('[data-source="'+s.id+'"]');await expect(card).toContainText(String(s.rows));const raw=await request.get('/downloads/sources/'+s.id+'.csv');expect(raw.ok()).toBe(true);const crypto=await import('node:crypto');expect(crypto.createHash('sha256').update(await raw.body()).digest('hex')).toBe(s.sha256);}
 await page.getByLabel('搜尋來源或欄位名稱').fill('小一學校網');await expect(page.locator('.source-card')).toHaveCount(1);await expect(page.locator('.field-chips')).toContainText('小一學校網');await page.getByLabel('搜尋來源或欄位名稱').fill('');
 await expect(page.getByRole('heading',{name:'JEV 是分析工具，不是學校原始資料來源'})).toBeVisible();await expect(page.locator('#notice-sources .notice-source')).not.toHaveCount(0);expect(external).toEqual([]);
});
test('actual JEV themes work from directory search to school and comparison, with evidence',async({page,request})=>{
 const i:InsightManifest=await(await request.get('/insights-manifest.json')).json();const index:InsightSummary[]=await(await request.get('/insights/'+i.analysis_id+'/index.json')).json();
 const eligible=index.filter(s=>s.level==='KG'&&s.directory_rows&&s.jev_tags.inquiry_play==='MENTIONED');expect(eligible.length).toBeGreaterThan(10);
 await page.goto('/schools?level=KG&collection=directory&jev_tag=inquiry_play&jev_status=MENTIONED');await expect(page.getByLabel('JEV 特色主題')).toHaveValue('inquiry_play');await expect(page.locator('.school-card').first()).toContainText('概覽提及：遊戲及探究教學');
 for(const id of ['school_2468a6d82a2fad7b858cd5b6','school_b579ecbc45cca6d4f62c20c9','school_7f49a973a6708cfc096def61']){const s=index.find(s=>s.id===id)!;expect(s.profile_count).toBe(1);expect(s.classification.kg_operator_type.value).toBe('NON_PROFIT');}
 const school:SchoolInsight=await(await request.get('/insights/'+i.analysis_id+'/schools/'+eligible[0].id+'.json')).json();expect(school.topics).toHaveLength(10);expect(school.topics.find(t=>t.id==='inquiry_play')!.cell.evidence).toBeTruthy();
 await page.goto('/schools/'+eligible[0].id);const panel=page.getByTestId('sitewide-insights');await expect(panel.getByRole('heading',{name:'JEV 選校重點與查詢方向'})).toBeVisible();await expect(panel.locator('.insight-topic')).toHaveCount(4);await panel.locator('details summary').first().click();await expect(panel.locator('blockquote').first()).toBeVisible();
 await page.goto('/compare?ids='+eligible[0].id+','+eligible[1].id);await expect(page.getByRole('heading',{name:'深入教學與支援比較'})).toBeVisible();await expect(page.getByTestId('jev-comparison-table').locator('tbody tr')).toHaveCount(6);await expect(page.getByTestId('sitewide-insights').locator('.insight-grid').first().locator('article')).toHaveCount(2);
 await page.reload();await expect(page.getByRole('heading',{name:'深入教學與支援比較'})).toBeVisible();
});
