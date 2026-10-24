import {test,expect} from '@playwright/test';
test('historical engine toggle and browser shortcuts retain their semantics',async({page})=>{
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>1;window.__keyResults=[];window.addEventListener('keydown',e=>{if(e.code==='KeyR')__keyResults.push(e.defaultPrevented);});});
 await page.goto('/?renderer=canvas&debugMode=quiet');await page.waitForFunction(()=>Boolean(window.state),{},{polling:50});
 const initial=await page.evaluate(()=>state.engine.isRunning);
 await page.locator('#engineToggle').click();expect(await page.evaluate(()=>state.engine.isRunning)).toBe(!initial);
 await page.locator('#engineToggle').click();expect(await page.evaluate(()=>state.engine.isRunning)).toBe(initial);
 for(const chord of ['Control+r','Control+Shift+r','Meta+r']){
  await page.keyboard.press(chord);expect(await page.evaluate(()=>__keyResults.at(-1))).toBe(false);
 }
 // R remains unbound in this historical model.
 await page.keyboard.press('KeyR');expect(await page.evaluate(()=>state.engine.isRunning)).toBe(initial);
});
test('optional recorder exports bounded timing data and canvas metadata',async({page})=>{
 await page.goto('/?renderer=canvas&debugMode=quiet&gpuProfile=1');
 await page.getByRole('button',{name:'Record 30s performance'}).click();
 await page.waitForTimeout(500);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Close',exact:true}).click();
 const d=await download;const stream=await d.createReadStream();let text='';for await(const chunk of stream)text+=chunk;
 const report=JSON.parse(text);expect(report.tickMs.length).toBeGreaterThan(0);expect(report.tickMs.length).toBeLessThanOrEqual(15000);
 expect(report.canvas.width).toBeGreaterThan(0);expect(report.summary.physicsTickMs.mean).toBeGreaterThan(0);expect(report.url).toBeUndefined();
});
