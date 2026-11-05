/* Official Spine Canvas 4.3 Runtime; use triangle rendering for weighted meshes. */
(async () => {
 const status=document.querySelector('#status'), canvas=document.querySelector('canvas'), ctx=canvas.getContext('2d');
 try {
 const prefix=location.pathname.match(/^\/(?:character-view\/[0-9a-f]{64}|repair-view\/repair-[a-f0-9]{32}\/[0-9a-f]{64}|flow-view\/flow-[a-f0-9]{32}\/[0-9a-f]{64}|texture-view\/texture-[a-f0-9]{32}\/(?:source|v[0-3]-[0-3]))/)?.[0]||(location.pathname.startsWith('/baseline/')?'/baseline':'');
 const manifest=await (await fetch(prefix+'/manifest.json')).json();
 const embedded=new URLSearchParams(location.search).get('embedded')==='1';
 if(embedded)document.body.classList.add('comparison','embedded');
 document.querySelector('#trials').hidden=!manifest.trials;
 const policy=manifest.build?.runtime_guard_required?await (await fetch(prefix+'/orientation-policy.json')).json():null;
 document.querySelector('#download').href=prefix+'/download';
 document.querySelector('#workbench').hidden=!manifest.workbench;
 document.querySelector('#download').hidden=!manifest.build||manifest.comparison_only||embedded;
 if(manifest.comparison_only){document.body.classList.add('comparison');document.querySelector('h1').textContent='比較専用・未承認';}
 document.querySelector('#rebuild').onclick=async()=>{const button=document.querySelector('#rebuild');button.disabled=true;try{const response=await fetch('/rebuild',{method:'POST'});if(!response.ok)throw Error('部品を確認してください。以前の構築結果は保存されています。');location.reload();}catch(error){status.textContent=error.message;button.disabled=false;}};
 const manager=new spine.AssetManager(prefix+'/asset/');
 manager.loadTextureAtlas('skeleton.atlas'); manager.loadJson('skeleton.json');
 const deadline=performance.now()+20000;
 while(!manager.isLoadingComplete()) {if(performance.now()>deadline)throw Error('TEXTURE_TIMEOUT');await new Promise(r=>setTimeout(r,20));}
 if(manager.hasErrors())throw Error(JSON.stringify(manager.getErrors()));
 const reader=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(manager.get('skeleton.atlas')));
 const data=reader.readSkeletonData(manager.get('skeleton.json'));
 const renderer=new spine.SkeletonRenderer(ctx); renderer.triangleRendering=true;
 const animation=document.querySelector('#animation'), skin=document.querySelector('#skin');
 const emote=document.querySelector('#emote');
 data.animations.filter(a=>a.name.startsWith('emotes/')).forEach(a=>emote.add(new Option(a.name,a.name)));
 data.animations.forEach(a=>animation.add(new Option(a.name,a.name)));
 data.skins.forEach(s=>skin.add(new Option(s.name,s.name)));
 let rig,state,camera,paused=false,manual=false,direction='front',renderScale=1;
 function setMovement(name,overlay){
  direction=name.startsWith('movement/')?name.split('-').at(-1):'front';
  state.setAnimation(0,name,true);state.clearTrack(1);if(overlay)state.setAnimation(1,overlay,true);
 }
 function pose(){state.apply(rig);applySpineOrientation(rig,direction,policy);rig.updateWorldTransform(spine.Physics.update);}
 function reset(name,skinName,overlay=''){
  rig=new spine.Skeleton(data); rig.setSkinByName(skinName);rig.setupPose();
  const settings=new spine.AnimationStateData(data);settings.defaultMix=0.15;
  state=new spine.AnimationState(settings);setMovement(name,overlay);pose();
 }
 skin.value=manifest.build?.skin||(data.skins.some(s=>s.name==='spineboy')?'spineboy':data.skins.at(-1).name);
 reset('movement/idle-front',skin.value);
 const bounds=rig.getBoundsRect();camera={scale:400/Math.max(bounds.width,bounds.height),x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};
 // Canvas antialiasing can leave transparent hairlines between independently
 // clipped mesh triangles. Expand only the clip by <1 output pixel; keep the
 // source UV transform and all Spine geometry unchanged.
 renderer.drawTriangle=(img,x0,y0,u0,v0,x1,y1,u1,v1,x2,y2,u2,v2)=>{
  const ctx=renderer.ctx,epsilon=.75/(camera.scale*renderScale);
  const side0=Math.hypot(x1-x2,y1-y2),side1=Math.hypot(x2-x0,y2-y0),side2=Math.hypot(x0-x1,y0-y1),perimeter=side0+side1+side2;
  const twiceArea=Math.abs((x1-x0)*(y2-y0)-(y1-y0)*(x2-x0));
  if(!perimeter||!twiceArea){return;}
  const ix=(side0*x0+side1*x1+side2*x2)/perimeter,iy=(side0*y0+side1*y1+side2*y2)/perimeter;
  const factor=1+epsilon*perimeter/twiceArea;
  const expand=(x,y)=>[ix+(x-ix)*factor,iy+(y-iy)*factor];
  const [a0,b0]=expand(x0,y0),[a1,b1]=expand(x1,y1),[a2,b2]=expand(x2,y2);
  const width=img.width-1,height=img.height-1;u0*=width;v0*=height;u1*=width;v1*=height;u2*=width;v2*=height;
  let det=(u1-u0)*(v2-v0)-(u2-u0)*(v1-v0);if(det===0)return;det=1/det;
  const dx1=x1-x0,dy1=y1-y0,dx2=x2-x0,dy2=y2-y0,du1=u1-u0,dv1=v1-v0,du2=u2-u0,dv2=v2-v0;
  const a=(dv2*dx1-dv1*dx2)*det,b=(dv2*dy1-dv1*dy2)*det,c=(du1*dx2-du2*dx1)*det,d=(du1*dy2-du2*dy1)*det,e=x0-a*u0-c*v0,f=y0-b*u0-d*v0;
  ctx.beginPath();ctx.moveTo(a0,b0);ctx.lineTo(a1,b1);ctx.lineTo(a2,b2);ctx.closePath();ctx.save();ctx.transform(a,b,c,d,e,f);ctx.clip();ctx.drawImage(img,0,0);ctx.restore();
 };
 function draw(){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.scale(renderScale,renderScale);ctx.translate(256,256);ctx.scale(camera.scale,-camera.scale);ctx.translate(-camera.x,-camera.y);renderer.draw(rig);}
 function advance(dt){rig.update(dt);state.update(dt);pose();}
 const query=new URLSearchParams(location.search),wanted=query.get('animation'),wantedEmote=query.get('emote');
 const initial=data.animations.some(a=>a.name===wanted&&a.name.startsWith('movement/'))?wanted:'movement/idle-front';
 const initialEmote=data.animations.some(a=>a.name===wantedEmote&&a.name.startsWith('emotes/'))?wantedEmote:'';
 animation.value=initial;emote.value=initialEmote;if(initial!=='movement/idle-front'||initialEmote)reset(initial,skin.value,initialEmote);
 animation.onchange=skin.onchange=emote.onchange=()=>{manual=false;reset(animation.value,skin.value,emote.value);};
 document.querySelector('#pause').onclick=()=>{paused=!paused;document.querySelector('#pause').textContent=paused?'再開':'一時停止';};
 function poseSnapshot(name,time,skinName){
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let visible=0;for(let y=0;y<canvas.height;y+=renderScale)for(let x=0;x<canvas.width;x+=renderScale)if(pixels[(y*canvas.width+x)*4+3])visible++;
  return {animation:name,time,skin:skinName,source_sha256:manifest.source_sha256,atlas_sha256:manifest.atlas_sha256,visible_pixels:visible,bones:rig.bones.map(b=>[b.appliedPose.worldX,b.appliedPose.worldY,b.appliedPose.a,b.appliedPose.b]),slots:rig.slots.map(s=>({name:s.data.name,attachment:s.appliedPose.attachment?.name??null})),drawOrder:rig.drawOrder.appliedPose.map(s=>s.data.name)};
 }
 window.preview={ready:true,manifest,animations:data.animations.map(a=>({name:a.name,duration:a.duration})),
  getPose(){return poseSnapshot(state.tracks[0]?.animation.name,null,rig.skin.name);},
  getCamera(){return {...camera};},
  setComparisonCamera(value){if((!manifest.comparison_only&&!embedded)||!value||![value.x,value.y,value.scale].every(Number.isFinite)||value.scale<=0||value.scale>100)throw Error('COMPARISON_CAMERA');camera={x:value.x,y:value.y,scale:value.scale};manual=true;draw();return {...camera};},
  sample(name,time,skinName=skin.value,overlay=''){manual=true;reset(name,skinName,overlay);return this.advanceSample(time,name,skinName);},
  transition(name,time,overlay=''){manual=true;setMovement(name,overlay);return this.advanceSample(time,name,rig.skin.name);},
  advanceSample(time,name,skinName){pose();let elapsed=0;while(elapsed<time){const dt=Math.min(1/60,time-elapsed);advance(dt);elapsed+=dt;}draw();
   return poseSnapshot(name,time,skinName);
  },setReviewScale(scale){
   if(![1,2,4].includes(scale))throw Error('REVIEW_SCALE');renderScale=scale;manual=true;
   canvas.width=canvas.height=512*scale;canvas.style.width='512px';canvas.style.height='512px';draw();return {...camera,scale:renderScale};
  },reviewCapture(only=null,exclude=[]){
   manual=true;const order=rig.drawOrder.appliedPose,saved=order.slice();
   try{const selected=saved.filter(s=>(!only||only.includes(s.data.name))&&!exclude.includes(s.data.name));order.splice(0,order.length,...selected);draw();return canvas.toDataURL('image/png');}
   finally{order.splice(0,order.length,...saved);draw();}
  },get paused(){return paused;}};
 status.textContent=`再生準備完了：${data.version} / ${data.animations.length} 動作 / ${data.skins.length} 外観\nサイズは観測値です。美術品質は制作・レビュー画面の判定を確認してください。`;
 if(manifest.comparison_only)status.textContent='比較専用・未承認。元の判定・閾値・候補は変更していません。';
 if(query.get('snapshot')==='1'){window.preview.sample(initial,0,skin.value,initialEmote);manual=false;paused=true;document.querySelector('#pause').textContent='再生';}
 let last=performance.now();function frame(now){if(!manual&&!paused){advance(Math.min((now-last)/1000,0.05));draw();}last=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);
 } catch(error){status.textContent='読み込み失敗：'+error.message;window.preview={ready:false,error:String(error)};}
})();
