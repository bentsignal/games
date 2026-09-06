import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',timeout:60000,expect:{timeout:15000},fullyParallel:false,workers:1,use:{baseURL:process.env.PLAYWRIGHT_BASE_URL||'http://localhost:5173',viewport:{width:1440,height:1000},screenshot:'only-on-failure',trace:'retain-on-failure',launchOptions:{args:['--enable-unsafe-swiftshader']}},reporter:'list'});
