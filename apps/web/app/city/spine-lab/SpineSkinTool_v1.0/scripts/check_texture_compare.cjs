/* Real local browser, read-only rejected-asset comparison; no model calls. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin=process.argv[2],session=process.argv[3];assert.equal(new URL(origin).hostname,'127.0.0.1');assert.match(session,/^texture-[a-f0-9]{32}$/);
 const out=path.join(root,'runtime/logs/M07-TEXTURE-COMPARE');fs.mkdirSync(out,{recursive:true});
 const folder=path.join(root,'runtime/work/M07/texture-edits',session),events=()=>fs.readdirSync(path.join(folder,'events')).sort().map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,'events',name))).digest('hex')]);
 const frozen=events(),browser=await chromium.launch({channel:'msedge',headless:true});const evidence={model_calls:0,browser_errors:[],variants:[],poses:[],private_paths:[]};
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(90000);
  page.on('pageerror',e=>evidence.browser_errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')evidence.browser_errors.push(m.text());});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(`${origin}/texture-compare?session=${session}`);await page.waitForFunction(()=>window.textureComparison?.ready||window.textureComparison?.error,null,{timeout:90000});
  assert(await page.evaluate(()=>textureComparison.ready),await page.locator('#status').textContent());assert.equal(await page.locator('.tile img').count(),8);
  assert(await page.locator('.tile img').evaluateAll(images=>images.every(im=>im.complete&&im.naturalWidth>0)));
  await page.screenshot({path:path.join(out,'comparison-original.png'),fullPage:true});
  for(const part of ['HAIR_FRONT','HAIR_BACK'])for(const number of [1,2,3]){
   await page.selectOption(part==='HAIR_FRONT'?'#front':'#back',String(number));
   await page.waitForFunction(()=>textureComparison.state.ready,null,{timeout:90000});
   await page.selectOption('#direction',part==='HAIR_FRONT'?'front':'back');
   const pair=await page.evaluate(()=>textureComparison.state.frames.map(p=>p.sample('movement/idle-'+document.querySelector('#direction').value,0)));
   assert.deepEqual(pair[0].bones,pair[1].bones);assert(pair.every(p=>p.visible_pixels>100));
   assert.deepEqual(await page.evaluate(()=>textureComparison.state.frames.map(p=>p.getCamera())),Array(2).fill(await page.evaluate(()=>textureComparison.state.frames[0].getCamera())));
   await page.locator('#part').selectOption(part);await page.locator('#mode').selectOption('difference');
   const pixels=await page.locator('#rawCompare').evaluate(c=>{const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return a.some((n,i)=>i%4!==3&&n>0);});assert(pixels);
   await page.locator('#mode').selectOption('overlay');await page.screenshot({path:path.join(out,`${part}-${number}.png`),fullPage:true});
   const url=`${origin}/texture-compare/${session}/image/${part}/${number}`,body=await(await page.request.get(url)).body();assert.equal(crypto.createHash('sha256').update(body).digest('hex'),crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,`${part}-${number}/result.png`))).digest('hex'));
   evidence.variants.push({part,number,raw_bytes_unchanged:true,camera_bones_identical:true});
  }
  for(const direction of ['front','back','left','right'])for(const movement of ['idle','trot'])for(const emote of ['','emotes/wave']){
   const pair=await page.evaluate(({direction,movement,emote})=>textureComparison.state.frames.map(p=>p.sample(`movement/${movement}-${direction}`,.43,undefined,emote)),{direction,movement,emote});
   assert.deepEqual(pair[0].bones,pair[1].bones);assert.equal(pair[0].time,pair[1].time);assert(pair.every(p=>p.visible_pixels>100));evidence.poses.push({direction,movement,emote,synchronized:true});
  }
  await page.locator('#play').click();await page.waitForTimeout(350);assert((await page.locator('#timeLabel').textContent())!=='0.00秒');await page.locator('#play').click();
  // Compare the raw-canvas baseline against the exact stored normalized bundle.
  const source=await browser.newPage(),sourceUrl=origin+await page.locator('#sourceLink').getAttribute('href');await source.goto(sourceUrl);await source.waitForFunction(()=>window.preview?.ready,null,{timeout:90000});
  const camera=await page.evaluate(()=>textureComparison.state.camera);await source.evaluate(camera=>preview.setComparisonCamera(camera),camera);
  await source.evaluate(()=>preview.sample('movement/idle-front',0));
  const image=await source.locator('canvas').evaluate(c=>c.toDataURL());
  evidence.baseline_mapping=await page.evaluate(async png=>{const p=textureComparison.state.frames[0];p.setComparisonCamera(textureComparison.state.camera);p.sample('movement/idle-front',0);const canvas=document.querySelector('#baseline').contentDocument.querySelector('canvas'),ctx=canvas.getContext('2d'),a=ctx.getImageData(0,0,512,512).data,im=new Image();im.src=png;await im.decode();const copy=document.createElement('canvas');copy.width=copy.height=512;const other=copy.getContext('2d');other.drawImage(im,0,0);const b=other.getImageData(0,0,512,512).data;let different=0,sum=0,max=0;for(let i=0;i<a.length;i+=4){let delta=0;for(let j=0;j<4;j++)delta=Math.max(delta,Math.abs(a[i+j]-b[i+j]));if(delta>8)different++;sum+=delta;max=Math.max(max,delta);}return {pixels:512*512,different_over_8:different,mean_max_channel_delta:sum/(512*512),max_channel_delta:max};},image);
  assert(evidence.baseline_mapping.different_over_8/(512*512)<.01,'BASE_MAPPING_DRIFT');await source.close();
  for(const suffix of ['download','context.json','comparison.json','asset/../../../../secrets/providers.json']){const response=await page.request.get(`${origin}/texture-view/${session}/v3-3/${suffix}`);assert.equal(response.status(),404);evidence.private_paths.push({suffix,status:response.status()});}
  assert.equal((await page.request.get(`${origin}/texture-view/${session}/source/download`)).status(),404);
  assert.equal((await page.request.get(`${origin}/texture-compare/${session}/image/HEAD_FRONT/0`)).status(),404);
  assert.equal((await page.request.get(`${origin}/texture-compare/${session}/config`,{headers:{Host:'untrusted.invalid'}})).status(),403);
  assert.equal((await page.request.post(`${origin}/texture-compare/${session}/approve`,{headers:{Origin:origin}})).status(),403);
  assert.deepEqual(events(),frozen);assert.deepEqual(evidence.browser_errors,[]);
  await page.locator('#direction').selectOption('front');await page.locator('#movement').selectOption('idle');await page.locator('#front').selectOption('2');await page.waitForFunction(()=>textureComparison.state.ready,null,{timeout:90000});await page.screenshot({path:path.join(out,'comparison-ready.png'),fullPage:true});
  evidence.status='PASS';fs.writeFileSync(path.join(out,'browser-evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
