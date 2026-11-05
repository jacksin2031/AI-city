/* Shared read-only presentation. Physical incorporation is never quality approval. */
window.renderProductionTiming=(container,value)=>{
 container.replaceChildren();if(!value){container.textContent='計時記録は未確認です。';return;}
 const text=(tag,v)=>{const e=document.createElement(tag);e.textContent=v;return e;},seconds=v=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(1)+' 秒':'未計測';
 container.append(text('h3','実測時間（この候補）'),text('p','写真を今回の制作へ送信 → 初回組立：'+seconds(value.first_assembly_seconds)+' ／ 選択候補の組立：'+seconds(value.selected_assembly_seconds)),text('p','待機・設計・再生成を含みます。部品の採用は、この候補の組立での使用であり、美術承認ではありません。時間不明は0秒にしません。'));
 if(value.selected_assembly_seconds===null)container.append(text('p','制作記録の経過：'+seconds(value.flow_observed_seconds)+' ／ 未組立のため完成時間は未計測です。'));
 if(value.execution_session){const s=value.execution_session;container.append(text('p','実行会話：この人物専用 ／ '+s.status+' ／ 指定実行モデル '+s.requested_model+' ／ '+s.turns+'ターン。画像モデルの内部版は未公開です。各回の時間はCLI全体を含み、画像処理だけの時間ではありません。'));}
 const wrapper=text('div','');wrapper.style.overflowX='auto';const table=document.createElement('table');table.style.borderCollapse='collapse';const head=document.createElement('tr');
 for(const label of ['部位','生成試行数','各回の生成処理','開始→組立での使用','平均（左の総時間÷回数）','生成処理のみの平均'])head.append(text('th',label));table.append(head);
 const names={EARS_FRONT:'前耳のみ（後工程）',EARS_BACK:'背耳のみ（後工程）',HAIR_FRONT:'前髪',HAIR_BACK:'後髪',BODY_FRONT:'前衣身',BODY_BACK:'後衣身',ARM_FRONT:'前腕',ARM_BACK:'後腕',LEG_FRONT:'前脚',LEG_BACK:'後脚',SKIRT_FRONT:'前スカート',SKIRT_BACK:'後スカート'};
 for(const row of value.parts){const tr=document.createElement('tr');tr.append(text('td',names[row.part]||row.part));if(['STANDARD_SHARED_LOCAL','STANDARD_EAR_LOCAL'].includes(row.source)){tr.append(text('td','0・非AI'));const cell=text('td',(row.source==='STANDARD_EAR_LOCAL'?'標準耳':'標準腕')+'の共用ローカル処理：'+seconds(row.local_shared_timing?.elapsed_seconds)+'（前後2部品共通・加算不可）');cell.colSpan=4;tr.append(cell);}else{
 tr.append(text('td',row.attempt_count),text('td',(row.attempts||[]).map((a,i)=>(i+1)+'回：'+seconds(a.elapsed_seconds)+(a.status==='GENERATED_AWAITING_MANUAL_REVIEW'?'（返却）':a.error_code==='CODEX_OUTPUT_MODERATION_BLOCKED'?'（サービス出力審査で停止）':'（停止・結果未確認）')).join(' / ')||'未開始'),text('td',seconds(row.start_to_incorporation_seconds)),text('td',seconds(row.mean_start_to_incorporation_seconds)),text('td',seconds(row.mean_generation_seconds)));}table.append(tr);}
 for(const cell of table.querySelectorAll('td,th')){cell.style.border='1px solid #527080';cell.style.padding='8px';}wrapper.append(table);container.append(wrapper);
};

window.renderHairAlignment=(container,data)=>{
 if(!data?.height)return;const p=document.createElement('p'),h=data.height,n=x=>typeof x==='number'?x.toFixed(2):'未計測';
 p.textContent='前後の頭＋髪（同じ頭部座標・実寸未承認） ／ 前：上端 '+n(h.front.head_hair_top)+'・下端 '+n(h.front.head_hair_bottom)+'・全高 '+n(h.front.head_hair_height)+' ／ 後：上端 '+n(h.back.head_hair_top)+'・下端 '+n(h.back.head_hair_bottom)+'・全高 '+n(h.back.head_hair_height)+' ／ 高さ差 '+n(h.height_difference_fraction*100)+'%。';container.append(p);
 const ear=document.createElement('p');ear.textContent='耳工程：'+({HIDDEN:'耳を隠すデザイン',BARE_HAIR:'無耳の髪を先に確認',FRONT_EARS:'前耳を確認・背耳は未制作',BOTH_EARS:'前後耳を追加・最終確認待ち'}[data.ear_stage]||'保存済み工程')+' ／ 共通の耳根高さ：'+n(data.ear_targets?.points?.[0]?.[1])+'（頭部の局所単位）。PNGの縦寸法や耳に合わせて髪を再配置しません。';container.append(ear);
 if(data.ear_measurements){for(const [part,m] of Object.entries(data.ear_measurements)){const row=document.createElement('p');row.textContent=(part==='HAIR_FRONT'?'前耳':'背耳')+'：'+(m.roots_head_local.length?'耳根高さ '+m.roots_head_local.map(v=>n(v[1])).join(' / ')+' ／ 可視画素 '+m.visible_ear_pixels+(m.visible_ear_pixels===0?'（髪で遮蔽・確認が必要）':''):'未制作');container.append(row);if(m.per_ear){const each=document.createElement('p');each.textContent=m.per_ear.map(e=>(e.side==='left'?'左耳':'右耳')+' '+n(e.visible_fraction*100)+'% 可視（目標40%以上）').join(' ／ ');container.append(each);}}}
};
