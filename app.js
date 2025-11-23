/* app.js
   Kalkulator titik diferensial + materi interaktif + deteksi nol
*/

// ---------- util: normalize dan compile ekspresi ----------
function normalizeExpr(raw){
  let s = String(raw || '').trim();
  s = s.replace(/^f\s*\(\s*x\s*\)\s*=\s*/i, '');
  s = s.replace(/^f\s*=\s*/i, '');
  return s;
}

function compileExpr(raw){
  let e = normalizeExpr(raw).replace(/\^/g, '**');
  const allowed = ['sin','cos','tan','exp','log','sqrt','abs','min','max','pow'];
  allowed.forEach(fn=>{
    e = e.replace(new RegExp('(?<![\\w.])'+fn+'\\s*\\(','g'), 'Math.'+fn+'(');
  });
  e = e.replace(/(?<![\\w.])pi(?![\\w])/gi, 'Math.PI');
  e = e.replace(/(?<![\\w.])e(?![\\w])/g, 'Math.E');
  const f = new Function('x', 'with (Math) { return '+e+' }');
  f(0);
  return f;
}

// ---------- numerical derivative ----------
function dNumeric(f, x, h=1e-4){
  return (f(x+h) - f(x-h)) / (2*h);
}

// ---------- symbolic derivative (simple patterns) ----------
function symbolicDerivative(raw){
  const expr = normalizeExpr(raw);
  const tokens = expr.match(/[+-]?[^+-]+/g);
  if(!tokens) return null;
  const terms = [];

  for(let tk of tokens){
    const t = tk.trim(); if(!t) continue;
    if(/^[+-]?\d+(\.\d+)?$/.test(t)) continue;

    // ax^n or x^n
    let mPoly = t.match(/^([+-]?\d+(\.\d+)?)?\s*\*?\s*x(?:\s*\^\s*([+-]?\d+))?$/i);
    if(mPoly){
      const a = mPoly[1] ? parseFloat(mPoly[1]) : 1;
      const n = mPoly[3] ? parseFloat(mPoly[3]) : 1;
      const coef = a * n; const pow = n - 1;
      if(pow === 0) terms.push(`${coef}`);
      else if(pow === 1) terms.push(`${coef}*x`);
      else terms.push(`${coef}*x^${pow}`);
      continue;
    }

    // a*sin(b*x)
    let mSin = t.match(/^([+-]?\d+(\.\d+)?)?\s*\*?\s*sin\(\s*([+-]?\d+(\.\d+)?)?\s*\*?\s*x\s*\)$/i);
    if(mSin){
      const a = mSin[1] ? parseFloat(mSin[1]) : 1;
      const b = mSin[3] ? parseFloat(mSin[3]) : 1;
      terms.push(`${a*b}*cos(${b}*x)`);
      continue;
    }

    // a*cos(b*x)
    let mCos = t.match(/^([+-]?\d+(\.\d+)?)?\s*\*?\s*cos\(\s*([+-]?\d+(\.\d+)?)?\s*\*?\s*x\s*\)$/i);
    if(mCos){
      const a = mCos[1] ? parseFloat(mCos[1]) : 1;
      const b = mCos[3] ? parseFloat(mCos[3]) : 1;
      terms.push(`${-a*b}*sin(${b}*x)`);
      continue;
    }

    if(/^sin\(\s*x\s*\)$/i.test(t)){ terms.push('cos(x)'); continue; }
    if(/^cos\(\s*x\s*\)$/i.test(t)){ terms.push('-sin(x)'); continue; }

    return null;
  }

  if(terms.length === 0) return '0';
  return terms.join(' + ').replace(/\+\s*-/g, '- ');
}

// ---------- canvas setup ----------
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function sizeCanvas(){
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.setTransform(window.devicePixelRatio,0,0,window.devicePixelRatio,0,0);
}
sizeCanvas();
window.addEventListener('resize', sizeCanvas);

// ---------- helpers ----------
function niceStep(range){
  const raw = Math.abs(range)/5 || 1;
  const pow10 = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow10;
  if(n < 1.5) return 1 * pow10;
  if(n < 3) return 2 * pow10;
  if(n < 7) return 5 * pow10;
  return 10 * pow10;
}

function drawAxes(xmin, xmax, ymin, ymax){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const pad = 40;
  const sx = (w - 2*pad) / (xmax - xmin || 1);
  const sy = (h - 2*pad) / (ymax - ymin || 1);
  const mapX = x => pad + (x - xmin) * sx;
  const mapY = y => h - pad - (y - ymin) * sy;

  // grid
  ctx.strokeStyle = '#1c2340'; ctx.lineWidth = 1;
  const xStep = niceStep((xmax - xmin)/10);
  for(let x = Math.ceil(xmin/xStep)*xStep; x <= xmax; x += xStep){
    const X = mapX(x); ctx.beginPath(); ctx.moveTo(X, pad); ctx.lineTo(X, h - pad); ctx.stroke();
  }
  const yStep = niceStep((ymax - ymin)/10);
  for(let y = Math.ceil(ymin/yStep)*yStep; y <= ymax; y += yStep){
    const Y = mapY(y); ctx.beginPath(); ctx.moveTo(pad, Y); ctx.lineTo(w - pad, Y); ctx.stroke();
  }

  // axes
  ctx.strokeStyle = '#3a4a7a'; ctx.lineWidth = 1.5;
  if(ymin <= 0 && ymax >= 0){ const Y0 = mapY(0); ctx.beginPath(); ctx.moveTo(pad, Y0); ctx.lineTo(w - pad, Y0); ctx.stroke(); }
  if(xmin <= 0 && xmax >= 0){ const X0 = mapX(0); ctx.beginPath(); ctx.moveTo(X0, pad); ctx.lineTo(X0, h - pad); ctx.stroke(); }

  return {pad, sx, sy, mapX, mapY, w, h};
}

function plotCurve(fun, color, view, samples){
  const {mapX, mapY} = view;
  const xmin = parseFloat(document.getElementById('xmin').value);
  const xmax = parseFloat(document.getElementById('xmax').value);
  const n = samples || parseInt(document.getElementById('samples').value, 10) || 800;
  const step = (xmax - xmin) / n;

  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
  let first = true;
  for(let i = 0; i <= n; i++){
    const x = xmin + i * step;
    const y = fun(x);
    if(!isFinite(y)) { first = true; continue; }
    const X = mapX(x), Y = mapY(y);
    if(first){ ctx.moveTo(X, Y); first = false; } else ctx.lineTo(X, Y);
  }
  ctx.stroke();
}

// ---------- root finding (bracket + bisection) ----------
function findSignBrackets(f, xmin, xmax, samples){
  const brackets = [];
  const step = (xmax - xmin) / samples;
  let x0 = xmin, y0 = f(x0);
  for(let i=1;i<=samples;i++){
    const x1 = xmin + i*step;
    const y1 = f(x1);
    if(!isFinite(y0)){ x0 = x1; y0 = y1; continue; }
    if(!isFinite(y1)){ x0 = x1; y0 = y1; continue; }
    if(Math.abs(y0) < 1e-12) brackets.push([x0, x0]);
    else if(y0 * y1 < 0) brackets.push([x0, x1]);
    x0 = x1; y0 = y1;
  }
  return brackets;
}

function bisectRoot(f, a, b, tol=1e-8, maxIter=60){
  let fa = f(a), fb = f(b);
  if(!isFinite(fa) || !isFinite(fb)) return null;
  if(Math.abs(fa) < tol) return a;
  if(Math.abs(fb) < tol) return b;
  if(fa * fb > 0) return null;
  let lo = a, hi = b, flo = fa, fhi = fb;
  for(let i=0;i<maxIter;i++){
    const mid = (lo + hi)/2; const fm = f(mid);
    if(!isFinite(fm)){ lo = (lo+mid)/2; hi = (hi+mid)/2; continue; }
    if(Math.abs(fm) <= tol) return mid;
    if(flo * fm < 0){ hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    if(Math.abs(hi - lo) < tol) return (hi + lo)/2;
  }
  return (lo + hi)/2;
}

function findRoots(f, xmin, xmax, samples=400, tol=1e-8){
  const brackets = findSignBrackets(f, xmin, xmax, samples);
  const roots = [];
  for(const [a,b] of brackets){
    if(a === b){ if(!roots.some(r=>Math.abs(r-a) < 1e-9)) roots.push(a); }
    else {
      const r = bisectRoot(f, a, b, tol);
      if(r !== null && isFinite(r)){
        if(!roots.some(rr => Math.abs(rr - r) < 1e-7 * Math.max(1, Math.abs(r)))) roots.push(r);
      }
    }
  }
  return roots.sort((A,B)=>A-B);
}

// ---------- points near target ----------
function computePointsNearTarget(fun, xmin, xmax, samples, target, tol=1e-3){
  const pts = []; const step = (xmax - xmin) / samples;
  for(let i=0;i<=samples;i++){
    const x = xmin + i*step; const y = fun(x);
    if(!isFinite(y)) continue;
    if(Math.abs(y - target) <= tol) pts.push({x,y});
  }
  const dedup = []; const eps = (xmax - xmin) / samples * 1.5;
  for(const p of pts) if(!dedup.some(q=>Math.abs(q.x - p.x) < eps)) dedup.push(p);
  return dedup;
}

// ---------- tooltip ----------
const tooltip = document.getElementById('tooltip');
function attachTooltip(f, fd, view){
  const {pad, w, h} = view;
  canvas.onmousemove = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const xmin = parseFloat(document.getElementById('xmin').value);
    const xmax = parseFloat(document.getElementById('xmax').value);
    const ymin = window.__YMIN, ymax = window.__YMAX;
    const sx = (w - 2*pad)/(xmax - xmin || 1);
    const sy = (h - 2*pad)/(ymax - ymin || 1);
    const x = xmin + (px - pad)/sx;
    const y = f(x);
    const yd = fd(x);
    if(px >= pad && px <= w - pad && py >= pad && py <= h - pad && isFinite(y)){
      tooltip.style.display = 'block';
      tooltip.style.left = `${px + 12}px`;
      tooltip.style.top = `${py - 12}px`;
      tooltip.innerHTML = `x = ${x.toPrecision(7)}<br>f(x) = ${y.toPrecision(7)}<br>f′(x) = ${yd.toPrecision(7)}`;
    } else tooltip.style.display = 'none';
  };
  canvas.onmouseleave = () => { tooltip.style.display = 'none'; };
}

// ---------- main compute & render ----------
function computeAndPlot(){
  const status = document.getElementById('status');
  const expr = document.getElementById('expr').value;
  const xmin = parseFloat(document.getElementById('xmin').value);
  const xmax = parseFloat(document.getElementById('xmax').value);
  const samples = parseInt(document.getElementById('samples').value, 10) || 800;
  const mode = document.getElementById('mode')?.value || 'target';
  const target = parseFloat(document.getElementById('target').value);

  try{
    if(!(isFinite(xmin) && isFinite(xmax) && xmax > xmin)) throw new Error('Rentang x tidak valid (xmax > xmin).');

    const f = compileExpr(expr);
    const dSym = symbolicDerivative(expr);
    document.getElementById('symbolic').textContent = dSym ? `Turunan simbolik: f′(x) = ${dSym}` : 'Turunan simbolik: — (turunan numerik)';

    const fd = dSym ? compileExpr(dSym) : (x) => dNumeric(f, x, 1e-4);

    // Estimate y-range including derivative
    let ymin = Infinity, ymax = -Infinity;
    const step = (xmax - xmin) / samples;
    for(let i=0;i<=samples;i++){
      const x = xmin + i*step;
      const y = f(x), yd = fd(x);
      if(isFinite(y)){ ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
      if(isFinite(yd)){ ymin = Math.min(ymin, yd); ymax = Math.max(ymax, yd); }
    }
    if(!isFinite(ymin) || !isFinite(ymax)){ ymin = -1; ymax = 1; }
    if(Math.abs(ymax - ymin) < 1e-9){ ymin -= 1; ymax += 1; }
    const padY = 0.1 * Math.max(1, Math.abs(ymax - ymin));
    ymin -= padY; ymax += padY;
    window.__YMIN = ymin; window.__YMAX = ymax;

    const view = drawAxes(xmin, xmax, ymin, ymax);

    // plot curves
    plotCurve(f, '#4cc9f0', view, samples);
    plotCurve(fd, '#ff7a00', view, samples);

    // compute points according to mode
    let pts = [];
    if(mode === 'target'){
      pts = computePointsNearTarget(f, xmin, xmax, samples, target, 1e-3);
    } else if(mode === 'zeros'){
      const roots = findRoots(f, xmin, xmax, Math.max(300, samples));
      pts = roots.map(r => ({ x: r, y: f(r) }));
    }

    // render list and markers
    const list = document.getElementById('points'); list.innerHTML = '';
    const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    pts.slice(0,26).forEach((p,i) => {
      const li = document.createElement('li');
      const yd = fd(p.x);
      li.innerHTML = `<strong>${labels[i]}:</strong> x = ${p.x.toPrecision(10)}, f(x) = ${p.y.toPrecision(8)}, f′(x) = ${yd.toPrecision(8)}`;
      list.appendChild(li);
      ctx.fillStyle = '#ffd08a';
      ctx.beginPath(); ctx.arc(view.mapX(p.x), view.mapY(p.y), 4, 0, 2*Math.PI); ctx.fill();
    });

    if(mode === 'target') status.textContent = `Titik ditemukan: ${pts.length} (target f(x) ≈ ${target})`;
    else status.textContent = `Akar terdeteksi: ${pts.length} (rentang ${xmin} → ${xmax})`;

    attachTooltip(f, fd, view);
  }catch(err){
    status.textContent = 'ERR: ' + err.message;
  }
}

// ---------- handlers ----------
document.getElementById('btn').addEventListener('click', computeAndPlot);

document.querySelectorAll('.example-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const expr = btn.dataset.expr;
    const xmin = btn.dataset.xmin;
    const xmax = btn.dataset.xmax;
    const samples = btn.dataset.samples;
    const target = btn.dataset.target;

    const exprInput = document.getElementById('expr');
    const xminInput = document.getElementById('xmin');
    const xmaxInput = document.getElementById('xmax');
    const samplesInput = document.getElementById('samples');
    const targetInput = document.getElementById('target');

    if(exprInput) exprInput.value = expr;
    if(xminInput) xminInput.value = xmin;
    if(xmaxInput) xmaxInput.value = xmax;
    if(samplesInput) samplesInput.value = samples;
    if(targetInput) targetInput.value = target;

    computeAndPlot();
    document.getElementById('alat').scrollIntoView({behavior:'smooth'});
  });
});

// quiz checker
document.getElementById('check-quiz').addEventListener('click', () => {
  const qs = document.querySelectorAll('.quiz .quiz-q');
  let correct = 0, total = qs.length;
  qs.forEach(q => {
    const answer = q.dataset.answer;
    const inputs = q.querySelectorAll('input[type=radio]');
    let chosen = null;
    inputs.forEach(inp => { if(inp.checked) chosen = inp.value; });
    q.style.borderColor = (chosen === answer) ? 'rgba(38,166,91,0.6)' : 'rgba(194,57,52,0.6)';
    if(chosen === answer) correct++;
  });
  document.getElementById('quiz-result').innerHTML = `<span class="tag ok"></span> Skor: ${correct}/${total}`;
});

// initial draw on load
window.addEventListener('load', () => {
  try { computeAndPlot(); } catch(e){ /* ignore */ }
});
