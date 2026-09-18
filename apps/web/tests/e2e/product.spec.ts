import {test,expect} from '@playwright/test';
test('search, compare and deep-link refresh',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'開始選校'}).click();
  await expect(page.getByText('測試小學 1',{exact:true})).toBeVisible();
  await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(1).check();
  await page.getByRole('button',{name:'比較已選 2/4 校'}).click();await expect(page.getByRole('table')).toBeVisible();await expect(page.getByText('未提供',{exact:true}).first()).toBeVisible();
  await page.goto('/schools?level=PRIMARY&year=2027');await page.getByRole('link',{name:'測試小學 1',exact:true}).click();await page.reload();await expect(page.getByRole('heading',{name:'學校資料',exact:true})).toBeVisible();
});
test('private notes persist and are never transmitted',async({page})=>{
  const transmissions:string[]=[];page.on('request',request=>transmissions.push(request.url()+' '+(request.postData()??'')));
  await page.goto('/schools?level=PRIMARY&year=2027');await page.getByRole('button',{name:'加入私人清單'}).first().click();await expect(page.getByText('已加入私人清單，資料只存在此瀏覽器。')).toBeVisible();
  await page.getByRole('link',{name:'私人清單',exact:true}).click();await page.getByRole('textbox').fill('PRIVATE-NOTE-TEST-DO-NOT-TRANSMIT');await page.getByRole('button',{name:'儲存筆記與進度'}).click();await expect(page.getByText('已儲存於此瀏覽器。')).toBeVisible();
  await page.reload();await expect(page.getByRole('textbox')).toHaveValue('PRIVATE-NOTE-TEST-DO-NOT-TRANSMIT');expect(transmissions.join('\n')).not.toContain('PRIVATE-NOTE-TEST-DO-NOT-TRANSMIT');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'匯出備份'}).click();expect((await download).suggestedFilename()).toBe('hk-school-private-backup.json');
});
test('unknown official dates remain empty, personal dates stay private',async({page})=>{
  await page.goto('/calendar');await expect(page.getByText('當屆尚未有已核實的招生事件；這不代表所有學校尚未接受申請。')).toBeVisible();await expect(page.getByRole('button',{name:'匯出已核實事件 ICS'})).toBeDisabled();
  await page.getByLabel('事件名稱',{exact:true}).fill('家長私人記錄');await page.getByLabel('日期',{exact:true}).fill('2027-03-04');await page.getByRole('button',{name:'新增私人事件'}).click();await expect(page.getByText('2027-03-04 · 家長私人記錄')).toBeVisible();await page.reload();await expect(page.getByText('2027-03-04 · 家長私人記錄')).toBeVisible();
});
