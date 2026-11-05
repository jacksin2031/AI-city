/* Read-only real browser: scoped user opinions, named trials, deterministic pose. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin=process.argv[2],ids=process.argv.slice(3);assert.equal(new URL(origin).hostname,'127.0.0.1');assert.equal(ids.length,3);
 const folder=path.join(root,'runtime/logs/M07-RETEST011/coarse-regression');fs.mkdirSync(folder,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true}),result={errors:[],requests:[],cases:[],model_calls:0};
 try{const page=await browser.newPage({viewport:{width:1400,height:1100}});page.setDefaultTimeout(60000);page.on('pageerror',e=>result.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});page.on('request',r=>{if(r.method()==='POST')result.requests.push(new URL(r.url()).pathname);});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  for(const [i,id] of ids.entries()){
   await page.goto(origin+'/hair-trials?task='+id+'&related='+ids.filter(x=>x!==id).join(','));await page.waitForFunction(()=>window.hairTrials?.mediaReady||window.hairTrials?.error||window.hairTrials?.mediaError);assert(await page.evaluate(()=>hairTrials.mediaReady));assert.equal(await page.locator('#cases a').count(),3);
   const report=await page.evaluate(()=>hairTrials.result);assert.equal(report.quality_approved,false);assert(report.rows.every(a=>a.user_opinion));assert((await page.locator('#cases').textContent()).includes('写真'));
   if(i===0){assert((await page.locator('#history').textContent()).includes('前髪・小耳 返修2/3'));assert((await page.locator('#history').textContent()).includes('後髪 返修1/3'));}
   const iframe=page.locator('#front');await iframe.scrollIntoViewIfNeeded();const frame=await(await iframe.elementHandle()).contentFrame();assert(await frame.evaluate(()=>preview.ready));assert(await frame.evaluate(()=>preview.paused));
   const before=await frame.locator('canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(350);assert.equal(await frame.locator('canvas').evaluate(c=>c.toDataURL()),before,'SNAPSHOT_MOVED');
   await page.locator('#play').click();assert.equal(await page.evaluate(()=>hairTrials.playing),true);await page.locator('#play').click();assert.equal(await page.evaluate(()=>hairTrials.playing),false);
   await page.screenshot({path:path.join(folder,'case-'+(i+1)+'.png'),fullPage:true});result.cases.push({id,opinion:report.rows[0].user_opinion.scope,frames_static_until_play:true,named_navigation:true,quality_approved:false});
  }assert.deepEqual(result.requests,[]);assert.deepEqual(result.errors,[]);result.status='PASS';fs.writeFileSync(path.join(folder,'browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
