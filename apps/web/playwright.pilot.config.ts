import {defineConfig,devices} from '@playwright/test';
const origin=process.env.SCHOOL_PILOT_BASE_URL??'http://127.0.0.1:8787';
if(!['http://127.0.0.1:8787','https://schools-test.finpulsx.win'].includes(origin))throw new Error('Only local or authorised staging origin allowed');
export default defineConfig({testDir:'./tests/pilot',outputDir:'test-results-pilot',fullyParallel:false,workers:1,retries:0,use:{baseURL:origin,trace:'retain-on-failure',screenshot:'on'},projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 5']}}]});
