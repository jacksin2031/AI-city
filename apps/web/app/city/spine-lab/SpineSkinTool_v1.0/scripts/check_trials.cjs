/* Real browser checks for local specification experiments; no image model calls. */
const {chromium}=require('../runtime/js/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),url=process.argv[2]||'http://127.0.0.1:8774';
const output=path.join(root,'runtime/logs/M04/browser');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1400,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const inputRoot=path.resolve(process.env.SPINE_SKIN_TRIAL_INPUTS||path.join(root,'runtime/work/M04/inputs-hair-v3'));
 const allowedRoot=path.resolve(root,'runtime/work/M04')+path.sep;
 if(!inputRoot.startsWith(allowedRoot))throw Error('UNSAFE_TRIAL_INPUTS');
 const input=path.join(inputRoot,'ai-city-template-body.png'),backup=fs.readFileSync(input);let mutated=false;
 try{
 await page.goto(url+'/trials');await page.waitForFunction(()=>window.trialEditor?.ready);
 const baseline=page.frameLocator('#baseline'),candidate=page.frameLocator('#candidate');
 await baseline.locator('#status').waitFor();await page.waitForFunction(()=>document.querySelector('#baseline').contentWindow.preview?.ready);
 const baselineHash=await baseline.locator('body').evaluate(()=>preview.manifest.source_sha256);
 const results=[];
 for(const scale of [1,2,4]){
  await page.locator('#resolution').selectOption(String(scale));await page.locator('#build').click();await page.waitForFunction(()=>!document.querySelector('#build').disabled);
  assert.match(await page.locator('#result').innerText(),/手動確認待ち/);
  await page.waitForFunction(()=>document.querySelector('#candidate').contentWindow.preview?.ready);
  const current=await candidate.locator('body').evaluate(()=>({source:preview.manifest.source_sha256,atlas:preview.manifest.atlas_sha256}));
  assert.equal(current.source,baselineHash);
  const frames=await candidate.locator('body').evaluate(()=>{const frames=[];for(const action of ['idle','trot'])for(const direction of ['front','back','left','right'])for(const time of [0,.25,.5,.75]){const sample=preview.sample(`movement/${action}-${direction}`,time);if(sample.visible_pixels<100||sample.bones.flat().some(n=>!Number.isFinite(n)))throw Error('INVALID_FRAME');frames.push(sample);}return frames;});
  await candidate.locator('canvas').screenshot({path:path.join(output,`scale-${scale}.png`)});results.push({scale,...current,frames});
 }
 assert.notEqual(results[0].atlas,results[1].atlas);assert.notEqual(results[1].atlas,results[2].atlas);
 for(let i=1;i<results.length;i++)for(let j=0;j<results[0].frames.length;j++)assert.deepEqual(results[i].frames[j].bones,results[0].frames[j].bones);
 // An imported high-resolution PNG is distinct from reference replay. Restore operator input in finally.
 const python=path.join(root,'runtime/python/.venv/Scripts/python.exe');
 const changed=spawnSync(python,['-B','-c','from PIL import Image; import sys; p=sys.argv[1]; im=Image.open(p); out=im.resize((im.width*2,im.height*2)); im.close(); out.save(p)',input]);
 assert.equal(changed.status,0,String(changed.stderr));mutated=true;
 await page.locator('#resolution').selectOption('1');await page.locator('#build').click();await page.waitForFunction(()=>!document.querySelector('#build').disabled);
 assert.match(await page.locator('#result').innerText(),/取り込み画像/);
 const before=await(await page.request.get(url+'/manifest.json')).json();
 const rejected=await page.evaluate(async()=>{const bad=structuredClone(trialEditor.config);bad.parts.BODY_FRONT.exclude=[[0,0,1,1]];const r=await fetch('/trial/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(bad)});return r.status;});assert.equal(rejected,422);
 const after=await(await page.request.get(url+'/manifest.json')).json();assert.equal(before.atlas_sha256,after.atlas_sha256);
 const forbidden=await page.request.post(url+'/trial/build',{data:{}});assert.equal(forbidden.status(),403);
 const download=page.waitForEvent('download');await page.locator('#request').click();const file=await download;await file.saveAs(path.join(output,'generation-request.json'));
 assert.equal(JSON.parse(fs.readFileSync(path.join(output,'generation-request.json'))).status,'REQUEST_ONLY_NO_MODEL_CALL');
 const first=await page.locator('#candidates option').first().getAttribute('value');await page.locator('#candidates').selectOption(first);await page.locator('#activate').click();await page.waitForFunction(()=>!document.querySelector('#build').disabled);
 await page.waitForFunction(()=>document.querySelector('#candidate').contentWindow.preview?.ready);assert.equal(await baseline.locator('body').evaluate(()=>preview.manifest.source_sha256),baselineHash);
 await page.screenshot({path:path.join(output,'workbench.png'),fullPage:true});assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify({status:'PASS',browser:browser.version(),results,imported_input:true,rejected,origin_forbidden:forbidden.status(),errors},null,2));
 console.log(JSON.stringify({status:'PASS',scales:[1,2,4],frames:results.reduce((n,r)=>n+r.frames.length,0),imported_input:true,failure_preserved:true,errors}));
 }finally{if(mutated)fs.writeFileSync(input,backup);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
