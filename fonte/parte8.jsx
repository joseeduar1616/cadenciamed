/* ═══════════════════════════════════════════════════════════════════
   17b · BARRA LATERAL
   No lugar da fileira de abas que rolava para o lado, um menu vertical
   que mostra tudo de uma vez. No computador ele fica fixo e encolhe para
   só os ícones; no celular vira gaveta, que abre por cima do conteúdo e
   fecha sozinha ao escolher.
   ═══════════════════════════════════════════════════════════════════ */

const ICONE_ABA = {
  hoje: CalendarDays, foco: Target, materias: ListChecks, temas: Stethoscope,
  assistente: Sparkles, cartoes: Layers, revisoes: RotateCcw, rotina: Coffee,
  amigos: Users, metas: Flame, progresso: BarChart3, planos: Zap,
};

/* Diz se a tela é estreita. A escolha "forçar celular" no rodapé manda
   aqui também, senão o menu ficaria fixo num layout feito para caber
   numa coluna só. */
function useTelaEstreita(forcado) {
  const [estreita, setEstreita] = useState(true);
  useEffect(() => {
    if (forcado) { setEstreita(true); return undefined; }
    const medir = () => setEstreita(window.innerWidth < 1024);
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [forcado]);
  return forcado ? true : estreita;
}

function BarraLateral({ abas, atual, onEscolher, estreita, aberta, onFechar, aberto, setAberto, pro }) {
  /* No celular a gaveta some do caminho quando fechada; no computador ela
     continua na tela, só encolhida para a largura dos ícones. */
  const expandida = estreita ? true : aberto;
  const largura = expandida ? 236 : 72;

  useEffect(() => {
    if (!estreita || !aberta) return undefined;
    const h = (e) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [estreita, aberta, onFechar]);

  const conteudo = (
    <>
      <div className="flex items-center gap-2 px-3" style={{ height: 58, flexShrink: 0 }}>
        {estreita ? (
          <button type="button" aria-label="Fechar menu" onClick={onFechar}
            className="flex items-center justify-center rounded-full brilhar"
            style={{ width: 36, height: 36, background: "transparent", border: `1px solid ${T.line}`, color: T.dim, cursor: "pointer" }}>
            <X size={16} />
          </button>
        ) : (
          <button type="button" aria-label={aberto ? "Encolher menu" : "Expandir menu"}
            onClick={() => setAberto(!aberto)}
            className="flex items-center justify-center rounded-full brilhar"
            style={{ width: 36, height: 36, background: "transparent", border: `1px solid ${T.line}`, color: T.dim, cursor: "pointer", flexShrink: 0 }}>
            <PanelLeft size={16} style={{ transform: aberto ? "none" : "scaleX(-1)", transition: "transform .2s" }} />
          </button>
        )}
        {expandida ? (
          <span style={{
            fontFamily: F_MONO, fontSize: 10, letterSpacing: "0.28em",
            textTransform: "uppercase", color: T.ghost, whiteSpace: "nowrap",
          }}>Navegação</span>
        ) : null}
      </div>

      <nav className="flex flex-col gap-1 px-3 pb-4" style={{ overflowY: "auto", flex: 1 }}>
        {abas.map((t) => {
          const on = atual === t.id;
          const Ic = ICONE_ABA[t.id] || Layers;
          const trancada = !pro && ABAS_PRO.indexOf(t.id) >= 0;
          return (
            <button key={t.id} type="button" title={expandida ? undefined : t.label}
              onClick={() => { onEscolher(t.id); if (estreita) onFechar(); }}
              className="aba flex items-center gap-3 rounded-2xl px-3 whitespace-nowrap"
              data-on={on ? "1" : "0"}
              style={{
                minHeight: 44, flexShrink: 0,
                background: on
                  ? `linear-gradient(100deg, ${soft(t.acc, 26)}, ${soft(t.acc, 8)})`
                  : "transparent",
                border: `1px solid ${on ? soft(t.acc, 40) : "transparent"}`,
                color: on ? t.acc : T.dim,
                fontSize: 13.5, fontWeight: on ? 700 : 500,
                letterSpacing: "0.06em", textTransform: "uppercase",
                cursor: "pointer", justifyContent: expandida ? "flex-start" : "center",
                textShadow: on ? `0 0 18px ${t.acc}` : "none",
              }}>
              <Ic size={17} style={{ flexShrink: 0 }} />
              {expandida ? <span className="flex-1 text-left">{t.label}</span> : null}
              {expandida && trancada ? (
                <span style={{ color: T.ghost, display: "inline-flex" }}><Cadeado tamanho={12} /></span>
              ) : null}
              {t.badge ? (
                <span style={{
                  fontFamily: F_MONO, fontSize: 10, background: T.warn, color: "var(--bg)",
                  borderRadius: 99, padding: "1px 6px", fontWeight: 700,
                  position: expandida ? "static" : "absolute", marginLeft: expandida ? 0 : 22,
                  marginTop: expandida ? 0 : -18,
                }}>{t.badge}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </>
  );

  if (estreita) {
    return (
      <>
        {aberta ? (
          <div aria-hidden="true" onClick={onFechar}
            style={{
              position: "fixed", inset: 0, zIndex: 58,
              background: soft("var(--bg)", 72), backdropFilter: "blur(4px)",
            }} />
        ) : null}
        <aside aria-label="Navegação" aria-hidden={!aberta}
          className="flex flex-col"
          style={{
            position: "fixed", top: 0, bottom: 0, left: 0, width: 268, maxWidth: "84vw",
            zIndex: 59, background: T.card3, borderRight: `1px solid ${T.line2}`,
            backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
            boxShadow: aberta ? T.shadow : "none",
            transform: aberta ? "none" : "translateX(-100%)",
            transition: "transform .28s cubic-bezier(.2,.8,.2,1)",
            visibility: aberta ? "visible" : "hidden",
          }}>
          {conteudo}
        </aside>
      </>
    );
  }

  return (
    <aside aria-label="Navegação" className="flex flex-col"
      style={{
        width: largura, flexShrink: 0, position: "sticky", top: 0,
        height: "100vh", borderRight: `1px solid ${T.line}`,
        background: soft("var(--bg2)", 55),
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        transition: "width .25s cubic-bezier(.2,.8,.2,1)",
      }}>
      {conteudo}
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   18 · APP
   ═══════════════════════════════════════════════════════════════════ */

export default function Cadencia() {
  const [data, setData] = useState(DEFAULTS);
  const [ready, setReady] = useState(false);
  /* Quem volta da autorização do Notion cai em /notion, com o código na
     barra de endereço. Abrir direto no Assistente é o que faz o painel
     montar e trocar esse código pelo token — sem isso a pessoa voltaria
     para a tela de Hoje e a ligação simplesmente não aconteceria. */
  const [tab, setTab] = useState(() => (voltandoDoNotion() ? "assistente" : "hoje"));
  const [toast, setToast] = useState(null);
  const [showKeys, setShowKeys] = useState(false);
  const [avisoDisco, setAvisoDisco] = useState("");
  const saveRef = useRef(null);
  const firstRef = useRef(true);
  const ultimoSalvo = useRef(null);
  const tentativas = useRef(0);

  const notify = useCallback((m) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const bruto = await lerBruto(KEY);
        if (alive && bruto) { setData(normalize(JSON.parse(bruto))); ultimoSalvo.current = bruto; }
      } catch (e) { /* primeira execução */ }
      finally { if (alive) setReady(true); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    if (firstRef.current) { firstRef.current = false; return undefined; }
    const texto = JSON.stringify(data);
    if (texto === ultimoSalvo.current) return undefined;
    let cancelado = false;
    const tentar = async (n) => {
      if (cancelado) return;
      try {
        await gravarBruto(KEY, texto);
        ultimoSalvo.current = texto;
        tentativas.current = 0;
        setAvisoDisco("");
      } catch (e) {
        if (cancelado) return;
        tentativas.current = n;
        if (n < 3) {
          const espera = [900, 2000][n - 1] || 2000;
          saveRef.current = window.setTimeout(() => tentar(n + 1), espera);
        } else setAvisoDisco(diagnostico(e));
      }
    };
    saveRef.current = window.setTimeout(() => tentar(1), 1500);
    return () => { cancelado = true; if (saveRef.current) window.clearTimeout(saveRef.current); };
  }, [data, ready]);

  /* A personalização de aparência é escrita direto no <html>: assim vale
     também para o que é pintado fora do React, como o fundo da página e a
     cor da barra do navegador no celular. */
  const aparencia = useMemo(() => {
    const tm = data.tema || DEFAULTS.tema;
    const pronta = CORES_TEMA.find((c) => c.id === tm.cor);
    return {
      neon: (tm.cor === "propria" ? tm.neon : pronta && pronta.neon) || "",
      neon2: (tm.cor === "propria" ? tm.neon2 : pronta && pronta.neon2) || "",
      fonte: (FONTES.find((f) => f.id === tm.fonte) || FONTES[0]).ui,
      tamanho: Number(tm.tamanho) || 1,
    };
  }, [data.tema]);

  useEffect(() => {
    try {
      const raiz = document.documentElement;
      raiz.setAttribute("data-theme", data.theme);
      raiz.setAttribute("data-layout", data.layout);
      if (aparencia.neon) raiz.style.setProperty("--neon", aparencia.neon);
      else raiz.style.removeProperty("--neon");
      if (aparencia.neon2) raiz.style.setProperty("--neon2", aparencia.neon2);
      else raiz.style.removeProperty("--neon2");
      raiz.style.setProperty("--f-ui", aparencia.fonte);
      document.body.style.background = "var(--bg)";
      document.body.style.margin = "0";
      const barra = document.querySelector('meta[name="theme-color"]');
      if (barra) barra.setAttribute("content", data.theme === "light" ? "#F1EFF8" : "#04030A");
    } catch (e) { /* noop */ }
  }, [data.theme, data.layout, aparencia]);

  const LARGURA = data.layout === "movel" ? 470 : 1120;
  const today = todayISO();
  const subjects = useMemo(() => CURRICULUM.map((s) => subjectState(s, data.marks)), [data.marks]);

  /* A escada de revisão sai do esquema escolhido em Revisões. Trocar de
     esquema muda os prazos na hora, sem mexer no que já foi marcado: cada
     degrau cumprido é guardado pelo número de dias, então um degrau que
     não existe no esquema novo apenas deixa de aparecer. */
  const degraus = useMemo(() => escada(data.revisao), [data.revisao]);
  const degrausRef = useRef(degraus);
  degrausRef.current = degraus;

  const minutesBySubject = useMemo(() => {
    const m = {};
    for (const s of data.sessions) if (s.subjectId) m[s.subjectId] = (m[s.subjectId] || 0) + (s.minutes || 0);
    return m;
  }, [data.sessions]);

  const byDay = useMemo(() => {
    const m = {};
    for (const s of data.sessions) m[s.date] = (m[s.date] || 0) + (s.minutes || 0);
    return m;
  }, [data.sessions]);

  const minToday = byDay[today] || 0;
  const ws = weekStart(today);
  const weekSessions = useMemo(() => data.sessions.filter((s) => s.date >= ws && s.date <= today), [data.sessions, ws, today]);
  const minWeek = weekSessions.reduce((a, s) => a + (s.minutes || 0), 0);
  const qWeek = weekSessions.reduce((a, s) => a + (s.questions || 0), 0);

  const streak = useMemo(() => {
    let n = 0, c = byDay[today] ? today : addDays(today, -1);
    while (byDay[c]) { n++; c = addDays(c, -1); }
    return n;
  }, [byDay, today]);

  const totals = useMemo(() => {
    let min = 0, q = 0, ok = 0;
    for (const s of data.sessions) { min += s.minutes || 0; q += s.questions || 0; ok += s.correct || 0; }
    return { min, q, ok, pct: q ? Math.round((ok / q) * 100) : null };
  }, [data.sessions]);

  const done = subjects.filter((s) => s.aula).length;
  const bonusDone = subjects.reduce((a, s) => a + s.bonusCount, 0);

  const ladder = useMemo(() => {
    const rows = [];
    for (const s of subjects) {
      if (!s.aula) continue;
      const rec = data.reviews[s.id] || {};
      const anchor = rec.anchor || s.date || today;
      const marked = { ...(rec.done || {}) };
      for (const k of Object.keys(rec.undone || {})) delete marked[k];
      const steps = degraus.map((st) => {
        const due = addDays(anchor, st.d);
        const on = marked[String(st.d)] || null;
        let state = "futura";
        if (on) state = "feita";
        else if (due < today) state = "vencida";
        else if (due === today) state = "hoje";
        return { ...st, due, on, state };
      });
      const late = steps.filter((x) => x.state === "vencida" || x.state === "hoje");
      rows.push({
        id: s.id, area: s.area, title: s.title, week: s.week, anchor, steps, late,
        minutes: minutesBySubject[s.id] || 0,
        overdueBy: late.length ? diffDays(late[0].due, today) : 0,
      });
    }
    rows.sort((a, b) => (b.late.length - a.late.length) || (b.overdueBy - a.overdueBy));
    return rows;
  }, [subjects, data.reviews, minutesBySubject, today, degraus]);

  const late = ladder.filter((r) => r.late.length > 0);
  const cartoesHoje = useMemo(
    () => (data.flash || []).filter((c) => (c.prox || today) <= today).length,
    [data.flash, today]
  );

  /* blocos de hoje, juntando o que se repete com o que é datado */
  const blocosHoje = useMemo(() => {
    const di = (fromISO(today).getDay() + 6) % 7;
    const fixos = (data.routine || []).filter((b) => Number(b.day) === di);
    const datados = (data.agenda || []).filter((b) => b.date === today);
    return [...fixos, ...datados].sort((a, b) => toMin(a.start) - toMin(b.start));
  }, [data.routine, data.agenda, today]);

  /* Projeção simples: compara o ritmo real das últimas semanas com o ritmo
     necessário para terminar o cronograma antes da prova. Usa a data em que
     cada aula foi marcada, então só aparece quando há histórico suficiente. */
  const projecao = useMemo(() => {
    const total = subjects.length;
    const feitas = subjects.filter((s) => s.aula).length;
    const faltam = total - feitas;
    const corte = addDays(today, -28);
    const recentes = subjects.filter((s) => s.aula && s.date && s.date >= corte && s.date <= today).length;
    const porSemana = recentes / 4;
    const dias = data.profile.examDate ? diffDays(today, data.profile.examDate) : null;
    if (dias === null || dias <= 0) return null;
    const semanas = dias / 7;
    const precisa = faltam / semanas;
    const folga = porSemana - precisa;

    let frase;
    if (faltam === 0) {
      frase = "Cronograma fechado. Daqui para frente é revisão e questão.";
    } else if (recentes === 0) {
      frase = `Nas últimas 4 semanas nenhuma aula nova foi marcada. Faltam ${faltam} aulas e ${dias} dias, o que dá ${precisa.toFixed(1)} aulas por semana para fechar a tempo.`;
    } else if (folga >= 0) {
      const fim = Math.ceil(faltam / Math.max(0.1, porSemana));
      frase = `No ritmo atual você fecha o cronograma em cerca de ${fim} semanas, com folga em relação à prova. Precisaria de ${precisa.toFixed(1)} por semana e está fazendo ${porSemana.toFixed(1)}.`;
    } else {
      frase = `O ritmo atual de ${porSemana.toFixed(1)} aulas por semana não fecha o cronograma antes da prova. Seriam necessárias ${precisa.toFixed(1)} por semana para dar conta das ${faltam} que faltam.`;
    }
    return { total, feitas, faltam, porSemana, precisa, folga, dias, frase, pctCurso: (feitas / total) * 100 };
  }, [subjects, today, data.profile.examDate]);

  const addSession = useCallback((s) => setData((p) => ({ ...p, sessions: [s, ...p.sessions] })), []);
  const delSession = useCallback((id) => setData((p) => ({ ...p, sessions: p.sessions.filter((x) => x.id !== id) })), []);
  const setMark = useCallback((id, patch) => {
    setData((p) => ({ ...p, marks: { ...p.marks, [id]: { ...(p.marks[id] || {}), ...patch } } }));
  }, []);
  const toggleBonus = useCallback((id, idx) => {
    setData((p) => {
      const cur = p.marks[id] || {};
      const bd = { ...(cur.bonusDone || {}) };
      if (bd[idx]) delete bd[idx]; else bd[idx] = 1;
      return { ...p, marks: { ...p.marks, [id]: { ...cur, bonusDone: bd } } };
    });
  }, []);
  const toggleStep = useCallback((id, days, anchor) => {
    setData((p) => {
      const rec = { ...(p.reviews[id] || {}) };
      const doneMap = { ...(rec.done || {}) }, undo = { ...(rec.undone || {}) };
      const k = String(days);
      if (doneMap[k]) { delete doneMap[k]; undo[k] = 1; }
      else { doneMap[k] = todayISO(); delete undo[k]; }
      rec.done = doneMap; rec.undone = undo;
      if (!rec.anchor) rec.anchor = anchor;
      return { ...p, reviews: { ...p.reviews, [id]: rec } };
    });
  }, []);
  const resetCycle = useCallback((id) => {
    setData((p) => {
      const undone = {};
      for (const st of degrausRef.current) undone[String(st.d)] = 1;
      return { ...p, reviews: { ...p.reviews, [id]: { anchor: todayISO(), done: {}, undone } } };
    });
  }, []);

  const [pomoSubject, setPomoSubject] = useState(null);
  const pomoSubjRef = useRef(null);
  pomoSubjRef.current = pomoSubject;

  const onFocusDone = useCallback((mins, origem) => {
    const sid = pomoSubjRef.current, s = sid ? BY_ID[sid] : null;
    setData((p) => ({
      ...p,
      sessions: [{
        id: uid(), date: todayISO(), subjectId: sid, area: s ? s.area : null,
        topic: s ? s.title : "Foco livre", kind: "Aula", minutes: mins,
        questions: 0, correct: 0, notes: origem || "pomodoro", createdAt: Date.now(),
      }, ...p.sessions],
      pomoLog: [{ date: todayISO(), mins }, ...p.pomoLog].slice(0, 500),
    }));
  }, []);

  const P = usePomodoro({ pomo: data.pomo, onFocusDone, notify, pronto: ready });
  const [proAtivo, setProAtivo] = useState(false);
  const nuvem = useNuvem(data, setData, notify, ready, proAtivo);
  const gcal = useGoogleAgenda({ data, setData, notify, ladder, today });
  const assinatura = useAssinatura(nuvem.sdk, nuvem.usuario);
  const pro = assinatura.pro;
  useEffect(() => { setProAtivo(pro); }, [pro]);

  const souDono = ehDono(nuvem.usuario);

  /* Publica os três números que aparecem no ranking das salas. Fica aqui,
     e não dentro da aba Amigos, para o perfil continuar em dia mesmo de
     quem nunca abre essa aba — senão o ranking mostraria zero para quem
     estudou e simplesmente não estava com ela aberta. */
  /* E, junto, o "estudando agora" das salas: vale enquanto o cronômetro
     anda em foco. A pausa e o descanso não contam — quem parou não está
     estudando, e mostrar o contrário seria o app mentindo para os amigos. */
  const aoVivo = {
    ativo: P.running && P.phase === "foco",
    minutos: P.modo === "corrido" ? P.corrido / 60 : (P.total - P.left) / 60,
  };

  usePerfilPublico(nuvem, data.profile.name, data.sessions, today, data.mostrarDesempenho, aoVivo);

  /* Menu lateral: no celular é gaveta que abre por cima; no computador
     fica fixo e só encolhe para a largura dos ícones. */
  const estreita = useTelaEstreita(data.layout === "movel");
  const [menuAberto, setMenuAberto] = useState(false);
  const [menuFixo, setMenuFixo] = useState(true);
  useEffect(() => { if (!estreita) setMenuAberto(false); }, [estreita]);

  const TABS = [
    { id: "hoje", label: "Hoje", acc: "var(--a-CL)" },
    { id: "foco", label: "Foco", acc: "var(--a-PR)" },
    { id: "materias", label: "Matérias", acc: "var(--a-GO)" },
    { id: "temas", label: "Temas", acc: "var(--a-CI)" },
    ...(souDono || pro ? [{ id: "assistente", label: "Assistente", acc: "var(--neon)" }] : []),
    { id: "cartoes", label: "Cartões", acc: "var(--neon)", badge: cartoesHoje },
    { id: "revisoes", label: "Revisões", acc: "var(--ok)", badge: late.length },
    { id: "rotina", label: "Rotina", acc: "var(--a-PE)" },
    { id: "amigos", label: "Amigos", acc: "var(--neon2)" },
    { id: "metas", label: "Metas", acc: "var(--warn)" },
    { id: "progresso", label: "Progresso", acc: "var(--a-CI)" },
    { id: "planos", label: pro ? "Plano" : "Assinar", acc: "var(--neon2)" },
  ];
  const acc = (TABS.find((t) => t.id === tab) || TABS[0]).acc;

  /* Sair da conta, ou a assinatura vencer, com o Assistente aberto deixaria uma
     aba escolhida que não existe mais na barra, e a tela ficaria em branco.
     Mas enquanto o plano está sendo conferido ninguém é pro ainda: mandar
     para Hoje aqui expulsaria de imediato quem abriu o site direto numa aba
     paga — inclusive quem volta da autorização do Notion. */
  useEffect(() => {
    if (assinatura.carregando) return;
    if (!TABS.some((t) => t.id === tab)) setTab("hoje");
  }, [souDono, pro, tab, assinatura.carregando]);

  useEffect(() => {
    const h = (e) => {
      const el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if (e.key === "?") { setShowKeys((v) => !v); return; }
      if (e.key === "Escape") { setShowKeys(false); return; }
      if (estaEstudando()) return;      // no estudo, os números são as notas
      const n = Number(e.key);
      if (n >= 1 && n <= TABS.length) setTab(TABS[n - 1].id);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [TABS.length]);

  if (!ready) {
    return (
      <div data-theme="dark" className="flex items-center justify-center"
        style={{ background: T.bg, minHeight: "100vh", color: T.ghost, fontFamily: F_MONO, fontSize: 13 }}>
        <style>{THEME_CSS}</style>carregando
      </div>
    );
  }

  /* Entrar numa conta que já existe encerra as boas-vindas: os dados vêm da
     nuvem, e pedir o nome de novo seria perguntar o que já se sabe. */
  const needsOnboarding = !data.profile.onboarded && !nuvem.usuario;
  const hour = new Date().getHours();
  const greet = hour < 5 ? "Boa madrugada" : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = (data.profile.name || "").trim().split(" ")[0];
  const daysToExam = data.profile.examDate ? diffDays(today, data.profile.examDate) : null;

  return (
    <div data-theme={data.theme} style={{ background: T.bg, minHeight: "100vh", color: T.ink, fontFamily: F_UI, fontWeight: 500, "--acc": acc }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Instrument+Serif&family=JetBrains+Mono:wght@400;500;600;700&family=Sora:wght@300;400;500;600;700&family=Manrope:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
        ${THEME_CSS}
        *,*::before,*::after{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        input,select,textarea,button{font-family:inherit}
        input::placeholder,textarea::placeholder{color:var(--ghost)}
        input:focus,select:focus,textarea:focus{border-color:var(--line2)!important}
        button:focus-visible,input:focus-visible{outline:2px solid var(--neon);outline-offset:3px;border-radius:8px}
        ::-webkit-scrollbar{width:9px;height:9px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:var(--card3);border-radius:9px}
        ::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--neon) 40%,var(--card3))}
        input[type=checkbox]{accent-color:var(--neon);width:16px;height:16px}
        /* ── alvos de toque ─────────────────────────────────────────────
           Num aparelho de dedo, um botão de 20 ou 28 pixels é chute. Só no
           toque, e só em quem pede, a área cresce para 40: no computador o
           cursor acerta qualquer coisa, e engordar tudo lá só ocuparia
           espaço à toa. */
        @media (pointer: coarse){
          .toque{min-width:40px;min-height:40px}
          .toque-larg{min-height:38px}
        }
        @media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
        @keyframes breathe{0%,100%{opacity:1}50%{opacity:.4}}
        .breathe{animation:breathe 2.6s ease-in-out infinite}
        @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .rise{animation:rise .38s cubic-bezier(.2,.8,.2,1) both}
        /* os painéis de uma aba entram em cascata, um logo depois do outro */
        .rise > *{animation:rise .5s cubic-bezier(.2,.8,.2,1) both}
        .rise > *:nth-child(1){animation-delay:.02s}
        .rise > *:nth-child(2){animation-delay:.07s}
        .rise > *:nth-child(3){animation-delay:.12s}
        .rise > *:nth-child(4){animation-delay:.17s}
        .rise > *:nth-child(5){animation-delay:.22s}
        .rise > *:nth-child(n+6){animation-delay:.26s}
        .aura{position:fixed;pointer-events:none;z-index:0;border-radius:50%;filter:blur(100px);will-change:transform,opacity}
        [data-theme="light"] .aura{filter:blur(120px);opacity:.5}
        .aura-a{top:-18%;left:4%;width:56vw;height:56vw;max-width:820px;max-height:820px;
          background:radial-gradient(circle,color-mix(in srgb,var(--neon) 34%,transparent),transparent 66%);
          animation:vaga 22s ease-in-out infinite}
        .aura-b{top:2%;right:-12%;width:50vw;height:50vw;max-width:740px;max-height:740px;
          background:radial-gradient(circle,color-mix(in srgb,var(--neon2) 42%,transparent),transparent 66%);
          animation:vaga 27s ease-in-out infinite reverse}
        .aura-c{bottom:-24%;left:28%;width:60vw;height:60vw;max-width:880px;max-height:880px;
          background:radial-gradient(circle,color-mix(in srgb,var(--ok) 24%,transparent),transparent 68%);
          animation:vaga 33s ease-in-out infinite}
        .aura-d{top:34%;left:38%;width:38vw;height:38vw;max-width:520px;max-height:520px;
          background:radial-gradient(circle,color-mix(in srgb,var(--neon2) 26%,transparent),transparent 70%);
          animation:vaga 41s ease-in-out infinite reverse}
        @keyframes vaga{
          0%,100%{transform:translate3d(0,0,0) scale(1);opacity:.55}
          33%{transform:translate3d(6%,8%,0) scale(1.14);opacity:.8}
          66%{transform:translate3d(-7%,4%,0) scale(.92);opacity:.42}}
        /* brilho ao passar o cursor nos botões e painéis */
        .brilhar{transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .25s,border-color .25s,filter .25s,background .25s}
        .brilhar:hover{transform:translateY(-2px);
          border-color:color-mix(in srgb,var(--neon) 45%,transparent);
          box-shadow:0 0 26px -8px var(--neon)}
        .brilhar:active{transform:translateY(0) scale(.99)}
        /* botões de resposta acendem em neon ao passar o cursor */
        .nota{position:relative;overflow:hidden;
          transition:transform .18s cubic-bezier(.2,.8,.2,1),box-shadow .25s,background .25s,border-color .25s}
        .nota:hover{transform:translateY(-3px);
          background:color-mix(in srgb,var(--c) 22%,transparent);
          border-color:color-mix(in srgb,var(--c) 70%,transparent);
          box-shadow:0 0 30px -4px var(--c),inset 0 0 22px -14px var(--c)}
        .nota:active{transform:translateY(-1px) scale(.985)}
        .nota::after{content:"";position:absolute;inset:0;opacity:0;transition:opacity .25s;
          background:radial-gradient(60% 80% at 50% 120%,color-mix(in srgb,var(--c) 40%,transparent),transparent 70%)}
        .nota:hover::after{opacity:1}
        @keyframes pulso{0%,100%{opacity:1;box-shadow:0 0 0 0 color-mix(in srgb,var(--neon) 55%,transparent)}
          50%{opacity:.55;box-shadow:0 0 0 7px transparent}}
        .pulso{animation:pulso 3.2s ease-in-out infinite}
        /* O pontinho de quem está estudando agora, nas salas de amigos.
           Batida lenta: é para dizer "tem gente aqui", não para puxar o
           olho de quem está tentando estudar. */
        @keyframes aovivo{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.65);opacity:.4}}
        .aovivo{animation:aovivo 1.9s ease-in-out infinite}
        /* ── vidro ──────────────────────────────────────────────────────
           Um fio de luz percorre a borda de cima e o painel ganha um
           reflexo interno na diagonal, que é o que dá a sensação de
           espessura. No hover a borda acende de leve. */
        .vidro{transition:transform .35s cubic-bezier(.2,.8,.2,1),border-color .3s,box-shadow .35s}
        .vidro::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
          background:var(--vidro);opacity:.9}
        .vidro::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
          border:1px solid transparent;
          background:linear-gradient(150deg,
            color-mix(in srgb,var(--neon) 30%,transparent),
            color-mix(in srgb,var(--neon2) 16%,transparent) 30%,
            transparent 55%) border-box;
          -webkit-mask:linear-gradient(#000 0 0) padding-box,linear-gradient(#000 0 0);
          -webkit-mask-composite:xor;mask-composite:exclude;opacity:.7;transition:opacity .3s}
        .vidro:hover{border-color:var(--line2);
          box-shadow:0 0 0 1px color-mix(in srgb,var(--neon) 10%,transparent),
                     0 24px 60px -30px color-mix(in srgb,var(--neon2) 70%,transparent)}
        .vidro:hover::after{opacity:1}
        /* navegação: a aba escolhida acende e ganha um risco de luz embaixo */
        .aba{position:relative;transition:color .2s,background .22s,text-shadow .22s}
        .aba::after{content:"";position:absolute;left:22%;right:22%;bottom:2px;height:1px;
          background:currentColor;opacity:0;transition:opacity .25s;box-shadow:0 0 8px currentColor}
        .aba:hover{color:var(--ink)}
        .aba[data-on="1"]::after{opacity:.9}
        /* títulos grandes, finos e bem espaçados */
        h1,h2{text-rendering:geometricPrecision}
        ::selection{background:color-mix(in srgb,var(--neon) 35%,transparent);color:var(--ink)}
        /* o cabeçalho da marca respira devagar */
        @keyframes aceso{0%,100%{filter:drop-shadow(0 0 18px color-mix(in srgb,var(--neon2) 55%,transparent))}
          50%{filter:drop-shadow(0 0 34px color-mix(in srgb,var(--neon2) 85%,transparent))}}
        .marca{animation:aceso 5.5s ease-in-out infinite}
      `}</style>

      <Cena cor1="var(--neon)" cor2="var(--neon2)"
        chave={`${data.theme}|${aparencia.neon}|${aparencia.neon2}`} />

      {/* auras de luz que respiram, em ciano, verde e roxo */}
      <div aria-hidden="true" className="aura aura-a" />
      <div aria-hidden="true" className="aura aura-b" />
      <div aria-hidden="true" className="aura aura-c" />
      <div aria-hidden="true" className="aura aura-d" />
      <div aria-hidden="true" style={{
        position: "fixed", top: 0, left: 0, right: 0, height: 1, pointerEvents: "none", zIndex: 3,
        background: "linear-gradient(90deg, transparent, var(--neon), transparent)", opacity: 0.5,
      }} />
      {/* clarão na base, como o das referências */}
      <div aria-hidden="true" style={{
        position: "fixed", bottom: -180, left: "50%", transform: "translateX(-50%)",
        width: "120%", height: 340, pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(50% 100% at 50% 100%, color-mix(in srgb, var(--neon) 16%, transparent), transparent 70%)",
      }} />

      {avisoDisco ? (
        <div className="px-5 sm:px-8 pt-4" style={{ position: "relative", zIndex: 2 }}>
          <div className="mx-auto flex items-start gap-3 rounded-2xl px-4 py-3.5"
            style={{ maxWidth: LARGURA, background: soft("var(--warn)", 14), border: `1px solid ${soft("var(--warn)", 40)}` }}>
            <CloudOff size={17} style={{ color: T.warn, flexShrink: 0, marginTop: 2 }} />
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>Salvamento com problema</div>
              <Mini style={{ marginTop: 3, lineHeight: 1.55 }}>{avisoDisco}</Mini>
            </div>
            <button type="button" aria-label="Dispensar" onClick={() => setAvisoDisco("")}
              style={{ background: "none", border: "none", color: T.faint, cursor: "pointer", flexShrink: 0 }}><X size={15} /></button>
          </div>
        </div>
      ) : null}

      {needsOnboarding ? (
        <Onboarding nuvem={nuvem} aoLiberar={assinatura.recarregar}
          onDone={(name) => setData((p) => ({ ...p, profile: { ...p.profile, name, onboarded: true } }))}
          theme={data.theme} toggleTheme={() => setData((p) => ({ ...p, theme: p.theme === "dark" ? "light" : "dark" }))} />
      ) : (
        /* O tamanho do texto escolhido em Progresso é aplicado com zoom só
           no conteúdo: as camadas de fundo ficam de fora, porque elas são
           fixas na tela e escalar junto deslocaria as auras. */
        <div className="flex" style={{ position: "relative", zIndex: 1, alignItems: "flex-start", zoom: aparencia.tamanho !== 1 ? aparencia.tamanho : undefined }}>
          <BarraLateral abas={TABS} atual={tab} onEscolher={setTab} pro={pro}
            estreita={estreita} aberta={menuAberto} onFechar={() => setMenuAberto(false)}
            aberto={menuFixo} setAberto={setMenuFixo} />

          <div className="flex-1 min-w-0">
          <header className="px-5 sm:px-8 pt-7 pb-4">
            <div className="mx-auto" style={{ maxWidth: LARGURA }}>
              {/* Marca ao centro, saudação à esquerda e controles à direita,
                  em três colunas que se empilham no celular. */}
              {/* Marca ao centro, controles flutuando nos cantos e a
                  navegação logo abaixo, também centralizada. */}
              <div style={{ position: "relative" }}>
                <div className="flex items-center gap-3" style={{ position: "absolute", left: 0, top: 0 }}>
                  {estreita ? (
                    <button type="button" aria-label="Abrir menu" onClick={() => setMenuAberto(true)}
                      className="flex items-center justify-center rounded-full brilhar"
                      style={{ width: 38, height: 38, background: T.card, border: `1px solid ${T.line}`, color: T.ink, cursor: "pointer" }}>
                      <Menu size={17} />
                    </button>
                  ) : null}
                  <span className="hidden sm:block" style={{ marginTop: 4 }}>
                    <Mini>{greet}{firstName ? `, ${firstName}` : ""}</Mini>
                  </span>
                </div>

                <div className="flex items-center gap-2" style={{ position: "absolute", right: 0, top: 0 }}>
                  {P.running || (P.modo === "corrido" ? P.corrido > 0 : P.left !== P.total) ? (
                    <div className="flex items-center rounded-full brilhar"
                      style={{
                        background: soft(P.modo === "corrido" || P.phase === "foco" ? data.pomo.corFoco : data.pomo.corPausa, 18),
                        border: `1px solid ${T.line}`, paddingLeft: 4, paddingRight: 4,
                      }}>
                      <button type="button" aria-label={P.running ? "Pausar cronômetro" : "Retomar cronômetro"}
                        onClick={() => P.setRunning(!P.running)} className="flex items-center justify-center rounded-full"
                        style={{ width: 28, height: 28, background: "transparent", border: "none", cursor: "pointer", color: P.modo === "corrido" || P.phase === "foco" ? data.pomo.corFoco : data.pomo.corPausa }}>
                        {P.running ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                      <button type="button" onClick={() => setTab("foco")} title="Abrir o foco"
                        style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0 9px 0 2px" }}>
                        <Num size={14} weight={700} color={P.modo === "corrido" || P.phase === "foco" ? data.pomo.corFoco : data.pomo.corPausa}>
                          {P.modo === "corrido" ? fmtRelogio(P.corrido) : fmtClock(P.left)}
                        </Num>
                      </button>
                    </div>
                  ) : null}
                  {daysToExam !== null && daysToExam >= 0 ? (
                    <div className="rounded-full px-3 py-1.5 hidden sm:flex items-center gap-2" style={{ border: `1px solid ${T.line}` }}>
                      <Zap size={12} style={{ color: T.warn }} />
                      <Num size={12} weight={700}>{daysToExam}</Num>
                      <Mini style={{ fontSize: 10.5 }}>dias</Mini>
                    </div>
                  ) : null}
                  {nuvem.ligado ? (
                    <button type="button" onClick={() => setTab("progresso")}
                      aria-label={nuvem.usuario ? "Conta conectada" : "Entrar na conta"}
                      className="flex items-center justify-center brilhar"
                      style={{
                        width: 32, height: 32, borderRadius: 99, cursor: "pointer",
                        background: "transparent", border: `1px solid ${T.line}`,
                        color: nuvem.usuario ? T.ok : T.faint,
                      }}>
                      {nuvem.usuario ? <Cloud size={14} /> : <CloudOff size={14} />}
                    </button>
                  ) : null}
                  <button type="button" aria-label="Alternar tema"
                    onClick={() => setData((p) => ({ ...p, theme: p.theme === "dark" ? "light" : "dark" }))}
                    className="flex items-center justify-center brilhar"
                    style={{ width: 32, height: 32, borderRadius: 99, background: "transparent", border: `1px solid ${T.line}`, color: T.faint, cursor: "pointer" }}>
                    {data.theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                  </button>
                </div>

                {/* A marca é só a onda: o nome vem escrito logo abaixo, então
                    repetir o texto que existe dentro da logo ficaria dobrado. */}
                <button type="button" onClick={() => setTab("hoje")} aria-label="Ir para Hoje"
                  className="flex flex-col items-center mx-auto"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 0 0" }}>
                  <img src={MARCA} alt="Cadência Med" width="196" height="96" className="marca"
                    style={{ display: "block", width: "clamp(150px, 26vw, 200px)", height: "auto" }} />
                  <span style={{
                    fontFamily: F_UI, fontSize: "clamp(16px, 2.4vw, 23px)", fontWeight: 200,
                    letterSpacing: "0.34em", textTransform: "uppercase", color: T.ink,
                    marginTop: 6, paddingLeft: "0.34em", whiteSpace: "nowrap",
                    textShadow: "0 0 34px color-mix(in srgb, var(--neon) 45%, transparent)",
                  }}>Cadência <span style={{ color: "var(--neon2)", fontWeight: 400 }}>Med</span></span>
                  <span style={{
                    fontFamily: F_MONO, fontSize: 9.5, letterSpacing: "0.42em",
                    textTransform: "uppercase", color: T.ghost, marginTop: 9, paddingLeft: "0.42em",
                  }}>Residência médica</span>
                  <span style={{
                    width: 190, maxWidth: "70vw", height: 1, marginTop: 12,
                    background: "linear-gradient(90deg, transparent, var(--neon), var(--neon2), transparent)",
                    opacity: 0.8,
                  }} />
                </button>
              </div>

            </div>
          </header>

          <main className="px-5 sm:px-8 pb-16">
            <div className="mx-auto rise" style={{ maxWidth: LARGURA }} key={tab}>
              {tab === "hoje" && <Hoje {...{ data, setData, today, minToday, minWeek, qWeek, streak, late, done, bonusDone, addSession, delSession, notify, go: setTab, blocosHoje, projecao: pro ? projecao : null, pro, verPlanos: () => setTab("planos") }} />}
              {tab === "foco" && <Foco {...{ data, setData, today, P, subjectId: pomoSubject, setSubjectId: setPomoSubject }} />}
              {tab === "materias" && <Materias {...{ subjects, setMark, toggleBonus, minutes: minutesBySubject, done, bonusDone }} />}
              {tab === "temas" && !pro && <Bloqueado recurso={RECURSOS_PRO.temas} onVerPlanos={() => setTab("planos")} />}
              {tab === "rotina" && !pro && <Bloqueado recurso={RECURSOS_PRO.rotina} onVerPlanos={() => setTab("planos")} />}
              {tab === "cartoes" && !pro && <Bloqueado recurso={RECURSOS_PRO.cartoes} onVerPlanos={() => setTab("planos")} />}
              {tab === "cartoes" && pro && <Cartoes {...{ data, setData, subjects, today, notify, nuvem, souDono }} />}
              {tab === "revisoes" && !pro && <Bloqueado recurso={RECURSOS_PRO.revisoes} onVerPlanos={() => setTab("planos")} />}
              {tab === "metas" && !pro && <Bloqueado recurso={RECURSOS_PRO.metas} onVerPlanos={() => setTab("planos")} />}
              {tab === "planos" && <Precos usuario={nuvem.usuario} plano={assinatura.plano} aviso={assinatura.aviso} />}
              {tab === "temas" && pro && <Temas {...{ subjects, setMark, minutos: minutesBySubject, sessoes: data.sessions, today }} />}
              {tab === "assistente" && (souDono || pro) && (
                <div className="flex flex-col gap-5">
                  <Assistente {...{ data, setData, subjects, ladder, today, totals, minWeek, qWeek, notify, nuvem }} />
                  {/* O MEDPlanner fica junto do assistente porque é ele quem
                      usa o cronograma importado para organizar a rotina. */}
                  <Notion {...{ nuvem, subjects, data, setData, notify }} />
                </div>
              )}
              {tab === "revisoes" && pro && <Revisoes {...{ rows: ladder, toggleStep, resetCycle, data, setData, degraus, notify }} />}
              {tab === "rotina" && pro && <Rotina {...{ data, setData, gcal, today }} />}
              {tab === "amigos" && !pro && <Bloqueado recurso={RECURSOS_PRO.amigos} onVerPlanos={() => setTab("planos")} />}
              {tab === "amigos" && pro && <Amigos {...{ nuvem, notify, data, setData }} />}
              {tab === "metas" && pro && <Metas {...{ data, setData, today, qWeek, notify, ladder, gcal }} />}
              {tab === "progresso" && <Progresso {...{ data, setData, byDay, today, totals, subjects, notify, nuvem, pro, aoLiberar: assinatura.recarregar }} />}
            </div>
          </main>

          <footer className="px-6 pb-12 pt-2">
            <div className="mx-auto flex flex-col items-center gap-4" style={{ maxWidth: LARGURA }}>
              <div className="flex items-center gap-2 rounded-full p-1" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                {[["auto", "Automático", <Monitor size={14} key="d" />], ["movel", "Celular", <Smartphone size={14} key="m" />]].map(([id, lb, ic]) => (
                  <button key={id} type="button" onClick={() => setData((p) => ({ ...p, layout: id }))}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2"
                    style={{
                      background: data.layout === id ? T.card3 : "transparent", border: "none",
                      color: data.layout === id ? T.ink : T.dim, fontSize: 14,
                      fontWeight: data.layout === id ? 700 : 500, cursor: "pointer",
                    }}>{ic} {lb}</button>
                ))}
              </div>
              <button type="button" onClick={() => setShowKeys(true)} className="inline-flex items-center gap-2"
                style={{ background: "none", border: "none", color: T.faint, fontSize: 13.5, cursor: "pointer" }}>
                <Keyboard size={14} /> atalhos de teclado
              </button>
              <div style={{ width: 34, height: 1, background: T.line2 }} />
              <div className="text-center">
                <div style={{ fontSize: 14.5, fontWeight: 700, color: T.dim }}>Cadência Med</div>
                <Mini style={{ marginTop: 5, lineHeight: 1.6, maxWidth: 420 }}>
                  Ferramenta independente de organização pessoal. O conteúdo das
                  aulas é de quem você estuda; aqui ficam só as suas marcações.
                </Mini>
              </div>
            </div>
          </footer>
          </div>
        </div>
      )}

      {showKeys ? (
        <div className="fixed flex items-center justify-center px-6"
          style={{ inset: 0, background: soft("var(--bg)", 82), backdropFilter: "blur(6px)", zIndex: 70 }}
          onClick={() => setShowKeys(false)}>
          <Card className="px-7 py-6" style={{ maxWidth: 380, boxShadow: T.shadow }}>
            <H size={17}>Atalhos</H>
            <div className="mt-4 flex flex-col gap-2.5">
              {[["1 a 9", "trocar de aba"], ["espaço", "inicia e pausa o cronômetro"], ["F", "tela cheia no Foco"], ["?", "abrir e fechar esta lista"]].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4">
                  <span style={{ fontFamily: F_MONO, fontSize: 13, background: T.card2, padding: "3px 9px", borderRadius: 8, color: T.ink }}>{k}</span>
                  <Label>{v}</Label>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed left-1/2 bottom-7 rounded-full px-5 py-3"
          style={{ transform: "translateX(-50%)", background: T.card3, border: `1px solid ${T.line}`, color: T.ink, fontSize: 14.5, zIndex: 80, boxShadow: T.shadow, maxWidth: "90vw" }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
