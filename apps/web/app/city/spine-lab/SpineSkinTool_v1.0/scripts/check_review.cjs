/* Actual review workbench regression. Local rendering only; NEVER invokes vision. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin=process.argv[2]||'http://127.0.0.1:8783';assert.equal(new URL(origin).hostname,'127.0.0.1');
 const inputs=JSON.parse(fs.readFileSync(path.join(root,'runtime/work/M05/corrected-reviews.json'),'utf8'));
 const output=path.join(root,'runtime/logs/M05-review-ui');fs.mkdirSync(output,{recursive:true});
 const jobs=path.join(root,'runtime/work/M05/reviews'),reservations=()=>fs.readdirSync(jobs).filter(n=>/^review-call-.*\.reserved$/.test(n)).sort();
 const beforeCalls=reservations(),browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
 try{
  const page=await browser.newPage({viewport:{width:1450,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('response',r=>{if(r.status()>=400&&r.request().resourceType()!=='fetch')errors.push(`${r.status()} ${r.url()}`);});
  await page.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'?route.continue():route.abort();});
  await page.goto(origin+'/reviews');await page.waitForFunction(()=>window.reviewWorkbench?.ready);
  const post=(action,data,extra={})=>page.request.post(origin+'/review/'+action,{headers:{Origin:origin,'Content-Type':'application/json',...extra},data});
  const manifestBefore=await(await page.request.get(origin+'/manifest.json')).text();
  for(const [character,id] of Object.entries(inputs)){
   await page.selectOption('#reviews',id);await page.click('#load');await page.waitForFunction(id=>JSON.parse(document.querySelector('#report').textContent||'{}').review_id===id,id);
   const report=await page.locator('#report').textContent(),data=JSON.parse(report);assert.notEqual(data.status,'PASS');assert.equal(data.render.frame_count,246);
   await page.waitForFunction(()=>[...document.querySelectorAll('#images img')].every(im=>im.complete&&im.naturalWidth>0));
   assert.equal(await page.locator('#images img').count(),4);assert(await page.locator('#vision').isDisabled());
   await page.click('#request');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('送信は0回'));
   const blank=JSON.parse(await page.locator('#visual').inputValue());assert(blank.checks.every(c=>['UNKNOWN','NOT_APPLICABLE'].includes(c.result)));
   assert(blank.checks.every(c=>c.confidence===0));
   const invalid={...blank,evidence_hash:'0'.repeat(64)},before=JSON.stringify(data.visual_reviews);
   const reject=await post('import',{review_id:id,source:'EXTERNAL_MODEL',data:invalid});assert.equal(reject.status(),422);
   assert.equal(JSON.stringify((await(await post('report',{review_id:id})).json()).visual_reviews),before);
   for(const name of ['visual-events.jsonl','visual-result.json','../context.json','../../../../secrets/review.json'])assert.equal((await page.request.get(origin+'/review/artifact/'+id+'/'+name)).status(),404);
   assert.equal((await post('report',{review_id:id},{Origin:'http://untrusted.invalid'})).status(),403);
   assert.equal((await page.request.get(origin+'/review/config',{headers:{Host:'untrusted.invalid'}})).status(),403);
   results.push({character,review_id:id,status:data.status,frames:data.render.frame_count,images:4,unsupported_import:'REJECTED'});
  }
  // Legacy evidence contains fewer sheets; UI must not invent image URLs.
  const legacy=JSON.parse(fs.readFileSync(path.join(root,'runtime/work/M05/current-reviews.json'),'utf8')).c01;
  await page.selectOption('#reviews',legacy);await page.click('#load');await page.waitForFunction(id=>JSON.parse(document.querySelector('#report').textContent||'{}').review_id===id,legacy);
  await page.waitForFunction(()=>[...document.querySelectorAll('#images img')].every(im=>im.complete&&im.naturalWidth>0));
  assert.equal(await page.locator('#images img').count(),1);
  // Exercise create -> asynchronous capture -> UI polling, including duplicate rejection.
  await page.fill('#output','runtime/work/M05/corrected/c03');await page.click('#create');
  await page.waitForFunction(old=>window.reviewWorkbench.review_id!==old,legacy);
  let id=await page.evaluate(()=>reviewWorkbench.review_id);const initial=JSON.parse(await page.locator('#report').textContent());
  assert(['PASS','UNKNOWN'].includes(initial.hard.status));assert.equal(initial.render.status,'NOT_RUN');assert.notEqual(initial.status,'PASS');
  await page.click('#capture');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('収集中'));
  assert.equal((await post('capture',{review_id:id})).status(),422);
  await page.waitForFunction(()=>{const r=JSON.parse(document.querySelector('#report').textContent||'{}');return ['PASS','FAIL','ERROR'].includes(r.render?.status);},null,{timeout:300000});
  const finished=JSON.parse(await page.locator('#report').textContent());assert.equal(finished.render.status,'PASS');assert.equal(finished.render.frame_count,246);assert.equal(finished.status,'REQUIRES_REVIEW');
  await page.waitForFunction(()=>[...document.querySelectorAll('#images img')].length===4&&[...document.querySelectorAll('#images img')].every(im=>im.complete&&im.naturalWidth>0));
  const metrics=await(await page.request.get(origin+'/review/artifact/'+id+'/metrics.json')).json();assert.equal(metrics.length,82);assert(metrics.every(m=>Object.hasOwn(m,'leg_root_connection_ratio')));
  assert.equal(await(await page.request.get(origin+'/manifest.json')).text(),manifestBefore,'REVIEW_CHANGED_ACTIVE_CANDIDATE');
  assert.deepEqual(reservations(),beforeCalls,'UNEXPECTED_MODEL_RESERVATION');assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(output,'workbench.png'),fullPage:true});
  const evidence={status:'PASS',results,new_review_id:id,local_additional_frames:246,model_calls:0,reservations_unchanged:true,browser_errors:errors};
  fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
