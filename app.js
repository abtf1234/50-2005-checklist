'use strict';
/* ================= utilidades ================= */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const today=()=>new Date().toISOString().slice(0,10);
const LS={get(k,d=''){try{return localStorage.getItem(k)??d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const GRAV=['Catastrófico','Sério','Moderado','Menor'];
const PROB=[['MP','Muito provável'],['P','Provável'],['I','Improvável'],['R','Remota']];
const MATRIX={MP:['Alto','Alto','Alto','Médio'],P:['Alto','Alto','Médio','Baixo'],I:['Médio','Médio','Baixo','Desprezável'],R:['Baixo','Baixo','Desprezável','Desprezável']};
const risk=(g,p)=>(g&&p)?MATRIX[p][GRAV.indexOf(g)]:'';
const HEAD=[['empresa','Designação'],['morada','Morada'],['processo','Nº processo'],['data','Data da verificação','date'],['tecnico','Técnico responsável'],['contacto','Contacto'],['equip','Equipamento'],['nint','Nº interno'],['fab','Fabricante'],['nserie','Nº série'],['modelo','Modelo'],['ano','Ano de fabrico'],['local','Local'],['ce','Marcação CE'],['cap','Capacidade / potência']];
const MF=[['equip','Equipamento'],['nint','Nº interno'],['fab','Fabricante'],['modelo','Modelo'],['nserie','Nº série'],['ano','Ano de fabrico'],['local','Local'],['ce','Marcação CE'],['cap','Capacidade / potência']];
const RES={C:'Conforme',NC:'Não conforme',NA:'N/A'};
const ESTADOS=['Aberta','Em curso','Fechada'];
const estadoOf=n=>(n&&n.estado)||'Aberta';
const fmtD=d=>d?d.split('-').reverse().join('/'):'';

/* ================= IndexedDB ================= */
let db;
const openDB=()=>new Promise((res,rej)=>{const r=indexedDB.open('ieta-insp',2);
 r.onupgradeneeded=()=>{const d=r.result;
  if(!d.objectStoreNames.contains('insp'))d.createObjectStore('insp',{keyPath:'id'});
  if(!d.objectStoreNames.contains('photos'))d.createObjectStore('photos',{keyPath:'id'}).createIndex('insp','inspId');
  if(!d.objectStoreNames.contains('machines'))d.createObjectStore('machines',{keyPath:'id'});
  if(!d.objectStoreNames.contains('settings'))d.createObjectStore('settings',{keyPath:'key'});};
 r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>rej(r.error)});
const tx=(st,mode,fn)=>new Promise((res,rej)=>{const t=db.transaction(st,mode);const r=fn(t.objectStore(st));t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error)});
const put=(s,v)=>tx(s,'readwrite',x=>x.put(v));
const get1=(s,k)=>tx(s,'readonly',x=>x.get(k));
const getAll=s=>tx(s,'readonly',x=>x.getAll());
const del=(s,k)=>tx(s,'readwrite',x=>x.delete(k));
const photosOf=id=>tx('photos','readonly',x=>x.index('insp').getAll(id));

/* ================= estado ================= */
const app=$('#app');
let view='home',homeTab='insp',cur=null,prev=null,photos=[],tab='dados',urls={},outs={},mdraft=null,SET={logo:null};
const mod=i=>DATA.modules.find(m=>m.id===(i||cur).module);
function sections(i){
 const m=mod(i),out=[];
 if(!m.standalone)DATA.core.pre.forEach(s=>out.push({...s,part:'Núcleo'}));
 m.sections.forEach(s=>{if(!m.multi||i.blocks.includes(s.id))out.push({...s,part:m.name})});
 if(!m.standalone)DATA.core.post.forEach(s=>out.push({...s,part:'Núcleo'}));
 return out;
}
const allItems=i=>sections(i).flatMap(s=>s.items.map(it=>({...it,sec:s.title})));
const A=ref=>cur.ans[ref]||(cur.ans[ref]={});
const NCo=ref=>cur.nc[ref]||(cur.nc[ref]={});
let st;
function save(){clearTimeout(st);st=setTimeout(()=>{if(cur){cur.updated=Date.now();put('insp',cur)}},300);outs={}}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),2400)}
function counts(i,items){let c=0,nc=0,na=0;items=items||allItems(i);items.forEach(it=>{const r=(i.ans[it.id]||{}).r;if(r==='C')c++;else if(r==='NC')nc++;else if(r==='NA')na++});return{c,nc,na,done:c+nc+na,total:items.length}}
const modName=i=>{const m=mod(i);return m.name+(m.multi&&i.blocks.length?' — '+m.sections.filter(s=>i.blocks.includes(s.id)).map(s=>s.title.replace(/^[A-Z]\s*—\s*/,'').replace(/\s*\(.*$/,'')).join(' + '):'')};
const machName=m=>(m.equip||'(sem nome)')+(m.nint?' · '+m.nint:'');
const inspName=i=>(i.head.equip||'(sem nome)')+(i.head.nint?' · '+i.head.nint:'');

/* ================= definições / tema ================= */
function applyTheme(){document.documentElement.dataset.tema=LS.get('tema','auto')}
function paintLogo(){const el=$('#logo');if(SET.logo){el.src=SET.logo.data;el.hidden=false}else el.hidden=true}
async function loadSettings(){const l=await get1('settings','logo');SET.logo=l||null;paintLogo();applyTheme()}
async function fileToLogo(file){const bmp=await createImageBitmap(file);const k=Math.min(1,400/Math.max(bmp.width,bmp.height));
 const w=Math.round(bmp.width*k),h=Math.round(bmp.height*k);const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d');c.drawImage(bmp,0,0,w,h);
 return{key:'logo',data:cv.toDataURL('image/png'),w,h}}

/* ================= fotos ================= */
async function shrink(file){
 const bmp=await createImageBitmap(file);const k=Math.min(1,1280/Math.max(bmp.width,bmp.height));
 const w=Math.round(bmp.width*k),h=Math.round(bmp.height*k);
 const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(bmp,0,0,w,h);
 const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',.78));return{blob,w,h};
}
async function addPhotos(files,ref){
 for(const f of files){try{const s=await shrink(f);const p={id:uid(),inspId:cur.id,ref,blob:s.blob,w:s.w,h:s.h,ts:Date.now()};await put('photos',p);photos.push(p)}catch(e){toast('Não consegui ler a foto')}}
 outs={};renderPhotos(ref);
}
const urlOf=p=>urls[p.id]||(urls[p.id]=URL.createObjectURL(p.blob));
function renderPhotos(ref){
 document.querySelectorAll(`.photos[data-ref="${ref}"]`).forEach(el=>{
  el.innerHTML=photos.filter(p=>p.ref===ref).map(p=>`<div class="th"><img src="${urlOf(p)}" data-act="view" data-pid="${p.id}" alt=""><b data-act="delp" data-pid="${p.id}">×</b></div>`).join('')+
  `<label class="addp"><span>📷</span>Foto<input type="file" accept="image/*" capture="environment" data-add="${ref}"></label><label class="addp"><span>🖼</span>Galeria<input type="file" accept="image/*" multiple data-add="${ref}"></label>`;
 });
}
function closeModal(){document.querySelectorAll('.modal').forEach(m=>m.remove())}
function viewPhoto(id){const p=photos.find(x=>x.id===id);closeModal();const o=document.createElement('div');o.className='modal dark';
 o.innerHTML=`<img src="${urlOf(p)}"><div class="mbar"><button class="btn sm" data-act="mark" data-pid="${id}">✎ Marcar</button><button class="btn sec sm" data-act="mclose">Fechar</button></div>`;document.body.appendChild(o)}
function markPhoto(id){
 const p=photos.find(x=>x.id===id);closeModal();const o=document.createElement('div');o.className='modal dark';
 o.innerHTML=`<canvas id="mk"></canvas><div class="mbar"><button class="btn sec sm" id="mkundo">Desfazer</button><button class="btn sec sm" id="mkclr">Limpar</button><button class="btn sm" id="mksave">Guardar</button><button class="btn sec sm" data-act="mclose">Cancelar</button></div>`;
 document.body.appendChild(o);
 const cv=$('#mk',o),c=cv.getContext('2d');const img=new Image();let strokes=[],curS=null;
 const lw=()=>Math.max(4,Math.round(cv.width/120));
 const redraw=()=>{c.drawImage(img,0,0);c.strokeStyle='#e8212b';c.lineWidth=lw();c.lineCap=c.lineJoin='round';strokes.forEach(s=>{c.beginPath();s.forEach((q,k)=>k?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]));if(s.length===1)c.lineTo(s[0][0]+.1,s[0][1]);c.stroke()})};
 img.onload=()=>{cv.width=img.width;cv.height=img.height;redraw()};img.src=urlOf(p);
 const pos=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height]};
 cv.onpointerdown=e=>{cv.setPointerCapture(e.pointerId);curS=[pos(e)];strokes.push(curS);redraw()};
 cv.onpointermove=e=>{if(!curS)return;curS.push(pos(e));redraw()};
 cv.onpointerup=cv.onpointercancel=()=>{curS=null};
 $('#mkundo').onclick=()=>{strokes.pop();redraw()};$('#mkclr').onclick=()=>{strokes=[];redraw()};
 $('#mksave').onclick=async()=>{if(!strokes.length){closeModal();return}
  const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',.85));p.blob=blob;await put('photos',p);URL.revokeObjectURL(urls[p.id]);delete urls[p.id];outs={};closeModal();renderPhotos(p.ref);toast('Foto marcada')};
}

/* ================= navegação ================= */
function setHeader(title,sub,back){$('#title').textContent=title;$('#sub').textContent=sub||'';$('#back').hidden=!back}
function setNav(on){const n=$('#nav');n.hidden=!on;document.body.classList.toggle('hasnav',on);
 n.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.t===homeTab))}
function push(v){view=v;history.pushState({v},'')}
window.addEventListener('popstate',()=>{if(view!=='home')goHome()});
$('#back').onclick=()=>{if(view!=='home')history.back()};
function netState(){const s=$('#net');s.hidden=navigator.onLine;}
addEventListener('online',netState);addEventListener('offline',netState);

/* ================= ecrãs: início ================= */
let MS=[],INS=[],ACT=[],cf='all';
const screen=(t,s,back=true)=>{setHeader(t,s,back);setNav(false)};
async function goHome(t){
 if(cur){clearTimeout(st);cur.updated=Date.now();await put('insp',cur)}
 cur=null;prev=null;photos=[];Object.values(urls).forEach(URL.revokeObjectURL);urls={};outs={};mdraft=null;closeModal();
 if(typeof t==='string')homeTab=t;view='home';await renderHome();
}
async function renderHome(){setNav(true);await ({insp:homeInsp,maq:homeMaq,acoes:homeAcoes,mais:homeMais})[homeTab]();window.scrollTo(0,0)}
async function homeInsp(){
 setHeader('Inspeções','',false);
 const list=(await getAll('insp')).sort((a,b)=>b.updated-a.updated);
 app.innerHTML=`<div class="row"><button class="btn" data-act="new">＋ Nova inspeção</button><button class="btn sec" data-act="scan">▣ Ler QR da máquina</button></div>
 <h2>Guardadas (${list.length})</h2>
 ${list.map(i=>{const c=counts(i);return`<div class="card insp" data-act="open" data-id="${i.id}"><div><b>${esc(inspName(i))}</b><small>${esc(mod(i).name)} · ${esc(fmtD(i.head.data))}${i.head.local?' · '+esc(i.head.local):''}</small><div style="margin-top:6px"><span class="pill">${c.done}/${c.total}</span>${c.nc?`<span class="pill nc">${c.nc} NC</span>`:''}${c.total&&c.done===c.total?'<span class="pill ok">completa</span>':''}</div></div><button class="btn sec sm" data-act="delinsp" data-id="${i.id}">Apagar</button></div>`}).join('')||'<div class="card empty">Ainda não tens inspeções.<br>Carrega em “Nova inspeção”.</div>'}`;
}
async function homeMaq(){
 setHeader('Máquinas','',false);
 MS=(await getAll('machines')).sort((a,b)=>machName(a).localeCompare(machName(b)));INS=await getAll('insp');
 app.innerHTML=`<button class="btn" data-act="maqnew">＋ Nova máquina</button><input id="q" placeholder="Procurar por nome, nº interno ou local" style="margin-top:12px"><div id="mlist" style="margin-top:12px"></div>`;
 drawMaq('');
}
function drawMaq(q){
 q=q.trim().toLowerCase();
 const l=MS.filter(m=>!q||[m.equip,m.nint,m.local,m.fab,m.modelo].join(' ').toLowerCase().includes(q));
 $('#mlist').innerHTML=l.map(m=>{const is=INS.filter(i=>i.machineId===m.id).sort((a,b)=>b.created-a.created);const last=is[0];const mm=DATA.modules.find(x=>x.id===m.module);
  return`<div class="card insp" data-act="maqopen" data-id="${m.id}"><div><b>${esc(machName(m))}</b><small>${esc(mm?mm.name:'')}${m.local?' · '+esc(m.local):''}</small><div style="margin-top:6px">${last?`<span class="pill">Última: ${esc(fmtD(last.head.data))}</span>${counts(last).nc?`<span class="pill nc">${counts(last).nc} NC</span>`:'<span class="pill ok">sem NC</span>'}`:'<span class="pill">Sem inspeções</span>'}</div></div><span style="font-size:22px;color:var(--mut)">›</span></div>`}).join('')||`<div class="card empty">${MS.length?'Nada encontrado.':'Ainda não tens máquinas no cadastro.<br>Podes criá-las aqui, ou a partir de uma inspeção (separador “Dados”).'}</div>`;
}
async function homeAcoes(){
 setHeader('Plano de ações','',false);
 const ins=await getAll('insp');const rows=[];
 ins.forEach(i=>allItems(i).forEach(it=>{if((i.ans[it.id]||{}).r==='NC')rows.push({i,it,n:i.nc[it.id]||{}})}));
 const f=LS.get('afilt','open'),t=today();
 const open=rows.filter(r=>estadoOf(r.n)!=='Fechada'),late=open.filter(r=>r.n.prazo&&r.n.prazo<t);
 ACT=rows.filter(r=>f==='all'||estadoOf(r.n)!=='Fechada').sort((a,b)=>(a.n.prazo||'9999').localeCompare(b.n.prazo||'9999'));
 app.innerHTML=`<div class="card"><span class="pill nc">${open.length} em aberto</span><span class="pill ${late.length?'nc':''}">${late.length} em atraso</span><span class="pill ok">${rows.length-open.length} fechadas</span>
 <div class="seg" style="grid-template-columns:1fr 1fr;margin:10px 0 0"><button data-act="afilt" data-f="open" class="${f==='open'?'on':''}" data-v="C">Em aberto</button><button data-act="afilt" data-f="all" class="${f==='all'?'on':''}" data-v="C">Todas</button></div></div>
 ${ACT.map((r,k)=>{const e=estadoOf(r.n),late=e!=='Fechada'&&r.n.prazo&&r.n.prazo<t;
 return`<div class="card act ${e==='Fechada'?'done':''} ${late?'late':''}"><div class="insp" data-act="actopen" data-ai="${k}"><div><b>${esc(inspName(r.i))}</b><small>${esc(fmtD(r.i.head.data))} · ${r.it.id}${late?' · <b style="color:var(--nc)">em atraso</b>':''}</small></div><span style="font-size:22px;color:var(--mut)">›</span></div>
 <div style="font-size:14px;margin:6px 0">${esc(r.n.sit??r.it.text)}</div>${r.n.rec?`<div style="font-size:13px;color:var(--mut)">Recomendação: ${esc(r.n.rec)}</div>`:''}
 <div class="grid"><div><label>Responsável</label><input data-ax="resp" data-ai="${k}" value="${esc(r.n.resp||'')}"></div><div><label>Prazo</label><input type="date" data-ax="prazo" data-ai="${k}" value="${esc(r.n.prazo||'')}"></div><div><label>Estado</label><select data-ax="estado" data-ai="${k}">${ESTADOS.map(s=>`<option ${s===e?'selected':''}>${s}</option>`).join('')}</select></div></div></div>`}).join('')||'<div class="card empty">Sem ações em aberto. 🎉</div>'}`;
}
async function homeMais(){
 setHeader('Definições','',false);
 let est='';try{const e=await navigator.storage.estimate();est=`${(e.usage/1048576).toFixed(1)} MB usados neste tablet`}catch(e){}
 app.innerHTML=`<div class="card"><h3>Dados por defeito</h3><p class="mut">Entram automaticamente em cada nova inspeção.</p>
 ${[['empresa','Designação','IETA, SA'],['morada','Morada',''],['tecnico','Técnico responsável',''],['contacto','Contacto','HST & Ambiente']].map(([k,l,d])=>`<label>${l}</label><input data-set="${k}" value="${esc(LS.get(k,d))}">`).join('')}</div>
 <div class="card"><h3>Logo da empresa</h3><p class="mut">Aparece na app e no cabeçalho do relatório Word.</p>${SET.logo?`<img src="${SET.logo.data}" style="max-height:60px;display:block;margin-bottom:10px;background:#fff;padding:4px;border-radius:6px">`:''}
 <div class="row"><label class="btn sec" style="margin:0;text-align:center;color:var(--ink)">Escolher imagem<input type="file" accept="image/*" data-logo hidden></label>${SET.logo?'<button class="btn sec" data-act="logoclr">Remover</button>':''}</div></div>
 <div class="card"><h3>Aparência</h3><label>Tema</label><select data-set="tema"><option value="auto" ${LS.get('tema','auto')==='auto'?'selected':''}>Automático (claro/escuro do telemóvel)</option><option value="hc" ${LS.get('tema')==='hc'?'selected':''}>Alto contraste (para usar ao sol)</option></select></div>
 <div class="card"><h3>Exportar e copiar</h3><button class="btn sec" data-act="hist" style="margin-bottom:10px">Exportar histórico (Excel acumulado)</button>
 <button class="btn sec" data-act="bkexp" style="margin-bottom:10px">Cópia de segurança (ficheiro)</button>
 <label class="btn sec" style="margin:0;text-align:center;color:var(--ink)">Restaurar cópia de segurança<input type="file" accept=".json,application/json" data-bkimp hidden></label>
 <p class="mut" style="margin-top:10px">${est}. A cópia de segurança serve para guardares tudo ou passares as máquinas e inspeções para outro tablet.</p></div>`;
}

/* ================= máquinas ================= */
async function machineScreen(id){
 const m=id?await get1('machines',id):null;
 mdraft=m?{...m,blocks:[...(m.blocks||[])]}:{id:uid(),created:Date.now(),module:DATA.modules[0].id,blocks:[],equip:'',nint:'',fab:'',modelo:'',nserie:'',ano:'',local:'',ce:'',cap:'',_new:true};
 INS=(await getAll('insp')).filter(i=>i.machineId===mdraft.id).sort((a,b)=>b.created-a.created);
 if(view==='home')push('machine');renderMachine();
}
function blocksHTML(){const m=DATA.modules.find(x=>x.id===mdraft.module);
 return m.multi?`<label>Blocos que se aplicam</label><div class="checks">${m.sections.map(s=>`<label><input type="checkbox" data-mblk="${s.id}" ${mdraft.blocks.includes(s.id)?'checked':''}> ${esc(s.title)}</label>`).join('')}</div>`:''}
function renderMachine(){
 screen(mdraft._new?'Nova máquina':mdraft.equip||'Máquina','',true);
 app.innerHTML=`<div class="card"><div class="grid">${MF.map(([k,l])=>`<div><label>${l}</label><input data-mf="${k}" value="${esc(mdraft[k]||'')}"></div>`).join('')}</div>
 <label>Tipo de equipamento / módulo</label><select data-mmod>${DATA.modules.map(m=>`<option value="${m.id}" ${m.id===mdraft.module?'selected':''}>${esc(m.name)}</option>`).join('')}</select><div id="mblk">${blocksHTML()}</div></div>
 <button class="btn" data-act="maqsave">Guardar</button>
 ${mdraft._new?'':`<div class="row" style="margin-top:10px"><button class="btn sec" data-act="maqinsp">＋ Nova inspeção</button><button class="btn sec" data-act="qr">▦ Etiqueta QR</button></div>
 <h2>Inspeções desta máquina (${INS.length})</h2>${INS.map(i=>{const c=counts(i);return`<div class="card insp" data-act="open" data-id="${i.id}"><div><b>${esc(fmtD(i.head.data))}</b><small>${esc(modName(i))}</small><div style="margin-top:6px"><span class="pill">${c.done}/${c.total}</span>${c.nc?`<span class="pill nc">${c.nc} NC</span>`:''}</div></div><span style="font-size:22px;color:var(--mut)">›</span></div>`}).join('')||'<div class="card empty">Ainda sem inspeções.</div>'}
 <button class="btn danger" data-act="maqdel" style="margin-top:20px">Apagar máquina do cadastro</button>`}`;
}
async function saveMachine(){
 const m=mdraft;if(!m.equip&&!m.nint){toast('Preenche o equipamento ou o nº interno');return}
 const dup=(await getAll('machines')).find(x=>x.id!==m.id&&m.nint&&x.nint&&x.nint.toLowerCase()===m.nint.toLowerCase());
 if(dup&&!confirm('Já existe outra máquina com o nº interno '+m.nint+'. Guardar na mesma?'))return;
 const o={...m};delete o._new;await put('machines',o);toast('Máquina guardada');
 if(m._new){mdraft={...o,blocks:[...o.blocks]};INS=[];renderMachine()}else history.back();
}
const qrURL=n=>location.origin+location.pathname+'#maq='+encodeURIComponent(n);
function showQR(){
 const m=mdraft;if(!m.nint){toast('Preenche e guarda o nº interno primeiro');return}
 let svg='';try{const q=qrcode(0,'M');q.addData(qrURL(m.nint));q.make();svg=q.createSvgTag({cellSize:6,margin:2,scalable:true})}catch(e){toast('Não consegui gerar o QR');return}
 closeModal();const o=document.createElement('div');o.className='modal';o.id='qrmodal';
 o.innerHTML=`<div class="qrcard">${svg}<h3>${esc(m.equip||'')}</h3><div>${esc(m.nint)}${m.local?' · '+esc(m.local):''}</div></div><div class="mbar"><button class="btn sm" data-act="qrprint">Imprimir</button><button class="btn sec sm" data-act="mclose">Fechar</button></div>`;document.body.appendChild(o);
}
async function openByNint(n){
 const m=(await getAll('machines')).find(x=>x.nint&&x.nint.toLowerCase()===String(n).toLowerCase());
 if(!m){toast('A máquina '+n+' não está no cadastro deste tablet');return}
 if(cur){clearTimeout(st);await put('insp',cur);cur=null}
 await newScreen(m.id);
}
function handleHash(){const m=/maq=([^&]+)/.exec(location.hash);if(m){const n=decodeURIComponent(m[1]);history.replaceState({v:'home'},'',location.pathname+location.search);openByNint(n)}}
addEventListener('hashchange',handleHash);
async function scanQR(){
 if(!('BarcodeDetector' in window)){toast('Este Chrome não lê QR aqui. Usa a câmara do Android e abre o link.');return}
 closeModal();const o=document.createElement('div');o.className='modal dark';o.innerHTML='<video id="sv" playsinline muted autoplay></video><div class="mbar"><button class="btn sec sm" data-act="mclose">Cancelar</button></div>';document.body.appendChild(o);
 let stream;try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})}catch(e){o.remove();toast('Sem acesso à câmara');return}
 const v=$('#sv',o);v.srcObject=stream;const det=new BarcodeDetector({formats:['qr_code']});let on=true;
 const stop=()=>{on=false;stream.getTracks().forEach(t=>t.stop())};
 new MutationObserver((_,ob)=>{if(!document.body.contains(o)){stop();ob.disconnect()}}).observe(document.body,{childList:true});
 const loop=async()=>{if(!on)return;try{const r=await det.detect(v);if(r.length){const m=/maq=([^&\s]+)/.exec(r[0].rawValue);if(m){o.remove();openByNint(decodeURIComponent(m[1]));return}}}catch(e){}setTimeout(loop,300)};
 v.onloadedmetadata=()=>{v.play();loop()};
}

/* ================= nova inspeção ================= */
let NM=[];
async function newScreen(pre){
 NM=(await getAll('machines')).sort((a,b)=>machName(a).localeCompare(machName(b)));
 if(view==='home')push('new');
 screen('Nova inspeção','',true);
 app.innerHTML=`<div class="card"><label>Máquina do cadastro</label><select id="nmach"><option value="">— Sem cadastro —</option>${NM.map(m=>`<option value="${m.id}" ${m.id===pre?'selected':''}>${esc(machName(m))}</option>`).join('')}</select>
 <div id="nmodw"><label>Tipo de equipamento / módulo técnico</label><select id="nm">${DATA.modules.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div><div id="mdesc" class="mut" style="margin-top:8px"></div></div><button class="btn" data-act="create">Começar</button>`;
 $('#nmach').onchange=$('#nm').onchange=updNew;updNew();
}
function updNew(){
 const mid=$('#nmach').value,mach=mid&&NM.find(x=>x.id===mid);$('#nmodw').hidden=!!mach;
 const m=DATA.modules.find(x=>x.id===(mach?mach.module:$('#nm').value)),n=m.sections.reduce((a,s)=>a+s.items.length,0);
 $('#mdesc').textContent=m.standalone?`Checklist completo e próprio, ${n} itens, sem núcleo geral.`:`Núcleo geral (37 itens) + ${n} itens do módulo${m.multi&&!(mach&&mach.blocks.length)?' (escolhes os blocos que se aplicam)':''}.`;
}
async function findPrev(i){
 if(!i.machineId)return null;
 return(await getAll('insp')).filter(x=>x.machineId===i.machineId&&x.id!==i.id&&x.module===i.module&&x.created<i.created).sort((a,b)=>b.created-a.created)[0]||null;
}
async function createInsp(){
 const mid=$('#nmach').value,mach=mid?NM.find(x=>x.id===mid):null;
 const m=DATA.modules.find(x=>x.id===(mach?mach.module:$('#nm').value));
 const head={empresa:LS.get('empresa','IETA, SA'),morada:LS.get('morada'),data:today(),tecnico:LS.get('tecnico'),contacto:LS.get('contacto','HST & Ambiente'),equip:m.standalone?'Tina de decapagem':''};
 if(mach)MF.forEach(([k])=>head[k]=mach[k]||'');
 cur={id:uid(),created:Date.now(),updated:Date.now(),module:m.id,blocks:mach&&mach.blocks.length?[...mach.blocks]:(m.multi?[]:m.sections.map(s=>s.id)),head,ans:{},nc:{},concl:'',obsGeral:'',sig:'',machineId:mach?mach.id:''};
 await put('insp',cur);photos=[];prev=await findPrev(cur);cf='all';outs={};
 tab=(mach&&(!m.multi||cur.blocks.length))?'check':'dados';view='insp';history.replaceState({v:'insp'},'');renderInsp();
}
async function openInsp(id){
 cur=await get1('insp',id);photos=await photosOf(id);prev=await findPrev(cur);cf='all';outs={};
 tab=Object.keys(cur.ans).length?'check':'dados';if(view==='home')push('insp');else view='insp';renderInsp();
}

/* ================= ecrã da inspeção ================= */
const TABS=[['dados','Dados'],['check','Checklist'],['nc','NCs'],['fim','Concluir']];
function renderInsp(){
 const c=counts(cur);
 screen(cur.head.equip||mod().name,`${c.done}/${c.total}`,true);
 app.innerHTML=`<div class="tabs">${TABS.map(([k,l])=>`<button data-act="tab" data-k="${k}" class="${tab===k?'on':''}">${l}${k==='nc'&&c.nc?` <i>${c.nc}</i>`:''}</button>`).join('')}</div><div id="pane" data-f="${cf}"></div>`;
 ({dados:paneDados,check:paneCheck,nc:paneNC,fim:paneFim})[tab]();window.scrollTo(0,0);
}
function paneDados(){
 const m=mod();
 $('#pane').innerHTML=`<div class="card"><h3>${esc(m.name)}</h3><div class="grid">${HEAD.map(([k,l,t])=>`<div><label>${l}</label><input data-h="${k}" type="${t||'text'}" value="${esc(cur.head[k]||'')}"></div>`).join('')}</div></div>
 ${m.multi?`<div class="card"><h3>Blocos que se aplicam a este equipamento</h3><div class="checks">${m.sections.map(s=>`<label><input type="checkbox" data-blk="${s.id}" ${cur.blocks.includes(s.id)?'checked':''}> ${esc(s.title)} (${s.items.length})</label>`).join('')}</div>${cur.blocks.length?'':'<p class="warn">Escolhe pelo menos um bloco.</p>'}</div>`:''}
 <div class="card"><h3>Cadastro de máquinas</h3><p class="mut">${cur.machineId?'Esta inspeção está ligada ao cadastro.':'Guarda esta máquina no cadastro para a escolheres da próxima vez e veres o histórico.'}</p><button class="btn sec" data-act="savemach">${cur.machineId?'Atualizar cadastro com estes dados':'Guardar no cadastro de máquinas'}</button></div>
 ${m.note?`<div class="card mut" style="font-size:13px">${esc(m.note)}</div>`:''}
 <button class="btn" data-act="tab" data-k="check">Ir para a checklist ›</button>`;
}
async function saveMachFromInsp(){
 const h=cur.head;if(!h.equip&&!h.nint){toast('Preenche o equipamento ou o nº interno');return}
 const all=await getAll('machines');
 let m=cur.machineId?all.find(x=>x.id===cur.machineId):all.find(x=>h.nint&&x.nint&&x.nint.toLowerCase()===h.nint.toLowerCase());
 if(!m)m={id:uid(),created:Date.now()};
 MF.forEach(([k])=>m[k]=h[k]||'');m.module=cur.module;m.blocks=[...cur.blocks];
 await put('machines',m);cur.machineId=m.id;prev=await findPrev(cur);save();toast('Cadastro guardado');paneDados();
}
function prevChip(it){
 if(!prev)return'';const p=prev.ans[it.id];if(!p||!p.r)return'';
 const open=p.r==='NC'&&estadoOf(prev.nc[it.id])!=='Fechada';
 return`<span class="pill ${p.r==='NC'?'nc':p.r==='C'?'ok':''}">Anterior (${esc(fmtD(prev.head.data))}): ${RES[p.r]}${open?' · ação em aberto':''}</span>`;
}
function itemHTML(it){const a=cur.ans[it.id]||{};
 return`<div class="item ${a.r||''}" data-ref="${it.id}" data-r="${a.r||''}"><div class="t"><span class="ref">${it.id}</span><span>${esc(it.text)}</span></div>
 ${prevChip(it)?`<div style="margin:6px 0 0">${prevChip(it)}</div>`:''}
 ${it.hint?`<button class="hintb" data-act="hint">▸ O que verificar</button><div class="hint" hidden>${esc(it.hint)}</div>`:''}
 <div class="seg">${['C','NC','NA'].map(v=>`<button data-act="set" data-v="${v}" class="${a.r===v?'on':''}">${RES[v]}</button>`).join('')}</div>
 <textarea data-obs rows="1" placeholder="Observações">${esc(a.obs||'')}</textarea><div class="photos" data-ref="${it.id}"></div></div>`}
function secCount(s){let d=0;s.items.forEach(it=>{if((cur.ans[it.id]||{}).r)d++});return`${d}/${s.items.length}`}
function paneCheck(){
 const secs=sections(cur);
 if(!secs.length){$('#pane').innerHTML='<p class="warn">Escolhe primeiro os blocos em “Dados”.</p>';return}
 $('#pane').innerHTML=`<div class="chips">${[['all','Todos'],['open','Por responder'],['NC','Só NC']].map(([k,l])=>`<button data-act="filt" data-f="${k}" class="${cf===k?'on':''}">${l}</button>`).join('')}</div>`+
 secs.map((s,k)=>`<div class="secw" data-si="${k}"><div class="sec-h" data-act="sec"><span>${esc(s.title)}</span><span data-sc>${secCount(s)}</span></div><div class="secb"><button class="hintb" data-act="allc" data-si="${k}">✓ Marcar por responder como conforme</button>${s.items.map(itemHTML).join('')}</div></div>`).join('')+
 `<button class="btn" data-act="tab" data-k="nc" style="margin-top:16px">Ver não conformidades ›</button>`;
 allItems(cur).forEach(it=>renderPhotos(it.id));
}
function updCounts(){
 const c=counts(cur);$('#sub').textContent=`${c.done}/${c.total}`;
 sections(cur).forEach((s,k)=>{const e=document.querySelector(`.secw[data-si="${k}"] [data-sc]`);if(e)e.textContent=secCount(s)});
 const t=document.querySelector('.tabs [data-k=nc]');if(t)t.innerHTML='NCs'+(c.nc?` <i>${c.nc}</i>`:'');
}
async function setResult(ref,v,silent){
 const el=document.querySelector(`.item[data-ref="${ref}"]`),a=A(ref);a.r=a.r===v?'':v;
 if(el){el.className='item '+(a.r||'');el.dataset.r=a.r||'';el.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.v===a.r))}
 updCounts();save();
 if(a.r==='C'&&!silent&&prev&&(prev.ans[ref]||{}).r==='NC'&&estadoOf(prev.nc[ref])!=='Fechada'){
  if(confirm(`Na inspeção de ${fmtD(prev.head.data)} este ponto era NC e a ação está em aberto.\nFechar essa ação agora?`)){const n=prev.nc[ref]||(prev.nc[ref]={});n.estado='Fechada';n.fechada=today();await put('insp',prev);toast('Ação anterior fechada');const el2=document.querySelector(`.item[data-ref="${ref}"]`);if(el2){const ch=el2.querySelector('.pill');if(ch&&ch.textContent.startsWith('Anterior'))ch.textContent=ch.textContent.replace(' · ação em aberto','')}}
 }
}
function paneNC(){
 const items=allItems(cur).filter(it=>(cur.ans[it.id]||{}).r==='NC');
 if(!items.length){$('#pane').innerHTML='<div class="card empty">Sem não conformidades assinaladas. 🎉</div><button class="btn" data-act="tab" data-k="fim">Concluir ›</button>';return}
 $('#pane').innerHTML=items.map(it=>{const n=cur.nc[it.id]||{};const r=risk(n.grav,n.prob);
  return`<div class="card" data-ref="${it.id}"><h3>NC · ${it.id}</h3><div class="mut" style="font-size:14px">${esc(it.text)}</div>
  <label>Situação perigosa identificada</label><textarea data-nc="sit">${esc(n.sit??it.text)}</textarea>
  <div class="grid"><div><label>Gravidade</label><select data-nc="grav"><option value="">—</option>${GRAV.map(g=>`<option ${n.grav===g?'selected':''}>${g}</option>`).join('')}</select></div>
  <div><label>Probabilidade</label><select data-nc="prob"><option value="">—</option>${PROB.map(([k,l])=>`<option value="${k}" ${n.prob===k?'selected':''}>${l} (${k})</option>`).join('')}</select></div></div>
  <p style="margin:10px 0 0">Nível de risco: <span class="nr ${r}" data-nr>${r||'—'}</span></p>
  <label>Recomendação</label><textarea data-nc="rec">${esc(n.rec||'')}</textarea>
  <div class="grid"><div><label>Responsável pela ação</label><input data-nc="resp" value="${esc(n.resp||'')}"></div><div><label>Prazo</label><input type="date" data-nc="prazo" value="${esc(n.prazo||'')}"></div><div><label>Estado</label><select data-nc="estado">${ESTADOS.map(s=>`<option ${estadoOf(n)===s?'selected':''}>${s}</option>`).join('')}</select></div></div>
  ${(cur.ans[it.id].obs)?`<div class="mut" style="font-size:13px;margin-top:8px">Obs.: ${esc(cur.ans[it.id].obs)}</div>`:''}
  <div class="photos" data-ref="${it.id}"></div>${photos.some(p=>p.ref===it.id)?'':'<div class="warn" style="margin-top:6px">Sem foto de evidência.</div>'}</div>`}).join('')+`<button class="btn" data-act="tab" data-k="fim">Concluir ›</button>`;
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
 <div class="card"><h3>Assinatura do técnico verificador</h3><p class="mut" style="margin:0 0 8px">${esc(cur.head.tecnico||'(preenche o técnico em “Dados”)')}</p><canvas id="sig"></canvas><button class="btn sec sm" id="sigclr" style="margin-top:8px">Limpar assinatura</button></div>
 <div class="card"><h3>Relatório</h3><div class="row"><button class="btn" data-act="gen" data-k="d">Gerar Word</button><button class="btn sec" data-act="gen" data-k="x">Gerar Excel</button></div><div id="xlout" style="margin-top:12px"></div></div>`;
 initSig();showOuts();
}
function initSig(){
 const cv=$('#sig');if(!cv)return;const r=cv.getBoundingClientRect();cv.width=Math.round(r.width*2);cv.height=Math.round(r.height*2);
 const c=cv.getContext('2d');c.scale(2,2);c.lineWidth=2.4;c.lineCap=c.lineJoin='round';c.strokeStyle='#111';
 if(cur.sig){const im=new Image();im.onload=()=>c.drawImage(im,0,0,r.width,r.height);im.src=cur.sig}
 let d=false,last;const p=e=>{const b=cv.getBoundingClientRect();return[e.clientX-b.left,e.clientY-b.top]};
 cv.onpointerdown=e=>{d=true;cv.setPointerCapture(e.pointerId);last=p(e);c.beginPath();c.moveTo(last[0],last[1]);c.lineTo(last[0]+.1,last[1]);c.stroke()};
 cv.onpointermove=e=>{if(!d)return;const q=p(e);c.beginPath();c.moveTo(last[0],last[1]);c.lineTo(q[0],q[1]);c.stroke();last=q};
 cv.onpointerup=cv.onpointercancel=()=>{if(!d)return;d=false;cur.sig=cv.toDataURL('image/png');save()};
 $('#sigclr').onclick=()=>{c.clearRect(0,0,r.width,r.height);cur.sig='';save()};
}
function showOuts(){
 const el=$('#xlout');if(!el)return;
 el.innerHTML=Object.entries(outs).map(([k,o])=>`<div class="outrow"><div>✔ <b>${esc(o.name)}</b> <small>(${(o.blob.size/1048576).toFixed(1)} MB)</small></div><div class="row"><button class="btn sm" data-act="share" data-k="${k}">Partilhar</button><button class="btn sec sm" data-act="dl" data-k="${k}">Descarregar</button></div></div>`).join('');
}
const fbase=()=>{const h=cur.head;return('Inspecao_'+[h.equip,h.nint,h.data].filter(Boolean).join('_')).replace(/[^\w\-]+/g,'_').replace(/_+/g,'_')};
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000)}

/* ================= eventos ================= */
app.addEventListener('click',async e=>{
 const t=e.target.closest('[data-act]');if(!t)return;const act=t.dataset.act;
 if(act==='new')newScreen();
 else if(act==='scan')scanQR();
 else if(act==='create')createInsp();
 else if(act==='open')openInsp(t.dataset.id);
 else if(act==='delinsp'){e.stopPropagation();if(confirm('Apagar esta inspeção e as fotos?')){const ps=await photosOf(t.dataset.id);for(const p of ps)await del('photos',p.id);await del('insp',t.dataset.id);renderHome()}}
 else if(act==='maqnew')machineScreen(null);
 else if(act==='maqopen')machineScreen(t.dataset.id);
 else if(act==='maqsave')saveMachine();
 else if(act==='maqinsp')newScreen(mdraft.id);
 else if(act==='maqdel'){if(confirm('Apagar esta máquina do cadastro? As inspeções já feitas ficam guardadas.')){await del('machines',mdraft.id);toast('Máquina apagada');history.back()}}
 else if(act==='qr')showQR();
 else if(act==='afilt'){LS.set('afilt',t.dataset.f);homeAcoes()}
 else if(act==='actopen'){const r=ACT[+t.dataset.ai];await openInsp(r.i.id);tab='nc';renderInsp()}
 else if(act==='tab'){if(tab==='dados'&&mod().multi&&!cur.blocks.length&&t.dataset.k!=='dados'){toast('Escolhe pelo menos um bloco');return}tab=t.dataset.k;renderInsp()}
 else if(act==='hint'){const h=t.nextElementSibling;h.hidden=!h.hidden}
 else if(act==='sec'){const b=t.nextElementSibling;b.hidden=!b.hidden}
 else if(act==='set')setResult(t.closest('.item').dataset.ref,t.dataset.v);
 else if(act==='allc'){const s=sections(cur)[+t.dataset.si];const todo=s.items.filter(it=>!(cur.ans[it.id]||{}).r);
  if(!todo.length){toast('Nada por responder nesta secção');return}
  if(confirm(`Marcar ${todo.length} item(ns) por responder como CONFORME?\nConfirma que os verificaste.`))for(const it of todo)await setResult(it.id,'C',true)}
 else if(act==='filt'){cf=t.dataset.f;$('#pane').dataset.f=cf;document.querySelectorAll('.chips button').forEach(b=>b.classList.toggle('on',b.dataset.f===cf))}
 else if(act==='savemach')saveMachFromInsp();
 else if(act==='view')viewPhoto(t.dataset.pid);
 else if(act==='delp'){if(confirm('Remover esta foto?')){const p=photos.find(x=>x.id===t.dataset.pid);await del('photos',p.id);photos=photos.filter(x=>x!==p);outs={};renderPhotos(p.ref)}}
 else if(act==='gen'){const k=t.dataset.k,lab=t.textContent;t.disabled=true;t.textContent='A gerar…';
  try{const c=counts(cur);if(c.done<c.total&&!confirm(`Faltam ${c.total-c.done} itens por responder. Gerar mesmo assim?`))return;
   clearTimeout(st);await put('insp',cur);
   const blob=k==='d'?await buildDocx(cur,photos):await buildXlsx(cur,photos);
   outs[k]={blob,name:fbase()+(k==='d'?'.docx':'.xlsx')};showOuts()}
  catch(err){console.error(err);toast('Erro a gerar o ficheiro')}finally{t.disabled=false;t.textContent=lab}}
 else if(act==='share'){const o=outs[t.dataset.k];const f=new File([o.blob],o.name,{type:o.blob.type});
  if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:o.name})}catch(err){if(err.name!=='AbortError')download(o.blob,o.name)}}else download(o.blob,o.name)}
 else if(act==='dl'){const o=outs[t.dataset.k];download(o.blob,o.name)}
 else if(act==='hist'){t.disabled=true;try{download(await buildHistory(),`Historico_Inspecoes_${today()}.xlsx`)}finally{t.disabled=false}}
 else if(act==='logoclr'){await del('settings','logo');SET.logo=null;paintLogo();homeMais()}
 else if(act==='bkexp'){t.disabled=true;try{await exportBackup()}finally{t.disabled=false}}
});
document.addEventListener('click',e=>{
 const t=e.target.closest('.modal [data-act]');if(!t)return;
 const a=t.dataset.act;
 if(a==='mclose')closeModal();else if(a==='mark')markPhoto(t.dataset.pid);
 else if(a==='qrprint')window.print();
});
$('#nav').addEventListener('click',e=>{const b=e.target.closest('[data-t]');if(b){homeTab=b.dataset.t;renderHome()}});
app.addEventListener('input',e=>{const t=e.target;
 if(t.dataset.h){cur.head[t.dataset.h]=t.value;if(t.dataset.h==='tecnico')LS.set('tecnico',t.value);if(t.dataset.h==='contacto')LS.set('contacto',t.value);if(t.dataset.h==='empresa')LS.set('empresa',t.value);if(t.dataset.h==='morada')LS.set('morada',t.value);if(t.dataset.h==='equip')$('#title').textContent=t.value||mod().name;save()}
 else if(t.dataset.obs!==undefined){A(t.closest('.item').dataset.ref).obs=t.value;save()}
 else if(t.dataset.nc){const ref=t.closest('[data-ref]').dataset.ref;NCo(ref)[t.dataset.nc]=t.value;
  if(t.dataset.nc==='grav'||t.dataset.nc==='prob'){const n=cur.nc[ref],r=risk(n.grav,n.prob),el=t.closest('.card').querySelector('[data-nr]');el.textContent=r||'—';el.className='nr '+r}save()}
 else if(t.dataset.og!==undefined){cur.obsGeral=t.value;save()}
 else if(t.dataset.mf){mdraft[t.dataset.mf]=t.value}
 else if(t.dataset.set){const k=t.dataset.set;LS.set(k,t.value);if(k==='tema')applyTheme()}
 else if(t.id==='q')drawMaq(t.value);
});
app.addEventListener('change',async e=>{const t=e.target;
 if(t.dataset.add){const f=[...t.files];t.value='';await addPhotos(f,t.dataset.add)}
 else if(t.dataset.blk){const b=t.dataset.blk;cur.blocks=t.checked?[...new Set([...cur.blocks,b])]:cur.blocks.filter(x=>x!==b);save();paneDados()}
 else if(t.dataset.concl){cur.concl=t.dataset.concl;save();paneFim()}
 else if(t.dataset.mmod!==undefined){mdraft.module=t.value;const m=DATA.modules.find(x=>x.id===t.value);mdraft.blocks=m.multi?[]:m.sections.map(s=>s.id);$('#mblk').innerHTML=blocksHTML()}
 else if(t.dataset.mblk){const b=t.dataset.mblk;mdraft.blocks=t.checked?[...new Set([...mdraft.blocks,b])]:mdraft.blocks.filter(x=>x!==b)}
 else if(t.dataset.ax){const r=ACT[+t.dataset.ai];const n=r.i.nc[r.it.id]||(r.i.nc[r.it.id]={});n[t.dataset.ax]=t.value;if(t.dataset.ax==='estado'&&t.value==='Fechada')n.fechada=today();r.i.updated=Date.now();await put('insp',r.i);if(t.dataset.ax==='estado')homeAcoes()}
 else if(t.dataset.logo!==undefined&&t.files[0]){try{SET.logo=await fileToLogo(t.files[0]);await put('settings',SET.logo);paintLogo();homeMais()}catch(err){toast('Não consegui ler a imagem')}}
 else if(t.dataset.bkimp!==undefined&&t.files[0]){await importBackup(t.files[0]);t.value=''}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&cur){clearTimeout(st);put('insp',cur)}});

/* ================= cópia de segurança ================= */
const toData=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b)});
async function exportBackup(){
 const insp=await getAll('insp'),machines=await getAll('machines'),ph=await getAll('photos'),logo=await get1('settings','logo');
 const photosO=[];for(const p of ph)photosO.push({...p,blob:await toData(p.blob)});
 download(new Blob([JSON.stringify({app:'ieta-insp',v:2,date:new Date().toISOString(),insp,machines,photos:photosO,logo:logo||null})],{type:'application/json'}),`Copia_Seguranca_Inspecoes_${today()}.json`);
}
async function importBackup(file){
 let d;try{d=JSON.parse(await file.text())}catch(e){toast('Ficheiro inválido');return}
 if(d.app!=='ieta-insp'||!Array.isArray(d.insp)||!Array.isArray(d.machines)||!Array.isArray(d.photos)){toast('Este ficheiro não é uma cópia desta app');return}
 const okId=x=>typeof x==='string'&&/^[a-z0-9]{3,40}$/.test(x),okImg=x=>typeof x==='string'&&/^data:image\/(jpeg|png);base64,/.test(x);
 d.insp=d.insp.filter(i=>i&&okId(i.id)&&DATA.modules.some(m=>m.id===i.module)&&i.head&&i.ans&&i.nc);
 d.machines=d.machines.filter(m=>m&&okId(m.id));
 d.photos=d.photos.filter(p=>p&&okId(p.id)&&okId(p.inspId)&&/^[A-Z]\.\d+$/.test(p.ref)&&okImg(p.blob));
 if(d.logo&&!okImg(d.logo.data))d.logo=null;
 if(!confirm(`Importar ${d.insp.length} inspeções, ${d.machines.length} máquinas e ${d.photos.length} fotos?\nO que tiver o mesmo identificador é substituído.`))return;
 for(const m of d.machines)await put('machines',m);for(const i of d.insp)await put('insp',i);
 for(const p of d.photos){const b=await(await fetch(p.blob)).blob();await put('photos',{...p,blob:b})}
 if(d.logo){await put('settings',d.logo);SET.logo=d.logo;paintLogo()}
 toast('Cópia restaurada');homeMais();
}

/* ================= Excel: uma inspeção ================= */
const XT={style:'thin',color:{argb:'FFBBC4CE'}},XB={top:XT,left:XT,bottom:XT,right:XT};
const NAVY='FF16324F';
function hdr(row){row.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};c.alignment={vertical:'middle',horizontal:'center',wrapText:true};c.border=XB})}
const fill=a=>({type:'pattern',pattern:'solid',fgColor:{argb:a}});
const RISKC={Alto:'FFE06060','Médio':'FFF2A33A',Baixo:'FFF5DF6B','Desprezável':'FFA8DDB8'};
const fit=(w,h,bw,bh)=>{const k=Math.min(bw/w,bh/h);return{width:Math.round(w*k),height:Math.round(h*k)}};
const XLSX_T='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function dataDims(url){const b=await(await fetch(url)).blob();const bm=await createImageBitmap(b);return{blob:b,w:bm.width,h:bm.height}}
async function buildXlsx(i,phs){
 const wb=new ExcelJS.Workbook();wb.creator='HST & Ambiente';wb.created=new Date();
 const items=allItems(i),c=counts(i,items),h=i.head,tipo=modName(i);
 const r=wb.addWorksheet('Resumo');r.columns=[{width:30},{width:42},{width:26},{width:34},{width:14}];
 r.mergeCells('A1:D1');r.getCell('A1').value='CHECKLIST DE SEGURANÇA DE EQUIPAMENTOS DE TRABALHO — DL 50/2005';r.getCell('A1').font={bold:true,size:14,color:{argb:'FFFFFFFF'}};r.getCell('A1').fill=fill(NAVY);r.getRow(1).height=28;r.getCell('A1').alignment={vertical:'middle'};
 [['Designação',h.empresa,'Nº processo',h.processo],['Morada',h.morada,'Data da verificação',h.data],['Contacto',h.contacto,'Técnico responsável',h.tecnico],[],['Equipamento',h.equip,'Nº interno',h.nint],['Fabricante',h.fab,'Nº série',h.nserie],['Modelo',h.modelo,'Ano de fabrico',h.ano],['Tipo / módulo técnico',tipo,'Local',h.local],['Marcação CE',h.ce,'Capacidade / potência',h.cap]].forEach(x=>{const row=r.addRow(x);[1,3].forEach(k=>{row.getCell(k).font={bold:true};row.getCell(k).fill=fill('FFE8EDF3')});row.eachCell(cc=>{cc.border=XB;cc.alignment={wrapText:true,vertical:'top'}})});
 r.addRow([]);const rr=r.addRow(['Resultados','Conformes: '+c.c,'Não conformes: '+c.nc,'N/A: '+c.na+'  ·  Por responder: '+(c.total-c.done)]);rr.eachCell(cc=>{cc.font={bold:true};cc.border=XB});
 r.addRow([]);const cn=r.addRow(['Conclusão',i.concl==='CUMPRE'?'CUMPRE os requisitos mínimos de segurança aplicáveis':i.concl==='NAO'?'NÃO CUMPRE os requisitos mínimos de segurança aplicáveis':'(por preencher)']);
 cn.getCell(1).font={bold:true};cn.getCell(2).font={bold:true,color:{argb:i.concl==='NAO'?'FFC62F2F':'FF1D8A55'}};r.mergeCells(cn.number,2,cn.number,4);
 if(i.obsGeral){const o=r.addRow(['Observações gerais',i.obsGeral]);r.mergeCells(o.number,2,o.number,4);o.getCell(2).alignment={wrapText:true,vertical:'top'};o.height=Math.max(30,15*Math.ceil(i.obsGeral.length/80))}
 const sg=r.addRow(['Técnico verificador',h.tecnico||'']);r.mergeCells(sg.number,2,sg.number,4);sg.getCell(1).font={bold:true};
 let sigRow=null;if(i.sig){sigRow=r.addRow(['Assinatura','']);sigRow.height=66;sigRow.getCell(1).font={bold:true}}
 r.addRow([]);const mh=r.addRow(['Matriz de risco','Catastrófico','Sério','Moderado','Menor']);hdr(mh);
 PROB.forEach(([k,l])=>{const row=r.addRow([l,...MATRIX[k]]);row.getCell(1).font={bold:true};row.eachCell((cc,n)=>{cc.border=XB;if(n>1){cc.fill=fill(RISKC[cc.value]);cc.alignment={horizontal:'center'}}})});
 const w=wb.addWorksheet('Checklist',{views:[{state:'frozen',ySplit:1}]});
 w.columns=[{header:'Ref.',width:7},{header:'Requisito / item a verificar',width:70},{header:'C',width:6},{header:'NC',width:6},{header:'N/A',width:6},{header:'Observações',width:46},{header:'Fotos',width:7}];hdr(w.getRow(1));
 let last='';
 items.forEach(it=>{if(it.sec!==last){last=it.sec;const sr=w.addRow([it.sec]);w.mergeCells(sr.number,1,sr.number,7);sr.getCell(1).font={bold:true};sr.getCell(1).fill=fill('FFD7E1EC')}
  const a=i.ans[it.id]||{};const row=w.addRow([it.id,it.text,a.r==='C'?'X':'',a.r==='NC'?'X':'',a.r==='NA'?'X':'',a.obs||'',phs.filter(p=>p.ref===it.id).length||'']);
  row.eachCell(cc=>{cc.border=XB;cc.alignment={wrapText:true,vertical:'top'}});[3,4,5,7].forEach(k=>row.getCell(k).alignment={horizontal:'center',vertical:'top'});
  if(a.r==='C')row.getCell(3).fill=fill('FFDFF3E8');if(a.r==='NC'){row.getCell(4).fill=fill('FFFBE1E1');row.getCell(4).font={bold:true,color:{argb:'FFC62F2F'}}}if(a.r==='NA')row.getCell(5).fill=fill('FFE8EBF0')});
 w.autoFilter={from:'A1',to:'G1'};
 const imgId={};for(const p of phs)imgId[p.id]=wb.addImage({buffer:await p.blob.arrayBuffer(),extension:'jpeg'});
 if(sigRow){const d=await dataDims(i.sig);const id=wb.addImage({buffer:await d.blob.arrayBuffer(),extension:'png'});r.addImage(id,{tl:{col:1.05,row:sigRow.number-1+.05},ext:fit(d.w,d.h,220,80)})}
 const ncs=items.filter(it=>(i.ans[it.id]||{}).r==='NC');
 const n=wb.addWorksheet('Não conformidades',{views:[{state:'frozen',ySplit:1}]});
 n.columns=[{header:'NC',width:5},{header:'Ref.',width:7},{header:'Situação perigosa identificada',width:38},{header:'Gravidade',width:13},{header:'Probabilidade',width:14},{header:'NR',width:13},{header:'Recomendação',width:34},{header:'Responsável',width:16},{header:'Prazo',width:12},{header:'Estado',width:11},{header:'Foto 1',width:24},{header:'Foto 2',width:24},{header:'Foto 3',width:24}];hdr(n.getRow(1));
 ncs.forEach((it,k)=>{const x=i.nc[it.id]||{};const pr=PROB.find(q=>q[0]===x.prob);const rk=risk(x.grav,x.prob);const ps=phs.filter(p=>p.ref===it.id);
  const row=n.addRow([k+1,it.id,x.sit??it.text,x.grav||'',pr?pr[1]:'',rk,x.rec||'',x.resp||'',fmtD(x.prazo),estadoOf(x),ps.length>3?'(+'+(ps.length-3)+' na folha Fotos)':'','','']);
  row.height=ps.length?100:40;row.eachCell(cc=>{cc.border=XB;cc.alignment={wrapText:true,vertical:'top'}});if(rk){row.getCell(6).fill=fill(RISKC[rk]);row.getCell(6).font={bold:true}}
  ps.slice(0,3).forEach((p,q)=>{n.addImage(imgId[p.id],{tl:{col:10+q+.04,row:row.number-1+.04},ext:fit(p.w,p.h,165,125)})})});
 if(!ncs.length)n.addRow(['','Sem não conformidades.']);
 if(phs.length){const f=wb.addWorksheet('Fotos');f.columns=[{header:'Ref.',width:8},{header:'Item',width:50},{header:'Foto',width:52}];hdr(f.getRow(1));
  const order=items.map(x=>x.id);
  [...phs].sort((a,b)=>order.indexOf(a.ref)-order.indexOf(b.ref)||a.ts-b.ts).forEach(p=>{const it=items.find(x=>x.id===p.ref);const row=f.addRow([p.ref,it?it.text:'','']);
   row.height=190;row.eachCell(cc=>{cc.border=XB;cc.alignment={wrapText:true,vertical:'top'}});f.addImage(imgId[p.id],{tl:{col:2.04,row:row.number-1+.04},ext:fit(p.w,p.h,340,250)})})}
 return new Blob([await wb.xlsx.writeBuffer()],{type:XLSX_T});
}
async function buildHistory(){
 const list=(await getAll('insp')).sort((a,b)=>(a.head.data||'').localeCompare(b.head.data||''));const phs=await getAll('photos');
 const wb=new ExcelJS.Workbook();const s=wb.addWorksheet('Inspeções',{views:[{state:'frozen',ySplit:1}]});
 s.columns=['Data','Nº processo','Equipamento','Nº interno','Fabricante','Modelo','Nº série','Local','Módulo','Técnico','Conclusão','Conformes','Não conformes','N/A','Por responder'].map(x=>({header:x,width:16}));hdr(s.getRow(1));
 const d=wb.addWorksheet('Itens',{views:[{state:'frozen',ySplit:1}]});
 d.columns=['Data','Nº processo','Equipamento','Nº interno','Local','Módulo','Ref.','Secção','Requisito','Resultado','Observações','Nº fotos','Situação perigosa','Gravidade','Probabilidade','Nível de risco','Recomendação','Responsável','Prazo','Estado da ação'].map((x,k)=>({header:x,width:[12,12,22,12,16,22,7,30,60,14,36,8,40,13,14,13,40,16,12,13][k]}));hdr(d.getRow(1));
 for(const i of list){const h=i.head,items=allItems(i),c=counts(i,items);
  s.addRow([h.data,h.processo,h.equip,h.nint,h.fab,h.modelo,h.nserie,h.local,mod(i).name,h.tecnico,i.concl==='CUMPRE'?'Cumpre':i.concl==='NAO'?'Não cumpre':'',c.c,c.nc,c.na,c.total-c.done]);
  items.forEach(it=>{const a=i.ans[it.id]||{},x=i.nc[it.id]||{},pr=PROB.find(q=>q[0]===x.prob);const nc=a.r==='NC';
   d.addRow([h.data,h.processo,h.equip,h.nint,h.local,mod(i).name,it.id,it.sec,it.text,RES[a.r]||'',a.obs||'',phs.filter(p=>p.inspId===i.id&&p.ref===it.id).length||'',nc?(x.sit??it.text):'',nc?x.grav||'':'',nc&&pr?pr[1]:'',nc?risk(x.grav,x.prob):'',nc?x.rec||'':'',nc?x.resp||'':'',nc?fmtD(x.prazo):'',nc?estadoOf(x):'']).eachCell(cc=>cc.alignment={wrapText:true,vertical:'top'})})}
 d.autoFilter={from:'A1',to:'T1'};s.autoFilter={from:'A1',to:'O1'};
 return new Blob([await wb.xlsx.writeBuffer()],{type:XLSX_T});
}

/* ================= Word: relatório ================= */
async function buildDocx(i,phs){
 const{Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,ShadingType,AlignmentType,ImageRun,Header,Footer,PageNumber,VerticalAlign}=docx;
 const F='Times New Roman',W=9638,G1='D9D9D9',G2='F2F2F2';
 const m=mod(i),h=i.head,items=allItems(i),c=counts(i,items),secs=sections(i);
 const run=(t,o={})=>new TextRun({text:String(t??''),font:F,size:o.size||20,bold:o.b,italics:o.i,color:o.color});
 const para=(t,o={})=>new Paragraph({children:Array.isArray(t)?t:[run(t,o)],alignment:o.al,spacing:{before:o.before||0,after:o.after??40},keepNext:o.keepNext});
 const cell=(ch,w,o={})=>new TableCell({children:Array.isArray(ch)?ch:[ch],width:{size:w,type:WidthType.DXA},columnSpan:o.span,shading:o.fill?{type:ShadingType.CLEAR,color:'auto',fill:o.fill}:undefined,verticalAlign:o.va||VerticalAlign.CENTER,margins:{top:50,bottom:50,left:90,right:90}});
 const tbl=(ws,rows)=>new Table({width:{size:W,type:WidthType.DXA},columnWidths:ws,rows});
 const row=(cells,o={})=>new TableRow({children:cells,cantSplit:true,tableHeader:o.header});
 const h2=t=>para(t,{b:true,size:24,before:260,after:100,keepNext:true});
 const lab=(t,w)=>cell(para(t,{b:true}),w,{fill:G1}),val=(t,w)=>cell(para(t),w);
 const gap=()=>para('',{after:60});
 const bytes=async b=>new Uint8Array(await b.arrayBuffer());
 const img=async(p,bw,bh)=>new ImageRun({data:await bytes(p.blob),transformation:fit(p.w,p.h,bw,bh)});
 const BOX=n=>n?'☒':'☐';
 const box=(t,o={})=>run(t,{...o});
 const ncItems=items.filter(it=>(i.ans[it.id]||{}).r==='NC'),ncNum={};ncItems.forEach((it,k)=>ncNum[it.id]=k+1);
 const standalone=m.id==='decapagem';
 const ch=[];
 // título
 ch.push(para('CHECKLIST DE SEGURANÇA DE EQUIPAMENTOS DE TRABALHO',{b:true,size:28,al:AlignmentType.CENTER,after:60}));
 ch.push(para(m.standalone?m.name.toUpperCase():'NÚCLEO GERAL + '+modName(i).toUpperCase(),{b:true,size:22,al:AlignmentType.CENTER,after:60}));
 ch.push(para(standalone?`Avaliação das condições de segurança — risco químico | ${h.empresa||''}`:`Verificação das condições mínimas de segurança | D.L. 50/2005 de 25 de fevereiro | ${h.empresa||''}`,{b:true,size:18,al:AlignmentType.CENTER,after:160}));
 // 1 e 2
 ch.push(h2('1 — IDENTIFICAÇÃO DO CLIENTE'));
 const w4=[1700,3119,1900,2919];
 ch.push(tbl(w4,[[ 'Designação',h.empresa,'Nº processo',h.processo],['Morada',h.morada,'Data da verificação',fmtD(h.data)],['Contacto',h.contacto,'Técnico responsável',h.tecnico]].map(r=>row([lab(r[0],w4[0]),val(r[1],w4[1]),lab(r[2],w4[2]),val(r[3],w4[3])]))));
 ch.push(h2('2 — IDENTIFICAÇÃO DO EQUIPAMENTO'));
 ch.push(tbl(w4,[['Equipamento',h.equip,'Nº interno',h.nint],['Fabricante',h.fab,'Nº série',h.nserie],['Modelo',h.modelo,'Ano de fabrico',h.ano],['Tipo de equipamento / módulo técnico',modName(i),'Local',h.local],['Marcação CE',h.ce,'Capacidade / potência',h.cap]].map(r=>row([lab(r[0],w4[0]),val(r[1],w4[1]),lab(r[2],w4[2]),val(r[3],w4[3])]))));
 // 3 checklist
 ch.push(h2(standalone?'3 — REQUISITOS A VERIFICAR':'3 — REQUISITOS (DL 50/2005, Anexo I e módulo técnico)'));
 ch.push(para('Legenda: C = Conforme   NC = Não Conforme   NA = Não Aplicável',{i:true,size:18,after:80}));
 const cw=[4700,500,560,500,3378];
 const rows=[row([lab('Requisito / item a verificar',cw[0]),lab('C',cw[1]),lab('NC',cw[2]),lab('NA',cw[3]),lab('Observações',cw[4])],{header:true})];
 for(const s of secs){
  rows.push(row([cell(para(s.title,{b:true}),W,{span:5,fill:G2})]));
  for(const it of s.items){const a=i.ans[it.id]||{};const hasPh=phs.some(p=>p.ref===it.id);
   const obs=[];if(a.obs)obs.push(a.obs);if(a.r==='NC')obs.push(`→ ver NC n.º ${ncNum[it.id]}`);else if(hasPh)obs.push('(ver anexo fotográfico)');
   const mk=(v)=>cell(para(BOX(a.r===v),{al:AlignmentType.CENTER,size:22}),cw[v==='C'?1:v==='NC'?2:3],{fill:a.r===v&&v==='NC'?'FBE1E1':undefined});
   rows.push(row([cell(para([run(it.id+'  ',{b:true,size:19}),run(it.text,{size:19})]),cw[0]),mk('C'),mk('NC'),mk('NA'),cell(obs.map(t=>para(t,{size:18})),cw[4])]));
  }}
 ch.push(tbl(cw,rows));
 // 4 NCs
 ch.push(h2('4 — NÃO CONFORMIDADES IDENTIFICADAS — DETALHE'));
 if(!ncItems.length)ch.push(para('Não foram identificadas não conformidades.',{i:true}));
 const w2=[2300,7338];
 for(const it of ncItems){
  const x=i.nc[it.id]||{},a=i.ans[it.id]||{},pr=PROB.find(q=>q[0]===x.prob),rk=risk(x.grav,x.prob),ps=phs.filter(p=>p.ref===it.id);
  const r=[row([cell(para(`NC ${ncNum[it.id]} — ${it.id}`,{b:true}),W,{span:2,fill:G1})]),
   row([lab('Requisito',w2[0]),val(it.text,w2[1])]),row([lab('Situação perigosa identificada',w2[0]),val(x.sit??it.text,w2[1])]),
   row([lab('Gravidade / Probabilidade / Nível de risco',w2[0]),val(`${x.grav||'—'}  /  ${pr?pr[1]:'—'}  /  ${rk||'—'}`,w2[1])]),
   row([lab('Recomendação',w2[0]),val(x.rec||'—',w2[1])]),
   row([lab('Responsável · Prazo · Estado',w2[0]),val(`${x.resp||'—'}  ·  ${x.prazo?fmtD(x.prazo):'—'}  ·  ${estadoOf(x)}`,w2[1])])];
  if(a.obs)r.push(row([lab('Observações',w2[0]),val(a.obs,w2[1])]));
  const pc=[];if(ps.length){const runs=[];for(const p of ps){runs.push(await img(p,235,176));runs.push(run('  '))}pc.push(new Paragraph({children:runs,spacing:{after:40}}))}else pc.push(para('Sem fotografia de evidência.',{i:true}));
  r.push(new TableRow({children:[lab('Fotografia / evidência',w2[0]),cell(pc,w2[1])],cantSplit:true}));
  ch.push(tbl(w2,r));ch.push(gap());
 }
 // 5 conclusões
 ch.push(h2('5 — CONCLUSÕES'));
 ch.push(para([run(BOX(i.concl==='CUMPRE')+'  ',{size:22}),run('Com base nas constatações efetuadas, o equipamento CUMPRE os requisitos mínimos de segurança aplicáveis.')],{after:80}));
 ch.push(para([run(BOX(i.concl==='NAO')+'  ',{size:22}),run('Com base nas constatações efetuadas, o equipamento NÃO CUMPRE os requisitos mínimos de segurança aplicáveis.')],{after:100}));
 ch.push(para(`Resumo: ${c.c} conformes · ${c.nc} não conformes · ${c.na} não aplicáveis${c.total-c.done?` · ${c.total-c.done} por verificar`:''}.`,{size:18,i:true,after:100}));
 if(i.obsGeral)ch.push(para([run('Observações gerais: ',{b:true}),run(i.obsGeral)],{after:100}));
 let sigPara=para('');
 if(i.sig){const d=await dataDims(i.sig);sigPara=new Paragraph({children:[new ImageRun({data:await bytes(d.blob),transformation:fit(d.w,d.h,190,64)})]})}
 ch.push(tbl([2000,2800,1700,3138],[row([lab('Técnico verificador',2000),val(h.tecnico,2800),lab('Assinatura',1700),cell(sigPara,3138)]),row([lab('Data do relatório',2000),val(fmtD(h.data),2800),cell(para(''),1700),cell(para(''),3138)])]));
 // matriz
 ch.push(h2('MATRIZ DE RISCO'));
 const RC={Alto:'F2A5A5','Médio':'F8CF9A',Baixo:'F7EBA0','Desprezável':'BFE5C9'};const mw=[2038,1900,1900,1900,1900];
 ch.push(tbl(mw,[row([lab('Probabilidade',mw[0]),...GRAV.map((g,k)=>lab(g,mw[k+1]))])].concat(PROB.map(([k,l])=>row([lab(l,mw[0]),...MATRIX[k].map((v,j)=>cell(para(v,{al:AlignmentType.CENTER}),mw[j+1],{fill:RC[v]}))])))));
 // anexo
 const rest=phs.filter(p=>!ncNum[p.ref]).sort((a,b)=>items.findIndex(x=>x.id===a.ref)-items.findIndex(x=>x.id===b.ref)||a.ts-b.ts);
 if(rest.length){
  ch.push(h2('ANEXO FOTOGRÁFICO'));const pw=[4819,4819];
  const prs=[];for(let k=0;k<rest.length;k+=2){const cells=[];
   for(let j=0;j<2;j++){const p=rest[k+j];if(!p){cells.push(cell(para(''),pw[j]));continue}const it=items.find(x=>x.id===p.ref);
    cells.push(cell([new Paragraph({children:[await img(p,290,218)],alignment:AlignmentType.CENTER,spacing:{after:40}}),para(`${p.ref}${it?' — '+(it.text.length>90?it.text.slice(0,87)+'…':it.text):''}`,{size:16,al:AlignmentType.CENTER})],pw[j]))}
   prs.push(row(cells))}
  ch.push(tbl(pw,prs));
 }
 // cabeçalho / rodapé
 const hdrKids=[];
 if(SET.logo){const lg=SET.logo;hdrKids.push(new Paragraph({alignment:AlignmentType.RIGHT,children:[new ImageRun({data:await bytes(await(await fetch(lg.data)).blob()),transformation:fit(lg.w,lg.h,150,40)})]}))}
 else hdrKids.push(para(h.empresa||'',{b:true,size:18,al:AlignmentType.RIGHT}));
 const doc=new Document({creator:h.tecnico||'HST & Ambiente',title:`Checklist de segurança — ${inspName(i)}`,
  styles:{default:{document:{run:{font:F,size:20}}}},
  sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1200,right:1134,bottom:1000,left:1134,header:500,footer:450}}},
   headers:{default:new Header({children:hdrKids})},
   footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:`${inspName(i)} — ${fmtD(h.data)}   |   Página `,font:F,size:16}),new TextRun({children:[PageNumber.CURRENT],font:F,size:16}),new TextRun({text:' de ',font:F,size:16}),new TextRun({children:[PageNumber.TOTAL_PAGES],font:F,size:16})]})]})},
   children:ch}]});
 return await Packer.toBlob(doc);
}

/* ================= arranque ================= */
history.replaceState({v:'home'},'');
openDB().then(async()=>{await loadSettings();netState();await renderHome();handleHash();if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()});
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});
