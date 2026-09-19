import {describe,it,expect} from 'vitest';
import {parseAnnual} from '../../tools/cli/src/annual';
import {factPeriod} from '@hk-school/contracts/annual';
function csv(headers:string[],values:string[],delimiter=','){return headers.join(delimiter)+'\n'+values.map(value=>'"'+value.replace(/"/g,'""')+'"').join(delimiter);}
const extra=Array.from({length:20},(_,i)=>'測試欄位'+i);
describe('Annual source contracts',()=>{
  it('parses the observed kindergarten caret delimiter and leading-zero campus',()=>{
    const headers=['學校編號','校址編號','學校名稱','地址','收費證明書',...extra];
    const result=parseAnnual(csv(headers,['000001','0001','測試幼稚園','測試地址','https://example.invalid/fee',...extra.map(()=> '')],'^'),'edb-kg-profiles');
    expect(result.level).toBe('KG');expect(result.records[0].source_record_key).toBe('000001::0001');
  });
  it('rejects comma parsing presented as a kindergarten contract',()=>{expect(()=>parseAnnual('學校編號,學校名稱\n1,測試','edb-kg-profiles')).toThrow();});
  it('does not invent CHSC numeric identifiers',()=>{
    const headers=['區域','學校名稱','學校地址','小一學校網','教學語言',...extra];
    const result=parseAnnual(csv(headers,['測試區','測試小學','測試地址','00','中文',...extra.map(()=> '')]),'chsc-primary-profiles');
    expect(result.records[0].source_record_key).toMatch(/^row:[a-f0-9]{64}$/);
  });
  it('preserves quoted multi-line annual statements',()=>{
    const headers=['區域','學校名稱','學校地址','中一入學','全校語文政策',...extra];
    const result=parseAnnual(csv(headers,['測試區','測試中學','測試地址','第一行\n第二行','只作測試',...extra.map(()=> '')]),'chsc-secondary-profiles');
    expect(result.records[0].fields['中一入學']).toBe('第一行\n第二行');
  });
  it('does not infer a reference period from relative-year labels',()=>{expect(factPeriod('上學年教師總人數')).toBeNull();expect(factPeriod('2025_2026學年學費S1')).toBe('2025/2026');});
  it('rejects duplicate annual rows instead of quietly dropping them',()=>{
    const headers=['區域','學校名稱','學校地址','小一學校網','教學語言',...extra];const text=csv(headers,['測試区','測試小學','地址','00','中文',...extra.map(()=> '')]);
    expect(()=>parseAnnual(text+'\n'+text.split('\n')[1],'chsc-primary-profiles')).toThrow('Duplicate');
  });
});
