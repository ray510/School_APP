import {test,expect} from '@playwright/test';import type {KGManifest,KGSummary} from '../../src/full/kg/model';
const ids=['school_2468a6d82a2fad7b858cd5b6','school_b579ecbc45cca6d4f62c20c9','school_7f49a973a6708cfc096def61'];
test('KG parent needs to evidence comparison without raw status controls',async({page,request})=>{
 const m:KGManifest=await(await request.get('/kg-parent-manifest.json')).json();expect(m.phase).toBe('KG_ONLY');expect(m.annual_profiles).toBe(962);expect(m.source_groups).toBe(1759);const rows:KGSummary[]=await(await request.get('/kg-parent/'+m.bundle_id+'/index.json')).json();expect(new Set(rows.flatMap(r=>r.aliases)).size).toBe(1759);
 await page.goto('/kindergarten');await expect(page.getByRole('heading',{name:'先搵到夾你生活的幼稚園。'})).toBeVisible();await expect(page.getByRole('heading',{name:'你的選校需要'})).toBeVisible();await expect(page.getByLabel('JEV 資料狀態')).toHaveCount(0);
 await expect(page.locator('[data-source-status="school-announcement"]').first()).toContainText('逐校公告');
 // Select by the actual accessibility-tree control name, not the text of its enclosing label and options.
 const district=page.getByRole('combobox',{name:'地區',exact:true});await expect(district).toBeVisible();await district.selectOption('北區');await expect(district).toHaveValue('北區');await page.getByRole('button',{name:'按需要更新'}).click();await expect(page).toHaveURL(/district=/);await expect(page.locator('.kg-search-card').first()).toBeVisible();await expect(page.locator('.kg-search-card .kg-kicker').first()).toHaveText('北區');
 await page.screenshot({path:test.info().outputPath('kg-parent-search.png'),fullPage:true});
 await page.goto('/kindergarten/compare?ids='+ids.join(',')+'&year=2027&session=WD&grade=K1');await expect(page.getByRole('heading',{name:'一眼看出要確認嘅差異'})).toBeVisible();await expect(page.locator('.kg-quick-compare')).toContainText('資料齊度');await expect(page.locator('.kg-quick-compare')).toContainText('報名：');await expect(page.locator('.kg-quick-compare')).toContainText('費用：');await expect(page.locator('.kg-quick-compare')).toContainText('接送：');await expect(page.locator('.kg-quick-compare')).toContainText('13,794');await expect(page.locator('.kg-quick-compare')).toContainText('17,930');await expect(page.locator('.kg-quick-compare')).toContainText('19,415');await expect(page.locator('.kg-quick-compare')).toContainText('不是 2027/28');await expect(page.getByRole('button',{name:'適應同支援',exact:true})).toBeVisible();await page.getByRole('button',{name:'適應同支援',exact:true}).click();await expect(page.locator('.kg-evidence').first()).toContainText('適應同支援');await page.screenshot({path:test.info().outputPath('kg-parent-compare.png'),fullPage:true});
});
test('parent application steps, class hours and private notes',async({page,request})=>{
 const m:KGManifest=await(await request.get('/kg-parent-manifest.json')).json();const rows:KGSummary[]=await(await request.get('/kg-parent/'+m.bundle_id+'/index.json')).json();const s=rows.find(r=>r.name==='大埔循道衛理幼稚園')!;
 const calls:string[]=[];page.on('request',r=>calls.push(r.url()+(r.postData()??'')));
 await page.goto('/kindergarten/'+s.id+'?year=2027');await expect(page.locator('li').filter({hasText:'遞交方法：親臨／郵寄至本幼稚園遞交'})).toBeVisible();await expect(page.getByText('全日班：09:00–16:30（2025/26）',{exact:false}).first()).toBeVisible();await page.getByRole('button',{name:'加入我的清單'}).click();await expect(page.getByRole('status')).toHaveText('已儲存於此瀏覽器。');
 await page.goto('/kindergarten/plan');const secret='parent-private-'+Date.now();await page.getByLabel('查詢回覆及私人筆記').fill(secret);await page.getByRole('button',{name:'儲存進度及筆記'}).click();await expect(page.getByRole('status')).toHaveText('已儲存於此瀏覽器。');await page.reload();await expect(page.getByLabel('查詢回覆及私人筆記')).toHaveValue(secret);expect(calls.some(x=>x.includes(secret))).toBe(false);
});
test('search card surfaces school-specific fee, admission and profile evidence',async({page})=>{
 await page.goto('/kindergarten?year=2027&grade=K1&session=WD&q='+encodeURIComponent('上水堂幼稚園'));const card=page.locator('.kg-search-card').filter({hasText:'上水堂幼稚園'});await expect(card).toBeVisible();
 const sourceFee=card.getByText(/校本費用：已有 \d+ 段證據候選/);if(await sourceFee.count()){await expect(card).toContainText('費用 已擷取相關資料，待核對學年或欄位');await expect(sourceFee).toBeVisible();}else{await expect(card).toContainText('收費文件版面待覆核');await expect(card).toContainText('暫未能計算 K1 全日班小計');}
 await expect(card).toContainText('已核對 2027/28 K1 校方申請步驟');await expect(card).toContainText('2026年9月8日開始收表');await expect(card).not.toContainText('先查目標學年校方公告');await expect(card.getByText('適應同支援：',{exact:true})).toBeVisible();
});
test('responsive kindergarten shell stays viewport-safe and touch-sized',async({page},testInfo)=>{
 await page.goto('/');const viewport=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));expect(viewport.scroll).toBeLessThanOrEqual(viewport.client);
 if(testInfo.project.name!=='mobile')return;
 const nav=page.getByRole('navigation',{name:'家長版主要導覽'});expect(await nav.locator('a').evaluateAll(links=>links.every(link=>link.getBoundingClientRect().height>=44))).toBe(true);expect((await nav.boundingBox())?.height).toBeLessThanOrEqual(48);
 await expect(page.getByRole('navigation',{name:'資料捷徑'}).locator('a:visible')).toHaveCount(5);expect((await page.getByRole('button',{name:'按需要更新'}).boundingBox())?.width).toBeGreaterThan(280);
});
