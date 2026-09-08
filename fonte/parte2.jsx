/* ═══════════════════════════════════════════════════════════════════
   3 · ESTADO
   ═══════════════════════════════════════════════════════════════════ */

const HABITS_SEED = [
  { id: "h1", text: "200 questões por semana" },
  { id: "h2", text: "Exercício 5x por semana" },
  { id: "h3", text: "Dormir antes da meia-noite" },
];

const CORES_TIMER = [
  ["Violeta", "#A182E6"], ["Azul", "#5F8FF2"], ["Verde", "#45C08A"],
  ["Âmbar", "#E9A83F"], ["Laranja", "#F58A4C"], ["Rosa", "#E374A0"],
  ["Vermelho", "#E76B7C"], ["Turquesa", "#3FBFC7"], ["Lilás", "#C77DE8"],
  ["Grafite", "#8B8698"],
];

const DEFAULTS = {
  profile: { name: PRESET ? "José Eduardo" : "", examDate: "", onboarded: PRESET },
  theme: "dark",
  layout: "auto",
  sessions: [], marks: {}, reviews: {}, routine: [], agenda: [], tasks: [],
  /* Blocos da agenda já cumpridos, por "id do bloco|data". A chave leva a
     data porque um bloco que se repete toda semana é um compromisso
     diferente em cada segunda-feira. */
  blocos: {},
  goals: { daily: 120, weekly: 720, questions: 200 },
  pomo: {
    focus: 25, short: 5, long: 15, cycle: 4, modo: "pomodoro",
    autoNext: true, sound: true, corFoco: "#A182E6", corPausa: "#45C08A",
  },
  pomoLog: [],
  simulados: {}, provas: [], habits: HABITS_SEED, habitLog: {},
  rever: [], notes: {}, googleCal: { id: "", ultima: 0 },
  /* Cronograma que a pessoa recebeu do curso dela, em texto, para o
     assistente organizar a rotina em cima do que ela realmente tem. */
  cronograma: { nome: "", texto: "" },
  /* Se os números desta pessoa aparecem no ranking das salas de amigos.
     Começa ligado, que é o motivo de entrar numa sala; desligar mantém a
     pessoa na sala, sem os números dela à mostra. */
  mostrarDesempenho: true,
  flash: [], pastas: [],
  /* Ajustes de cada baralho, por "pasta|baralho": se embaralha a ordem e
     quantos cartões por dia. */
  baralhoCfg: {},
  /* esquema da escada de revisão espaçada, escolhido em Revisões */
  revisao: { esquema: "cadencia", dias: [7, 21, 60, 150] },
  /* aparência: cor de acento, fonte e tamanho do texto */
  tema: { cor: "cadencia", neon: "", neon2: "", fonte: "inter", tamanho: 1 },
};

const KEY = "cadencia:v3";

function normalize(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const g = d.goals || {}, p = d.pomo || {}, pr = d.profile || {};
  const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
  const arr = (x, f) => (Array.isArray(x) ? x : f);
  const gc = obj(d.googleCal);
  const rv = obj(d.revisao), tm = obj(d.tema);
  const hex = (v) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : "");

  /* Até a reorganização do cronograma o identificador da aula era a posição
     na lista ("m12"). Agora é fixo. Quem já usava tem o formato antigo
     gravado, então ele é traduzido aqui, na volta do disco e da nuvem: sem
     isto o progresso apontaria para a aula errada depois da reordenação. */
  const traduzir = (mapa) => {
    const fora = {};
    for (const [k, v] of Object.entries(obj(mapa))) {
      const novo = ID_NOVO(k);
      if (novo) { if (!fora[novo]) fora[novo] = v; }
      else fora[k] = v;
    }
    return fora;
  };

  return {
    profile: {
      name: typeof pr.name === "string" ? pr.name : DEFAULTS.profile.name,
      examDate: typeof pr.examDate === "string" ? pr.examDate : "",
      onboarded: pr.onboarded === undefined ? DEFAULTS.profile.onboarded : !!pr.onboarded,
    },
    theme: d.theme === "light" ? "light" : "dark",
    layout: d.layout === "movel" ? "movel" : "auto",
    sessions: arr(d.sessions, []).map((x) => (
      x && x.subjectId && ID_NOVO(x.subjectId) ? { ...x, subjectId: ID_NOVO(x.subjectId) } : x
    )),
    marks: traduzir(d.marks), reviews: traduzir(d.reviews),
    routine: arr(d.routine, []), agenda: arr(d.agenda, []), tasks: arr(d.tasks, []),
    /* O que já foi cumprido na agenda precisa sobreviver ao recarregar a
       página: o que não for copiado aqui se perde. */
    blocos: obj(d.blocos),
    goals: {
      daily: Number(g.daily) > 0 ? Number(g.daily) : 120,
      weekly: Number(g.weekly) > 0 ? Number(g.weekly) : 720,
      questions: Number(g.questions) > 0 ? Number(g.questions) : 200,
    },
    pomo: {
      focus: Number(p.focus) > 0 ? Number(p.focus) : 25,
      short: Number(p.short) > 0 ? Number(p.short) : 5,
      long: Number(p.long) > 0 ? Number(p.long) : 15,
      cycle: Number(p.cycle) > 0 ? Number(p.cycle) : 4,
      modo: p.modo === "corrido" ? "corrido" : "pomodoro",
      autoNext: p.autoNext !== false, sound: p.sound !== false,
      corFoco: /^#[0-9a-fA-F]{6}$/.test(p.corFoco) ? p.corFoco : "#A182E6",
      corPausa: /^#[0-9a-fA-F]{6}$/.test(p.corPausa) ? p.corPausa : "#45C08A",
    },
    pomoLog: arr(d.pomoLog, []), simulados: obj(d.simulados), provas: arr(d.provas, []),
    habits: arr(d.habits, HABITS_SEED), habitLog: obj(d.habitLog),
    rever: arr(d.rever, []), notes: obj(d.notes),
    mostrarDesempenho: d.mostrarDesempenho !== false,
    cronograma: {
      nome: String(obj(d.cronograma).nome || "").slice(0, 80),
      /* Cortado aqui, e não só na hora de enviar: um arquivo enorme colado
         encheria o armazenamento do navegador e derrubaria o salvamento
         inteiro, não só o assistente. */
      texto: String(obj(d.cronograma).texto || "").slice(0, 20000),
    },
    googleCal: {
      id: typeof gc.id === "string" ? gc.id : "",
      ultima: Number(gc.ultima) || 0,
    },
    /* Os cartões precisam sobreviver ao recarregar a página: como tudo passa
       por aqui na volta do disco e da nuvem, o que não for copiado se perde. */
    flash: arr(d.flash, []),
    /* Pastas de baralho ficam guardadas mesmo enquanto estão vazias, senão
       criar uma pasta e recarregar a página apagaria a pasta. */
    pastas: [...new Set(arr(d.pastas, [])
      .filter((x) => typeof x === "string" && x.trim())
      .map((x) => x.trim().slice(0, 40)))].slice(0, 60),
    /* Cada ajuste é conferido na volta do disco: um número negativo ou um
       texto no lugar do limite faria a fila de estudo sair vazia, e o
       sintoma apareceria longe daqui. */
    baralhoCfg: Object.fromEntries(
      Object.entries(obj(d.baralhoCfg)).slice(0, 300).map(([k, v]) => {
        const c = obj(v);
        const limite = (x) => {
          const n = Math.floor(Number(x));
          return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : 0;
        };
        return [String(k).slice(0, 90), {
          embaralhar: c.embaralhar !== false,
          min: limite(c.min), max: limite(c.max),
        }];
      })),
    revisao: {
      esquema: ESQUEMAS.some((e) => e.id === rv.esquema) ? rv.esquema : "cadencia",
      dias: limparDias(rv.dias).length ? limparDias(rv.dias) : DEFAULTS.revisao.dias,
    },
    tema: {
      cor: CORES_TEMA.some((c) => c.id === tm.cor) || tm.cor === "propria" ? tm.cor : "cadencia",
      neon: hex(tm.neon), neon2: hex(tm.neon2),
      fonte: FONTES.some((f) => f.id === tm.fonte) ? tm.fonte : "inter",
      tamanho: Number(tm.tamanho) >= 0.85 && Number(tm.tamanho) <= 1.3 ? Number(tm.tamanho) : 1,
    },
  };
}

/* ── onde ficam as rotas /api ──────────────────────────────────────────
 *
 * O site e o servidor podem estar em endereços diferentes. Enquanto as
 * páginas vêm do Firebase Hosting, quem responde /api é o Worker do
 * Cloudflare, noutro domínio; quando o domínio apontar para o Worker, os
 * dois passam a ser o mesmo lugar.
 *
 * Em vez de fixar um endereço que fica errado na primeira mudança, a
 * primeira chamada tenta o próprio site e, se a resposta for a página em
 * vez de dados, repete no Worker. Qual dos dois funcionou fica guardado
 * para as chamadas seguintes irem direto.
 *
 * Para apontar para outro servidor sem recompilar, defina window.CADENCIA_API
 * no topo do index.html. String vazia significa "o próprio site".
 */
const API_RESERVA = "https://cadenciamed.joseeduardo1616.workers.dev";

function basesDeApi() {
  const cfg = typeof window !== "undefined" ? window.CADENCIA_API : undefined;
  if (typeof cfg === "string") return [cfg.replace(/\/+$/, "")];
  const aqui = (typeof window !== "undefined" && window.location && window.location.origin) || "";
  /* Servido pelo próprio Worker: não há segundo lugar para tentar. */
  if (aqui === API_RESERVA) return [""];
  return ["", API_RESERVA];
}

let baseQueRespondeu = null;

/* Chama uma rota /api e devolve { dados } ou { erro }. */
async function chamarApi(caminho, corpo, oQue, opcoes) {
  const metodo = (opcoes && opcoes.metodo) || "POST";
  const bases = baseQueRespondeu === null ? basesDeApi() : [baseQueRespondeu];
  let ultimo = { erro: `${oQue} não respondeu.` };

  for (const base of bases) {
    let r;
    try {
      r = await fetch(base + caminho, metodo === "GET" ? undefined : {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo || {}),
      });
    } catch (e) {
      /* Rede fora do ar, ou o navegador barrou por CORS. Nos dois casos vale
         tentar o próximo endereço antes de desistir. */
      ultimo = { erro: "Não consegui falar com o servidor. Verifique a conexão." };
      continue;
    }
    const lido = await lerRespostaDoServidor(r, oQue);
    /* Só troca de endereço quando não há servidor atrás deste. Um erro que
       veio do próprio servidor (cupom inválido, sessão expirada) é resposta
       de verdade e precisa chegar a quem perguntou. */
    if (!lido.semServidor) {
      baseQueRespondeu = base;
      return lido;
    }
    ultimo = lido;
  }
  return ultimo;
}

/* Lê a resposta de uma rota /api do servidor.
 *
 * O caso que mais confunde: quando o site está numa hospedagem só de
 * arquivos, /api/... não existe como rota, e a hospedagem devolve a própria
 * página do site com status 200. O JSON.parse falha, e antes isso virava um
 * "Não deu certo." que não dizia nada — o problema real é que falta publicar
 * o servidor, e a pessoa ficava procurando defeito no lugar errado.
 *
 * O campo semServidor marca justamente esse caso, para quem chamou saber que
 * vale a pena repetir noutro endereço em vez de mostrar o erro.
 */
async function lerRespostaDoServidor(r, oQue) {
  const bruto = await r.text().catch(() => "");
  let j = null;
  try { j = JSON.parse(bruto); } catch (e) { /* não é JSON */ }

  if (j && typeof j === "object") {
    if (r.ok) return { dados: j };
    return { erro: j.erro || `O servidor respondeu com erro ${r.status}.` };
  }

  /* veio HTML: quem respondeu foi a hospedagem de arquivos, não o servidor */
  if (/^\s*<(!doctype|html)/i.test(bruto)) {
    return {
      semServidor: true,
      erro: `${oQue} não está publicado neste endereço: o servidor devolveu a `
        + "página do site em vez de dados. As rotas /api precisam ser publicadas "
        + "junto, numa hospedagem que rode código.",
    };
  }
  if (r.status === 404) {
    return { semServidor: true, erro: `${oQue} ainda não foi publicado neste site.` };
  }
  return { erro: `${oQue} não respondeu (erro ${r.status}).` };
}

function subjectState(s, marks) {
  const m = marks[s.id] || {};
  const bonusDone = m.bonusDone && typeof m.bonusDone === "object" ? m.bonusDone : {};
  return {
    ...s,
    aula: !!m.aula,
    qts: !!m.qts,
    cards: !!m.cards,
    perf: Number(m.perf) || 0,
    date: m.date === undefined ? null : m.date,
    bonusDone,
    bonusCount: s.bonus.filter((_, i) => bonusDone[i]).length,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   3b · ARMAZENAMENTO LOCAL
   Prefere a API do ambiente quando existe, cai no localStorage e, em
   último caso, na memória, para o app nunca travar.
   ═══════════════════════════════════════════════════════════════════ */

const memoria = {};
const temStorageDoApp = () =>
  typeof window !== "undefined" && window.storage && typeof window.storage.set === "function";

async function lerBruto(k) {
  if (temStorageDoApp()) {
    const r = await window.storage.get(k);
    return r ? r.value : null;
  }
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage.getItem(k);
  return memoria[k] === undefined ? null : memoria[k];
}
async function gravarBruto(k, v) {
  if (temStorageDoApp()) { await window.storage.set(k, v); return; }
  if (typeof window !== "undefined" && window.localStorage) { window.localStorage.setItem(k, v); return; }
  memoria[k] = v;
}
function diagnostico(e) {
  const t = String((e && (e.name || e.code)) || "") + " " + String((e && e.message) || "");
  if (/quota|exceed|\b22\b/i.test(t)) {
    return "O espaço de armazenamento do navegador encheu. Baixe um backup em Progresso e apague parte do histórico.";
  }
  if (/security|access|denied|not allowed/i.test(t)) {
    return "O navegador bloqueou o armazenamento nesta página. Costuma acontecer em aba anônima, ou ao abrir o arquivo direto do computador.";
  }
  return "Não consegui gravar os dados neste navegador.";
}

/* ═══════════════════════════════════════════════════════════════════
   4 · PEÇAS DE INTERFACE
   ═══════════════════════════════════════════════════════════════════ */

/* Painel técnico: fundo quase transparente, borda de fio e marcas de canto,
   no lugar do cartão arredondado. A inclinação leve segue o cursor. */
function Card({ children, className = "", style, flat, brilho, tilt, marca }) {
  const ref = useRef(null);

  const mover = (e) => {
    if (!tilt || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.transform =
      `perspective(1100px) rotateX(${(-py * 2.4).toFixed(2)}deg) rotateY(${(px * 3).toFixed(2)}deg)`;
  };
  const sair = () => {
    if (ref.current) ref.current.style.transform = "perspective(1100px) rotateX(0) rotateY(0)";
  };

  const canto = (pos) => (
    <span aria-hidden="true" style={{
      position: "absolute", width: 9, height: 9, pointerEvents: "none",
      borderColor: T.line2, borderStyle: "solid", borderWidth: 0,
      ...(pos === "tl" ? { top: -1, left: -1, borderTopWidth: 1, borderLeftWidth: 1 }
        : pos === "tr" ? { top: -1, right: -1, borderTopWidth: 1, borderRightWidth: 1 }
        : pos === "bl" ? { bottom: -1, left: -1, borderBottomWidth: 1, borderLeftWidth: 1 }
        : { bottom: -1, right: -1, borderBottomWidth: 1, borderRightWidth: 1 }),
    }} />
  );

  return (
    <div ref={ref} className={`rounded-3xl vidro ${className}`}
      onPointerMove={tilt ? mover : undefined}
      onPointerLeave={tilt ? sair : undefined}
      style={{
        background: flat ? T.card2 : T.card,
        border: `1px solid ${T.line}`,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        position: "relative",
        transition: "transform .35s cubic-bezier(.2,.8,.2,1), border-color .3s",
        ...style,
      }}>
      {canto("tl")}{canto("tr")}{canto("bl")}{canto("br")}
      {marca ? (
        <span aria-hidden="true" style={{
          position: "absolute", top: 10, right: 14, fontFamily: F_MONO,
          fontSize: 10, letterSpacing: "0.18em", color: T.ghost, pointerEvents: "none",
        }}>{marca}</span>
      ) : null}
      {brilho ? (
        <span aria-hidden="true" style={{
          position: "absolute", top: -1, left: "8%", right: "8%", height: 1,
          background: `linear-gradient(90deg, transparent, ${brilho}, transparent)`,
          opacity: 0.9, pointerEvents: "none", boxShadow: `0 0 10px ${brilho}`,
        }} />
      ) : null}
      {children}
    </div>
  );
}

function Label({ children, style }) {
  return <div style={{
    fontSize: 12, fontWeight: 600, color: T.dim,
    letterSpacing: "0.13em", textTransform: "uppercase", ...style,
  }}>{children}</div>;
}
function Mini({ children, style }) {
  return <div style={{ fontSize: 13, fontWeight: 500, color: T.faint, ...style }}>{children}</div>;
}

/* Frase corrida. O Label é rótulo, em caixa alta e espaçado; um parágrafo
   inteiro escrito assim fica cansativo de ler. */
function Texto({ children, style }) {
  return <p style={{
    fontSize: 14.5, fontWeight: 500, color: T.dim, lineHeight: 1.65, margin: 0, ...style,
  }}>{children}</p>;
}

/* Títulos em caixa alta e bem espaçados, como nas referências */
function H({ children, size = 20, color, icon }) {
  return (
    <h2 className="flex items-center gap-2.5" style={{
      fontFamily: F_UI, fontSize: Math.max(13, size - 5), fontWeight: 700, margin: 0,
      letterSpacing: "0.16em", textTransform: "uppercase", color: color || T.ink,
    }}>
      {icon ? (
        <span className="flex items-center justify-center" style={{
          width: 26, height: 26, borderRadius: 4, flexShrink: 0,
          border: `1px solid ${soft(color || "var(--ink)", 40)}`,
          background: soft(color || "var(--ink)", 10), color: color || T.ink,
        }}>{icon}</span>
      ) : null}
      {children}
    </h2>
  );
}

function Num({ children, size = 34, color = T.ink, weight = 600 }) {
  return (
    <span style={{
      fontFamily: F_MONO, fontSize: size, fontWeight: weight, color,
      letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", lineHeight: 1.05,
    }}>{children}</span>
  );
}

function Btn({ children, onClick, tone = "quiet", disabled, className = "", title, size = "md" }) {
  const map = {
    primary: { bg: T.ink, fg: T.bg2, bd: "transparent" },
    quiet: { bg: T.card2, fg: T.ink, bd: T.line },
    outline: { bg: "transparent", fg: T.dim, bd: T.line2 },
    danger: { bg: "transparent", fg: T.bad, bd: soft("var(--bad)", 35) },
  };
  const t = map[tone] || map.quiet;
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full ${className}`}
      style={{
        background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
        padding: size === "sm" ? "7px 14px" : "11px 19px",
        fontFamily: F_UI, fontSize: size === "sm" ? 14 : 15, fontWeight: 600,
        opacity: disabled ? 0.35 : 1, cursor: disabled ? "not-allowed" : "pointer",
        transition: "opacity .15s", whiteSpace: "nowrap",
      }}>
      {children}
    </button>
  );
}

const inp = {
  background: T.card2, border: `1px solid ${T.line}`, color: T.ink, borderRadius: 14,
  padding: "12px 15px", fontSize: 16, fontWeight: 500, width: "100%", outline: "none", fontFamily: F_UI,
};
const TextInput = (p) => <input {...p} style={{ ...inp, ...(p.style || {}) }} />;
const Area = (p) => <textarea {...p} style={{ ...inp, minHeight: 100, resize: "vertical", lineHeight: 1.55, ...(p.style || {}) }} />;
const Select = ({ children, ...p }) => <select {...p} style={{ ...inp, ...(p.style || {}) }}>{children}</select>;

function Field({ label, children }) {
  return <label className="flex flex-col gap-2"><Label>{label}</Label>{children}</label>;
}

/* Campo numérico que aceita digitação livre: o limite só é aplicado ao
   sair do campo, senão o primeiro dígito já seria trocado pelo mínimo. */
function NumField({ label, value, onCommit, min = 0, max = 99999, placeholder }) {
  const [raw, setRaw] = useState(String(value == null ? "" : value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setRaw(String(value == null ? "" : value)); }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const clean = raw.replace(/\D/g, "");
    if (clean === "") { setRaw(String(value)); return; }
    onCommit(Math.min(max, Math.max(min, Number(clean))));
  };
  return (
    <Field label={label}>
      <input type="text" inputMode="numeric" pattern="[0-9]*" value={raw} placeholder={placeholder}
        onFocus={(e) => { setEditing(true); e.target.select(); }}
        onChange={(e) => { setEditing(true); setRaw(e.target.value.replace(/\D/g, "")); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{ ...inp, fontFamily: F_MONO }} />
    </Field>
  );
}

function NumBox({ label, value, onChange, placeholder }) {
  return (
    <Field label={label}>
      <input type="text" inputMode="numeric" pattern="[0-9]*" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        style={{ ...inp, fontFamily: F_MONO }} />
    </Field>
  );
}

function Chip({ area, small }) {
  return (
    <span className="inline-flex items-center rounded-full"
      style={{
        background: soft(aColor(area), 16), color: aColor(area),
        fontSize: small ? 12 : 13, fontWeight: 600,
        padding: small ? "2px 8px" : "3px 10px", whiteSpace: "nowrap",
      }}>{aLabel(area)}</span>
  );
}

function Track({ pct, color = T.ink, height = 6 }) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, background: T.card3 }}>
      <div style={{ width: `${p}%`, height: "100%", background: color, borderRadius: 99, transition: "width .45s cubic-bezier(.2,.8,.2,1)" }} />
    </div>
  );
}

/* A marca de "feito".
 *
 * Num aparelho de dedo o quadradinho de 20px é quase impossível de acertar,
 * então no toque o botão cresce em volta dele: o desenho continua do mesmo
 * tamanho, e o que aumenta é a área que responde. A classe .toque faz isso,
 * e está no <style> do app. */
function Tick({ on, onClick, color, size = 20, label }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
      className="toque flex items-center justify-center"
      style={{ padding: 0, background: "none", border: "none", flexShrink: 0, cursor: "pointer" }}>
      <span className="flex items-center justify-center rounded-full"
        style={{
          width: size, height: size,
          border: `1.5px solid ${on ? (color || T.ink) : T.line2}`,
          background: on ? (color || T.ink) : "transparent", transition: "background .15s",
        }}>
        {on ? <Check size={size * 0.6} color="var(--bg2)" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

function Blank({ title, hint, icon }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <div style={{ color: T.ghost }}>{icon}</div>
      <div className="mt-4" style={{ fontFamily: F_SERIF, fontSize: 19, color: T.dim }}>{title}</div>
      <div className="mt-1.5" style={{ fontSize: 14, color: T.faint, maxWidth: 340, lineHeight: 1.55 }}>{hint}</div>
    </div>
  );
}

function Paleta({ titulo, valor, onPick }) {
  return (
    <div>
      <Label>{titulo}</Label>
      <div className="flex flex-wrap gap-2 mt-3">
        {CORES_TIMER.map(([nome, hex]) => {
          const on = String(valor).toLowerCase() === hex.toLowerCase();
          return (
            <button key={hex} type="button" title={nome} aria-label={nome} onClick={() => onPick(hex)}
              className="flex items-center justify-center rounded-full"
              style={{
                width: 34, height: 34, background: hex, cursor: "pointer",
                border: on ? `3px solid ${T.ink}` : `1px solid ${T.line}`,
              }}>
              {on ? <Check size={15} color="#fff" strokeWidth={3.5} /> : null}
            </button>
          );
        })}
        <label className="flex items-center gap-2 rounded-full px-3"
          style={{ background: T.card2, border: `1px solid ${T.line}`, height: 34, cursor: "pointer" }}>
          <input type="color" value={valor} onChange={(e) => onPick(e.target.value)}
            style={{ width: 20, height: 20, border: "none", background: "none", padding: 0, cursor: "pointer" }} />
          <Mini>outra</Mini>
        </label>
      </div>
    </div>
  );
}

/* Seletor de matéria. No celular o toque tira o foco do campo e a página
   se mexe embaixo do dedo, então a escolha é resolvida no pointerdown. */
function SubjectPicker({ value, onChange, placeholder = "Buscar matéria" }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const caixa = useRef(null);
  const sel = value ? BY_ID[value] : null;

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return CURRICULUM.slice(0, 8);
    return CURRICULUM.filter((s) =>
      s.title.toLowerCase().includes(t) || s.esp.toLowerCase().includes(t)
      || aLabel(s.area).toLowerCase().includes(t) || s.esp.toLowerCase().includes(t)
    ).slice(0, 10);
  }, [q]);

  useEffect(() => {
    if (!open) return undefined;
    const fora = (e) => { if (caixa.current && !caixa.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [open]);

  const escolher = (e, id) => {
    e.preventDefault(); e.stopPropagation();
    onChange(id); setOpen(false); setQ("");
  };

  if (sel && !open) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl px-3.5 py-3" style={{ background: T.card2, border: `1px solid ${T.line}` }}>
        <Chip area={sel.area} small />
        <span className="flex-1 min-w-0" style={{ fontSize: 15, fontWeight: 500, color: T.ink, lineHeight: 1.35 }}>{sel.title}</span>
        <button type="button" aria-label="Trocar matéria"
          onPointerDown={(e) => { e.preventDefault(); onChange(null); setOpen(true); setQ(""); }}
          className="flex items-center justify-center rounded-full"
          style={{ width: 32, height: 32, flexShrink: 0, background: T.card3, border: "none", color: T.dim, cursor: "pointer" }}>
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }} ref={caixa}>
      <div className="flex items-center gap-2 rounded-2xl px-3.5" style={{ background: T.card2, border: `1px solid ${open ? T.line2 : T.line}` }}>
        <Search size={15} style={{ color: T.faint, flexShrink: 0 }} />
        <input value={q} placeholder={placeholder}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          style={{ ...inp, background: "transparent", border: "none", padding: "12px 0", borderRadius: 0 }} />
        {open ? (
          <button type="button" aria-label="Fechar lista"
            onPointerDown={(e) => { e.preventDefault(); setOpen(false); }}
            className="flex items-center justify-center rounded-full"
            style={{ width: 30, height: 30, flexShrink: 0, background: T.card3, border: "none", color: T.dim, cursor: "pointer" }}>
            <X size={14} />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="rounded-2xl mt-1.5"
          style={{
            position: "absolute", zIndex: 60, left: 0, right: 0, background: T.card3,
            boxShadow: T.shadow, maxHeight: 320, overflowY: "auto",
            border: `1px solid ${T.line2}`, WebkitOverflowScrolling: "touch",
          }}>
          {results.length === 0 ? (
            <div className="px-4 py-4" style={{ fontSize: 14.5, color: T.faint }}>Nada encontrado</div>
          ) : results.map((s) => (
            <button key={s.id} type="button"
              onPointerDown={(e) => escolher(e, s.id)} onClick={(e) => escolher(e, s.id)}
              className="w-full flex items-start gap-2.5 px-4 py-3 text-left"
              style={{ background: "transparent", border: "none", borderBottom: `1px solid ${T.line}`, cursor: "pointer", minHeight: 52 }}>
              <span style={{ fontFamily: F_MONO, fontSize: 12, color: T.ghost, width: 22, flexShrink: 0, marginTop: 3 }}>{pad(s.week)}</span>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: aColor(s.area), flexShrink: 0, marginTop: 7 }} />
              <span className="flex-1 min-w-0" style={{ fontSize: 14.5, fontWeight: 500, color: T.ink, lineHeight: 1.4 }}>{s.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
