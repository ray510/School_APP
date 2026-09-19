import {defineConfig,devices} from '@playwright/test';
/** Read-only browser acceptance against the deployed test site. Only the authorised test hostname is accepted. */
const origin=new URL(process.env.SCHOOL_LIVE_BASE_URL??'invalid://');
if(origin.protocol!=='https:'||origin.hostname!=='schools-test.finpulsx.win'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw new Error('SCHOOL_LIVE_BASE_URL must be exactly https://schools-test.finpulsx.win/');
export default defineConfig({testDir:'./tests/staging',outputDir:'test-results-live',fullyParallel:false,workers:1,retries:0,use:{baseURL:origin.origin,trace:'retain-on-failure',screenshot:'on'},projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 5']}}]});
