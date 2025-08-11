// ====== 血圧管理ブック (PWA) v8 ======
const STORAGE_KEY = 'bpbook_entries_v1';

const $ = (sel) => document.querySelector(sel);
function fmt(ts){
  const d = new Date(ts);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).slice(0,2).padStart(2,'0'); // ensure day
  const day = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${yy}/${mm}/${day} ${hh}:${mi}`;
}
function loadEntries(){
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
function saveEntries(list){ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
function classifySys(v){ if(v>=140) return 'bad'; if(v>=130) return 'warn'; if(v>=120) return 'warn'; return 'good'; }
function classifyDia(v){ if(v>=90) return 'bad'; if(v>=80) return 'warn'; return 'good'; }

let entries = loadEntries();
let chart;
let rangeMode = '30';

const dt = $('#dt'); const sys = $('#sys'); const dia = $('#dia'); const pul = $('#pul');
const btnAdd = $('#btn-add'); const btnNow = $('#btn-now');
const tbodyHome = $('#list-home tbody'); const tbodyAll = $('#list-all tbody');
const rangeSelect = $('#range-select'); const btnExport = $('#btn-export'); const fileImport = $('#file-import');
const pageHome = $('#page-home'); const pageAll = $('#page-all');
const navHome = $('#nav-home'); const navAll = $('#nav-all');
const chartCanvas = $('#chart');

function setNow(){
  if(!dt) return;
  const n = new Date();
  const tzoffset = n.getTimezoneOffset() * 60000;
  dt.value = new Date(Date.now() - tzoffset).toISOString().slice(0,16);
}
setNow();

if(btnNow) btnNow.addEventListener('click', setNow);

if(btnAdd) btnAdd.addEventListener('click', ()=>{
  if(!dt || !sys || !dia || !pul) return;
  const ts = Date.parse(dt.value);
  const s = parseInt(sys.value, 10);
  const d = parseInt(dia.value, 10);
  const p = parseInt(pul.value, 10);
  if(Number.isNaN(ts)){ alert('日時を入力してください'); return; }
  if(!(s>=60 && s<=250)){ alert('収縮（上）は60〜250'); return; }
  if(!(d>=40 && d<=200)){ alert('拡張（下）は40〜200'); return; }
  if(!(p>=30 && p<=200)){ alert('脈拍は30〜200'); return; }
  entries.push({ id: crypto.randomUUID(), ts, s, d, p });
  entries.sort((a,b)=> b.ts - a.ts);
  saveEntries(entries);
  renderTables(); renderChart();
  sys.value=''; dia.value=''; pul.value=''; sys.focus();
});

if(rangeSelect) rangeSelect.addEventListener('change', (e)=>{ rangeMode = e.target.value; renderChart(); });

if(btnExport) btnExport.addEventListener('click', ()=>{
  const lines = ['timestamp,systolic,diastolic,pulse'];
  entries.forEach(e=>lines.push(`${e.ts},${e.s},${e.d},${e.p}`));
  const blob = new Blob([lines.join('\\n')], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'bpbook.csv'; a.click();
  URL.revokeObjectURL(url);
});
if(fileImport) fileImport.addEventListener('change', async (ev)=>{
  const file = ev.target.files?.[0]; if(!file) return;
  const text = await file.text();
  const out = [];
  text.split(/\\r?\\n/).forEach((line, idx)=>{
    if(!line.trim()) return;
    if(idx===0 && line.toLowerCase().includes('timestamp')) return;
    const p = line.split(',');
    if(p.length>=4){
      const ts = Number(p[0]), s=Number(p[1]), d=Number(p[2]), pl=Number(p[3]);
      if(Number.isFinite(ts) && Number.isFinite(s) && Number.isFinite(d) && Number.isFinite(pl)){
        out.push({id: crypto.randomUUID(), ts, s, d, p: pl});
      }
    }
  });
  if(out.length===0){ alert('読み取れる行がありません'); return; }
  const map = new Map(entries.map(e=>[e.ts, e])); out.forEach(e=> map.set(e.ts, e));
  entries = Array.from(map.values()).sort((a,b)=> b.ts - a.ts);
  saveEntries(entries); renderTables(); renderChart(); ev.target.value=''; alert('CSVを取り込みました');
});

function go(hash){
  if(hash==='#all'){ pageHome.classList.add('hidden'); pageAll.classList.remove('hidden'); }
  else { pageAll.classList.add('hidden'); pageHome.classList.remove('hidden'); }
  renderTables(); renderChart();
  if(location.hash !== hash) location.hash = hash;
}
if(navHome) navHome.addEventListener('click', ()=>go('#home'));
if(navAll) navAll.addEventListener('click', ()=>go('#all'));
window.addEventListener('hashchange', ()=> go(location.hash||'#home'));
go(location.hash||'#home');

function renderTables(){
  const latest = entries.slice(0,5);
  tbodyHome.innerHTML = latest.map(rowHtml).join('');
  attachRowActions(tbodyHome);
  tbodyAll.innerHTML = entries.map(rowHtml).join('');
  attachRowActions(tbodyAll);

  const narrow = matchMedia('(max-width:540px)').matches;
  if(narrow){
    document.querySelectorAll('tbody td.col-num').forEach((td, i)=>{
      const mod = i % 3;
      const label = mod===0 ? '収縮' : (mod===1 ? '拡張' : '脈拍');
      td.setAttribute('data-label', label);
    });
  }
}

function rowHtml(e){
  const clsS = classifySys(e.s);
  const clsD = classifyDia(e.d);
  return `<tr data-id="${e.id}">
    <td class="col-date">${fmt(e.ts)}</td>
    <td class="num col-num"><span class="value ${clsS}">${e.s}</span></td>
    <td class="num col-num"><span class="value ${clsD}">${e.d}</span></td>
    <td class="num col-num">${e.p}</td>
    <td class="col-actions"><div class="row-actions">
      <button data-act="edit">編集</button>
      <button data-act="del">削除</button>
    </div></td>
  </tr>`;
}

function attachRowActions(tbody){
  tbody.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      const tr = ev.target.closest('tr');
      const id = tr.getAttribute('data-id');
      const act = ev.target.getAttribute('data-act');
      const idx = entries.findIndex(x=>x.id===id);
      if(idx<0) return;
      if(act==='del'){
        if(confirm('この記録を削除しますか？')){
          entries.splice(idx,1); saveEntries(entries); renderTables(); renderChart();
        }
      } else if(act==='edit'){
        const e = entries[idx];
        const newS = Number(prompt('収縮(上)', String(e.s))); if(!Number.isFinite(newS) || !(newS>=60 && newS<=250)) return alert('値が不正');
        const newD = Number(prompt('拡張(下)', String(e.d))); if(!Number.isFinite(newD) || !(newD>=40 && newD<=200)) return alert('値が不正');
        const newP = Number(prompt('脈拍', String(e.p)));      if(!Number.isFinite(newP) || !(newP>=30 && newP<=200)) return alert('値が不正');
        entries[idx] = {...e, s:newS, d:newD, p:newP}; saveEntries(entries); renderTables(); renderChart();
      }
    });
  });
}

function getRangedEntries(){
  const sorted = [...entries].sort((a,b)=> a.ts - b.ts);
  if(rangeMode === 'all') return sorted;
  const n = Number(rangeMode);
  return sorted.slice(-n);
}

function renderChart(){
  if(!chartCanvas || typeof Chart === 'undefined') return;
  const data = getRangedEntries();
  const labels = data.map(e=>fmt(e.ts));
  const syst = data.map(e=>e.s);
  const dias = data.map(e=>e.d);
  const ctx = chartCanvas.getContext('2d');
  if(chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '収縮', data: syst, tension: 0.35, pointRadius: 0, borderWidth: 3,
          borderColor: '#475569', backgroundColor: 'rgba(71,85,105,0.1)' },
        { label: '拡張', data: dias, tension: 0.35, pointRadius: 0, borderWidth: 3,
          borderColor: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.12)' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#6b7280' } } },
      scales: { x: { ticks: { color: '#6b7280', maxRotation: 0, autoSkip: true }, grid: { color: '#e5e7eb' } },
                y: { grid: { color: '#e5e7eb' }, ticks: { color: '#6b7280' } } }
    }
  });
}

// First paint
renderTables(); renderChart();
