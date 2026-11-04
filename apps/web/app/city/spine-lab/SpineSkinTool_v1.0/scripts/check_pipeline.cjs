/* Genuine UI requests and Spine runtime, local replay only, NEVER enables models. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin='http://127.0.0.1:8783',source=process.argv[2]||'runtime/work/M05/corrected/c02',out=path.join(root,'runtime/logs/M07/browser');assert(source.startsWith('runtime/work/')&&!source.includes('..'));fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1450,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const api=(action,data,headers={})=>page.request.post(origin+'/flow/'+action,{data,headers:{Origin:origin,'Content-Type':'application/json',...headers}});
  const baseline=await(await page.request.get(origin+'/manifest.json')).text();const html=await page.goto(origin+'/characters');assert(html.headers()['content-type'].startsWith('text/html'));await page.waitForFunction(()=>window.characterPipeline?.ready);
  assert(!(await page.locator('#live').isChecked()));assert.equal(await page.locator('#photo option').count(),3);assert.equal(await page.locator('#photo option').first().textContent(),'character-reference1.png');
  const photo=path.join(root,'runtime/work/M04/character-reference1.png'),original=fs.readFileSync(photo);await page.setInputFiles('#photo-upload',photo);await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('写真を本機に保存'));assert(fs.readFileSync(photo).equals(original));assert.equal(await page.locator('#photo option').count(),3);
  await page.click('#plan');await page.waitForFunction(()=>{const s=document.querySelector('#report').textContent;return s&&JSON.parse(s).mode==='GENERATE';});
  const disabled=JSON.parse(await page.locator('#report').textContent());assert.equal(disabled.design_calls_reserved,0);await page.click('#resume');
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#report').textContent||'{}').status==='CONFIGURATION_BLOCKED');assert.equal(JSON.parse(await page.locator('#report').textContent()).design_calls_reserved,0);
  await page.click('#cancel');await page.click('#new');assert(!(await page.locator('#live').isChecked()));assert(!(await page.locator('#replay-fit').isChecked()));
  await page.selectOption('#mode','REPLAY');await page.selectOption('#source',source);await page.locator('#settings details').evaluate(e=>e.open=true);await page.fill('#cycles','0');await page.click('#start');
  await page.waitForFunction(()=>{const s=document.querySelector('#report').textContent;return s&&JSON.parse(s).mode==='REPLAY';});const id=await page.evaluate(()=>characterPipeline.id);
  assert.equal((await api('advance',{id})).status(),422,'DUPLICATE_NOT_REJECTED');
  await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('#report').textContent||'{}');return s.phase==='DONE'&&!s.worker_active;},null,{timeout:240000});
  const s=JSON.parse(await page.locator('#report').textContent());assert.equal(s.status,'REQUIRES_REVIEW');assert.equal(s.design_calls_reserved+s.image_calls_reserved+s.visual_calls_reserved,0);assert.equal(s.quality_approved,false);assert.equal(s.auto_fit,false);
  await page.waitForFunction(()=>document.querySelector('iframe')?.contentWindow.preview?.ready);const url=await page.locator('iframe').getAttribute('src');
  const frame=page.frames().find(f=>f.url().includes('/flow-view/'));for(const name of ['movement/idle-front','movement/trot-back','movement/trot-left','movement/trot-right']){const sample=await frame.evaluate(n=>preview.sample(n,.5,undefined,'emotes/wave'),name);assert(sample.visible_pixels>100);}
  const zip=await(await page.request.get(origin+url+'download')).body();assert(zip.length>1000);assert(zip.equals(fs.readFileSync(path.join(root,source,'export/runtime.zip'))));assert.equal(await(await page.request.get(origin+'/manifest.json')).text(),baseline);
  assert.equal((await api('report',{id},{Origin:'http://untrusted.invalid'})).status(),403);assert.equal((await page.request.get(origin+'/flow/config',{headers:{Host:'untrusted.invalid'}})).status(),403);assert.equal((await api('report',{id:'../../secrets'})).status(),422);
  for(const name of ['context.json','raw/BODY_FRONT.png','events/000001.json','design.json'])assert.equal((await page.request.get(origin+url+name)).status(),404);
  await page.screenshot({path:path.join(out,'pipeline.png'),fullPage:true});
  // A delayed creation response must not restart a task after the user selects New.
  await page.click('#new');const advances=[];page.on('request',r=>{if(r.url().endsWith('/flow/advance'))advances.push(r.url());});
  await page.route('**/flow/create',async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.continue();});
  const delayed=page.waitForResponse(r=>r.url().endsWith('/flow/create'));await page.click('#start');await page.click('#new');const abandoned=await(await delayed).json();await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>characterPipeline.id),null);assert(await page.locator('#start').isEnabled());assert.deepEqual(advances,[]);await api('cancel',{id:abandoned.id});await page.unroute('**/flow/create');assert.deepEqual(errors,[]);
  const evidence={status:'PASS',task_id:id,disabled_task:disabled.id,preview_url:origin+url,model_calls:0,browser_errors:errors,active_character_unchanged:true,late_creation_no_advance:true,abandoned_plan:abandoned.id};fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
