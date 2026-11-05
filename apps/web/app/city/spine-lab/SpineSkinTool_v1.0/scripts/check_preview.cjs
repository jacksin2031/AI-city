// Real installed Edge in a temporary Playwright profile; no cloud calls.
const {createRequire}=require('node:module');
const path=require('node:path'), fs=require('node:fs'), crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const {chromium}=createRequire(path.join(root,'runtime/js/package.json'))('playwright');
(async()=>{
 const output=path.join(root,'runtime/logs/M02',`browser-${new URL(process.argv[2]||'http://127.0.0.1:8766').port}`);fs.mkdirSync(output,{recursive:true});
 const channel=process.env.AI_CITY_SPINE_BROWSER||'msedge';if(!['msedge','chrome'].includes(channel))throw Error('UNSUPPORTED_BROWSER_CHANNEL');
 const browser=await chromium.launch({channel,headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1000,height:850},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.goto(process.argv[2]||'http://127.0.0.1:8766');
 await page.waitForFunction(()=>window.preview?.ready||window.preview?.error,{timeout:30000});
 const init=await page.evaluate(()=>({ready:preview.ready,error:preview.error}));if(!init.ready)throw Error(init.error);
 const evidence={browser:browser.version(),runtime:'spine-canvas@4.3.13',samples:[],skins:[],errors};
 for(const action of ['idle','trot'])for(const direction of ['front','back','left','right']){
  const animation=`movement/${action}-${direction}`;
  const duration=await page.evaluate(name=>preview.animations.find(a=>a.name===name).duration,animation);
  const samples=[];
  for(const fraction of [0,0.25,0.5]){
   const sample=await page.evaluate(({animation,time,skin})=>preview.sample(animation,time,skin),{animation,time:duration*fraction,skin:process.argv[3]||'spineboy'});
   if(sample.visible_pixels<100)throw Error('EMPTY_FRAME '+animation);
   const filename=`${action}-${direction}-${fraction}.png`;
   const png=await page.locator('canvas').screenshot({path:path.join(output,filename)});
   sample.screenshot=filename;sample.screenshot_sha256=crypto.createHash('sha256').update(png).digest('hex');samples.push(sample);evidence.samples.push(sample);
  }
  if(action==='trot'&&JSON.stringify(samples[0].bones)===JSON.stringify(samples[1].bones))throw Error('STALLED_ANIMATION '+animation);
 }
 for(const skin of await page.locator('#skin option').evaluateAll(options=>options.map(o=>o.value).filter(s=>s!=='default'))){
  const sample=await page.evaluate(skin=>preview.sample('movement/idle-front',0,skin),skin);
  if(sample.visible_pixels<100)throw Error('EMPTY_SKIN '+skin);evidence.skins.push({skin,visible_pixels:sample.visible_pixels});
 }
 await page.selectOption('#animation','movement/trot-front');
 await page.locator('#pause').click();if(!await page.evaluate(()=>preview.paused))throw Error('PAUSE_FAILED');
 await page.locator('#pause').click();if(await page.evaluate(()=>preview.paused))throw Error('RESUME_FAILED');
 await page.selectOption('#skin','spineboy');await page.selectOption('#animation','movement/idle-front');await page.waitForTimeout(100);
 await page.screenshot({path:path.join(output,'viewer.png')});
 const blocked=await page.request.get(new URL('/asset/../../runtime/config/local.toml',page.url()).href);if(blocked.status()!==404)throw Error('ROUTE_ESCAPE');
 if(errors.length)throw Error(JSON.stringify(errors));
 fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({status:'PASS',samples:evidence.samples.length,skins:evidence.skins.length,browser:evidence.browser,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
