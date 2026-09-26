/* ═══════════════════════════════════════════════════════════════════
   31 · A AULA GRAVADA
   A pessoa grava a aula inteira pelo microfone do aparelho e, no fim, a
   IA transforma a gravação em notas na anotação da matéria.

   Três decisões que moldam este arquivo:

   1. A gravação sai em TRECHOS de dez minutos, e cada trecho vai para o
      aparelho (IndexedDB) a cada trinta segundos. Uma aula de duas horas
      não pode depender de a aba sobreviver duas horas: se o celular
      travar aos 1h50, perde-se meio minuto, e não a aula.
   2. O gravador mora no nível do app, e não na tela da anotação. Trocar
      de aba durante a aula desmontaria a tela e pararia a gravação; aqui
      ela continua, com um aviso flutuante sempre à vista.
   3. O áudio sobe como foi gravado (o menor possível). Se o serviço de
      transcrição recusar o formato — o Chrome grava em WebM, que o Gemini
      não lista entre os formatos aceitos —, o próprio aparelho converte
      aquele trecho para MP3 e tenta de novo.
   ═══════════════════════════════════════════════════════════════════ */

/* ── a lógica pura (copiada e testada pelo extrair_aula.py) ─────────── */
const MINUTOS_POR_TRECHO = 10;
const SEGUNDOS_ENTRE_SALVAMENTOS = 30;
const BITRATE_GRAVACAO = 24000;
/* 16 kHz é o que a fala precisa para ser transcrita; mais que isso só
   aumenta o arquivo. 32 kbps em MP3 mono dá ~14 MB por hora. */
const TAXA_TRANSCRICAO = 16000;
const KBPS_MP3 = 32;

/* O formato de gravação, na ordem de preferência. Opus é o menor para
   fala; o Safari não tem, e grava em MP4 (AAC). */
const TIPOS_GRAVACAO = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];

function tipoDeGravacao(suporta) {
  for (const t of TIPOS_GRAVACAO) {
    try { if (suporta(t)) return t; } catch (e) { /* navegador sem isTypeSupported */ }
  }
  return "";
}

function tipoBaseAudio(tipo) {
  return String(tipo || "").split(";")[0].trim().toLowerCase();
}

function extensaoDoAudio(tipo) {
  const t = tipoBaseAudio(tipo);
  return t === "audio/mp4" ? "m4a" : t === "audio/ogg" ? "ogg" : t === "audio/mpeg" || t === "audio/mp3" ? "mp3" : t === "audio/wav" ? "wav" : "webm";
}

/* Float de -1 a 1 para inteiro de 16 bits. Valor fora da faixa (um pico
   de microfone) é aparado, e não dá a volta: dar a volta vira estalo. */
function paraInt16(f32) {
  const fora = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const v = Math.max(-1, Math.min(1, Number(f32[i]) || 0));
    fora[i] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
  }
  return fora;
}

/* Vários canais viram um: a média. Transcrição não precisa de estéreo, e
   metade do tamanho é metade do envio pelo celular. */
function misturarMono(canais) {
  const lista = (canais || []).filter(Boolean);
  if (!lista.length) return new Float32Array(0);
  if (lista.length === 1) return Float32Array.from(lista[0]);
  const n = Math.min(...lista.map((c) => c.length));
  const fora = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const c of lista) s += c[i];
    fora[i] = s / lista.length;
  }
  return fora;
}

/* Um WAV de 16 bits, mono. É a reserva da reserva: se nem o MP3 der
   (a biblioteca não carregou), manda assim — maior, mas aceito. */
function wavDe(int16, taxa) {
  const dados = int16.length * 2;
  const buf = new ArrayBuffer(44 + dados);
  const v = new DataView(buf);
  const escrever = (pos, s) => { for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i)); };
  escrever(0, "RIFF"); v.setUint32(4, 36 + dados, true); escrever(8, "WAVE");
  escrever(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, taxa, true); v.setUint32(28, taxa * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  escrever(36, "data"); v.setUint32(40, dados, true);
  for (let i = 0; i < int16.length; i++) v.setInt16(44 + i * 2, int16[i], true);
  return new Uint8Array(buf);
}

/* MP3 com o lamejs. Recebe a biblioteca como parâmetro para poder ser
   testada no Node com o mesmo arquivo que vai para o ar. */
function mp3De(int16, taxa, kbps, lame) {
  const enc = new lame.Mp3Encoder(1, taxa, kbps);
  const partes = [];
  let total = 0;
  const BLOCO = 1152;
  for (let i = 0; i < int16.length; i += BLOCO) {
    const b = enc.encodeBuffer(int16.subarray(i, i + BLOCO));
    if (b.length) { partes.push(b); total += b.length; }
  }
  const f = enc.flush();
  if (f.length) { partes.push(f); total += f.length; }
  const fora = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { fora.set(new Uint8Array(p.buffer, p.byteOffset, p.length), pos); pos += p.length; }
  return fora;
}

/* A transcrição inteira, na ordem. Trecho que faltou fica marcado no
   lugar dele: juntar sem marcar faria a IA ligar o fim do trecho 3 ao
   começo do 5 como se fosse a mesma fala. */
function juntarTranscricoes(transcricoes, total) {
  const t = transcricoes || {};
  const partes = [];
  for (let n = 0; n < Math.max(0, Number(total) || 0); n++) {
    const texto = String(t[n] || "").trim();
    partes.push(texto || `[trecho ${n + 1}: sem transcrição]`);
  }
  return partes.join("\n\n");
}

/* Quais trechos ainda faltam transcrever. É o que deixa retomar de onde
   parou, sem repagar os que já foram. */
function faltamTranscrever(gravacao) {
  const g = gravacao || {};
  const t = g.transcricoes || {};
  const fora = [];
  for (let n = 0; n < Math.max(0, Number(g.trechos) || 0); n++) {
    if (!String(t[n] || "").trim()) fora.push(n);
  }
  return fora;
}

function fmtDuracaoAula(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), g = s % 60;
  const dd = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${dd(m)}:${dd(g)}` : `${dd(m)}:${dd(g)}`;
}
/* ── fim da lógica pura ─────────────────────────────────────────────── */

/* ── o depósito das gravações (IndexedDB) ─────────────────────────────
 *
 * Duas lojas: "gravacoes", a ficha de cada aula (matéria, duração, as
 * transcrições já feitas), e "trechos", o áudio de cada trecho. Separadas
 * para que listar as aulas de uma matéria não carregue horas de áudio.
 */
const BD_AULAS = "cadencia-aulas";

function abrirBDAulas() {
  return new Promise((ok, falha) => {
    if (!window.indexedDB) return falha(new Error("Este navegador não guarda gravações."));
    const req = window.indexedDB.open(BD_AULAS, 1);
    req.onupgradeneeded = () => {
      const bd = req.result;
      if (!bd.objectStoreNames.contains("gravacoes")) bd.createObjectStore("gravacoes", { keyPath: "id" });
      if (!bd.objectStoreNames.contains("trechos")) bd.createObjectStore("trechos");
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
}

async function naLoja(loja, modo, fazer) {
  const bd = await abrirBDAulas();
  return new Promise((ok, falha) => {
    const tx = bd.transaction(loja, modo);
    let resultado;
    const r = fazer(tx.objectStore(loja));
    if (r) r.onsuccess = () => { resultado = r.result; };
    tx.oncomplete = () => { bd.close(); ok(resultado); };
    tx.onerror = () => { bd.close(); falha(tx.error); };
  });
}

const salvarFichaAula = (g) => naLoja("gravacoes", "readwrite", (l) => l.put(g));
const lerFichaAula = (id) => naLoja("gravacoes", "readonly", (l) => l.get(id));
const salvarTrechoAula = (id, n, blob) => naLoja("trechos", "readwrite", (l) => l.put(blob, `${id}|${n}`));
const lerTrechoAula = (id, n) => naLoja("trechos", "readonly", (l) => l.get(`${id}|${n}`));

async function listarAulas(subjectId) {
  const todas = (await naLoja("gravacoes", "readonly", (l) => l.getAll())) || [];
  return todas.filter((g) => !subjectId || g.subjectId === subjectId)
    .sort((a, b) => (b.inicio || 0) - (a.inicio || 0));
}

async function apagarAula(id) {
  const g = await lerFichaAula(id);
  const n = (g && g.trechos) || 0;
  await naLoja("trechos", "readwrite", (l) => { for (let i = 0; i < n + 1; i++) l.delete(`${id}|${i}`); });
  await naLoja("gravacoes", "readwrite", (l) => l.delete(id));
}

/* ── o gravador, um só para o app inteiro ─────────────────────────────
 *
 * Não é estado do React de propósito: é um objeto do módulo, que continua
 * vivo quando a tela da anotação é desmontada. As telas só OUVEM o que
 * ele anuncia.
 */
const gravadorAula = {
  estado: { ativo: false, pausado: false, id: "", subjectId: "", titulo: "", acumuladoMs: 0, desde: 0, nivel: 0, trecho: 0, erro: "" },
  ouvintes: new Set(),
  anunciar() { for (const f of this.ouvintes) { try { f(); } catch (e) { /* noop */ } } },
  mudar(parcial) { this.estado = { ...this.estado, ...parcial }; this.anunciar(); },
  duracao() {
    const e = this.estado;
    return e.acumuladoMs + (e.ativo && !e.pausado && e.desde ? Date.now() - e.desde : 0);
  },
  _stream: null, _rec: null, _tipo: "", _girar: null, _restaMs: 0, _inicioTrecho: 0,
  _ctx: null, _analisador: null, _medidor: null, _trava: null,
};

function useGravadorAula() {
  const [, forcar] = useState(0);
  useEffect(() => {
    const f = () => forcar((n) => n + 1);
    gravadorAula.ouvintes.add(f);
    return () => { gravadorAula.ouvintes.delete(f); };
  }, []);
  return gravadorAula.estado;
}

/* A tela acesa durante a aula. Com ela apagada, o celular suspende a
   página e o microfone para — o que, numa aula, é descobrir no fim que
   só os primeiros dois minutos foram gravados. */
async function manterTelaAcesa() {
  try {
    if (navigator.wakeLock && document.visibilityState === "visible") {
      gravadorAula._trava = await navigator.wakeLock.request("screen");
    }
  } catch (e) { /* sem suporte ou negado: o aviso na tela pede para não bloquear */ }
}
document.addEventListener("visibilitychange", () => {
  if (gravadorAula.estado.ativo && document.visibilityState === "visible") manterTelaAcesa();
});

/* Enquanto há aula gravando, o navegador pede confirmação antes de
   recarregar ou fechar a página. Cobre o fechar sem querer, o puxar para
   atualizar do celular e o "atualizar agora" da tarja de versão nova —
   qualquer um deles pararia a gravação no meio. O que já foi gravado fica
   salvo de qualquer jeito; o que isto evita é perder o resto da aula. */
function avisoAoSairDaAula(ev) {
  if (!gravadorAula.estado.ativo) return undefined;
  ev.preventDefault();
  ev.returnValue = "";
  return "";
}

function comecarTrechoAula() {
  const g = gravadorAula;
  const id = g.estado.id;
  const n = g.estado.trecho;
  const tipo = g._tipo;
  const pedacos = [];
  let rec;
  try {
    rec = new MediaRecorder(g._stream, { mimeType: tipo, audioBitsPerSecond: BITRATE_GRAVACAO });
  } catch (e) {
    rec = new MediaRecorder(g._stream);
  }
  rec.ondataavailable = (ev) => {
    if (!ev.data || !ev.data.size) return;
    pedacos.push(ev.data);
    /* Cada pedaço regrava o trecho inteiro até aqui: um trecho parcial é
       um arquivo válido, então o que já foi salvo sempre toca. */
    salvarTrechoAula(id, n, new Blob(pedacos, { type: rec.mimeType || tipo })).catch(() => {});
  };
  rec.onstop = async () => {
    if (g.estado.ativo && g._girando) {
      g._girando = false;
      const ficha = await lerFichaAula(id).catch(() => null);
      if (ficha) await salvarFichaAula({ ...ficha, trechos: n + 2, duracaoMs: g.duracao() }).catch(() => {});
      g.mudar({ trecho: n + 1 });
      comecarTrechoAula();
    }
  };
  g._rec = rec;
  g._inicioTrecho = Date.now();
  g._restaMs = MINUTOS_POR_TRECHO * 60 * 1000;
  rec.start(SEGUNDOS_ENTRE_SALVAMENTOS * 1000);
  agendarGiroAula();
}

function agendarGiroAula() {
  const g = gravadorAula;
  if (g._girar) window.clearTimeout(g._girar);
  g._inicioTrecho = Date.now();
  g._girar = window.setTimeout(() => {
    if (!g._rec || g._rec.state === "inactive") return;
    g._girando = true;
    g._rec.stop();
  }, g._restaMs);
}

async function iniciarGravacaoAula({ subjectId, titulo }) {
  const g = gravadorAula;
  if (g.estado.ativo) return { erro: "Já tem uma aula sendo gravada." };
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
    return { erro: "Este navegador não grava áudio. No iPhone, use o Safari atualizado." };
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    return { erro: "O navegador não liberou o microfone. Libere no cadeado ao lado do endereço." };
  }
  const tipo = tipoDeGravacao((t) => MediaRecorder.isTypeSupported(t));
  const id = uid().replace(/[^a-z0-9]/gi, "").toLowerCase() + Date.now().toString(36);
  const agora = Date.now();
  try {
    await salvarFichaAula({
      id, subjectId, titulo: String(titulo || "Aula").slice(0, 120), inicio: agora,
      tipo: tipo || "audio/webm", trechos: 1, duracaoMs: 0, status: "gravando",
      transcricoes: {}, notasEm: "",
    });
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    return { erro: "Não consegui reservar espaço no aparelho para a gravação." };
  }

  g._stream = stream;
  g._tipo = tipo;
  g.mudar({ ativo: true, pausado: false, id, subjectId, titulo, acumuladoMs: 0, desde: agora, trecho: 0, erro: "", nivel: 0 });

  /* O medidor de volume. Sem ele, um microfone mudo ou bloqueado grava
     duas horas de silêncio, e só se descobre no fim. */
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    g._ctx = new Ctx();
    const fonte = g._ctx.createMediaStreamSource(stream);
    g._analisador = g._ctx.createAnalyser();
    g._analisador.fftSize = 512;
    fonte.connect(g._analisador);
    const amostra = new Float32Array(g._analisador.fftSize);
    g._medidor = window.setInterval(() => {
      if (!g._analisador) return;
      g._analisador.getFloatTimeDomainData(amostra);
      let s = 0;
      for (let i = 0; i < amostra.length; i++) s += amostra[i] * amostra[i];
      g.mudar({ nivel: Math.min(1, Math.sqrt(s / amostra.length) * 4) });
    }, 200);
  } catch (e) { /* sem medidor; a gravação segue */ }

  manterTelaAcesa();
  window.addEventListener("beforeunload", avisoAoSairDaAula);
  comecarTrechoAula();
  return { ok: true, id };
}

function pausarGravacaoAula() {
  const g = gravadorAula;
  if (!g.estado.ativo || g.estado.pausado || !g._rec) return;
  try { g._rec.pause(); } catch (e) { /* noop */ }
  if (g._girar) window.clearTimeout(g._girar);
  g._restaMs = Math.max(1000, g._restaMs - (Date.now() - g._inicioTrecho));
  g.mudar({ pausado: true, acumuladoMs: g.duracao(), desde: 0 });
}

function retomarGravacaoAula() {
  const g = gravadorAula;
  if (!g.estado.ativo || !g.estado.pausado || !g._rec) return;
  try { g._rec.resume(); } catch (e) { /* noop */ }
  g.mudar({ pausado: false, desde: Date.now() });
  agendarGiroAula();
}

async function pararGravacaoAula() {
  const g = gravadorAula;
  if (!g.estado.ativo) return null;
  const { id, trecho } = g.estado;
  const duracao = g.duracao();
  if (g._girar) window.clearTimeout(g._girar);
  if (g._medidor) window.clearInterval(g._medidor);
  g.mudar({ ativo: false, pausado: false, nivel: 0 });
  window.removeEventListener("beforeunload", avisoAoSairDaAula);
  /* Espera o último pedaço sair antes de soltar o microfone: parar o
     microfone primeiro corta o fim do último trecho. */
  if (g._rec && g._rec.state !== "inactive") {
    await new Promise((ok) => {
      const antes = g._rec.onstop;
      g._rec.onstop = (...a) => { try { if (antes) antes(...a); } finally { window.setTimeout(ok, 300); } };
      try { g._rec.stop(); } catch (e) { ok(); }
    });
  }
  try { g._stream && g._stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* noop */ }
  try { g._ctx && g._ctx.close(); } catch (e) { /* noop */ }
  try { g._trava && g._trava.release(); } catch (e) { /* noop */ }
  g._stream = null; g._rec = null; g._ctx = null; g._analisador = null; g._trava = null;
  const ficha = await lerFichaAula(id).catch(() => null);
  if (ficha) await salvarFichaAula({ ...ficha, trechos: trecho + 1, duracaoMs: duracao, status: "pronta" }).catch(() => {});
  g.mudar({ acumuladoMs: 0, desde: 0 });
  return id;
}

/* ── a conversão de reserva ───────────────────────────────────────────
 *
 * Só roda quando o serviço recusa o formato gravado. Decodifica o trecho
 * no próprio aparelho, já em 16 kHz e mono, e codifica em MP3.
 */
let lamePromessa = null;
function carregarLame() {
  if (window.lamejs && window.lamejs.Mp3Encoder) return Promise.resolve(window.lamejs);
  if (lamePromessa) return lamePromessa;
  lamePromessa = (async () => {
    try { await baixarScript("/lame.min.js"); }
    catch (e) {
      try { await baixarScript("https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js"); }
      catch (e2) { lamePromessa = null; throw new Error("sem codificador de MP3"); }
    }
    if (!window.lamejs || !window.lamejs.Mp3Encoder) { lamePromessa = null; throw new Error("sem codificador de MP3"); }
    return window.lamejs;
  })();
  return lamePromessa;
}

async function pcmDoTrecho(blob) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Offline(1, TAXA_TRANSCRICAO, TAXA_TRANSCRICAO);
  const bytes = await blob.arrayBuffer();
  const audio = await new Promise((ok, falha) => {
    const p = ctx.decodeAudioData(bytes, ok, falha);
    if (p && p.then) p.then(ok, falha);
  });
  const canais = [];
  for (let c = 0; c < audio.numberOfChannels; c++) canais.push(audio.getChannelData(c));
  let mono = misturarMono(canais);
  /* O decodificador entrega na taxa do contexto (16 kHz) na maioria dos
     navegadores; quando não, reamostra aqui. */
  if (audio.sampleRate !== TAXA_TRANSCRICAO) {
    const fator = audio.sampleRate / TAXA_TRANSCRICAO;
    const n = Math.floor(mono.length / fator);
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) r[i] = mono[Math.floor(i * fator)];
    mono = r;
  }
  return paraInt16(mono);
}

async function converterTrechoAula(blob) {
  const pcm = await pcmDoTrecho(blob);
  try {
    const lame = await carregarLame();
    return { tipo: "audio/mp3", bytes: mp3De(pcm, TAXA_TRANSCRICAO, KBPS_MP3, lame) };
  } catch (e) {
    return { tipo: "audio/wav", bytes: wavDe(pcm, TAXA_TRANSCRICAO) };
  }
}

const base64DeBytes = (bytes) => {
  let s = "";
  const PEDACO = 0x8000;
  for (let i = 0; i < bytes.length; i += PEDACO) s += String.fromCharCode.apply(null, bytes.subarray(i, i + PEDACO));
  return btoa(s);
};
const base64DeBlob = (blob) => new Promise((ok, falha) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result || "").replace(/^data:[^,]*,/, ""));
  r.onerror = () => falha(r.error);
  r.readAsDataURL(blob);
});

/* ── transcrever e organizar ──────────────────────────────────────────── */
const ROTA_AULA_IA = "/api/aula-ia";
const processandoAulas = new Map();   // id -> { passo, feito, total }

async function falarComAulaIA(nuvem, corpo) {
  let token = "";
  try {
    if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
      token = await nuvem.sdk.auth.currentUser.getIdToken();
    }
  } catch (e) { /* sem conta, a rota recusa */ }
  if (!token) return { erro: "Entre na sua conta para organizar a aula com IA." };
  const { dados, erro } = await chamarApi(ROTA_AULA_IA, { ...corpo, token }, "A organização da aula");
  return erro ? { erro, ...(dados || {}) } : (dados || {});
}

/* A aula inteira: transcreve o que falta, trecho a trecho, e organiza.
   Cada transcrição é guardada assim que chega — uma queda no meio não
   faz ninguém repagar os trechos que já deram certo. */
async function organizarAula(nuvem, id, aoProgresso) {
  let ficha = await lerFichaAula(id);
  if (!ficha) return { erro: "Não achei essa gravação no aparelho." };
  const total = ficha.trechos || 0;
  const faltam = faltamTranscrever(ficha);
  let feitos = total - faltam.length;
  const avisar = (passo) => {
    processandoAulas.set(id, { passo, feito: feitos, total });
    gravadorAula.anunciar();
    if (aoProgresso) aoProgresso(passo, feitos, total);
  };

  for (const n of faltam) {
    avisar(`transcrevendo o trecho ${n + 1} de ${total}`);
    const blob = await lerTrechoAula(id, n).catch(() => null);
    if (!blob || !blob.size) { feitos += 1; continue; }   // trecho vazio: segue
    let j = await falarComAulaIA(nuvem, {
      acao: "transcrever", parte: n + 1, total, tema: ficha.titulo,
      audio: { tipo: blob.type || ficha.tipo, dados: await base64DeBlob(blob) },
    });
    if (j.formatoRecusado) {
      avisar(`convertendo o trecho ${n + 1} para um formato aceito`);
      try {
        const conv = await converterTrechoAula(blob);
        j = await falarComAulaIA(nuvem, {
          acao: "transcrever", parte: n + 1, total, tema: ficha.titulo,
          audio: { tipo: conv.tipo, dados: base64DeBytes(conv.bytes) },
        });
      } catch (e) {
        j = { erro: "Não consegui converter o áudio neste aparelho." };
      }
    }
    if (j.erro) {
      processandoAulas.delete(id);
      gravadorAula.anunciar();
      return { erro: `${j.erro} As partes já transcritas ficaram guardadas: é só tentar de novo.` };
    }
    ficha = { ...(await lerFichaAula(id)) };
    ficha.transcricoes = { ...(ficha.transcricoes || {}), [n]: j.texto || "" };
    await salvarFichaAula(ficha);
    feitos += 1;
  }

  avisar("organizando as notas");
  const transcricao = juntarTranscricoes(ficha.transcricoes, total);
  const j = await falarComAulaIA(nuvem, {
    acao: "organizar", transcricao, tema: ficha.titulo,
    quando: brDate(toISO(new Date(ficha.inicio || Date.now()))),
  });
  processandoAulas.delete(id);
  gravadorAula.anunciar();
  if (j.erro) return { erro: j.erro };
  ficha = await lerFichaAula(id);
  await salvarFichaAula({ ...ficha, notasEm: todayISO() });
  return { ok: true, html: j.html };
}

/* ── entregar as notas na anotação ────────────────────────────────────
 *
 * Se a anotação daquela matéria estiver aberta, as notas entram no editor
 * (e o salvamento automático cuida do resto). Se estiver fechada, entram
 * direto nos dados. Escrever direto nos dados com o editor ABERTO seria
 * perder as notas: o próximo salvamento do editor gravaria por cima o que
 * ele tem na tela, que é o texto de antes.
 */
const editoresAbertos = new Map();   // subjectId -> (html) => void

function entregarNotasDaAula(subjectId, html, setData) {
  const noEditor = editoresAbertos.get(subjectId);
  if (noEditor) { noEditor(html); return; }
  setData((p) => {
    const antes = ((p.anotacoes || {})[subjectId] || {}).html || "";
    return {
      ...p,
      anotacoes: { ...p.anotacoes, [subjectId]: { html: antes + (antes ? "<hr>" : "") + html, atualizadoEm: Date.now() } },
    };
  });
}

/* ── a tela, dentro da anotação da matéria ────────────────────────────── */
function GravarAula({ subjectId, titulo, notify, nuvem, setData }) {
  const estado = useGravadorAula();
  const [aulas, setAulas] = useState([]);
  const [msg, setMsg] = useState("");

  const recarregar = useCallback(async () => {
    try { setAulas(await listarAulas(subjectId)); } catch (e) { setAulas([]); }
  }, [subjectId]);
  useEffect(() => { recarregar(); }, [recarregar, estado.ativo, estado.trecho]);

  const gravandoAqui = estado.ativo && estado.subjectId === subjectId;
  const gravandoOutra = estado.ativo && estado.subjectId !== subjectId;

  const [, tique] = useState(0);
  useEffect(() => {
    if (!gravandoAqui) return undefined;
    const t = window.setInterval(() => tique((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [gravandoAqui]);

  const comecar = async () => {
    setMsg("");
    const r = await iniciarGravacaoAula({ subjectId, titulo });
    if (r.erro) { setMsg(r.erro); return; }
    notify("Gravando. Pode trocar de aba: a gravação continua.");
  };

  const parar = async () => {
    const id = await pararGravacaoAula();
    await recarregar();
    if (id) notify("Aula gravada e guardada neste aparelho.");
  };

  const organizar = async (g) => {
    setMsg("");
    const r = await organizarAula(nuvem, g.id, () => tique((n) => n + 1));
    await recarregar();
    if (r.erro) { setMsg(r.erro); return; }
    entregarNotasDaAula(subjectId, r.html, setData);
    notify("Notas da aula adicionadas à anotação.");
  };

  const baixarTranscricao = async (g) => {
    const f = await lerFichaAula(g.id);
    const texto = juntarTranscricoes((f || {}).transcricoes, (f || {}).trechos);
    baixarBlob(`transcricao-${String(g.titulo || "aula").slice(0, 40).replace(/[\\/:*?"<>|]+/g, "-")}.txt`,
      new Blob([texto], { type: "text/plain;charset=utf-8" }));
  };

  const baixarAudio = async (g) => {
    for (let n = 0; n < (g.trechos || 0); n++) {
      const b = await lerTrechoAula(g.id, n).catch(() => null);
      if (b && b.size) baixarBlob(`aula-${toISO(new Date(g.inicio || Date.now()))}-parte${n + 1}.${extensaoDoAudio(b.type || g.tipo)}`, b);
    }
  };

  const apagar = async (g) => {
    if (gravadorAula.estado.id === g.id && gravadorAula.estado.ativo) return;
    await apagarAula(g.id).catch(() => {});
    await recarregar();
  };

  return (
    <div className="rounded-xl px-3.5 py-3" style={{ background: T.card2, border: `1px solid ${T.line}` }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Mic size={15} style={{ color: gravandoAqui ? "var(--bad)" : "var(--neon)" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>Gravar a aula</span>
        </div>
        {gravandoAqui ? (
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: F_MONO, fontSize: 14, color: estado.pausado ? T.warn : "var(--bad)" }}>
              {estado.pausado ? "pausada" : "●"} {fmtDuracaoAula(gravadorAula.duracao())}
            </span>
            {estado.pausado
              ? <Btn size="sm" onClick={retomarGravacaoAula}><Play size={13} /> continuar</Btn>
              : <Btn size="sm" tone="quiet" onClick={pausarGravacaoAula}><Pause size={13} /> pausar</Btn>}
            <Btn size="sm" tone="primary" onClick={parar}><CircleStop size={13} /> terminar</Btn>
          </div>
        ) : (
          <Btn size="sm" tone="primary" disabled={gravandoOutra} onClick={comecar}>
            <Mic size={13} /> {gravandoOutra ? "gravando outra aula" : "Começar a gravar"}
          </Btn>
        )}
      </div>

      {gravandoAqui ? (
        <>
          <div className="mt-3" style={{ height: 6, borderRadius: 99, background: T.card3, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${Math.round((estado.pausado ? 0 : estado.nivel) * 100)}%`,
              background: estado.nivel > 0.05 ? "var(--ok)" : "var(--warn)", transition: "width .2s",
            }} />
          </div>
          <Mini style={{ marginTop: 8, lineHeight: 1.6 }}>
            {estado.nivel > 0.05 || estado.pausado
              ? "Ouvindo. Deixe a tela acesa e o app aberto — pode trocar de aba à vontade."
              : "Quase nenhum som chegando. Confira se o microfone não está coberto ou longe demais."}
            {" "}Trecho {estado.trecho + 1}, salvo no aparelho a cada 30 segundos.
          </Mini>
        </>
      ) : (
        <Mini style={{ marginTop: 8, lineHeight: 1.6 }}>
          Grava a aula inteira pelo microfone e, no fim, a IA transcreve e transforma em notas
          nesta anotação. O áudio fica só neste aparelho.
        </Mini>
      )}

      {msg ? <Mini style={{ marginTop: 8, color: T.bad, lineHeight: 1.6 }}>{msg}</Mini> : null}

      {aulas.length ? (
        <div className="mt-3 flex flex-col gap-2">
          {aulas.map((g) => {
            const emCurso = processandoAulas.get(g.id);
            const agora = estado.ativo && estado.id === g.id;
            const interrompida = g.status === "gravando" && !agora;
            const transcritos = (g.trechos || 0) - faltamTranscrever(g).length;
            return (
              <div key={g.id} className="rounded-lg px-3 py-2.5" style={{ background: T.card3 }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div style={{ fontSize: 13, color: T.dim }}>
                    {brDate(toISO(new Date(g.inicio || 0)))} · {fmtDuracaoAula(agora ? gravadorAula.duracao() : g.duracaoMs)}
                    {interrompida ? <span style={{ color: T.warn }}> · interrompida, mas o que foi gravado ficou</span> : null}
                    {g.notasEm ? <span style={{ color: T.ok }}> · notas feitas</span> : null}
                  </div>
                  {agora ? null : (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Btn size="sm" tone={g.notasEm ? "quiet" : "primary"} disabled={!!emCurso} onClick={() => organizar(g)}>
                        <Sparkles size={13} /> {emCurso ? "organizando…" : g.notasEm ? "organizar de novo" : "Organizar com IA"}
                      </Btn>
                      {transcritos ? <Btn size="sm" tone="quiet" onClick={() => baixarTranscricao(g)}><FileText size={13} /> transcrição</Btn> : null}
                      <Btn size="sm" tone="quiet" onClick={() => baixarAudio(g)}><Download size={13} /> áudio</Btn>
                      <Btn size="sm" tone="danger" disabled={!!emCurso} onClick={() => apagar(g)}><Trash2 size={13} /></Btn>
                    </div>
                  )}
                </div>
                {emCurso ? (
                  <div className="mt-2">
                    <Track pct={emCurso.total ? (emCurso.feito / emCurso.total) * 100 : 0} color="var(--neon)" height={4} />
                    <Mini style={{ marginTop: 5 }}>{emCurso.passo}</Mini>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ── o aviso flutuante ────────────────────────────────────────────────
 * Aparece em qualquer aba enquanto há uma aula gravando. Sem ele, quem
 * trocou de aba esquecia que o microfone estava ligado — e a próxima
 * conversa no corredor entrava na transcrição da aula. */
function AvisoGravandoAula({ irPara }) {
  const estado = useGravadorAula();
  const [, tique] = useState(0);
  useEffect(() => {
    if (!estado.ativo) return undefined;
    const t = window.setInterval(() => tique((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [estado.ativo]);
  if (!estado.ativo) return null;
  return (
    <div style={{
      position: "fixed", left: "50%", transform: "translateX(-50%)",
      bottom: "calc(16px + env(safe-area-inset-bottom))", zIndex: 55,
      display: "flex", alignItems: "center", gap: 10,
      background: T.card3, border: `1px solid ${soft("var(--bad)", 45)}`, borderRadius: 99,
      padding: "8px 10px 8px 14px", boxShadow: T.shadow,
    }}>
      <span className={estado.pausado ? "" : "breathe"} style={{ width: 9, height: 9, borderRadius: 99, background: estado.pausado ? "var(--warn)" : "var(--bad)" }} />
      <button type="button" onClick={() => irPara && irPara("materias")}
        style={{ background: "none", border: "none", color: T.ink, cursor: "pointer", fontSize: 13.5, padding: 0 }}>
        {estado.pausado ? "Aula pausada" : "Gravando a aula"} · <span style={{ fontFamily: F_MONO }}>{fmtDuracaoAula(gravadorAula.duracao())}</span>
      </button>
      {estado.pausado
        ? <Btn size="sm" onClick={retomarGravacaoAula}><Play size={12} /></Btn>
        : <Btn size="sm" tone="quiet" onClick={pausarGravacaoAula}><Pause size={12} /></Btn>}
      <Btn size="sm" tone="primary" onClick={() => pararGravacaoAula()}><CircleStop size={12} /> terminar</Btn>
    </div>
  );
}
