import {test,expect} from '@playwright/test';
test('three-level reviewed school-to-comparison-to-date journey',async({page,request})=>{
 const report=await (await request.get('/pilot-report.json')).json();expect(report.school_count).toBe(30);expect(report.event_count).toBe(15);
 for(const level of ['KG','PRIMARY','SECONDARY']){
  const response=await request.get(`/api/v1/schools?level=${level}&year=2027&has_annual=1&limit=40`);expect(response.status()).toBe(200);const schools=(await response.json()).data;expect(schools).toHaveLength(10);expect(schools.every((s:{is_test:boolean})=>!s.is_test)).toBeTruthy();
  const annual=await (await request.get(`/api/v1/annual-profiles?school=${schools[0].school_id}&level=${level}`)).json();expect(annual.data).toHaveLength(1);expect(annual.data[0].profile.facts.length).toBeGreaterThan(80);
  await page.goto(`/schools?level=${level}&year=2027&has_annual=1`);
  await expect(page.getByRole('heading',{name:'尋找學校',exact:true})).toBeVisible();const checks=page.getByRole('checkbox',{name:'選入比較',exact:true});await expect(checks).toHaveCount(10);await checks.nth(0).check();await checks.nth(1).check();await page.getByRole('button',{name:'比較已選 2/4 校'}).click();
  await expect(page.getByRole('heading',{name:'年度重點比較'})).toBeVisible();await expect(page.locator('table').nth(1)).toContainText('概覽');await expect(page.locator('table').nth(1)).toContainText(level==='KG'?'幼稚園教育計劃':level==='PRIMARY'?'教學語言':'語文政策');
  await page.goto(`/schools/${schools[0].school_id}?level=${level}&year=2027`);await expect(page.getByRole('heading',{name:'年度概覽與來源證據'})).toBeVisible();await expect(page.getByRole('heading',{name:'2027/2028 下一個重要日期'})).toBeVisible();await expect(page.getByRole('button',{name:'匯出相關核實事件 ICS'})).toBeVisible();
  await page.getByRole('button',{name:'加入私人清單',exact:true}).click();await page.getByRole('link',{name:'查看相關招生日曆'}).click();await expect(page.getByRole('heading',{name:'招生日曆',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'匯出已核實事件 ICS'})).toBeEnabled();
 }
 const empty=await (await request.get('/api/v1/events?level=PRIMARY&year=2028')).json();expect(empty.data).toEqual([]);
 await page.goto('/shortlist');const secret='private-pilot-note-'+Date.now();const requests:string[]=[];page.on('request',r=>requests.push(r.url()+(r.postData()??'')));await page.locator('textarea').first().fill(secret);await page.getByRole('button',{name:'儲存筆記與進度'}).first().click();await page.reload();await expect(page.locator('textarea').first()).toHaveValue(secret);expect(requests.some(r=>r.includes(secret))).toBe(false);
});
test('school-specific events, raw evidence, interval and invalid API checks',async({request,page})=>{
 const events=await (await request.get('/api/v1/events?level=KG&year=2027&school=sch_975ae2bbce2064e2')).json();expect(events.data).toHaveLength(6);expect(events.data.filter((e:{school_id:string|null})=>e.school_id)).toHaveLength(5);
 for(const e of events.data){expect(e.evidence_sha256).toMatch(/^[a-f0-9]{64}$/);expect(e.applicability).toBeTruthy();}
 const unrelated=await (await request.get('/api/v1/events?level=KG&year=2027&school=sch_cd9fb2f0ba1093a9')).json();expect(unrelated.data).toHaveLength(1);
 const ics=await (await request.get('/api/v1/events.ics?level=KG&year=2027&school=sch_975ae2bbce2064e2')).text();expect(ics).toContain('DTEND;VALUE=DATE:20261013');
 await page.goto('/schools/sch_975ae2bbce2064e2?level=KG&year=2027');await expect(page.getByRole('heading',{name:'粉嶺神召會幼稚園：網上報名',exact:true})).toBeVisible();await page.getByText('查看全部原文欄位及配對證據',{exact:true}).click();await expect(page.getByText(/assistant-source-review\/2026-09-19/)).toBeVisible();
 const wrong=await request.get('/api/v1/annual-compare?level=KG&schools=sch_975ae2bbce2064e2,sch_975ae2bbce2064e2');expect(wrong.status()).toBe(400);
 const missing=await request.get('/api/pilot-nonexistent',{headers:{Accept:'text/html'}});expect(missing.status()).toBe(404);expect(missing.headers()['content-type']).toContain('application/json');
});
