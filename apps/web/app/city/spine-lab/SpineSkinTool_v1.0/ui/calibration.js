(async()=>{
 const $=id=>document.getElementById(id),label={PASS:'基準内',FAIL:'違反',UNKNOWN:'未確認',COMPLETE:'テスト完了',PARTIAL:'未完了',REQUIRES_REVIEW:'手動確認を維持',LIMITED_CONTROLLED_TEST_PASS_ADVISORY_ONLY:'限定対照テスト内で一致（補助のみ）'};
 async function show(){
  const id=$('benchmarks').value;if(!id)return;const response=await fetch('/review/calibration/'+encodeURIComponent(id));if(!response.ok)throw Error('元データ・仕様・証拠の整合性を確認できません。');const r=await response.json();
  $('status').textContent=`${label[r.status]} ／ ${label[r.model_release_decision]}\n実行予約：${r.calls.length} 回 ／ 自動美術合格：無効\n判定基準：既存の制作仕様。写真の同一性・自然な失敗分布全体は今回の測定対象外です。`;
  $('report').textContent=JSON.stringify(r,null,2);$('summary').replaceChildren();$('cases').replaceChildren();
  for(const [split,kinds] of Object.entries(r.summary))for(const [kind,m] of Object.entries(kinds)){
   const tr=document.createElement('tr');for(const value of [split==='development'?'開発':'留出',kind==='runtime'?'実Runtime':'視覚モデル',m.cases,m.true_positive,m.true_negative,m.false_positive,m.false_negative,m.unknown]){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}$('summary').append(tr);
  }
  for(const c of r.cases){const article=document.createElement('article'),h=document.createElement('h3'),p=document.createElement('p');h.textContent=`${c.character} / ${c.criterion} / ${c.split==='development'?'開発':'留出'}`;
   p.textContent=`規範ラベル：${label[c.expected]} ／ ${c.runtime?'実Runtime':'モデル'}：${label[c.observed||'UNKNOWN']} ／ 確信度：${c.confidence??(c.runtime?1:0)}\n${c.message_ja||''}`;
   if(c.observed&&c.observed!==c.expected)article.className='bad';article.append(h,p);
   const image=document.createElement('img');image.loading='lazy';image.src='/review/calibration-artifact/'+id+'/'+c.image;image.alt=c.criterion+' '+label[c.expected];article.append(image);$('cases').append(article);
  }window.calibrationWorkbench={ready:true,benchmark_id:id};
 }
 try{const response=await fetch('/review/config');if(!response.ok)throw Error('設定を確認してください。');const data=await response.json();$('benchmarks').replaceChildren(...data.calibrations.map(c=>new Option(c.benchmark_id+' / '+label[c.status],c.benchmark_id)));const selected=new URLSearchParams(location.search).get('benchmark');if(selected&&data.calibrations.some(c=>c.benchmark_id===selected))$('benchmarks').value=selected;$('load').onclick=()=>show().catch(e=>$('status').textContent=e.message);await show();}catch(e){$('status').textContent=e.message;}
})();
