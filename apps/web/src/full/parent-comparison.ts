import type {Annual,School} from './catalog';
export const parentTopics = {
 care:{title:'全日照顧與接送',meaning:'登記班別、歷史學生人數及現在可報名額是三回事。先確認目標學年是否開班、接送、午膳及午睡安排。',fields:['授課時間','學生人數幼兒班_上午班','學生人數幼兒班_下午班','學生人數幼兒班_全日班','全日班學生總數','對學生支援']},
 curriculum:{title:'教學模式與語文',meaning:'比較學校描述的實際活動，而不是把「有英語」等同英文程度較好；課時、師資及參與方式仍需問學校。',fields:['課程規劃','學習_教學模式及活動','兒童學習經驗評估']},
 support:{title:'適應、支援與家校合作',meaning:'直接查看新生適應、幼小銜接、到校服務及家長參與。沒有家教會，不等於沒有家校活動。',fields:['對學生支援','對有特殊需要的學童的支援','對非華語學童的支援','家長教師會','其他家長活動_聯繫']},
 environment:{title:'規模與活動環境',meaning:'課室數與容額只反映來源所報規模，不代表課室面積、實際班額或教學品質；參觀時應看幼兒可使用的活動空間。',fields:['註冊課室數目','已使用課室的總容額','室內遊戲場地','戶外遊戲場地','音樂室','其他特別室','上午時段師生比例','下午時段師生比例']},
 fees:{title:'學費、用品與報名',meaning:'各項金額保留概覽版本，不相加成全年總成本；註冊費不是學費。「全年接受申請」也不是2027/28仍有學額的證據。',fields:['收費證明書','其他核准收費_報名費','註冊費_半日班','註冊費_全日班','夏季校服','冬季校服','課本','練習簿_作業','文具','書包','茶點','申請時間類別','申請表格類別']}
} as const;
export type ParentTopic=keyof typeof parentTopics;
export const fieldLabels:Record<string,string>={
 '授課時間':'名錄登記班別','學生人數幼兒班_上午班':'K1上午班學生（概覽統計）','學生人數幼兒班_下午班':'K1下午班學生（概覽統計）','學生人數幼兒班_全日班':'K1全日班學生（概覽統計）','全日班學生總數':'K1–K3全日班學生合計（歷史統計）','課程規劃':'課程設計','學習_教學模式及活動':'教學、語文及活動安排','兒童學習經驗評估':'如何評估幼兒學習','對學生支援':'新生適應及升小支援','其他家長活動_聯繫':'家長參與方式','已使用課室的總容額':'已使用課室總容額（不是空餘學額）','其他核准收費_報名費':'報名費原文','註冊費_半日班':'半日班註冊費原文','註冊費_全日班':'全日班註冊費原文','練習簿_作業':'練習簿／作業原文','收費證明書':'核准學費：教育局收費證明書'};
export function selectedProfile(s:School,cohort:string):Annual|null {
 const rows=s.annual.filter(a=>a.source_id==='edb-kg-profiles'&&(!cohort||JSON.stringify([a.source_id,a.edition])===cohort));
 return rows.length===1?rows[0]:null;
}
export function allDayTotal(a:Annual|null):number|null {
 if(!a)return null;
 const values=['幼兒班','低班','高班'].map(level=>a.fields['學生人數'+level+'_全日班']);
 return values.every(v=>typeof v==='string'&&/^\d+$/.test(v.trim()))?values.reduce((sum,v)=>sum+Number(v),0):null;
}
export function careMeaning(s:School,a:Annual|null):string {
 const n=allDayTotal(a);
 if(n===null)return '沒有足夠的同版全日班學生數據；請直接核實開班、時間及名額。';
 if(n===0&&s.sessions.includes('全日'))return '名錄有全日班登記，但這版概覽全日班學生合計為0。需先問清目標學年是否實際開辦，不能當作有位或免費。';
 if(n===0)return '這版概覽全日班學生合計為0，不能据此斷定目前沒有全日班；需向學校確認。';
 return '這版概覽記錄全日班學生合計'+n+'人；這是歷史學生數，不是空餘學額。重視全日照顧時，下一步要確認開班、名額及接送安排。';
}
export function fieldValue(s:School,a:Annual|null,field:string):string {
 if(field==='授課時間')return s.sessions.join('、')||'來源未提供';
 if(field==='全日班學生總數'){const n=allDayTotal(a);return n===null?'來源未提供':String(n);}
 return a?.fields[field]??'';
}
export function exactExcerpt(raw:string|undefined,topic:'curriculum'|'language'|'support'):string {
 if(!raw?.trim())return '';
 const clean=raw;const focus=topic==='language'?/(?:外籍|外語|英語|英文|母語|普通話)/:topic==='support'?/(?:新生|親子適應|小一|幼小銜接)/:/(?:Plan|Review|計劃\(Plan\)|主題|遊戲)/;
 const at=topic==='curriculum'&&/Plan|Review/.test(clean)?clean.search(/Plan|Review/):clean.search(focus);if(at<0)return topic==='language'?'':clean.slice(0,320);
 let start=Math.max(clean.lastIndexOf('。',at),clean.lastIndexOf('；',at))+1;
 if(at-start>160)start=Math.max(start,at-80);
 let end=clean.indexOf('。',at)+1;if(end<=at)end=clean.length;
 end=Math.min(end,start+420);return clean.slice(start,end);
}
