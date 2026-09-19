import {test,expect} from '@playwright/test';
test('real directory and annual source references are available without invented identity joins',async({page,request})=>{
  const manifest=await (await request.get('/test-data-report.json')).json();
  expect(manifest.synthetic_records).toBe(0);expect(manifest.admission_events).toBe(0);expect(manifest.baseline.included_records).toBeGreaterThan(100);
  for(const level of ['KG','PRIMARY','SECONDARY']){
    const response=await request.get('/api/v1/schools?level='+level+'&year=2027');expect(response.ok()).toBeTruthy();
    const body=await response.json();expect(body.data.length).toBeGreaterThan(0);expect(body.data.every((p:{is_test:boolean})=>!p.is_test)).toBeTruthy();
  }
  await page.goto('/schools?level=PRIMARY&year=2027');await expect(page.getByRole('checkbox').first()).toBeVisible();
  await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(1).check();
  await page.getByRole('button',{name:'比較已選 2/4 校'}).click();await expect(page.getByRole('table')).toBeVisible();
  await page.goto('/source-reference');await expect(page.getByRole('heading',{name:'年度概覽原文',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'查看原文欄位'}).first()).toBeVisible();
  await page.getByRole('button',{name:'查看原文欄位'}).first().click();await expect(page.getByText('配對狀態：獨立來源紀錄，未確認跨來源身份。內容保留原文；空白代表來源未提供。')).toBeVisible();
  await expect(page.locator('dt').first()).toBeVisible();
  for(const source of manifest.annual){
    const index=await (await request.get('/source-reference/'+source.id+'/index.json')).json();expect(index.records.length).toBe(source.rows);
    const record=await (await request.get('/source-reference/'+source.id+'/'+index.records[0].id+'.json')).json();
    expect(record.identity_link_status).toBe('UNLINKED_SOURCE_RECORD');expect(Object.keys(record.fields).length).toBe(source.columns);
  }
});
