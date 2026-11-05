/* Actual local Runtime and attempt UI; never sends a model request. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin=process.argv[2],ids=process.argv.slice(3);assert.equal(new URL(origin).hostname,'127.0.0.1');assert(ids.length);ids.forEach(id=>assert.match(id,/^flow-[a-f0-9]{32}$/));
 const output=path.join(root,'runtime/logs/M07-RETEST011/hair-regression');fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true}),evidence={model_calls:0,errors:[],cases:[]};
 try{const page=await browser.newPage({viewport:{width:1440,height:1050}});page.setDefaultTimeout(60000);page.on('pageerror',e=>evidence.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')evidence.errors.push(m.text());});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  for(const id of ids){await page.goto(`${origin}/hair-trials?task=${id}&related=${ids.filter(x=>x!==id).join(',')}`);await page.waitForFunction(()=>window.hairTrials?.ready||window.hairTrials?.error);assert(await page.evaluate(()=>hairTrials.ready),await page.locator('#status').textContent());
   const s=await page.evaluate(()=>hairTrials.result);assert.equal(s.quality_approved,false);assert.equal(await page.locator('#history>button').count(),s.rows.length);
   const rows=[];for(const [i,a] of s.rows.entries()){await page.locator(`#history button[data-key="${a.key}"]`).click();await page.waitForFunction(()=>!hairTrials.result.rows.find(a=>a.key===hairTrials.selected).preview_url||hairTrials.mediaReady||hairTrials.mediaError);if(a.preview_url)assert(await page.evaluate(()=>hairTrials.mediaReady));await page.waitForFunction(()=>[...document.querySelectorAll('#parts img')].every(im=>im.complete&&im.naturalWidth>0));for(const image of a.parts)if(image.url)assert(await page.locator(`#parts img[src="${image.url}"]`).evaluate(im=>im.complete&&im.naturalWidth>0));assert((a.reasons.length||a.checks?.length)>0);if(a.preview_url){
     const view=await browser.newPage();view.on('pageerror',e=>evidence.errors.push(String(e)));await view.goto(origin+a.preview_url);await view.waitForFunction(()=>window.preview?.ready||window.preview?.error);assert(await view.evaluate(()=>preview.ready));
     for(const direction of ['front','back','left','right'])for(const movement of ['idle','trot'])for(const emote of ['','emotes/wave']){
      const sample=await view.evaluate(({direction,movement,emote})=>preview.sample(`movement/${movement}-${direction}`,.5,undefined,emote),{direction,movement,emote});assert(sample.visible_pixels>100);const ears=sample.slots.filter(s=>s.name==='ear-l'||s.name==='ear-r');assert.equal(ears.length,2);assert(ears.every(e=>e.attachment===null),'ORIGINAL_EAR_REAPPEARED');}
     for(const direction of ['back','left','front','right']){const sample=await view.evaluate(d=>preview.transition('movement/trot-'+d,.17,'emotes/wave'),direction);assert(sample.slots.filter(s=>s.name==='ear-l'||s.name==='ear-r').every(e=>e.attachment===null));}
     for(const direction of ['front','back']){await view.evaluate(d=>preview.sample('movement/idle-'+d,0),direction);await view.screenshot({path:path.join(output,`${id}-${i}-${direction}.png`)});}await view.close();rows.push({cycle:a.cycle,verdict:a.verdict,frames:a.frame_count,all_directions_emotes_transitions_original_ears_hidden:true});
    }else rows.push({cycle:a.cycle,verdict:a.verdict,no_assembled_result:true});}
   await page.screenshot({path:path.join(output,id+'-page.png'),fullPage:true});evidence.cases.push({id,status:s.status,rows,all_attempts_shown:true});
  }assert.deepEqual(evidence.errors,[]);evidence.status='PASS';fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
