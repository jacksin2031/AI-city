/* Shared experimental design and full-character operations; never auto-generates. */
(async()=>{
 const $=id=>document.getElementById(id);let identity=null;
 const api=async(action,payload)=>{
  const response=await fetch('/character/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await response.json();if(!response.ok)throw Error((data.code||'')+' '+(data.message||'操作に失敗しました。'));return data;
 };
 const status=message=>$('flow-status').textContent=message;
 const bindings=()=>JSON.parse($('flow-bindings').value||'{}');
 const setIdentity=id=>{identity=id;$('flow-plan').disabled=$('flow-build').disabled=!id;};
 window.characterFlow={get active(){return $('flow-use').checked;},get design_id(){return identity;},
  bindJob(part,id,designId){if(identity!==designId)return;const items=bindings();if(!part.startsWith('ARM'))items[part]={job_id:id};$('flow-bindings').value=JSON.stringify(items,null,2);},ready:false};
 async function run(action){$('flow-freeze').disabled=true;try{await action();}catch(error){status(error.message);}finally{$('flow-freeze').disabled=false;}}
 async function refresh(){const c=await(await fetch('/character/config')).json();$('flow-saved').replaceChildren(...c.designs.map(d=>new Option(d.character_id+' / '+d.photo,d.design_id)));return c;}
 try{
  const c=await refresh();$('flow-photo').replaceChildren(...c.photos.map(n=>new Option(n,n)));
  $('flow-draft').onclick=()=>run(async()=>{
   const r=await api('draft',{photo:$('flow-photo').value,character_id:$('flow-name').value,preset:$('flow-layout').value});
   setIdentity(null);$('flow-design').value=JSON.stringify(r.design,null,2);$('flow-bindings').value='{}';status('編集用の入力例です。写真の自動解析結果ではありません。内容を編集して確定してください。');
  });
  $('flow-design').oninput=()=>{setIdentity(null);$('flow-bindings').value='{}';status('設計書が変更されました。再度確定してください。');};
  $('flow-freeze').onclick=()=>run(async()=>{
   const r=await api('freeze',{design:JSON.parse($('flow-design').value)});setIdentity(r.design_id);$('flow-use').checked=true;
   await refresh();$('flow-saved').value=r.design_id;status('設計を確定しました。共通設計を使う部位生成と全身構築に適用されます。');
  });
  $('flow-load').onclick=()=>run(async()=>{
   const r=await api('load',{design_id:$('flow-saved').value});$('flow-design').value=JSON.stringify(r.design,null,2);$('flow-bindings').value='{}';
   setIdentity(r.design_id);$('flow-use').checked=true;status('保存済みの確定設計を読み込みました。');
  });
  $('flow-plan').onclick=()=>run(async()=>{
   const r=await api('requests',{design_id:identity});$('flow-requests').textContent=JSON.stringify(r.plan,null,2);status('全パーツの指示と参照ハッシュを保存しました。モデル呼出しは0回です。');
  });
  $('flow-build').onclick=()=>run(async()=>{
   $('flow-build').disabled=true;const payload={design_id:identity,output:'runtime/work/M04/character-flow/exports/export-'+crypto.randomUUID().replaceAll('-',''),bindings:bindings()};
   if($('flow-raw').value.trim())payload.raw_directory=$('flow-raw').value.trim();
   try{const r=await api('assemble',payload);$('candidate').src=r.preview_url;
    status('全身を構築しました。手動確認待ち・モデル呼出し0回。\n保存先：'+r.output+'\nZIP SHA-256：'+r.zip_sha256);window.characterFlow.lastBuild=r;
   }finally{$('flow-build').disabled=!identity;}
  });
  setIdentity(null);window.characterFlow.ready=true;
 }catch(error){status(error.message);}
})();
