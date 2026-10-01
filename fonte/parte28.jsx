/* ═══════════════════════════════════════════════════════════════════
   38 · INICIAR UM BLOCO DA AGENDA

   Um bloco de estudo de hoje (os da mentoria e os remarcados, e também os
   de estudo que a pessoa criou) ganha "Iniciar" onde quer que apareça:
   na Agenda, em Hoje e no plano da mentoria. Iniciar começa a contar o
   tempo como o Foco; Parar registra o tempo como sessão de estudo (e abre
   a mesma pergunta do Foco: tipo, questões, acertos); Concluir registra e
   ainda marca o bloco como cumprido — que é o que impede ele de ir para os
   próximos dias (parte27).

   Igual ao Foco também no resto:
   · o estado mora no aparelho em instantes absolutos, então o tempo corre
     com o site fechado e continua certo ao voltar;
   · aos 30 minutos sem sinal de vida vem o "Você está aí?" (na tela, e
     pelo servidor quando o celular está em outro aplicativo); sem
     resposta em um minuto, conta só até a pergunta;
   · um cronômetro de cada vez: iniciar um bloco pausa o Foco, e iniciar
     outro bloco encerra (registrando) o anterior.
   ═══════════════════════════════════════════════════════════════════ */

const CHAVE_BLOCO_ATIVO = "cadencia:v3:bloco-ativo";
const BlocoAtivoCtx = createContext(null);
const useBlocoAtivo = () => useContext(BlocoAtivoCtx);

function lerBlocoAtivo() {
  try {
    const v = JSON.parse(window.localStorage.getItem(CHAVE_BLOCO_ATIVO) || "null");
    return v && v.id && Number(v.inicio) > 0 ? v : null;
  } catch (e) { return null; }
}
function gravarBlocoAtivo(v) {
  try {
    if (v) window.localStorage.setItem(CHAVE_BLOCO_ATIVO, JSON.stringify(v));
    else window.localStorage.removeItem(CHAVE_BLOCO_ATIVO);
  } catch (e) { /* sem espaço: o cronômetro só não sobrevive a recarregar */ }
}

const blocoIniciavel = (b) => !!b && TIPOS_QUE_ROLAM.indexOf(b.type) >= 0;

function fmtRelogioBloco(seg) {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(r).padStart(2, "0")}`;
}

/* registrar(min, bloco): grava a sessão (mora no App, junto do Foco).
   pausarFoco(): para o pomodoro, se estiver correndo. */
function useBlocoEmAndamento({ setData, notify, registrar, pausarFoco }) {
  const [ativo, setAtivoRaw] = useState(() => {
    const a = lerBlocoAtivo();
    if (!a) return null;
    /* Mesma regra do Foco: "Estou aqui" tocado no aviso com a página já
       descartada reabre o site com a hora da resposta. */
    const r = respostaDePresencaNaUrl();
    return r && estadoDaPresenca(a.presencaDesde, r).fase !== "sumiu" ? { ...a, presencaDesde: r } : a;
  });
  const ref = useRef(ativo);
  const setAtivo = (v) => { ref.current = v; gravarBlocoAtivo(v); setAtivoRaw(v); };
  const [, tique] = useState(0);
  useEffect(() => {
    if (!ativo) return undefined;
    const t = window.setInterval(() => tique((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [ativo]);

  const agora = Date.now();
  const presenca = ativo ? estadoDaPresenca(ativo.presencaDesde, agora) : PRESENCA_OK;
  const segundos = ativo
    ? Math.max(0, ((presenca.fase === "sumiu" ? presenca.perguntaEm : agora) - ativo.inicio) / 1000) : 0;

  const encerrar = useCallback((concluir, ate) => {
    const a = ref.current;
    if (!a) return;
    const min = Math.round(((ate || Date.now()) - a.inicio) / 60000);
    setAtivo(null);
    fecharAvisoPresenca();
    if (concluir) {
      setData((p) => ({ ...p, blocos: { ...(p.blocos || {}), [`${a.id}|${a.date}`]: Date.now() } }));
    }
    if (min >= 1) registrar(min, a);
    notify(min >= 1
      ? `${fmtMin(min)} de "${a.label}" registrados${concluir ? ", e o bloco ficou cumprido" : ""}.`
      : concluir ? "Bloco marcado como cumprido. Menos de um minuto, então o tempo não foi registrado."
        : "Menos de um minuto, não registrei.");
  }, [setData, notify, registrar]); // eslint-disable-line react-hooks/exhaustive-deps

  const iniciar = useCallback((b, iso) => {
    if (!blocoIniciavel(b)) return;
    if (ref.current) {
      if (ref.current.id === b.id && ref.current.date === iso) return;
      encerrar(false);
    }
    if (pausarFoco) pausarFoco();
    const t = Date.now();
    setAtivo({
      id: b.id, date: iso, label: b.label, type: b.type,
      planejado: Math.max(0, toMin(b.end) - toMin(b.start)),
      inicio: t, presencaDesde: t,
    });
  }, [encerrar, pausarFoco]); // eslint-disable-line react-hooks/exhaustive-deps

  const estouAqui = useCallback(() => {
    const a = ref.current;
    if (!a) return;
    setAtivo({ ...a, presencaDesde: Date.now() });
    fecharAvisoPresenca();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useOuvirAvisoPresenca(estouAqui);

  /* "Você está aí?" — a pergunta e o que acontece sem resposta. */
  const perguntou = useRef(false);
  useEffect(() => {
    if (!ativo || presenca.fase === "ok") { perguntou.current = false; return; }
    if (presenca.fase === "perguntando") {
      if (perguntou.current) return;
      perguntou.current = true;
      avisarPresenca(`O bloco "${ativo.label}" para em 1 minuto se ninguém responder.`);
      return;
    }
    encerrar(false, presenca.perguntaEm);
    notify("Parei o bloco: ninguém respondeu \"Você está aí?\". Contou até a pergunta.");
  }, [ativo, presenca.fase]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ativo, segundos, presenca, iniciar, encerrar, estouAqui };
}

/* O botão, onde quer que o bloco apareça. Só para hoje: começar agora o
   bloco de quinta-feira registraria o tempo no dia errado. */
function BotaoIniciarBloco({ b, iso, compacto }) {
  const B = useBlocoAtivo();
  if (!B || !blocoIniciavel(b) || iso !== todayISO()) return null;
  const este = B.ativo && B.ativo.id === b.id && B.ativo.date === iso;
  if (!este) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); B.iniciar(b, iso); }}
        data-teste="iniciar-bloco" aria-label={`Iniciar ${b.label}`}
        className="toque-larg rounded-full inline-flex items-center gap-1.5"
        style={{
          padding: compacto ? "5px 11px" : "6px 14px", flexShrink: 0,
          background: soft("var(--ok)", 14), border: `1px solid ${soft("var(--ok)", 40)}`,
          color: T.ok, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: F_UI,
        }}>
        <Play size={12} /> Iniciar
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <span className="breathe" style={{ width: 8, height: 8, borderRadius: 99, background: "var(--ok)" }} />
      <span style={{ fontFamily: F_MONO, fontSize: 13.5, fontWeight: 700, color: T.ok }} data-teste="relogio-bloco">{fmtRelogioBloco(B.segundos)}</span>
      <Btn size="sm" onClick={() => B.encerrar(false)}><Pause size={12} /> Parar</Btn>
      <Btn size="sm" tone="primary" onClick={() => B.encerrar(true)}><Check size={12} /> Concluir</Btn>
    </span>
  );
}

/* A barra que acompanha a pessoa por todas as abas enquanto o bloco
   corre: sem ela, quem trocasse de aba esqueceria o relógio ligado. */
function BarraBlocoAtivo({ irPara }) {
  const B = useBlocoAtivo();
  if (!B || !B.ativo) return null;
  const a = B.ativo;
  const pct = a.planejado ? Math.min(100, (B.segundos / 60 / a.planejado) * 100) : 0;
  return (
    <div data-teste="barra-bloco" role="status" style={{
      position: "fixed", left: "50%", transform: "translateX(-50%)",
      bottom: "calc(70px + env(safe-area-inset-bottom))", zIndex: 56,
      width: "min(560px, calc(100vw - 32px))",
      background: T.card3, border: `1px solid ${soft("var(--ok)", 45)}`, borderRadius: 18,
      padding: "10px 12px 10px 14px", boxShadow: T.shadow,
    }}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="breathe" style={{ width: 9, height: 9, borderRadius: 99, background: "var(--ok)", flexShrink: 0 }} />
        <button type="button" onClick={() => irPara && irPara("rotina")} className="flex-1 min-w-0 text-left"
          style={{ background: "none", border: "none", color: T.ink, cursor: "pointer", padding: 0, fontFamily: F_UI, minWidth: 120 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
          <span style={{ fontFamily: F_MONO, fontSize: 13, color: T.ok }}>
            {fmtRelogioBloco(B.segundos)}{a.planejado ? <span style={{ color: T.dim }}> de {fmtMin(a.planejado)}</span> : null}
          </span>
        </button>
        <Btn size="sm" onClick={() => B.encerrar(false)}><Pause size={12} /> Parar</Btn>
        <Btn size="sm" tone="primary" onClick={() => B.encerrar(true)}><Check size={12} /> Concluir</Btn>
      </div>
      {a.planejado ? (
        <div style={{ marginTop: 8, height: 3, borderRadius: 99, background: T.card2, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--ok)", transition: "width 1s linear" }} />
        </div>
      ) : null}
    </div>
  );
}
