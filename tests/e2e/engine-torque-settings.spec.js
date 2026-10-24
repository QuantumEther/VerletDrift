import {test,expect} from '@playwright/test';
test('physical engine coefficients round-trip and invalid imports are atomic',async({page})=>{
 await page.goto('/?renderer=canvas&debugMode=quiet');
 await page.waitForFunction(()=>Boolean(window.state));
 const result=await page.evaluate(async()=>{
  state.debug.faults.isFrozen=true;
  const {exportSettings,importSettings}=await import('/js/ui/controls.js');
  const original=exportSettings();
  const changed=structuredClone(original);changed.params.enginePumpingPressurePa=40000;importSettings(changed);
  const roundTrip=exportSettings().params.enginePumpingPressurePa;
  const before=JSON.stringify(exportSettings());let rejected=0;
  for(const [key,value] of [['enginePumpingSpeedRpm',0],['engineLimiterBandRpm',0],['enginePumpingPressurePa',120000]]){
   const invalid=exportSettings();invalid.params[key]=value;invalid.params.carMassKg=1600;
   try{importSettings(invalid);}catch{rejected++;}
  }
  const atomic=before===JSON.stringify(exportSettings());
  importSettings(original);
  const old=structuredClone(original);for(const key of Object.keys(old.params))if(key.startsWith('engine')&&key!=='engineInertiaKgM2')delete old.params[key];
  importSettings(old);
  return {roundTrip,rejected,atomic,restored:state.params.enginePumpingPressurePa};
 });
 expect(result).toEqual({roundTrip:40000,rejected:3,atomic:true,restored:65000});
});
