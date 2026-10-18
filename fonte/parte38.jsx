/* ═══════════════════════════════════════════════════════════════════
   46 · MODO JOGO DO ESTUDO INTERATIVO

   A mesma aula (parte34), estudada como num app de idioma: cada bloco vira
   uma LIÇÃO de 10 a 14 exercícios rápidos, respondidos com toques, e a
   aula vira uma TRILHA de lições, uma abrindo depois da outra.

   · Exercícios: cartão que ensina, múltipla escolha (com mini caso),
     verdadeiro ou falso, completar a lacuna, ligar os pares e pôr em
     ordem. A IA monta a lição inteira numa chamada (/api/estudo-ia,
     ação "licao") e a página corrige sozinha cada toque.
   · Vidas: 5 por lição. Errou, perde uma, e o exercício volta no fim da
     lição até sair certo. Sem vidas, a lição para e oferece os slides do
     bloco para rever.
   · Combo: acertos seguidos. XP no fim: 10 da lição, 1 por acerto de
     primeira, 5 se foi perfeita e 2 a cada 5 seguidas.
   · Ofensiva: dias seguidos com pelo menos uma lição. Meta diária de XP
     (20, 50 ou 100), escolhida pela pessoa.

   Onde fica cada coisa:
   · data.jogo — XP total, XP por dia (últimos 120), a meta e o som. Pequeno,
     vai com a conta.
   · data.estudos[].blocos[] — licoes, melhorLicao e perfeita (parte34).
   · IndexedDB, no documento da aula — doc.licao[bloco], a lição montada.

   O que a pessoa errou entra em doc.fracos, o mesmo lugar do checkpoint, e
   vira flashcard pelo botão do painel da aula.
   ═══════════════════════════════════════════════════════════════════ */

/* ── a lógica pura do jogo ──────────────────────────────────────────── */
const VIDAS_JOGO = 5;
const METAS_JOGO = [20, 50, 100];

/* Os literais ficam aqui dentro de propósito: esta função também roda
   quando o parte2 normaliza os dados, e uma constante deste arquivo ainda
   podia não existir nessa hora. */
function limparJogo(v) {
  const o = v && typeof v === "object" ? v : {};
  const dias = {};
  const origem = o.dias && typeof o.dias === "object" ? o.dias : {};
  Object.keys(origem).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().slice(-120).forEach((k) => {
    const n = Math.round(Number(origem[k]));
    if (n > 0) dias[k] = Math.min(n, 100000);
  });
  const meta = Number(o.meta);
  return {
    xp: Math.max(0, Math.min(10000000, Math.round(Number(o.xp) || 0))),
    dias,
    meta: [20, 50, 100].indexOf(meta) >= 0 ? meta : 50,
    som: o.som !== false,
  };
}

/* "2026-03-01" → "2026-02-28", sem fuso no meio */
function diaAnteriorDoJogo(iso) {
  const [a, m, d] = String(iso).split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d - 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

/* Dias seguidos com XP. Hoje ainda sem lição não quebra a ofensiva: ela
   conta até ontem, como nos apps de idioma (quebra só se ontem também
   passou em branco). */
function ofensivaDoJogo(dias, hoje) {
  const d0 = dias || {};
  let d = d0[hoje] > 0 ? hoje : diaAnteriorDoJogo(hoje);
  let n = 0;
  while (d0[d] > 0 && n < 400) { n += 1; d = diaAnteriorDoJogo(d); }
  return n;
}

function xpDaLicao({ dePrimeira = 0, maiorCombo = 0, perfeita = false }) {
  return 10 + Math.max(0, dePrimeira) + (perfeita ? 5 : 0) + Math.floor(Math.max(0, maiorCombo) / 5) * 2;
}

function somarXpDoJogo(jogo, xp, hoje) {
  const j = limparJogo(jogo);
  const ganho = Math.max(0, Math.round(Number(xp) || 0));
  return limparJogo({ ...j, xp: j.xp + ganho, dias: { ...j.dias, [hoje]: (j.dias[hoje] || 0) + ganho } });
}

/* Embaralhar sem Math.random, para a mesma lição sair igual no mesmo
   estado (e o teste conseguir conferir). Devolve a permutação dos índices. */
function embaralharDoJogo(n, semente) {
  let s = (Math.abs(Math.round(Number(semente) || 0)) % 2147483646) + 1;
  const prox = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(prox() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/* "ordem" é respondida com a sequência de índices dos passos, na ordem em
   que a pessoa tocou; "pares", com o número de ligações erradas. */
function conferirExercicio(ex, resposta) {
  if (!ex) return false;
  if (ex.tipo === "ensina") return true;
  if (ex.tipo === "escolha" || ex.tipo === "lacuna") return resposta === ex.certa;
  if (ex.tipo === "vf") return resposta === ex.verdadeiro;
  if (ex.tipo === "ordem") {
    return Array.isArray(resposta) && resposta.length === ex.passos.length && resposta.every((v, i) => v === i);
  }
  if (ex.tipo === "pares") return resposta === 0;
  return false;
}

function respostaCertaDoJogo(ex) {
  if (!ex) return "";
  if (ex.tipo === "escolha") return ex.opcoes[ex.certa] || "";
  if (ex.tipo === "lacuna") return ex.frase.replace("___", ex.opcoes[ex.certa] || "___");
  if (ex.tipo === "vf") return ex.verdadeiro ? "Verdadeiro" : "Falso";
  if (ex.tipo === "ordem") return ex.passos.map((p, i) => `${i + 1}. ${p}`).join("  ");
  if (ex.tipo === "pares") return ex.pares.map((p) => `${p.a}: ${p.b}`).join(" · ");
  return "";
}

/* O enunciado do exercício, para virar flashcard do que errou. */
function fracoDoExercicio(ex) {
  const enunciado = ex.tipo === "escolha" ? [ex.contexto, ex.pergunta].filter(Boolean).join("\n")
    : ex.tipo === "lacuna" ? ex.frase
      : ex.tipo === "vf" ? `Verdadeiro ou falso: ${ex.afirmacao}`
        : ex.titulo || "";
  const gabarito = [respostaCertaDoJogo(ex), ex.explicacao].filter(Boolean);
  return enunciado && gabarito.length ? { enunciado, gabarito } : null;
}

function novaPartida(total) {
  return { fila: Array.from({ length: total }, (_, i) => i), pos: 0, vidas: VIDAS_JOGO, combo: 0, maiorCombo: 0, dePrimeira: 0, erradas: [], voltas: {}, respondidas: 0 };
}

/* Depois de cada exercício que se responde. Errou: perde uma vida, zera o
   combo e o exercício volta no fim da fila (até duas vezes). Acertou: o
   combo sobe, e conta "de primeira" se nunca errou esse. */
function depoisDaResposta(partida, indice, acertou) {
  const p = { ...partida, fila: [...partida.fila], erradas: [...partida.erradas], voltas: { ...partida.voltas } };
  p.respondidas += 1;
  if (acertou) {
    p.combo += 1;
    p.maiorCombo = Math.max(p.maiorCombo, p.combo);
    if (p.erradas.indexOf(indice) < 0) p.dePrimeira += 1;
  } else {
    p.vidas = Math.max(0, p.vidas - 1);
    p.combo = 0;
    if (p.erradas.indexOf(indice) < 0) p.erradas.push(indice);
    const v = p.voltas[indice] || 0;
    if (v < 2) { p.fila.push(indice); p.voltas[indice] = v + 1; }
  }
  p.pos += 1;
  return p;
}

/* cartão de ensinar só avança: não conta acerto, não mexe em combo */
const pularNaPartida = (partida) => ({ ...partida, pos: partida.pos + 1 });
const partidaAcabou = (partida) => partida.vidas <= 0 || partida.pos >= partida.fila.length;

/* a trilha: a lição de um bloco abre quando a anterior (ou o bloco, pelos
   slides) já foi feita */
const licaoLiberada = (estudo, i) => i === 0 || !!(estudo.blocos[i - 1] && (estudo.blocos[i - 1].licoes > 0 || estudo.blocos[i - 1].feito));

/* ── telas do jogo ──────────────────────────────────────────────────── */
const ESTILO_JOGO = `
@keyframes jogoPula{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes jogoPop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
@keyframes jogoTreme{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}
@keyframes jogoSobe{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes jogoEntra{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:none}}
@keyframes jogoChama{0%,100%{transform:scale(1) rotate(-3deg)}50%{transform:scale(1.12) rotate(3deg)}}
@keyframes jogoCai{0%{transform:translateY(-20px) rotate(0);opacity:1}100%{transform:translateY(105vh) rotate(720deg);opacity:.9}}
[data-estudo-anima][style*="--anim"]{animation:var(--anim)!important}
`;

/* Sons curtos feitos na hora (Web Audio), sem arquivo: acerto sobe, erro
   desce, o fim é um acorde. O botão de som da lição liga e desliga. */
let audioDoJogo = null;
function somDoJogo(tipo, ligado) {
  if (!ligado || typeof window === "undefined") return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioDoJogo = audioDoJogo || new AC();
    const ac = audioDoJogo;
    if (ac.state === "suspended" && ac.resume) ac.resume();
    const notas = tipo === "certo" ? [[660, 0, 0.12], [990, 0.09, 0.18]]
      : tipo === "errado" ? [[220, 0, 0.22], [165, 0.12, 0.26]]
        : tipo === "combo" ? [[784, 0, 0.1], [988, 0.07, 0.1], [1319, 0.14, 0.2]]
          : [[523, 0, 0.3], [659, 0.12, 0.3], [784, 0.24, 0.45], [1047, 0.36, 0.6]];
    notas.forEach(([f, t0, d]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = tipo === "errado" ? "square" : "sine";
      o.frequency.value = f;
      const t = ac.currentTime + t0;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(tipo === "errado" ? 0.06 : 0.16, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + d + 0.02);
    });
  } catch (e) { /* sem áudio, segue em silêncio */ }
}

/* O resumo do jogo: ofensiva, XP de hoje contra a meta e o XP total. */
function PlacarDoJogo({ jogo, setData, compacto }) {
  const j = limparJogo(jogo);
  const hoje = todayISO();
  const ofensiva = ofensivaDoJogo(j.dias, hoje);
  const deHoje = j.dias[hoje] || 0;
  const pct = Math.min(100, Math.round((deHoje / j.meta) * 100));
  const fogo = j.dias[hoje] > 0;
  return (
    <div className="flex flex-wrap items-center gap-2" data-teste="jogo-placar">
      <span title="Dias seguidos com lição" data-teste="jogo-ofensiva"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 99, fontWeight: 800, fontSize: 14.5,
          background: fogo ? soft("#FF8A1F", 16) : T.card2, color: fogo ? "#FF8A1F" : T.faint, border: `1px solid ${fogo ? soft("#FF8A1F", 40) : T.line}` }}>
        <Flame size={16} /> {ofensiva} {ofensiva === 1 ? "dia" : "dias"}
      </span>
      <span title="XP de hoje e a meta do dia" data-teste="jogo-meta"
        style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 99, fontWeight: 700, fontSize: 14, background: T.card2, color: T.ink, border: `1px solid ${T.line}` }}>
        <Zap size={15} style={{ color: "#F5B400" }} /> {deHoje}/{j.meta} XP hoje
        <span style={{ width: 54, height: 7, borderRadius: 99, background: T.card3, overflow: "hidden", display: "inline-block" }}>
          <span style={{ display: "block", width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--ok)" : "#F5B400", borderRadius: 99, transition: "width .5s" }} />
        </span>
      </span>
      {!compacto ? (
        <span title="XP de todas as lições" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 99, fontWeight: 700, fontSize: 14, background: T.card2, color: T.dim, border: `1px solid ${T.line}` }}>
          <Trophy size={15} style={{ color: "var(--neon)" }} /> {j.xp} XP no total
        </span>
      ) : null}
      {!compacto && setData ? (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: T.faint }}>
          meta
          <select value={j.meta} onChange={(e) => setData((p) => ({ ...p, jogo: limparJogo({ ...limparJogo(p.jogo), meta: Number(e.target.value) }) }))}
            aria-label="Meta diária de XP" data-teste="jogo-meta-escolha"
            style={{ background: T.card2, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 8, padding: "3px 6px", fontSize: 13 }}>
            {METAS_JOGO.map((m) => <option key={m} value={m}>{m} XP</option>)}
          </select>
        </label>
      ) : null}
    </div>
  );
}

/* A trilha: uma bolinha por bloco, em zigue-zague, a próxima pulando. */
const DESVIO_TRILHA = [0, 54, 84, 54, 0, -54, -84, -54];
function TrilhaDoJogo({ estudo, onLicao }) {
  const proxima = estudo.blocos.findIndex((b, i) => licaoLiberada(estudo, i) && !(b.licoes > 0));
  return (
    <div className="flex flex-col items-center" style={{ padding: "52px 0 18px" }} data-teste="jogo-trilha">
      <style>{ESTILO_JOGO}</style>
      {estudo.blocos.map((b, i) => {
        const livre = licaoLiberada(estudo, i);
        const feita = b.licoes > 0;
        const atual = i === proxima;
        const cor = feita ? (b.perfeita ? "#F5B400" : "var(--ok)") : livre ? "var(--neon)" : T.card3;
        return (
          <div key={i} className="flex flex-col items-center" style={{ transform: `translateX(${DESVIO_TRILHA[i % DESVIO_TRILHA.length]}px)`, marginTop: i ? 16 : 0, position: "relative" }}>
            {atual ? (
              <span data-estudo-anima="1" style={{ ...anima("jogoPula", 0, 1.4, "infinite"), position: "absolute", top: -34, whiteSpace: "nowrap", padding: "5px 12px", borderRadius: 10, fontWeight: 800, fontSize: 13, letterSpacing: ".04em", background: T.card, color: "var(--neon)", border: `2px solid ${soft("var(--neon)", 50)}`, zIndex: 1 }}>
                {b.licoes > 0 ? "DE NOVO" : "COMEÇAR"}
              </span>
            ) : null}
            <button type="button" disabled={!livre} onClick={() => livre && onLicao(i)} data-teste="jogo-no"
              aria-label={`Lição ${i + 1}: ${b.titulo}${feita ? ", feita" : livre ? "" : ", trancada"}`}
              style={{
                width: 76, height: 70, borderRadius: "50%", border: "none", cursor: livre ? "pointer" : "not-allowed",
                background: cor, color: livre || feita ? "#fff" : T.faint,
                boxShadow: livre || feita ? `0 6px 0 color-mix(in srgb, ${cor} 62%, #000), 0 10px 22px ${soft(cor, 30)}` : `0 6px 0 ${T.line2}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              {feita ? (b.perfeita ? <Crown size={30} /> : <Check size={32} strokeWidth={3} />) : livre ? <Star size={30} fill="currentColor" /> : <Lock size={24} />}
            </button>
            <div style={{ marginTop: 12, maxWidth: 190, textAlign: "center", fontSize: 13.5, fontWeight: 700, color: livre ? T.ink : T.faint, lineHeight: 1.3 }}>{b.titulo}</div>
            {feita ? <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>{b.melhorLicao}% · {b.licoes} {b.licoes === 1 ? "vez" : "vezes"}</div> : null}
          </div>
        );
      })}
      <div className="flex flex-col items-center" style={{ marginTop: 22 }}>
        <span style={{ width: 64, height: 64, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center",
          background: estudo.blocos.every((b) => b.licoes > 0) ? soft("#F5B400", 22) : T.card2, color: estudo.blocos.every((b) => b.licoes > 0) ? "#F5B400" : T.faint }}>
          <Trophy size={30} />
        </span>
        <div style={{ fontSize: 12.5, color: T.faint, marginTop: 6 }}>fim da aula</div>
      </div>
    </div>
  );
}

const FRASES_ACERTO = ["Mandou bem!", "Isso aí!", "Certíssimo!", "Boa!", "Perfeito!", "Acertou em cheio!"];

function LicaoDoJogo({ estudo, indice, jogo, nuvem, notify, setData, atualizar, focoAtivo, onSair, onVerSlides, onProxima }) {
  const b = estudo.blocos[indice];
  const [fase, setFase] = useState("carregando");      // carregando | jogando | fim | semvidas | erro
  const [erro, setErro] = useState("");
  const [exercicios, setExercicios] = useState([]);
  const [partida, setPartida] = useState(null);
  const [resposta, setResposta] = useState(null);
  const [conferido, setConferido] = useState(null);     // { acertou }
  const [resultado, setResultado] = useState(null);
  const [som, setSom] = useState(() => limparJogo(jogo).som);
  const [rodada, setRodada] = useState(0);              // muda a ordem a cada "treinar de novo"
  const segundos = useRef(0);
  const semFoco = useRef(0);
  const refFoco = useRef(focoAtivo);
  refFoco.current = focoAtivo;
  const erradosDoc = useRef([]);

  const pedirLicao = useCallback((d, i) => falarComEstudo(nuvem, { acao: "licao", texto: d.texto, plano: d.plano, indice: i, modo: d.modo || "completo" }), [nuvem]);

  const carregar = useCallback(async () => {
    setFase("carregando"); setErro("");
    const d = await lerDocEstudo(estudo.id);
    if (!d) { setErro("O material desta aula não está neste aparelho. Ela foi montada em outro aparelho: monte de novo aqui para jogar."); setFase("erro"); return; }
    let lista = d.licao && d.licao[indice];
    if (!lista) {
      const r = await pedirLicao(d, indice);
      if (r.erro) { setErro(r.erro); setFase("erro"); return; }
      lista = r.exercicios;
      await mudarDocEstudo(estudo.id, (x) => ({ ...x, licao: { ...(x.licao || {}), [indice]: lista } })).catch(() => null);
    }
    setExercicios(lista);
    setPartida(novaPartida(lista.length));
    setResposta(null); setConferido(null); setResultado(null);
    segundos.current = 0; semFoco.current = 0; erradosDoc.current = [];
    setFase("jogando");
    /* a lição do próximo bloco já vai sendo montada */
    const prox = indice + 1;
    if (prox < d.plano.blocos.length && !(d.licao && d.licao[prox])) {
      pedirLicao(d, prox).then((r2) => (r2.erro ? null
        : mudarDocEstudo(estudo.id, (x) => (x.licao && x.licao[prox] ? x : { ...x, licao: { ...(x.licao || {}), [prox]: r2.exercicios } }))))
        .catch(() => {});
    }
  }, [estudo.id, indice, pedirLicao]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (fase !== "jogando") return undefined;
    const t = window.setInterval(() => {
      if (document.hidden) return;
      segundos.current += 1;
      if (!refFoco.current) semFoco.current += 1;
    }, 1000);
    return () => window.clearInterval(t);
  }, [fase]);

  /* a lição ocupa a tela toda, como os apps de idioma */
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = antes; };
  }, []);

  const indiceAtual = partida && partida.fila[partida.pos];
  const ex = partida && !partidaAcabou(partida) ? exercicios[indiceAtual] : null;
  const ordemOpcoes = useMemo(() => {
    if (!ex) return [];
    const n = ex.tipo === "ordem" ? ex.passos.length : ex.tipo === "pares" ? ex.pares.length : (ex.opcoes || []).length;
    /* múltipla escolha e lacuna mantêm a ordem da IA; ordem e pares embaralham */
    return ex.tipo === "ordem" || ex.tipo === "pares" ? embaralharDoJogo(n, indiceAtual * 31 + (partida ? partida.pos : 0) + rodada * 7 + 3) : Array.from({ length: n }, (_, i) => i);
  }, [ex, indiceAtual, partida, rodada]);

  const terminar = useCallback((fim) => {
    const respondiveis = exercicios.filter((x) => x.tipo !== "ensina").length;
    const perfeita = fim.vidas === VIDAS_JOGO && fim.erradas.length === 0;
    const acerto = respondiveis ? Math.round((fim.dePrimeira / respondiveis) * 100) : 100;
    const xp = xpDaLicao({ dePrimeira: fim.dePrimeira, maiorCombo: fim.maiorCombo, perfeita });
    const hoje = todayISO();
    const antes = limparJogo(jogo);
    const ofensivaAntes = ofensivaDoJogo(antes.dias, hoje);
    const depois = somarXpDoJogo(antes, xp, hoje);
    setResultado({ xp, acerto, perfeita, segundos: segundos.current, maiorCombo: fim.maiorCombo, ofensiva: ofensivaDoJogo(depois.dias, hoje), subiu: ofensivaDoJogo(depois.dias, hoje) > ofensivaAntes, deHoje: depois.dias[hoje] || 0, meta: depois.meta });
    setData((p) => ({ ...p, jogo: somarXpDoJogo(p.jogo, xp, hoje) }));
    atualizar(estudo.id, (e) => ({
      ...e, blocos: e.blocos.map((x, k) => (k === indice ? { ...x, licoes: (x.licoes || 0) + 1, melhorLicao: Math.max(x.melhorLicao || 0, acerto), perfeita: !!x.perfeita || perfeita } : x)),
    }));
    if (erradosDoc.current.length) {
      const novos = erradosDoc.current.map(fracoDoExercicio).filter(Boolean);
      mudarDocEstudo(estudo.id, (d) => ({ ...d, fracos: [...(d.fracos || []), ...novos].slice(-60) })).catch(() => {});
    }
    /* vira estudo do dia: as questões sempre, os minutos só os de fora do Foco */
    if (segundos.current >= 60) {
      setData((p) => ({
        ...p,
        sessions: [{
          id: uid(), date: hoje, subjectId: null, area: null,
          topic: `${estudo.titulo}: ${b.titulo}`.slice(0, 120), kind: "Questões", minutes: Math.round(semFoco.current / 60),
          questions: respondiveis, correct: fim.dePrimeira, notes: "modo jogo do estudo interativo", createdAt: Date.now(),
        }, ...(p.sessions || [])],
      }));
    }
    somDoJogo("fim", som);
    setFase("fim");
  }, [exercicios, jogo, setData, atualizar, estudo.id, estudo.titulo, b.titulo, indice, som]);

  const verificar = useCallback(() => {
    if (!ex || conferido || resposta === null) return;
    const acertou = conferirExercicio(ex, resposta);
    setConferido({ acertou });
    if (!acertou) {
      if (erradosDoc.current.indexOf(ex) < 0) erradosDoc.current.push(ex);
      try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) { /* sem vibração */ }
    }
    const combo = acertou ? partida.combo + 1 : 0;
    somDoJogo(acertou ? (combo > 0 && combo % 5 === 0 ? "combo" : "certo") : "errado", som);
  }, [ex, conferido, resposta, partida, som]);

  const continuar = useCallback(() => {
    if (!ex) return;
    let prox;
    if (ex.tipo === "ensina") prox = pularNaPartida(partida);
    else if (conferido) prox = depoisDaResposta(partida, indiceAtual, conferido.acertou);
    else return;
    setPartida(prox); setResposta(null); setConferido(null);
    if (prox.vidas <= 0) { somDoJogo("errado", som); setFase("semvidas"); return; }
    if (partidaAcabou(prox)) terminar(prox);
  }, [ex, partida, conferido, indiceAtual, terminar, som]);

  /* teclado: 1 a 4 escolhem, Enter verifica e continua */
  useEffect(() => {
    const h = (e) => {
      if (fase !== "jogando" || !ex) return;
      if (e.key === "Enter") { e.preventDefault(); if (ex.tipo === "ensina" || conferido) continuar(); else verificar(); return; }
      if (conferido) return;
      const n = Number(e.key);
      if ((ex.tipo === "escolha" || ex.tipo === "lacuna") && n >= 1 && n <= ex.opcoes.length) setResposta(n - 1);
      if (ex.tipo === "vf" && (e.key === "1" || e.key === "2")) setResposta(e.key === "1");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [fase, ex, conferido, continuar, verificar]);

  const reiniciar = () => {
    setRodada((r) => r + 1);
    setPartida(novaPartida(exercicios.length)); setResposta(null); setConferido(null); setResultado(null);
    segundos.current = 0; semFoco.current = 0; erradosDoc.current = [];
    setFase("jogando");
  };
  const trocarSom = () => {
    const novo = !som;
    setSom(novo);
    setData((p) => ({ ...p, jogo: limparJogo({ ...limparJogo(p.jogo), som: novo }) }));
  };

  const progresso = partida ? Math.min(100, Math.round((partida.pos / Math.max(1, partida.fila.length)) * 100)) : 0;
  /* a vida cai e o combo zera na hora do erro, antes do "Continuar" */
  const errouAgora = !!(conferido && !conferido.acertou);
  const vidasNaTela = partida ? partida.vidas - (errouAgora ? 1 : 0) : VIDAS_JOGO;
  const comboNaTela = partida ? (errouAgora ? 0 : partida.combo + (conferido && conferido.acertou ? 1 : 0)) : 0;
  const ultimo = indice + 1 >= estudo.blocos.length;

  const tela = (
    <div className="fixed" data-teste="jogo-licao"
      style={{ inset: 0, zIndex: 90, background: T.bg, display: "flex", flexDirection: "column",
        padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px calc(14px + env(safe-area-inset-bottom, 0px))" }}>
      <style>{ESTILO_JOGO}</style>
      <div style={{ width: "100%", maxWidth: 640, margin: "0 auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* topo: sair, progresso, combo, vidas, som */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={onSair} aria-label="Sair da lição" data-teste="jogo-sair"
            style={{ width: 38, height: 38, borderRadius: 99, flexShrink: 0, border: "none", background: "transparent", color: T.faint, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={22} />
          </button>
          <div style={{ flex: 1, height: 14, borderRadius: 99, background: T.card3, overflow: "hidden" }} data-teste="jogo-progresso" aria-label={`${progresso}% da lição`}>
            <div style={{ width: `${fase === "fim" ? 100 : progresso}%`, height: "100%", borderRadius: 99, background: "var(--ok)", transition: "width .45s cubic-bezier(.2,.8,.2,1)", boxShadow: "inset 0 -3px 0 rgba(0,0,0,.12)" }} />
          </div>
          {comboNaTela >= 3 && fase === "jogando" ? (
            <span key={comboNaTela} data-estudo-anima="1" data-teste="jogo-combo" title="Acertos seguidos"
              style={{ ...anima("jogoPop", 0, 0.35), display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 800, fontSize: 14, color: "#FF8A1F" }}>
              <Flame size={17} /> {comboNaTela}
            </span>
          ) : null}
          <span key={`v${vidasNaTela}`} data-teste="jogo-vidas" aria-label={`${vidasNaTela} vidas`} data-estudo-anima={errouAgora ? "1" : undefined}
            style={{ ...(errouAgora ? anima("jogoTreme", 0, 0.4) : {}), display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 800, fontSize: 15, color: "#E5484D" }}>
            <Heart size={19} fill="#E5484D" /> {vidasNaTela}
          </span>
          <button type="button" onClick={trocarSom} aria-label={som ? "Desligar o som" : "Ligar o som"} title={som ? "Som ligado" : "Som desligado"}
            style={{ width: 34, height: 34, borderRadius: 99, border: "none", background: "transparent", color: T.faint, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {som ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "22px 2px 12px" }}>
          {fase === "carregando" ? <MontandoLicao titulo={b.titulo} /> : null}
          {fase === "erro" ? (
            <div style={{ textAlign: "center", paddingTop: 40 }}>
              <div style={{ color: T.ink, fontSize: 16, lineHeight: 1.5 }}>{erro}</div>
              <div style={{ marginTop: 14 }}><Btn size="sm" tone="outline" onClick={carregar}><RefreshCw size={14} /> Tentar de novo</Btn></div>
            </div>
          ) : null}
          {fase === "jogando" && ex ? (
            <div key={`${partida.pos}-${rodada}`} data-estudo-anima="1" style={anima("jogoEntra", 0, 0.32)}>
              <ExercicioDoJogo ex={ex} ordem={ordemOpcoes} resposta={resposta} setResposta={setResposta} conferido={conferido} />
            </div>
          ) : null}
          {fase === "semvidas" ? <SemVidas onSlides={onVerSlides} onDeNovo={reiniciar} /> : null}
          {fase === "fim" && resultado ? <FimDaLicao r={resultado} titulo={b.titulo} /> : null}
        </div>

        {/* rodapé: verificar, ou o resultado do exercício */}
        {fase === "jogando" && ex ? (
          <RodapeDoExercicio ex={ex} resposta={resposta} conferido={conferido} onVerificar={verificar} onContinuar={continuar} />
        ) : null}
        {fase === "fim" ? (
          <div className="flex flex-col sm:flex-row gap-2" style={{ paddingTop: 10 }}>
            {!ultimo ? <BotaoDoJogo onClick={onProxima} teste="jogo-proxima">Próxima lição</BotaoDoJogo> : null}
            <BotaoDoJogo onClick={onSair} tom={ultimo ? "ok" : "quieto"} teste="jogo-continuar">{ultimo ? "Concluir" : "Voltar à trilha"}</BotaoDoJogo>
            <BotaoDoJogo onClick={reiniciar} tom="quieto">Treinar de novo</BotaoDoJogo>
          </div>
        ) : null}
      </div>
      {fase === "fim" && resultado && resultado.perfeita ? <ConfeteDoJogo /> : null}
    </div>
  );
  return createPortal(tela, document.body);
}

function BotaoDoJogo({ children, onClick, disabled, tom = "ok", teste }) {
  const cor = tom === "erro" ? "#E5484D" : tom === "quieto" ? T.card2 : "var(--ok)";
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-teste={teste}
      style={{
        flex: 1, width: "100%", padding: "15px 18px", borderRadius: 16, border: tom === "quieto" ? `2px solid ${T.line2}` : "none", cursor: disabled ? "default" : "pointer",
        fontWeight: 800, fontSize: 16, letterSpacing: ".04em", textTransform: "uppercase",
        background: disabled ? T.card3 : cor, color: disabled ? T.faint : tom === "quieto" ? T.ink : "#fff",
        boxShadow: disabled ? "none" : tom === "quieto" ? `0 4px 0 ${T.line2}` : `0 5px 0 color-mix(in srgb, ${cor} 62%, #000)`,
        transition: "transform .08s", transform: "translateY(0)",
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(3px)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}>
      {children}
    </button>
  );
}

function MontandoLicao({ titulo }) {
  return (
    <div className="flex flex-col items-center" style={{ textAlign: "center", paddingTop: 50 }} data-teste="jogo-montando">
      <span data-estudo-anima="1" style={{ ...anima("jogoPula", 0, 1.1, "infinite"), width: 70, height: 70, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center", background: soft("var(--neon)", 16), color: "var(--neon)" }}>
        <Gamepad2 size={32} />
      </span>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, marginTop: 18 }}>Montando a lição</div>
      <div style={{ fontSize: 14.5, color: T.dim, marginTop: 6 }}>{titulo}</div>
    </div>
  );
}

/* Uma opção grande, com a borda de baixo grossa dos botões de jogo. */
function OpcaoDoJogo({ children, marcada, estado, onClick, numero, disabled, teste }) {
  const cor = estado === "certa" ? "var(--ok)" : estado === "errada" ? "#E5484D" : marcada ? "var(--neon)" : null;
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-teste={teste} aria-pressed={marcada ? "true" : "false"}
      data-estudo-anima={estado === "errada" ? "1" : undefined} style={{
        ...(estado === "errada" ? anima("jogoTreme", 0, 0.4) : {}),
        width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16,
        cursor: disabled ? "default" : "pointer", fontSize: 16, fontWeight: 600, lineHeight: 1.4, color: T.ink,
        background: cor ? soft(cor, 14) : T.card, border: `2px solid ${cor || T.line2}`, boxShadow: `0 4px 0 ${cor ? soft(cor, 55) : T.line2}`,
      }}>
      {numero != null ? (
        <span style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13.5, fontWeight: 800,
          border: `2px solid ${cor || T.line2}`, color: cor || T.faint }}>{numero}</span>
      ) : null}
      <span style={{ flex: 1 }}>{children}</span>
    </button>
  );
}

const ROTULO_EXERCICIO = { escolha: "Escolha a certa", vf: "Verdadeiro ou falso?", lacuna: "Complete a frase", pares: "Ligue os pares", ordem: "Ponha na ordem certa", ensina: "Novo conceito" };

function ExercicioDoJogo({ ex, ordem, resposta, setResposta, conferido }) {
  const travado = !!conferido;
  const estadoDe = (i) => {
    if (!conferido) return null;
    const certa = ex.tipo === "vf" ? (i === 0) === ex.verdadeiro : i === ex.certa;
    if (certa) return "certa";
    return i === (ex.tipo === "vf" ? (resposta ? 0 : 1) : resposta) ? "errada" : null;
  };
  const cabecalho = (
    <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--neon)", marginBottom: 10 }}>{ROTULO_EXERCICIO[ex.tipo]}</div>
  );

  if (ex.tipo === "ensina") {
    return (
      <div data-teste="jogo-ex-ensina">
        {cabecalho}
        <div style={{ background: T.card, border: `2px solid ${T.line2}`, borderRadius: 22, padding: "24px 22px", boxShadow: `0 5px 0 ${T.line2}` }}>
          {ex.emoji ? <div data-estudo-anima="1" style={{ ...anima("jogoPop", 0.05, 0.45), fontSize: 46, lineHeight: 1 }}>{ex.emoji}</div> : null}
          <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, marginTop: ex.emoji ? 12 : 0, lineHeight: 1.25 }}>{ex.titulo}</div>
          {ex.texto ? <div style={{ fontSize: 16.5, lineHeight: 1.6, color: T.dim, marginTop: 10, whiteSpace: "pre-line" }}>{ex.texto}</div> : null}
        </div>
      </div>
    );
  }
  if (ex.tipo === "escolha") {
    return (
      <div data-teste="jogo-ex-escolha">
        {cabecalho}
        {ex.contexto ? <div style={{ fontSize: 15, lineHeight: 1.55, color: T.dim, background: T.card2, border: `1px solid ${T.line}`, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>{ex.contexto}</div> : null}
        <div style={{ fontSize: 20, fontWeight: 800, color: T.ink, lineHeight: 1.35, marginBottom: 16 }}>{ex.pergunta}</div>
        <div className="flex flex-col gap-3">
          {ordem.map((i, k) => (
            <OpcaoDoJogo key={i} numero={k + 1} marcada={resposta === i} estado={estadoDe(i)} disabled={travado} teste="jogo-opcao"
              onClick={() => setResposta(i)}>{ex.opcoes[i]}</OpcaoDoJogo>
          ))}
        </div>
      </div>
    );
  }
  if (ex.tipo === "vf") {
    return (
      <div data-teste="jogo-ex-vf">
        {cabecalho}
        <div style={{ fontSize: 20, fontWeight: 800, color: T.ink, lineHeight: 1.4, marginBottom: 18, background: T.card, border: `2px solid ${T.line2}`, borderRadius: 18, padding: "18px 18px" }}>{ex.afirmacao}</div>
        <div className="grid grid-cols-2 gap-3">
          {[[true, "Verdadeiro"], [false, "Falso"]].map(([v, nome], k) => (
            <OpcaoDoJogo key={nome} numero={k + 1} marcada={resposta === v} estado={estadoDe(k)} disabled={travado} teste="jogo-opcao"
              onClick={() => setResposta(v)}>{nome}</OpcaoDoJogo>
          ))}
        </div>
      </div>
    );
  }
  if (ex.tipo === "lacuna") {
    const [antes, depois] = ex.frase.split("___");
    const escolhida = resposta !== null ? ex.opcoes[resposta] : null;
    const corLacuna = conferido ? (conferido.acertou ? "var(--ok)" : "#E5484D") : "var(--neon)";
    return (
      <div data-teste="jogo-ex-lacuna">
        {cabecalho}
        <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, lineHeight: 1.8, marginBottom: 22 }}>
          {antes}
          <span data-teste="jogo-lacuna" style={{ display: "inline-block", minWidth: 90, padding: "0 10px", margin: "0 4px", textAlign: "center", borderBottom: `3px solid ${corLacuna}`, color: escolhida ? corLacuna : T.ghost, fontWeight: 800 }}>
            {escolhida || " "}
          </span>
          {depois}
        </div>
        <div className="flex flex-wrap gap-2">
          {ordem.map((i) => (
            <button key={i} type="button" disabled={travado} onClick={() => setResposta(resposta === i ? null : i)} data-teste="jogo-palavra"
              style={{ padding: "11px 16px", borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: travado ? "default" : "pointer",
                background: resposta === i ? T.card3 : T.card, color: resposta === i ? T.faint : T.ink,
                border: `2px solid ${T.line2}`, boxShadow: resposta === i ? "none" : `0 4px 0 ${T.line2}` }}>
              {ex.opcoes[i]}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (ex.tipo === "ordem") {
    const escolhidos = Array.isArray(resposta) ? resposta : [];
    const tocar = (i) => {
      if (travado) return;
      const novo = escolhidos.indexOf(i) >= 0 ? escolhidos.filter((x) => x !== i) : [...escolhidos, i];
      setResposta(novo.length ? novo : null);
    };
    const cor = conferido ? (conferido.acertou ? "var(--ok)" : "#E5484D") : "var(--neon)";
    return (
      <div data-teste="jogo-ex-ordem">
        {cabecalho}
        <div style={{ fontSize: 20, fontWeight: 800, color: T.ink, lineHeight: 1.35, marginBottom: 14 }}>{ex.titulo}</div>
        <div className="flex flex-col gap-2" data-teste="jogo-ordem-resposta"
          style={{ minHeight: 60, padding: 10, borderRadius: 16, border: `2px dashed ${escolhidos.length ? cor : T.line2}`, marginBottom: 16 }}>
          {escolhidos.length ? escolhidos.map((i, k) => (
            <button key={i} type="button" onClick={() => tocar(i)} disabled={travado}
              style={{ textAlign: "left", display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 12, fontSize: 15.5, fontWeight: 600, color: T.ink,
                background: soft(cor, 12), border: `2px solid ${soft(cor, 50)}`, cursor: travado ? "default" : "pointer" }}>
              <span style={{ fontWeight: 800, color: cor }}>{k + 1}.</span> {ex.passos[i]}
            </button>
          )) : <span style={{ color: T.ghost, fontSize: 14.5, padding: 8 }}>Toque nos passos abaixo, do primeiro ao último</span>}
        </div>
        <div className="flex flex-col gap-2">
          {ordem.filter((i) => escolhidos.indexOf(i) < 0).map((i) => (
            <button key={i} type="button" onClick={() => tocar(i)} disabled={travado} data-teste="jogo-passo"
              style={{ textAlign: "left", padding: "12px 14px", borderRadius: 14, fontSize: 15.5, fontWeight: 600, color: T.ink, cursor: travado ? "default" : "pointer",
                background: T.card, border: `2px solid ${T.line2}`, boxShadow: `0 4px 0 ${T.line2}` }}>
              {ex.passos[i]}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (ex.tipo === "pares") return <ParesDoJogo ex={ex} ordem={ordem} setResposta={setResposta} conferido={conferido} cabecalho={cabecalho} />;
  return null;
}

/* Ligar os pares: toca um da esquerda e um da direita. Par certo some em
   verde; par errado treme em vermelho e conta como erro. Quando tudo
   está ligado, a resposta é o número de erros (0 = acertou). */
function ParesDoJogo({ ex, ordem, setResposta, conferido, cabecalho }) {
  const [ligados, setLigados] = useState([]);
  const [esq, setEsq] = useState(null);
  const [dir, setDir] = useState(null);
  const [errado, setErrado] = useState(null);
  const erros = useRef(0);
  useEffect(() => {
    if (esq === null || dir === null) return undefined;
    if (esq === dir) {
      const novos = [...ligados, esq];
      setLigados(novos);
      if (novos.length === ex.pares.length) setResposta(erros.current);
      setEsq(null); setDir(null);
      return undefined;
    }
    erros.current += 1;
    setErrado({ esq, dir, chave: Date.now() });
    const t = window.setTimeout(() => { setEsq(null); setDir(null); setErrado(null); }, 450);
    return () => window.clearTimeout(t);
  }, [esq, dir]); // eslint-disable-line react-hooks/exhaustive-deps
  const peca = (lado, i, texto) => {
    const feito = ligados.indexOf(i) >= 0;
    const marcado = lado === "a" ? esq === i : dir === i;
    const ruim = errado && (lado === "a" ? errado.esq === i : errado.dir === i);
    const cor = feito ? "var(--ok)" : ruim ? "#E5484D" : marcado ? "var(--neon)" : null;
    return (
      <button key={`${lado}${i}`} type="button" disabled={feito || !!conferido} data-teste={`jogo-par-${lado}`}
        onClick={() => (lado === "a" ? setEsq(esq === i ? null : i) : setDir(dir === i ? null : i))}
        data-estudo-anima={ruim ? "1" : undefined}
        style={{ ...(ruim ? anima("jogoTreme", 0, 0.4) : {}), padding: "12px 10px", borderRadius: 14, fontSize: 15, fontWeight: 700, lineHeight: 1.3, minHeight: 56,
          color: feito ? "var(--ok)" : T.ink, opacity: feito ? 0.55 : 1, cursor: feito ? "default" : "pointer",
          background: cor ? soft(cor, 14) : T.card, border: `2px solid ${cor || T.line2}`, boxShadow: feito ? "none" : `0 4px 0 ${cor ? soft(cor, 55) : T.line2}` }}>
        {texto}
      </button>
    );
  };
  const direita = useMemo(() => embaralharDoJogo(ex.pares.length, ex.pares.length * 13 + ordem.length + 5), [ex, ordem]);
  return (
    <div data-teste="jogo-ex-pares">
      {cabecalho}
      <div style={{ fontSize: 20, fontWeight: 800, color: T.ink, lineHeight: 1.35, marginBottom: 16 }}>{ex.titulo}</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-3">{ordem.map((i) => peca("a", i, ex.pares[i].a))}</div>
        <div className="flex flex-col gap-3">{direita.map((i) => peca("b", i, ex.pares[i].b))}</div>
      </div>
    </div>
  );
}

function RodapeDoExercicio({ ex, resposta, conferido, onVerificar, onContinuar }) {
  const frase = useMemo(() => FRASES_ACERTO[Math.floor(Math.random() * FRASES_ACERTO.length)], [conferido]); // eslint-disable-line react-hooks/exhaustive-deps
  if (ex.tipo === "ensina") {
    return <div style={{ paddingTop: 10 }}><BotaoDoJogo onClick={onContinuar} teste="jogo-continuar-ex">Entendi</BotaoDoJogo></div>;
  }
  if (!conferido) {
    return (
      <div style={{ paddingTop: 10 }}>
        <BotaoDoJogo onClick={onVerificar} disabled={resposta === null} teste="jogo-verificar">{ex.tipo === "pares" ? (resposta === null ? "Ligue todos os pares" : "Verificar") : "Verificar"}</BotaoDoJogo>
      </div>
    );
  }
  const certo = conferido.acertou;
  const cor = certo ? "var(--ok)" : "#E5484D";
  return (
    <div data-estudo-anima="1" data-teste={certo ? "jogo-acertou" : "jogo-errou"}
      style={{ ...anima("jogoSobe", 0, 0.28), margin: "8px -16px calc(-14px - env(safe-area-inset-bottom, 0px))", padding: "16px 16px calc(16px + env(safe-area-inset-bottom, 0px))",
        background: soft(cor, 16), borderTop: `2px solid ${soft(cor, 45)}` }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div className="flex items-center gap-3" style={{ color: cor, fontWeight: 800, fontSize: 19 }}>
          <span style={{ width: 34, height: 34, borderRadius: 99, background: cor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {certo ? <Check size={20} strokeWidth={3} /> : <X size={20} strokeWidth={3} />}
          </span>
          {certo ? frase : "Quase. A certa é:"}
        </div>
        {!certo ? <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink, marginTop: 8, lineHeight: 1.45 }} data-teste="jogo-certa">{respostaCertaDoJogo(ex)}</div> : null}
        {ex.explicacao ? <div style={{ fontSize: 14.5, color: T.dim, marginTop: 6, lineHeight: 1.5 }}>{ex.explicacao}</div> : null}
        <div style={{ marginTop: 12 }}><BotaoDoJogo onClick={onContinuar} tom={certo ? "ok" : "erro"} teste="jogo-continuar-ex">Continuar</BotaoDoJogo></div>
      </div>
    </div>
  );
}

function SemVidas({ onSlides, onDeNovo }) {
  return (
    <div className="flex flex-col items-center" style={{ textAlign: "center", paddingTop: 30 }} data-teste="jogo-sem-vidas">
      <span data-estudo-anima="1" style={{ ...anima("jogoTreme", 0, 0.5), color: "#E5484D" }}><Heart size={64} /></span>
      <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, marginTop: 14 }}>Acabaram as vidas</div>
      <div style={{ fontSize: 15, color: T.dim, marginTop: 6, lineHeight: 1.55, maxWidth: 420 }}>
        Faz parte. Dá uma passada nos slides deste bloco, que eles explicam o que caiu aqui, e tenta de novo com as vidas cheias.
      </div>
      <div className="flex flex-col gap-2" style={{ marginTop: 22, width: "100%", maxWidth: 360 }}>
        <BotaoDoJogo onClick={onDeNovo} teste="jogo-de-novo">Tentar de novo</BotaoDoJogo>
        <BotaoDoJogo onClick={onSlides} tom="quieto" teste="jogo-ver-slides">Ver os slides do bloco</BotaoDoJogo>
      </div>
    </div>
  );
}

/* O XP sobe contando até o valor ganho. */
function ContadorDoJogo({ ate }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let atual = 0;
    const passo = Math.max(1, Math.round(ate / 20));
    const t = window.setInterval(() => {
      atual = Math.min(ate, atual + passo);
      setN(atual);
      if (atual >= ate) window.clearInterval(t);
    }, 40);
    return () => window.clearInterval(t);
  }, [ate]);
  return <>{n}</>;
}

function FimDaLicao({ r, titulo }) {
  const minutos = Math.floor(r.segundos / 60), seg = r.segundos % 60;
  const caixas = [
    ["XP", <><ContadorDoJogo ate={r.xp} /></>, "#F5B400", <Zap size={16} key="z" />],
    ["Acerto", `${r.acerto}%`, "var(--ok)", <Target size={16} key="t" />],
    ["Tempo", `${minutos}:${String(seg).padStart(2, "0")}`, "#2F86D6", <Timer size={16} key="c" />],
  ];
  return (
    <div className="flex flex-col items-center" style={{ textAlign: "center", paddingTop: 14 }} data-teste="jogo-fim">
      <span data-estudo-anima="1" style={{ ...anima("jogoPop", 0, 0.55), width: 96, height: 96, borderRadius: 30, display: "flex", alignItems: "center", justifyContent: "center",
        background: soft(r.perfeita ? "#F5B400" : "var(--ok)", 20), color: r.perfeita ? "#F5B400" : "var(--ok)" }}>
        {r.perfeita ? <Crown size={52} /> : <Trophy size={50} />}
      </span>
      <div style={{ fontSize: 26, fontWeight: 900, color: T.ink, marginTop: 16 }} data-teste="jogo-fim-titulo">{r.perfeita ? "Lição perfeita!" : "Lição concluída!"}</div>
      <div style={{ fontSize: 14.5, color: T.dim, marginTop: 4 }}>{titulo}</div>
      <div className="grid grid-cols-3 gap-3" style={{ marginTop: 22, width: "100%", maxWidth: 460 }}>
        {caixas.map(([nome, valor, cor, ic], k) => (
          <div key={nome} data-estudo-anima="1" style={{ ...anima("jogoPop", 0.15 + k * 0.12, 0.45), borderRadius: 16, border: `2px solid ${cor}`, overflow: "hidden" }}>
            <div style={{ background: cor, color: "#fff", fontSize: 12.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", padding: "5px 0" }}>{nome}</div>
            <div className="flex items-center justify-center gap-1" style={{ padding: "12px 4px", fontSize: 22, fontWeight: 900, color: cor }} data-teste={`jogo-fim-${nome.toLowerCase()}`}>{ic}{valor}</div>
          </div>
        ))}
      </div>
      <div data-estudo-anima="1" style={{ ...anima("jogoSobe", 0.55, 0.4), marginTop: 22, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 16, background: soft("#FF8A1F", 12), border: `1px solid ${soft("#FF8A1F", 40)}`, color: T.ink }}>
        <span data-estudo-anima="1" style={{ ...anima("jogoChama", 0, 1.2, "infinite"), color: "#FF8A1F" }}><Flame size={28} /></span>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontWeight: 800, fontSize: 16 }} data-teste="jogo-fim-ofensiva">{r.ofensiva} {r.ofensiva === 1 ? "dia" : "dias"} de ofensiva{r.subiu ? "!" : ""}</div>
          <div style={{ fontSize: 13.5, color: T.dim }}>{r.deHoje >= r.meta ? `Meta do dia batida: ${r.deHoje} de ${r.meta} XP` : `Faltam ${r.meta - r.deHoje} XP para a meta de hoje`}</div>
        </div>
      </div>
      {r.maiorCombo >= 3 ? <div style={{ fontSize: 13.5, color: T.faint, marginTop: 12 }}>maior sequência: {r.maiorCombo} seguidas</div> : null}
    </div>
  );
}

function ConfeteDoJogo() {
  const cores = ["#F5B400", "#2DD4A0", "#46D9F5", "#A86BFF", "#FF8A1F", "#E5484D"];
  const pecas = useMemo(() => Array.from({ length: 36 }, (_, i) => ({ x: (i * 37) % 100, d: 1.6 + ((i * 13) % 10) / 8, a: ((i * 7) % 10) / 10, c: cores[i % cores.length] })), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 91 }}>
      {pecas.map((p, i) => (
        <span key={i} data-estudo-anima="1" style={{ ...anima("jogoCai", p.a, p.d), position: "absolute", left: `${p.x}%`, top: -20, width: 10, height: 14, borderRadius: 3, background: p.c }} />
      ))}
    </div>
  );
}
