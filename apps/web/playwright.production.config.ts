import {defineConfig,devices} from '@playwright/test';
const baseURL=process.env.SCHOOL_PRODUCTION_BASE_URL??'http://127.0.0.1:8795';
if(!['http://127.0.0.1:8795','https://schools.finpulsx.win'].includes(baseURL))throw new Error('Unapproved acceptance origin');
export default defineConfig({testDir:'./tests/production',outputDir:'test-results-production',workers:1,timeout:90000,retries:0,use:{baseURL,screenshot:'on',trace:'retain-on-failure'},projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}]});
