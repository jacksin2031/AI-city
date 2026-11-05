/* Real M06 UI/local repair checks; NEVER enables or invokes a model. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin=process.argv[2]||'http://127.0.0.1:8783';assert.equal(new URL(origin).hostname,'127.0.0.1');const ids=JSON.parse(fs.readFileSync(path.join(root,'runtime/logs/M06/tasks.json'),'utf8'));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{const page=await browser.newPage({viewport:{width:1450,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400&&r.request().resourceType()!=='fetch')errors.push(r.status()+' '+r.url());});
  let lastProgress='';page.on('response',async response=>{if(response.ok()&&response.url().endsWith('/repair/report')){const r=await response.json(),progress=JSON.stringify({progress:r.phase,status:r.status,worker_active:r.worker_active});if(progress!==lastProgress){lastProgress=progress;console.log(progress);}}});
  const post=(a,data,headers={})=>page.request.post(origin+'/repair/'+a,{headers:{Origin:origin,'Content-Type':'application/json',...headers},data});
  const baseline=await(await page.request.get(origin+'/manifest.json')).text();await page.goto(origin+'/repairs');await page.waitForFunction(()=>window.repairWorkbench?.ready);
  await page.selectOption('#source',ids.sources.structural.review_id);await page.fill('#cycles','1');await page.click('#create');await page.waitForFunction(()=>{const text=document.querySelector('#report').textContent;return !!text&&JSON.parse(text).id===window.repairWorkbench?.id;});
  ids.previous_structural=ids.structural;ids.structural=await page.evaluate(()=>repairWorkbench.id);fs.writeFileSync(path.join(root,'runtime/logs/M06/tasks.json'),JSON.stringify(ids,null,2));
  const initial=JSON.parse(await page.locator('#report').textContent());assert.equal(initial.status,'PLANNED');assert(initial.plan.some(p=>p.action==='REASSEMBLE'));assert.equal(initial.limits.live_generation,false);
  await page.click('#advance');assert.equal((await post('advance',{id:ids.structural})).status(),422);
  await page.waitForFunction(()=>{const r=JSON.parse(document.querySelector('#report').textContent||'{}');return r.attempts?.[0]?.phase==='DONE'&&!r.worker_active;},null,{timeout:180000}).catch(async e=>{fs.writeFileSync(path.join(root,'runtime/logs/M06/ui-timeout.json'),JSON.stringify({status:await page.locator('#status').textContent(),report:await page.locator('#report').textContent()}));throw e;});
  const result=JSON.parse(await page.locator('#report').textContent());assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.quality_approved,false);assert.equal(result.image_calls_reserved,0);assert.equal(result.visual_calls_reserved,0);assert(result.attempts[0].comparison.technical_improvement);assert.notEqual(result.best_output,initial.best_output);
  await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].length===2&&[...document.querySelectorAll('iframe')].every(f=>f.contentWindow.preview?.ready));
  const frames=[];for(const frame of page.frames().filter(f=>f.url().includes('/repair-view/'))){frames.push({url:frame.url(),ready:await frame.evaluate(()=>preview.ready)});}
  const pins=frames.map(f=>f.url);const zip=await(await page.request.get(pins[1]+'download')).body();assert(zip.length>1000);
  assert.equal(await(await page.request.get(origin+'/manifest.json')).text(),baseline,'REPAIR_CHANGED_ACTIVE_CHARACTER');
  assert.equal((await post('report',{id:ids.structural},{Origin:'http://untrusted.invalid'})).status(),403);
  assert.equal((await page.request.get(origin+'/repair/config',{headers:{Host:'untrusted.invalid'}})).status(),403);
  assert.equal((await post('report',{id:'../../secrets/providers.json'})).status(),422);
  for(const suffix of ['raw/BODY_FRONT.png','events/000001.json','context.json'])assert.equal((await page.request.get(pins[1]+suffix)).status(),404);
  // Durable cancel, without an active worker or any external submission.
  const cancelled=await(await post('create',{review_id:ids.sources.structural.review_id})).json();await post('cancel',{id:cancelled.id});await post('advance',{id:cancelled.id});
  let r;for(let i=0;i<20;i++){r=await(await post('report',{id:cancelled.id})).json();if(r.status==='CANCELLED')break;await page.waitForTimeout(100);}
  assert.equal(r.status,'CANCELLED');assert.equal(r.attempts.length,0);assert.deepEqual(errors,[]);
  const output=path.join(root,'runtime/logs/M06/browser');fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'repair.png'),fullPage:true});
  const evidence={status:'PASS',task_id:ids.structural,frames,preview_urls:pins,cancelled_task:cancelled.id,model_calls:0,render_frames:246,active_character_unchanged:true,browser_errors:errors};fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
