// noprotect
// SmartDocs v24.7.4 – Grip split, caret-anchored Slash menu, selection-safe Backspace, H1–H3 blocks, smart bullets
// + contenteditable titles support + init guard to avoid double-binding
(() => {
  if (window.__SMARTDOCS_ACTIVE__) return; // evita doppia inizializzazione se lo script viene incluso due volte
  window.__SMARTDOCS_ACTIVE__ = true;

// Quill "pulito" stile Notion: niente toolbar fissa
var quillA = new Quill('#editorA', {
  theme: 'bubble',
  modules: { toolbar: false, clipboard: { matchVisual: false } },
  placeholder: 'Write or / for commands'
});

// (Opzionale: secondo editor)
var elB = document.querySelector('#editorB');
if (elB) {
  var quillB = new Quill('#editorB', {
    theme: 'bubble',
    modules: { toolbar: false, clipboard: { matchVisual: false }},
    placeholder: 'Write or / for commands'
  });
}

/* ---------- Placeholder sugli heading ---------- */
function enableHeadingPlaceholders(quill, placeholders = {1:'Heading 1', 2:'Heading 2', 3:'Heading 3'}) {
  function refresh() {
    const lines = quill.getLines();
    lines.forEach((line) => {
      const dom = line && line.domNode;
      if (!(dom instanceof HTMLElement)) return;
      const fmt = quill.getFormat(quill.getIndex(line), 1);
      if (fmt.header && placeholders[fmt.header]) {
        dom.setAttribute('data-header', fmt.header);
        const txt = (dom.innerText || '').replace(/\u200B/g,'').trim();
        if (txt === '') dom.setAttribute('data-placeholder', placeholders[fmt.header]);
        else dom.removeAttribute('data-placeholder');
      } else {
        dom.removeAttribute('data-placeholder');
        dom.removeAttribute('data-header');
      }
    });
  }
  quill.on('text-change', refresh);
  quill.on('selection-change', refresh);
  refresh();
}
enableHeadingPlaceholders(quillA);
if (typeof quillB !== 'undefined') enableHeadingPlaceholders(quillB);

/* ---------- Heading vuoto → paragrafo (Backspace/Delete/Enter) ---------- */
function installEmptyHeadingDemote(quill){
  const handler = function(range) {
    if (!range) return true;
    const fmt = quill.getFormat(range);
    if (!fmt || !fmt.header) return true;

    const [line] = quill.getLine(range.index);
    const dom = line && line.domNode;
    const txt = (dom?.innerText || '').replace(/\u200B/g,'').trim();
    if (txt !== '') return true;

    // togli header, resta sulla stessa riga
    quill.formatLine(range.index, 1, { header: false });
    quill.setSelection(range.index, 0, 'user');
    return false;
  };
  const opts = { empty: true, format: { header: [1,2,3] } };
  quill.keyboard.addBinding({ key: 'backspace' }, opts, handler);
  quill.keyboard.addBinding({ key: 'delete'    }, opts, handler);
  quill.keyboard.addBinding({ key: 13          }, opts, handler); // Enter
}
installEmptyHeadingDemote(quillA);
if (typeof quillB !== 'undefined') installEmptyHeadingDemote(quillB);

/* ---------- Mini Slash Menu (come il tuo) ---------- */
(function(){
  const menu = document.createElement('div');
  Object.assign(menu.style, {
    position:'absolute', minWidth:'220px', maxWidth:'320px',
    background:'var(--bg, #fff)', border:'1px solid rgba(127,127,127,.25)',
    borderRadius:'8px', padding:'6px',
    font:'14px/1.4 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
    boxShadow:'0 8px 24px rgba(0,0,0,.12)', zIndex:'9999', display:'none'
  });

  // Append nel container dell’editor A (verrà spostato sul container attivo se serve)
  document.getElementById('editorA')?.parentNode?.appendChild(menu);

  const list = document.createElement('div');
  const items = [
    {label:'H1', action:(q)=>q.format('header', 1)},
    {label:'H2', action:(q)=>q.format('header', 2)},
    {label:'H3', action:(q)=>q.format('header', 3)},
    {label:'Paragraph', action:(q)=>q.format('header', false)},
    {label:'Bullet list', action:(q)=>q.format('list', 'bullet')},
    {label:'Numbered list', action:(q)=>q.format('list', 'ordered')},
    {label:'Quote', action:(q)=>q.format('blockquote', true)},
    {label:'Divider', action:(q)=>{ 
      const r = q.getSelection(true);
      q.insertEmbed(r.index, 'divider', true, 'user'); 
      q.setSelection(r.index+1, 0, 'user'); 
    }},
  ];

  const BlockEmbed = Quill.import('blots/block/embed');
  class DividerBlot extends BlockEmbed { static blotName='divider'; static tagName='hr'; }
  Quill.register(DividerBlot);

  const input = document.createElement('input');
  Object.assign(input, { type:'text', placeholder:'Type to filter…' });
  Object.assign(input.style, {
    width:'100%', boxSizing:'border-box', padding:'8px 10px',
    border:'1px solid rgba(127,127,127,.25)', borderRadius:'6px',
    marginBottom:'6px', background:'transparent', color:'inherit', outline:'none'
  });
  menu.appendChild(input); menu.appendChild(list);

  function render(filtered, activeIdx=0){
    list.innerHTML='';
    filtered.forEach((it, i)=>{
      const row = document.createElement('div');
      row.textContent = it.label;
      Object.assign(row.style, {
        padding:'6px 8px', borderRadius:'6px', cursor:'pointer',
        background: i===activeIdx ? 'rgba(127,127,127,.15)' : 'transparent'
      });
      row.onmousedown = (e)=>{ e.preventDefault(); pick(it); };
      list.appendChild(row);
    });
  }

  let filtered = items.slice(), active = 0, openForQuill = null, slashIndex = null;

  function openAtCaret(q){
    openForQuill = q;
    const range = q.getSelection(true); if(!range) return;
    const b = q.getBounds(range.index);
    menu.style.left = Math.max(8, Math.min(window.innerWidth - 268, b.left)) + 'px';
    const below = b.bottom + 220 < window.scrollY + window.innerHeight;
    menu.style.top  = (below ? b.bottom + 10 : b.top - 230) + 'px';
    menu.style.display = 'block';
    input.value=''; filtered = items.slice(); active = 0; render(filtered, active);
    setTimeout(()=> input.focus(), 0);
  }
  function close(){ menu.style.display='none'; openForQuill=null; slashIndex=null; }

  function pick(it){
    if(!openForQuill) return;
    const end = openForQuill.getSelection(true)?.index ?? 0;
    const start = slashIndex ?? end;
    if(end>=start){ openForQuill.deleteText(start, end-start, 'user'); }
    it.action(openForQuill);
    close();
  }

  function activeQuill(){
    const A = document.querySelector('#editorA .ql-editor');
    const B = document.querySelector('#editorB .ql-editor');
    if (A && A.contains(document.activeElement)) return quillA;
    if (typeof quillB!=='undefined' && B && B.contains(document.activeElement)) return quillB;
    if (quillA.getSelection()) return quillA;
    if (typeof quillB!=='undefined' && quillB.getSelection()) return quillB;
    return null;
  }

  document.addEventListener('keydown', (e)=>{
    if(e.key !== '/' || e.altKey || e.metaKey || e.ctrlKey) return;
    const q = activeQuill(); if(!q) return;
    if (menu.parentNode !== q.container) q.container.appendChild(menu);
    const sel = q.getSelection(true); if(!sel) return;
    slashIndex = sel.index;
    setTimeout(()=> openAtCaret(q), 0);
  });

  input.addEventListener('input', ()=>{
    const q = input.value.trim().toLowerCase();
    filtered = items.filter(it => it.label.toLowerCase().includes(q));
    if(filtered.length===0){ close(); return; }
    active = 0; render(filtered, active);
  });

  input.addEventListener('keydown', (e)=>{
    if(e.key==='ArrowDown'){ e.preventDefault(); active = (active+1)%filtered.length; render(filtered, active); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); active = (active-1+filtered.length)%filtered.length; render(filtered, active); }
    else if(e.key==='Enter'){ e.preventDefault(); if(filtered[active]) pick(filtered[active]); }
    else if(e.key==='Escape'){ e.preventDefault(); close(); }
    else if(e.key==='Backspace'){
      const q = activeQuill(); if(!q) return;
      const now = q.getSelection(true)?.index ?? 0;
      if(slashIndex!=null && now<=slashIndex){ close(); }
    }
  });

  document.addEventListener('mousedown', (e)=>{
    if(menu.style.display==='none') return;
    if(!menu.contains(e.target)) close();
  });

  document.addEventListener('keydown', (e)=>{
    if(menu.style.display==='none') return;
    const q = activeQuill(); if(!q) return;
    if(e.key==='Backspace' || e.key==='Delete'){
      const sel = q.getSelection(true);
      if(!sel){ close(); return; }
      const prevChar = q.getText(Math.max(0, sel.index-1), 1);
      if(prevChar !== '/') {
        const txt = q.getText(0, q.getLength());
        if(!txt.includes('/')) close();
      }
    }
  });
})();

/* ---------- Backspace a inizio → focus titolo ---------- */
(function(){
  function bindBackspaceToTitle(q, titleSel){
    q.keyboard.addBinding({ key: 'Backspace' }, function(range) {
      if(range && range.index === 0){
        const title = document.querySelector(titleSel);
        if(title){
          title.focus();
          const r = document.createRange(); r.selectNodeContents(title); r.collapse(false);
          const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        }
        return false;
      }
      return true;
    });
  }
  bindBackspaceToTitle(quillA, '#docTitleA');
  if(typeof quillB!=='undefined') bindBackspaceToTitle(quillB, '#docTitleB');
})();
function enableParagraphPlaceholders(quill, placeholderText) {
  function togglePlaceholder() {
    const editor = quill.root;
    const selection = quill.getSelection();
    const isEmpty = editor.innerText.trim().length === 0;

    if (selection && isEmpty) {
      editor.setAttribute("data-placeholder", placeholderText);
    } else {
      editor.removeAttribute("data-placeholder");
    }
  }

  quill.on("editor-change", togglePlaceholder);
  quill.on("selection-change", togglePlaceholder);
  quill.on("text-change", togglePlaceholder);

  togglePlaceholder();
}

// attiva per i tuoi due editor
enableParagraphPlaceholders(quillA, "Write or / for command");
enableParagraphPlaceholders(quillB, "Write or / for command");
/* ---------- Stats ---------- */
(function(){
  function updateStats(q, statsSel){
    const txt = q.getText().replace(/\n+/g, '\n');
    const words = (txt.trim().match(/\S+/g) || []).length;
    const chars = txt.length;
    const mins  = Math.max(1, Math.round(words/200));
    const el = document.querySelector(statsSel);
    if(el) el.textContent = `${words} words • ${chars} chars • ${mins} min`;
    const sd = document.getElementById('statsDock');
    if(sd) sd.textContent = `${words} words • ${chars} chars • ${mins} min`;
  }
  quillA.on('text-change', ()=> updateStats(quillA, '#statsA'));
  updateStats(quillA, '#statsA');
  if(typeof quillB!=='undefined'){
    quillB.on('text-change', ()=> updateStats(quillB, '#statsB'));
    updateStats(quillB, '#statsB');
  }
 // --- Demote header vuoto a paragrafo con Backspace/Delete/Enter ---
function installHeadingDemoteOnRoot(quill){
  quill.root.addEventListener('keydown', function(e){
    if(!(e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter')) return;

    const range = quill.getSelection(true);
    if(!range) return;

    const fmt = quill.getFormat(range);
    if(!fmt || !fmt.header) return; // non siamo in un heading

    const [line, offset] = quill.getLine(range.index);
    if(!line) return;

    // testo "visivo" della riga (senza zero-width)
    const lineIndex = quill.getIndex(line);
    const lineLength = line.length();
    const lineText = quill.getText(lineIndex, lineLength).replace(/\u200B/g,'').trim();

    // Se è VUOTO → togli header e resta sulla stessa riga
    if(lineText === ''){
      e.preventDefault();
      quill.formatLine(range.index, 1, { header: false });
      quill.setSelection(lineIndex, 0, 'user'); // caret all'inizio del paragrafo
    }
  });
}

installHeadingDemoteOnRoot(quillA);
if (typeof quillB !== 'undefined') installHeadingDemoteOnRoot(quillB);
})(); 
  window.addEventListener('DOMContentLoaded', () => {
    // ===== Theme toggle =====
    const themeBtn = document.getElementById('themeToggle');
    const knob = document.getElementById('themeKnob');
    const railTheme = document.getElementById('railTheme');
    const sun = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
    const moon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    function setTheme(theme){
      document.body.classList.remove('theme-dark','theme-light');
      document.body.classList.add(theme);
      try{ localStorage.setItem('smartdocs_theme', theme); }catch{}
      const icon = theme==='theme-light' ? sun : moon;
      if(knob) knob.innerHTML = icon;
      if(railTheme) railTheme.innerHTML = icon;
    }
    (function initTheme(){
      try{
        const saved = localStorage.getItem('smartdocs_theme');
        const prefersLight = typeof window.matchMedia==='function' && window.matchMedia('(prefers-color-scheme: light)').matches;
        setTheme(saved || (prefersLight ? 'theme-light' : 'theme-dark'));
      }catch{ setTheme('theme-dark'); }
    })();
    const toggleTheme=()=>setTheme(document.body.classList.contains('theme-light')?'theme-dark':'theme-light');
    themeBtn?.addEventListener('click', toggleTheme);
    railTheme?.addEventListener('click', toggleTheme);

    // ===== Helpers CSS var / sidebar base width =====
    const getVarPx = (name)=>{
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const n = parseInt(v, 10);
      return isNaN(n) ? 0 : n;
    };
    const setVarPx = (name, valuePx)=> document.documentElement.style.setProperty(name, `${Math.round(valuePx)}px`);
    const SIDEBAR_BASE_W = getVarPx('--sidebar-w') || 260;

    // ===== DOM refs =====
    const docListEl = document.getElementById('docList');
    const search = document.getElementById('search');
    const searchBtn = document.getElementById('searchBtn');

    const docsAdd = document.getElementById('docsAdd');
    const sidebarResizer = document.getElementById('sidebarResizer');
    const breadcrumbsEl = document.getElementById('breadcrumbs');

    const collapseToggle = document.getElementById('collapseToggle');
    const railToggle = document.getElementById('railToggle');
    const railAdd = document.getElementById('railAdd');
    const railDocs = document.getElementById('railDocs');
    const railSearch = document.getElementById('railSearch');
    const railSettings = document.getElementById('railSettings');
    const settingsBtn = document.getElementById('settingsBtn');

    // TRASH triggers
    const trashRow = document.getElementById('trashRow');
    const railTrash = document.getElementById('railTrash');

    // Flyout refs (creati on-demand)
    let trashPanel = null, trashListEl = null, trashSearch = null, trashEmptyBtn = null;
    let outsideHandler = null, escHandler = null, repositionHandler = null;

    const workspace = document.getElementById('workspace');
    const paneA = document.getElementById('paneA');
    const paneB = document.getElementById('paneB');
    const resizer = document.getElementById('resizer'); // non più usato (resta nascosto via CSS)
    const closeB = document.getElementById('closeB');

    const titleA = document.getElementById('docTitleA');
    const titleB = document.getElementById('docTitleB');
    const editableA = document.getElementById('editableA');
    const editableB = document.getElementById('editableB');
    const statsA = document.getElementById('statsA');
    const statsB = document.getElementById('statsB');

    const divTogA = document.getElementById('dividerToggleA');
    const chPanelA = document.getElementById('childrenPanelA');
    const chLabelA = document.getElementById('childrenLabelA');
    const chListA = document.getElementById('childrenListA');

    const divTogB = document.getElementById('dividerToggleB');
    const chPanelB = document.getElementById('childrenPanelB');
    const chLabelB = document.getElementById('childrenLabelB');
    const chListB = document.getElementById('childrenListB');

    // ===== Stats Dock =====
    let statsDock = null;
    function ensureStatsDock(){
      statsDock = document.getElementById('statsDock') || statsDock;
      if (statsDock) return;
      statsDock = document.createElement('div');
      statsDock.id = 'statsDock';
      statsDock.className = 'stats-dock';
      statsDock.textContent = '0 words • 0 chars • 0 min';
      document.body.appendChild(statsDock);
    }
    function setStatsDock(words=0, chars=0, mins=0){
      if(!statsDock) return;
      statsDock.textContent = `${words} words • ${chars} chars • ${mins} min`;
    }

    // ===== State =====
    const store = { docs: [], expanded:{}, primaryId:null, secondaryId:null };
    const trashState = { expanded: {} };
    const childrenState = { A: { expanded:{} }, B:{ expanded:{} } };

    const newId = ()=>Math.random().toString(36).slice(2,10);
    const stripHtml = (h)=>{ const tmp=document.createElement('div'); tmp.innerHTML=h; return tmp.textContent||''; };

    // figli NON eliminati / eliminati
    const getChildren = (pid)=>store.docs.filter(d=>d.parentId===pid && !d.deleted).sort((a,b)=>b.order-a.order);
    const getChildrenAny = (pid)=>store.docs.filter(d=>d.parentId===pid).sort((a,b)=>b.order-a.order);
    const getChildrenDeleted = (pid)=>store.docs.filter(d=>d.parentId===pid && d.deleted).sort((a,b)=>b.order-a.order);

    const nextOrderTop = (pid)=>{ const sib=getChildren(pid); return sib.length? (sib[0].order+1) : 0; };
    const isDescendant = (id, ancestorId)=>{
      let cur = store.docs.find(d=>d.id===id);
      while(cur && cur.parentId!=null){ if(cur.parentId===ancestorId) return true; cur = store.docs.find(d=>d.id===cur.parentId); }
      return false;
    };

    function getTopRootDocId(){
      const roots = store.docs
        .filter(d=>d.parentId===null && !d.deleted)
        .sort((a,b)=>b.order-a.order);
      return roots[0]?.id || null;
    }

    // ===== Trash helpers =====
    const insideBg = ()=>{
      const light = getComputedStyle(document.documentElement).getPropertyValue('--inside-bg-light').trim() || 'rgba(124,136,255,.16)';
      const dark  = getComputedStyle(document.documentElement).getPropertyValue('--inside-bg-dark').trim()  || 'rgba(124,136,255,.14)';
      return document.body.classList.contains('theme-light') ? light : dark;
    };

    const trashSVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
    const restoreSVG = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="none"
     stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <line x1="17" y1="17" x2="7" y2="7"></line>
  <polyline points="7 17 7 7 17 7"></polyline>
</svg>`;
    const backSVG = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="none"
     stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="15 18 9 12 15 6"></polyline>
</svg>`;

    function collectSubtreeIds(rootId){
      const out=[rootId];
      (function walk(id){ getChildrenAny(id).forEach(ch=>{ out.push(ch.id); walk(ch.id); }); })(rootId);
      return out;
    }

    function moveToTrash(rootId){
      const batch = newId();
      const ids = collectSubtreeIds(rootId);
      ids.forEach(id=>{
        const d = store.docs.find(x=>x.id===id);
        if(!d || d.deleted) return;
        d.deleted = true; d.deletedAt = Date.now(); d.deletedBatch = batch;
        if(d.prevParentId===undefined) d.prevParentId = d.parentId;
        if(d.prevOrder===undefined) d.prevOrder = d.order;
      });

      if(store.primaryId && ids.includes(store.primaryId)){
        store.primaryId = getTopRootDocId();
        loadPane('A');
      }
      if(store.secondaryId && ids.includes(store.secondaryId)){ closePanel(); }

      renderTree(); renderTrashList();
    }

    function restoreFromTrash(rootId){
      const ids = collectSubtreeIds(rootId);
      ids.forEach(id=>{
        const d = store.docs.find(x=>x.id===id);
        if(!d || !d.deleted) return;
        d.deleted = false;
        if(d.prevOrder!==undefined) d.order = d.prevOrder;
        d.deletedAt = undefined; d.deletedBatch = undefined;
      });
      let cur = store.docs.find(x=>x.id===rootId);
      while(cur && cur.parentId!=null){ store.expanded[cur.parentId]=true; cur = store.docs.find(x=>x.id===cur.parentId); }
      renderTree(); renderTrashList();
    }

    function deleteForever(rootId){
      const ids = new Set(collectSubtreeIds(rootId));
      store.docs = store.docs.filter(d=>!ids.has(d.id));
      renderTree(); renderTrashList();
    }
    function emptyTrash(){ store.docs = store.docs.filter(d=>!d.deleted); renderTree(); renderTrashList(); }

    // ===== Flyout =====
    function ensureTrashFlyout(){
      if(trashPanel) return;
      trashPanel = document.createElement('div');
      trashPanel.id = 'trashFlyout';
      trashPanel.className = 'trash-flyout';

      const body = document.createElement('div'); body.className = 'flyout-body';

      trashSearch = document.createElement('input');
      trashSearch.type = 'search'; trashSearch.id = 'trashSearch';
      trashSearch.placeholder = 'Search documents';
      trashSearch.addEventListener('input', renderTrashList);

      trashListEl = document.createElement('div');
      trashListEl.id = 'trashList'; trashListEl.className = 'trash-list';

      const foot = document.createElement('div'); foot.className = 'flyout-foot';
      trashEmptyBtn = document.createElement('button');
      trashEmptyBtn.id = 'trashEmpty'; trashEmptyBtn.className = 'primary-btn danger';
      trashEmptyBtn.textContent = 'Empty trash';
      trashEmptyBtn.addEventListener('click', ()=>{ if(confirm('Empty trash permanently?')) emptyTrash(); });

      body.appendChild(trashSearch); body.appendChild(trashListEl);
      foot.appendChild(trashEmptyBtn);
      trashPanel.appendChild(body); trashPanel.appendChild(foot);
      document.body.appendChild(trashPanel);
    }

    function positionTrashFlyout(){
      if(!trashPanel || !trashRow) return;
      const rect = trashRow.getBoundingClientRect();
      const flyoutH = trashPanel.offsetHeight || 0;
      const margin = 8;

      const sd = document.getElementById('statsDock');
      let bottomClear = margin + 8;
      if(sd){
        const sdr = sd.getBoundingClientRect();
        if(sdr && sdr.height) bottomClear = Math.max(margin + 8, sdr.height + 18);
      }

      let top = rect.top;
      const maxTop = Math.max(margin, window.innerHeight - flyoutH - bottomClear);
      const minTop = margin;
      if(top > maxTop) top = maxTop;
      if(top < minTop) top = minTop;
      trashPanel.style.top = `${top}px`;
    }

    function openTrashPanel(){
      ensureTrashFlyout();
      renderTrashList();
      trashPanel.style.display = 'block';
      positionTrashFlyout();
      setTimeout(()=>trashSearch?.focus(), 10);

      outsideHandler = (e)=>{
        if(!trashPanel) return;
        const insideFlyout = trashPanel.contains(e.target);
        const onTrigger = trashRow && trashRow.contains(e.target);
        if(!insideFlyout && !onTrigger) closeTrashPanel();
      };
      document.addEventListener('mousedown', outsideHandler, true);

      escHandler = (e)=>{ if(e.key==='Escape') closeTrashPanel(); };
      document.addEventListener('keydown', escHandler);

      repositionHandler = ()=>positionTrashFlyout();
      window.addEventListener('resize', repositionHandler);
      document.addEventListener('scroll', repositionHandler, true);
    }
    function closeTrashPanel(){
      if(trashPanel) trashPanel.style.display='none';
      if(outsideHandler){ document.removeEventListener('mousedown', outsideHandler, true); outsideHandler=null; }
      if(escHandler){ document.removeEventListener('keydown', escHandler); escHandler=null; }
      if(repositionHandler){ window.removeEventListener('resize', repositionHandler); document.removeEventListener('scroll', repositionHandler, true); repositionHandler=null; }
    }
    function toggleTrashPanel(){ ensureTrashFlyout(); (trashPanel.style.display!=='block') ? openTrashPanel() : closeTrashPanel(); }

    // === TRASH: albero + search ===
    function getDeletedRoots(){
      const byId = Object.fromEntries(store.docs.map(d=>[d.id,d]));
      return store.docs.filter(d=>{
        if(!d.deleted) return false;
        const p = d.parentId && byId[d.parentId];
        return !p || !p.deleted;
      }).sort((a,b)=>b.order-a.order);
    }
    function getAncestorsIds(id){
      const out=[]; let cur = store.docs.find(x=>x.id===id);
      while(cur && cur.parentId!=null){ out.push(cur.parentId); cur = store.docs.find(d=>d.id===cur.parentId); }
      return out;
    }
    function collectDeletedDescendantsIds(id){
      const out=[]; (function walk(pid){ getChildrenDeleted(pid).forEach(ch=>{ out.push(ch.id); walk(ch.id); }); })(id);
      return out;
    }
    function computeTrashVisibility(q){
      if(!q) return {visible:null, expand:null};
      const query = q.trim().toLowerCase();
      const visible = new Set(); const expand = new Set();
      const deleted = store.docs.filter(d=>d.deleted);
      deleted.forEach(d=>{
        const text = ((d.title||'')+' '+stripHtml(d.bodyHtml||'')).toLowerCase();
        if(text.includes(query)){
          visible.add(d.id);
          getAncestorsIds(d.id).forEach(aid=>{ visible.add(aid); expand.add(aid); });
          collectDeletedDescendantsIds(d.id).forEach(cid=>visible.add(cid));
        }
      });
      return {visible, expand};
    }

    function renderTrashList(){
      if(!trashListEl){ ensureTrashFlyout(); }
      if(!trashListEl) return;

      const q = (trashSearch?.value||'').trim();
      const {visible, expand} = computeTrashVisibility(q);
      trashListEl.innerHTML = '';

      const roots = getDeletedRoots();
      if(roots.length===0){
        const empty = document.createElement('div');
        empty.style.opacity='.65'; empty.style.padding='8px 2px'; empty.textContent='Empty';
        trashListEl.appendChild(empty); positionTrashFlyout(); return;
      }
      const isVisible = (d)=>!visible || visible.has(d.id);
      const isExpanded = (d)=> (expand && expand.has(d.id)) || !!trashState.expanded[d.id];

      function renderNode(node, depth){
        if(!isVisible(node)) return;

        const row = document.createElement('div');
        row.className = 'trash-item';

        const left = document.createElement('div');
        left.className = 'trash-left';
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.style.minWidth = '0';
        left.style.flex = '1';
        left.style.gap = 'var(--twisty-gap)';
        left.style.paddingLeft = (4 + depth * 16) + 'px';

        const kids = getChildrenDeleted(node.id);
        const hasChildren = kids.length>0;

        const twisty=document.createElement('span');
        twisty.className='twisty';
        twisty.innerHTML = hasChildren ? (isExpanded(node)?'▾':'▸') : '';
        if(hasChildren){
          twisty.setAttribute('role','button'); twisty.setAttribute('tabindex','0');
          const toggle=()=>{
            if(expand && expand.has(node.id)) return;
            trashState.expanded[node.id] = !trashState.expanded[node.id];
            renderTrashList();
          };
          twisty.addEventListener('click', (e)=>{ e.stopPropagation(); toggle(); });
          twisty.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); e.stopPropagation(); toggle(); }});
        }

        const label = document.createElement('div');
        label.className='trash-title';
        label.textContent = node.title || 'Untitled';

        left.appendChild(twisty);
        left.appendChild(label);

        const btns = document.createElement('div'); btns.className='trash-actions';
        const restoreBtn=document.createElement('button'); restoreBtn.className='icon-btn btn-restore'; restoreBtn.title='Restore'; restoreBtn.innerHTML=restoreSVG;
        restoreBtn.addEventListener('click',()=>restoreFromTrash(node.id));
        const delBtn=document.createElement('button'); delBtn.className='icon-btn btn-del'; delBtn.title='Delete forever'; delBtn.innerHTML=trashSVG;
        delBtn.addEventListener('click',()=>{ if(confirm('Delete permanently?')) deleteForever(node.id); });
        btns.appendChild(restoreBtn); btns.appendChild(delBtn);

        row.appendChild(left);
        row.appendChild(btns);
        trashListEl.appendChild(row);

        if(hasChildren && isExpanded(node)){
          kids.forEach(ch=>{ if(!visible || visible.has(ch.id)) renderNode(ch, depth+1); });
        }
      }

      if(!visible){ roots.forEach(r=>renderNode(r,0)); }
      else {
        roots.forEach(r=>{
          const anyVisible = visible.has(r.id) || collectDeletedDescendantsIds(r.id).some(id=>visible.has(id));
          if(anyVisible) renderNode(r,0);
        });
      }
      positionTrashFlyout();
    }

    // ===== Add/Open doc =====
    function addDoc(name='Untitled', parentId=null, openNow=true){
      const id = newId();
      const order = nextOrderTop(parentId);
      store.docs.push({ id, parentId, title: name, bodyHtml: '', order, deleted:false });
      if (parentId) store.expanded[parentId] = true;
      if (openNow) { store.primaryId = id; renderTree(); loadPane('A'); }
      else { renderTree(); }
      return { id };
    }

    // ===== Search (lista principale) =====
    function matchesFilter(doc, f){
      if(!f) return true;
      const text=(doc.title||'') + ' ' + (stripHtml(doc.bodyHtml||''));
      return text.toLowerCase().includes(f);
    }

    // ===== Children dropdown (pane) =====
    function renderChildrenPanelFor(doc, side){
      const divTog = side==='A'?divTogA:divTogB;
      const chPanel = side==='A'?chPanelA:chPanelB;
      const chLabel = side==='A'?chLabelA:chLabelB;
      const chList  = side==='A'?chListA:chListB;
      const expanded = (side==='A'?childrenState.A:childrenState.B).expanded;

      const roots = getChildren(doc.id);
      const has = roots.length>0;

      divTog?.classList.toggle('hidden', !has);
      if(!has){
        chPanel && (chPanel.style.display = 'none');
        divTog?.setAttribute('aria-expanded','false');
        return;
      }

      if(chLabel){
        chLabel.textContent = 'Content';
        const headEl = chLabel.parentElement;
        if(headEl){
          let backBtn = headEl.querySelector('.children-back');
          if(!backBtn){
            backBtn = document.createElement('button');
            backBtn.className = 'icon-btn children-back';
            backBtn.title = 'Back';
            backBtn.setAttribute('aria-label','Back');
            backBtn.innerHTML = backSVG;
            headEl.appendChild(backBtn);
          }
          const cur = store.docs.find(x=>x.id===doc.id);
          const parentId = cur?.parentId ?? null;
          if(!parentId){
            backBtn.style.visibility = 'hidden';
            backBtn.disabled = true;
          }else{
            backBtn.style.visibility = 'visible';
            backBtn.disabled = false;
            backBtn.onclick = ()=> {
              if(side==='A'){ store.primaryId = parentId; loadPane('A'); }
              else { store.secondaryId = parentId; loadPane('B'); }
              renderTree();
            };
          }
        }
      }

      if(chList) chList.innerHTML='';
      function renderNode(node, depth){
        const row=document.createElement('div'); row.className='children-item';
        row.style.cursor = 'pointer';

        const left=document.createElement('div');
        left.style.display='flex';
        left.style.alignItems='center';
        left.style.minWidth='0';
        left.style.flex='1';
        left.style.gap='var(--twisty-gap)';
        left.style.paddingLeft = (4 + depth*16) + 'px';
        left.style.cursor = 'pointer';

        const kids=getChildren(node.id);
        const hasChildren = kids.length>0;
        const isOpen = !!expanded[node.id];

        const twisty=document.createElement('span'); twisty.className='twisty';
        twisty.innerHTML = hasChildren ? (isOpen?'▾':'▸') : '';
        if(hasChildren){
          twisty.setAttribute('role','button'); twisty.setAttribute('tabindex','0');
          const toggle=()=>{ expanded[node.id] = !expanded[node.id]; renderChildrenPanelFor(doc, side); };
          twisty.addEventListener('click',(e)=>{ e.stopPropagation(); toggle(); });
          twisty.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); e.stopPropagation(); toggle(); }});
        }

        const label=document.createElement('div'); label.className='children-label';
        label.textContent = node.title || 'Untitled';
        label.style.cursor = 'pointer';
        label.addEventListener('click',()=>{
          if(side==='A'){ store.primaryId=node.id; loadPane('A'); }
          else { store.secondaryId=node.id; loadPane('B'); }
          renderTree();
        });

        left.appendChild(twisty); left.appendChild(label);

        const actions=document.createElement('div'); actions.style.display='flex'; actions.style.gap='6px';
        const openPanelBtn=document.createElement('button'); openPanelBtn.className='icon-btn'; openPanelBtn.title='Open';
        openPanelBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="16" height="14" rx="3"/><path d="M9 15l6-6"/><path d="M11 9h4v4"/></svg>`;
        openPanelBtn.addEventListener('click',(e)=>{ e.stopPropagation(); openInPanel(node.id); });
        actions.appendChild(openPanelBtn);

        row.appendChild(left);
        row.appendChild(actions);
        chList && chList.appendChild(row);

        if(hasChildren && isOpen){
          kids.forEach(ch=>renderNode(ch, depth+1));
        }
      }
      roots.forEach(r=>renderNode(r,0));
    }

    function setDropdown(side, open){
      const chPanel = side==='A'?chPanelA:chPanelB;
      const divTog  = side==='A'?divTogA:divTogB;
      chPanel && (chPanel.style.display = open ? 'block' : 'none');
      divTog?.setAttribute('aria-expanded', String(open));
    }
    divTogA?.addEventListener('click',()=>{ const open = chPanelA && chPanelA.style.display!=='none'; setDropdown('A', !open); });
    divTogB?.addEventListener('click',()=>{ const open = chPanelB && chPanelB.style.display!=='none'; setDropdown('B', !open); });

    // ===== Breadcrumbs =====
    function pathTo(docId){
      const path=[];
      let cur = store.docs.find(d=>d.id===docId);
      if(!cur) return path;
      const stack=[cur];
      while(cur && cur.parentId!=null){
        cur = store.docs.find(d=>d.id===cur.parentId);
        if(cur) stack.push(cur);
        else break;
      }
      return stack.reverse();
    }

    function renderBreadcrumbs(){
      if(!breadcrumbsEl) return;
      const curId = store.primaryId;
      const cur = store.docs.find(d=>d.id===curId);
      if(!cur){ breadcrumbsEl.innerHTML=''; breadcrumbsEl.style.display='none'; return; }

      const trail = pathTo(curId);
      const MAX = 3;

      breadcrumbsEl.innerHTML='';
      breadcrumbsEl.style.display='flex';

      if(trail.length > MAX){
        const backBtn = document.createElement('button');
        backBtn.className = 'crumb-back';
        backBtn.type = 'button';
        backBtn.title = 'Back';
        backBtn.textContent = '←';
        backBtn.addEventListener('click', ()=>{
          if(cur.parentId){
            store.primaryId = cur.parentId;
            loadPane('A');
            renderTree();
          }
        });
        breadcrumbsEl.appendChild(backBtn);
      }

      const start = Math.max(0, trail.length - MAX);
      for(let i=start;i<trail.length;i++){
        const d = trail[i];
        const isCurrent = (i === trail.length - 1);

        if(!isCurrent){
          const btn = document.createElement('button');
          btn.className = 'crumb';
          btn.type = 'button';
          btn.textContent = d.title || 'Untitled';
          btn.addEventListener('click', ()=>{
            store.primaryId = d.id; loadPane('A'); renderTree();
          });
          breadcrumbsEl.appendChild(btn);

          const sep = document.createElement('span');
          sep.className = 'crumb-sep';
          sep.textContent = '›';
          breadcrumbsEl.appendChild(sep);
        }else{
          const curEl = document.createElement('span');
          curEl.className = 'crumb current';
          curEl.textContent = d.title || 'Untitled';
          breadcrumbsEl.appendChild(curEl);
        }
      }
    }

    // ===== Tree + Drag&Drop (SIDEBAR) =====
    function renderNodeInTree(doc, depth, container, f){
      if(doc.deleted) return;
      if(!matchesFilter(doc,f)) return;

      const row=document.createElement('div'); row.className='doc-row';
      const item = document.createElement('div');
      const activeClass =
        (doc.id === store.primaryId ? ' active-primary' :
         doc.id === store.secondaryId ? ' active-secondary' : '');
      item.className = 'doc-item' + activeClass; item.draggable = true;

      const left=document.createElement('div'); left.className='doc-left'; left.style.paddingLeft=(4+depth*16)+'px';
      const hasChildren = getChildren(doc.id).length>0;

      const twisty=document.createElement('span'); twisty.className='twisty';
      twisty.innerHTML = hasChildren ? (store.expanded[doc.id]?'▾':'▸') : '';
      if(hasChildren){
        twisty.setAttribute('role','button'); twisty.setAttribute('tabindex','0');
        twisty.title = store.expanded[doc.id] ? 'Comprimi' : 'Espandi';
        const toggle = ()=>{ store.expanded[doc.id]=!store.expanded[doc.id]; renderTree(); };
        twisty.addEventListener('click',(e)=>{ e.stopPropagation(); toggle(); });
        twisty.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); e.stopPropagation(); toggle(); }});
        const applyHover = (on)=>{
          twisty.style.borderRadius = on ? '8px' : '';
          twisty.style.background = on
            ? (document.body.classList.contains('theme-light')
                ? 'rgba(15,17,21,.12)'
                : 'rgba(255,255,255,.14)')
            : '';
        };
        twisty.addEventListener('mouseenter',()=>applyHover(true));
        twisty.addEventListener('mouseleave',()=>applyHover(false));
        twisty.addEventListener('focus',()=>applyHover(true));
        twisty.addEventListener('blur',()=>applyHover(false));
      }

      const title=document.createElement('span'); title.className='doc-title'; title.textContent=doc.title||'Untitled';
      left.appendChild(twisty); left.appendChild(title);

      const actions=document.createElement('div'); actions.className='doc-actions';
      const addChildBtn=document.createElement('button'); addChildBtn.className='icon-btn'; addChildBtn.title='Nuovo sotto-documento'; addChildBtn.textContent='+';
      addChildBtn.addEventListener('click',(e)=>{ e.stopPropagation(); addDoc('Untitled', doc.id, true); });
      const openPanelBtn=document.createElement('button'); openPanelBtn.className='icon-btn'; openPanelBtn.title='Apri in pannello';
      openPanelBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="16" height="14" rx="3"/><path d="M9 15l6-6"/><path d="M11 9h4v4"/></svg>`;
      openPanelBtn.addEventListener('click',(e)=>{e.stopPropagation(); openInPanel(doc.id);});
      actions.appendChild(addChildBtn); actions.appendChild(openPanelBtn);

      item.addEventListener('click',()=>{ store.primaryId=doc.id; loadPane('A'); renderTree(); });

      // DnD
      item.addEventListener('dragstart',(e)=>{ e.dataTransfer.setData('text/plain', doc.id); e.dataTransfer.effectAllowed = 'move'; });
      item.addEventListener('dragover',(e)=>{
        e.preventDefault();
        const rect = item.getBoundingClientRect(); const y = e.clientY - rect.top;
        const zone = y < rect.height*0.25 ? 'before' : y > rect.height*0.75 ? 'after' : 'inside';
        item.classList.toggle('drop-before', zone==='before');
        item.classList.toggle('drop-after', zone==='after');
        item.classList.toggle('drop-inside', zone==='inside');
      });
      item.addEventListener('dragleave',()=>{ item.classList.remove('drop-before','drop-after','drop-inside'); });
      item.addEventListener('drop',(e)=>{
        e.preventDefault(); item.classList.remove('drop-before','drop-after','drop-inside');
        const dragId = e.dataTransfer.getData('text/plain'); if(!dragId || dragId===doc.id) return;
        const dragged = store.docs.find(d=>d.id===dragId); if(!dragged || dragged.deleted) return;

        const rect = item.getBoundingClientRect(); const y = e.clientY - rect.top;
        const zone = y < rect.height*0.25 ? 'before' : y > rect.height*0.75 ? 'after' : 'inside';

        if(zone==='inside'){
          if(isDescendant(doc.id, dragged.id)) return;
          dragged.parentId = doc.id; dragged.order = nextOrderTop(doc.id); store.expanded[doc.id]=true;
        } else {
          const found = store.docs.find(d=>d.id===doc.id);
          const parentId = found && found.parentId!=null ? found.parentId : null;
          dragged.parentId = parentId;
          const siblings = getChildren(parentId);
          const tgtIndex = siblings.findIndex(s=>s.id===doc.id);
          const curIndex = siblings.findIndex(s=>s.id===dragId);
          if(curIndex>-1) siblings.splice(curIndex,1);
          const newIndex = zone==='before' ? tgtIndex : tgtIndex+1;
          siblings.splice(newIndex,0,dragged);
          siblings.forEach((s,i)=>{ s.order = siblings.length-1-i; });
        }
        renderTree();
      });

      item.appendChild(left); item.appendChild(actions); container.appendChild(item);

      if(store.expanded[doc.id]){ getChildren(doc.id).forEach(ch=>renderNodeInTree(ch, depth+1, container, f)); }
    }

    function renderTree(){
      if(!docListEl) return;
      const f=(search?.value||'').trim().toLowerCase();
      docListEl.innerHTML='';
      store.docs.filter(d=>d.parentId===null && !d.deleted).sort((a,b)=>b.order-a.order).forEach(r=>renderNodeInTree(r,0,docListEl,f));
      renderBreadcrumbs();
    }

    // ===== Search toggle =====
    function toggleSearch(show){ if(!search) return; search.style.display = show? 'block':'none'; }
    searchBtn?.addEventListener('click',()=>{ const show=search.style.display!=='block'; toggleSearch(show); if(show) setTimeout(()=>search?.focus(), 10); });
    search?.addEventListener('input', renderTree);

    // ===== Sidebar collapse =====
    const setCollapsed = (v)=>document.body.classList.toggle('sidebar-collapsed', v);
    const isCollapsed = ()=>document.body.classList.contains('sidebar-collapsed');
    const toggleSidebar = ()=> setCollapsed(!isCollapsed());
    const collapseSidebar = ()=> setCollapsed(true);
    const expandSidebar   = ()=>{
      const wasCollapsed = isCollapsed();
      setCollapsed(false);
      if (wasCollapsed) { setVarPx('--sidebar-w', SIDEBAR_BASE_W); }
    };
    collapseToggle?.addEventListener('click', toggleSidebar);

    // rail
    railToggle?.addEventListener('click', expandSidebar);
    railDocs?.addEventListener('click',()=>{ expandSidebar(); docListEl?.scrollTo?.({top:0, behavior:'smooth'}); });
    railSearch?.addEventListener('click',()=>{ expandSidebar(); toggleSearch(true); setTimeout(()=>search?.focus(), 50); });
    railAdd?.addEventListener('click',()=>{ addDoc('Untitled'); expandSidebar(); });
    railSettings?.addEventListener('click', ()=> alert('Impostazioni: in arrivo 🙂'));

    // TRASH triggers
    railTrash?.addEventListener('click',()=>{ expandSidebar(); openTrashPanel(); });
    trashRow?.addEventListener('click', ()=> toggleTrashPanel());
    trashRow?.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); toggleTrashPanel(); } });

    // DnD sul cestino
    trashRow?.addEventListener('dragover',(e)=>{ e.preventDefault(); trashRow.style.background = insideBg(); });
    trashRow?.addEventListener('dragleave',()=>{ trashRow.style.background = ''; });
    trashRow?.addEventListener('drop',(e)=>{
      e.preventDefault(); trashRow.style.background = '';
      const dragId = e.dataTransfer.getData('text/plain'); if(!dragId) return;
      const dragged = store.docs.find(d=>d.id===dragId); if(!dragged || dragged.deleted) return;
      moveToTrash(dragged.id);
    });

    // ===== Editor helpers =====
    function ensureFirstParagraph(editEl){
      if(editEl.childNodes.length===0){
        const p=document.createElement('p'); p.innerHTML='<br>'; editEl.appendChild(p);
      }
    }
    function ensureVisibleCaretBr(editEl){
      editEl.querySelectorAll('p, li').forEach(p=>{
        const txt = p.textContent.replace(/\u200B/g,'').trim();
        if(p.innerHTML==='' || txt===''){ p.innerHTML='<br>'; }
      });
    }

    // blocchi
    const BLOCK_TAGS = /^(P|DIV|H1|H2|H3|BLOCKQUOTE|UL|OL)$/i;
    function blockAncestorIn(editEl){
      let node = window.getSelection()?.anchorNode || editEl;
      if(node.nodeType===3) node = node.parentElement;
      while(node && node!==editEl){
        if(/^(P|DIV|H1|H2|H3|LI|BLOCKQUOTE)$/i.test(node.tagName)) return node;
        node = node.parentElement;
      }
      return editEl;
    }
    function isAtStartOfFirstBlock(editEl){
      const sel=window.getSelection(); if(!sel||!sel.rangeCount||!sel.isCollapsed) return false;
      let block = blockAncestorIn(editEl);
      if(!block || block===editEl) return false;

      let priorExists = false;
      if(block.tagName==='LI'){
        if(block.previousElementSibling) priorExists = true;
        else {
          let prev = block.parentElement.previousElementSibling;
          while(prev && !BLOCK_TAGS.test(prev.tagName)) prev = prev.previousElementSibling;
          priorExists = !!prev;
        }
      }else{
        let prev = block.previousElementSibling;
        while(prev && !BLOCK_TAGS.test(prev.tagName)) prev = prev.previousElementSibling;
        priorExists = !!prev;
      }
      if(priorExists) return false;

      const r = sel.getRangeAt(0).cloneRange();
      const pre = r.cloneRange(); pre.selectNodeContents(block); pre.setEnd(r.startContainer, r.startOffset);
      const atStartOfBlock = pre.toString().replace(/\u200B/g,'') === '';
      return atStartOfBlock;
    }
    function caretAtStartOf(node){
      const sel = window.getSelection(); if(!sel || !sel.rangeCount || !sel.isCollapsed) return false;
      const r = sel.getRangeAt(0).cloneRange();
      const pre = r.cloneRange(); pre.selectNodeContents(node); pre.setEnd(r.startContainer, r.startOffset);
      return pre.toString().length===0;
    }
    function focusFirstParagraphStart(editEl){
      ensureFirstParagraph(editEl);
      const first = editEl.querySelector('p, h1, h2, h3, blockquote, ul, ol') || editEl.firstChild;
      if(!first) return;
      if(first.tagName === 'UL' || first.tagName === 'OL'){
        const li = first.querySelector('li') || first.firstChild;
        if(li) placeCaretAtStart(li);
        else placeCaretAtStart(first);
      }else{
        placeCaretAtStart(first);
      }
    }

    // save/restore selection
    let savedRange = null;
    function saveSelection(){
      const sel = window.getSelection();
      if(sel && sel.rangeCount){ savedRange = sel.getRangeAt(0).cloneRange(); }
    }
    function restoreSelection(){
      if(!savedRange) return;
      const sel = window.getSelection();
      try{ sel.removeAllRanges(); sel.addRange(savedRange); }catch{}
    }

    // ===== Title helpers: input OR contenteditable =====
    const isInputLike = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    function getTitleValue(el){ return el?.isContentEditable ? (el.textContent || '') : (el?.value || ''); }
    function setTitleValue(el, v){ if(!el) return; if(el.isContentEditable){ el.textContent = v || ''; } else { el.value = v || ''; } }
    function focusTitleEnd(el){
      if(!el) return;
      el.focus();
      const v = getTitleValue(el);
      if(el.isContentEditable){
        const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      } else {
        el.setSelectionRange?.(v.length, v.length);
      }
    }

    // ======= LIST UTILS (indent/outdent/exit/convert) =======
    function isEmptyLi(li){
      if(!li) return false;
      const txt = (li.textContent || '').replace(/\u200B/g,'').trim();
      return txt === '' || li.innerHTML.toLowerCase() === '<br>';
    }

    function wrapPrevAsSublist(prevLi, listTag){
      let sub = prevLi.querySelector(':scope > ul, :scope > ol');
      if(!sub){
        sub = document.createElement(listTag);
        prevLi.appendChild(sub);
      }
      return sub;
    }

    function indentListItem(li){
      const prev = li.previousElementSibling;
      if(!prev) return;
      const parentList = li.parentElement;
      const listTag = parentList.tagName.toLowerCase();
      const sub = wrapPrevAsSublist(prev, listTag);
      sub.appendChild(li);
      placeCaretAtStart(li);
    }

    function outdentListItem(li){
      const parentList = li.parentElement;
      const parentLi   = parentList?.parentElement;
      if(!parentList) return;

      if(parentLi && parentLi.tagName === 'LI'){
        parentLi.after(li);
        placeCaretAtStart(li);
        if(parentList.children.length === 0) parentList.remove();
      } else {
        const p = document.createElement('p'); p.innerHTML = li.innerHTML || '<br>';
        parentList.replaceChild(p, li);
        if(parentList.children.length === 0){
          parentList.after(p);
          parentList.remove();
        }
        placeCaretAtStart(p);
      }
    }

    function exitEmptyLi(li){
      const list = li.parentElement; if(!list) return;
      const wasOnly = (list.children.length === 1);
      li.remove();

      const p = document.createElement('p'); p.innerHTML = '<br>';

      if(wasOnly){
        list.replaceWith(p);
      } else {
        list.after(p);
      }
      placeCaretAtStart(p);
    }

    function convertPToList(blk, ordered=false){
      const list = document.createElement(ordered ? 'ol' : 'ul');
      const li = document.createElement('li');
      li.innerHTML = '<br>';
      list.appendChild(li);
      blk.replaceWith(list);
      placeCaretAtStart(li);
      return list;
    }

    function startsWithOrderedMarker(s){
      return /^1[.)]$/.test(s);
    }

    // ===== Binding titolo + editor =====
    function bindTitleAndEditor(titleEl, editEl, statsEl, side){
      if(titleEl && !titleEl.dataset.bound){
        titleEl.addEventListener('keydown',(e)=>{
          if(e.key==='Enter' || e.key==='ArrowDown'){
            e.preventDefault();
            editEl.focus();
            focusFirstParagraphStart(editEl);
          }
        });
        titleEl.addEventListener('input', ()=>{
          const id = (side==='A') ? store.primaryId : store.secondaryId;
          const d = store.docs.find(x=>x.id===id);
          if(d){ d.title = getTitleValue(titleEl) || ''; renderTree(); if(side==='A') renderBreadcrumbs(); }
        });
        titleEl.dataset.bound = '1';
      }

      if(editEl && !editEl.dataset.bound){
        editEl.addEventListener('keydown',(e)=>{
          if((e.key==='ArrowUp' || e.key==='Backspace' || e.key==='Delete') && isAtStartOfFirstBlock(editEl)){
            e.preventDefault(); focusTitleEnd(titleEl); return;
          }

          // Smart bullets: "-␣", "*␣", "1.␣" o "1)␣" -> lista
          if(e.key===' ' && !e.shiftKey && !e.altKey && !e.metaKey){
            const sel = window.getSelection();
            if(sel && sel.isCollapsed){
              let blk = blockAncestorIn(editEl);
              if(blk && blk.tagName==='P'){
                const r = sel.getRangeAt(0).cloneRange();
                r.setStart(blk,0);
                const prev = r.toString().trim();
                if(prev==='-' || prev==='*' || startsWithOrderedMarker(prev)){
                  e.preventDefault();
                  const rr = sel.getRangeAt(0);
                  rr.setStart(blk,0);
                  rr.setEnd(blk.firstChild||blk, (blk.firstChild?.length||blk.textContent.length||1));
                  try{ rr.deleteContents(); }catch{}
                  const ordered = startsWithOrderedMarker(prev);
                  convertPToList(blk, ordered);
                  updateStats(editEl, statsEl);
                  return;
                }
              }
            }
          }

          // Tab / Shift+Tab su LI -> indent/outdent
          if(e.key === 'Tab'){
            const li = blockAncestorIn(editEl);
            if(li && li.tagName === 'LI'){
              e.preventDefault();
              if(e.shiftKey) outdentListItem(li);
              else indentListItem(li);
              updateStats(editEl, statsEl);
              return;
            }
          }

          // Enter su LI vuoto -> esci dalla lista
          if(e.key==='Enter' && !e.shiftKey){
            const li = blockAncestorIn(editEl);
            if(li && li.tagName === 'LI' && isEmptyLi(li)){
              e.preventDefault();
              exitEmptyLi(li);
              updateStats(editEl, statsEl);
              return;
            }
            setTimeout(()=> ensureVisibleCaretBr(editEl), 0);
          }

          // Backspace su <li> vuoto -> torna a <p>
          if(e.key==='Backspace' && !e.shiftKey && !e.altKey && !e.metaKey){
            const sel = window.getSelection();
            if(sel && sel.isCollapsed){
              const li = blockAncestorIn(editEl);
              if(li && li.tagName==='LI' && caretAtStartOf(li)){
                const plain = li.textContent.replace(/\u200B/g,'').trim();
                if(plain==='' || li.innerHTML.toLowerCase()==='<br>'){
                  e.preventDefault();
                  const p = document.createElement('p'); p.innerHTML = '<br>';
                  const ul = li.parentNode;
                  ul.replaceChild(p, li);
                  placeCaretAtStart(p);
                  if(ul && ul.children.length===0){ ul.remove(); }
                  updateStats(editEl, statsEl);
                  return;
                }
              }
            }
          }
        });

        editEl.addEventListener('input',()=>{
          ensureVisibleCaretBr(editEl);
          updateStats(editEl, statsEl);
        });

        // Toggle todo done
        editEl.addEventListener('change',(e)=>{
          const t = e.target;
          if(t && t.matches('.todo-list input[type="checkbox"]')){
            t.closest('li')?.classList.toggle('done', t.checked);
          }
        });

        // Slash menu (Shift+7 o '/')
        editEl.addEventListener('keydown', (e)=>{
          if(((e.code==='Digit7' && e.shiftKey) || e.key==='/') && !e.altKey && !e.metaKey){
            e.preventDefault();
            saveSelection();
            openSlashMenuAtCaret(editEl);
          }
        });

        editEl.addEventListener('mouseup', saveSelection);
        editEl.addEventListener('keyup', saveSelection);

        editEl.dataset.bound = '1';
      }
      updateStats(editEl, statsEl);
    }

    function updateStats(editEl, statsEl){
      const txt = editEl?.innerText || '';
      const words = (txt.trim().match(/\S+/g)||[]).length;
      const chars = txt.length;
      const mins = Math.max(1, Math.round(words/200));
      if(statsEl) statsEl.textContent = `${words} words • ${chars} chars • ${mins} min`;
      const id = (editEl===editableA)? store.primaryId : (editEl===editableB)? store.secondaryId : null;
      const d = id ? store.docs.find(x=>x.id===id) : null;
      if(d) d.bodyHtml = editEl?.innerHTML || '';
      setStatsDock(words, chars, mins);
    }

    function loadPane(side){
      const titleEl = side==='A'?titleA:titleB;
      const editEl  = side==='A'?editableA:editableB;
      const statsEl = side==='A'?statsA:statsB;
      const id = side==='A'?store.primaryId:store.secondaryId;
      const d = store.docs.find(x=>x.id===id);

      if(!d){
        if(titleEl) setTitleValue(titleEl,'');
        if(editEl) editEl.innerHTML='';
        updateStats(editEl, statsEl);
        if(side==='A'){ divTogA?.classList.add('hidden'); if(chPanelA) chPanelA.style.display='none'; }
        else { divTogB?.classList.add('hidden'); if(chPanelB) chPanelB.style.display='none'; }
        if(side==='A') renderBreadcrumbs();
        return;
      }
      if(titleEl) setTitleValue(titleEl, d.title||'');
      if(editEl) { editEl.innerHTML = d.bodyHtml||'<p><br></p>'; ensureFirstParagraph(editEl); ensureVisibleCaretBr(editEl); }
      bindTitleAndEditor(titleEl, editEl, statsEl, side);
      renderChildrenPanelFor(d, side);
      if(side==='A') renderBreadcrumbs();
      updateStats(editEl, statsEl);
    }

    // ===== Split 50/50 con hairline + grip (draggable) =====
    let hairline = null, grip = null;
    function updateSplitUI(){
      if(!hairline || !grip) return;
      const wsRect = workspace.getBoundingClientRect();
      const aRect = paneA.getBoundingClientRect();
      const leftPx = aRect.right - wsRect.left;
      hairline.style.left = `${Math.round(leftPx)}px`;
      grip.style.left = `${Math.round(leftPx - grip.offsetWidth/2)}px`;
    }
    function ensureEdgeResizers(){
      if(hairline && grip) return;

      paneA.style.position = 'relative';
      paneB.style.position = 'relative';
      workspace.style.position = 'relative';

      hairline = document.createElement('div');
      hairline.className = 'split-hairline';
      Object.assign(hairline.style, {
        position:'absolute', top:'25%', height:'50%', width:'1px',
        background:'currentColor', opacity:'0.25', pointerEvents:'none'
      });
      workspace.appendChild(hairline);

      grip = document.createElement('div');
      grip.className = 'split-grip';
      Object.assign(grip.style, {
        position:'absolute', top:'25%', height:'50%', width:'10px',
        cursor:'col-resize', background:'transparent'
      });
      workspace.appendChild(grip);

      const startDrag = (e)=>{
        e.preventDefault();
        let dragging=true;
        const total = workspace.getBoundingClientRect().width;
        const startX = e.clientX;
        const startLeft = paneA.getBoundingClientRect().width;
        const min = 260;

        const onMove = (ev)=>{
          if(!dragging) return;
          const dx = ev.clientX - startX;
          let left = startLeft + dx;
          left = Math.max(min, Math.min(total - min, left));
          paneA.style.flex = `0 0 ${left}px`;
          paneB.style.flex = `1 1 ${total - left}px`;
          hairline.style.left = `${Math.round(left)}px`;
          grip.style.left = `${Math.round(left - grip.offsetWidth/2)}px`;
        };
        const onUp = ()=>{
          dragging=false;
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          document.body.style.userSelect='';
        };
        document.body.style.userSelect='none';
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      };
      grip.addEventListener('mousedown', startDrag);
      grip.addEventListener('mousedown', (e)=> e.preventDefault());
      window.addEventListener('resize', updateSplitUI);

      updateSplitUI();
    }
    function removeEdgeResizers(){
      hairline?.remove();   hairline = null;
      grip?.remove();       grip = null;
    }
    function openInPanel(docId){
      store.secondaryId = docId;
      paneB.style.display = 'flex';
      paneA.style.flex = '0 0 50%';
      paneB.style.flex = '1 1 50%';
      workspace.classList.add('two-up');
      ensureEdgeResizers();
      loadPane('B'); renderTree();
    }
    function closePanel(){
      store.secondaryId = null;
      paneB.style.display = 'none';
      paneA.style.flex = '';
      workspace.classList.remove('two-up');
      removeEdgeResizers();
      renderTree();
    }
    closeB?.addEventListener('click', closePanel);

    // ===== [+] Documents =====
    docsAdd?.addEventListener('click', ()=>{ addDoc('Untitled'); });

    // ===== Sidebar width resizer =====
    (function setupSidebarWidthResizer(){
      if(!sidebarResizer) return;
      const MAX_DELTA = 140;
      let dragging=false, sx=0, startW=SIDEBAR_BASE_W;

      sidebarResizer.addEventListener('mousedown', (e)=>{
        if(document.body.classList.contains('sidebar-collapsed')) return;
        dragging = true;
        sx = e.clientX;
        startW = getVarPx('--sidebar-w') || SIDEBAR_BASE_W;
        document.body.style.userSelect='none';
        document.body.style.cursor='col-resize';
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e)=>{
        if(!dragging) return;
        const dx = e.clientX - sx;
        let target = startW + dx;
        const min = SIDEBAR_BASE_W;
        const max = SIDEBAR_BASE_W + MAX_DELTA;
        if (target < min) target = min;
        if (target > max) target = max;
        setVarPx('--sidebar-w', target);
      });

      window.addEventListener('mouseup', ()=>{
        if(!dragging) return;
        dragging=false;
        document.body.style.userSelect='';
        document.body.style.cursor='';
      });

      sidebarResizer.addEventListener('dblclick', ()=>{
        if(document.body.classList.contains('sidebar-collapsed')) return;
        setVarPx('--sidebar-w', SIDEBAR_BASE_W);
      });
    })();

    // ===== Slash menu (con filtro) & Inline toolbar =====
    let slashMenuEl = null, inlineToolbarEl = null;
    const COLORS = ['#111111','#666666','#8B5E3C','#E67E22','#F1C40F','#2ECC71','#3498DB','#8E44AD','#E84393','#E74C3C'];

    function closeAllPopups(){
      if(slashMenuEl){ slashMenuEl.remove(); slashMenuEl=null; }
      if(inlineToolbarEl){
        const menus = inlineToolbarEl.querySelectorAll?.('.menu');
        menus && menus.forEach(m=>m.remove());
      }
    }

    function getSelectionRect(){
      const sel = window.getSelection();
      if(!sel || sel.rangeCount===0) return null;
      const r = sel.getRangeAt(0).cloneRange();
      const rect = r.getBoundingClientRect();
      if(rect && rect.width && rect.height) return rect;
      const node = sel.anchorNode?.nodeType===1 ? sel.anchorNode : sel.anchorNode?.parentElement;
      return node ? node.getBoundingClientRect() : null;
    }

    function caretRect(){
      const sel = window.getSelection();
      if(!sel || sel.rangeCount===0) return null;
      const r = sel.getRangeAt(0);
      if(!r.collapsed){
        const rr = r.cloneRange(); const rect = rr.getBoundingClientRect();
        if(rect && rect.width && rect.height) return rect;
      }
      const span = document.createElement('span');
      span.style.display='inline-block'; span.style.width='0'; span.style.height='1em';
      span.style.verticalAlign='baseline'; span.textContent='\u200b';
      const rr = r.cloneRange(); rr.collapse(true); rr.insertNode(span);
      const rect = span.getBoundingClientRect();
      const out = rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
      span.parentNode && span.parentNode.removeChild(span);
      return out;
    }

    function transformBlock(editEl, tag){
      const current = blockAncestorIn(editEl);
      if(!current || current===editEl) return;
      if(current.tagName===tag.toUpperCase()) return;
      const newEl = document.createElement(tag);
      while(current.firstChild) newEl.appendChild(current.firstChild);
      current.replaceWith(newEl);
      placeCaretAtStart(newEl);
      updateStats(editEl, editEl===editableA?statsA:statsB);
    }

    function toggleQuote(editEl){
      const cur = blockAncestorIn(editEl);
      if(!cur || cur===editEl) return;
      if(cur.tagName==='BLOCKQUOTE'){
        const parent = cur.parentNode;
        while(cur.firstChild) parent.insertBefore(cur.firstChild, cur);
        parent.removeChild(cur);
      }else{
        const q = document.createElement('blockquote');
        cur.replaceWith(q); q.appendChild(cur);
      }
      updateStats(editEl, editEl===editableA?statsA:statsB);
    }

    function insertDivider(editEl){
      const hr = document.createElement('hr');
      const sel = window.getSelection();
      if(sel && sel.rangeCount){
        const r = sel.getRangeAt(0); r.collapse(false);
        r.insertNode(hr);
        const p = document.createElement('p'); p.innerHTML = '<br>';
        hr.parentNode.insertBefore(p, hr.nextSibling);
        placeCaretAtStart(p);
      }else{
        editEl.appendChild(hr);
      }
      updateStats(editEl, editEl===editableA?statsA:statsB);
    }

    function insertTodoList(editEl){
      const ul = document.createElement('ul'); ul.className='todo-list';
      const li = document.createElement('li');
      const cb = document.createElement('input'); cb.type='checkbox';
      const span = document.createElement('span'); span.innerHTML='<br>';
      li.appendChild(cb); li.appendChild(span);
      ul.appendChild(li);

      const sel = window.getSelection();
      if(sel && sel.rangeCount){
        const r = sel.getRangeAt(0); r.collapse(false);
        r.insertNode(ul);
        placeCaretIn(span);
      }else{
        editEl.appendChild(ul); placeCaretIn(span);
      }
      updateStats(editEl, editEl===editableA?statsA:statsB);
    }

    function placeCaretAtStart(el){
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
    function placeCaretIn(el){
      const r = document.createRange();
      r.selectNodeContents(el); r.collapse(false);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }

    // Slash menu con filtro
    function openSlashMenuAtCaret(editEl){
      closeAllPopups();
      saveSelection();
      const rect = caretRect() || getSelectionRect(); if(!rect) return;

      slashMenuEl = document.createElement('div');
      slashMenuEl.className='slash-menu';

      const filter = document.createElement('input');
      filter.type='text';
      filter.placeholder='Cerca azioni...';
      filter.style.width='calc(100% - 20px)';
      filter.style.margin='8px 10px 4px';
      filter.style.padding='8px 10px';
      filter.style.border='1px solid var(--border)';
      filter.style.borderRadius='8px';
      filter.addEventListener('keydown', (e)=> e.stopPropagation());

      const listBox = document.createElement('div');

      const items = [
        ['H1', ()=>transformBlock(editEl,'h1')],
        ['H2', ()=>transformBlock(editEl,'h2')],
        ['H3', ()=>transformBlock(editEl,'h3')],
        ['Paragraph', ()=>transformBlock(editEl,'p')],
        ['Bullet list', ()=>document.execCommand('insertUnorderedList')],
        ['To-do list', ()=>insertTodoList(editEl)],
        ['Quote', ()=>toggleQuote(editEl)],
        ['Divider', ()=>insertDivider(editEl)]
      ].map(([label,fn])=>({label,fn}));

      let filtered = items.slice();
      let active = 0;

      function renderList(){
        listBox.innerHTML='';
        filtered.forEach((it,idx)=>{
          const row = document.createElement('div'); row.className='item';
          const ic = document.createElement('div'); ic.className='icon'; ic.textContent='•';
          const tx = document.createElement('div'); tx.textContent = it.label;
          row.append(ic,tx);
          row.style.background = idx===active ? (document.body.classList.contains('theme-light')?'rgba(15,17,21,.08)':'rgba(255,255,255,.08)') : '';
          row.addEventListener('mousedown',(ev)=>{ ev.preventDefault(); restoreSelection(); it.fn(); closeAllPopups(); });
          listBox.appendChild(row);
        });
      }

      function applyFilter(){
        const q = filter.value.trim().toLowerCase();
        filtered = items.filter(it => it.label.toLowerCase().includes(q));
        active = 0;
        renderList();
      }

      filter.addEventListener('input', applyFilter);
      filter.addEventListener('keydown', (e)=>{
        if(e.key==='ArrowDown'){ e.preventDefault(); if(filtered.length){ active = (active+1)%filtered.length; renderList(); } }
        else if(e.key==='ArrowUp'){ e.preventDefault(); if(filtered.length){ active = (active-1+filtered.length)%filtered.length; renderList(); } }
        else if(e.key==='Enter'){ e.preventDefault(); if(filtered[active]){ restoreSelection(); filtered[active].fn(); closeAllPopups(); } }
        else if(e.key==='Escape'){ e.preventDefault(); closeAllPopups(); }
      });

      slashMenuEl.append(filter, listBox);
      document.body.appendChild(slashMenuEl);

      let left = Math.max(8, Math.min(window.innerWidth - slashMenuEl.offsetWidth - 8, rect.left + window.scrollX));
      let top  = rect.bottom + window.scrollY + 8;
      const maxY = window.scrollY + window.innerHeight - 8;
      if(top + slashMenuEl.offsetHeight > maxY){
        top = rect.top + window.scrollY - slashMenuEl.offsetHeight - 8;
      }
      slashMenuEl.style.left = left+'px';
      slashMenuEl.style.top  = top +'px';

      setTimeout(()=> filter.focus(), 0);
      applyFilter();

      setTimeout(()=>{
        const onDoc = (e)=>{ if(!slashMenuEl || !slashMenuEl.contains(e.target)) { closeAllPopups(); document.removeEventListener('mousedown', onDoc, true); } };
        document.addEventListener('mousedown', onDoc, true);
        const onEsc =(e)=>{ if(e.key==='Escape'){ closeAllPopups(); document.removeEventListener('keydown', onEsc); } };
        document.addEventListener('keydown', onEsc);
      }, 0);
    }

    // Inline toolbar
    function openInlineToolbar(){
      const sel = window.getSelection();
      if(!sel || sel.rangeCount===0 || sel.isCollapsed){ inlineToolbarEl?.remove(); inlineToolbarEl=null; return; }
      const rect = getSelectionRect(); if(!rect) return;

      if(!inlineToolbarEl){
        inlineToolbarEl = document.createElement('div');
        inlineToolbarEl.className='inline-toolbar';
        inlineToolbarEl.addEventListener('mousedown', (e)=> e.preventDefault());

        const mkBtn = (title, html, on)=> {
          const b = document.createElement('button'); b.className='btn'; b.title=title; b.innerHTML=html;
          b.addEventListener('mousedown',(e)=>{ e.preventDefault(); restoreSelection(); on(); });
          return b;
        };

        const btnAa = mkBtn('Transform','<span style="font-weight:700;">Aa</span>', ()=>{ toggleMenu(buildTransformMenu()); });
        const btnB  = mkBtn('Bold','<strong>B</strong>', ()=>document.execCommand('bold'));
        const btnI  = mkBtn('Italic','<em>I</em>', ()=>document.execCommand('italic'));
        const btnU  = mkBtn('Underline','<u>U</u>', ()=>document.execCommand('underline'));
        const btnS  = mkBtn('Strikethrough','<span style="text-decoration:line-through;">S</span>', ()=>document.execCommand('strikeThrough'));
        const btnAlign = mkBtn('Align','<span>≡</span>', ()=>{ toggleMenu(buildAlignMenu()); });
        const btnColor = mkBtn('Text color','<span style="font-weight:700;">A</span>', ()=>{ toggleMenu(buildColorMenu('text')); });
        const btnBg    = mkBtn('Background','<span style="display:inline-block;width:14px;height:14px;border:1px solid currentColor;"></span>', ()=>{ toggleMenu(buildColorMenu('bg')); });

        inlineToolbarEl.append(btnAa, btnB, btnI, btnU, btnS, btnAlign, btnColor, btnBg);
        document.body.appendChild(inlineToolbarEl);
      }

      const top  = Math.max(8, rect.top + window.scrollY - inlineToolbarEl.offsetHeight - 8);
      const left = Math.max(8, Math.min(window.innerWidth - inlineToolbarEl.offsetWidth - 8, rect.left + window.scrollX + (rect.width/2) - (inlineToolbarEl.offsetWidth/2)));
      inlineToolbarEl.style.top  = top+'px';
      inlineToolbarEl.style.left = left+'px';
    }

    function toggleMenu(menuEl){
      if(!inlineToolbarEl) return;
      const menus = inlineToolbarEl.querySelectorAll?.('.menu');
      menus && menus.forEach(m=>m.remove());
      if(menuEl){ inlineToolbarEl.appendChild(menuEl); }
    }

    function buildTransformMenu(){
      const m = document.createElement('div'); m.className='menu';
      const row = (label, fn)=>{
        const r=document.createElement('div'); r.className='row'; r.textContent=label;
        r.onmousedown=(e)=>{ e.preventDefault(); restoreSelection(); fn(); toggleMenu(null); };
        return r;
      };
      const editEl = currentEditEl();
      ['Paragraph','H1','H2','H3','Bullet list','To-do list','Quote','Divider'].forEach(k=>{
        let fn = null;
        switch(k){
          case 'Paragraph': fn=()=>transformBlock(editEl,'p'); break;
          case 'H1': case 'H2': case 'H3': fn=()=>transformBlock(editEl,k.toLowerCase()); break;
          case 'Bullet list': fn=()=>document.execCommand('insertUnorderedList'); break;
          case 'To-do list': fn=()=>insertTodoList(editEl); break;
          case 'Quote': fn=()=>toggleQuote(editEl); break;
          case 'Divider': fn=()=>insertDivider(editEl); break;
        }
        m.appendChild(row(k, fn));
      });
      return m;
    }

    function buildAlignMenu(){
      const m = document.createElement('div'); m.className='menu';
      const ops = [
        ['Left',  ()=>document.execCommand('justifyLeft')],
        ['Center',()=>document.execCommand('justifyCenter')],
        ['Right', ()=>document.execCommand('justifyRight')],
        ['Justify',()=>document.execCommand('justifyFull')],
      ];
      ops.forEach(([label,fn])=>{
        const r=document.createElement('div'); r.className='row'; r.textContent=label;
        r.onmousedown=(e)=>{ e.preventDefault(); restoreSelection(); fn(); toggleMenu(null); };
        m.appendChild(r);
      });
      return m;
    }

    function buildColorMenu(which){
      const m = document.createElement('div'); m.className='menu';
      const reset = document.createElement('div'); reset.className='row'; reset.textContent='Reset';
      reset.onmousedown=(e)=>{ e.preventDefault(); restoreSelection(); document.execCommand('removeFormat'); toggleMenu(null); };
      m.appendChild(reset);

      const grid = document.createElement('div'); grid.className='color-grid';
      COLORS.forEach(c=>{
        const sw = document.createElement('button');
        sw.className='color-swatch' + (which==='text'?' is-text':'');
        if(which==='text'){ sw.textContent='A'; sw.style.color=c; }
        else { sw.style.background=c; }
        sw.onmousedown=(e)=>{
          e.preventDefault(); restoreSelection();
          if(which==='text') document.execCommand('foreColor', false, c);
          else if(document.queryCommandSupported('hiliteColor')) document.execCommand('hiliteColor', false, c);
          else document.execCommand('backColor', false, c);
          toggleMenu(null);
        };
        grid.appendChild(sw);
      });
      m.appendChild(grid);
      return m;
    }

    function currentEditEl(){
      const sel = window.getSelection();
      const node = sel?.anchorNode || null;
      if(node && editableA.contains(node)) return editableA;
      if(node && editableB.contains(node)) return editableB;
      return editableA;
    }

    document.addEventListener('selectionchange', ()=>{
      const sel = window.getSelection();
      const node = sel?.anchorNode || null;
      const inA = node && editableA.contains(node);
      const inB = node && editableB.contains(node);
      if(!inA && !inB){ inlineToolbarEl?.remove(); inlineToolbarEl=null; return; }
      saveSelection();
      if(sel && !sel.isCollapsed) openInlineToolbar();
      else { inlineToolbarEl?.remove(); inlineToolbarEl=null; }
    });

    document.addEventListener('keydown', (e)=>{
      if(e.key==='Escape'){ closeAllPopups(); inlineToolbarEl?.remove(); inlineToolbarEl=null; }
    });

    // ===== Seed + init =====
    ensureStatsDock();
    addDoc('Benvenuto', null, false);
    addDoc('Secondo documento', null, false);
    store.primaryId = store.docs[0]?.id || null;
    renderTree();
    loadPane('A');

    /* === HEADINGS — BLOCCO UNICO (Notion-like) ===
       Regole:
       - Placeholder "Heading n" quando vuoto.
       - ENTER su heading vuoto → diventa <p> vuoto e resta sulla stessa riga.
       - BACKSPACE/DELETE su heading vuoto → elimina riga e va alla riga sopra (o titolo se prima riga).
       - ENTER su heading non vuoto:
           • inizio → <p> sopra
           • fine   → <p> sotto
           • in mezzo → split: parte dopo → <p> sotto
    ===================================================================== */
    (function(){
      const editables = [editableA, editableB].filter(Boolean);
      const titles    = [titleA, titleB].filter(Boolean);
      if(!editables.length) return;

      const TOPBLOCK = /^(P|DIV|H1|H2|H3|BLOCKQUOTE|UL|OL)$/i;
      const IS_HEADING = /^(H1|H2|H3)$/i;

      function previousTopBlock(node){
        let p = node.previousElementSibling;
        while(p && !TOPBLOCK.test(p.tagName)) p = p.previousElementSibling;
        return p||null;
      }
      function hasPriorTopBlock(node){ return !!previousTopBlock(node); }
      function isVisuallyEmpty(el){
        const txt  = (el?.textContent||'').replace(/\u200B/g,'').trim();
        const html = (el?.innerHTML||'').trim().toLowerCase();
        return txt==='' || html==='' || html==='<br>' || html==='<br/>' || html==='<br />';
      }
      function placeCaretAtStart(el){
        const r=document.createRange(); r.selectNodeContents(el); r.collapse(true);
        const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
      }
      function placeCaretAtEnd(el){
        const r=document.createRange(); r.selectNodeContents(el); r.collapse(false);
        const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
      }
      function focusTitleEnd(titleEl){
        if(!titleEl) return;
        titleEl.focus?.();
        if(titleEl.isContentEditable){ placeCaretAtEnd(titleEl); }
        else { const v=titleEl.value||''; titleEl.setSelectionRange?.(v.length, v.length); }
      }
      function ensureHeadingPlaceholders(root){
        root.querySelectorAll('h1,h2,h3').forEach(h=>{
          const ph = h.tagName==='H1' ? 'Heading 1' : h.tagName==='H2' ? 'Heading 2' : 'Heading 3';
          if(isVisuallyEmpty(h)){
            if(h.innerHTML.trim()==='') h.innerHTML = '<br>';
            h.setAttribute('data-empty','1');
            h.setAttribute('data-placeholder', ph);
          }else{
            h.removeAttribute('data-empty');
            if(!h.hasAttribute('data-placeholder')) h.setAttribute('data-placeholder', ph);
          }
        });
      }
      function blockAncestorIn(root){
        let n = (window.getSelection()?.anchorNode)||root;
        if(n && n.nodeType===3) n = n.parentElement;
        while(n && n!==root){
          if(/^(P|DIV|H1|H2|H3|LI|BLOCKQUOTE|UL|OL)$/i.test(n.tagName)) return n;
          n = n.parentElement;
        }
        return root;
      }
      function caretPosIn(node){ // "start" | "end" | "middle"
        const sel=window.getSelection(); if(!sel||!sel.rangeCount) return 'end';
        const r=sel.getRangeAt(0).cloneRange();
        const pre=r.cloneRange(); pre.selectNodeContents(node); pre.setEnd(r.startContainer,r.startOffset);
        const post=r.cloneRange(); post.selectNodeContents(node); post.setStart(r.endContainer,r.endOffset);
        const preEmpty  = pre.toString().replace(/\u200B/g,'')==='';
        const postEmpty = post.toString().replace(/\u200B/g,'')==='';

        if(preEmpty && !postEmpty) return 'start';
        if(!preEmpty && postEmpty) return 'end';
        if(preEmpty && postEmpty)  return 'end';
        return 'middle';
      }
      function splitHeadingToParagraphBelow(heading){
        const sel=window.getSelection(); if(!sel||!sel.rangeCount) return;
        const r=sel.getRangeAt(0);

        const before=r.cloneRange(); before.selectNodeContents(heading); before.setEnd(r.startContainer,r.startOffset);
        const after =r.cloneRange(); after.selectNodeContents(heading); after.setStart(r.endContainer,r.endOffset);

        const p=document.createElement('p'); p.innerHTML='<br>';
        const fragAfter=after.extractContents();
        p.innerHTML=''; p.appendChild(fragAfter);
        if(isVisuallyEmpty(p)) p.innerHTML='<br>';
        heading.after(p);
        placeCaretAtStart(p);
      }
      function toParagraphInPlace(h){
        const p=document.createElement('p'); p.innerHTML='<br>';
        h.replaceWith(p);
        placeCaretAtStart(p);
        return p;
      }

      // placeholders iniziali + observer
      const obs = new MutationObserver(()=> editables.forEach(ensureHeadingPlaceholders));
      editables.forEach(ed=>{
        ensureHeadingPlaceholders(ed);
        try{ obs.observe(ed, {subtree:true, childList:true, characterData:true}); }catch{}
        ed.addEventListener('input', ()=>ensureHeadingPlaceholders(ed));
      });

      // keydown in cattura: precede gli altri handler
      document.addEventListener('keydown', (e)=>{
        const idx = editables.findIndex(ed => ed.contains(e.target));
        if(idx===-1) return;
        const editEl  = editables[idx];
        const titleEl = titles[idx] || titles[0];

        const sel=window.getSelection(); if(!sel||!sel.isCollapsed) return;
        const blk = blockAncestorIn(editEl); if(!blk||blk===editEl) return;

        const isHeading = IS_HEADING.test(blk.tagName);

        // ENTER su heading vuoto → <p> vuoto e resto lì
        if(isHeading && e.key==='Enter' && !e.shiftKey && isVisuallyEmpty(blk)){
          e.preventDefault(); e.stopPropagation();
          toParagraphInPlace(blk);
          ensureHeadingPlaceholders(editEl);
          try{ updateStats?.(editEl, editEl===editableA?statsA:statsB); }catch{}
          return;
        }

        // CANC/BACKSPACE su heading vuoto → elimina riga e vai su (o titolo)
        if(isHeading && (e.key==='Delete' || e.key==='Backspace') && isVisuallyEmpty(blk)){
          e.preventDefault(); e.stopPropagation();
          const prev = previousTopBlock(blk);
          blk.remove();
          if(prev){
            if(prev.tagName==='UL' || prev.tagName==='OL'){
              const lastLi = prev.querySelector('li:last-child') || prev;
              placeCaretAtEnd(lastLi);
            }else{
              placeCaretAtEnd(prev);
            }
          }else{
            focusTitleEnd(titleEl);
          }
          ensureHeadingPlaceholders(editEl);
          try{ updateStats?.(editEl, editEl===editableA?statsA:statsB); }catch{}
          return;
        }

        // ENTER su heading NON vuoto → Notion-like (sopra/sotto/split)
        if(isHeading && e.key==='Enter' && !e.shiftKey){
          e.preventDefault(); e.stopPropagation();
          const pos = caretPosIn(blk);
          if(pos==='start'){
            const p=document.createElement('p'); p.innerHTML='<br>';
            blk.before(p); placeCaretAtStart(p);
          }else if(pos==='end'){
            const p=document.createElement('p'); p.innerHTML='<br>';
            blk.after(p);  placeCaretAtStart(p);
          }else{
            splitHeadingToParagraphBelow(blk);
          }
          return;
        }
      }, true);
    })();

  }); // <-- FINE DOMContentLoaded
})(); // <-- FINE IIFE ROOT
/* === PATCH: click sotto heading → crea riga vuota e focus (append-only) === */
(function(){
  const editables = [document.getElementById('editableA'), document.getElementById('editableB')].filter(Boolean);
  if (!editables.length) return;

  const TOP = /^(P|DIV|H1|H2|H3|BLOCKQUOTE|UL|OL)$/i;
  const IS_H = /^(H1|H2|H3)$/i;

  // trova il blocco "di riferimento" immediatamente sopra al punto Y del click
  function blockBeforeY(root, y){
    let best = null, bestTop = -Infinity;
    Array.from(root.children).forEach(el=>{
      if(!TOP.test(el.tagName)) return;
      const r = el.getBoundingClientRect();
      if (r.top <= y && r.top > bestTop){ best = el; bestTop = r.top; }
    });
    return best;
  }

  // fallback locale se placeCaretAtStart non fosse visibile in questo scope
  function _placeCaretAtStart(el){
    if (typeof placeCaretAtStart === 'function') { placeCaretAtStart(el); return; }
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  editables.forEach(ed=>{
    // clic nel "vuoto" dell'editor (target === editor): aggiungi riga sotto l'heading superiore
    ed.addEventListener('mousedown', (e)=>{
      if (e.target !== ed) return;                 // ignora click su elementi già esistenti
      const y = e.clientY;

      // aspetta un attimo per non interferire con la selezione nativa
      setTimeout(()=>{
        const before = blockBeforeY(ed, y);
        if (before && IS_H.test(before.tagName)) {
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          before.after(p);
          _placeCaretAtStart(p);
        }
      }, 0);
    });
  });
})();
/* === PATCH: bullet vuoto → Enter/Canc/Backspace = paragrafo sulla stessa riga (append-only) === */
(function(){
  const editables = [document.getElementById('editableA'), document.getElementById('editableB')].filter(Boolean);
  if(!editables.length) return;

  function isEmptyLi(li){
    if(!li) return false;
    const txt  = (li.textContent||'').replace(/\u200B/g,'').trim();
    const html = (li.innerHTML||'').trim().toLowerCase();
    return txt==='' || html==='' || html==='<br>' || html==='<br/>' || html==='<br />';
  }
  function caretAtStart(node){
    const sel = window.getSelection();
    if(!sel || !sel.rangeCount || !sel.isCollapsed) return false;
    const r = sel.getRangeAt(0).cloneRange();
    const pre = r.cloneRange(); pre.selectNodeContents(node); pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().replace(/\u200B/g,'').length === 0;
  }
  function placeCaretAtStart(el){
    const r=document.createRange(); r.selectNodeContents(el); r.collapse(true);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  function convertEmptyLiToParagraph(li){
    const list = li.parentElement;                 // UL/OL
    const onlyOne = list && list.children.length===1;
    const p = document.createElement('p'); p.innerHTML = '<br>';
    if(onlyOne){
      // sostituisci tutta la lista con un <p> allineato (niente rientri strani)
      list.replaceWith(p);
    }else{
      // sostituisci solo l'LI (la lista rimane per gli altri elementi)
      li.replaceWith(p);
    }
    placeCaretAtStart(p);
  }

  function onKeyDownCapture(e){
    const ed = editables.find(el => el.contains(e.target));
    if(!ed) return;
    const sel = window.getSelection();
    if(!sel || !sel.isCollapsed) return;

    // trova il blocco corrente
    let node = sel.anchorNode;
    if(node && node.nodeType===3) node = node.parentElement;
    while(node && node!==ed && node.tagName!=='LI'){ node = node.parentElement; }
    if(!node || node===ed) return; // non siamo in un LI

    const li = node;
    if(!isEmptyLi(li)) return;

    // Se bullet vuoto:
    //  - Enter  -> paragrafo stessa riga
    //  - Delete -> paragrafo stessa riga
    //  - Backspace (solo a inizio) -> paragrafo stessa riga
    if(e.key==='Enter' || e.key==='Delete' || (e.key==='Backspace' && caretAtStart(li))){
      e.preventDefault();
      e.stopPropagation(); // evita altri handler che portano il cursore al titolo
      convertEmptyLiToParagraph(li);
      // prova ad aggiornare le stats se disponibile
      try{ if(typeof updateStats==='function') updateStats(ed, null); }catch{}
    }
  }

  // capture=true per eseguire PRIMA di altri listener
  document.addEventListener('keydown', onKeyDownCapture, true);
})();
/* === PATCH: placeholder solo sulla riga con il cursore (append-only) === */
(function(){
  const editors = [document.getElementById('editableA'), document.getElementById('editableB')].filter(Boolean);
  if(!editors.length) return;

  // Disattiva il vecchio placeholder globale (se installato in precedenza)
  const killOld = document.createElement('style');
  killOld.textContent = `.ws-placeholder::before{content:none !important;}`;
  document.head.appendChild(killOld);

  // --- helpers locali ---
  function isVisuallyEmpty(el){
    const txt  = (el?.textContent||'').replace(/\u200B/g,'').trim();
    const html = (el?.innerHTML||'').trim().toLowerCase();
    return txt==='' || html==='' || html==='<br>' || html==='<br/>' || html==='<br />';
  }
  const BLOCK = /^(P|DIV|H1|H2|H3|BLOCKQUOTE|UL|OL|LI)$/i;
  function blockAncestorIn(root){
    let n = (window.getSelection()?.anchorNode)||root;
    if(n && n.nodeType===3) n = n.parentElement;
    while(n && n!==root){
      if(BLOCK.test(n.tagName)) return n;
      n = n.parentElement;
    }
    return root;
  }

  // Toglie il placeholder da tutti i <p> dell’editor
  function clearPlaceholders(ed){
    ed.querySelectorAll('p.ws-caret-ph').forEach(p=>p.classList.remove('ws-caret-ph'));
  }

  // Applica il placeholder SOLO al <p> dove sta il caret (se è un paragrafo vuoto)
  function updateCaretPlaceholder(ed){
    clearPlaceholders(ed);

    const sel = window.getSelection();
    if(!sel || !sel.isCollapsed) return;                 // solo caret
    const anchor = sel.anchorNode;
    if(!anchor || !ed.contains(anchor)) return;          // caret non è in questo editor

    const blk = blockAncestorIn(ed);
    if(!blk || blk===ed) return;
    if(blk.tagName!=='P') return;                        // solo paragrafi normali
    if(!isVisuallyEmpty(blk)) return;                    // solo se vuoto
    blk.classList.add('ws-caret-ph');
  }

  // Rimuovi alla perdita di focus (così all’apertura documento non vedi nulla)
  editors.forEach(ed=>{
    ed.addEventListener('focusin', ()=> updateCaretPlaceholder(ed));
    ed.addEventListener('focusout', ()=> clearPlaceholders(ed));
    ed.addEventListener('input', ()=> updateCaretPlaceholder(ed));
  });

  // Segui gli spostamenti del cursore
  document.addEventListener('selectionchange', ()=>{
    const sel = window.getSelection();
    const node = sel?.anchorNode || null;
    editors.forEach(ed=>{
      if(node && ed.contains(node)) updateCaretPlaceholder(ed);
      else clearPlaceholders(ed);
    });
  });

  // --- CSS del placeholder “seguimi” ---
  const style = document.createElement('style');
  style.textContent = `
    p.ws-caret-ph{ position:relative; min-height:1.2em; }
    p.ws-caret-ph::before{
      content: "Write or / for commands";
      position:absolute; left:0; top:0;
      pointer-events:none; user-select:none;
      transform: translateY(0.1em);
      opacity:.9;
    }
    .theme-dark  p.ws-caret-ph::before{ color: rgba(255,255,255,.32); }
    .theme-light p.ws-caret-ph::before{ color: rgba(15,17,21,.38); }
  `;
  document.head.appendChild(style);
})();
/* === PATCH V2.1: Slash menu inline — enter/backspace/delete close, offset, auto-hide on no matches === */
(function(){
  if (window.__SMARTDOCS_SLASH_INLINE_V21__) return;
  window.__SMARTDOCS_SLASH_INLINE_V21__ = true;

  window.addEventListener('DOMContentLoaded', ()=>{

    const editableA = document.getElementById('editableA');
    const editableB = document.getElementById('editableB');
    const editables = [editableA, editableB].filter(Boolean);
    if (!editables.length) return;

    const TOP = /^(P|DIV|H1|H2|H3|BLOCKQUOTE|UL|OL|LI)$/i;

    const baseItems = [
      {label:'Paragraph',   run:(root)=>transformBlockLocal(root,'p')},
      {label:'H1',          run:(root)=>transformBlockLocal(root,'h1')},
      {label:'H2',          run:(root)=>transformBlockLocal(root,'h2')},
      {label:'H3',          run:(root)=>transformBlockLocal(root,'h3')},
      {label:'Bullet list', run:()=>document.execCommand('insertUnorderedList')},
      {label:'To-do list',  run:(root)=>insertTodoListLocal(root)},
      {label:'Quote',       run:(root)=>{ const blk=blockAncestorIn(root);
        if(!blk || blk===root) return;
        if(blk.tagName==='BLOCKQUOTE'){
          const parent=blk.parentNode; while(blk.firstChild) parent.insertBefore(blk.firstChild, blk); parent.removeChild(blk);
        } else { const q=document.createElement('blockquote'); blk.replaceWith(q); q.appendChild(blk); }
      }},
      {label:'Divider',     run:(root)=>insertDividerLocal(root)}
    ];

    // ---------- helpers ----------
    function blockAncestorIn(root){
      let n = (window.getSelection()?.anchorNode)||root;
      if(n && n.nodeType===3) n = n.parentElement;
      while(n && n!==root){
        if(TOP.test(n.tagName)) return n;
        n = n.parentElement;
      }
      return root;
    }
    function placeCaretAtStart(el){
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
    function caretRect(){
      const sel = window.getSelection();
      if(!sel || !sel.rangeCount) return null;
      const r = sel.getRangeAt(0);
      if(!r.collapsed){
        const rr = r.cloneRange(); const rect = rr.getBoundingClientRect();
        if(rect && rect.width && rect.height) return rect;
      }
      const span = document.createElement('span');
      span.style.display='inline-block'; span.style.width='0'; span.style.height='1em';
      span.textContent='\u200b';
      const rr = r.cloneRange(); rr.collapse(true); rr.insertNode(span);
      const rect = span.getBoundingClientRect();
      span.parentNode && span.parentNode.removeChild(span);
      return rect || null;
    }
    function isVisuallyEmpty(el){
      const txt  = (el?.textContent||'').replace(/\u200B/g,'').trim();
      const html = (el?.innerHTML||'').trim().toLowerCase();
      return txt==='' || html==='' || html==='<br>' || html==='<br/>' || html==='<br />';
    }
    function transformBlockLocal(root, tag){
      const blk = blockAncestorIn(root); if(!blk || blk===root) return;
      if(blk.tagName==='LI'){
        const newEl = document.createElement(tag);
        while(blk.firstChild) newEl.appendChild(blk.firstChild);
        const list = blk.parentNode;
        list.replaceChild(newEl, blk);
        if(list.children.length===0) list.remove();
        if(/^h[1-3]$/i.test(tag) && isVisuallyEmpty(newEl)) newEl.innerHTML = '<br>';
        placeCaretAtStart(newEl);
        return;
      }
      if(blk.tagName.toLowerCase()===tag.toLowerCase()) return;
      const newEl = document.createElement(tag);
      while(blk.firstChild) newEl.appendChild(blk.firstChild);
      blk.replaceWith(newEl);
      if(/^h[1-3]$/i.test(tag) && isVisuallyEmpty(newEl)) newEl.innerHTML = '<br>';
      placeCaretAtStart(newEl);
    }
    function insertDividerLocal(root){
      const hr = document.createElement('hr');
      const sel = window.getSelection();
      if(sel && sel.rangeCount){
        const r = sel.getRangeAt(0); r.collapse(false);
        r.insertNode(hr);
        const p = document.createElement('p'); p.innerHTML = '<br>';
        hr.parentNode.insertBefore(p, hr.nextSibling);
        placeCaretAtStart(p);
      } else {
        root.appendChild(hr);
      }
    }
    function insertTodoListLocal(root){
      const ul = document.createElement('ul'); ul.className='todo-list';
      const li = document.createElement('li');
      const cb = document.createElement('input'); cb.type='checkbox';
      const span = document.createElement('span'); span.innerHTML='<br>';
      li.appendChild(cb); li.appendChild(span);
      ul.appendChild(li);
      const sel = window.getSelection();
      if(sel && sel.rangeCount){
        const r = sel.getRangeAt(0); r.collapse(false);
        r.insertNode(ul);
        const rr = document.createRange(); rr.selectNodeContents(span); rr.collapse(true);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(rr);
      } else {
        root.appendChild(ul); placeCaretAtStart(span);
      }
    }
    function whichEditor(){
      const sel = window.getSelection(); const node = sel?.anchorNode || null;
      if(node && editableA && editableA.contains(node)) return editableA;
      if(node && editableB && editableB.contains(node)) return editableB;
      return editableA || editableB;
    }

    // token dopo l’ultima "/"
    function getSlashQuery(root){
      const sel = window.getSelection();
      if(!sel || !sel.isCollapsed) return null;
      const blk = blockAncestorIn(root);
      if(!blk || blk===root) return null;
      const r = sel.getRangeAt(0).cloneRange();
      const pre = r.cloneRange(); pre.selectNodeContents(blk); pre.setEnd(r.startContainer, r.startOffset);
      const preText = pre.toString();
      const idx = preText.lastIndexOf('/');
      if(idx === -1) return null;
      const token = preText.slice(idx+1);
      return { token, blk, startOffsetInBlock: idx };
    }
    function removeSlashToken(root){
      const sel = window.getSelection();
      if(!sel || !sel.isCollapsed) return;
      const info = getSlashQuery(root);
      if(!info) return;
      const { blk, startOffsetInBlock } = info;
      function locate(node, offset){
        if(node.nodeType===3) return { node, offset: Math.min(offset, node.data.length) };
        for(let i=0;i<node.childNodes.length;i++){
          const child = node.childNodes[i];
          const len = (child.textContent||'').length;
          if(offset <= len) return locate(child, offset);
          offset -= len;
        }
        return { node, offset: node.childNodes.length };
      }
      const rEnd = sel.getRangeAt(0);
      const startPos = locate(blk, startOffsetInBlock);
      const rng = document.createRange();
      rng.setStart(startPos.node, startPos.offset);
      rng.setEnd(rEnd.endContainer, rEnd.endOffset);
      try{ rng.deleteContents(); }catch{}
      if(/^(P|H1|H2|H3)$/i.test(blk.tagName) && isVisuallyEmpty(blk)){
        blk.innerHTML = '<br>'; placeCaretAtStart(blk);
      }
    }

    // ---------- menu ----------
    let menuEl = null, activeIndex = 0, items = [];

    function ensureMenu(){
      if(menuEl) return menuEl;
      menuEl = document.createElement('div');
      menuEl.className = 'slash-menu';
      menuEl.innerHTML = `<div class="list"></div>`;
      document.body.appendChild(menuEl);
      return menuEl;
    }
    function positionMenu(){
      if(!menuEl) return;
      const rect = caretRect();
      const OFFSET_Y = 16; // << più distante dalla riga
      const menuW = (menuEl.offsetWidth||260);
      const left = Math.max(8, Math.min(window.innerWidth - menuW - 8, (rect?.left||0) + window.scrollX));
      let top  = (rect?.bottom||0) + window.scrollY + OFFSET_Y;
      const maxY = window.scrollY + window.innerHeight - 8;
      if(top + menuEl.offsetHeight > maxY){ top = (rect?.top||0) + window.scrollY - menuEl.offsetHeight - OFFSET_Y; }
      menuEl.style.left = left+'px';
      menuEl.style.top  = top +'px';
    }

    function closeMenu(){
      if(menuEl){
        document.removeEventListener('keydown', onKeyWhileOpen, true);
        document.removeEventListener('mousedown', onMouseDownOutside, true);
        menuEl.remove(); menuEl=null;
      }
    }
    function hideMenu(){
      if(menuEl) menuEl.style.display = 'none';
    }
    function showMenu(){
      if(menuEl) menuEl.style.display = 'block';
    }

    function renderList(){
      if(!menuEl) return;
      const listBox = menuEl.querySelector('.list');
      listBox.innerHTML = '';
      items.forEach((it, idx)=>{
        const row = document.createElement('div'); row.className='item';
        row.innerHTML = `<div class="icon">•</div><div class="tx">${it.label}</div>`;
        row.style.background = (idx===activeIndex)
          ? (document.body.classList.contains('theme-light')?'rgba(15,17,21,.08)':'rgba(255,255,255,.08)') : '';
        row.addEventListener('mousedown', (e)=>{
          e.preventDefault(); const root = whichEditor(); removeSlashToken(root); it.run(root); closeMenu();
        });
        listBox.appendChild(row);
      });
    }

    function filterFromDoc(){
      const root = whichEditor();
      const info = getSlashQuery(root);
      if(!info){ closeMenu(); return; }            // se non c’è più la "/" → chiudi
      const q = (info.token || '').trim().toLowerCase();
      items = baseItems.filter(it => it.label.toLowerCase().includes(q));
      activeIndex = items.length ? Math.min(activeIndex, items.length-1) : 0;

      if(!menuEl) ensureMenu();
      if(items.length === 0){
        hideMenu();                                 // nessun match → scompari
      }else{
        showMenu(); renderList(); positionMenu();   // ci sono match → mostra
      }
    }

    function onKeyWhileOpen(e){
      // Enter → applica selezionato e chiudi
      if(e.key==='Enter'){
        e.preventDefault();
        if(items[activeIndex]){ const root=whichEditor(); removeSlashToken(root); items[activeIndex].run(root); }
        closeMenu(); return;
      }
      // Frecce
      if(e.key==='ArrowDown'){ e.preventDefault(); if(items.length){ activeIndex=(activeIndex+1)%items.length; renderList(); } return; }
      if(e.key==='ArrowUp'){   e.preventDefault(); if(items.length){ activeIndex=(activeIndex-1+items.length)%items.length; renderList(); } return; }
      if(e.key==='Escape'){    e.preventDefault(); closeMenu(); return; }

      // Backspace/Delete → se rimuovi la "/" chiudi; altrimenti filtra
      if(e.key==='Backspace' || e.key==='Delete'){
        setTimeout(()=>{ filterFromDoc(); }, 0);
        return;
      }

      // default: lascia scrivere e poi filtra/mostra/nascondi
      setTimeout(()=>{ filterFromDoc(); }, 0);
    }
    function onMouseDownOutside(e){ if(menuEl && !menuEl.contains(e.target)) closeMenu(); }

    function openSlashInline(){
      ensureMenu();
      // se non c'è un token in corso, inserisco "/" (così vedi subito il menu)
      const root = whichEditor();
      if(!getSlashQuery(root)){
        if(document.queryCommandSupported && document.queryCommandSupported('insertText')){
          document.execCommand('insertText', false, '/');
        } else {
          const sel = window.getSelection(); if(sel && sel.rangeCount){
            const r = sel.getRangeAt(0); r.deleteContents(); r.insertNode(document.createTextNode('/')); r.collapse(false);
          }
        }
      }
      activeIndex = 0;
      renderList(); positionMenu(); showMenu();
      document.addEventListener('keydown', onKeyWhileOpen, true);
      document.addEventListener('mousedown', onMouseDownOutside, true);
      // subito un primo filtro per lo stato corrente
      setTimeout(()=>{ filterFromDoc(); }, 0);
    }

    function onKeydownCapture(e){
      const ed = editables.find(el => el.contains(e.target));
      if(!ed) return;
      if(e.altKey || e.metaKey) return;
      const isSlash = (e.key === '/');
      const isShift7 = (e.code === 'Digit7' && e.shiftKey);
      if(isSlash || isShift7){
        e.preventDefault();
        e.stopPropagation();
        openSlashInline();
      }
    }

    document.addEventListener('keydown', onKeydownCapture, true);

    // CSS
    const style = document.createElement('style');
    style.textContent = `
      .slash-menu{
        position:absolute; z-index:9999;
        min-width:220px; max-width:280px;
        background: var(--panel, var(--bg, #1a1b1e));
        color: inherit; border: 1px solid var(--border, rgba(255,255,255,.12));
        border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.25);
        padding:6px;
      }
      .slash-menu .item{
        display:flex; align-items:center; gap:10px;
        padding:8px 10px; border-radius:8px; cursor:pointer; user-select:none;
      }
      .slash-menu .item .icon{ width:16px; text-align:center; opacity:.6; }
      .slash-menu .item:hover{
        background:${document.body.classList.contains('theme-light') ? 'rgba(15,17,21,.08)' : 'rgba(255,255,255,.08)'};
      }
    `;
    document.head.appendChild(style);

  }); // fine DOMContentLoaded
})();
/* === PATCH V4.2: Liste/bullet — fix ultimo LI vuoto, caret e salto al titolo === */
(function(){
  if (window.__SMARTDOCS_LIST_PATCH_V42__) return;
  window.__SMARTDOCS_LIST_PATCH_V42__ = true;

  const editableA = document.getElementById('editableA');
  const editableB = document.getElementById('editableB');
  const editables = [editableA, editableB].filter(Boolean);
  if (!editables.length) return;

  const TOP = /^(P|DIV|H1|H2|H3|BLOCKQUOTE|UL|OL|LI)$/i;

  // ---- helpers -------------------------------------------------------------
  function isVisuallyEmpty(el){
    if(!el) return true;
    const txt  = (el.textContent||'').replace(/\u200B/g,'').replace(/\u00A0/g,' ').trim();
    if (txt!=='') return false;
    const html = (el.innerHTML||'').replace(/\s+/g,' ').toLowerCase().trim();
    // <br>, <span><br></span>, ecc.
    return html==='' || /^<(?:span[^>]*)?>?\s*<br\s*\/?>\s*<\/?(?:span)?>?$/.test(html);
  }
  function blockAncestorIn(root){
    let n = (window.getSelection()?.anchorNode)||root;
    if(n && n.nodeType===3) n = n.parentElement;
    while(n && n!==root){
      if(TOP.test(n.tagName)) return n;
      n = n.parentElement;
    }
    return root;
  }
  function caretAtStart(node){
    const sel = window.getSelection();
    if(!sel || !sel.rangeCount || !sel.isCollapsed) return false;
    const r = sel.getRangeAt(0).cloneRange();
    const pre = r.cloneRange(); pre.selectNodeContents(node); pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().replace(/\u200B/g,'').replace(/\u00A0/g,'').length === 0;
  }
  function placeCaretAtStart(el){
    const r=document.createRange(); r.selectNodeContents(el); r.collapse(true);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function safeParent(node){
    let p = node?.parentNode || null;
    if(p && p.nodeType===9) p = document.body || null; // no Document come parent
    return p;
  }
  function insertAfter(parent, newNode, refNode){
    parent.insertBefore(newNode, refNode ? refNode.nextSibling : null);
  }

  // Safety: blocca UN solo Backspace/Canc appena dopo la conversione, per evitare salto al titolo
  function armOneKeySafety(p){
    p.setAttribute('data-just-from-li','1');
    const off = () => p.removeAttribute('data-just-from-li');

    const handler = (e)=>{
      const sel = window.getSelection();
      if(!sel || !sel.isCollapsed || !p.isConnected) { cleanup(); return; }
      const inP = p.contains(sel.anchorNode);
      if(!inP){ cleanup(); return; }

      if((e.key==='Backspace' || e.key==='Delete') && caretAtStart(p)){
        // Consuma SOLO la prima pressione, poi spegni la safety
        e.preventDefault(); e.stopPropagation();
        cleanup();
      }
    };
    function cleanup(){
      document.removeEventListener('keydown', handler, true);
      off();
    }
    document.addEventListener('keydown', handler, true);
  }

  // Converte un <li> (vuoto o con testo) in <p> FUORI lista, preservando contenuto e caret
  function liToParagraph(li){
    const list = li.parentElement;             // UL/OL
    const parent = safeParent(list); if(!parent) return;

    // Costruisci <p> con il contenuto del li (senza eventuale checkbox)
    const p = document.createElement('p');
    const clone = li.cloneNode(true);
    const cb = clone.querySelector(':scope > input[type="checkbox"]');
    if(cb) cb.remove();

    if(isVisuallyEmpty(clone)) p.innerHTML = '<br>';
    else { p.innerHTML = ''; while (clone.firstChild) p.appendChild(clone.firstChild); }

    const isOnly  = (list.children.length === 1);
    const isFirst = (li.previousElementSibling == null);
    const isLast  = (li.nextElementSibling == null);

    // Inserimento garantito nel parent dell’UL/OL (mai come figlio della lista)
    if(isOnly){
      parent.replaceChild(p, list);
    } else if(isFirst){
      parent.insertBefore(p, list);
      li.remove();
      if(list.children.length===0) parent.replaceChild(p, list);
    } else if(isLast){
      insertAfter(parent, p, list);
      li.remove();
      if(list.children.length===0) parent.replaceChild(p, list);
    } else {
      // split nel mezzo → duplica la lista di coda
      const newList = document.createElement(list.tagName);
      let cursor = li.nextElementSibling;
      while(cursor){
        const next = cursor.nextElementSibling;
        newList.appendChild(cursor);
        cursor = next;
      }
      li.remove();
      insertAfter(parent, p, list);
      insertAfter(parent, newList, p);
    }

    // Normalizza eventuali wrapper e allinea caret
    p.removeAttribute('style');
    p.className = '';
    p.normalize();
    placeCaretAtStart(p);

    // Arma la safety per evitare il salto al titolo al prossimo Backspace/Canc
    armOneKeySafety(p);
    return p;
  }

  // Conversione P -> UL/OL su "-␣", "*␣", "1.␣/1)␣", preservando il testo del paragrafo
  function maybeConvertParagraphToListOnSpace(root){
    const sel = window.getSelection();
    if(!sel || !sel.isCollapsed || sel.rangeCount===0) return false;
    const blk = blockAncestorIn(root);
    if(!blk || blk===root || blk.tagName!=='P') return false;

    const r = sel.getRangeAt(0).cloneRange();
    const pre = r.cloneRange(); pre.selectNodeContents(blk); pre.setEnd(r.startContainer, r.startOffset);
    const prevRaw = pre.toString().replace(/\u200B/g,'').replace(/\u00A0/g,' ');
    const prev = prevRaw.replace(/\s+/g,' ').trim();

    const isUnordered = (prev === '-' || prev === '*');
    const isOrdered   = /^1[.)]$/.test(prev);
    if(!isUnordered && !isOrdered) return false;

    // elimina solo il marker iniziale
    try{
      const liveSel = window.getSelection();
      const toDelete = liveSel.getRangeAt(0).cloneRange();
      const markerRange = toDelete.cloneRange();
      markerRange.setStart(blk, 0);
      markerRange.setEnd(toDelete.startContainer, toDelete.startOffset);
      markerRange.deleteContents();
    }catch{}

    const list = document.createElement(isOrdered ? 'ol' : 'ul');
    const li = document.createElement('li');

    if (isVisuallyEmpty(blk)) li.innerHTML = '<br>';
    else { while(blk.firstChild){ li.appendChild(blk.firstChild); } }

    list.appendChild(li);
    blk.replaceWith(list);

    if (isVisuallyEmpty(li)) placeCaretAtStart(li);
    return true;
  }

  // ---- key handlers (capture) ----------------------------------------------
  function onKeyDownCapture(e){
    const ed = editables.find(el => el.contains(e.target));
    if(!ed) return;

    // SPACE -> P -> lista preservando testo
    if(e.key===' ' && !e.shiftKey && !e.altKey && !e.metaKey){
      const converted = maybeConvertParagraphToListOnSpace(ed);
      if(converted){ e.preventDefault(); e.stopPropagation(); return; }
    }

    const sel = window.getSelection();
    if(!sel || !sel.isCollapsed) return;
    let node = sel.anchorNode;
    if(node && node.nodeType===3) node = node.parentElement;
    while(node && node!==ed && node.tagName!=='LI'){ node = node.parentElement; }
    if(!node || node===ed) return; // non siamo in un LI
    const li = node;

    // ENTER su LI vuoto -> <p> stessa riga (fuori lista)
    if(e.key==='Enter' && !e.shiftKey){
      if(isVisuallyEmpty(li)){ e.preventDefault(); e.stopPropagation(); liToParagraph(li); return; }
      return; // default = nuovo LI
    }

    // DELETE su LI vuoto -> <p> stessa riga (fuori lista)
    if(e.key==='Delete'){
      if(isVisuallyEmpty(li)){ e.preventDefault(); e.stopPropagation(); liToParagraph(li); return; }
      return;
    }

    // BACKSPACE:
    // - LI vuoto -> <p>
    // - caret a inizio LI con testo -> togli bullet mantenendo il testo (-> <p>)
    if(e.key==='Backspace' && !e.shiftKey && !e.altKey && !e.metaKey){
      if(isVisuallyEmpty(li)){ e.preventDefault(); e.stopPropagation(); liToParagraph(li); return; }
      if(caretAtStart(li)){ e.preventDefault(); e.stopPropagation(); liToParagraph(li); return; }
    }
  }

  document.addEventListener('keydown', onKeyDownCapture, true);
})();
/* === PATCH v5 BULLETS (Notion-like) ====================================== */
(function(){
  if (window.__SMARTDOCS_BULLETS_V5__) return;
  window.__SMARTDOCS_BULLETS_V5__ = true;

  const editables = [document.getElementById('editableA'), document.getElementById('editableB')].filter(Boolean);
  if(!editables.length) return;

  const MARKERS_RE = /^(?:-|\\*|1[.)])$/;

  // --- helpers -------------------------------------------------------------
  const isEmptyNode = (el)=>{
    if(!el) return true;
    const txt=(el.textContent||'').replace(/\u200B/g,'').replace(/\u00A0/g,' ').trim();
    if(txt!=='') return false;
    const html=(el.innerHTML||'').replace(/\s+/g,' ').toLowerCase().trim();
    return html==='' || html==='<br>' || html==='<br/>' || html==='<br />';
  };
  const placeStart = (el)=>{ const r=document.createRange(); r.selectNodeContents(el); r.collapse(true);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); };
  const blockAncestorIn = (root)=>{
    let n = (window.getSelection()?.anchorNode)||root;
    if(n && n.nodeType===3) n=n.parentElement;
    while(n && n!==root){
      if(/^(P|DIV|H1|H2|H3|BLOCKQUOTE|UL|OL|LI)$/i.test(n.tagName)) return n;
      n = n.parentElement;
    }
    return root;
  };
  const caretAtStart = (node)=>{
    const sel=window.getSelection(); if(!sel||!sel.rangeCount||!sel.isCollapsed) return false;
    const r=sel.getRangeAt(0).cloneRange(); const pre=r.cloneRange();
    pre.selectNodeContents(node); pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().replace(/\u200B/g,'').replace(/\u00A0/g,'').length===0;
  };

  function pToListOnSpace(p){
    const sel=window.getSelection(); if(!sel||!sel.isCollapsed) return false;
    const r=sel.getRangeAt(0).cloneRange();
    const pre=r.cloneRange(); pre.selectNodeContents(p); pre.setEnd(r.startContainer, r.startOffset);
    const prev = pre.toString().replace(/\u200B/g,'').replace(/\u00A0/g,' ').trim();
    if(!MARKERS_RE.test(prev)) return false;

    // cancella solo il marker
    try{
      const live=window.getSelection().getRangeAt(0).cloneRange();
      const marker=live.cloneRange(); marker.setStart(p,0); marker.setEnd(live.startContainer, live.startOffset);
      marker.deleteContents();
    }catch{}

    const ordered = /^1[.)]$/.test(prev);
    const list = document.createElement(ordered?'ol':'ul');
    const li = document.createElement('li');

    if(isEmptyNode(p)) li.innerHTML='<br>';
    else while(p.firstChild) li.appendChild(p.firstChild);

    list.appendChild(li);
    p.replaceWith(list);
    placeStart(li);
    return true;
  }

  function liToParagraph(li){
    const list = li.parentElement; if(!list) return;
    const parent = list.parentNode;

    const p = document.createElement('p');
    // copia contenuto li, togliendo eventuale checkbox todo
    const clone = li.cloneNode(true);
    clone.querySelector(':scope > input[type="checkbox"]')?.remove();
    if(isEmptyNode(clone)) p.innerHTML = '<br>'; else { p.innerHTML=''; while(clone.firstChild) p.appendChild(clone.firstChild); }

    const only = list.children.length===1;
    const first= !li.previousElementSibling;
    const last = !li.nextElementSibling;

    if(only){
      parent.replaceChild(p, list);
    }else if(first){
      parent.insertBefore(p, list);
      li.remove();
    }else if(last){
      parent.insertBefore(p, list.nextSibling);
      li.remove();
    }else{
      // split la lista
      const tail = document.createElement(list.tagName);
      for(let cur=li.nextElementSibling; cur; ){ const next=cur.nextElementSibling; tail.appendChild(cur); cur=next; }
      li.remove();
      parent.insertBefore(p, list.nextSibling);
      parent.insertBefore(tail, p.nextSibling);
    }

    p.removeAttribute('style'); p.className='';
    placeStart(p);
  }

  function unwrapLiWithText(li){
    // togli bullet ma preserva testo → <p> prima/dopo la lista a seconda della posizione
    liToParagraph(li);
  }

  // --- handler principale (capture) ----------------------------------------
  function onKeyDownCapture(e){
    const ed = editables.find(el => el.contains(e.target));
    if(!ed) return;

    // SPACE: P -> UL/OL (preserva testo)
    if(e.key===' ' && !e.shiftKey && !e.altKey && !e.metaKey){
      const blk = blockAncestorIn(ed);
      if(blk && blk.tagName==='P'){
        const done = pToListOnSpace(blk);
        if(done){ e.preventDefault(); e.stopPropagation(); return; }
      }
    }

    const sel=window.getSelection(); if(!sel||!sel.isCollapsed) return;
    let node = sel.anchorNode; if(node && node.nodeType===3) node=node.parentElement;
    while(node && node!==ed && node.tagName!=='LI') node=node.parentElement;
    if(!node || node===ed) return;

    const li = node;

    // ENTER su LI vuoto → esci a <p>
    if(e.key==='Enter' && !e.shiftKey){
      if(isEmptyNode(li)){ e.preventDefault(); e.stopPropagation(); liToParagraph(li); return; }
      return; // default: nuovo LI
    }

    // DELETE su LI vuoto → esci a <p>
    if(e.key==='Delete'){
      if(isEmptyNode(li)){ e.preventDefault(); e.stopPropagation(); liToParagraph(li); return; }
      return;
    }

    // BACKSPACE:
    // - LI vuoto -> <p>
    // - caret a inizio LI con testo -> togli bullet mantenendo testo
    if(e.key==='Backspace' && !e.shiftKey && !e.altKey && !e.metaKey){
      if(isEmptyNode(li)){ e.preventDefault(); e.stopPropagation(); liToParagraph(li); return; }
      if(caretAtStart(li)){ e.preventDefault(); e.stopPropagation(); unwrapLiWithText(li); return; }
    }
  }

  document.addEventListener('keydown', onKeyDownCapture, true);
})();
/* === PATCH SlashMenu tweaks (close on / removal, close on 0 match, offset) === */
(function(){
  if (window.__SMARTDOCS_SLASH_TWEAKS_V2__) return;
  window.__SMARTDOCS_SLASH_TWEAKS_V2__ = true;

  const SLASH_MENU_SELECTOR = '.slash-menu';

  function getSlashMenu(){ return document.querySelector(SLASH_MENU_SELECTOR); }
  function closeSlash(){ const m=getSlashMenu(); if(m) m.remove(); }

  // 1) chiudi se si rimuove la "/" con backspace o delete
  document.addEventListener('keydown', (e)=>{
    const menu = getSlashMenu(); if(!menu) return;
    if(e.key!=='Backspace' && e.key!=='Delete') return;

    // verifichiamo dopo che il browser ha cancellato il carattere
    setTimeout(()=>{
      const sel = window.getSelection();
      const n = sel?.anchorNode;
      if(!n) return;
      // prendi il testo della riga (blocco)
      let blk = n.nodeType===3 ? n.parentElement : n;
      while(blk && !/^(P|H1|H2|H3|LI|BLOCKQUOTE|DIV)$/i.test(blk.tagName)) blk = blk.parentElement;
      if(!blk) return;

      const text = (blk.textContent||'').replace(/\u200B/g,'');
      const beforeCaret = (()=>{ // testo fino al caret
        if(!sel || !sel.rangeCount) return text;
        const r = sel.getRangeAt(0).cloneRange();
        const pre = r.cloneRange(); pre.selectNodeContents(blk); pre.setEnd(r.startContainer, r.startOffset);
        return pre.toString();
      })();

      // se non c'è più "/" immediatamente prima del caret, chiudi
      if(!beforeCaret.endsWith('/')) closeSlash();
    }, 0);
  }, true);

  // 2) chiudi se lista vuota (0 match) — controlliamo dinamicamente
  const obs = new MutationObserver(()=>{
    const m = getSlashMenu(); if(!m) return;
    const items = m.querySelectorAll('.item');
    if(items.length===0) closeSlash();
    // 3) extra offset: abbasso un filo il menu
    if(m && !m.dataset.bumped){
      const t = parseFloat(m.style.top||'0')||0;
      m.style.top = (t + 10) + 'px';
      m.dataset.bumped = '1';
    }
  });
  const startObs = ()=>{
    const m = getSlashMenu(); if(!m) return;
    try{ obs.observe(m, {childList:true, subtree:true}); }catch{}
  };
  const stopObs = ()=> obs.disconnect();

  const mo = new MutationObserver(()=>{
    if(getSlashMenu()) { stopObs(); startObs(); }
  });
  try{ mo.observe(document.body, {childList:true, subtree:true}); }catch{}
})();
/* === HOTFIX — Empty bullet: Backspace/Delete behaves like Enter (exit list) === */
(function(){
  if (window.__SMARTDOCS_EMPTY_BULLET_HOTFIX__) return;
  window.__SMARTDOCS_EMPTY_BULLET_HOTFIX__ = true;

  const editors = [document.getElementById('editableA'), document.getElementById('editableB')].filter(Boolean);
  if (!editors.length) return;

  // Helpers
  function isEmptyNode(el){
    if(!el) return true;
    const txt = (el.textContent||'').replace(/\u200B/g,'').replace(/\u00A0/g,' ').trim();
    if(txt!=='') return false;
    const html = (el.innerHTML||'').replace(/\s+/g,' ').toLowerCase().trim();
    return html==='' || html==='<br>' || html==='<br/>' || html==='<br />';
  }
  function placeStart(el){
    const r=document.createRange(); r.selectNodeContents(el); r.collapse(true);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function liToParagraph(li){
    const list = li.parentElement; if(!list) return;
    const parent = list.parentNode;

    const p = document.createElement('p'); p.innerHTML = '<br>';

    const only = list.children.length===1;
    const first = !li.previousElementSibling;
    const last  = !li.nextElementSibling;

    if (only){
      parent.replaceChild(p, list);
    } else if (first){
      parent.insertBefore(p, list);
      li.remove();
    } else if (last){
      parent.insertBefore(p, list.nextSibling);
      li.remove();
    } else {
      // split la lista in due parti attorno all'LI corrente
      const tail = document.createElement(list.tagName);
      for(let cur=li.nextElementSibling; cur; ){
        const next=cur.nextElementSibling;
        tail.appendChild(cur);
        cur=next;
      }
      li.remove();
      parent.insertBefore(p, list.nextSibling);
      parent.insertBefore(tail, p.nextSibling);
    }
    placeStart(p);
  }

  // Listener con massima priorità
  window.addEventListener('keydown', function(e){
    if (e.key!=='Backspace' && e.key!=='Delete') return;

    const ed = editors.find(el => el && el.contains(e.target));
    if(!ed) return;

    const sel = window.getSelection();
    if(!sel || !sel.isCollapsed) return;

    // sali fino all'eventuale LI contenitore
    let node = sel.anchorNode;
    if(node && node.nodeType===3) node = node.parentElement;
    while(node && node!==ed && node.tagName!=='LI') node=node.parentElement;
    if(!node || node===ed) return;

    const li = node;
    if (!isEmptyNode(li)) return; // solo bullet VUOTO

    // Blocca qualsiasi altro handler e esci subito dalla lista (come Enter)
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    liToParagraph(li);
  }, true);
})();
