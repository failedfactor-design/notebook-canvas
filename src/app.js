import { supabase } from "./supabase.js";
import { Editor } from "https://esm.sh/@tiptap/core@3.34.0";
import StarterKit from "https://esm.sh/@tiptap/starter-kit@3.34.0";

const $ = (s, root=document) => root.querySelector(s);
const esc = (value="") => String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const icon = (symbol) => symbol;
const state = { user:null, notebooks:[], activeNotebook:null, pages:[], page:null, items:[], view:"canvas", editor:null, selected:null, saveTimer:null, saveTimers:new Map(), theme:"graphite", settingsOpen:false, signedUrls:new Map() };
const themes = [
  ["graphite","Graphite","#41464e"],["charcoal","Charcoal","#191b1e"],["midnight","Midnight","#202d3c"],["fog","Fog","#777e86"],["paper","Paper","#f0f0eb"]
];

function notify(message){ const el=$("#toast"); if(!el)return; el.textContent=message; el.classList.add("show"); clearTimeout(notify.timer); notify.timer=setTimeout(()=>el.classList.remove("show"),2300); }
function boot(){ $("#app").innerHTML='<div class="boot-screen"><div class="boot-mark">N</div><p>Preparing your workspace…</p></div>'; }
function applyTheme(theme){ state.theme=themes.some(t=>t[0]===theme)?theme:"graphite"; document.body.className=state.theme==="graphite"?"":`theme-${state.theme}`; }
function authView(message=""){
  state.editor?.destroy(); state.editor=null;
  $("#app").innerHTML=`<main class="auth-screen"><section class="auth-card"><div class="brand" style="padding:0 0 25px"><div class="brand-mark">N</div><div><div class="brand-name">Notebook Canvas</div><div class="brand-sub">YOUR QUIET DIGITAL SPACE</div></div></div><h1 id="auth-heading">Welcome back.</h1><p id="auth-subtitle">A place for notes, files and ideas.</p><form id="auth-form"><div class="field"><label for="auth-email">Email</label><input id="auth-email" type="email" autocomplete="email" required placeholder="you@example.com"></div><div class="field"><label for="auth-password">Password</label><input id="auth-password" type="password" autocomplete="current-password" required minlength="6" placeholder="At least 6 characters"></div><button class="btn primary" id="auth-submit" type="submit">Sign in</button></form><button class="btn ghost" id="auth-toggle" type="button">Create an account</button><div class="auth-message" id="auth-message">${esc(message)}</div></section></main>`;
  let signup=false;
  $("#auth-toggle").onclick=()=>{signup=!signup;$("#auth-heading").textContent=signup?"Create your space.":"Welcome back.";$("#auth-subtitle").textContent=signup?"Start collecting your notes and ideas.":"A place for notes, files and ideas." ;$("#auth-submit").textContent=signup?"Create account":"Sign in";$("#auth-toggle").textContent=signup?"I already have an account":"Create an account";$("#auth-password").autocomplete=signup?"new-password":"current-password";};
  $("#auth-form").onsubmit=async e=>{e.preventDefault();const button=$("#auth-submit"),msg=$("#auth-message");button.disabled=true;msg.textContent="Connecting securely…";try{const email=$("#auth-email").value.trim(),password=$("#auth-password").value;const {data,error}=signup?await supabase.auth.signUp({email,password,options:{emailRedirectTo:location.href.split("#")[0]}}):await supabase.auth.signInWithPassword({email,password});if(error)throw error;if(signup&&!data.session){msg.textContent="Account created. Check your email to confirm, then sign in.";return;}state.user=data.user||data.session?.user;await ensureProfile();await loadWorkspace();}catch(err){msg.textContent=err.message||"Unable to sign in.";}finally{button.disabled=false;}};
}
async function ensureProfile(){const {error}=await supabase.from("profiles").upsert({id:state.user.id,display_name:state.user.email?.split("@")[0]||"Notebook user"},{onConflict:"id",ignoreDuplicates:true});if(error)console.warn("Profile setup:",error.message);const {data}=await supabase.from("profiles").select("preferences").eq("id",state.user.id).maybeSingle();if(data?.preferences?.theme)applyTheme(data.preferences.theme);}
async function loadWorkspace(){boot();const {data,error}=await supabase.from("notebooks").select("*, notebook_pages(*)").eq("owner_id",state.user.id).eq("is_archived",false).order("updated_at",{ascending:false});if(error){notify(error.message);return;}state.notebooks=data||[];if(!state.activeNotebook||!state.notebooks.some(n=>n.id===state.activeNotebook.id))state.activeNotebook=state.notebooks[0]||null;if(!state.activeNotebook){await createNotebook("My first notebook");return;}await selectNotebook(state.activeNotebook.id);}
async function createNotebook(title="Untitled notebook"){const {data,error}=await supabase.from("notebooks").insert({owner_id:state.user.id,title}).select().single();if(error){notify(error.message);return;}const {data:page,error:pageError}=await supabase.from("notebook_pages").insert({notebook_id:data.id,owner_id:state.user.id,title:"Welcome"}).select().single();if(pageError){notify(pageError.message);return;}state.activeNotebook=data;state.notebooks.unshift({...data,notebook_pages:[page]});await selectNotebook(data.id);}
async function selectNotebook(id){const notebook=state.notebooks.find(n=>n.id===id)||state.activeNotebook;if(!notebook)return;state.activeNotebook=notebook;const {data,error}=await supabase.from("notebook_pages").select("*").eq("notebook_id",id).eq("owner_id",state.user.id).order("position");if(error){notify(error.message);return;}state.pages=data||[];if(!state.pages.length){const {data:p,error:e}=await supabase.from("notebook_pages").insert({notebook_id:id,owner_id:state.user.id,title:"Welcome"}).select().single();if(e){notify(e.message);return;}state.pages=[p];}await selectPage(state.pages[0].id);}
async function selectPage(id){const page=state.pages.find(p=>p.id===id);if(!page)return;state.page=page;state.selected=null;const {data,error}=await supabase.from("canvas_items").select("*").eq("page_id",id).eq("owner_id",state.user.id).order("z_index");if(error){notify(error.message);return;}state.items=data||[];renderApp();}
async function createPage(){if(!state.activeNotebook)return;const {data,error}=await supabase.from("notebook_pages").insert({notebook_id:state.activeNotebook.id,owner_id:state.user.id,title:"Untitled page",position:state.pages.length}).select().single();if(error){notify(error.message);return;}state.pages.push(data);await selectPage(data.id);}
function renderApp(){
  state.editor?.destroy();state.editor=null;
  const notebook=state.activeNotebook,page=state.page;
  $("#app").innerHTML=`<div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-mark">N</div><div><div class="brand-name">Notebook Canvas</div><div class="brand-sub">YOUR DIGITAL SPACE</div></div></div><div class="side-actions"><button class="btn small primary" id="new-note">＋ <span>Notebook</span></button><button class="btn small" id="new-page">▤ <span>Page</span></button></div><input class="search" id="search-notes" placeholder="⌕  Search notebooks…" /><div class="side-label">YOUR NOTEBOOKS</div><div class="note-list" id="note-list"></div><div class="side-bottom"><div class="avatar">${esc((state.user.email||"N").slice(0,1).toUpperCase())}</div><div class="user-meta"><div style="font-size:12px;font-weight:600">Your workspace</div><div class="user-email">${esc(state.user.email)}</div></div><button class="btn icon ghost" id="settings" title="Appearance">⚙</button><button class="btn icon ghost" id="sign-out" title="Sign out">↗</button></div></aside><main class="main"><header class="topbar"><div class="breadcrumbs"><span>Workspace</span><span>／</span><span class="crumb-title">${esc(notebook.title)}</span><span>／</span><span>${esc(page.title)}</span></div><span class="save-status" id="save-status">All changes saved</span><div class="top-actions"><button class="btn small optional" id="rename-note">Rename</button><button class="btn small" id="open-settings">◐ Theme</button><button class="btn small" id="add-note">＋ Add note</button><button class="btn small primary" id="add-assets">＋ Add files</button><input id="asset-input" type="file" multiple hidden accept="image/*,.pdf,.txt,.md,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" /></div></header><section class="workspace"><div class="page-head"><div class="page-kicker">NOTEBOOK / ${esc(notebook.title)}</div><h1 class="page-title" id="page-title" contenteditable="true" spellcheck="false">${esc(page.title)}</h1><div class="page-date">Last edited just now · Private workspace</div></div><div class="page-switcher">${state.pages.map(p=>`<button class="page-chip ${p.id===state.page.id?"active":""}" data-page="${p.id}">${esc(p.title)}</button>`).join("")}<button class="page-chip add-page" id="add-page-chip">＋ Page</button></div><nav class="view-tabs board-nav"><button class="view-tab active" data-view="canvas">▦ &nbsp;Board <span style="color:var(--muted)">(${state.items.length})</span></button><span class="board-nav-note">A space for notes, images and files</span></nav><div id="view-content"></div></section></main></div><div id="settings-root"></div><div id="toast"></div>`;
  renderNotebookList();renderView();wireApp();
}
function renderNotebookList(filter=""){const root=$("#note-list");if(!root)return;const items=state.notebooks.filter(n=>n.title.toLowerCase().includes(filter.toLowerCase()));root.innerHTML=items.length?items.map(n=>`<button class="note-row ${n.id===state.activeNotebook?.id?"active":""}" data-notebook="${n.id}" title="${esc(n.title)}"><span class="note-icon">▤</span><span class="note-title">${esc(n.title)}</span></button>`).join(""):'<div class="empty-state">No notebooks yet</div>';root.querySelectorAll("[data-notebook]").forEach(btn=>btn.onclick=()=>selectNotebook(btn.dataset.notebook));}
function renderView(){
  const root=$("#view-content");if(!root)return;
  if(state.view==="notebook"){
    root.innerHTML=`<div class="editor-wrap"><div class="editor-paper"><div class="editor-toolbar"><button class="tool-btn" data-cmd="bold"><b>B</b></button><button class="tool-btn" data-cmd="italic"><i>I</i></button><button class="tool-btn" data-cmd="strike"><s>S</s></button><span class="tool-sep"></span><button class="tool-btn" data-cmd="h1">H1</button><button class="tool-btn" data-cmd="h2">H2</button><button class="tool-btn" data-cmd="paragraph">¶</button><span class="tool-sep"></span><button class="tool-btn" data-cmd="bullet">•≡</button><button class="tool-btn" data-cmd="ordered">1.</button><button class="tool-btn" data-cmd="quote">❞</button><button class="tool-btn" data-cmd="code">⌘</button><span class="tool-sep"></span><button class="tool-btn" data-cmd="undo">↶</button><button class="tool-btn" data-cmd="redo">↷</button></div><div id="rich-editor"></div></div><div style="text-align:center;color:var(--muted);font-size:11px;padding:13px">Your words flow naturally, like a page in a notebook.</div></div>`;
    state.editor=new Editor({element:$("#rich-editor"),extensions:[StarterKit],content:state.page.content||{type:"doc",content:[{type:"paragraph"}]},editorProps:{attributes:{class:"notebook-prose",spellcheck:"true"}},onUpdate:({editor})=>schedulePageSave(editor.getJSON())});
    $$(".tool-btn").forEach(btn=>btn.onclick=()=>runEditorCommand(btn.dataset.cmd));
  }else renderCanvas();
}
function $$(s,root=document){return [...root.querySelectorAll(s)];}
function runEditorCommand(cmd){if(!state.editor)return;const c=state.editor.chain().focus();const commands={bold:()=>c.toggleBold().run(),italic:()=>c.toggleItalic().run(),strike:()=>c.toggleStrike().run(),h1:()=>c.toggleHeading({level:1}).run(),h2:()=>c.toggleHeading({level:2}).run(),paragraph:()=>c.setParagraph().run(),bullet:()=>c.toggleBulletList().run(),ordered:()=>c.toggleOrderedList().run(),quote:()=>c.toggleBlockquote().run(),code:()=>c.toggleCodeBlock().run(),undo:()=>c.undo().run(),redo:()=>c.redo().run()};commands[cmd]?.();}
function schedulePageSave(content){const pageId=state.page.id,ownerId=state.user.id;const pending=state.saveTimers.get(pageId);if(pending)clearTimeout(pending);if(state.page?.id===pageId)$("#save-status").textContent="Saving…";const timer=setTimeout(async()=>{const {error}=await supabase.from("notebook_pages").update({content}).eq("id",pageId).eq("owner_id",ownerId);state.saveTimers.delete(pageId);if(state.page?.id===pageId)$("#save-status").textContent=error?"Save failed":"All changes saved";if(error)notify(error.message);},650);state.saveTimers.set(pageId,timer);}
async function saveCanvasItem(id,patch){const {error}=await supabase.from("canvas_items").update(patch).eq("id",id).eq("owner_id",state.user.id);if(error)notify(error.message);}
async function signedUrl(path){if(state.signedUrls.has(path))return state.signedUrls.get(path);const {data,error}=await supabase.storage.from("notebook-assets").createSignedUrl(path,3600);if(error)throw error;state.signedUrls.set(path,data.signedUrl);return data.signedUrl;}
async function createStickyNote(){
  const count=state.items.filter(item=>item.kind==="sticky").length;
  const palette=["violet","graphite","slate"];
  const metadata={body:"",tone:palette[count%palette.length]};
  const {data,error}=await supabase.from("canvas_items").insert({
    page_id:state.page.id,owner_id:state.user.id,kind:"sticky",
    title:"Untitled note",metadata,
    position:{x:500+(count%4)*34,y:90+(count%5)*34,width:310,height:260},
    z_index:Math.max(0,...state.items.map(i=>i.z_index||0))+1
  }).select().single();
  if(error){notify(error.message);return;}
  state.items.push(data);state.selected=data.id;renderCanvas();
  requestAnimationFrame(()=>{const field=$(`[data-id="${data.id}"] .sticky-title`);field?.focus();field?.select();});
}
async function saveSticky(item,patch){
  const {error}=await supabase.from("canvas_items").update(patch).eq("id",item.id).eq("owner_id",state.user.id);
  if(error)notify(error.message);
  else Object.assign(item,patch);
}
async function readPageCardPosition(pageId){
  try{
    const value=JSON.parse(localStorage.getItem(`notebook-canvas-page-card:${pageId}`)||"null");
    if(value&&Number.isFinite(value.x)&&Number.isFinite(value.y))return value;
  }catch{}
  return {x:55,y:55};
}
function savePageCardPosition(pageId,position){
  try{localStorage.setItem(`notebook-canvas-page-card:${pageId}`,JSON.stringify(position));}catch{}
}
async function renderCanvas(){
  const root=$("#view-content");if(!root)return;
  root.innerHTML=`<div class="board-toolbar"><div class="board-hint"><span class="board-kicker">FREEFORM BOARD</span><span>ลากการ์ดไปวางตรงไหนก็ได้ จะจัดกลุ่มหรือซ้อนทับกันก็ได้</span></div><div class="board-actions"><span class="board-count">${state.items.length+1} CARDS</span><button class="btn small" id="canvas-upload">＋ Add files</button><button class="btn small primary" id="canvas-add-note">＋ New note</button></div></div><div class="canvas-board freeform-board" id="canvas-board"><div class="canvas-empty" id="canvas-empty" style="${state.items.length?"display:none":""}"><div><strong>Your board is ready.</strong><br><span>เริ่มเขียนโน้ต เพิ่มรูปภาพ หรือวางไฟล์ลงบนกระดานได้เลย</span></div></div><div class="canvas-plane freeform-plane" id="canvas-plane"></div></div>`;
  $("#canvas-upload").onclick=()=>$("#asset-input").click();
  $("#canvas-add-note").onclick=createStickyNote;
  const plane=$("#canvas-plane");
  const pageTile=document.createElement("article");
  const pagePos=readPageCardPosition(state.page.id);
  pageTile.className="page-doc-tile freeform-page-card";
  pageTile.style.cssText=`left:${pagePos.x}px;top:${pagePos.y}px`;
  pageTile.innerHTML=`<div class="page-doc-head asset-drag-handle"><span>PAGE NOTE</span><span>DRAG TO MOVE</span></div><div id="board-page-editor" class="page-doc-editor"></div>`;
  plane.append(pageTile);
  state.editor=new Editor({
    element:$("#board-page-editor"),
    extensions:[StarterKit],
    content:state.page.content||{type:"doc",content:[{type:"paragraph"}]},
    editorProps:{attributes:{class:"page-board-prose",spellcheck:"true"}},
    onUpdate:({editor})=>schedulePageSave(editor.getJSON())
  });
  wirePageCard(pageTile,state.page.id);
  const ordered=[...state.items].sort((a,b)=>(a.z_index||0)-(b.z_index||0));
  for(const item of ordered){
    const p=item.position||{x:500,y:80,width:310,height:240};
    const el=document.createElement("article");
    el.className="asset freeform-asset"+(item.kind==="sticky"?" sticky-asset":"")+(item.id===state.selected?" selected":"");
    el.dataset.id=item.id;
    el.style.cssText=`left:${p.x||0}px;top:${p.y||0}px;width:${p.width||310}px;height:${p.height||240}px;z-index:${item.z_index||1}`;
    let inside="";
    if(item.kind==="sticky"){
      const tone=["violet","graphite","slate"].includes(item.metadata?.tone)?item.metadata.tone:"graphite";
      inside=`<div class="sticky-note tone-${tone}"><div class="sticky-cap asset-drag-handle"><span>NOTE / ${String(item.id).slice(0,4).toUpperCase()}</span><span class="sticky-cap-dot"></span><span class="drag-label">MOVE</span></div><input class="sticky-title" aria-label="Note title" maxlength="120" value="${esc(item.title||"Untitled note")}" /><textarea class="sticky-content" aria-label="Note content" placeholder="เขียนไอเดียของคุณตรงนี้...">${esc(item.metadata?.body||"")}</textarea><div class="sticky-foot"><span>QUICK NOTE</span><span>PRIVATE</span></div></div>`;
    }else if(item.kind==="image"){
      let url="";
      try{url=await signedUrl(item.storage_path);}catch{}
      inside=`<div class="media-card-head asset-drag-handle"><span>IMAGE</span><span class="drag-label">MOVE</span></div><div class="media-preview image-preview">${url?`<img alt="${esc(item.title)}" src="${url}" draggable="false">`:'<div class="preview-fallback">▧<small>Preview unavailable</small></div>'}</div><div class="media-card-foot"><strong title="${esc(item.title)}">${esc(item.title||"Image")}</strong>${url?`<a href="${url}" target="_blank" rel="noopener">Open</a>`:""}</div>`;
    }else{
      const meta=item.metadata||{};
      const mime=String(meta.mimeType||"").toLowerCase();
      const ext=(item.title||"").split(".").pop()?.toLowerCase()||"file";
      let url="";
      try{url=await signedUrl(item.storage_path);}catch{}
      let preview="";
      if(item.kind==="pdf"&&url){
        preview=`<iframe class="pdf-preview" title="${esc(item.title||"PDF preview")}" src="${url}#toolbar=0&navpanes=0" loading="lazy"></iframe>`;
      }else if((mime.startsWith("text/")||["txt","md","csv"].includes(ext))&&item.storage_path){
        try{
          const {data,error}=await supabase.storage.from("notebook-assets").download(item.storage_path);
          if(error)throw error;
          const text=(await data.text()).slice(0,6000);
          preview=`<pre class="text-file-preview">${esc(text)}${text.length>=6000?"\n…":""}</pre>`;
        }catch{preview='<div class="preview-fallback">TXT<small>Preview unavailable</small></div>';}
      }else{
        const mark=ext.toUpperCase().slice(0,5);
        preview=`<div class="preview-fallback"><span class="file-type-mark">${esc(mark)}</span><small>ชื่อไฟล์</small></div>`;
      }
      const label=item.kind==="pdf"?"PDF":(meta.sizeLabel||ext.toUpperCase());
      inside=`<div class="media-card-head asset-drag-handle"><span>FILE / ${esc(label)}</span><span class="drag-label">MOVE</span></div><div class="media-preview file-preview">${preview}</div><div class="media-card-foot"><strong title="${esc(item.title)}">${esc(item.title||"Untitled file")}</strong>${url?`<a href="${url}" target="_blank" rel="noopener" download>Open</a>`:""}</div>`;
    }
    el.innerHTML=`${inside}<div class="asset-controls"><button data-act="front" title="Bring forward">↑</button><button data-act="back" title="Send backward">↓</button><button data-act="delete" title="Delete">×</button></div><div class="resize-handle" title="Resize"></div>`;
    plane.append(el);
    if(item.kind==="sticky"){
      const title=el.querySelector(".sticky-title"),body=el.querySelector(".sticky-content");
      title.onchange=async()=>{item.title=title.value.trim()||"Untitled note";await saveSticky(item,{title:item.title});};
      body.onchange=async()=>{const metadata={...(item.metadata||{}),body:body.value};await saveSticky(item,{metadata});};
      title.onfocus=body.onfocus=()=>{state.selected=item.id;el.classList.add("selected");};
    }
    wireAsset(el,item);
  }
  const board=$("#canvas-board");
  board.ondragover=e=>{if(e.dataTransfer?.types?.includes("Files")){e.preventDefault();board.classList.add("drag-over");}};
  board.ondragleave=()=>board.classList.remove("drag-over");
  board.ondrop=async e=>{
    e.preventDefault();board.classList.remove("drag-over");
    if(e.dataTransfer.files.length){
      const rect=board.getBoundingClientRect();
      await uploadFiles(e.dataTransfer.files,Math.max(25,e.clientX-rect.left+board.scrollLeft-120),Math.max(25,e.clientY-rect.top+board.scrollTop-80));
    }
  };
}
function wirePageCard(el,pageId){
  const handle=el.querySelector(".asset-drag-handle");
  handle.onpointerdown=e=>{
    if(e.target.closest("button,a"))return;
    e.preventDefault();
    const sx=e.clientX,sy=e.clientY,base=readPageCardPosition(pageId);
    handle.setPointerCapture(e.pointerId);
    const move=ev=>{el.style.left=(base.x+ev.clientX-sx)+"px";el.style.top=(base.y+ev.clientY-sy)+"px";};
    const up=ev=>{
      handle.removeEventListener("pointermove",move);handle.removeEventListener("pointerup",up);
      const next={x:Math.max(0,base.x+ev.clientX-sx),y:Math.max(0,base.y+ev.clientY-sy)};
      el.style.left=next.x+"px";el.style.top=next.y+"px";savePageCardPosition(pageId,next);
    };
    handle.addEventListener("pointermove",move);handle.addEventListener("pointerup",up);
  };
}
function wireAsset(el,item){
  const handle=el.querySelector(".asset-drag-handle")||el;
  el.onpointerdown=e=>{
    if(e.target.closest("button,a,input,textarea,iframe")||e.target.classList.contains("resize-handle"))return;
    if(e.target!==handle&&!handle.contains(e.target))return;
    e.preventDefault();
    const sx=e.clientX,sy=e.clientY,p={...(item.position||{x:0,y:0})};
    state.selected=item.id;el.classList.add("selected");
    handle.setPointerCapture(e.pointerId);
    const move=ev=>{
      el.style.left=Math.max(0,p.x+ev.clientX-sx)+"px";
      el.style.top=Math.max(0,p.y+ev.clientY-sy)+"px";
    };
    const up=async ev=>{
      handle.removeEventListener("pointermove",move);handle.removeEventListener("pointerup",up);
      const position={...p,x:Math.max(0,p.x+ev.clientX-sx),y:Math.max(0,p.y+ev.clientY-sy)};
      item.position=position;
      const {error}=await supabase.from("canvas_items").update({position}).eq("id",item.id).eq("owner_id",state.user.id);
      if(error)notify(error.message);
    };
    handle.addEventListener("pointermove",move);handle.addEventListener("pointerup",up);
  };
  const resize=el.querySelector(".resize-handle");
  resize.onpointerdown=e=>{
    e.preventDefault();e.stopPropagation();
    const sx=e.clientX,sy=e.clientY,p={...(item.position||{width:310,height:240})};
    resize.setPointerCapture(e.pointerId);
    const move=ev=>{
      el.style.width=Math.max(190,(p.width||310)+ev.clientX-sx)+"px";
      el.style.height=Math.max(150,(p.height||240)+ev.clientY-sy)+"px";
    };
    const up=async ev=>{
      resize.removeEventListener("pointermove",move);resize.removeEventListener("pointerup",up);
      const position={...p,width:Math.max(190,(p.width||310)+ev.clientX-sx),height:Math.max(150,(p.height||240)+ev.clientY-sy)};
      item.position=position;
      const {error}=await supabase.from("canvas_items").update({position}).eq("id",item.id).eq("owner_id",state.user.id);
      if(error)notify(error.message);
    };
    resize.addEventListener("pointermove",move);resize.addEventListener("pointerup",up);
  };
  el.querySelectorAll("[data-act]").forEach(btn=>btn.onclick=async e=>{
    e.stopPropagation();
    const act=btn.dataset.act;
    if(act==="delete"){
      if(!confirm("Remove this item from the board?"))return;
      if(item.storage_path)await supabase.storage.from("notebook-assets").remove([item.storage_path]);
      const {error}=await supabase.from("canvas_items").delete().eq("id",item.id).eq("owner_id",state.user.id);
      if(error){notify(error.message);return;}
      state.items=state.items.filter(i=>i.id!==item.id);state.selected=null;renderCanvas();
    }else{
      const max=Math.max(0,...state.items.map(i=>i.z_index||0));
      const min=Math.min(0,...state.items.map(i=>i.z_index||0));
      const z_index=act==="front"?max+1:min-1;
      const {error}=await supabase.from("canvas_items").update({z_index}).eq("id",item.id).eq("owner_id",state.user.id);
      if(error){notify(error.message);return;}
      item.z_index=z_index;renderCanvas();
    }
  });
}
async function uploadFiles(fileList,startX=520,startY=80){
  const files=[...fileList];if(!files.length)return;
  let offset=0;
  for(const file of files){
    try{
      if(file.size>50*1024*1024)throw new Error(`${file.name} exceeds the 50 MB limit`);
      const ext=file.name.split(".").pop()?.toLowerCase();
      const kind=file.type.startsWith("image/")?"image":file.type==="application/pdf"||ext==="pdf"?"pdf":"file";
      const clean=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,100);
      const path=`${state.user.id}/${state.activeNotebook.id}/${crypto.randomUUID()}-${clean}`;
      const {error:uploadError}=await supabase.storage.from("notebook-assets").upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});
      if(uploadError)throw uploadError;
      const {data,error}=await supabase.from("canvas_items").insert({
        page_id:state.page.id,owner_id:state.user.id,kind,title:file.name,storage_path:path,
        position:{x:startX+offset*34,y:startY+offset*30,width:kind==="image"?360:330,height:kind==="image"?280:300},
        metadata:{mimeType:file.type,size:file.size,sizeLabel:formatBytes(file.size)}
      }).select().single();
      if(error){await supabase.storage.from("notebook-assets").remove([path]);throw error;}
      state.items.push(data);offset++;
    }catch(err){notify(err.message||"Upload failed");}
  }
  state.view="canvas";
  renderView();
}
function formatBytes(bytes){if(bytes<1024)return bytes+" B";if(bytes<1048576)return (bytes/1024).toFixed(1)+" KB";return (bytes/1048576).toFixed(1)+" MB";}
function openSettings(){state.settingsOpen=!state.settingsOpen;const root=$("#settings-root");if(!state.settingsOpen){root.innerHTML="";return;}root.innerHTML=`<div class="settings-panel"><h3>Appearance</h3><div style="font-size:11px;color:var(--muted);margin-bottom:8px">Choose a quiet workspace tone</div>${themes.map(t=>`<button class="theme-option" data-theme="${t[0]}"><span class="theme-dot" style="background:${t[2]}"></span>${t[1]}${state.theme===t[0]?"　✓":""}</button>`).join("")}</div>`;root.querySelectorAll("[data-theme]").forEach(btn=>btn.onclick=async()=>{applyTheme(btn.dataset.theme);await supabase.from("profiles").upsert({id:state.user.id,preferences:{theme:state.theme,accent:"gray"}});openSettings();});}
function wireApp(){
  $("#new-note").onclick=()=>createNotebook();
  $("#new-page").onclick=createPage;
  $("#add-page-chip").onclick=createPage;
  $$("[data-page]").forEach(btn=>btn.onclick=()=>selectPage(btn.dataset.page));
  $("#search-notes").oninput=e=>renderNotebookList(e.target.value);
  $("#add-note").onclick=createStickyNote;
  $("#add-assets").onclick=()=>$("#asset-input").click();
  $("#asset-input").onchange=e=>uploadFiles(e.target.files);
  $("#settings").onclick=openSettings;$("#open-settings").onclick=openSettings;
  $("#sign-out").onclick=async()=>{await supabase.auth.signOut();state.user=null;authView();};
  $("#rename-note").onclick=async()=>{const title=prompt("Notebook name",state.activeNotebook.title);if(!title?.trim())return;const {error}=await supabase.from("notebooks").update({title:title.trim()}).eq("id",state.activeNotebook.id);if(error)notify(error.message);else{state.activeNotebook.title=title.trim();const n=state.notebooks.find(n=>n.id===state.activeNotebook.id);if(n)n.title=title.trim();renderApp();}};
  $("#page-title").onblur=async e=>{const title=e.target.textContent.trim()||"Untitled page";state.page.title=title;const {error}=await supabase.from("notebook_pages").update({title}).eq("id",state.page.id);if(error)notify(error.message);else $(".breadcrumbs .crumb-title").textContent=state.activeNotebook.title;};
  $("#settings-root").onclick=e=>{if(e.target.id==="settings-root"){state.settingsOpen=false;e.currentTarget.innerHTML="";}};
}
async function start(){const {data:{session}}=await supabase.auth.getSession();if(!session){authView();return;}state.user=session.user;await ensureProfile();await loadWorkspace();}
supabase.auth.onAuthStateChange((_event,session)=>{if(!session&&state.user){state.user=null;authView();}});
start().catch(err=>{console.error(err);authView(err.message);});
