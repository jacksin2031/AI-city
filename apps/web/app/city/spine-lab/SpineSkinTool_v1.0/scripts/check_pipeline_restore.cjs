/* Read-only persisted task/ZIP/runtime check. Run after restarting the workbench. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const input=JSON.parse(fs.readFileSync(path.resolve(root,process.argv[2]||'runtime/logs/M07/preview-cases.json'),'utf8')),origin='http://127.0.0.1:8783',browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:1050}}),errors=[],rows=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  for(const c of input){
   if(c.expected_status){
    await page.goto(origin+'/characters?task='+c.task_id);await page.waitForFunction(()=>window.characterPipeline?.ready);
    const report=JSON.parse(await page.locator('#report').textContent());assert.equal(report.status,c.expected_status);assert.equal(report.quality_approved,false);
    assert.equal(await page.locator('#live').isChecked(),report.limits.live_design||report.limits.live_generation||report.limits.live_review);
    assert.equal(await page.locator('#images').inputValue(),String(report.limits.max_image_calls));assert.equal(await page.locator('#cycles').inputValue(),String(report.limits.max_repair_cycles));
    if(c.expected_status==='OUTPUT_BLOCKED'){assert(await page.locator('#retry').isDisabled());assert.equal(report.best_output,null);rows.push({label:c.label,task_id:c.task_id,status:'PASS',blocked_without_false_preview:true});continue;}
    assert.equal(await page.locator('#previews iframe').first().getAttribute('src'),'/flow-view/'+c.task_id+'/'+(c.display_manifest_sha256||c.manifest_sha256)+'/','EXPECTED_CANDIDATE_NOT_FIRST');
    await page.screenshot({path:path.join(root,'runtime/logs/M07/browser',c.label+'-task-restored.png'),fullPage:true});
   }
   const url=origin+'/flow-view/'+c.task_id+'/'+c.manifest_sha256+'/';await page.goto(url);await page.waitForFunction(()=>window.preview?.ready||window.preview?.error);assert(await page.evaluate(()=>preview.ready));
   for(const name of ['movement/idle-front','movement/trot-back'])assert((await page.evaluate(n=>preview.sample(n,.5,undefined,'emotes/wave'),name)).visible_pixels>100);
   const response=await page.request.get(url+'download');assert(response.ok());const sha=crypto.createHash('sha256').update(await response.body()).digest('hex');assert.equal(sha,c.zip_sha256);
   await page.screenshot({path:path.join(root,'runtime/logs/M07/browser',c.label+'-restored.png'),fullPage:true});rows.push({label:c.label,task_id:c.task_id,preview_url:url,zip_sha256:sha,status:'PASS'});
  }
  const task=input[0];await page.goto(origin+'/characters?task='+task.task_id);await page.waitForFunction(()=>window.characterPipeline?.ready);assert(await page.locator('#settings').evaluate(e=>e.disabled));assert(await page.locator('#start').isDisabled());assert.equal(JSON.parse(await page.locator('#report').textContent()).quality_approved,false);
  assert.deepEqual(errors,[]);const evidence={status:'PASS',rows,browser_errors:errors,model_calls:0};fs.writeFileSync(path.join(root,'runtime/logs/M07/browser/restart.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
