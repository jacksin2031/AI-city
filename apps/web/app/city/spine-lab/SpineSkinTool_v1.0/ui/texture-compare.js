/* Read-only comparison. Existing rejected assets never enter the QA pipeline. */
(async()=>{
 const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),id=params.get('session');
 const images={},state={ready:false,playing:false,time:0,camera:null,request:0,frames:null};let config;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function loadFrame(frame,url){const started=Date.now();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('プレビューの読み込みがタイムアウトしました。')),60000);frame.onload=()=>{clearTimeout(timer);resolve();};frame.src=url;});while(!frame.contentWindow.preview?.ready){if(frame.contentWindow.preview?.error)throw Error(frame.contentWindow.preview.error);if(Date.now()-started>60000)throw Error('プレビューの準備に時間がかかっています。');await sleep(50);}return frame.contentWindow.preview;}
 function chosen(part){return Number($(part==='HAIR_FRONT'?'front':'back').value);}
 function drawRaw(){const part=$('part').value,n=chosen(part),a=images[part][0],b=images[part][n],canvas=$('rawCompare');canvas.width=a.naturalWidth;canvas.height=a.naturalHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.clearRect(0,0,canvas.width,canvas.height);const mode=$('mode').value;
  if(mode==='difference'){ctx.drawImage(a,0,0);const first=ctx.getImageData(0,0,canvas.width,canvas.height);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(b,0,0);const second=ctx.getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<first.data.length;i+=4){const alpha=Math.abs(first.data[i+3]-second.data[i+3]);for(let j=0;j<3;j++)first.data[i+j]=Math.max(alpha,Math.abs(first.data[i+j]-second.data[i+j]));first.data[i+3]=255;}ctx.putImageData(first,0,0);}
  else if(mode==='original')ctx.drawImage(a,0,0);else if(mode==='edited')ctx.drawImage(b,0,0);else{ctx.drawImage(a,0,0);ctx.globalAlpha=Number($('opacity').value);ctx.drawImage(b,0,0);ctx.globalAlpha=1;}
  $('rawLabel').textContent=`${part==='HAIR_FRONT'?'前髪':'後ろ髪'}：原素材 ↔ ${n?'編集'+n:'原素材'} / ${a.naturalWidth}×${a.naturalHeight}px`;
  document.querySelectorAll('.tile').forEach(el=>el.classList.toggle('selected',chosen(el.dataset.part)===Number(el.dataset.number)));
 }
 function render(){if(!state.ready)return;const name=`movement/${$('movement').value}-${$('direction').value}`,emote=$('emote').value,zoom=Number($('zoom').value),camera={...state.camera,scale:state.camera.scale*zoom};for(const frame of state.frames){frame.setComparisonCamera(camera);frame.sample(name,state.time,undefined,emote);} $('time').value=state.time;$('timeLabel').textContent=state.time.toFixed(2)+'秒';}
 async function select(){
  if(state.loading)return;state.loading=true;for(const key of ['front','back','reset'])$(key).disabled=true;$('galleries').inert=true;
  drawRaw();const request=++state.request;state.ready=false;state.playing=false;$('play').textContent='再生';$('progress').textContent='選択した素材を読み込み中…';const front=chosen('HAIR_FRONT'),back=chosen('HAIR_BACK');
  try{const selected=await loadFrame($('selected'),`/texture-view/${id}/v${front}-${back}/`);if(request!==state.request)return;state.frames=[$('baseline').contentWindow.preview,selected];state.ready=true;$('selectedLabel').textContent=`前髪：${front?'編集'+front:'原素材'} ／ 後ろ髪：${back?'編集'+back:'原素材'}`;render();$('progress').textContent='同じカメラ・動作時間で表示中。比較専用・判定変更なし。';}
  catch(e){if(request===state.request)$('progress').textContent='読み込み失敗：'+e.message;}
  finally{state.loading=false;for(const key of ['front','back','reset'])$(key).disabled=false;$('galleries').inert=false;}
 }
 try{
  if(!/^texture-[a-f0-9]{32}$/.test(id||''))throw Error('比較セッションを指定してください。');const response=await fetch(`/texture-compare/${id}/config`);if(!response.ok)throw Error('元素材または編集結果を確認できません。');config=await response.json();$('sourceLink').href=config.source_view;
  for(const [part,rows] of Object.entries(config.parts)){images[part]={};const heading=document.createElement('h3');heading.textContent=part==='HAIR_FRONT'?'前髪：原素材＋3回':'後ろ髪：原素材＋3回';$('galleries').append(heading);const gallery=document.createElement('div');gallery.className='gallery';$('galleries').append(gallery);
   await Promise.all(rows.map(async row=>{const tile=document.createElement('article');tile.className='tile';tile.dataset.part=part;tile.dataset.number=row.number;const title=document.createElement('strong');title.textContent=row.number?'編集'+row.number:'原素材';const image=new Image();image.className='checker';image.alt=(part==='HAIR_FRONT'?'前髪':'後ろ髪')+' '+title.textContent;tile.append(title,image);const description=document.createElement('p');const metric=row.metrics;description.textContent=metric?`旧実験チェック：拒否（美術品質の結論ではありません）\nIoU ${Number(metric.alpha32_iou).toFixed(4)} ／ 輪郭端の最大変化 ${metric.bbox_max_delta_pixels}px`:'すべての編集の固定された出発点';tile.append(description);gallery.append(tile);image.src=row.url;await image.decode();images[part][row.number]=image;image.onclick=()=>{$(part==='HAIR_FRONT'?'front':'back').value=String(row.number);$('part').value=part;select();};}));
  }
  const base=await loadFrame($('baseline'),config.base_view);state.camera=base.getCamera();base.sample('movement/idle-front',0);for(const a of base.animations.filter(a=>a.name.startsWith('emotes/')))$('emote').add(new Option(a.name,a.name));$('front').value=$('back').value='1';await select();
  $('front').onchange=$('back').onchange=select;$('reset').onclick=()=>{$('front').value=$('back').value='0';select();};for(const key of ['part','mode','opacity'])$(key).oninput=drawRaw;for(const key of ['direction','movement','emote','zoom'])$(key).onchange=render;$('time').oninput=()=>{state.time=Number($('time').value);render();};$('play').onclick=()=>{state.playing=!state.playing;$('play').textContent=state.playing?'一時停止':'再生';};
  let last=performance.now();setInterval(()=>{const now=performance.now();if(state.playing&&state.ready){state.time=(state.time+Math.min((now-last)/1000,.15))%2;render();}last=now;},100);
  window.textureComparison={ready:true,config,state,select,render,drawRaw};$('status').textContent='追加生成：0回。採用・承認・閾値変更は行っていません。';
 }catch(error){$('status').textContent='表示失敗：'+error.message;window.textureComparison={ready:false,error:String(error)};}
})();
