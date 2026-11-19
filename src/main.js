import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { LESSONS, QUIZ } from './lessons.js';
import './style.css';

// ---------- Durum ----------
let mode = 'pron';
let currentPhrase = null;
let ttsMuted = false;
let statusBadge = document.getElementById('statusBadge');
function setStatus(text){ statusBadge.textContent = text; }

// ---------- Avatar animasyon ----------
const mouth = document.getElementById('mouth');
const eyes = document.getElementById('eyes');
let mouthOpen = 0;
function setMouth(open){ mouth.setAttribute('ry', 4 + open*12); }
function blink(){ eyes.setAttribute('transform','scale(1,0.2)'); setTimeout(()=>eyes.removeAttribute('transform'),150); }
setInterval(blink, 3000);

// ---------- TTS ----------
let voices = [];
function loadVoices(){ if(typeof speechSynthesis==="undefined") return; const vList=speechSynthesis.getVoices(); const sel=document.getElementById("voiceSelect"); if(!sel) return; sel.innerHTML=""; vList.filter(function(v){return v.lang.startsWith("de");}).forEach(function(v){const o=document.createElement("option");o.value=v.name;o.textContent=v.name;sel.appendChild(o);}); }
if(typeof speechSynthesis!=='undefined'){ speechSynthesis.onvoiceschanged = loadVoices; loadVoices(); }

async function speak(text, onEnd){
  if (ttsMuted){ if(onEnd) onEnd(); return; }
  setStatus('Konuşuyor...');
  mouthOpen=0.5; animateMouth();
  const isSlow = parseFloat((document.getElementById('speed') ? document.getElementById('speed').value : '1')) < 1;
  if (Capacitor.isNativePlatform()) {
    try {
      await TextToSpeech.speak({ text, lang:'de-DE', rate: isSlow ? 0.7 : 1.0, pitch:1.0, volume:1.0 });
    } catch(e) { console.error(e); }
    mouthOpen=0; setMouth(0); setStatus('Hazır'); if(onEnd) onEnd();
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang='de-DE';
  u.rate = parseFloat((document.getElementById('speed') ? document.getElementById('speed').value : '1'));
  const sel = document.getElementById('voiceSelect').value;
  const v = voices.find(x=>x.name===sel);
  if(v) u.voice=v;
  u.onstart = () => { mouthOpen=0.5; animateMouth(); };
  u.onboundary = () => { mouthOpen=0.8; };
  u.onend = () => { mouthOpen=0; setMouth(0); setStatus('Hazır'); if(onEnd) onEnd(); };
  speechSynthesis.speak(u);
}
function animateMouth(){
  if (mouthOpen>0){ setMouth(mouthOpen); mouthOpen *= 0.85; requestAnimationFrame(animateMouth); }
  else setMouth(0);
}

// ---------- STT ----------
const WebSpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
if (WebSpeechRecognition) {
  recognizer = new WebSpeechRecognition();
  recognizer.lang = 'de-DE';
  recognizer.interimResults = true;
  recognizer.maxAlternatives = 3;
}

function normalize(w){ return (w||'').toLowerCase().replace(/[.,!?]/g,''); }

function compareWords(expected, spoken){
  const exp = expected.split(/\s+/).map(normalize);
  const sp = spoken.split(/\s+/).map(normalize);
  let html=''; let score=0;
  exp.forEach((w,i)=>{
    const ok = sp[i]===w;
    if(ok) score++;
    html += `<span class="${ok?'good':'bad'}">${w}</span> `;
  });
  return {html, score, total:exp.length};
}

// ---------- Modlar ----------
document.querySelectorAll('.mode').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); mode=b.dataset.mode; renderMode();
  });
});

function renderMode(){
  const sel=document.getElementById('lessonSelect');
  sel.innerHTML='';
  if(mode==='pron'){
    const select=document.createElement('select');
    Object.keys(LESSONS).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=LESSONS[k].title;select.appendChild(o);});
    select.addEventListener('change',()=>loadLesson(select.value));
    sel.appendChild(select);
    loadLesson(select.value);
  } else if(mode==='quiz'){
    startQuiz();
  } else {
    sel.innerHTML='<p>Konuşma pratiği: Almanca yazın, öğretmen yanıtlayacak.</p>';
  }
}

function loadLesson(key){
  const lesson=LESSONS[key];
  const item=lesson.items[Math.floor(Math.random()*lesson.items.length)];
  currentPhrase=item;
  document.getElementById('transcript').innerHTML = `<div class="de">${item.de}</div><div class="tr">${item.tr}</div><div class="hint">Okunuş: ${item.hint}</div>`;
  document.getElementById('feedback').textContent='';
  speak(item.de);
}

let quizIndex=0;
function startQuiz(){
  const q=QUIZ[quizIndex % QUIZ.length];
  document.getElementById('transcript').innerHTML = `<div class="de">${q.q}</div>`;
  document.getElementById('feedback').textContent='Cevabı Almanca söyleyin.';
  speak(q.q);
}

// ---------- Kontroller ----------
document.getElementById('listenBtn').addEventListener('click', ()=>{
  if(mode==='pron' && currentPhrase) speak(currentPhrase.de);
  else if(mode==='quiz'){ const q=QUIZ[quizIndex%QUIZ.length]; speak(q.q); }
  else speak('Hallo! Wie geht es dir?');
});
document.getElementById('repeatBtn').addEventListener('click', ()=>{
  const txt = document.getElementById('transcript').querySelector('.de')?.textContent || '';
  speak(txt);
});
document.getElementById('muteBtn').addEventListener('click', ()=>{ ttsMuted=!ttsMuted; document.getElementById('muteBtn').textContent = ttsMuted?'🔇':'🔊'; });
document.getElementById('listenBtn').addEventListener('click', startListening);

async function startListening(){
  setStatus('Dinliyor... (Almanca konuşun)');
  if (Capacitor.isNativePlatform()) {
    try {
      await SpeechRecognition.requestPermissions();
      const result = await SpeechRecognition.start({ language:'de-DE', maxResults:3, prompt:'Almanca konuşun...', partialResults:false, popup:true });
      const transcript = result.matches && result.matches[0] ? result.matches[0] : '';
      if(mode==='pron' && currentPhrase){
        const {html,score,total}=compareWords(currentPhrase.de, transcript);
        document.getElementById('feedback').innerHTML = html + `<br>Skor: ${score}/${total} (${Math.round(score/total*100)}%)`;
        if(score/total > 0.7) log('Harika! Doğru telaffuz.');
        else log('Tekrar deneyin.');
      } else if(mode==='quiz'){
        const q=QUIZ[quizIndex%QUIZ.length];
        if(normalize(transcript).includes(normalize(q.a))){ log('Doğru!'); quizIndex++; startQuiz(); }
        else { log('Yanlış. Söylediğin: ' + transcript); }
      }
    } catch(e){ log('Hata: '+e.message); }
    setStatus('Hazır');
    return;
  }
  if(!recognizer){ log('Tarayıcı konuşma tanıma desteklemiyor.'); setStatus('Hazır'); return; }
  recognizer.start();
  recognizer.onresult = (e) => {
    let transcript='';
    for(let i=e.resultIndex;i<e.results.length;i++) transcript += e.results[i][0].transcript;
    if(mode==='pron' && currentPhrase){
      const {html,score,total}=compareWords(currentPhrase.de, transcript);
      document.getElementById('feedback').innerHTML = html + `<br>Skor: ${score}/${total} (${Math.round(score/total*100)}%)`;
      if(score/total > 0.7) log('Harika! Doğru telaffuz.');
      else log('Tekrar deneyin.');
    } else if(mode==='quiz'){
      const q=QUIZ[quizIndex%QUIZ.length];
      if(normalize(transcript).includes(normalize(q.a))){ log('Doğru!'); quizIndex++; startQuiz(); }
      else { log('Yanlış. Söylediğin: ' + transcript); }
    }
  };
  recognizer.onerror = (e) => { setStatus('Hazır'); log('Hata: '+e.error); };
  recognizer.onend = () => setStatus('Hazır');
}

// ---------- Konuşma (Ollama) ----------
document.getElementById('sendBtn').addEventListener('click', async ()=>{
  const text = document.getElementById('textInput').value.trim();
  if(!text) return;
  log('Sen: ' + text);
  setStatus('Düşünüyor...');
  try {
    const res = await fetch('http://localhost:11434/api/chat', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        model:'llama3.2',
        messages:[
          {role:'system', content:'Du bist ein geduldiger Deutschlehrer für türkische Schüler. Antworte in einfachem Deutsch und erkläre Grammatikfehler auf Türkisch.'},
          {role:'user', content:text}
        ],
        stream:false
      })
    });
    const json = await res.json();
    const reply = json.message?.content || 'Keine Antwort';
    log('Öğretmen: ' + reply);
    speak(reply);
  } catch(e){
    // offline fallback
    const fallback = 'Gut! Weiter so. (Ollama çalışmıyor, offline mod.)';
    log('Öğretmen (offline): ' + fallback);
    speak(fallback);
  }
});

// ---------- Init ----------
let logEl = document.getElementById('log');
renderMode();
function log(msg){ logEl.innerHTML += msg + '<br>'; logEl.scrollTop = logEl.scrollHeight; }
// expose log after definition? redefine above usage ok due to hoisting? function declaration hoisted.
