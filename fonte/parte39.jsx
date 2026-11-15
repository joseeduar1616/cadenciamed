/* ═══════════════════════════════════════════════════════════════════
   39 · ASSISTENTE POR VOZ (Gemini Live)

   Um botão flutuante, em qualquer aba, abre uma conversa falada com a
   assistente virtual do site. Diferente da Mentoria por voz (parte26,
   que usa a síntese do aparelho e manda texto para o servidor), aqui a
   voz e a escuta são do Gemini Live: o navegador fala direto com ele por
   WebSocket, em tempo real, e a resposta chega em áudio já com a
   entonação da voz escolhida (feminina, pt-BR).

   Três decisões que moldam esta tela.

   1. A chave nunca vem para cá. O botão pede a /api/voz um token
      efêmero, de uma sessão só, trancado com o modelo, a voz e a
      instrução. O que o navegador manda na primeira mensagem é só o nome
      do modelo (o servidor devolve o que mandar).

   2. Quem decide a vez de falar é o próprio Gemini (detecção de fala do
      servidor). É isso que permite interromper: a pessoa fala por cima, o
      servidor avisa "interrupted", e o que estava na fila de reprodução
      é descartado na hora. O microfone fica aberto o tempo inteiro, com
      cancelamento de eco do navegador; o botão do microfone é o controle
      da pessoa, não o nosso.

   3. É uma inteligência artificial, e a tela diz isso o tempo todo, em
      texto fixo, não só na primeira fala.

   O que é puro (sem navegador) fica entre as marcas "── áudio" e "── a
   sessão": o extrair_voz_ao_vivo.py copia para _voz_ao_vivo.mjs e o
   testar-voz-ao-vivo.mjs confere.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_VOZ = "/api/voz";
const TAXA_ENTRADA = 16000;
const TAXA_SAIDA = 24000;
const PEDACO_MS = 100;   // quanto áudio do microfone vai por mensagem

/* ── áudio: PCM de 16 bits, para lá e para cá ──────────────────────── */

function base64ParaBytes(b64) {
  const bin = atob(String(b64 || ""));
  const saida = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) saida[i] = bin.charCodeAt(i);
  return saida;
}

function bytesParaBase64(bytes) {
  let s = "";
  const b = new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

/* O Gemini manda PCM 16 bits little-endian; o Web Audio quer float de -1 a 1. */
function pcm16ParaFloat32(bytes) {
  const n = Math.floor(bytes.byteLength / 2);
  const vista = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
  const saida = new Float32Array(n);
  for (let i = 0; i < n; i += 1) saida[i] = vista.getInt16(i * 2, true) / 32768;
  return saida;
}

function float32ParaPcm16(f32) {
  const saida = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i += 1) {
    const v = Math.max(-1, Math.min(1, f32[i]));
    saida[i] = v < 0 ? v * 32768 : v * 32767;
  }
  return saida;
}

/* O microfone vem na taxa do aparelho (44,1 ou 48 mil); o Gemini ouve a
   16 mil. Reamostragem linear: para voz, basta, e não pesa. */
function reamostrar(f32, de, para) {
  if (de === para || !f32.length) return f32;
  const razao = de / para;
  const n = Math.max(1, Math.round(f32.length / razao));
  const saida = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const pos = i * razao;
    const a = Math.floor(pos);
    const b = Math.min(a + 1, f32.length - 1);
    const t = pos - a;
    saida[i] = f32[a] * (1 - t) + f32[b] * t;
  }
  return saida;
}

/* Uma mensagem do servidor vira uma lista de eventos simples. O formato
   do Live API tem camadas (serverContent.modelTurn.parts[].inlineData);
   aqui elas somem, e o resto do código lida com "audio", "interrompeu",
   "fimDaVez", "ouvi", "disse", "pronta", "vaiEncerrar". */
function lerMensagemAoVivo(m) {
  const eventos = [];
  if (!m || typeof m !== "object") return eventos;
  if (m.setupComplete) eventos.push({ tipo: "pronta" });
  const sc = m.serverContent;
  if (sc) {
    if (sc.interrupted) eventos.push({ tipo: "interrompeu" });
    for (const p of ((sc.modelTurn && sc.modelTurn.parts) || [])) {
      const d = p && p.inlineData;
      if (d && d.data && /^audio\/pcm/.test(String(d.mimeType || ""))) {
        const taxa = Number((/rate=(\d+)/.exec(d.mimeType) || [])[1]) || TAXA_SAIDA;
        eventos.push({ tipo: "audio", base64: d.data, taxa });
      }
      /* Texto dentro do modelTurn NÃO é o que ela fala: nos modelos de
         áudio nativo é o raciocínio dela, em inglês ("**Considering the
         user's request**..."). Era isso que aparecia na tela. A legenda vem
         só da transcrição do áudio (outputTranscription), logo abaixo. */
    }
    if (sc.inputTranscription && sc.inputTranscription.text) eventos.push({ tipo: "ouvi", texto: sc.inputTranscription.text });
    if (sc.outputTranscription && sc.outputTranscription.text) eventos.push({ tipo: "disse", texto: sc.outputTranscription.text });
    if (sc.turnComplete) eventos.push({ tipo: "fimDaVez" });
  }
  if (m.goAway) eventos.push({ tipo: "vaiEncerrar", em: Number((m.goAway.timeLeft || "").replace(/s$/, "")) || 0 });
  /* A mentora pediu para fazer algo no painel (registrar sessão, pendência,
     item do plano): quem faz é a página, que responde com o resultado. */
  if (m.toolCall && Array.isArray(m.toolCall.functionCalls) && m.toolCall.functionCalls.length) {
    eventos.push({ tipo: "ferramenta", chamadas: m.toolCall.functionCalls.filter((c) => c && c.name).slice(0, 10) });
  }
  return eventos;
}

/* O que a pessoa digita vira uma vez inteira dela (clientContent). */
const mensagemDeTexto = (texto) => ({
  clientContent: { turns: [{ role: "user", parts: [{ text: String(texto || "") }] }], turnComplete: true },
});

const mensagemDeAudio = (base64) => ({
  realtimeInput: { audio: { data: base64, mimeType: `audio/pcm;rate=${TAXA_ENTRADA}` } },
});

/* ── a sessão ────────────────────────────────────────────────────────
 *
 * Fora do React de propósito: WebSocket, microfone e reprodução têm
 * vida própria, e um re-render não pode reabrir nada disso.
 */
/* Roda dentro do AudioWorklet, não na página: por isso é texto. O método
   "process" e o "registerProcessor" são do escopo do worklet (o conferidor
   de nomes do pacote não os conhece, daí a forma com colchetes e globalThis). */
const CODIGO_CAPTURA = `
class CadenciaCaptura extends AudioWorkletProcessor {
  ["process"](entradas) {
    const c = entradas[0] && entradas[0][0];
    if (c && c.length) this.port.postMessage(new Float32Array(c));
    return true;
  }
}
globalThis.registerProcessor("cadencia-captura", CadenciaCaptura);`;

class SessaoAoVivo {
  constructor(avisos) {
    this.avisos = avisos || {};
    this.ws = null;
    this.ctx = null;
    this.stream = null;
    this.no = null;            // AudioWorkletNode ou ScriptProcessorNode
    this.fonteMic = null;
    this.microfoneLigado = false;
    this.acumulado = [];
    this.acumuladoN = 0;
    this.tocando = new Set();
    this.proximo = 0;
    this.prazoFala = null;
    this.aberta = false;
    this.pronta = false;
  }

  /* O AudioContext nasce no toque que abre a assistente: fora de um
     toque, o iPhone cria o contexto suspenso e nada toca. */
  prepararAudio() {
    /* No iPhone, sem isto o áudio da página fica mudo com a chave de
       silencioso ligada (Safari 16.4 em diante); play-and-record porque o microfone fica aberto. */
    try { if (navigator.audioSession && navigator.audioSession.type !== "play-and-record") navigator.audioSession.type = "play-and-record"; } catch (e) { /* Safari antigo */ }
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    if (this.ctx.state === "suspended" && this.ctx.resume) this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  abrir({ url, setup }) {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(url); } catch (e) { reject(e); return; }
      this.ws = ws;
      let resolvido = false;
      const prazo = window.setTimeout(() => {
        if (!resolvido) { resolvido = true; try { ws.close(); } catch (e) { /* segue */ } reject(new Error("tempo esgotado")); }
      }, 15000);
      ws.onopen = () => {
        this.aberta = true;
        ws.send(JSON.stringify({ setup }));
      };
      ws.onmessage = async (ev) => {
        let texto = ev.data;
        if (texto instanceof Blob) texto = await texto.text();
        else if (texto instanceof ArrayBuffer) texto = new TextDecoder().decode(texto);
        let m = null;
        try { m = JSON.parse(texto); } catch (e) { return; }
        for (const e of lerMensagemAoVivo(m)) {
          if (e.tipo === "pronta" && !resolvido) {
            resolvido = true; window.clearTimeout(prazo); this.pronta = true; resolve();
          }
          this.tratar(e);
        }
      };
      ws.onerror = () => {
        if (!resolvido) { resolvido = true; window.clearTimeout(prazo); reject(new Error("não conectou")); }
      };
      ws.onclose = (ev) => {
        const estava = this.aberta;
        this.aberta = false;
        this.pronta = false;
        this.pararReproducao();
        if (!resolvido) { resolvido = true; window.clearTimeout(prazo); reject(new Error("fechou antes de começar")); }
        if (estava && this.avisos.aoFechar) this.avisos.aoFechar(ev && ev.code);
      };
    });
  }

  tratar(e) {
    const a = this.avisos;
    if (e.tipo === "audio") { this.tocar(e.base64, e.taxa); return; }
    if (e.tipo === "interrompeu") { this.pararReproducao(); if (a.aoInterromper) a.aoInterromper(); return; }
    if (e.tipo === "ouvi") { if (a.aoOuvir) a.aoOuvir(e.texto); return; }
    if (e.tipo === "disse") { if (a.aoDizer) a.aoDizer(e.texto); return; }
    if (e.tipo === "fimDaVez") { if (a.aoFimDaVez) a.aoFimDaVez(); return; }
    if (e.tipo === "vaiEncerrar") { if (a.aoAvisoDeFim) a.aoAvisoDeFim(e.em); return; }
    if (e.tipo === "ferramenta") {
      /* Pode demorar (montar o plano chama a rota da mentoria): a resposta
         vai quando terminar, e ela espera. */
      const responder = (respostas) => {
        const porId = new Map((respostas || []).map((r) => [r.id, r]));
        this.enviar({
          toolResponse: {
            functionResponses: e.chamadas.map((c) => porId.get(c.id) || { id: c.id, name: c.name, response: { ok: false, resultado: "não consegui fazer isso no painel" } }),
          },
        });
      };
      let r;
      try { r = a.aoFerramenta ? a.aoFerramenta(e.chamadas) : []; } catch (x) { r = []; }
      Promise.resolve(r).then(responder, () => responder([]));
    }
  }

  enviar(obj) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try { this.ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  enviarTexto(t) {
    const texto = String(t || "").trim();
    if (!texto) return false;
    /* Falar por cima do que ela estava dizendo: o servidor manda
       "interrupted", mas o que já estava na fila local some agora. */
    this.pararReproducao();
    return this.enviar(mensagemDeTexto(texto));
  }

  /* ── reprodução: pedaços de PCM encadeados sem buraco ──────────── */
  tocar(base64, taxa) {
    const ctx = this.prepararAudio();
    const f32 = pcm16ParaFloat32(base64ParaBytes(base64));
    if (!f32.length) return;
    const buf = ctx.createBuffer(1, f32.length, taxa || TAXA_SAIDA);
    buf.copyToChannel ? buf.copyToChannel(f32, 0) : buf.getChannelData(0).set(f32);
    const fonte = ctx.createBufferSource();
    fonte.buffer = buf;
    fonte.connect(ctx.destination);
    const inicio = Math.max(ctx.currentTime + 0.02, this.proximo);
    fonte.start(inicio);
    this.proximo = inicio + buf.duration;
    this.tocando.add(fonte);
    fonte.onended = () => { this.tocando.delete(fonte); this.conferirSilencio(); };
    if (this.avisos.aoFalar) this.avisos.aoFalar(true);
    window.clearTimeout(this.prazoFala);
    this.prazoFala = window.setTimeout(() => this.conferirSilencio(), (this.proximo - ctx.currentTime) * 1000 + 80);
  }

  conferirSilencio() {
    if (!this.ctx) return;
    if (this.tocando.size === 0 || this.ctx.currentTime >= this.proximo - 0.01) {
      if (this.avisos.aoFalar) this.avisos.aoFalar(false);
    }
  }

  pararReproducao() {
    for (const f of this.tocando) { try { f.onended = null; f.stop(); } catch (e) { /* já parou */ } }
    this.tocando.clear();
    this.proximo = 0;
    window.clearTimeout(this.prazoFala);
    if (this.avisos.aoFalar) this.avisos.aoFalar(false);
  }

  /* ── microfone ───────────────────────────────────────────────────── */
  async ligarMicrofone() {
    if (this.microfoneLigado) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("sem microfone");
    const ctx = this.prepararAudio();
    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    }
    if (!this.fonteMic) this.fonteMic = ctx.createMediaStreamSource(this.stream);
    if (!this.no) {
      if (ctx.audioWorklet && typeof ctx.audioWorklet.addModule === "function" && typeof window.AudioWorkletNode === "function") {
        const url = URL.createObjectURL(new Blob([CODIGO_CAPTURA], { type: "application/javascript" }));
        await ctx.audioWorklet.addModule(url);
        this.no = new window.AudioWorkletNode(ctx, "cadencia-captura");
        this.no.port.onmessage = (ev) => this.receberDoMicrofone(ev.data);
        this.fonteMic.connect(this.no);
        /* Sem ligar ao destino o worklet não roda em alguns navegadores;
           ganho zero para não ouvir a si mesmo. */
        const mudo = ctx.createGain(); mudo.gain.value = 0;
        this.no.connect(mudo); mudo.connect(ctx.destination);
      } else {
        const sp = ctx.createScriptProcessor(4096, 1, 1);
        sp.onaudioprocess = (ev) => this.receberDoMicrofone(new Float32Array(ev.inputBuffer.getChannelData(0)));
        this.fonteMic.connect(sp);
        const mudo = ctx.createGain(); mudo.gain.value = 0;
        sp.connect(mudo); mudo.connect(ctx.destination);
        this.no = sp;
      }
    }
    this.microfoneLigado = true;
    return true;
  }

  receberDoMicrofone(f32) {
    if (!this.microfoneLigado || !this.pronta) return;
    this.acumulado.push(f32);
    this.acumuladoN += f32.length;
    const taxa = this.ctx.sampleRate;
    if (this.acumuladoN < taxa * (PEDACO_MS / 1000)) return;
    const junto = new Float32Array(this.acumuladoN);
    let i = 0;
    for (const p of this.acumulado) { junto.set(p, i); i += p.length; }
    this.acumulado = []; this.acumuladoN = 0;
    const pcm = float32ParaPcm16(reamostrar(junto, taxa, TAXA_ENTRADA));
    this.enviar(mensagemDeAudio(bytesParaBase64(pcm)));
  }

  desligarMicrofone() {
    if (!this.microfoneLigado) return;
    this.microfoneLigado = false;
    this.acumulado = []; this.acumuladoN = 0;
    /* Avisa que a fala acabou, para o servidor fechar a vez em vez de
       esperar um silêncio que nunca vai chegar. */
    this.enviar({ realtimeInput: { audioStreamEnd: true } });
  }

  fechar() {
    this.pararReproducao();
    this.microfoneLigado = false;
    try { if (this.no && this.no.disconnect) this.no.disconnect(); } catch (e) { /* segue */ }
    try { if (this.fonteMic) this.fonteMic.disconnect(); } catch (e) { /* segue */ }
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null; this.no = null; this.fonteMic = null;
    const ws = this.ws; this.ws = null; this.aberta = false; this.pronta = false;
    try { if (ws) ws.close(1000); } catch (e) { /* segue */ }
    try { if (this.ctx) this.ctx.close(); } catch (e) { /* segue */ }
    this.ctx = null;
  }
}

/* ── o que a mentora faz no painel ────────────────────────────────────
 *
 * As ferramentas da sessão ao vivo (FERRAMENTAS_DA_MENTORA, worker/api/
 * voz.js) chegam aqui. Sessão e pendência passam pelo mesmo conferidor das
 * ações do Assistente escrito (aplicarAcoesNoPainel, parte9); item do plano
 * passa pelo do Meu plano (parte41). A resposta volta para ela confirmar em
 * voz o que ficou registrado, ou dizer por que não deu.
 */
function executarFerramentasDaMentora(chamadas, { data, setData, subjects, today }) {
  const respostas = [];
  const esperas = [];
  for (const c of chamadas || []) {
    const a = (c && c.args) || {};
    const responder = (ok, resultado) => respostas.push({ id: c.id, name: c.name, response: { ok, resultado } });
    if (c.name === "registrar_sessao") {
      const materia = acharMateriaPorNome(a.materia, subjects);
      setData((p) => aplicarAcoesNoPainel(p, [{
        tipo: "sessao", data: a.data, materia: a.materia, tipoSessao: a.tipo,
        minutos: a.minutos, questoes: a.questoes, acertos: a.acertos,
      }], subjects).novo);
      responder(true, `sessão registrada em ${materia ? materia.title : String(a.materia || "estudo")}${materia ? ", e a aula ficou marcada como feita" : ""}`);
    } else if (c.name === "registrar_revisao") {
      const r = revisaoPelaIA(data || {}, { aula: a.aula, comoFoi: a.como_foi }, subjects);
      if (!r.rec) { responder(false, r.motivo); continue; }
      setData((p) => aplicarAcoesNoPainel(p, [{ tipo: "revisao", aula: a.aula, comoFoi: a.como_foi }], subjects).novo);
      responder(true, r.comoFoi === "errei"
        ? `revisão de ${r.materia.title} anotada como não lembrada: a contagem recomeça hoje e ela volta amanhã`
        : `revisão de ${r.materia.title} registrada; os próximos degraus contam de hoje e ela saiu da fila`);
    } else if (c.name === "abrir_aba" || c.name === "controlar_foco") {
      const mandar = typeof window !== "undefined" ? window.__cadenciaComando : null;
      if (!mandar) { responder(false, "não consegui mexer na tela agora"); continue; }
      const r = mandar(c.name === "abrir_aba"
        ? { tipo: "aba", aba: String(a.aba || "") }
        : { tipo: "foco", acao: a.acao === "pausar" ? "pausar" : "comecar", materia: String(a.materia || "") });
      responder(!!(r && r.ok), (r && r.texto) || "não deu certo");
    } else if (c.name === "concluir_pendencia") {
      const alvo = acharPendencia((data || {}).tasks, a.texto);
      if (!alvo) { responder(false, "não achei essa pendência aberta; pergunte qual é"); continue; }
      setData((p) => aplicarAcoesNoPainel(p, [{ tipo: "concluir", texto: a.texto }], subjects).novo);
      responder(true, `pendência "${alvo.text}" concluída`);
    } else if (c.name === "lembrar") {
      const t = String(a.texto || "").replace(/\s+/g, " ").trim();
      if (!t) { responder(false, "faltou o que lembrar"); continue; }
      setData((p) => aplicarAcoesNoPainel(p, [{ tipo: "lembrar", texto: t }], subjects).novo);
      responder(true, "guardado na memória; aparece na aba Assistente, em Memória da mentora");
    } else if (c.name === "esquecer") {
      const alvo = acharLembranca((data || {}).lembrancas, a.texto);
      if (!alvo) { responder(false, "não achei essa lembrança"); continue; }
      setData((p) => aplicarAcoesNoPainel(p, [{ tipo: "esquecer", texto: a.texto }], subjects).novo);
      responder(true, `esquecido: "${alvo.texto}"`);
    } else if (c.name === "adicionar_pendencia") {
      if (!String(a.texto || "").trim()) { responder(false, "faltou o texto da pendência"); continue; }
      setData((p) => aplicarAcoesNoPainel(p, [{ tipo: "tarefa", texto: a.texto }], subjects).novo);
      responder(true, "pendência adicionada em Hoje");
    } else if (c.name === "atualizar_item_do_plano") {
      const plano = data && data.planoArquivo;
      if (!plano) { responder(false, "a pessoa ainda não mandou um plano em Meu plano"); continue; }
      const item = acharItemDoPlano(plano, a.titulo, today);
      if (!item) { responder(false, "não achei esse item no plano; pergunte qual é"); continue; }
      const situacao = a.situacao === "feito" ? "feito" : a.situacao === "parcial" ? "parcial" : "pendente";
      setData((p) => ({ ...p, planoArquivo: atualizarItemPlano(p.planoArquivo, item.id, situacao, { minutos: a.minutos }, today) }));
      responder(true, `item "${item.titulo}" marcado como ${situacao === "feito" ? "feito" : situacao === "parcial" ? "feito em parte" : "não feito"}; o plano se reajusta sozinho`);
    } else if (c.name === "guardar_no_perfil") {
      const campo = String(a.campo || "");
      const valor = String(a.valor || "").replace(/\s+/g, " ").trim().slice(0, 500);
      if (!DIMENSOES_MENTORIA.some(([k]) => k === campo) || !valor) { responder(false, "assunto ou resposta inválidos"); continue; }
      setData((p) => {
        const mm = p.mentoria || {};
        return { ...p, mentoria: { ...mm, perfil: { ...(mm.perfil || {}), [campo]: valor } } };
      });
      responder(true, "guardado no perfil");
    } else if (c.name === "montar_plano") {
      const mentoria = typeof window !== "undefined" ? window.__cadenciaMentoria : null;
      if (!mentoria || !mentoria.perguntar) { responder(false, "para montar o plano, a pessoa precisa estar na aba Assistente, em Mentoria"); continue; }
      const pedido = String(a.pedido || "").trim();
      esperas.push(mentoria.perguntar(`Pela chamada de voz já contei o que você precisava. Monte agora o meu plano com o que está no perfil.${pedido ? ` Pedido: ${pedido.slice(0, 300)}` : ""}`)
        .then((j) => {
          if (j && j.plano) responder(true, `plano montado e já na tela. Resumo do que você escreveu: ${String(j.texto || "").replace(/\s+/g, " ").slice(0, 500)}`);
          else if (j) responder(false, `a mentoria ainda não montou: ${String(j.texto || "").replace(/\s+/g, " ").slice(0, 400)}`);
          else responder(false, "a mentoria não respondeu agora; tente de novo daqui a pouco");
        }, () => responder(false, "a mentoria não respondeu agora")));
    } else {
      responder(false, "ferramenta desconhecida");
    }
  }
  return esperas.length ? Promise.all(esperas).then(() => respostas) : respostas;
}

/* ── "Ei, Cadência": chamar a mentora sem tocar em nada ───────────────
 *
 * Com a opção ligada, o navegador fica ouvindo (reconhecimento de fala do
 * próprio navegador, o mesmo da chamada antiga) só para achar o chamado.
 * Nada vai para o servidor do site enquanto ninguém chama: a conversa ao
 * vivo (e o custo dela) só abre depois de "Ei, Cadência", já com o pedido
 * que veio na mesma frase ("Ei, Cadência, abre os cartões").
 *
 * Só com a aba à frente, só neste aparelho (a escolha fica guardada aqui),
 * e desligado enquanto a conversa está aberta, para ela não ouvir a si
 * mesma. No iPhone o navegador não deixa ouvir o tempo todo nem tocar som
 * sem toque: lá a opção nem aparece como disponível.
 */
const CHAVE_EI_CADENCIA = "cadencia:v3:ei-cadencia";
const PADRAO_EI_CADENCIA = /(?:^|\s)(?:ei|hey|ey|oi|ok|ol[aá]|eh)[\s,]+(?:a\s+)?cad[eê]ncia(?:\s+med)?(?![a-zà-ú])[\s,.!?]*(.*)$/i;
const PADRAO_E_CADENCIA = /^[eé][\s,]+cad[eê]ncia(?:\s+med)?(?![a-zà-ú])[\s,.!?]*(.*)$/i;

/* O que veio depois do chamado (com os acentos como a pessoa falou), ou
   { chamou: false }. */
function pedidoDepoisDoChamado(texto) {
  const t = String(texto == null ? "" : texto).replace(/\s+/g, " ").trim();
  const m = PADRAO_EI_CADENCIA.exec(t) || PADRAO_E_CADENCIA.exec(t);
  return m ? { chamou: true, pedido: m[1].trim().slice(0, 300) } : { chamou: false, pedido: "" };
}

const ehIphone = () => typeof navigator !== "undefined"
  && (/iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
const podeEiCadencia = () => !!reconhecedorDeFala() && !ehIphone();

function lerEiCadencia() {
  try { return window.localStorage.getItem(CHAVE_EI_CADENCIA) === "1"; } catch (e) { return false; }
}

function useEiCadencia({ ligado, pausado, aoChamar, aoFalhar }) {
  const [ouvindo, setOuvindo] = useState(false);
  const refChamar = useRef(aoChamar);
  refChamar.current = aoChamar;
  const refFalhar = useRef(aoFalhar);
  refFalhar.current = aoFalhar;

  useEffect(() => {
    const R = reconhecedorDeFala();
    if (!ligado || pausado || !R) { setOuvindo(false); return undefined; }
    let vivo = true;
    let rec = null;
    let tVolta = 0;
    let tPedido = 0;
    let chamado = null;
    let falhas = 0;
    let semVolta = false;

    const parar = () => {
      window.clearTimeout(tVolta); window.clearTimeout(tPedido);
      if (rec) {
        const r = rec;
        rec = null;
        r.onend = null; r.onresult = null; r.onerror = null; r.onstart = null;
        try { r.abort(); } catch (e) { /* já parado */ }
      }
      setOuvindo(false);
    };
    const entregar = () => {
      const c = chamado;
      chamado = null;
      if (!c || !vivo) return;
      parar();
      refChamar.current(c.pedido);
    };
    const comecar = () => {
      if (!vivo || semVolta || rec || document.hidden) return;
      try {
        const r = new R();
        r.lang = "pt-BR"; r.continuous = true; r.interimResults = true;
        r.onstart = () => { if (vivo) setOuvindo(true); };
        r.onresult = (ev) => {
          falhas = 0;
          for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
            const res = ev.results[i];
            const achado = pedidoDepoisDoChamado(res && res[0] && res[0].transcript);
            if (!achado.chamou) continue;
            chamado = achado;
            window.clearTimeout(tPedido);
            if (res.isFinal) { entregar(); return; }
            /* a frase ainda não fechou: espera o resto do pedido um pouco */
            tPedido = window.setTimeout(entregar, 2200);
          }
        };
        r.onerror = (ev) => {
          const tipo = ev && ev.error;
          if (tipo === "not-allowed" || tipo === "service-not-allowed" || tipo === "audio-capture") {
            semVolta = true;
            if (vivo) refFalhar.current(tipo);
          } else falhas += 1;
        };
        r.onend = () => {
          if (rec === r) rec = null;
          setOuvindo(false);
          if (!vivo || semVolta) return;
          /* o navegador encerra sozinho depois de um tempo em silêncio */
          tVolta = window.setTimeout(comecar, falhas > 3 ? 6000 : 500);
        };
        rec = r;
        r.start();
      } catch (e) {
        rec = null;
        tVolta = window.setTimeout(comecar, 4000);
      }
    };
    const aoVisibilidade = () => { if (document.hidden) parar(); else comecar(); };
    /* alguns navegadores só deixam começar a ouvir dentro de um toque */
    const aoToque = () => { if (!rec) comecar(); };

    comecar();
    document.addEventListener("visibilitychange", aoVisibilidade);
    window.addEventListener("pointerdown", aoToque, { passive: true });
    return () => {
      vivo = false;
      parar();
      document.removeEventListener("visibilitychange", aoVisibilidade);
      window.removeEventListener("pointerdown", aoToque);
    };
  }, [ligado, pausado]);

  return ouvindo;
}

/* ── a tela ──────────────────────────────────────────────────────────── */

const ROTULO_VOZ_AO_VIVO = {
  fechada: "",
  conectando: "Conectando…",
  ouvindo: "Ouvindo. Pode falar",
  falando: "Falando…",
  pensando: "Pensando…",
  mudo: "Microfone desligado",
  encerrada: "Conversa encerrada",
  erro: "Não deu para conectar",
};

const diasAte = (iso, hoje) => {
  if (!iso || !hoje) return null;
  const d = Math.round((new Date(`${iso}T12:00:00`) - new Date(`${hoje}T12:00:00`)) / 86400000);
  return Number.isFinite(d) ? d : null;
};

function AssistenteDeVoz({ nuvem, notify, data, today, ver, setData, subjects, pegarResumo }) {
  /* As ferramentas rodam com os dados de agora, não com os da hora em que
     a conversa abriu. */
  const atual = useRef({});
  atual.current = { data, setData, subjects, today };
  const [aberta, setAberta] = useState(false);
  const [estado, setEstado] = useState("fechada");
  const [falas, setFalas] = useState([]);        // { de: "eu" | "ela", texto, cortada }
  const [txt, setTxt] = useState("");
  const [aviso, setAviso] = useState("");
  const [micLigado, setMicLigado] = useState(false);
  const [indisponivel, setIndisponivel] = useState(false);
  /* Aberta pela voz, a conversa fica numa barrinha no topo, e não no painel. */
  const [compacta, setCompacta] = useState(false);
  const [eiLigado, setEiLigado] = useState(lerEiCadencia);
  const sessao = useRef(null);
  const estadoRef = useRef("fechada");
  const micRef = useRef(false);
  const caixa = useRef(null);
  const falandoRef = useRef(false);

  const logada = !!(nuvem && nuvem.usuario);
  const podeMostrar = logada && !indisponivel && !!(ver && ver.assistente)
    && typeof window !== "undefined" && typeof window.WebSocket === "function"
    && !!(window.AudioContext || window.webkitAudioContext);

  const mudar = (e) => { estadoRef.current = e; setEstado(e); };

  /* Depois da fala dela, volta a "ouvindo" se o microfone estiver ligado,
     senão "mudo": o rótulo diz o que ela está fazendo, não o que achamos. */
  const emRepouso = () => mudar(micRef.current ? "ouvindo" : "mudo");

  useEffect(() => {
    const c = caixa.current;
    if (c) c.scrollTop = c.scrollHeight;
  }, [falas, estado]);

  const juntar = (de, pedaco) => setFalas((lista) => {
    const ultima = lista[lista.length - 1];
    if (ultima && ultima.de === de && !ultima.fechada) {
      return [...lista.slice(0, -1), { ...ultima, texto: ultima.texto + pedaco }];
    }
    return [...lista.slice(-40), { de, texto: pedaco }];
  });
  const fecharUltima = (de, cortada) => setFalas((lista) => {
    const ultima = lista[lista.length - 1];
    if (!ultima || ultima.de !== de || ultima.fechada) return lista;
    return [...lista.slice(0, -1), { ...ultima, fechada: true, cortada: !!cortada }];
  });

  /* "conversa" (o botão flutuante) ou "mentoria" (a Chamada de voz da
     Mentoria, que abre esta mesma conversa ao vivo). */
  const [modo, setModo] = useState("conversa");
  const modoRef = useRef("conversa");
  const falasRef = useRef([]);
  falasRef.current = falas;

  /* O que foi falado na mentoria entra na conversa escrita dela, para
     continuar de onde parou, por escrito ou numa próxima ligação. */
  const levarParaAMentoria = () => {
    if (modoRef.current !== "mentoria") return;
    const m = typeof window !== "undefined" ? window.__cadenciaMentoria : null;
    const lista = falasRef.current.filter((f) => String(f.texto || "").trim())
      .map((f) => ({ papel: f.de === "eu" ? "user" : "claude", texto: String(f.texto).trim() }));
    if (m && m.anexar && lista.length) m.anexar(lista);
  };

  const encerrar = useCallback((motivo) => {
    levarParaAMentoria();
    if (sessao.current) { sessao.current.fechar(); sessao.current = null; }
    micRef.current = false; setMicLigado(false);
    mudar(motivo === "erro" ? "erro" : "encerrada");
  }, []);

  useEffect(() => () => { if (sessao.current) sessao.current.fechar(); }, []);

  /* opcoes.chamada: veio de "Ei, Cadência" (abre na barrinha do topo, sem
     apresentação); opcoes.pedido: o que a pessoa disse na mesma frase. */
  const ligar = async (qual, opcoes = {}) => {
    if (sessao.current) { levarParaAMentoria(); sessao.current.fechar(); sessao.current = null; }
    const m = qual === "mentoria" ? "mentoria" : "conversa";
    modoRef.current = m; setModo(m);
    setAviso(""); setFalas([]);
    setCompacta(!!opcoes.chamada);
    setAberta(true);
    mudar("conectando");
    const s = new SessaoAoVivo({
      aoFalar: (sim) => {
        falandoRef.current = sim;
        if (!["conectando", "encerrada", "erro", "fechada"].includes(estadoRef.current)) {
          if (sim) mudar("falando"); else if (estadoRef.current === "falando") emRepouso();
        }
      },
      aoOuvir: (t) => { fecharUltima("ela"); juntar("eu", t); },
      aoDizer: (t) => { fecharUltima("eu"); juntar("ela", t); if (estadoRef.current === "ouvindo" || estadoRef.current === "mudo") mudar("pensando"); },
      aoInterromper: () => { fecharUltima("ela", true); emRepouso(); },
      aoFimDaVez: () => { fecharUltima("ela"); fecharUltima("eu"); if (!falandoRef.current) emRepouso(); },
      aoAvisoDeFim: () => setAviso("Esta conversa está chegando ao tempo máximo. Dá para encerrar e ligar de novo."),
      aoFerramenta: (chamadas) => Promise.resolve(executarFerramentasDaMentora(chamadas, atual.current)).then((r) => {
        const feitas = r.filter((x) => x.response.ok && x.name !== "guardar_no_perfil").length;
        if (feitas && notify) notify(feitas === 1 ? "A mentora registrou no seu painel." : `A mentora registrou ${feitas} coisas no seu painel.`);
        return r;
      }),
      aoFechar: () => { if (estadoRef.current !== "encerrada" && estadoRef.current !== "erro") { setAviso("A conversa encerrou. Toque em Ligar de novo para continuar."); encerrar("encerrada"); } },
    });
    sessao.current = s;
    s.prepararAudio();   // dentro do toque, por causa do iPhone

    /* Microfone primeiro, ainda dentro do toque: sem ele a conversa
       segue só por texto, com aviso, em vez de travar. */
    let comMic = false;
    try { await s.ligarMicrofone(); comMic = true; } catch (e) {
      setAviso("Sem microfone liberado: dá para conversar escrevendo. Para falar, permita o microfone para este site.");
    }

    let token = "";
    try {
      if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) token = await nuvem.sdk.auth.currentUser.getIdToken();
    } catch (e) { /* o servidor recusa sem token */ }
    const contexto = {
      nome: (data && data.profile && data.profile.name) || "",
      prova: (data && data.profile && data.profile.examDate) || "",
      faltam: diasAte(data && data.profile && data.profile.examDate, today),
      plano: nuvem && nuvem.sincroniza ? "plano completo ou teste grátis em dia" : "sem plano completo",
      /* Tudo o que o painel sabe do estudo dela: é o que faz da assistente a
         mentora, e não um atendimento sobre o site. */
      resumo: pegarResumo ? String(pegarResumo() || "").slice(0, 14000) : "",
      ...(m === "mentoria" ? {
        modo: "mentoria",
        perfil: (data && data.mentoria && data.mentoria.perfil) || {},
        conversa: ((typeof window !== "undefined" && window.__cadenciaMentoria && window.__cadenciaMentoria.conversa) ? window.__cadenciaMentoria.conversa() : "").slice(-5000),
      } : {}),
    };
    const { dados, erro } = await chamarApi(ROTA_VOZ, { token, acao: "sessao", contexto }, "A assistente por voz");
    if (!sessao.current) return;
    if (erro || !dados || !dados.url) {
      if (dados && dados.indisponivel) setIndisponivel(true);
      setAviso(erro || "Não consegui abrir a conversa.");
      encerrar("erro");
      return;
    }
    try {
      await s.abrir({ url: dados.url, setup: dados.setup });
    } catch (e) {
      setAviso("Não consegui conectar com a assistente. Confira a internet e tente de novo.");
      encerrar("erro");
      return;
    }
    if (!sessao.current) return;
    micRef.current = comMic; setMicLigado(comMic);
    if (!comMic) s.desligarMicrofone();
    emRepouso();
    if (opcoes.chamada) {
      /* Chamada por voz: o pedido da mesma frase já é a primeira fala. */
      const pedido = String(opcoes.pedido || "").trim();
      if (pedido) {
        setFalas([{ de: "eu", texto: pedido, fechada: true }]);
        s.enviarTexto(pedido);
      } else {
        s.enviar(mensagemDeTexto("Eu chamei você dizendo \"Ei, Cadência\" e ainda não pedi nada. Responda só: \"Pode falar.\""));
      }
      mudar("pensando");
      return;
    }
    /* Ela se apresenta primeiro. Esta vez não aparece na conversa. */
    s.enviar(mensagemDeTexto(m === "mentoria"
      ? "Oi! Estamos na mentoria de estudo, por voz. Em uma frase, diga o que você já vê no meu painel e no meu perfil. Depois faça a primeira pergunta da entrevista que ainda falta, ou, se o perfil já estiver completo, pergunte o que eu quero ajustar no plano."
      : "Oi! Se apresente em uma frase como a mentora do Cadência Med, a assistente virtual do site. Se a SITUAÇÃO DO ESTUDO estiver aí, diga em uma frase a coisa mais importante que você vê para hoje. Depois pergunte por onde quer começar."))
    mudar("pensando");
  };

  const alternarMic = async () => {
    const s = sessao.current;
    if (!s) return;
    if (micRef.current) {
      s.desligarMicrofone(); micRef.current = false; setMicLigado(false);
      if (estadoRef.current === "ouvindo") mudar("mudo");
      return;
    }
    try {
      await s.ligarMicrofone(); micRef.current = true; setMicLigado(true); setAviso("");
      if (estadoRef.current === "mudo") mudar("ouvindo");
    } catch (e) {
      setAviso("O navegador não liberou o microfone. Permita o microfone para este site e tente de novo.");
    }
  };

  const interromper = () => {
    const s = sessao.current;
    if (!s) return;
    s.pararReproducao();
    fecharUltima("ela", true);
    emRepouso();
  };

  const mandarTexto = () => {
    const s = sessao.current;
    const t = txt.trim();
    if (!s || !t || !s.pronta) return;
    fecharUltima("ela"); fecharUltima("eu");
    setFalas((l) => [...l.slice(-40), { de: "eu", texto: t, fechada: true }]);
    setTxt("");
    s.enviarTexto(t);
    mudar("pensando");
  };

  const fechar = () => { encerrar("encerrada"); setAberta(false); setCompacta(false); mudar("fechada"); };

  /* A Chamada de voz da Mentoria abre esta conversa (evento no próprio toque,
     para o iPhone liberar áudio e microfone). */
  const ligarRef = useRef(ligar);
  ligarRef.current = ligar;
  useEffect(() => {
    if (!podeMostrar) { try { window.__cadenciaVozAoVivo = false; } catch (e) { /* noop */ } return undefined; }
    window.__cadenciaVozAoVivo = true;
    const abrir = (ev) => ligarRef.current((ev && ev.detail && ev.detail.modo) || "conversa");
    window.addEventListener("cadencia:ligar-voz", abrir);
    return () => { window.__cadenciaVozAoVivo = false; window.removeEventListener("cadencia:ligar-voz", abrir); };
  }, [podeMostrar]);

  /* "Ei, Cadência": ouve só com a opção ligada e a conversa fechada. */
  const trocarEi = (sim) => {
    setEiLigado(sim);
    try { if (sim) window.localStorage.setItem(CHAVE_EI_CADENCIA, "1"); else window.localStorage.removeItem(CHAVE_EI_CADENCIA); } catch (e) { /* segue */ }
  };
  const esperandoChamado = useEiCadencia({
    ligado: podeMostrar && eiLigado && podeEiCadencia(),
    pausado: aberta,
    aoChamar: (pedido) => ligarRef.current("conversa", { chamada: true, pedido }),
    aoFalhar: () => { trocarEi(false); if (notify) notify("Não consegui ouvir \"Ei, Cadência\": o microfone não está liberado para este site."); },
  });

  /* Na barrinha, a conversa fecha sozinha: 20 s em silêncio depois que ela
     respondeu, ou logo depois de encerrar. É o que devolve o site ao estado
     de "esperando o chamado" sem a pessoa tocar em nada. */
  const fecharRef = useRef(null);
  useEffect(() => {
    if (!aberta || !compacta) return undefined;
    const espera = estado === "ouvindo" ? 20000 : (estado === "encerrada" || estado === "erro") ? 5000 : 0;
    if (!espera) return undefined;
    const t = window.setTimeout(() => { if (fecharRef.current) fecharRef.current(); }, espera);
    return () => window.clearTimeout(t);
  }, [aberta, compacta, estado, falas]);

  if (!podeMostrar) return null;

  const ativa = ["conectando", "ouvindo", "falando", "pensando", "mudo"].includes(estado);
  const cor = estado === "ouvindo" ? "var(--ok)" : estado === "falando" ? "var(--neon2)" : estado === "pensando" || estado === "conectando" ? "var(--neon)" : T.faint;
  const estreita = typeof window !== "undefined" && window.innerWidth < 640;
  fecharRef.current = fechar;
  const ultimaFala = falas.length ? falas[falas.length - 1] : null;

  return (
    <>
      {/* ── a barrinha do topo (conversa aberta pela voz) ─────────────── */}
      {aberta && compacta ? (
        <div role="status" aria-live="polite" aria-label="Mentora por voz" data-teste="ilha-voz"
          className="flex items-center gap-2.5"
          style={{
            position: "fixed", zIndex: 63, top: "max(10px, env(safe-area-inset-top))", left: "50%", transform: "translateX(-50%)",
            width: "min(560px, calc(100vw - 20px))", minHeight: 44, padding: "6px 8px 6px 12px", borderRadius: 99,
            background: "color-mix(in srgb, var(--bg) 92%, var(--card3))", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            border: `1px solid ${soft(cor, 55)}`, boxShadow: T.shadow,
          }}>
          <span aria-hidden="true" className={estado === "ouvindo" || estado === "falando" ? "pulsar-voz" : ""}
            style={{ width: 26, height: 26, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: soft(cor, 20), color: cor }}>
            {estado === "ouvindo" ? <Mic size={14} /> : <AudioLines size={14} />}
          </span>
          <button type="button" onClick={() => setCompacta(false)} title="Abrir a conversa"
            className="flex-1 min-w-0 text-left"
            style={{ background: "none", border: "none", cursor: "pointer", color: T.ink, fontFamily: F_UI, padding: 0 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", textAlign: "left" }}>
              <bdi>{aviso || (ultimaFala && ultimaFala.texto ? `${ultimaFala.de === "eu" ? "Você: " : ""}${ultimaFala.texto}` : ROTULO_VOZ_AO_VIVO[estado])}</bdi>
            </span>
          </button>
          <span style={{ fontSize: 11.5, color: cor, fontWeight: 700, flexShrink: 0 }} data-teste="estado-ilha-voz">{ROTULO_VOZ_AO_VIVO[estado]}</span>
          <button type="button" aria-label="Abrir a conversa inteira" title="Abrir a conversa inteira" onClick={() => setCompacta(false)} className="toque flex items-center justify-center"
            style={{ width: 30, height: 30, borderRadius: 99, background: "none", border: "none", color: T.dim, cursor: "pointer", flexShrink: 0 }}>
            <Maximize2 size={14} />
          </button>
          <button type="button" aria-label="Encerrar a conversa" title="Encerrar" onClick={fechar} className="toque flex items-center justify-center"
            style={{ width: 30, height: 30, borderRadius: 99, background: "none", border: "none", color: T.dim, cursor: "pointer", flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>
      ) : null}

      {!aberta ? (
        <button type="button" onClick={() => ligar("conversa")} aria-label="Falar com a assistente virtual" data-teste="abrir-assistente-voz"
          className="toque brilhar"
          style={{
            position: "fixed", right: 18, bottom: 22, zIndex: 61,
            width: 56, height: 56, borderRadius: 99, cursor: "pointer",
            background: "linear-gradient(135deg, var(--neon), var(--neon2))",
            border: "none", color: "#fff", boxShadow: T.shadow,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <AudioLines size={24} />
          {esperandoChamado ? (
            <span aria-hidden="true" data-teste="ei-cadencia-ouvindo" title="Ouvindo o chamado: diga Ei, Cadência"
              style={{ position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: 99, background: "var(--ok)", border: "2px solid var(--bg)" }} />
          ) : null}
        </button>
      ) : null}

      {aberta && !compacta ? (
        <div role="dialog" aria-label="Assistente virtual por voz" data-teste="assistente-voz"
          style={{
            position: "fixed", zIndex: 62, display: "flex", flexDirection: "column",
            ...(estreita
              ? { left: 0, right: 0, bottom: 0, maxHeight: "82dvh", borderRadius: "22px 22px 0 0" }
              : { right: 18, bottom: 22, width: 390, maxWidth: "calc(100vw - 36px)", maxHeight: "min(640px, calc(100dvh - 44px))", borderRadius: 22 }),
            /* Fundo quase opaco, com desfoque: o cartão comum do tema neon é
               translúcido e a conversa ficaria por cima do texto da página. */
            background: "color-mix(in srgb, var(--bg) 90%, var(--card3))", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            border: `1px solid ${T.line2 || T.line}`, boxShadow: T.shadow, overflow: "hidden",
          }}>
          <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{modo === "mentoria" ? "Mentoria por voz" : "Mentora por voz"}</div>
              <Mini style={{ marginTop: 2 }}>inteligência artificial do Cadência Med, não é uma pessoa</Mini>
            </div>
            <button type="button" aria-label="Fechar" onClick={fechar} className="toque"
              style={{ background: T.card2, border: `1px solid ${T.line}`, color: T.dim, borderRadius: 99, width: 34, height: 34, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={15} />
            </button>
          </div>

          <div className="px-5 pt-4 flex items-center gap-3">
            <div aria-hidden="true" className={estado === "ouvindo" || estado === "falando" ? "pulsar-voz" : ""}
              style={{
                width: 46, height: 46, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                background: soft(cor, 18), border: `2px solid ${soft(cor, 60)}`, color: cor, transition: "all .3s",
              }}>
              {estado === "ouvindo" ? <Mic size={20} /> : estado === "mudo" ? <MicOff size={20} /> : <AudioLines size={20} />}
            </div>
            <div role="status" aria-live="polite" style={{ fontSize: 15, fontWeight: 700, color: T.ink }} data-teste="estado-assistente-voz">
              {ROTULO_VOZ_AO_VIVO[estado]}
            </div>
          </div>

          <div ref={caixa} className="px-5 py-3 flex flex-col gap-2" style={{ overflowY: "auto", minHeight: 96, maxHeight: estreita ? "34dvh" : 260 }}>
            {falas.length === 0 && ativa ? (
              <Mini style={{ lineHeight: 1.6 }}>Pergunte sobre o site, o cronograma, os cartões, os planos. Pode falar ou escrever. Dá para interromper falando por cima.</Mini>
            ) : null}
            {falas.map((f, i) => (
              <div key={i} className="flex" style={{ justifyContent: f.de === "eu" ? "flex-end" : "flex-start" }}>
                <div className="rounded-2xl px-3.5 py-2" style={{
                  maxWidth: "88%", fontSize: 14, lineHeight: 1.55, color: T.ink,
                  background: f.de === "eu" ? soft("var(--neon2)", 20) : T.card2,
                  border: `1px solid ${f.de === "eu" ? "transparent" : T.line}`,
                  opacity: f.cortada ? 0.7 : 1,
                }}>{f.texto}{f.cortada ? " …" : ""}</div>
              </div>
            ))}
            {aviso ? <Mini style={{ color: T.warn, lineHeight: 1.6 }}>{aviso}</Mini> : null}
          </div>

          <div className="px-5 pb-4 pt-2 flex flex-col gap-2.5" style={{ borderTop: `1px solid ${T.line}` }}>
            <div className="flex gap-2 flex-wrap items-center">
              {ativa ? (
                <Btn size="sm" tone={micLigado ? "primary" : "outline"} onClick={alternarMic} title={micLigado ? "Desligar o microfone" : "Ligar o microfone"}>
                  {micLigado ? <Mic size={14} /> : <MicOff size={14} />} {micLigado ? "Microfone ligado" : "Ligar microfone"}
                </Btn>
              ) : null}
              {estado === "falando" ? <Btn size="sm" onClick={interromper}><VolumeX size={14} /> Interromper</Btn> : null}
              {estado === "encerrada" || estado === "erro" ? <Btn size="sm" tone="primary" onClick={() => ligar(modoRef.current)}><AudioLines size={14} /> Ligar de novo</Btn> : null}
              <button type="button" onClick={fechar} className="toque-larg rounded-full px-3 inline-flex items-center gap-1.5"
                style={{ minHeight: 34, marginLeft: "auto", background: soft("var(--bad)", 12), border: `1px solid ${soft("var(--bad)", 45)}`, color: T.bad, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F_UI }}>
                <PhoneOff size={13} /> Encerrar
              </button>
            </div>
            {ativa ? (
              <div className="flex gap-2">
                <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Ou escreva aqui…"
                  aria-label="Escrever para a assistente" data-teste="texto-assistente-voz"
                  onKeyDown={(e) => { if (e.key === "Enter") mandarTexto(); }}
                  style={{ flex: 1, minWidth: 0, minHeight: 40, borderRadius: 12, padding: "0 12px", background: T.card2, border: `1px solid ${T.line}`, color: T.ink, fontSize: 14, fontFamily: F_UI }} />
                <button type="button" onClick={mandarTexto} aria-label="Enviar" disabled={!txt.trim()} className="toque"
                  style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${T.line}`, background: txt.trim() ? soft("var(--neon)", 18) : T.card2, color: txt.trim() ? T.ink : T.faint, cursor: txt.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Send size={15} />
                </button>
              </div>
            ) : null}
            {/* Chamar sem tocar: a opção fica aqui, onde a pessoa já está falando com ela. */}
            <div className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={{ background: T.card2, border: `1px solid ${T.line}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Chamar dizendo "Ei, Cadência"</div>
                <Mini style={{ marginTop: 1, lineHeight: 1.45 }}>
                  {podeEiCadencia()
                    ? (eiLigado ? "Ligado neste aparelho. Com o site aberto, diga \"Ei, Cadência\" e o pedido." : "Com o site aberto, ela atende sem você tocar em nada.")
                    : (ehIphone() ? "No iPhone o navegador não deixa ouvir o tempo todo. Use o botão." : "Este navegador não tem reconhecimento de fala. Funciona no Chrome e no Edge.")}
                </Mini>
              </div>
              <button type="button" role="switch" aria-checked={eiLigado && podeEiCadencia()} aria-label="Chamar dizendo Ei, Cadência"
                data-teste="ei-cadencia" disabled={!podeEiCadencia()} onClick={() => trocarEi(!eiLigado)}
                style={{
                  width: 46, height: 28, borderRadius: 99, flexShrink: 0, cursor: podeEiCadencia() ? "pointer" : "not-allowed", position: "relative",
                  background: eiLigado && podeEiCadencia() ? "var(--ok)" : T.card3, border: `1px solid ${T.line}`, opacity: podeEiCadencia() ? 1 : 0.5, transition: "background .2s",
                }}>
                <span style={{ position: "absolute", top: 3, left: eiLigado && podeEiCadencia() ? 21 : 3, width: 20, height: 20, borderRadius: 99, background: "#fff", transition: "left .2s" }} />
              </button>
            </div>
            <Mini style={{ lineHeight: 1.5 }}>Ela pode errar. Dúvidas que ela não resolver: suporte@cadenciamed.com</Mini>
          </div>
        </div>
      ) : null}
    </>
  );
}
