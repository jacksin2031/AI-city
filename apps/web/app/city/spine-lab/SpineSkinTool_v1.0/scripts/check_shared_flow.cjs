/* Actual UI/CLI replay equivalence, no live generation or outbound service calls. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
const url=process.argv[2]||'http://127.0.0.1:8783',casesPath=process.argv[3];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 assert(casesPath,'Provide a private validation-cases JSON; never commit original photos.');
 const cases=JSON.parse(fs.readFileSync(path.resolve(root,casesPath),'utf8'));
 const output=path.join(root,'runtime/logs/M04-shared-flow');fs.mkdirSync(output,{recursive:true});
 const jobs=path.join(root,'runtime/work/M04/generation/jobs');
 const reservations=()=>(fs.existsSync(jobs)?fs.readdirSync(jobs):[]).filter(n=>n.endsWith('.reserved')).sort();const before=reservations();
 const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[],results=[],failedRequests=[];let activePage;
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1080}});activePage=page;page.on('requestfailed',r=>failedRequests.push({url:r.url(),error:r.failure()}));
  page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(url+'/trials');await page.waitForFunction(()=>window.characterFlow?.ready&&window.trialEditor?.ready);
  assert(await page.locator('#flow-use').isChecked());
  const post=async(action,body)=>{
   const wait=page.waitForResponse(r=>r.url()===url+'/character/'+action&&r.request().method()==='POST');await body();return await wait;
  };
  for(const c of cases){
   const cli=JSON.parse(fs.readFileSync(path.join(path.dirname(path.resolve(root,casesPath)),c.character_id+'-cli-result.json'),'utf8'));
   await page.locator('#flow-saved').selectOption(c.design_id);
   let response=await post('load',()=>page.locator('#flow-load').click());assert.equal(response.status(),200);
   await page.waitForFunction(id=>window.characterFlow.design_id===id,c.design_id);
   const design=JSON.parse(await page.locator('#flow-design').inputValue());assert.equal(design.character_id,c.character_id);
   response=await post('requests',()=>page.locator('#flow-plan').click());const planned=await response.json();assert.equal(planned.plan.plan_id,cli.plan_id);
   assert.equal(Object.keys(planned.plan.parts).length,design.appearance.lower.kind==='skirt'?10:8);
   await page.locator('#part').selectOption('BODY_FRONT');await page.locator('#provider').selectOption('codex');
   const preflight=page.waitForResponse(r=>r.url()===url+'/generation/run'&&r.request().method()==='POST');await page.locator('#gen-plan').click();
   const generated=await(await preflight).json();assert.equal(generated.status,'PREFLIGHT_ONLY_NO_MODEL_CALL');assert.equal(generated.design_id,c.design_id);
   assert.equal(generated.prompt,planned.plan.parts.BODY_FRONT.prompt);assert.equal(generated.prompt_sha256,planned.plan.parts.BODY_FRONT.prompt_sha256);
   await page.locator('#part').selectOption('ARM_FRONT');
   const armResponse=page.waitForResponse(r=>r.url()===url+'/generation/run'&&r.request().method()==='POST');await page.locator('#gen-run').click();
   const arm=await(await armResponse).json();assert.equal(arm.ai_generated,false);assert.equal(arm.model_calls_reserved,0);assert.equal(arm.design_id,c.design_id);
   await page.locator('#flow-raw').fill(c.raw_directory);await page.locator('#flow-bindings').fill('{}');
   response=await post('assemble',()=>page.locator('#flow-build').click());assert.equal(response.status(),200);const built=await response.json();
   assert.deepEqual(built.files,cli.files);assert.equal(built.zip_sha256,cli.zip_sha256);
   const download=await page.request.get(url+'/download');assert.equal(download.status(),200);assert.equal(sha(await download.body()),cli.zip_sha256);
   const frame=await(await page.locator('#candidate').elementHandle()).contentFrame();await frame.waitForFunction(id=>window.preview?.ready&&window.preview.manifest.build.design_id===id,c.design_id);
   let samples=0;
   for(const action of ['idle','trot'])for(const d of ['front','back','left','right'])for(const t of [.1,.5]){
    const sample=await frame.evaluate(({action,d,t})=>preview.sample('movement/'+action+'-'+d,t,'ai-city-original-template','emotes/wave'),{action,d,t});
    for(const name of ['ear-l','ear-r'])assert(d==='back'?sample.slots.find(s=>s.name===name).attachment===null:!!sample.slots.find(s=>s.name===name).attachment);
    for(const name of ['arm-l','arm-r'])assert(d==='back'?sample.drawOrder.indexOf(name)<sample.drawOrder.indexOf('body'):sample.drawOrder.indexOf('body')<sample.drawOrder.indexOf(name));samples++;
   }
   await frame.evaluate(()=>preview.sample('movement/idle-front',.2,'ai-city-original-template'));
   await frame.locator('canvas').screenshot({path:path.join(output,c.character_id+'-front.png')});
   results.push({character:c.character_id,design_id:c.design_id,plan_id:cli.plan_id,ui_cli_all_files_equal:true,zip_equal:true,runtime_samples:samples,output:built.output,preview_url:built.preview_url,zip_sha256:built.zip_sha256});
  }
  for(const r of results){
   const pinned=await(await page.request.get(url+r.preview_url+'manifest.json')).json();assert.equal(pinned.build.design_id,r.design_id);
   const immutable=await page.request.get(url+r.preview_url+'download');assert.equal(sha(await immutable.body()),r.zip_sha256);
  }
  const parallel=await Promise.all(results.map(async r=>{const tab=await browser.newPage();await tab.goto(url+r.preview_url);await tab.waitForFunction(()=>window.preview?.ready||window.preview?.error);assert(await tab.evaluate(()=>preview.ready));await tab.close();return true;}));assert.equal(parallel.length,cases.length);
  const last=await page.evaluate(()=>window.characterFlow.lastBuild);
  await page.locator('#flow-raw').fill('runtime/work/nonexistent-material-folder');
  const failed=await post('assemble',()=>page.locator('#flow-build').click());assert.equal(failed.status(),422);
  const current=await(await page.request.get(url+'/manifest.json')).json();assert.deepEqual(current.build.files,last.files);
  const rejected=await page.request.post(url+'/character/assemble',{data:{design_id:cases[0].design_id,output:'runtime/secrets/escape'},headers:{Origin:url}});assert.equal(rejected.status(),422);
  const foreign=await page.request.post(url+'/character/load',{data:{design_id:cases[0].design_id},headers:{Origin:'https://invalid.example'}});assert.equal(foreign.status(),403);
  const foreignHost=await page.request.get(url+'/character/config',{headers:{Host:'invalid.example'}});assert.equal(foreignHost.status(),403);
  assert.deepEqual(reservations(),before);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify({status:'PASS',results,immutable_previews_preserved:true,parallel_previews:cases.length,failed_build_preserved:true,private_path_rejected:true,foreign_origin_rejected:true,foreign_host_rejected:true,model_calls:0,errors},null,2));
  console.log(JSON.stringify({status:'PASS',characters:results.length,ui_cli_files_and_zip_equal:true,runtime_samples:results.reduce((a,r)=>a+r.runtime_samples,0),failed_build_preserved:true,model_calls:0,errors}));
 }catch(error){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:String(error),failedRequests,frames:await Promise.all(activePage.frames().map(async f=>({url:f.url(),preview:await f.evaluate(()=>({ready:window.preview?.ready,error:window.preview?.error,design:window.preview?.manifest?.build?.design_id})).catch(()=>null)})))},null,2));throw error;}finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
