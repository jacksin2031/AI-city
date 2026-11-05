/* Controlled private defect fixtures rendered by the actual Runtime; no cloud calls. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{start}=require('./capture_review.cjs');
const {chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));assert(path.resolve(config.output).startsWith(path.join(root,'runtime/work/M05/')));
 const browser=await chromium.launch({channel:'msedge',headless:true}),rows=[];let active;
 try{for(const c of config.cases){
  assert(path.resolve(c.bundle).startsWith(path.resolve(config.output)+path.sep));active=await start(path.join(root,'runtime/python/.venv/Scripts/python.exe'),c.bundle);
  const page=await browser.newPage({viewport:{width:1200,height:1200}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('requestfailed',r=>errors.push(String(r.failure()?.errorText)));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(active.url);await page.waitForFunction(()=>window.preview?.ready||window.preview?.error);assert(await page.evaluate(()=>preview.ready));
  await page.evaluate(()=>preview.setReviewScale(2));const frames=[];
  for(const direction of (c.runtime?[c.direction]:['front','back'])){
   const frame=await page.evaluate(direction=>preview.sample('movement/trot-'+direction,.25,'ai-city-original-template','emotes/wave'),direction);
   const image=await page.evaluate(()=>preview.reviewCapture());const name=c.id+'-'+direction+'.png';fs.writeFileSync(path.join(config.output,name),Buffer.from(image.split(',')[1],'base64'));
   frames.push({...frame,frame_id:c.id+'-'+direction,direction,screenshot:name});
  }
  assert.deepEqual(errors,[]);rows.push({id:c.id,frames,errors});await page.close();active.child.kill();active=null;
 }}finally{if(active)active.child.kill();await browser.close();}
 fs.writeFileSync(path.join(config.output,'frames.json'),JSON.stringify(rows));console.log(JSON.stringify({status:'PASS',cases:rows.length,frames:rows.reduce((n,r)=>n+r.frames.length,0)}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
