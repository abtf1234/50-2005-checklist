'use strict';
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const today=()=>new Date().toISOString().slice(0,10);
const LS={get(k,d=''){try{return localStorage.getItem(k)??d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const GRAV=['Catastrófico','Sério','Moderado','Menor'];
const PROB=[['MP','Muito provável'],['P','Provável'],['I','Improvável'],['R','Remota']];
const MATRIX={MP:['Alto','Alto','Alto','Médio'],P:['Alto','Alto','Médio','Baixo'],I:['Médio','Médio','Baixo','Desprezável'],R:['Baixo','Baixo','Desprezável','Desprezável']};
const risk=(g,p)=>(g&&p)?MATRIX[p][GRAV.indexOf(g)]:'';
const HEAD=[['empresa','Designação'],['morada','Morada'],['processo','Nº processo'],['data','Data da verificação','date'],['tecnico','Técnico responsável'],['contacto','Contacto'],['equip','Equipamento'],['nint','Nº interno IETA'],['fab','Fabricante'],['nserie','Nº série'],['modelo','Modelo'],['ano','Ano de fabrico'],['local','Local'],['ce','Marcação CE'],['cap','Capacidade / potência']];
const RES={C:'Conforme',NC:'Não conforme',NA:'N/A'};

/* ---------- IndexedDB ---------- */
let db;
const openDB=()=>new Promise((res,rej)=>{const r=indexedDB.open('ieta-insp',1);
 r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('insp',{keyPath:'id'});d.createObjectStore('photos',{keyPath:'id'}).createIndex('insp','inspId')};
 r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>rej(r.error)});
const tx=(st,mode,fn)=>new Promise((res,rej)=>{const t=db.transaction(st,mode);const r=fn(t.objectStore(st));t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error)});
const put=(s,v)=>tx(s,'readwrite',x=>x.put(v));
const getAll=s=>tx(s,'readonly',x=>x.getAll());
const del=(s,k)=>tx(s,'readwrite',x=>x.delete(k));
const photosOf=id=>tx('photos','readonly',x=>x.index('insp').getAll(id));

/* ---------- estado ---------- */
let cur=null,photos=[],tab='dados',urls={},xl=null;
const mod=i=>DATA.modules.find(m=>m.id===(i||cur).module);
function sections(i){
 const m=mod(i),out=[];
 if(!m.standalone) DATA.core.pre.forEach(s=>out.push({...s,part:'Núcleo'}));
 m.sections.forEach(s=>{ if(!m.multi||i.blocks.includes(s.id)) out.push({...s,part:m.name}) });
 if(!m.standalone) DATA.core.post.forEach(s=>out.push({...s,part:'Núcleo'}));
 return out;
}
const allItems=i=>sections(i).flatMap(s=>s.items.map(it=>({...it,sec:s.title})));
const A=ref=>cur.ans[ref]||(cur.ans[ref]={});
let st;
function save(){clearTimeout(st);st=setTimeout(()=>{if(cur){cur.updated=Date.now();put('insp',cur)}},300);xl=null}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),2200)}
function counts(i,items){let c=0,nc=0,na=0;items=items||allItems(i);items.forEach(it=>{const r=(i.ans[it.id]||{}).r;if(r==='C')c++;else if(r==='NC')nc++;else if(r==='NA')na++});return{c,nc,na,done:c+nc+na,total:items.length}}

/* ---------- fotos ---------- */
async function shrink(file){
 const bmp=await createImageBitmap(file);const k=Math.min(1,1280/Math.max(bmp.width,bmp.height));
 const w=Math.round(bmp.width*k),h=Math.round(bmp.height*k);
 const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(bmp,0,0,w,h);
 const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',.78));return{blob,w,h};
}
async function addPhotos(files,ref){
 for(const f of files){try{const s=await shrink(f);const p={id:uid(),inspId:cur.id,ref,blob:s.blob,w:s.w,h:s.h,ts:Date.now()};await put('photos',p);photos.push(p)}catch(e){toast('Não consegui ler a foto')}}
 xl=null;renderPhotos(ref);
}
const urlOf=p=>urls[p.id]||(urls[p.id]=URL.createObjectURL(p.blob));
function renderPhotos(ref){
 document.querySelectorAll(`.photos[data-ref="${ref}"]`).forEach(el=>{
  el.innerHTML=photos.filter(p=>p.ref===ref).map(p=>`<div class="th"><img src="${urlOf(p)}" data-act="view" data-pid="${p.id}" alt=""><b data-act="delp" data-pid="${p.id}">×</b></div>`).join('')+
  `<label class="addp"><span>📷</span>Foto<input type="file" accept="image/*" capture="environment" data-add="${ref}"></label><label class="addp"><span>🖼</span>Galeria<input type="file" accept="image/*" multiple data-add="${ref}"></label>`;
 });
}
function viewPhoto(id){const p=photos.find(x=>x.id===id);const o=document.createElement('div');
 o.style.cssText='position:fixed;inset:0;background:#000d;z-index:20;display:flex;align-items:center;justify-content:center';
 o.innerHTML=`<img src="${urlOf(p)}" style="max-width:96%;max-height:96%">`;o.onclick=()=>o.remove();document.body.appendChild(o)}

/* ---------- ecrãs ---------- */
function setHeader(title,sub,back){$('#title').textContent=title;$('#sub').textContent=sub||'';$('#back').hidden=!back}
$('#back').onclick=()=>{ if(cur&&tab!=='dados'&&false){} goHome() };

async function goHome(){
 if(cur){clearTimeout(st);cur.updated=Date.now();await put('insp',cur)}
 cur=null;photos=[];Object.values(urls).forEach(URL.revokeObjectURL);urls={};xl=null;
 setHeader('Inspeções DL 50/2005','',false);
 const list=(await getAll('insp')).sort((a,b)=>b.updated-a.updated);
 app.innerHTML=`<button class="btn" data-act="new">＋ Nova inspeção</button>
 <h2>Inspeções guardadas (${list.length})</h2>
 ${list.map(i=>{const c=counts(i);return`<div class="card insp" data-act="open" data-id="${i.id}"><div><b>${esc(i.head.equip||'(sem nome)')} ${i.head.nint?'· '+esc(i.head.nint):''}</b><small>${esc(mod(i).name)} · ${esc(i.head.data||'')}${i.head.local?' · '+esc(i.head.local):''}</small><div style="margin-top:6px"><span class="pill">${c.done}/${c.total}</span>${c.nc?`<span class="pill nc">${c.nc} NC</span>`:''}${c.done===c.total&&c.total?'<span class="pill ok">completa</span>':''}</div></div><button class="btn sec sm" data-act="delinsp" data-id="${i.id}">Apagar</button></div>`}).join('')||'<p class="warn">Ainda não tens inspeções. Carrega em “Nova inspeção”.</p>'}
 ${list.length?`<h2>Ficheiro acumulado</h2><div class="card"><p style="margin:0 0 10px;font-size:14px;color:var(--mut)">Um Excel com uma linha por item e por inspeção, para filtrares e contares NCs.</p><button class="btn sec" data-act="hist">Exportar histórico (Excel)</button></div>`:''}
 <p style="font-size:12px;color:var(--mut);margin-top:24px">Tudo fica guardado só neste dispositivo. Partilha o Excel no fim de cada inspeção para teres cópia.</p>`;
}
function newScreen(){
 setHeader('Nova inspeção','',true);
 app.innerHTML=`<div class="card"><label>Tipo de equipamento / módulo técnico</label><select id="nm">${DATA.modules.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
 <div id="mdesc" style="font-size:13px;color:var(--mut);margin-top:8px"></div></div>
 <button class="btn" data-act="create">Começar</button>`;
 const upd=()=>{const m=DATA.modules.find(x=>x.id===$('#nm').value);const n=m.sections.reduce((a,s)=>a+s.items.length,0);$('#mdesc').textContent=m.standalone?`Checklist completo e próprio, ${n} itens, sem núcleo geral.`:`Núcleo geral (37 itens) + ${n} itens do módulo${m.multi?' (escolhes os blocos que se aplicam)':''}.`};
 $('#nm').onchange=upd;upd();
}
async function createInsp(){
 const m=DATA.modules.find(x=>x.id===$('#nm').value);
 cur={id:uid(),created:Date.now(),updated:Date.now(),module:m.id,blocks:m.multi?[]:m.sections.map(s=>s.id),
  head:{empresa:LS.get('empresa','IETA, SA'),morada:LS.get('morada'),data:today(),tecnico:LS.get('tecnico'),contacto:LS.get('contacto','HST & Ambiente'),equip:m.standalone?'Tina de decapagem':'',...(m.prefill||{})},ans:{},nc:{},concl:'',obsGeral:''};
 await put('insp',cur);photos=[];tab='dados';renderInsp();
}
async function openInsp(id){
 cur=(await getAll('insp')).find(i=>i.id===id);photos=await photosOf(id);tab=Object.keys(cur.ans).length?'check':'dados';renderInsp();
}
const TABS=[['dados','Dados'],['check','Checklist'],['nc','NCs'],['fim','Concluir']];
function renderInsp(){
 const c=counts(cur);
 setHeader(cur.head.equip||mod().name,`${c.done}/${c.total}`,true);
 app.innerHTML=`<div class="seg" style="grid-template-columns:repeat(4,1fr);position:sticky;top:50px;z-index:4;background:var(--bg);padding:6px 0">${TABS.map(([k,l])=>`<button data-act="tab" data-k="${k}" class="${tab===k?'on':''}" style="${tab===k?'background:var(--pri);color:var(--pri-ink);border-color:var(--pri)':''}">${l}${k==='nc'&&c.nc?` (${c.nc})`:''}</button>`).join('')}</div><div id="pane"></div>`;
 ({dados:paneDados,check:paneCheck,nc:paneNC,fim:paneFim})[tab]();
 window.scrollTo(0,0);
}
function paneDados(){
 const m=mod();
 $('#pane').innerHTML=`<div class="card"><h3>Identificação — ${esc(m.name)}</h3><div class="grid">${HEAD.map(([k,l,t])=>`<div><label>${l}</label><input data-h="${k}" type="${t||'text'}" value="${esc(cur.head[k]||'')}"></div>`).join('')}</div></div>
 ${m.multi?`<div class="card"><h3>Blocos que se aplicam a este equipamento</h3><div class="checks">${m.sections.map(s=>`<label><input type="checkbox" data-blk="${s.id}" ${cur.blocks.includes(s.id)?'checked':''}> ${esc(s.title)} (${s.items.length})</label>`).join('')}</div>${cur.blocks.length?'':'<p class="warn">Escolhe pelo menos um bloco.</p>'}</div>`:''}
 ${m.note?`<div class="card" style="font-size:13px;color:var(--mut)">${esc(m.note)}</div>`:''}
 <button class="btn" data-act="tab" data-k="check">Ir para a checklist ›</button>`;
}
function itemHTML(it){const a=cur.ans[it.id]||{};
 return`<div class="item ${a.r||''}" data-ref="${it.id}"><div class="t"><span class="ref">${it.id}</span><span>${esc(it.text)}</span></div>
 ${it.hint?`<button class="hintb" data-act="hint">▸ O que verificar</button><div class="hint" hidden>${esc(it.hint)}</div>`:''}
 <div class="seg">${['C','NC','NA'].map(v=>`<button data-act="set" data-v="${v}" class="${a.r===v?'on':''}">${RES[v]}</button>`).join('')}</div>
 <textarea data-obs rows="1" placeholder="Observações">${esc(a.obs||'')}</textarea><div class="photos" data-ref="${it.id}"></div></div>`}
function paneCheck(){
 const secs=sections(cur);
 if(!secs.length){$('#pane').innerHTML='<p class="warn">Escolhe primeiro os blocos em “Dados”.</p>';return}
 $('#pane').innerHTML=secs.map(s=>`<div class="sec-h" data-act="sec"><span>${esc(s.title)}</span><span>${s.items.length}</span></div><div>${s.items.map(itemHTML).join('')}</div>`).join('')+
 `<button class="btn" data-act="tab" data-k="nc" style="margin-top:16px">Ver não conformidades ›</button>`;
 allItems(cur).forEach(it=>renderPhotos(it.id));
}
function paneNC(){
 const items=allItems(cur).filter(it=>(cur.ans[it.id]||{}).r==='NC');
 if(!items.length){$('#pane').innerHTML='<div class="card">Sem não conformidades assinaladas. 🎉</div><button class="btn" data-act="tab" data-k="fim">Concluir ›</button>';return}
 $('#pane').innerHTML=items.map(it=>{const n=cur.nc[it.id]||{};const r=risk(n.grav,n.prob);
  return`<div class="card" data-ref="${it.id}"><h3>NC · ${it.id}</h3><div style="font-size:14px;color:var(--mut)">${esc(it.text)}</div>
  <label>Situação perigosa identificada</label><textarea data-nc="sit">${esc(n.sit??it.text)}</textarea>
  <div class="grid"><div><label>Gravidade</label><select data-nc="grav"><option value="">—</option>${GRAV.map(g=>`<option ${n.grav===g?'selected':''}>${g}</option>`).join('')}</select></div>
  <div><label>Probabilidade</label><select data-nc="prob"><option value="">—</option>${PROB.map(([k,l])=>`<option value="${k}" ${n.prob===k?'selected':''}>${l} (${k})</option>`).join('')}</select></div></div>
  <p style="margin:10px 0 0">Nível de risco: <span class="nr ${r}" data-nr>${r||'—'}</span></p>
  <label>Recomendação</label><textarea data-nc="rec">${esc(n.rec||'')}</textarea>
  ${(cur.ans[it.id].obs)?`<div style="font-size:13px;color:var(--mut);margin-top:6px">Obs.: ${esc(cur.ans[it.id].obs)}</div>`:''}
  <div class="photos" data-ref="${it.id}"></div>${photos.some(p=>p.ref===it.id)?'':'<div class="warn">Sem foto de evidência.</div>'}</div>`}).join('')+`<button class="btn" data-act="tab" data-k="fim">Concluir ›</button>`;
 items.forEach(it=>renderPhotos(it.id));
}
function paneFim(){
 const c=counts(cur);
 $('#pane').innerHTML=`<div class="card"><h3>Resumo</h3><div class="prog"><i style="width:${c.total?c.done/c.total*100:0}%"></i></div>
 <span class="pill ok">${c.c} conformes</span><span class="pill nc">${c.nc} não conformes</span><span class="pill">${c.na} N/A</span><span class="pill">${c.total-c.done} por responder</span>
 ${c.total-c.done?'<p class="warn">Há itens por responder.</p>':''}</div>
 <div class="card radio"><h3>Conclusão</h3>
 <label><input type="radio" name="cn" data-concl="CUMPRE" ${cur.concl==='CUMPRE'?'checked':''}> O equipamento CUMPRE os requisitos mínimos de segurança aplicáveis.</label>
 <label><input type="radio" name="cn" data-concl="NAO" ${cur.concl==='NAO'?'checked':''}> O equipamento NÃO CUMPRE os requisitos mínimos de segurança aplicáveis.</label>
 ${c.nc&&cur.concl==='CUMPRE'?'<p class="warn">Atenção: tens NCs assinaladas.</p>':''}
 <label>Observações gerais</label><textarea data-og>${esc(cur.obsGeral||'')}</textarea></div>
 <div class="card"><button class="btn" data-act="gen">Gerar Excel</button><div id="xlout" style="margin-top:12px"></div></div>`;
 if(xl)showXl();
}
function showXl(){$('#xlout').innerHTML=`<p style="margin:0 0 10px">✔ <b>${esc(xl.name)}</b> (${(xl.blob.size/1048576).toFixed(1)} MB)</p><div class="row"><button class="btn" data-act="share">Partilhar</button><button class="btn sec" data-act="dl">Descarregar</button></div>`}

/* ---------- eventos ---------- */
const app=$('#app');
app.addEventListener('click',async e=>{
 const t=e.target.closest('[data-act]');if(!t)return;const act=t.dataset.act;
 if(act==='new')newScreen();
 else if(act==='create')createInsp();
 else if(act==='open')openInsp(t.dataset.id);
 else if(act==='delinsp'){e.stopPropagation();if(confirm('Apagar esta inspeção e as fotos?')){const ps=await photosOf(t.dataset.id);for(const p of ps)await del('photos',p.id);await del('insp',t.dataset.id);goHome()}}
 else if(act==='tab'){if(tab==='dados'&&mod().multi&&!cur.blocks.length&&t.dataset.k!=='dados'){toast('Escolhe pelo menos um bloco');return}tab=t.dataset.k;renderInsp()}
 else if(act==='hint'){const h=t.nextElementSibling;h.hidden=!h.hidden}
 else if(act==='sec'){const b=t.nextElementSibling;b.hidden=!b.hidden}
 else if(act==='set'){const it=t.closest('.item'),ref=it.dataset.ref,a=A(ref);a.r=a.r===t.dataset.v?'':t.dataset.v;
  it.className='item '+(a.r||'');it.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.v===a.r));
  const c=counts(cur);$('#sub').textContent=`${c.done}/${c.total}`;save()}
 else if(act==='view')viewPhoto(t.dataset.pid);
 else if(act==='delp'){if(confirm('Remover esta foto?')){const p=photos.find(x=>x.id===t.dataset.pid);await del('photos',p.id);photos=photos.filter(x=>x!==p);xl=null;renderPhotos(p.ref)}}
 else if(act==='gen'){t.disabled=true;t.textContent='A gerar…';try{const c=counts(cur);if(c.done<c.total&&!confirm(`Faltam ${c.total-c.done} itens por responder. Gerar mesmo assim?`)){return}
   clearTimeout(st);await put('insp',cur);const blob=await buildXlsx(cur,photos);xl={blob,name:fname()};showXl()}catch(err){console.error(err);toast('Erro a gerar o Excel')}finally{t.disabled=false;t.textContent='Gerar Excel'}}
 else if(act==='share'){const f=new File([xl.blob],xl.name,{type:xl.blob.type});
  if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:xl.name})}catch(err){if(err.name!=='AbortError')download(xl.blob,xl.name)}}else download(xl.blob,xl.name)}
 else if(act==='dl')download(xl.blob,xl.name);
 else if(act==='hist'){t.disabled=true;try{const blob=await buildHistory();download(blob,`Historico_Inspecoes_${today()}.xlsx`)}finally{t.disabled=false}}
});
app.addEventListener('input',e=>{const t=e.target;
 if(t.dataset.h){cur.head[t.dataset.h]=t.value;if(t.dataset.h==='tecnico')LS.set('tecnico',t.value);if(t.dataset.h==='contacto')LS.set('contacto',t.value);if(t.dataset.h==='empresa')LS.set('empresa',t.value);if(t.dataset.h==='morada')LS.set('morada',t.value);if(t.dataset.h==='equip')$('#title').textContent=t.value||mod().name;save()}
 else if(t.dataset.obs!==undefined){A(t.closest('.item').dataset.ref).obs=t.value;save()}
 else if(t.dataset.nc){const ref=t.closest('[data-ref]').dataset.ref;const n=cur.nc[ref]||(cur.nc[ref]={});n[t.dataset.nc]=t.value;
  if(t.dataset.nc!=='sit'&&t.dataset.nc!=='rec'){const r=risk(n.grav,n.prob);const el=t.closest('.card').querySelector('[data-nr]');el.textContent=r||'—';el.className='nr '+r}save()}
 else if(t.dataset.og!==undefined){cur.obsGeral=t.value;save()}
});
app.addEventListener('change',async e=>{const t=e.target;
 if(t.dataset.add){const f=[...t.files];t.value='';await addPhotos(f,t.dataset.add)}
 else if(t.dataset.blk){const b=t.dataset.blk;cur.blocks=t.checked?[...new Set([...cur.blocks,b])]:cur.blocks.filter(x=>x!==b);save();paneDados()}
 else if(t.dataset.concl){cur.concl=t.dataset.concl;save();paneFim()}
 else if(t.dataset.nc)input_nc(t);
});
function input_nc(t){}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000)}
const fname=()=>{const h=cur.head;return('Inspecao_'+[h.equip,h.nint,h.data].filter(Boolean).join('_')).replace(/[^\w\-]+/g,'_').replace(/_+/g,'_')+'.xlsx'};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&cur){clearTimeout(st);put('insp',cur)}});

/* ---------- Excel: uma inspeção ---------- */
const XT={style:'thin',color:{argb:'FFBBC4CE'}},XB={top:XT,left:XT,bottom:XT,right:XT};
const NAVY='FF16324F';
function hdr(row){row.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};c.alignment={vertical:'middle',horizontal:'center',wrapText:true};c.border=XB})}
const fill=a=>({type:'pattern',pattern:'solid',fgColor:{argb:a}});
const RISKC={Alto:'FFE06060','Médio':'FFF2A33A',Baixo:'FFF5DF6B','Desprezável':'FFA8DDB8'};
const fit=(w,h,bw,bh)=>{const k=Math.min(bw/w,bh/h);return{width:Math.round(w*k),height:Math.round(h*k)}};
async function buildXlsx(i,phs){
 const wb=new ExcelJS.Workbook();wb.creator='IETA — HST & Ambiente';wb.created=new Date();
 const m=mod(i),items=allItems(i),c=counts(i,items),h=i.head;
 const tipo=m.name+(m.multi?' — '+m.sections.filter(s=>i.blocks.includes(s.id)).map(s=>s.title.replace(/^[A-Z]\s*—\s*/,'')).join(' + '):'');
 // Resumo
 const r=wb.addWorksheet('Resumo');r.columns=[{width:30},{width:42},{width:26},{width:34}];
 r.mergeCells('A1:D1');r.getCell('A1').value='CHECKLIST DE SEGURANÇA DE EQUIPAMENTOS DE TRABALHO — DL 50/2005';r.getCell('A1').font={bold:true,size:14,color:{argb:'FFFFFFFF'}};r.getCell('A1').fill=fill(NAVY);r.getRow(1).height=28;r.getCell('A1').alignment={vertical:'middle'};
 const kv=[['Designação',h.empresa,'Nº processo',h.processo],['Morada',h.morada,'Data da verificação',h.data],['Contacto',h.contacto,'Técnico responsável',h.tecnico],[],['Equipamento',h.equip,'Nº interno IETA',h.nint],['Fabricante',h.fab,'Nº série',h.nserie],['Modelo',h.modelo,'Ano de fabrico',h.ano],['Tipo / módulo técnico',tipo,'Local',h.local],['Marcação CE',h.ce,'Capacidade / potência',h.cap]];
 kv.forEach(x=>{const row=r.addRow(x);[1,3].forEach(k=>{row.getCell(k).font={bold:true};row.getCell(k).fill=fill('FFE8EDF3')});row.eachCell(cc=>{cc.border=XB;cc.alignment={wrapText:true,vertical:'top'}})});
 r.addRow([]);const rr=r.addRow(['Resultados','Conformes: '+c.c,'Não conformes: '+c.nc,'N/A: '+c.na+'  ·  Por responder: '+(c.total-c.done)]);rr.eachCell(cc=>{cc.font={bold:true};cc.border=XB});
 r.addRow([]);const cn=r.addRow(['Conclusão',i.concl==='CUMPRE'?'CUMPRE os requisitos mínimos de segurança aplicáveis':i.concl==='NAO'?'NÃO CUMPRE os requisitos mínimos de segurança aplicáveis':'(por preencher)']);
 cn.getCell(1).font={bold:true};cn.getCell(2).font={bold:true,color:{argb:i.concl==='NAO'?'FFC62F2F':'FF1D8A55'}};r.mergeCells(cn.number,2,cn.number,4);
 if(i.obsGeral){const o=r.addRow(['Observações gerais',i.obsGeral]);r.mergeCells(o.number,2,o.number,4);o.getCell(2).alignment={wrapText:true,vertical:'top'};o.height=Math.max(30,15*Math.ceil(i.obsGeral.length/80))}
 r.addRow([]);const mh=r.addRow(['Matriz de risco','Catastrófico','Sério','Moderado','Menor']);r.getColumn(5).width=14;hdr(mh);
 PROB.forEach(([k,l])=>{const row=r.addRow([l,...MATRIX[k]]);row.getCell(1).font={bold:true};row.eachCell((cc,n)=>{cc.border=XB;if(n>1){cc.fill=fill(RISKC[cc.value]);cc.alignment={horizontal:'center'}}})});
 // Checklist
 const w=wb.addWorksheet('Checklist',{views:[{state:'frozen',ySplit:1}]});
 w.columns=[{header:'Ref.',width:7},{header:'Requisito / item a verificar',width:70},{header:'C',width:6},{header:'NC',width:6},{header:'N/A',width:6},{header:'Observações',width:46},{header:'Fotos',width:7}];hdr(w.getRow(1));
 let last='';
 items.forEach(it=>{if(it.sec!==last){last=it.sec;const sr=w.addRow([it.sec]);w.mergeCells(sr.number,1,sr.number,7);sr.getCell(1).font={bold:true};sr.getCell(1).fill=fill('FFD7E1EC')}
  const a=i.ans[it.id]||{};const row=w.addRow([it.id,it.text,a.r==='C'?'X':'',a.r==='NC'?'X':'',a.r==='NA'?'X':'',a.obs||'',phs.filter(p=>p.ref===it.id).length||'']);
  row.eachCell(cc=>{cc.border=XB;cc.alignment={wrapText:true,vertical:'top'}});[3,4,5,7].forEach(k=>row.getCell(k).alignment={horizontal:'center',vertical:'top'});
  if(a.r==='C')row.getCell(3).fill=fill('FFDFF3E8');if(a.r==='NC'){row.getCell(4).fill=fill('FFFBE1E1');row.getCell(4).font={bold:true,color:{argb:'FFC62F2F'}}}if(a.r==='NA')row.getCell(5).fill=fill('FFE8EBF0')});
 w.autoFilter={from:'A1',to:'G1'};
 // imagens
 const imgId={};for(const p of phs){imgId[p.id]=wb.addImage({buffer:await p.blob.arrayBuffer(),extension:'jpeg'})}
 // NCs
 const ncs=items.filter(it=>(i.ans[it.id]||{}).r==='NC');
 const n=wb.addWorksheet('Não conformidades',{views:[{state:'frozen',ySplit:1}]});
 n.columns=[{header:'NC',width:5},{header:'Ref.',width:7},{header:'Situação perigosa identificada',width:38},{header:'Gravidade',width:13},{header:'Probabilidade',width:14},{header:'NR',width:13},{header:'Recomendação',width:38},{header:'Foto 1',width:24},{header:'Foto 2',width:24},{header:'Foto 3',width:24}];hdr(n.getRow(1));
 ncs.forEach((it,k)=>{const x=i.nc[it.id]||{};const pr=PROB.find(q=>q[0]===x.prob);const rk=risk(x.grav,x.prob);const ps=phs.filter(p=>p.ref===it.id);
  const row=n.addRow([k+1,it.id,x.sit??it.text,x.grav||'',pr?pr[1]:'',rk,x.rec||'',ps.length>3?'':'',ps.length>3?'(+'+(ps.length-3)+' na folha Fotos)':'','']);
  row.height=ps.length?100:40;row.eachCell(cc=>{cc.border=XB;cc.alignment={wrapText:true,vertical:'top'}});if(rk){row.getCell(6).fill=fill(RISKC[rk]);row.getCell(6).font={bold:true}}
  ps.slice(0,3).forEach((p,q)=>{const s=fit(p.w,p.h,165,125);n.addImage(imgId[p.id],{tl:{col:7+q+.04,row:row.number-1+.04},ext:s})})});
 if(!ncs.length)n.addRow(['','Sem não conformidades.']);
 // Fotos
 if(phs.length){const f=wb.addWorksheet('Fotos');f.columns=[{header:'Ref.',width:8},{header:'Item',width:50},{header:'Foto',width:52}];hdr(f.getRow(1));
  const order=items.map(x=>x.id);
  [...phs].sort((a,b)=>order.indexOf(a.ref)-order.indexOf(b.ref)||a.ts-b.ts).forEach(p=>{const it=items.find(x=>x.id===p.ref);const row=f.addRow([p.ref,it?it.text:'',''])
   ;row.height=190;row.eachCell(cc=>{cc.border=XB;cc.alignment={wrapText:true,vertical:'top'}});const s=fit(p.w,p.h,340,250);f.addImage(imgId[p.id],{tl:{col:2.04,row:row.number-1+.04},ext:s})})}
 const buf=await wb.xlsx.writeBuffer();return new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
/* ---------- Excel: histórico ---------- */
async function buildHistory(){
 const list=(await getAll('insp')).sort((a,b)=>(a.head.data||'').localeCompare(b.head.data||''));const phs=await getAll('photos');
 const wb=new ExcelJS.Workbook();const s=wb.addWorksheet('Inspeções',{views:[{state:'frozen',ySplit:1}]});
 s.columns=['Data','Nº processo','Equipamento','Nº interno','Fabricante','Modelo','Nº série','Local','Módulo','Técnico','Conclusão','Conformes','Não conformes','N/A','Por responder'].map(x=>({header:x,width:16}));hdr(s.getRow(1));
 const d=wb.addWorksheet('Itens',{views:[{state:'frozen',ySplit:1}]});
 d.columns=['Data','Nº processo','Equipamento','Nº interno','Local','Módulo','Ref.','Secção','Requisito','Resultado','Observações','Nº fotos','Situação perigosa','Gravidade','Probabilidade','Nível de risco','Recomendação'].map((x,k)=>({header:x,width:[12,12,22,12,16,22,7,30,60,14,36,8,40,13,14,13,40][k]}));hdr(d.getRow(1));
 for(const i of list){const h=i.head,items=allItems(i),c=counts(i,items);
  s.addRow([h.data,h.processo,h.equip,h.nint,h.fab,h.modelo,h.nserie,h.local,mod(i).name,h.tecnico,i.concl==='CUMPRE'?'Cumpre':i.concl==='NAO'?'Não cumpre':'',c.c,c.nc,c.na,c.total-c.done]);
  items.forEach(it=>{const a=i.ans[it.id]||{},x=i.nc[it.id]||{},pr=PROB.find(q=>q[0]===x.prob);const nc=a.r==='NC';
   d.addRow([h.data,h.processo,h.equip,h.nint,h.local,mod(i).name,it.id,it.sec,it.text,RES[a.r]||'',a.obs||'',phs.filter(p=>p.inspId===i.id&&p.ref===it.id).length||'',nc?(x.sit??it.text):'',nc?x.grav||'':'',nc&&pr?pr[1]:'',nc?risk(x.grav,x.prob):'',nc?x.rec||'':'']).eachCell(cc=>cc.alignment={wrapText:true,vertical:'top'})})}
 d.autoFilter={from:'A1',to:'Q1'};s.autoFilter={from:'A1',to:'O1'};
 return new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

/* ---------- arranque ---------- */
openDB().then(()=>{goHome();if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()});
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});
