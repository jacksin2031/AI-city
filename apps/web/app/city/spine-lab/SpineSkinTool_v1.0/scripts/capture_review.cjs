/* Actual Spine evidence renderer. Private config only; no model or external requests. */
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
function work(p){const absolute=path.resolve(p),relative=path.relative(path.join(root,'runtime/work'),absolute);assert(!relative.startsWith('..')&&!path.isAbsolute(relative),'PRIVATE_WORK_REQUIRED');return absolute;}
function start(python,bundle){return new Promise((resolve,reject)=>{
 const child=spawn(python,['-B',path.join(root,'scripts/preview.py'),'--source',path.join(bundle,'skeleton.json'),'--atlas',path.join(bundle,'skeleton.atlas'),'--port','0'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='',diagnostic='';const timeout=setTimeout(()=>{child.kill();reject(Error('PREVIEW_START_TIMEOUT'));},20000);
 child.stderr.on('data',b=>{diagnostic+=b.toString();});child.stdout.on('data',b=>{output+=b.toString();const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);resolve({child,url:match[0]});}});
 child.on('error',e=>{clearTimeout(timeout);reject(e);});child.on('exit',code=>{clearTimeout(timeout);if(!output.includes('http://'))reject(Error('PREVIEW_START_FAILED:'+code+':'+diagnostic.slice(-1000)));});
 });}
async function main(){
 const config=JSON.parse(fs.readFileSync(work(process.argv[2]),'utf8')),output=work(config.output);
 const browser=await chromium.launch({channel:'msedge',headless:true});const frames=[],errors=[];let active;
 try{
  for(const scale of [1,2,4]){
   const variant=work(config.variants[String(scale)]);active=await start(config.python,variant);
   const page=await browser.newPage({viewport:{width:1000,height:1000}});
   page.on('pageerror',e=>errors.push(String(e)));page.on('requestfailed',r=>errors.push(r.failure()?.errorText+' '+r.url()));
   await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   await page.goto(active.url);await page.waitForFunction(()=>window.preview?.ready||window.preview?.error);assert(await page.evaluate(()=>preview.ready),'PREVIEW_NOT_READY: '+await page.evaluate(()=>preview.error||'UNKNOWN'));
   const camera=await page.evaluate(s=>preview.setReviewScale(s),scale);fs.mkdirSync(path.join(output,'frames'),{recursive:true});fs.mkdirSync(path.join(output,'masks'),{recursive:true});
   let index=0;
   async function save(sample,meta){
    const id=`s${scale}-${String(index++).padStart(3,'0')}`,screenshot=`frames/${id}.png`;
    const data=await page.evaluate(()=>preview.reviewCapture());fs.writeFileSync(path.join(output,screenshot),Buffer.from(data.split(',')[1],'base64'));
    const row={...sample,...meta,frame_id:id,scale,camera,screenshot,masks:{}};
    if(scale===1){
     const groups={head:['head-base'],hair:[meta.direction==='back'?'back-hair':'hair-front'],legs:['leg-l','leg-r'],cover:['body','skirt'],'ear-l':['ear-l'],'ear-r':['ear-r']};
     const images=await page.evaluate(groups=>{
      const out={};for(const [key,names] of Object.entries(groups))out[key]=preview.reviewCapture(names);
      for(const ear of ['ear-l','ear-r'])out['without-'+ear]=preview.reviewCapture(null,[ear]);return out;
     },groups);
     for(const [name,png] of Object.entries(images)){const relative=`masks/${id}-${name}.png`;fs.writeFileSync(path.join(output,relative),Buffer.from(png.split(',')[1],'base64'));row.masks[name]=relative;}
    }
    frames.push(row);
   }
   for(const action of ['idle','trot'])for(const direction of ['front','back','left','right'])for(const time of [0,.25,.5,.75,.99]){
    const animation=`movement/${action}-${direction}`,sample=await page.evaluate(({animation,time})=>preview.sample(animation,time,'ai-city-original-template'),{animation,time});
    await save(sample,{kind:'movement',direction,animation,time,overlay:''});
   }
   for(const overlay of ['emotes/wave','emotes/just-right'])for(const direction of ['front','back','left','right'])for(const time of [.2,.5,.8]){
    const animation='movement/idle-'+direction,sample=await page.evaluate(({animation,time,overlay})=>preview.sample(animation,time,'ai-city-original-template',overlay),{animation,time,overlay});await save(sample,{kind:'emote',direction,animation,time,overlay});
   }
   for(const direction of ['front','left','right']){
    await page.evaluate(()=>preview.sample('movement/idle-back',.2,'ai-city-original-template','emotes/wave'));
    for(const time of [0,.05,.3]){
     const animation='movement/idle-'+direction,sample=await page.evaluate(({animation,time})=>preview.transition(animation,time,'emotes/wave'),{animation,time});await save(sample,{kind:'transition',direction,animation,time,overlay:'emotes/wave'});
    }
    for(const time of [0,.05,.3]){const animation='movement/idle-back',sample=await page.evaluate(time=>preview.transition('movement/idle-back',time,'emotes/wave'),time);await save(sample,{kind:'transition',direction:'back',animation,time,overlay:'emotes/wave'});}
   }
   await page.close();active.child.kill();active=null;
  }
  // Pixel dimensions differ; geometry, attachments and order must not.
  const base=frames.filter(f=>f.scale===1);for(const scale of [2,4]){
   const other=frames.filter(f=>f.scale===scale);assert.equal(other.length,base.length);
   for(let i=0;i<base.length;i++){assert.deepEqual(other[i].bones,base[i].bones,'SCALE_BONE_DRIFT');assert.deepEqual(other[i].slots,base[i].slots,'SCALE_ATTACHMENT_DRIFT');assert.deepEqual(other[i].drawOrder,base[i].drawOrder,'SCALE_ORDER_DRIFT');}
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'frames.json'),JSON.stringify(frames));
  console.log(JSON.stringify({status:'PASS',frames:frames.length,scales:[1,2,4],errors}));
 }finally{if(active)active.child.kill();await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={start};
