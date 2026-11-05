/* Browser preflight/gating checks only. Never enables live execution. */
const {chromium}=require('../runtime/js/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),url=process.argv[2]||'http://127.0.0.1:8780';
const output=path.join(root,'runtime/logs/M04-API/browser');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1400,height:1000}});
 const errors=[],outbound=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){outbound.push(route.request().url().split('?')[0]);return route.abort();}return route.continue();});
 const jobs=path.join(root,'runtime/work/M04/generation/jobs');const before=fs.existsSync(jobs)?fs.readdirSync(jobs):[];
 try{
  const status=await(await page.request.get(url+'/generation/status')).json();assert.equal(status.subscription_balance,'NOT_VERIFIED');
  await page.goto(url+'/trials');await page.waitForFunction(()=>window.trialEditor?.ready);if(await page.locator('#flow-use').count())await page.locator('#flow-use').uncheck();
  await page.locator('#part').selectOption('BODY_FRONT');
  await page.locator('#design').fill('Green jacket, rounded hem, preserve template pose.');
  const results=[];
  for(const provider of ['codex','grok']){
   await page.locator('#provider').selectOption(provider);if(!status.live_enabled)assert.equal(await page.locator('#gen-run').isDisabled(),true);
   const response=page.waitForResponse(r=>r.url()===url+'/generation/run'&&r.request().method()==='POST');await page.locator('#gen-plan').click();const data=await(await response).json();
   assert.equal(data.status,'PREFLIGHT_ONLY_NO_MODEL_CALL');assert.equal(data.provider,provider);assert.deepEqual(data.reference_roles,['original_character_photo','neutral_canvas_anchor_guide','fixed_head_and_ear_reuse_reference','harri_construction_and_style_reference','davide_spineboy_style_reference']);assert.equal(data.character_reference_required,true);assert.match(data.prompt,/Image 1 is the original character photo/);assert.match(data.prompt,/neutral canvas-and-anchor guide/);assert.match(data.prompt,/bowl-shaped lower edge/);
   results.push(data);await page.waitForFunction(()=>!document.querySelector('#gen-plan').disabled);
  }
  let rejected=null;
  if(!status.live_enabled){rejected=await page.evaluate(async()=>{const response=await fetch('/generation/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'grok',part:'BODY_FRONT',description:'test',execute:true})});return {status:response.status,body:await response.json()};});assert.equal(rejected.status,422);assert.equal(rejected.body.code,'LIVE_DISABLED');}
  const forbidden=await page.request.post(url+'/generation/run',{data:{}});assert.equal(forbidden.status(),403);
  assert.deepEqual(fs.existsSync(jobs)?fs.readdirSync(jobs):[],before);assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
  await page.locator('#gen-plan').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'generation-controls.png')});
  fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify({status:'PASS',browser:browser.version(),preflights:results,live_execution_probe:status.live_enabled?'NOT_RUN_LIVE_CONFIGURED':'REJECTED_WHILE_DISABLED',live_rejected:rejected,origin_rejected:403,errors,browser_outbound:outbound,live_job_count_unchanged:true},null,2));
  console.log(JSON.stringify({status:'PASS',providers:['codex','grok'],live_calls:0,live_execution_probe:status.live_enabled?'NOT_RUN_LIVE_CONFIGURED':'REJECTED_WHILE_DISABLED',origin_rejected:403,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
