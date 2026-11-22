"use strict";
const HEAT={low:{n:"Low",c:"150–175°C",r:1},med:{n:"Medium",c:"175–200°C",r:2},mh:{n:"Medium-high",c:"200–230°C",r:3},high:{n:"High",c:"230–260°C",r:4}};
// a/b = minutes first/second side; every = repeat-turn interval with total
const FOODS=[
{id:"steak",n:"Steak",p:1,heat:"high",lid:"open",g:250,don:{rare:[2,2],"medium-rare":[2.75,2.5],medium:[3.5,3.5],"medium-well":[4.5,4.5]},def:"medium-rare",done:"Rest 5 min. ~2.5 cm thick.",col:"#b91c1c"},
{id:"chicken",n:"Chicken pieces",p:1,heat:"med",lid:"closed",g:200,a:10,b:11,done:"75°C in the centre.",col:"#f59e0b"},
{id:"sausages",n:"Sausages",p:1,heat:"med",lid:"closed",g:100,every:4,total:15,done:"75°C in the centre.",col:"#c2410c"},
{id:"lamb-chops",n:"Lamb chops",p:1,heat:"high",lid:"open",g:150,don:{rare:[2.5,2.5],"medium-rare":[3,3],medium:[3.5,3.5],"medium-well":[4,4]},def:"medium",done:"Rest 3–5 min.",col:"#9f1239"},
{id:"pork-chops",n:"Pork chops",p:1,heat:"mh",lid:"closed",g:200,a:6,b:6,done:"70°C, then rest.",col:"#fda4af"},
{id:"burgers",n:"Burgers",p:1,heat:"mh",lid:"closed",g:150,a:5,b:5,done:"75°C (mince).",col:"#78350f"},
{id:"fish",n:"Fish fillet",p:1,heat:"med",lid:"closed",g:180,a:4,b:3.5,done:"Opaque and flakes easily.",col:"#e2e8f0"},
{id:"prawns",n:"Prawns",p:1,heat:"high",lid:"open",g:30,a:1.75,b:1.75,done:"Pink and opaque.",col:"#fb7185"},
{id:"corn",n:"Corn on the cob",heat:"med",lid:"closed",every:3.5,total:14,done:"Tender, charred spots.",col:"#facc15"},
{id:"capsicum",n:"Capsicum",heat:"mh",lid:"open",a:4,b:4,done:"Soft, blistered.",col:"#dc2626"},
{id:"mushrooms",n:"Mushrooms",heat:"med",lid:"closed",a:4,b:4,done:"Juicy and soft.",col:"#a8a29e"},
{id:"zucchini",n:"Zucchini",heat:"mh",lid:"open",a:3.5,b:3.5,done:"Grill marks, tender.",col:"#16a34a"},
{id:"asparagus",n:"Asparagus",heat:"high",lid:"open",a:2,b:2,done:"Bright green, tender.",col:"#4d7c0f"},
{id:"onion",n:"Onion",heat:"med",lid:"open",a:5,b:5,done:"Soft, golden. Slices or rounds.",col:"#e9d5ff"},
{id:"eggplant",n:"Eggplant",heat:"med",lid:"open",a:5,b:5,done:"Soft right through.",col:"#6b21a8"},
{id:"tomato",n:"Tomato",heat:"med",lid:"open",a:2.5,b:2,done:"Halved; soft, not collapsing.",col:"#ef4444"},
{id:"sweet-potato",n:"Sweet potato",heat:"med",lid:"closed",a:10,b:10,done:"Fork-tender. Slice thick or par-cook.",col:"#ea580c"}];
const DON=["rare","medium-rare","medium","medium-well"];
const S={sel:new Set(),kg:{},don:{},t:{}};
const $=s=>document.querySelector(s);
const svgFood=f=>`<svg viewBox="0 0 64 64"><ellipse cx="32" cy="36" rx="24" ry="16" fill="${f.col}" stroke="#1c1917" stroke-width="3"/><path d="M16 32l32 0M18 40l28 0" stroke="#1c1917" stroke-opacity=".4" stroke-width="3"/></svg>`;
const img=(name,fb)=>`<img src="assets/${name}.png" alt="" onerror="this.outerHTML=decodeURIComponent('${encodeURIComponent(fb)}')">`;
const svgHeat=r=>`<svg viewBox="0 0 64 64">${[0,1,2,3].map(i=>`<path d="M${10+i*12} 56c-4-8 0-14 5-22 3 8 6 12 2 22z" fill="${i<r?"#f97316":"#44403c"}"/>`).join("")}</svg>`;
const svgLid=open=>`<svg viewBox="0 0 64 64"><rect x="10" y="34" width="44" height="14" rx="6" fill="#57534e"/><path d="M14 52l-4 8M50 52l4 8" stroke="#a8a29e" stroke-width="3"/>${open?'<path d="M12 30 Q20 6 46 12" stroke="#a8a29e" stroke-width="5" fill="none"/>':'<path d="M10 34 Q32 6 54 34z" fill="#78716c"/>'}</svg>`;
const fm=m=>{m=Math.max(0,Math.ceil(m/1000));return Math.floor(m/60)+":"+String(m%60).padStart(2,"0")};
const mm=x=>{const s=Math.round(x*60);return s%60?`${Math.floor(s/60)}m ${s%60}s`:`${s/60} min`};
function plan(f){ // returns {steps:[ms...], lid, turns}
  let lid=f.lid;
  if(f.every){const n=Math.round(f.total/f.every),st=[];for(let i=0;i<n-1;i++)st.push(f.every);st.push(f.total-f.every*(n-1));return{steps:st.map(m=>m*60000),lid,total:f.total};}
  let a=f.a,b=f.b;if(f.don){const d=S.don[f.id]||f.def;[a,b]=f.don[d];if(f.id==="steak"&&d==="medium-well")lid="closed";}
  return{steps:[a*60000,b*60000],lid,total:a+b,a,b};
}
function render(){
  for(const[g,el]of[[1,"#proteins"],[0,"#veg"]])$(el).innerHTML=FOODS.filter(f=>!!f.p==!!g).map(f=>`<button class="food ${S.sel.has(f.id)?"on":""}" data-id="${f.id}" aria-pressed="${S.sel.has(f.id)}">${img(f.id,svgFood(f))}${f.n}</button>`).join("");
  $("#kgs").innerHTML=FOODS.filter(f=>f.p&&S.sel.has(f.id)).map(f=>{const kg=S.kg[f.id]||.5,n=Math.max(1,Math.round(kg*1000/f.g));
    return `<div class="kg"><b>${f.n}</b><button class="ghost" data-kg="${f.id}" data-d="-1">−</button><span class="v">${kg.toFixed(2)} kg</span><button class="ghost" data-kg="${f.id}" data-d="1">+</button><small>≈ ${n} ${f.id==="prawns"?"prawns":"pieces"} (~${f.g} g each). More kilos = more pieces, same cook time.${n>8?" That's a lot — cook in batches so they're not crowded.":""}</small></div>`}).join("");
}
function setup(){
  const items=FOODS.filter(f=>S.sel.has(f.id));const h=$("#setup");
  if(!items.length){h.classList.add("show");h.innerHTML="<h2>Nothing on the grill yet</h2><p>Pick at least one protein or vegetable above, then hit Fire up.</p>";$("#board-wrap").classList.remove("show");return;}
  const ps=items.map(f=>({f,...plan(f)}));
  const top=ps.reduce((m,x)=>HEAT[x.f.heat].r>HEAT[m].r?x.f.heat:m,"low");
  const open=ps.some(x=>x.lid==="open"),closed=ps.some(x=>x.lid==="closed"),heats=new Set(items.map(f=>f.heat));
  const two=(open&&closed)||heats.size>1;const lid=open&&closed?"Closed (two-zone)":closed?"Closed":"Open";
  const order=[...ps].sort((a,b)=>b.total-a.total);const max=order[0].total;
  let note=`Preheat with the lid down for 10–15 min to ${HEAT[top].n.toLowerCase()} (${HEAT[top].c}), then scrape and oil the grill.`;
  if(two)note+=` Your mix needs different heats or lid settings: set up two zones — burners on high one side for searing (${ps.filter(x=>x.lid==="open"||x.f.heat==="high").map(x=>x.f.n.toLowerCase()).join(", ")||"quick items"}), lower on the other side for slower lid-down cooking (${ps.filter(x=>x.lid==="closed"&&x.f.heat!=="high").map(x=>x.f.n.toLowerCase()).join(", ")||"the rest"}).`;
  h.classList.add("show");
  h.innerHTML=`<h2 style="margin-top:0">Before you cook</h2><div class="stats"><div class="stat">${img("heat-"+(top==="low"?"low":top==="med"?"medium":"high"),svgHeat(HEAT[top].r))}<div class="lbl">Preheat</div><div class="val">${HEAT[top].n}</div><div>${HEAT[top].c}</div></div><div class="stat">${img(closed?"grill-closed":"grill-open",svgLid(!closed))}<div class="lbl">Lid</div><div class="val">${lid}</div></div></div><p>${note}</p><b>Cook order</b><ol>${order.map(x=>`<li>${x.f.n} — ${mm(x.total)}${x.total<max?` (add ~${mm(max-x.total)} after the first item)`:" (start first)"}</li>`).join("")}</ol>`;
  $("#board-wrap").classList.add("show");board();
}
function board(){
  const items=FOODS.filter(f=>S.sel.has(f.id));
  $("#board").innerHTML=items.map(f=>{const p=plan(f);const turn=f.every?`Turn every ${mm(f.every)}`:`Turn after ${mm(p.a)}`;
    return `<div class="card" id="c-${f.id}"><div class="top">${img(f.id,svgFood(f))}<h3>${f.n}</h3><span class="state">Waiting</span></div>
    <div class="tags">${HEAT[f.heat].n} heat · Lid ${p.lid} · ${turn} · Done at ${mm(p.total)} — ${f.done}</div>
    ${f.don?`<div class="dn">${DON.map(d=>`<button data-don="${f.id}" data-v="${d}" class="${(S.don[f.id]||f.def)===d?"on":""}">${d}</button>`).join("")}</div>`:""}
    <div class="clock">${fm(p.steps[0])}</div><div class="sub"></div><div class="ctl"><button data-t="start" data-id="${f.id}">Start</button><button class="ghost" data-t="reset" data-id="${f.id}">Reset</button></div></div>`}).join("");
  for(const id of Object.keys(S.t))if(!S.sel.has(id))delete S.t[id];tick();
}
// timer: {step, startedAt|null, remaining, state}
function tmr(id){const f=FOODS.find(x=>x.id===id);return S.t[id]||(S.t[id]={step:0,startedAt:null,remaining:plan(f).steps[0],state:"waiting"});}
function startT(id){const t=tmr(id),f=FOODS.find(x=>x.id===id);if(t.state==="done")return;if(t.state==="turn"){t.step++;t.remaining=plan(f).steps[t.step];}t.startedAt=Date.now();t.state="cooking";tick();}
function pauseT(id){const t=tmr(id);if(t.startedAt){t.remaining-=Date.now()-t.startedAt;t.startedAt=null;t.state="paused";}tick();}
let ac;function beep(n){try{ac=ac||new(window.AudioContext||window.webkitAudioContext)();ac.resume();for(let i=0;i<n;i++){const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=n>1?1000:740;o.connect(g);g.connect(ac.destination);const t0=ac.currentTime+i*.25;g.gain.setValueAtTime(.3,t0);g.gain.exponentialRampToValueAtTime(.001,t0+.2);o.start(t0);o.stop(t0+.22);}}catch(e){}if(navigator.vibrate)navigator.vibrate(n>1?[200,100,200,100,400]:[300,100,300]);}
function tick(){
  for(const f of FOODS){if(!S.sel.has(f.id))continue;const el=document.getElementById("c-"+f.id);if(!el)continue;const t=tmr(f.id),p=plan(f);
    let left=t.remaining-(t.startedAt?Date.now()-t.startedAt:0);
    if(t.state==="cooking"&&left<=0){t.startedAt=null;
      if(t.step>=p.steps.length-1){t.state="done";t.remaining=0;beep(3);}
      else if(f.every){t.step++;t.remaining=p.steps[t.step]+left;t.startedAt=Date.now();t.flash=Date.now();beep(1);} // repeat turns auto-continue
      else{t.state="turn";t.remaining=0;beep(1);}
      left=t.remaining;}
    const flashing=t.flash&&Date.now()-t.flash<8000;
    const st=t.state==="done"?"done":t.state==="turn"||flashing?"turn":t.state==="cooking"?"cooking":"";
    el.className="card "+st;
    el.querySelector(".state").textContent={done:"Done ✓",turn:"TURN NOW",cooking:"Cooking"}[st]||(t.state==="paused"?"Paused":"Waiting");
    el.querySelector(".clock").textContent=t.state==="done"?"Off!":t.state==="turn"?"Flip it":fm(left);
    el.querySelector(".sub").textContent=t.state==="done"?"Take it off and rest.":t.state==="turn"?"Tap ‘Turned it’ to start side two.":`${f.every?`Turn ${t.step+1} of ${p.steps.length}`:t.step?"Side two → done":"Side one → turn"}`;
    const b=el.querySelector('[data-t="start"]');b.dataset.t2=t.state==="cooking"?"pause":"start";b.textContent=t.state==="cooking"?"Pause":t.state==="turn"?"Turned it ✓":t.state==="paused"?"Resume":"Start";b.disabled=t.state==="done";}
}
document.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(ac)ac.resume();else{try{ac=new(window.AudioContext||window.webkitAudioContext)();}catch(_){}}
  if(b.dataset.id&&b.classList.contains("food")){const id=b.dataset.id;S.sel.has(id)?S.sel.delete(id):S.sel.add(id);render();if($("#setup").classList.contains("show"))setup();}
  else if(b.dataset.kg){const id=b.dataset.kg;S.kg[id]=Math.max(.25,(S.kg[id]||.5)+.25*b.dataset.d);render();}
  else if(b.dataset.don){const t=S.t[b.dataset.don];if(t&&t.state!=="waiting"&&!confirm("Changing doneness resets this timer. OK?"))return;S.don[b.dataset.don]=b.dataset.v;delete S.t[b.dataset.don];setup();}
  else if(b.dataset.t==="start"){(b.dataset.t2==="pause"?pauseT:startT)(b.dataset.id);}
  else if(b.dataset.t==="reset"){delete S.t[b.dataset.id];tick();}
  else if(b.id==="fire"){setup();$("#setup").scrollIntoView({behavior:"smooth"});}
  else if(b.id==="startall"){for(const id of S.sel){const t=tmr(id);if(t.state==="waiting"||t.state==="paused")startT(id);}}
});
setInterval(tick,250);document.addEventListener("visibilitychange",tick);
render();
if("serviceWorker"in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
window.__S=S;
