/* Regression for animation-hidden ears, skin outlines and direction occlusion.
 * No generation or outbound model calls. Uses actual Runtime when URLs are given.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
require(path.join(root,'ui/orientation.js'));
const names=['back-hair','leg-l','leg-r','body','skirt','arm-r','arm-l','ear-r','ear-l','head-base','hair-front','eye-l'];
const slots=names.map((name,index)=>({data:{name,index},pose:{attachment:null,setAttachment(a){this.attachment=a;}}}));
const policy={skin:'test',front_order:true,has_skirt:true,face_slots:['eye-l'],back_hide_slots:['hair-front']};
const rig={skin:{name:'test'},drawOrder:{pose:[...slots]},findSlot:n=>slots.find(s=>s.data.name===n),getAttachment:(i,key)=>({name:key})};
function check(frame,direction,hasSkirt){
 const order=frame.drawOrder,at=n=>{assert(order.includes(n),'MISSING_SLOT:'+n);return order.indexOf(n);};
 for(const arm of ['arm-l','arm-r']){
  for(const leg of ['leg-l','leg-r'])assert(at(leg)<at(arm)&&at(leg)<at('body'),'LEG_OCCLUSION');
  assert(direction==='back'?at(arm)<at('body'):at('body')<at(arm),'ARM_BODY_DIRECTION');
  if(hasSkirt)assert(direction==='back'?at(arm)<at('skirt'):at('skirt')<at(arm),'ARM_SKIRT_DIRECTION');
  for(const head of ['ear-l','ear-r','head-base','hair-front'])assert(at(arm)<at(head),'ARM_HEAD_OCCLUSION');
 }
 assert(frame.slots.find(s=>s.name===(direction==='back'?'back-hair':'hair-front'))?.attachment,'HAIR_ATTACHMENT_MISSING');
 for(const ear of ['ear-l','ear-r']){
  const attachment=frame.slots.find(s=>s.name===ear)?.attachment;
  assert(direction==='back'?attachment===null:!!attachment,'EAR_ATTACHMENT:'+direction+':'+ear);
  assert(at(ear)<at('hair-front'),'EAR_IN_FRONT_OF_HAIR');
  if(direction==='back')assert(at(ear)<at('back-hair'),'EAR_IN_FRONT_OF_REAR_HAIR');
 }
 if(direction==='back'){
  assert(at('head-base')<at('back-hair'),'REAR_HEAD_UNCOVERED');
  for(const name of ['hair-front','eye-l'])assert.equal(frame.slots.find(s=>s.name===name)?.attachment,null);
 }
}
for(const direction of ['front','back','left','right','back','front']){
 // Simulate the source animation hiding ears on every apply, including emotes.
 for(const s of slots)s.pose.attachment={name:'source'};
 for(const ear of ['ear-l','ear-r'])rig.findSlot(ear).pose.attachment=null;
 globalThis.applySpineOrientation(rig,direction,policy);
 const snapshot=()=>({drawOrder:rig.drawOrder.pose.map(s=>s.data.name),slots:slots.map(s=>({name:s.data.name,attachment:s.pose.attachment?.name??null}))});
 check(snapshot(),direction,true);const before=JSON.stringify(snapshot());
 globalThis.applySpineOrientation(rig,direction,policy);assert.equal(JSON.stringify(snapshot()),before,'GUARD_NOT_IDEMPOTENT');
}
async function main(){
 const urls=process.argv.slice(2);if(!urls.length){console.log(JSON.stringify({status:'PASS',simulated_direction_transitions:6}));return;}
 const {chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
 const browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
 try{for(const url of urls){
  assert.equal(new URL(url).hostname,'127.0.0.1');
  const output=path.join(root,'runtime/logs/M04-direction',new URL(url).port);fs.mkdirSync(output,{recursive:true});
  const page=await browser.newPage({viewport:{width:1000,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto(url);await page.waitForFunction(()=>window.preview?.ready||window.preview?.error);assert(await page.evaluate(()=>preview.ready));
  const p=await(await page.request.get(url+'/orientation-policy.json')).json();const frames=[];
  for(const action of ['idle','trot'])for(const direction of ['front','back','left','right']){
   for(const time of [0,.25,.5,.75,.99]){
    const s=await page.evaluate(({action,direction,time})=>preview.sample(`movement/${action}-${direction}`,time,'ai-city-original-template'),{action,direction,time});check(s,direction,p.has_skirt);frames.push(s);
   }
   if(action==='idle')await page.locator('canvas').screenshot({path:path.join(output,action+'-'+direction+'.png')});
  }
  for(const emote of ['emotes/wave','emotes/just-right'])for(const direction of ['front','back','left','right'])for(const time of [.2,.5,.8]){
   const s=await page.evaluate(({emote,direction,time})=>preview.sample('movement/idle-'+direction,time,'ai-city-original-template',emote),{emote,direction,time});check(s,direction,p.has_skirt);frames.push(s);
  }
  for(const direction of ['front','left','right']){
   await page.evaluate(()=>preview.sample('movement/idle-back',.2,'ai-city-original-template','emotes/wave'));
   for(const time of [0,.05,.3]){
    const s=await page.evaluate(({direction,time})=>preview.transition('movement/idle-'+direction,time,'emotes/wave'),{direction,time});check(s,direction,p.has_skirt);frames.push(s);
   }
   for(const time of [0,.05,.3]){
    const s=await page.evaluate(time=>preview.transition('movement/idle-back',time,'emotes/wave'),time);check(s,'back',p.has_skirt);frames.push(s);
   }
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify({policy:p,frames,errors},null,2));
  results.push({url,frames:frames.length,ears:'NON_BACK_RESTORED_BACK_HIDDEN',order:'DIRECTION_SPECIFIC',errors});await page.close();
 }}finally{await browser.close();}
 console.log(JSON.stringify({status:'PASS',results}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
