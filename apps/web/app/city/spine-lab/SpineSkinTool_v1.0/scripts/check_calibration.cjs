/* Read-only calibration UI/API regression, never sends a model request. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin=process.argv[2]||'http://127.0.0.1:8783',id=process.argv[3];assert.equal(new URL(origin).hostname,'127.0.0.1');assert(/^bench-[a-f0-9]{32}$/.test(id));
 const base=path.join(root,'runtime/work/M05/benchmarks'),reservations=()=>fs.readdirSync(base).filter(n=>n.endsWith('.reserved')).sort();const before=reservations(),browser=await chromium.launch({channel:'msedge',headless:true});
 try{const page=await browser.newPage({viewport:{width:1450,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto(origin+'/calibration?benchmark='+id);await page.waitForFunction(()=>window.calibrationWorkbench?.ready);assert.equal(await page.locator('article').count(),72);
  for(const image of await page.locator('article img').all()){await image.scrollIntoViewIfNeeded();await image.evaluate(im=>im.complete&&im.naturalWidth>0?null:new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(Error('IMAGE_LOAD'));}));}
  await page.evaluate(()=>window.scrollTo(0,0));const report=JSON.parse(await page.locator('#report').textContent());assert.equal(report.status,'COMPLETE');assert.equal(report.calls.length,6);assert.equal(report.automatic_visual_pass_enabled,false);
  assert.equal(report.summary.holdout.vision.cases,32);assert.equal(report.summary.holdout.vision.false_negative,0);assert.equal(report.summary.holdout.vision.false_positive,0);
  for(const suffix of ['manifest.json','calls/0/visual-events.jsonl','../../../secrets/calibration.json'])assert.equal((await page.request.get(origin+'/review/calibration-artifact/'+id+'/'+suffix)).status(),404);
  assert.equal((await page.request.get(origin+'/review/calibration/'+id,{headers:{Host:'untrusted.invalid'}})).status(),403);
  assert.deepEqual(before,reservations());assert.deepEqual(errors,[]);
  const output=path.join(root,'runtime/logs/M05-05-browser');fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'page.png')});
  const result={status:'PASS',benchmark_id:id,cases:72,images_loaded:72,model_calls:0,reservations_unchanged:true,errors};fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
