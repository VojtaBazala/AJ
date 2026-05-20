'use strict';

// ── SERVICE WORKER ─────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ── SPEECH ─────────────────────────────────────────────────
const synth = window.speechSynthesis;
let voices = [];
synth.onvoiceschanged = () => { voices = synth.getVoices(); };

function speak(text, lang = 'en-US', onEnd = null) {
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.88;
  u.pitch = 1;
  const preferred = voices.find(v => v.lang === lang && v.localService);
  if (preferred) u.voice = preferred;
  if (onEnd) u.onend = onEnd;
  synth.speak(u);
}

let rec = null;

function listen(lang, onResult, onError) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { onError('Speech recognition not supported. Use Chrome.'); return; }
  if (rec) { try { rec.stop(); } catch(e) {} }
  rec = new SR();
  rec.lang = lang || 'en-US';
  rec.continuous = false;
  rec.interimResults = false;
  rec.onresult = e => {
    const t = e.results[0][0].transcript;
    rec = null;
    onResult(t);
  };
  rec.onerror = e => {
    rec = null;
    onError(e.error);
  };
  rec.onend = () => { rec = null; };
  rec.start();
}

// ── API ────────────────────────────────────────────────────
async function claude(system, userMsg, history = []) {
  const messages = [
    ...history,
    { role: 'user', content: userMsg }
  ];
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages })
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error);
  return d.content.map(b => b.text || '').join('').trim();
}

// ── NAVIGATION ─────────────────────────────────────────────
function go(id) {
  synth.cancel();
  stopAlwaysOn();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'home') startAlwaysOn();
}

// ── ALWAYS-ON VOICE (home screen) ─────────────────────────
let aoActive = false;
let aoRec = null;
const COMMANDS = {
  news: ['news', 'energy', 'market', 'zprávy'],
  pron: ['pronunciation', 'sentence', 'repeat', 'výslovnost'],
  vocab: ['vocab', 'vocabulary', 'quiz', 'slovíčka', 'words'],
  talk: ['talk', 'conversation', 'small talk', 'chat', 'konverzace']
};

function toggleAlwaysOn() {
  if (aoActive) { stopAlwaysOn(); } else { startAlwaysOn(); }
}

function startAlwaysOn() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  aoActive = true;
  document.getElementById('aoBtn').innerHTML = '<i class="ti ti-microphone-off"></i> Disable Voice Commands';
  document.getElementById('aoBtn').className = 'voice-btn green';
  listenForCommand();
}

function stopAlwaysOn() {
  aoActive = false;
  if (aoRec) { try { aoRec.stop(); } catch(e) {} aoRec = null; }
  const btn = document.getElementById('aoBtn');
  if (btn) {
    btn.innerHTML = '<i class="ti ti-microphone"></i> Enable Always-On Voice';
    btn.className = 'voice-btn red';
  }
}

function listenForCommand() {
  if (!aoActive) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  aoRec = new SR();
  aoRec.lang = 'en-US';
  aoRec.continuous = false;
  aoRec.interimResults = false;
  aoRec.onresult = e => {
    const heard = e.results[0][0].transcript.toLowerCase();
    let matched = null;
    for (const [screen, keywords] of Object.entries(COMMANDS)) {
      if (keywords.some(k => heard.includes(k))) { matched = screen; break; }
    }
    if (matched) {
      go(matched);
      if (matched === 'news') setTimeout(loadNews, 600);
      if (matched === 'pron') setTimeout(startPron, 600);
      if (matched === 'vocab') setTimeout(startVocab, 600);
      if (matched === 'talk') setTimeout(startTalk, 600);
    } else {
      setTimeout(listenForCommand, 500);
    }
  };
  aoRec.onerror = () => { if (aoActive) setTimeout(listenForCommand, 1500); };
  aoRec.onend   = () => { if (aoActive) setTimeout(listenForCommand, 300); };
  try { aoRec.start(); } catch(e) {}
}

// ── NEWS ───────────────────────────────────────────────────
async function loadNews() {
  const btn = document.getElementById('newsBtn');
  const loader = document.getElementById('newsLoader');
  btn.disabled = true;
  loader.classList.add('on');
  document.getElementById('newsContent').innerHTML = '';
  document.getElementById('newsDot').classList.add('active');

  try {
    // fetch real energy data + weather in parallel
    const [energyRes, weatherRes] = await Promise.all([
      fetch('/api/energy'),
      fetch('/api/weather')
    ]);
    const energy = await energyRes.json();
    const wdata = await weatherRes.json();

    // format energy context
    let energyContext = '';
    if (energy.cz) energyContext += `Czech electricity today: avg ${energy.cz.avg} EUR/MWh, min ${energy.cz.min}, max ${energy.cz.max}. `;
    if (energy.de) energyContext += `German electricity today: avg ${energy.de.avg} EUR/MWh, min ${energy.de.min}, max ${energy.de.max}. `;
    if (energy.ttf) energyContext += `TTF natural gas: ${energy.ttf} EUR/MWh. `;

    // format weather context
    let weatherContext = '';
    try {
      if (Array.isArray(wdata) && wdata[0]?.list) {
        const fmt = (d, city) => {
          const t = d.list[2];
          return `${city}: ${t.weather[0].description}, ${Math.round(t.main.temp_min)}–${Math.round(t.main.temp_max)}°C`;
        };
        weatherContext = `Weather tomorrow — ${fmt(wdata[0],'Prague')}, ${fmt(wdata[1],'Berlin')}. `;
      }
    } catch(e) {}

    const today = new Date().toLocaleDateString('en-GB');
    const text = await claude(
      'You are an energy market analyst. Use ONLY the exact numbers provided — never invent prices. Speak naturally for text-to-speech. Be concise and informative.',
      `Date: ${today}. Here are today\'s REAL market prices — use these exact numbers:\n${energyContext}${weatherContext}\nGive a 120-word spoken briefing covering: Czech and German electricity prices with context (high/low vs normal ~60-80 EUR/MWh), TTF gas price, key market factors today, and tomorrow\'s weather outlook. Natural English, B2 level.`
    );

    btn.disabled = false;
    loader.classList.remove('on');
    document.getElementById('newsDot').classList.remove('active');

    // build price summary cards
    const czCard = energy.cz ? `CZ avg <b>${energy.cz.avg}</b> EUR/MWh` : 'CZ: n/a';
    const deCard = energy.de ? `DE avg <b>${energy.de.avg}</b> EUR/MWh` : 'DE: n/a';
    const ttfCard = energy.ttf ? `TTF <b>${energy.ttf}</b> EUR/MWh` : '';

    document.getElementById('newsContent').innerHTML = `
      <div class="card" style="display:flex;gap:12px;margin-bottom:12px">
        <div style="flex:1;text-align:center;font-size:13px">${czCard}</div>
        <div style="flex:1;text-align:center;font-size:13px">${deCard}</div>
        ${ttfCard ? `<div style="flex:1;text-align:center;font-size:13px">${ttfCard}</div>` : ''}
      </div>
      <div class="card">
        <div class="card-label">⚡ Briefing · ${today}</div>
        <div class="card-text" id="newsText">${text.replace(/\n/g,'<br>')}</div>
      </div>
      <div class="row">
        <button class="sm-btn p" onclick="speak(document.getElementById('newsText').innerText)">
          <i class="ti ti-volume"></i> Read Aloud
        </button>
        <button class="sm-btn" onclick="loadNews()">
          <i class="ti ti-refresh"></i> Refresh
        </button>
      </div>
    `;
    speak(text);

  } catch(e) {
    btn.disabled = false;
    loader.classList.remove('on');
    document.getElementById('newsDot').classList.remove('active');
    fb('newsContent', 'fail', 'Failed to load news. Check connection.');
  }
}

// ── PRONUNCIATION ──────────────────────────────────────────
const SENTENCES = [
  "The energy transition requires substantial investment in renewable infrastructure.",
  "Despite volatile market conditions, the company maintained its growth trajectory.",
  "Negotiations between the two parties have been progressing more smoothly than anticipated.",
  "Advances in battery storage technology are making solar power increasingly viable.",
  "She acknowledged that the project had encountered several unforeseen challenges.",
  "The government introduced a series of incentives to encourage electric vehicle adoption.",
  "Analysts predict that inflation will gradually ease over the coming months.",
  "Maintaining a work-life balance is essential for long-term professional productivity.",
  "The merger is expected to generate significant synergies across both organisations.",
  "Climate commitments made at the summit were welcomed by environmental groups.",
  "Supply chain disruptions continue to affect manufacturing sectors worldwide.",
  "Investors are increasingly prioritising companies with strong sustainability credentials.",
  "The board decided to postpone the vote until further information became available.",
  "She expressed concern about the long-term consequences of rapid deforestation.",
  "The new policy framework aims to reduce carbon emissions by forty percent by 2035."
];

let pronIdx = 0, pronCorrect = 0, pronTotal = 0, currentSent = '';

function startPron() {
  pronIdx++; pronTotal++;
  currentSent = SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
  document.getElementById('sentText').textContent = currentSent;
  document.getElementById('pronFb').className = 'feedback';
  document.getElementById('pronProg').style.width = Math.min(pronTotal * 6, 100) + '%';
  document.getElementById('pronListenBtn').style.display = 'block';
  document.getElementById('pronStartBtn').textContent = 'Next';
  speak(currentSent, 'en-US', () => {
    setTimeout(listenPron, 600);
  });
}

function playSent() { if (currentSent) speak(currentSent); }

function listenPron() {
  if (!currentSent) return;
  document.getElementById('pronWave').classList.add('on');
  document.getElementById('pronDot').classList.add('active');
  listen('en-US', heard => {
    document.getElementById('pronWave').classList.remove('on');
    document.getElementById('pronDot').classList.remove('active');
    checkPron(heard);
  }, err => {
    document.getElementById('pronWave').classList.remove('on');
    document.getElementById('pronDot').classList.remove('active');
    showFb('pronFb', 'fail', 'Could not hear you. Try again.');
  });
}

function checkPron(heard) {
  const norm = s => s.toLowerCase().replace(/[^a-z ]/g, '').trim();
  const origW = norm(currentSent).split(' ');
  const userW = norm(heard).split(' ');
  const ratio = origW.filter(w => userW.includes(w)).length / origW.length;

  if (ratio >= 0.7) {
    pronCorrect++;
    showFb('pronFb', 'ok', `✓ Great! Heard: "${heard}" — ${Math.round(ratio*100)}% match`);
    speak('Well done!', 'en-US', () => setTimeout(startPron, 1500));
  } else if (ratio >= 0.4) {
    showFb('pronFb', 'info', `~ OK. Heard: "${heard}" — try again`);
    speak('Not quite. Listen again.', 'en-US', () => {
      speak(currentSent, 'en-US', () => setTimeout(listenPron, 1200));
    });
  } else {
    showFb('pronFb', 'fail', `✗ Heard: "${heard}" — ${Math.round(ratio*100)}% match`);
    speak('Listen carefully.', 'en-US', () => {
      speak(currentSent, 'en-US', () => setTimeout(listenPron, 1200));
    });
  }
  document.getElementById('pronScore').textContent = pronCorrect + ' / ' + pronTotal;
}

// ── VOCAB ──────────────────────────────────────────────────
const WORDS = [
  {cz:'elektřina',en:'electricity'},{cz:'obnovitelný',en:'renewable'},
  {cz:'předpověď',en:'forecast'},{cz:'investice',en:'investment'},
  {cz:'spotřeba',en:'consumption'},{cz:'přechod',en:'transition'},
  {cz:'nabídka a poptávka',en:'supply and demand'},{cz:'energetická krize',en:'energy crisis'},
  {cz:'tarif',en:'tariff'},{cz:'emise',en:'emissions'},
  {cz:'síť',en:'grid'},{cz:'baterie',en:'battery'},
  {cz:'kapacita',en:'capacity'},{cz:'trh',en:'market'},
  {cz:'subvence',en:'subsidy'},{cz:'úložiště',en:'storage'},
  {cz:'potrubí',en:'pipeline'},{cz:'výkon',en:'output'},
  {cz:'smlouva',en:'contract'},{cz:'regulace',en:'regulation'},
  {cz:'volatilita',en:'volatility'},{cz:'infrastruktura',en:'infrastructure'},
  {cz:'udržitelný',en:'sustainable'},{cz:'účinnost',en:'efficiency'},
  {cz:'špičková poptávka',en:'peak demand'},{cz:'uhlíková neutralita',en:'carbon neutral'},
  {cz:'vyjednávat',en:'negotiate'},{cz:'termín',en:'deadline'},
  {cz:'uznat',en:'acknowledge'},{cz:'odhadovat',en:'forecast'}
];

let vocabQ = [], vocabI = 0, vocabOk = 0;

function startVocab() {
  vocabQ = [...WORDS].sort(() => Math.random() - .5).slice(0, 10);
  vocabI = 0; vocabOk = 0;
  document.getElementById('vocabFb').className = 'feedback';
  showVocab();
}

function showVocab() {
  if (vocabI >= vocabQ.length) { finishVocab(); return; }
  const w = vocabQ[vocabI];
  document.getElementById('vocabWord').innerHTML = w.cz + '<div class="vocab-sub">say in English</div>';
  document.getElementById('vocabProg').style.width = (vocabI / 10 * 100) + '%';
  document.getElementById('vocabScoreEl').textContent = vocabOk + ' / ' + vocabI;
  document.getElementById('vocabFb').className = 'feedback';
  document.getElementById('vocabDot').classList.add('active');
  speak(w.cz, 'cs-CZ', () => setTimeout(listenVocab, 500));
}

function listenVocab() {
  document.getElementById('vocabWave').classList.add('on');
  listen('en-US', heard => {
    document.getElementById('vocabWave').classList.remove('on');
    document.getElementById('vocabDot').classList.remove('active');
    checkVocab(heard);
  }, () => {
    document.getElementById('vocabWave').classList.remove('on');
    document.getElementById('vocabDot').classList.remove('active');
    showFb('vocabFb', 'fail', 'Could not hear. Try again.');
  });
}

function checkVocab(heard) {
  const w = vocabQ[vocabI];
  const norm = s => s.toLowerCase().replace(/[^a-z ]/g, '').trim();
  const ok = norm(heard).includes(norm(w.en)) ||
             norm(w.en).split(' ').every(wd => norm(heard).includes(wd));

  if (ok) {
    vocabOk++;
    showFb('vocabFb', 'ok', `✓ Correct! "${w.en}"`);
    speak(`Correct! ${w.en}`);
  } else {
    showFb('vocabFb', 'fail', `✗ Answer: "${w.en}" — you said: "${heard}"`);
    speak(`The answer is ${w.en}`);
  }
  vocabI++;
  setTimeout(showVocab, 2200);
}

function finishVocab() {
  const pct = Math.round(vocabOk / 10 * 100);
  document.getElementById('vocabWord').innerHTML =
    `${pct}%<div class="vocab-sub">${vocabOk}/10 correct — ${pct >= 80 ? 'Excellent!' : pct >= 60 ? 'Good job!' : 'Keep practising!'}</div>`;
  document.getElementById('vocabProg').style.width = '100%';
  document.getElementById('vocabScoreEl').textContent = vocabOk + ' / 10';
  speak(`Test complete. You scored ${vocabOk} out of 10. ${pct >= 80 ? 'Excellent work!' : 'Keep practising!'}`);
}

// ── SMALL TALK ─────────────────────────────────────────────
const TOPICS = ['weekend plans','work stress','the weather','travel dreams','favourite food','technology','learning languages','morning routines'];
let talkHistory = [];
let lastAiLine = '';

async function startTalk() {
  document.getElementById('talkStartBtn').disabled = true;
  document.getElementById('talkLoader').classList.add('on');
  document.getElementById('chatWrap').innerHTML = '';
  document.getElementById('talkBtns').style.display = 'none';
  document.getElementById('talkFb').className = 'feedback';
  talkHistory = [];

  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];

  try {
    const reply = await claude(
      'You are a friendly English conversation partner for a B2-level learner. One or two sentences per turn. Natural casual small talk. If the learner makes a grammar mistake, gently note it in parentheses.',
      `Start a small talk conversation. Topic hint: ${topic}. Just your opening line — keep it natural and short.`
    );
    document.getElementById('talkLoader').classList.remove('on');
    document.getElementById('talkStartBtn').disabled = false;
    lastAiLine = reply;
    talkHistory.push({ role: 'assistant', content: reply });
    addBubble(reply, 'ai');
    speak(reply, 'en-US', () => {
      document.getElementById('talkBtns').style.display = 'flex';
      setTimeout(listenTalk, 400);
    });
  } catch(e) {
    document.getElementById('talkLoader').classList.remove('on');
    document.getElementById('talkStartBtn').disabled = false;
    showFb('talkFb', 'fail', 'Connection error.');
  }
}

function replayTalk() { speak(lastAiLine); }

function listenTalk() {
  document.getElementById('talkWave').classList.add('on');
  document.getElementById('talkDot').classList.add('active');
  listen('en-US', heard => {
    document.getElementById('talkWave').classList.remove('on');
    document.getElementById('talkDot').classList.remove('active');
    processTalk(heard);
  }, () => {
    document.getElementById('talkWave').classList.remove('on');
    document.getElementById('talkDot').classList.remove('active');
    showFb('talkFb', 'fail', 'Could not hear. Tap Reply.');
  });
}

async function processTalk(heard) {
  addBubble(heard, 'user');
  talkHistory.push({ role: 'user', content: heard });
  showFb('talkFb', 'info', '...');
  document.getElementById('talkDot').classList.add('active');

  try {
    const sys = 'You are a friendly English conversation partner for a B2 learner. 1-2 sentences. Natural small talk. Note grammar errors in parentheses gently.';
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: sys, messages: talkHistory })
    });
    const d = await res.json();
    const reply = d.content.map(b => b.text || '').join('').trim();
    lastAiLine = reply;
    talkHistory.push({ role: 'assistant', content: reply });
    document.getElementById('talkFb').className = 'feedback';
    document.getElementById('talkDot').classList.remove('active');
    addBubble(reply, 'ai');
    speak(reply, 'en-US', () => setTimeout(listenTalk, 400));
  } catch(e) {
    document.getElementById('talkDot').classList.remove('active');
    showFb('talkFb', 'fail', 'Connection error.');
  }
}

function addBubble(text, who) {
  const wrap = document.getElementById('chatWrap');
  const d = document.createElement('div');
  d.className = 'bubble ' + who;
  d.textContent = text;
  wrap.appendChild(d);
  wrap.scrollTop = wrap.scrollHeight;
}

// ── UTILS ───────────────────────────────────────────────────
function showFb(id, type, msg) {
  const el = document.getElementById(id);
  el.className = 'feedback ' + type;
  el.textContent = msg;
}

function fb(containerId, type, msg) {
  document.getElementById(containerId).innerHTML =
    `<div class="feedback ${type}" style="display:block">${msg}</div>`;
}

// start always-on on home load
window.addEventListener('load', () => {
  startAlwaysOn();
});
