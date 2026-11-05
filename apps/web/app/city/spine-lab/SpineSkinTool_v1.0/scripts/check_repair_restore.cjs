/* Read-only restart/UI persistence check. Never creates or advances a task. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin='http://127.0.0.1:8783',id='repair-096dce88300849ba86c84acdacba2e5e',browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1450,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto(origin+'/repairs?task='+id);await page.waitForFunction(()=>window.repairWorkbench?.ready);
  const report=JSON.parse(await page.locator('#report').textContent());
  assert.equal(report.status,'REQUIRES_REVIEW');assert.equal(report.quality_approved,false);
  for(const name of ['live-image','live-vision']){assert(await page.locator('#'+name).isChecked());assert(await page.locator('#'+name).isDisabled());}
  for(const name of ['cycles','images','perpart','visions']){assert.equal(await page.locator('#'+name).inputValue(),'1');assert(await page.locator('#'+name).isDisabled());}
  assert(await page.locator('#create').isDisabled());
  await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].length===2&&[...document.querySelectorAll('iframe')].every(f=>f.contentWindow.preview?.ready));
  const urls=await page.locator('iframe').evaluateAll(frames=>frames.map(f=>f.src));assert.notEqual(urls[0],urls[1]);
  const downloads=[];for(const url of urls){const response=await page.request.get(url+'download');assert(response.ok());const bytes=await response.body();assert(bytes.length>1000);downloads.push({url,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
  await page.screenshot({path:path.join(root,'runtime/logs/M06/browser/content-after-restart.png'),fullPage:true});
  await page.click('#new');for(const name of ['live-image','live-vision']){assert(!(await page.locator('#'+name).isChecked()));assert(await page.locator('#'+name).isEnabled());}assert(await page.locator('#create').isEnabled());
  const previous=JSON.parse(fs.readFileSync(path.join(root,'runtime/logs/M06/browser/evidence.json'),'utf8'));
  await page.goto(previous.preview_urls[0]);await page.waitForFunction(()=>window.preview?.ready);
  assert.deepEqual(errors,[]);
  const evidence={status:'PASS',task_id:id,task_status:report.status,quality_approved:false,persisted_flags:true,reset_flags:false,downloads,structural_preview_restored:true,browser_errors:errors,model_calls:0};
  fs.writeFileSync(path.join(root,'runtime/logs/M06/browser/restart.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
