import {test,expect} from '@playwright/test';
const ids=['school_2468a6d82a2fad7b858cd5b6','school_b579ecbc45cca6d4f62c20c9','school_7f49a973a6708cfc096def61'];
test('the exact three reported directory URLs provide useful annual comparisons and real Jev evidence',async({page,baseURL})=>{
 test.setTimeout(120000);
 const writes:string[]=[],external:string[]=[];const origin=new URL(baseURL!).origin;
 page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url());if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==origin)external.push(r.url());});
 await page.goto('/compare?ids='+ids.join(',')+'&year=2027');
 await expect(page.getByRole('heading',{name:'先看會影響選校的差異'})).toBeVisible();
 await expect(page.getByTestId('comparison-coverage')).toContainText('3 項取得');
 await expect(page.getByTestId('jev-comparison-table').locator('td[data-state="NO_PROFILE"]')).toHaveCount(0);
 await expect(page.locator('.decision-card')).toHaveCount(3);
 for(const id of ids){const card=page.locator('.decision-card[data-school="'+id+'"]');await expect(card.locator('.classifications')).toContainText('非牟利');await expect(card.locator('.classifications')).toContainText('參加幼稚園教育計劃');}
 await expect(page.locator('.decision-card').nth(0)).toContainText('外籍英語老師');
 await expect(page.locator('.decision-card').nth(1)).toContainText('外語老師');
 await expect(page.locator('.decision-card').nth(2)).toContainText('Plan');
 await expect(page.locator('.decision-card').nth(1).getByTestId('care-meaning')).toContainText('全日班學生合計為0');
 const facts=page.getByTestId('parent-facts');const counts=facts.locator('tr[data-field="全日班學生總數"] td');
 await expect(counts).toHaveText(['90','0','74']);
 await page.getByRole('button',{name:'教學模式與語文',exact:true}).click();
 await expect(facts.locator('tr[data-field="學習_教學模式及活動"] td')).toHaveCount(3);
 await expect(facts.locator('tr[data-field="學習_教學模式及活動"] td').first()).toContainText('小組討論');
 await page.getByRole('button',{name:'規模與活動環境',exact:true}).click();
 await expect(facts.locator('tr[data-field="註冊課室數目"] td')).toHaveText(['8','4','6']);
 await expect(facts.locator('tr[data-field="音樂室"] td')).toHaveText(['有','有','沒有']);
 await page.getByRole('button',{name:'學費、用品與報名',exact:true}).click();
 await expect(facts.locator('tr[data-field="收費證明書"] a')).toHaveCount(3);
 const official=page.getByTestId('official-comparison');await expect(official).toContainText('課程規劃');await expect(official).not.toContainText('此名錄項目未直接對應年度概覽');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'匯出比較分析 JSON'}).click();const file=await downloadPromise;const fs=await import('node:fs/promises');const report=JSON.parse(await fs.readFile((await file.path())!,'utf8'));expect(report.school_ids).toEqual(ids);expect(report.profile_links).toHaveLength(3);for(const row of report.profile_links)expect(row.resolution.links).toHaveLength(1);
 expect(writes).toEqual([]);expect(external).toEqual([]);
 await page.getByRole('button',{name:'全日照顧與接送',exact:true}).click();
 await page.screenshot({path:test.info().outputPath('reported-three-school-comparison.png'),fullPage:true});
 await page.reload();await expect(page.getByTestId('comparison-coverage')).toContainText('3 項取得');
 for(const id of ids){await page.goto('/schools/'+id+'?year=2027');await expect(page.getByRole('heading',{name:'已按來源證據接通年度概覽'})).toBeVisible();await expect(page.getByRole('heading',{name:'幼稚園營辦性質：非牟利'})).toBeVisible();await expect(page.getByRole('heading',{name:'幼稚園教育計劃：參加幼稚園教育計劃'})).toBeVisible();await expect(page.locator('summary').filter({hasText:'104 個欄位'})).toBeVisible();}
});
