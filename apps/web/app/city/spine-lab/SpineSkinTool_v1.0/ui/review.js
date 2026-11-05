(async()=>{
 const $=id=>document.getElementById(id);let identity=null,timer=null,settings={};
 const names={PASS:'確認済み',FAIL:'不合格',UNKNOWN:'未確認',REQUIRES_REVIEW:'手動確認待ち',RUNNING:'処理中',NOT_RUN:'未実行',ERROR:'収集エラー',COMPLETED_ADVISORY:'補助結果を受信',ERROR_OR_RESULT_UNKNOWN_NO_RETRY:'結果未確認（自動再試行なし）'};
 const api=async(action,payload)=>{const r=await fetch('/review/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw Error((d.code||'')+' '+(d.message||'確認できませんでした。'));return d;};
 async function refresh(){const response=await fetch('/review/config'),c=await response.json();if(!response.ok)throw Error(c.message||'レビュー設定を確認してください。');settings=c.visual_settings;$('gate').textContent=!settings.live_enabled||!settings.upload_consent?'補助レビューは無効です。送信せず入力を確認できます。':settings.remaining_calls===0?'設定された試験回数に達しました。自動再試行は行いません。':'購読枠を使用します。残量は確認できません。設定した呼出し上限内でのみ実行します。';$('characters').replaceChildren(...c.characters.map(x=>new Option(x.character_id+' / '+x.output,x.output)));$('reviews').replaceChildren(...c.reviews.map(x=>new Option(x.character_id+' / '+(names[x.status]||x.status)+' / '+x.review_id,x.review_id)));return c;}
 function show(r){identity=r.review_id;$('reviews').value=identity;$('report').textContent=JSON.stringify(r,null,2);
  $('status').textContent=`総合：${names[r.status]||r.status}\nファイル・確定ルール：${names[r.hard.status]||r.hard.status}\n動作証拠：${names[r.render.status]||r.render.status} ／ ${r.render.frame_count||0} フレーム\n視覚補助：${names[r.visual_call.status]||'結果未確認'} ／ 自動美術合格：無効（補助判定）`+(r.stale_code?'\n元データまたは政策が変わりました。新しいレビューが必要です。':'');
  $('defects').replaceChildren();const issues=[...r.hard.defects,...r.render.defects,...r.visual_reviews.flatMap(x=>x.data.defects)];
  for(const x of issues){const li=document.createElement('li');li.textContent=`${x.code} ／ ${x.part||'CHARACTER'} ${x.direction||''} ${x.frame_id||''}：${x.message_ja}`;if(x.result==='FAIL'||x.severity==='MAJOR'||x.severity==='BLOCKER')li.className='bad';$('defects').append(li);}
  const ready=!!r.render.evidence_hash;$('capture').disabled=!!r.stale_code||r.hard.status==='FAIL'||r.render.status!=='NOT_RUN';$('request').disabled=$('import').disabled=!ready||!!r.stale_code;
  $('vision').disabled=!ready||!!r.stale_code||!settings.live_enabled||!settings.upload_consent||settings.remaining_calls===0||r.visual_call.status!=='NOT_RUN';
  $('images').replaceChildren();if(ready)for(const name of (r.evidence_images||[])){const link=document.createElement('a');link.href='/review/artifact/'+identity+'/'+name;link.target='_blank';link.rel='noreferrer';const image=document.createElement('img');image.src=link.href;image.alt=name;link.append(image);$('images').append(link);}
 }
 async function run(fn){try{await fn();}catch(e){$('status').textContent=e.message;}}
 async function load(){const r=await api('report',{review_id:identity});show(r);return r;}
 function poll(mode='capture'){if(timer)clearInterval(timer);let ticks=0;timer=setInterval(()=>run(async()=>{const r=await load();const done=mode==='capture'?['PASS','FAIL','ERROR'].includes(r.render.status):['COMPLETED_ADVISORY','ERROR_OR_RESULT_UNKNOWN_NO_RETRY'].includes(r.visual_call.status);if(done||r.stale_code||++ticks>=400){clearInterval(timer);timer=null;if(ticks>=400)$('status').textContent='完了を確認できません。保存済みレビューを再読み込みしてください。';}}),1500);}
 try{await refresh();$('choose').onclick=()=>{$('output').value=$('characters').value;};$('refresh').onclick=()=>run(refresh);
  $('create').onclick=()=>run(async()=>{const r=await api('create',{character_output:$('output').value.trim()});await refresh();show(r);});
  $('load').onclick=()=>run(async()=>{identity=$('reviews').value;if(!identity)return;await load();});
  $('capture').onclick=()=>run(async()=>{$('capture').disabled=true;await api('capture',{review_id:identity});$('status').textContent='動作と画像を収集中です…';poll();});
  $('request').onclick=()=>run(async()=>{const r=await api('request',{review_id:identity});$('visual').value=JSON.stringify(r.blank_report,null,2);$('prompt').textContent=r.prompt;$('status').textContent='入力を保存しました。モデルへの送信は0回です。';});
  $('vision').onclick=()=>run(async()=>{$('vision').disabled=true;await api('vision',{review_id:identity});$('status').textContent='購読枠で補助レビューを実行中です…';poll('vision');});
  $('import').onclick=()=>run(async()=>{const r=await api('import',{review_id:identity,source:$('source').value,data:JSON.parse($('visual').value)});show(r);});
  const selected=new URLSearchParams(location.search).get('review');if(selected&&[...$('reviews').options].some(o=>o.value===selected)){identity=selected;await load();}
  window.reviewWorkbench={ready:true,get review_id(){return identity;}};
 }catch(e){$('status').textContent=e.message;}
})();
