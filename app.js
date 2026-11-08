'use strict';
/* StudyOS — local-first study manager. All data in IndexedDB on this device. */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nl=s=>esc(s).replace(/\n/g,'<br>');
const uid=()=>Math.random().toString(36).slice(2,9);
const today=()=>new Date().toLocaleDateString('en-CA');
const addDays=(d,n)=>{const x=new Date(d+'T00:00');x.setDate(x.getDate()+n);return x.toLocaleDateString('en-CA')};
const fmt=m=>{m=Math.round(m);return m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m}m`};
const mmss=ms=>{const s=Math.ceil(ms/1000),h=Math.floor(s/3600);return (h?h+':':'')+String(Math.floor(s%3600/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
const SUBJ=['Mathematics','Physics','Chemistry','Computer Science','English','Nepali'],STEPS=[1,3,7,14],STATUS=['Not started','Learning','Studied','Mastered'];
let S,F={mode:'idle'},PRE={mins:25,subj:'',chap:'',list:''},UI={day:null},T=null,st,tt;
const V={},act={},chg={};

/* ---------- storage ---------- */
const DB={o:null,open(){return this.o||(this.o=new Promise((res,rej)=>{const r=indexedDB.open('studyos',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}))},
async get(){const d=await this.open();return new Promise((res,rej)=>{const q=d.transaction('kv').objectStore('kv').get('state');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})},
async put(v){const d=await this.open();return new Promise((res,rej)=>{const t=d.transaction('kv','readwrite');t.objectStore('kv').put(v,'state');t.oncomplete=res;t.onerror=()=>rej(t.error)})}};
const flush=()=>{clearTimeout(st);return DB.put(S).catch(e=>toast('Could not save: '+(e.message||e)))};
const save=()=>{clearTimeout(st);st=setTimeout(flush,120)};
const fresh=()=>({v:1,done:false,name:'',goal:'3.80 GPA target',warn:true,lastBackup:null,routine:{weekday:[],weekend:[]},subjects:SUBJ.map(n=>({id:uid(),name:n,chapters:[]})),assign:[],rev:[],focus:[],tests:[],mist:[],quizzes:[],pattern:{}});
function toast(m){const t=$('#toast');t.textContent=m;t.className='show';clearTimeout(tt);tt=setTimeout(()=>t.className='',3000)}

/* ---------- helpers ---------- */
const subjOf=id=>S.subjects.find(s=>s.id===id),subjName=id=>subjOf(id)?.name||'General';
const chapters=()=>S.subjects.flatMap(s=>s.chapters.map(c=>({...c,sn:s.name})));
const chapLabel=cid=>{for(const s of S.subjects){const c=s.chapters.find(c=>c.id===cid);if(c)return s.name+' — '+c.name}return ''};
const getC=(sid,cid)=>{const s=subjOf(sid);return{s,c:s?.chapters.find(c=>c.id===cid)}};
const B=(a,l,cls='',d='')=>`<button class="btn ${cls}" data-a="${a}" ${d}>${l}</button>`;
const bar=p=>`<div class="bar"><i style="width:${Math.max(0,Math.min(100,p))}%"></i></div>`;
const nf=()=>'<h1>Not found</h1><a class="btn" href="#home">Home</a>';
const go=h=>{if(location.hash==='#'+h)render();else location.hash=h};
const dayMin=d=>S.focus.filter(f=>f.date===d).reduce((a,f)=>a+f.sec/60,0);
const streak=()=>{let n=0,d=today();if(dayMin(d)<30)d=addDays(d,-1);while(dayMin(d)>=30){n++;d=addDays(d,-1)}return n};
const revItems=()=>S.rev.map(r=>{const i=r.done.findIndex(d=>!d);return i<0?null:{r,i,due:addDays(r.base,STEPS[i])}}).filter(Boolean);
const endT=s=>{const[h,m]=s.start.split(':').map(Number),e=h*60+m+s.dur;return String(Math.floor(e/60)%24).padStart(2,'0')+':'+String(e%60).padStart(2,'0')};
const patLine=id=>{const p=S.pattern[id];if(!p)return '';const a=[];if(p.total)a.push(p.total+' marks');if(p.mcq)a.push('MCQ '+p.mcq);if(p.short)a.push('Short '+p.short);if(p.long)a.push('Long '+p.long);if(p.mins)a.push(p.mins+' min');if(p.note)a.push(esc(p.note));return a.join(' · ')};
const sample=()=>{const sid=n=>S.subjects.find(s=>s.name===n)?.id||'';const mk=(start,dur,n,task,brk)=>({id:uid(),start,dur,subj:n?sid(n):'',chap:'',task,brk});
return{weekday:[mk('14:00',90,'Mathematics','Fundamentals: definitions and easy examples first',10),mk('15:40',60,'Physics','Concept reading + basic numericals',10),mk('17:00',60,'Chemistry','Concept notes + short questions',10),mk('18:30',60,'Computer Science','Concepts + practice',15),mk('20:00',45,'English','Reading / writing practice',0),mk('20:45',45,'','Revision due today + mistake notebook',0)],
weekend:[mk('07:00',90,'Mathematics','Weak-topic practice',10),mk('09:00',90,'Physics','Concepts + numericals',10),mk('11:00',60,'Chemistry','Notes + questions',10),mk('15:00',60,'Computer Science','Practice',10),mk('16:30',45,'English','Practice',5),mk('17:30',45,'Nepali','Practice',5),mk('18:30',60,'','Weekly review, weekly test, mistake notebook',0)]}};

/* ---------- generic form dialog ---------- */
function form(title,fields,init,onSave,extra='',locked=false){
 const d=$('#dlg');
 d.innerHTML=`<form><h2>${esc(title)}</h2>${extra}${fields.map(f=>{const v=init[f.k]??'',id='f_'+f.k;let i;
  if(f.t==='select')i=`<select id="${id}">${f.o.map(o=>{const[val,lab]=Array.isArray(o)?o:[o,o];return`<option value="${esc(val)}"${String(val)===String(v)?' selected':''}>${esc(lab)}</option>`}).join('')}</select>`;
  else if(f.t==='area')i=`<textarea id="${id}" rows="${f.r||4}" placeholder="${esc(f.p||'')}">${esc(v)}</textarea>`;
  else i=`<input id="${id}" type="${f.t||'text'}" value="${esc(v)}" placeholder="${esc(f.p||'')}"${f.min!=null?` min="${f.min}"`:''}>`;
  return`<label>${esc(f.l)}${i}</label>`}).join('')}<div class="row">${locked?'':'<button type="button" class="btn" id="fc">Cancel</button>'}<button type="submit" class="btn p">Save</button></div></form>`;
 d.oncancel=locked?e=>e.preventDefault():null;
 if(!locked)d.querySelector('#fc').onclick=()=>d.close();
 d.querySelector('form').onsubmit=e=>{e.preventDefault();const o={};for(const f of fields){const el=d.querySelector('#f_'+f.k);o[f.k]=f.t==='number'?(el.value===''?'':Number(el.value)):el.value.trim()}const err=onSave(o);if(err){toast(err);return}d.close()};
 if(!d.open)d.showModal();
}
const subjOpts=(none=true)=>[...(none?[['','— none —']]:[]),...S.subjects.map(s=>[s.id,s.name])];
const chapOpts=()=>[['','— none —'],...chapters().map(c=>[c.id,c.sn+' — '+c.name])];

/* ---------- views ---------- */
const sessCard=(s,extra='')=>`<div class="card"><div class="row sp"><b>${s.start}–${endT(s)}</b><span class="chip">${s.dur}m${s.brk?` + ${s.brk}m break`:''}</span></div><div>${esc(subjName(s.subj))}${s.chap?' · '+esc(chapLabel(s.chap)):''}</div><div class="mu">${esc(s.task)}</div><div class="row">${B('startSess','Start focus','p',`data-id="${s.id}"`)}${extra}</div></div>`;
const revRow=x=>`<div class="card row sp"><div><b>${esc(x.r.label)}</b><div class="mu">Step ${x.i+1}/4 (day ${STEPS[x.i]}) · due ${x.due}</div></div>${B('revDone','Done','p',`data-id="${x.r.id}"`)}</div>`;

V.home=()=>{
 const t=today(),type=new Date().getDay()%6===0?'weekend':'weekday',now=new Date().toTimeString().slice(0,5);
 const up=S.routine[type].filter(s=>s.start>=now).sort((a,b)=>a.start<b.start?-1:1).slice(0,4);
 const ri=revItems(),od=ri.filter(x=>x.due<t),dt=ri.filter(x=>x.due===t);
 return `<h1>${S.name?'Hi, '+esc(S.name):'StudyOS'}</h1><p class="mu">${new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})} · ${type} schedule${S.goal?' · '+esc(S.goal):''}</p>
 ${F.mode!=='idle'?'<a class="card hl" href="#focus">Focus session in progress — tap to return</a>':''}
 <div class="grid"><div class="card"><b>${fmt(dayMin(t))}</b><span class="mu">studied today</span></div><div class="card"><b>${streak()}</b><span class="mu">day streak (30+ min/day)</span></div></div>
 <h2>Upcoming today</h2>${up.map(s=>sessCard(s)).join('')||'<p class="card mu">No more sessions today. Edit your schedule in Plan.</p>'}
 <h2>Revision ${od.length?`<span class="chip bad">${od.length} overdue</span>`:''}</h2>${[...od,...dt].slice(0,6).map(revRow).join('')||'<p class="card mu">Nothing due. Mark a chapter Studied to schedule revisions.</p>'}`};

V.plan=()=>{
 const d=UI.day||(new Date().getDay()%6===0?'weekend':'weekday');UI.day=d;const L=S.routine[d];
 return `<h1>Timetable</h1><div class="seg">${['weekday','weekend'].map(x=>`<button class="${x===d?'on':''}" data-a="day" data-d="${x}">${x}</button>`).join('')}</div>
 <p class="mu">${L.length} sessions · ${fmt(L.reduce((a,s)=>a+s.dur,0))} planned</p>
 ${L.map((s,i)=>sessCard(s,B('editSess','Edit','',`data-id="${s.id}"`)+B('mv','↑','',`data-i="${i}" data-n="-1"`)+B('mv','↓','',`data-i="${i}" data-n="1"`)+B('delSess','Delete','d',`data-id="${s.id}"`))).join('')||'<p class="card mu">Empty. Add a session.</p>'}
 <div class="row">${B('addSess','+ Add session','p')}${B('sortSess','Sort by time')}</div>`};
const sessForm=s=>form(s.id?'Edit session':'New session',[{k:'start',l:'Start time',t:'time'},{k:'dur',l:'Study minutes',t:'number',min:5},{k:'brk',l:'Break after (minutes)',t:'number',min:0},{k:'subj',l:'Subject',t:'select',o:subjOpts()},{k:'chap',l:'Chapter',t:'select',o:chapOpts()},{k:'task',l:'Task',p:'What exactly will you do?'}],s,o=>{
 if(!o.start)return 'Pick a start time';if(!(o.dur>=5&&o.dur<=600))return 'Study minutes must be 5–600';o.brk=o.brk||0;
 if(s.id)Object.assign(s,o);else S.routine[UI.day].push({id:uid(),...o});save();render();toast('Session saved')});
act.addSess=()=>sessForm({start:'16:00',dur:45,brk:10,subj:'',chap:'',task:''});
act.editSess=d=>sessForm(S.routine[UI.day].find(s=>s.id===d.id));
act.delSess=d=>{if(confirm('Delete this session?')){S.routine[UI.day]=S.routine[UI.day].filter(s=>s.id!==d.id);save();render()}};
act.mv=d=>{const L=S.routine[UI.day],i=+d.i,j=i+ +d.n;if(j<0||j>=L.length)return;[L[i],L[j]]=[L[j],L[i]];save();render()};
act.sortSess=()=>{S.routine[UI.day].sort((a,b)=>a.start<b.start?-1:1);save();render()};
act.day=d=>{UI.day=d.d;render()};
act.startSess=d=>{const s=[...S.routine.weekday,...S.routine.weekend].find(x=>x.id===d.id);if(!s)return;PRE={mins:s.dur,subj:s.subj,chap:s.chap,list:s.task};go('focus')};
act.revDone=d=>{const r=S.rev.find(x=>x.id===d.id),i=r?r.done.findIndex(x=>!x):-1;if(i>=0){r.done[i]=true;save();render();toast('Revision step marked done')}};

V.subjects=([,sid,cid])=>{
 if(!sid)return `<h1>Subjects</h1>${S.subjects.map(s=>{const n=s.chapters.length,d=s.chapters.filter(c=>c.status>=2).length;return `<a class="card" href="#subjects/${s.id}"><div class="row sp"><b>${esc(s.name)}</b><span class="mu">${d}/${n} chapters</span></div>${bar(n?d/n*100:0)}</a>`}).join('')}`;
 const s=subjOf(sid);if(!s)return nf();
 if(!cid)return `<a class="back" href="#subjects">‹ Subjects</a><h1>${esc(s.name)}</h1><p class="mu">Add chapters from your own textbook. Nothing is pre-filled.</p>
  ${s.chapters.map(c=>`<a class="card row sp" href="#subjects/${sid}/${c.id}"><b>${esc(c.name)}</b><span class="chip ${c.status>=2?'ok':''}">${STATUS[c.status]}</span></a>`).join('')||'<p class="card mu">No chapters yet.</p>'}${B('chapAdd','+ Add chapter','p',`data-s="${sid}"`)}`;
 const c=s.chapters.find(c=>c.id===cid);if(!c)return nf();const rv=S.rev.find(r=>r.cid===cid),dd=`data-s="${sid}" data-id="${cid}"`;
 return `<a class="back" href="#subjects/${sid}">‹ ${esc(s.name)}</a><h1>${esc(c.name)}</h1>
 <label>Status<select data-c="status" ${dd}>${STATUS.map((x,i)=>`<option value="${i}"${i===c.status?' selected':''}>${x}</option>`).join('')}</select></label>
 <div class="row">${B('chapEdit','Rename','',dd)}${B('chapDel','Delete chapter','d',dd)}</div>
 <h2>Revision</h2>${rv?`<div class="card">${STEPS.map((n,i)=>`<div class="row sp"><span>Day +${n}: ${addDays(rv.base,n)}</span><span class="chip ${rv.done[i]?'ok':''}">${rv.done[i]?'done':'pending'}</span></div>`).join('')}<div class="row">${B('revRestart','Restart cycle from today','',dd)}</div></div>`:'<p class="card mu">Set status to Studied to schedule 1/3/7/14-day revisions.</p>'}
 <h2>Notes</h2><textarea rows="5" data-c="notes" ${dd} placeholder="Your notes">${esc(c.notes)}</textarea>
 <h2>Topics</h2>${c.topics.map(t=>`<div class="row sp"><label class="chk"><input type="checkbox" data-c="topic" ${dd} data-t="${t.id}" ${t.done?'checked':''}> ${esc(t.name)}</label>${B('topicDel','✕','d',`${dd} data-t="${t.id}"`)}</div>`).join('')}${B('topicAdd','+ Topic','',dd)}
 <h2>Practice questions</h2>${c.qs.map(q=>`<details class="card"><summary>${esc(q.q)}</summary><div>${nl(q.a)||'<i class="mu">No answer saved</i>'}</div><div class="row">${B('qaDel','Delete','d',`${dd} data-t="${q.id}"`)}</div></details>`).join('')}${B('qaAdd','+ Question','',dd)}
 <h2>Test scores</h2>${S.tests.filter(t=>t.cid===cid).map(t=>`<div class="row sp"><span>${t.date} ${esc(t.title)}</span><b>${t.got}/${t.total}</b></div>`).join('')||'<p class="mu">No tests linked to this chapter yet.</p>'}`};
act.chapAdd=d=>form('New chapter',[{k:'name',l:'Chapter name'}],{},o=>{if(!o.name)return 'Enter a name';subjOf(d.s).chapters.push({id:uid(),name:o.name,status:0,notes:'',topics:[],qs:[]});save();render()});
act.chapEdit=d=>{const{c}=getC(d.s,d.id);form('Rename chapter',[{k:'name',l:'Chapter name'}],c,o=>{if(!o.name)return 'Enter a name';c.name=o.name;save();render()})};
act.chapDel=d=>{if(!confirm('Delete this chapter with its notes, topics and questions?'))return;const s=subjOf(d.s);s.chapters=s.chapters.filter(c=>c.id!==d.id);save();go('subjects/'+d.s)};
act.topicAdd=d=>{const{c}=getC(d.s,d.id);form('New topic',[{k:'name',l:'Topic'}],{},o=>{if(!o.name)return 'Enter a topic';c.topics.push({id:uid(),name:o.name,done:false});save();render()})};
act.topicDel=d=>{const{c}=getC(d.s,d.id);c.topics=c.topics.filter(t=>t.id!==d.t);save();render()};
act.qaAdd=d=>{const{c}=getC(d.s,d.id);form('New practice question',[{k:'q',l:'Question',t:'area'},{k:'a',l:'Answer (optional)',t:'area'}],{},o=>{if(!o.q)return 'Enter a question';c.qs.push({id:uid(),q:o.q,a:o.a});save();render()})};
act.qaDel=d=>{const{c}=getC(d.s,d.id);c.qs=c.qs.filter(q=>q.id!==d.t);save();render()};
act.revRestart=d=>{const r=S.rev.find(x=>x.cid===d.id);if(r){r.base=today();r.done=[false,false,false,false];save();render();toast('Revision cycle restarted')}};
chg.status=el=>{const{c}=getC(el.dataset.s,el.dataset.id);c.status=Number(el.value);if(c.status>=2&&!S.rev.some(r=>r.cid===c.id)){S.rev.push({id:uid(),cid:c.id,label:chapLabel(c.id),base:today(),done:[false,false,false,false]});toast('Revision scheduled for day 1, 3, 7, 14')}save();render()};
chg.notes=el=>{getC(el.dataset.s,el.dataset.id).c.notes=el.value;save()};
chg.topic=el=>{const t=getC(el.dataset.s,el.dataset.id).c.topics.find(x=>x.id===el.dataset.t);if(t){t.done=el.checked;save()}};

V.revise=()=>{
 const ri=revItems().sort((a,b)=>a.due<b.due?-1:1),t=today(),g=f=>ri.filter(f).map(revRow).join('')||'<p class="mu">None</p>',tot=S.rev.length*4,dn=S.rev.reduce((a,r)=>a+r.done.filter(Boolean).length,0);
 return `<a class="back" href="#more">‹ More</a><h1>Revision</h1><p class="mu">Steps at 1, 3, 7 and 14 days after first study.${tot?` Completed ${dn}/${tot} steps.`:''}</p>
 <h2>Overdue</h2>${g(x=>x.due<t)}<h2>Due today</h2>${g(x=>x.due===t)}<h2>Upcoming</h2>${g(x=>x.due>t)}<div class="row">${B('revAdd','+ Add topic to revise','p')}</div>`};
act.revAdd=()=>form('Add revision topic',[{k:'subj',l:'Subject',t:'select',o:subjOpts(false)},{k:'label',l:'Topic'},{k:'base',l:'First studied on',t:'date'}],{base:today()},o=>{if(!o.label||!o.base)return 'Enter a topic and date';S.rev.push({id:uid(),cid:'',label:subjName(o.subj)+' — '+o.label,base:o.base,done:[false,false,false,false]});save();render()});

V.assign=()=>{
 const L=S.assign.slice().sort((a,b)=>a.date<b.date?1:-1);
 return `<a class="back" href="#more">‹ More</a><h1>Daily assignments</h1><p class="mu">Write foundation items first (definitions, simple examples), then harder ones. Fill them from your own books and teachers.</p>${B('asNew','+ New assignment','p')}
 ${L.map(a=>`<details class="card"><summary><b>${esc(a.title)}</b> <span class="mu">${a.date} · ${esc(subjName(a.subj))}</span> ${a.done?'<span class="chip ok">done</span>':''}</summary>
 ${[['Learning objectives','obj'],['Explanation / instructions','explain'],['Practice questions','qs'],['Homework','hw'],['Self-test','self'],['Revision tasks','revt']].map(([l,k])=>a[k]?`<h3>${l}</h3><div>${nl(a[k])}</div>`:'').join('')}
 ${a.key?`<details><summary>Answer key</summary>${nl(a.key)}</details>`:''}<div class="row">${B('asDone',a.done?'Mark not done':'Mark done','p',`data-id="${a.id}"`)}${B('asEdit','Edit','',`data-id="${a.id}"`)}${B('asDel','Delete','d',`data-id="${a.id}"`)}</div></details>`).join('')}`};
const asForm=a=>form(a.id?'Edit assignment':'New assignment',[{k:'title',l:'Title'},{k:'date',l:'Date',t:'date'},{k:'subj',l:'Subject',t:'select',o:subjOpts()},{k:'obj',l:'Learning objectives',t:'area',r:2},{k:'explain',l:'Explanation / learning instructions',t:'area',p:'Plain-language steps for a beginner'},{k:'qs',l:'Practice questions',t:'area'},{k:'hw',l:'Homework',t:'area',r:2},{k:'self',l:'Self-test',t:'area',r:3},{k:'key',l:'Answer key',t:'area',r:3},{k:'revt',l:'Revision tasks',t:'area',r:2}],a,o=>{if(!o.title||!o.date)return 'Title and date are required';if(a.id)Object.assign(a,o);else S.assign.push({id:uid(),done:false,...o});save();render()});
act.asNew=()=>asForm({date:today()});
act.asEdit=d=>asForm(S.assign.find(a=>a.id===d.id));
act.asDel=d=>{if(confirm('Delete this assignment?')){S.assign=S.assign.filter(a=>a.id!==d.id);save();render()}};
act.asDone=d=>{const a=S.assign.find(x=>x.id===d.id);a.done=!a.done;save();render()};

/* tests */
function parseQs(txt){const out=[];const L=txt.split('\n');for(let i=0;i<L.length;i++){const l=L[i].trim();if(!l)continue;const p=l.split('|').map(x=>x.trim());
 if(p.length<4)return{err:`Line ${i+1}: use Question | option | option | ... | correct letter`};const c=p.pop(),q=p.shift(),k=/^[A-Za-z]$/.test(c)?c.toUpperCase().charCodeAt(0)-65:Number(c)-1;
 if(!q||p.some(x=>!x)||!(k>=0&&k<p.length))return{err:`Line ${i+1}: correct answer "${c}" does not match an option`};out.push({q,o:p,c:k})}return out.length?{qs:out}:{err:'Add at least one question'}}
const qsText=q=>q.qs.map(x=>[x.q,...x.o,String.fromCharCode(65+x.c)].join(' | ')).join('\n');
V.tests=([,m,id])=>{
 if(m==='take')return takeView(id);
 const h=S.tests.slice().sort((a,b)=>b.ts-a.ts),open=S.mist.filter(x=>x.open),all=[...open,...S.mist.filter(x=>!x.open)];
 return `<a class="back" href="#more">‹ More</a><h1>Tests</h1><div class="row">${B('qNew','+ MCQ set','p')}${B('wLog','Log marks','p')}${B('mAdd','+ Mistake')}</div>
 <h2>MCQ sets</h2>${S.quizzes.map(q=>`<div class="card"><b>${esc(q.title)}</b><div class="mu">${esc(subjName(q.subj))} · ${q.qs.length} questions · ${q.mins?q.mins+' min':'untimed'}</div><div class="row">${B('take','Take','p',`data-id="${q.id}"`)}${B('qEdit','Edit','',`data-id="${q.id}"`)}${B('qDel','Delete','d',`data-id="${q.id}"`)}</div></div>`).join('')||'<p class="mu">None yet. Write your own questions, one per line.</p>'}
 <h2>History</h2>${h.map(t=>`<div class="card row sp"><div><b>${esc(t.title)}</b><div class="mu">${t.date} · ${esc(subjName(t.subj))} · ${esc(t.type)}</div></div><div class="r"><b>${t.got}/${t.total}</b><div class="mu">${Math.round(t.got/t.total*100)}%</div></div>${B('tDel','✕','d',`data-id="${t.id}"`)}</div>`).join('')||'<p class="mu">No tests yet.</p>'}
 <h2>Mistake notebook (${open.length} open)</h2>${all.map(x=>`<div class="card ${x.open?'':'dim'}"><div class="mu">${x.date} · ${esc(x.cid?chapLabel(x.cid):subjName(x.subj))}</div><b>${esc(x.q)}</b><div>${nl(x.note)}</div><div class="row">${B('mTog',x.open?'Mark resolved':'Reopen','',`data-id="${x.id}"`)}${B('mDel','Delete','d',`data-id="${x.id}"`)}</div></div>`).join('')||'<p class="mu">Empty.</p>'}`};
const qForm=q=>form(q.id?'Edit MCQ set':'New MCQ set',[{k:'title',l:'Title'},{k:'subj',l:'Subject',t:'select',o:subjOpts()},{k:'cid',l:'Chapter',t:'select',o:chapOpts()},{k:'mins',l:'Time limit in minutes (0 = untimed)',t:'number',min:0},{k:'txt',l:'Questions, one per line',t:'area',r:9,p:'Question | A | B | C | D | B'}],{...q,txt:q.qs?qsText(q):''},o=>{
 if(!o.title)return 'Enter a title';const r=parseQs(o.txt);if(r.err)return r.err;const v={title:o.title,subj:o.subj,cid:o.cid,mins:o.mins||0,qs:r.qs};if(q.id)Object.assign(q,v);else S.quizzes.push({id:uid(),...v});save();render();toast('MCQ set saved')});
act.qNew=()=>qForm({mins:0});act.qEdit=d=>qForm(S.quizzes.find(x=>x.id===d.id));
act.qDel=d=>{if(confirm('Delete this MCQ set? Past results stay in history.')){S.quizzes=S.quizzes.filter(x=>x.id!==d.id);save();render()}};
act.take=d=>{T=null;go('tests/take/'+d.id)};
function takeView(id){const q=S.quizzes.find(x=>x.id===id);if(!q)return nf();if(!T||T.id!==id)T={id,start:Date.now(),end:q.mins?Date.now()+q.mins*60000:0};
 return `<h1>${esc(q.title)}</h1>${q.mins?'<div class="clock" id="tclock"></div>':''}<form id="tf">${q.qs.map((x,i)=>`<div class="card"><b>${i+1}. ${esc(x.q)}</b>${x.o.map((o,j)=>`<label class="chk"><input type="radio" name="q${i}" value="${j}"> ${String.fromCharCode(65+j)}. ${esc(o)}</label>`).join('')}</div>`).join('')}</form><div class="row">${B('tCancel','Cancel')}${B('tSubmit','Submit','p')}</div>`}
function submitTest(){const q=S.quizzes.find(x=>x.id===T?.id),f=$('#tf');if(!q||!f){T=null;return}let got=0;const wrong=[];
 q.qs.forEach((x,i)=>{const v=f.querySelector(`input[name=q${i}]:checked`),a=v?+v.value:-1;if(a===x.c)got++;else wrong.push({q:x.q,my:a<0?'(no answer)':x.o[a],ok:x.o[x.c]})});
 S.tests.push({id:uid(),ts:Date.now(),date:today(),title:q.title,subj:q.subj,cid:q.cid,type:'MCQ',got,total:q.qs.length,sec:Math.round((Date.now()-T.start)/1000)});
 wrong.forEach(w=>S.mist.push({id:uid(),date:today(),subj:q.subj,cid:q.cid,q:w.q,note:`Your answer: ${w.my}. Correct: ${w.ok}`,open:true}));
 T=null;save();location.hash='tests';toast(`Score ${got}/${q.qs.length}. ${wrong.length} added to mistake notebook`)}
act.tSubmit=submitTest;act.tCancel=()=>{if(confirm('Discard this attempt?')){T=null;go('tests')}};
act.wLog=()=>form('Log marks (written / mock)',[{k:'title',l:'Title'},{k:'subj',l:'Subject',t:'select',o:subjOpts(false)},{k:'type',l:'Type',t:'select',o:['Short answer','Long answer','Mock exam','Weekly test','Other']},{k:'got',l:'Marks obtained',t:'number',min:0},{k:'total',l:'Out of',t:'number',min:1},{k:'date',l:'Date',t:'date'},{k:'note',l:'Mistakes / weak points (optional)',t:'area',r:3}],{date:today()},o=>{
 if(!o.title)return 'Enter a title';if(!(o.total>0)||o.got===''||o.got<0||o.got>o.total)return 'Enter valid marks (0 to total)';
 S.tests.push({id:uid(),ts:Date.now(),date:o.date||today(),title:o.title,subj:o.subj,cid:'',type:o.type,got:o.got,total:o.total,sec:0});if(o.note)S.mist.push({id:uid(),date:o.date||today(),subj:o.subj,cid:'',q:o.title,note:o.note,open:true});save();render();toast('Marks saved')},
 `<p class="mu small">Marks scheme is set per subject in Settings → Exam pattern.</p>`);
act.mAdd=()=>form('Add mistake',[{k:'subj',l:'Subject',t:'select',o:subjOpts(false)},{k:'cid',l:'Chapter',t:'select',o:chapOpts()},{k:'q',l:'Question / concept',t:'area',r:2},{k:'note',l:'What went wrong and the correct idea',t:'area'}],{},o=>{if(!o.q)return 'Describe the mistake';S.mist.push({id:uid(),date:today(),subj:o.subj,cid:o.cid,q:o.q,note:o.note,open:true});save();render()});
act.mTog=d=>{const m=S.mist.find(x=>x.id===d.id);m.open=!m.open;save();render()};
act.mDel=d=>{if(confirm('Delete this entry?')){S.mist=S.mist.filter(x=>x.id!==d.id);save();render()}};
act.tDel=d=>{if(confirm('Delete this result?')){S.tests=S.tests.filter(x=>x.id!==d.id);save();render()}};

/* focus */
const studied=()=>F.acc+(F.mode==='run'?Date.now()-F.t0:0);
const clock=()=>{if(F.mode==='break'){const r=F.brkEnd-Date.now();return r>0?mmss(r):'Break over'}const l=F.target-studied();return (l<0?'+':'')+mmss(Math.abs(l))};
const syncPre=()=>{if($('#cm'))PRE.mins=Number($('#cm').value)||0;if($('#fl'))PRE.list=$('#fl').value;if($('#fsub'))PRE.subj=$('#fsub').value;if($('#fchap'))PRE.chap=$('#fchap').value};
V.focus=()=>{
 if(F.mode!=='idle')return `<div class="fs"><div class="mu">${esc(subjName(F.subj))}${F.chap?' · '+esc(chapLabel(F.chap)):''}</div><div class="clock" id="clock">${clock()}</div><span class="chip">${F.mode==='run'?'Studying':F.mode==='pause'?'Paused':'On break'}</span>
 <div class="row c">${F.mode==='run'?B('fPause','Pause')+B('fFinish','Finish','p'):F.mode==='pause'?B('fResume','Resume','p')+B('fFinish','Finish'):B('fResume','End break and resume','p')}</div>
 ${F.mode!=='break'?`<div class="row c"><span class="mu">Break:</span>${[5,10,15].map(m=>B('fBreak',m+'m','',`data-m="${m}"`)).join('')}</div>`:''}
 <div class="list">${F.list.map((x,i)=>`<label class="chk"><input type="checkbox" data-c="fck" data-i="${i}" ${x.d?'checked':''}> ${esc(x.t)}</label>`).join('')}</div>
 <div class="row c">${B('fMin','Minimize')}${B('fDiscard','Discard','d')}</div></div>`;
 const hs=S.focus.slice().reverse().slice(0,10),ch=(subjOf(PRE.subj)?.chapters||[]);
 return `<h1>Focus</h1><div class="grid4">${[25,45,60,90].map(m=>`<button class="btn ${PRE.mins===m?'p':''}" data-a="preset" data-m="${m}">${m}m</button>`).join('')}</div>
 <label>Custom minutes<input id="cm" type="number" min="1" max="600" value="${PRE.mins}"></label>
 <label>Subject<select id="fsub" data-c="fsub">${subjOpts().map(([v,l])=>`<option value="${v}"${v===PRE.subj?' selected':''}>${esc(l)}</option>`).join('')}</select></label>
 <label>Chapter<select id="fchap" data-c="fchap"><option value="">— none —</option>${ch.map(c=>`<option value="${c.id}"${c.id===PRE.chap?' selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
 <label>Checklist (one item per line)<textarea id="fl" rows="3">${esc(PRE.list)}</textarea></label>${B('fStart','Start focus','p big')}
 <p class="mu small">StudyOS cannot block other apps on iPhone. For that, use iOS Focus or Screen Time yourself.</p>
 <h2>History</h2>${hs.map(f=>`<div class="card row sp"><div><b>${fmt(f.sec/60)}</b> · ${esc(subjName(f.subj))}<div class="mu">${f.date} · planned ${f.planned}m${f.tot?` · checklist ${f.ck}/${f.tot}`:''}</div></div>${B('fDel','✕','d',`data-id="${f.id}"`)}</div>`).join('')||'<p class="mu">No sessions yet.</p>'}`};
act.preset=d=>{syncPre();PRE.mins=+d.m;render()};
act.fStart=()=>{syncPre();if(!(PRE.mins>=1&&PRE.mins<=600))return toast('Enter 1–600 minutes');
 F={mode:'run',target:PRE.mins*60000,acc:0,t0:Date.now(),start:Date.now(),subj:PRE.subj,chap:PRE.chap,list:PRE.list.split('\n').map(x=>x.trim()).filter(Boolean).map(t=>({t,d:false})),brkEnd:0};
 navigator.wakeLock?.request('screen').then(w=>{F.wl=w}).catch(()=>{});PRE.list='';render()};
act.fPause=()=>{F.acc=studied();F.mode='pause';render()};
act.fResume=()=>{F.mode='run';F.t0=Date.now();render()};
act.fBreak=d=>{F.acc=studied();F.mode='break';F.brkEnd=Date.now()+d.m*60000;render()};
act.fFinish=()=>{if(F.mode==='run'){F.acc=studied();F.mode='pause';render()}const m=Math.round(F.acc/60000);if(!confirm(`Save this session? Studied time: ${m} min.`))return;
 S.focus.push({id:uid(),date:today(),ts:F.start,sec:Math.round(F.acc/1000),planned:Math.round(F.target/60000),subj:F.subj,cid:F.chap,ck:F.list.filter(x=>x.d).length,tot:F.list.length});endF();save();render();toast('Session saved')};
act.fDiscard=()=>{if(confirm('Discard this session without saving?')){endF();render()}};
act.fMin=()=>{location.hash='home'};
act.fDel=d=>{if(confirm('Delete this session record?')){S.focus=S.focus.filter(x=>x.id!==d.id);save();render()}};
const endF=()=>{F.wl?.release?.().catch(()=>{});F={mode:'idle'}};
chg.fck=el=>{F.list[+el.dataset.i].d=el.checked};
chg.fsub=()=>{syncPre();PRE.chap='';render()};chg.fchap=()=>syncPre();
setInterval(()=>{const c=$('#clock');if(c&&F.mode!=='idle')c.textContent=clock();if(T?.end){const tc=$('#tclock');if(tc){const r=T.end-Date.now();tc.textContent=r>0?mmss(r):'Time up';if(r<=0&&$('#tf'))submitTest()}}},500);
addEventListener('beforeunload',e=>{if(F.mode==='run'&&S?.warn){e.preventDefault();e.returnValue=''}});

/* analytics */
V.stats=()=>{
 const t=today(),days=[...Array(7)].map((_,i)=>addDays(t,i-6)),dm=days.map(dayMin),mx=Math.max(...dm,30),wk=dm.reduce((a,b)=>a+b,0);
 const bs=S.subjects.map(s=>[s.name,S.focus.filter(f=>f.subj===s.id).reduce((a,f)=>a+f.sec/60,0)]),mb=Math.max(...bs.map(x=>x[1]),1);
 const ts=S.tests.filter(x=>x.total>0),acc=l=>l.length?Math.round(l.reduce((a,x)=>a+x.got,0)/l.reduce((a,x)=>a+x.total,0)*100):null;
 const rt=S.rev.length*4,rd=S.rev.reduce((a,r)=>a+r.done.filter(Boolean).length,0),weak={};
 S.mist.filter(x=>x.open).forEach(x=>{const k=x.cid?chapLabel(x.cid):subjName(x.subj);weak[k]=(weak[k]||0)+1});
 const l14=[...Array(14)].map((_,i)=>dayMin(addDays(t,i-13))>=30),wl=Object.entries(weak).sort((a,b)=>b[1]-a[1]).slice(0,6);
 return `<a class="back" href="#more">‹ More</a><h1>Progress</h1><p class="mu">Only real data you entered. No GPA estimate.</p>
 <h2>Study time</h2><div class="card"><b>${fmt(dayMin(t))}</b> today · <b>${fmt(wk)}</b> last 7 days<div class="vb">${days.map((d,i)=>`<div><i style="height:${dm[i]/mx*100}%"></i>${new Date(d+'T00:00').toLocaleDateString(undefined,{weekday:'narrow'})}</div>`).join('')}</div></div>
 <div class="card"><b>By subject (all time)</b>${bs.map(([n,m])=>`<div class="row sp"><span>${esc(n)}</span><span class="mu">${fmt(m)}</span></div>${bar(m/mb*100)}`).join('')}</div>
 <h2>Chapters completed</h2><div class="card">${S.subjects.map(s=>{const n=s.chapters.length,d=s.chapters.filter(c=>c.status>=2).length;return `<div class="row sp"><span>${esc(s.name)}</span><span class="mu">${d}/${n}</span></div>${bar(n?d/n*100:0)}`}).join('')}</div>
 <h2>Test accuracy</h2><div class="card">${ts.length?`<b>${acc(ts)}%</b> overall (${ts.length} tests)${S.subjects.map(s=>{const l=ts.filter(x=>x.subj===s.id);return l.length?`<div class="row sp"><span>${esc(s.name)}</span><span class="${acc(l)<60?'chip bad':'chip ok'}">${acc(l)}%</span></div>`:''}).join('')}`:'<span class="mu">No tests logged yet.</span>'}</div>
 <h2>Revision completion</h2><div class="card">${rt?`<b>${Math.round(rd/rt*100)}%</b> (${rd}/${rt} steps)${bar(rd/rt*100)}`:'<span class="mu">No revisions scheduled yet.</span>'}</div>
 <h2>Weak topics</h2><div class="card">${wl.length?wl.map(([k,n])=>`<div class="row sp"><span>${esc(k)}</span><span class="chip bad">${n} open</span></div>`).join(''):'<span class="mu">No open mistakes recorded.</span>'}</div>
 <h2>Consistency</h2><div class="card"><b>${l14.filter(Boolean).length}/14</b> days with 30+ min · streak <b>${streak()}</b><div class="cells">${l14.map(x=>`<i class="${x?'on':''}"></i>`).join('')}</div></div>`};

/* more + settings */
V.more=()=>`<h1>More</h1>${[['assign','Daily assignments','Objectives, practice, self-test, answer key'],['tests','Tests','MCQ, written marks, mistake notebook'],['revise','Revision','1 / 3 / 7 / 14-day schedule'],['stats','Progress','Time, accuracy, weak topics'],['settings','Settings & backup','Export, import, exam pattern']].map(([k,t,d])=>`<a class="card" href="#${k}"><b>${t}</b><div class="mu">${d}</div></a>`).join('')}`;
V.settings=()=>`<a class="back" href="#more">‹ More</a><h1>Settings</h1>
 <h2>Backup</h2><p class="mu">Data lives only on this device. Clearing Safari website data or deleting the app can erase it, so export regularly. ${S.lastBackup?'Last export started: '+new Date(S.lastBackup).toLocaleString()+'.':'No export yet.'}</p>
 <div class="row">${B('export','Export JSON','p')}<label class="btn" style="margin:0">Import JSON<input type="file" accept="application/json,.json" data-c="imp" hidden></label></div>
 <h2>Exam pattern</h2><p class="mu">Per subject, empty until you enter the marks scheme from your official notice.</p>${S.subjects.map(s=>`<div class="card row sp"><div><b>${esc(s.name)}</b><div class="mu">${patLine(s.id)||'Not set'}</div></div>${B('patEdit','Edit','',`data-id="${s.id}"`)}</div>`).join('')}
 <h2>Profile and options</h2><div class="row">${B('profile','Edit name and goal text')}</div><label class="chk"><input type="checkbox" data-c="warn" ${S.warn?'checked':''}> Warn before leaving the page during a focus session (some browsers ignore this)</label>
 <h2>Routine</h2><div class="row">${B('resetSample','Replace routines with sample…')}</div>
 <h2>Install on iPhone</h2><ol><li>Host these files on any free HTTPS static host (GitHub Pages, Netlify, Cloudflare Pages). Offline mode needs HTTPS.</li><li>Open the site in Safari.</li><li>Tap Share, then Add to Home Screen.</li><li>Open it once online so it can cache itself; after that it works offline.</li></ol>
 <h2>Danger zone</h2><div class="row">${B('erase','Erase all data…','d')}</div>`;
act.export=()=>{const b=new Blob([JSON.stringify(S,null,1)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`studyos-backup-${today()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);S.lastBackup=new Date().toISOString();save();render();toast('Export started. Confirm the download or save prompt.')};
chg.imp=async el=>{const f=el.files[0];el.value='';if(!f)return;try{const n=Object.assign(fresh(),JSON.parse(await f.text()));for(const k of['subjects','assign','rev','focus','tests','mist','quizzes'])if(!Array.isArray(n[k]))throw Error('invalid field: '+k);if(!n.routine?.weekday||!n.routine?.weekend)throw Error('missing routine');
 if(!confirm(`Replace ALL current data with this backup (${n.subjects.length} subjects, ${n.focus.length} sessions, ${n.tests.length} tests)? Export first if unsure.`))return;S=n;S.done=true;save();render();toast('Backup restored')}catch(e){toast('Import failed: '+e.message)}};
act.patEdit=d=>{const p=S.pattern[d.id]||{};form('Exam pattern: '+subjName(d.id),[{k:'total',l:'Total marks',t:'number',min:0},{k:'mcq',l:'MCQ marks',t:'number',min:0},{k:'short',l:'Short-answer marks',t:'number',min:0},{k:'long',l:'Long-answer marks',t:'number',min:0},{k:'mins',l:'Duration (minutes)',t:'number',min:0},{k:'note',l:'Note (e.g. practical marks)'}],p,o=>{S.pattern[d.id]=o;save();render()})};
act.profile=()=>form('Profile',[{k:'name',l:'Name'},{k:'goal',l:'Goal text (shown on Home)'}],S,o=>{S.name=o.name;S.goal=o.goal;save();render()});
act.resetSample=()=>{if(confirm('This REPLACES your current weekday and weekend routines with the sample. Export a backup first if you want to keep them. Continue?')){S.routine=sample();save();render();toast('Sample routine loaded')}};
act.erase=()=>{if(!confirm('Erase ALL StudyOS data on this device? This cannot be undone.'))return;if(prompt('Type ERASE to confirm')!=='ERASE')return;S=fresh();flush().then(()=>{render();toast('All data erased')})};
chg.warn=el=>{S.warn=el.checked;save()};

/* shell */
const TABS=[['home','Home','⌂'],['plan','Plan','☷'],['focus','Focus','◉'],['subjects','Subjects','▤'],['more','More','⋯']];
function onboard(){form('Welcome to StudyOS',[{k:'name',l:'Your name (optional)'},{k:'goal',l:'Goal text (shown on Home)',p:'e.g. 3.80 GPA target'},{k:'r',l:'Starting routine',t:'select',o:[['sample','Sample routine (fully editable)'],['empty','Empty: I will build my own']]}],{goal:S.goal,r:'sample'},o=>{S.name=o.name;S.goal=o.goal;S.routine=o.r==='sample'?sample():{weekday:[],weekend:[]};S.done=true;save();render();toast('Saved on this device')},
 '<p>Everything stays on this device. StudyOS does not predict grades or block other apps. Subjects start with no chapters: add yours from your own textbooks.</p>',true)}
const route=()=>(location.hash.slice(1)||'home').split('/');
function render(){
 if(!S)return;const r=route(),v=V[r[0]]?r[0]:'home';let h;
 try{h=V[v](r)}catch(e){console.error(e);h=`<h1>Something went wrong</h1><p class="mu">${esc(e.message)}</p><a class="btn" href="#home">Home</a>`}
 $('#app').innerHTML=h;const cur=['assign','tests','stats','revise','settings'].includes(v)?'more':v;
 $('#tabs').innerHTML=TABS.map(([k,l,i])=>`<a href="#${k}" class="${k===cur?'on':''}"${k===cur?' aria-current="page"':''}><span aria-hidden="true">${i}</span>${l}</a>`).join('');
 if(!S.done&&!$('#dlg').open)onboard();
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b&&act[b.dataset.a])act[b.dataset.a](b.dataset,b)});
document.addEventListener('change',e=>{const el=e.target,c=el.dataset?.c;if(c&&chg[c])chg[c](el)});
addEventListener('hashchange',()=>{render();scrollTo(0,0)});
addEventListener('pagehide',()=>{if(S)flush()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&S)flush()});
(async()=>{
 try{const d=await DB.get();S=Object.assign(fresh(),d||{})}catch(e){S=fresh();toast('Storage unavailable: changes will not be saved')}
 navigator.storage?.persist?.().catch(()=>{});render();
 if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
