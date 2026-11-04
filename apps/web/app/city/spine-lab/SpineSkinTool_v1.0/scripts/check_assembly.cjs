// M03: real runtime verification and immutable-bundle reload.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
const {chromium}=createRequire(path.join(root,'runtime/js/package.json'))('playwright');
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
(async()=>{
 const output=path.join(root,'runtime/logs/M03',`browser-${new URL(process.argv[2]||'http://127.0.0.1:8766').port}`);fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1050,height:1000},deviceScaleFactor:1});const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.goto(process.argv[2]||'http://127.0.0.1:8766');await page.waitForFunction(()=>window.preview?.ready||window.preview?.error);
 if(!await page.evaluate(()=>preview.ready))throw Error(await page.evaluate(()=>preview.error));
 const manifest=await page.evaluate(()=>preview.manifest);if(!manifest.build?.runtime_guard_required)throw Error('EXPECTED_ASSEMBLED_BUNDLE');
 const evidence={runtime:'spine-canvas@4.3.13',browser:browser.version(),manifest,samples:[],transitions:[],errors};
 const policy=await page.evaluate(async()=>await(await fetch('/orientation-policy.json')).json());
 function check(sample,back){
  if(sample.visible_pixels<100||sample.bones.some(row=>row.some(v=>!Number.isFinite(v))))throw Error('INVALID_FRAME');
  if(back){
   const order=sample.drawOrder;if(!(order.indexOf('body')<order.indexOf('head-base')&&order.indexOf('head-base')<order.indexOf('back-hair')))throw Error('BACK_ORDER');
   for(const slot of sample.slots)if(policy.face_slots.includes(slot.name)&&slot.attachment!==null)throw Error('BACK_FACE_VISIBLE:'+slot.name);
   for(const slot of sample.slots)if((policy.back_hide_slots||[]).includes(slot.name)&&slot.attachment!==null)throw Error('BACK_FRONT_LAYER_VISIBLE:'+slot.name);
  }
 }
 async function capture(sample,label){
  const filename=label+'.png';const png=await page.locator('canvas').screenshot({path:path.join(output,filename)});sample.screenshot=filename;sample.screenshot_sha256=sha(png);return sample;
 }
 for(const action of ['idle','trot'])for(const direction of ['front','back','left','right']){
  const animation=`movement/${action}-${direction}`,duration=await page.evaluate(name=>preview.animations.find(a=>a.name===name).duration,animation);
  const times=[...new Set([0,duration*.25,duration*.5,duration*.75,duration*.99,...(action==='trot'&&direction==='back'?[.5-1/120,.5,.5+1/120]:[])])].sort((a,b)=>a-b);
  const samples=[];
  for(const time of times){const sample=await page.evaluate(({animation,time})=>preview.sample(animation,time,'ai-city-original-template'),{animation,time});check(sample,direction==='back');await capture(sample,`${action}-${direction}-${time.toFixed(4)}`);samples.push(sample);evidence.samples.push(sample);}
  if(action==='trot'&&JSON.stringify(samples[0].bones)===JSON.stringify(samples[1].bones))throw Error('STALLED');
 }
 for(const emote of ['emotes/just-right','emotes/wave']){
  const front=await page.evaluate(emote=>preview.sample('movement/idle-front',.2,'ai-city-original-template',emote),emote);
  if(!front.slots.some(s=>s.name==='eye-l'&&s.attachment))throw Error('FRONT_FACE_MISSING');
  const backImmediate=await page.evaluate(emote=>preview.transition('movement/idle-back',0,emote),emote);check(backImmediate,true);
  const backMix=await page.evaluate(emote=>preview.transition('movement/idle-back',.05,emote),emote);check(backMix,true);
  const back=await page.evaluate(emote=>preview.transition('movement/idle-back',.2,emote),emote);check(back,true);await capture(back,emote.split('/')[1]+'-back');
  const restored=await page.evaluate(emote=>preview.transition('movement/idle-front',.3,emote),emote);
  if(!restored.slots.some(s=>s.name==='eye-l'&&s.attachment))throw Error('FACE_NOT_RESTORED');evidence.transitions.push({emote,front,backImmediate,backMix,back,restored});
 }
 const bundle=await page.request.get(new URL('/download',page.url()).href);if(bundle.status()!==200)throw Error('DOWNLOAD_FAILED');
 fs.writeFileSync(path.join(output,'download.zip'),await bundle.body());
 if(manifest.workbench){
  await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.locator('#rebuild').click()]);await page.waitForFunction(()=>window.preview?.ready);
  const second=await page.evaluate(()=>preview.manifest.build);if(JSON.stringify(second.files)!==JSON.stringify(manifest.build.files))throw Error('NONDETERMINISTIC_REBUILD');
 }
 await page.selectOption('#animation','movement/idle-front');await page.selectOption('#skin','ai-city-original-template');await page.waitForTimeout(100);await page.screenshot({path:path.join(output,'workbench.png')});
 if(errors.length)throw Error(JSON.stringify(errors));
 fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:'PASS',samples:evidence.samples.length,transitions:evidence.transitions.length,download:true,rebuild:manifest.workbench,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
