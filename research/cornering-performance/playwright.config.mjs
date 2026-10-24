// Reuse repository test infrastructure with the cloud's installed Chromium.
import base from '../../playwright.config.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
export default {
 ...base,testDir:fileURLToPath(new URL('../../tests/e2e/',import.meta.url)),reporter:'list',
 outputDir:'/tmp/verlet-cornering-test-results',
 use:{...base.use,video:'off',trace:'off',screenshot:'off',launchOptions:{
  executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',
  args:['--no-sandbox',...(process.env.CORNERING_SOFTWARE_GPU==='1'?['--enable-unsafe-webgpu','--use-angle=swiftshader']:['--disable-gpu'])],
 }},webServer:{...base.webServer,cwd:root},
};
