/* ═══════════════════════════════════════════════════════════════════
   46 · PAINEL DE MOTIVAÇÃO

   Para os dias em que estudar pesa. Uma entrevista curta com a IA (uma
   pergunta por vez: por que medicina, por quem, a fé se a pessoa tiver,
   o sonho, o que já superou, o que dá medo, o que a faz voltar) vira um
   painel de cartões com os motivos DELA, nas palavras dela, por
   categoria: propósito, pessoas, fé, metas, futuro, conquistas,
   lembretes para os medos e frases.

   "Preciso de motivação agora": a pessoa diz como está (cansada,
   ansiosa, culpada...) e a IA responde como quem a conhece, com um ou dois
   motivos do painel e UMA ação pequena para já (um bloco no Foco, uma
   rodada de cartões, ou descansar de verdade). Os cartões dela passam
   embaixo, um de cada vez, com transição.

   Tudo em data.motivacao, que é pequeno e vai junto com a conta. No Hoje,
   um cartão do painel por dia ("Lembra por quê").
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_MOTIVACAO = "/api/motivacao-ia";
const MAX_PERGUNTAS_MOTIVACAO = 10;

const CATEGORIAS_MOTIVACAO = {
  proposito: { nome: "Propósito", cor: "#8E6BE0" },
  pessoas: { nome: "Pessoas", cor: "#E0598B" },
  fe: { nome: "Fé", cor: "#D4A017" },
  metas: { nome: "Metas", cor: "#2F86D6" },
  futuro: { nome: "Seu futuro", cor: "#0E9384" },
  conquistas: { nome: "Você já venceu", cor: "#2E9E5B" },
  lembrete: { nome: "Para os dias ruins", cor: "#E08A2E" },
  frase: { nome: "Para guardar", cor: "#6B7280" },
  meu: { nome: "Meus motivos", cor: "var(--neon)" },
};

const HUMORES_MOTIVACAO = [
  ["cansado", "Cansado", "😮‍💨"], ["desanimado", "Desanimado", "😞"], ["ansioso", "Ansioso", "😰"],
  ["medo", "Com medo de não passar", "😟"], ["sem-foco", "Sem foco", "🌀"], ["culpado", "Culpado por ter parado", "😔"],
  ["sobrecarregado", "Sobrecarregado", "🥵"], ["comparando", "Me comparando com os outros", "👀"],
];

function limparMotivacao(v) {
  const m = v && typeof v === "object" ? v : {};
  const lim = (x, n) => String(x == null ? "" : x).slice(0, n);
  const cats = Object.keys(CATEGORIAS_MOTIVACAO);
  const painel = m.painel && typeof m.painel === "object" ? m.painel : null;
  return {
    entrevista: (Array.isArray(m.entrevista) ? m.entrevista : []).slice(0, MAX_PERGUNTAS_MOTIVACAO + 2)
      .map((x) => ({ p: lim(x && x.p, 400), r: lim(x && x.r, 1500), pulou: !!(x && x.pulou) }))
      .filter((x) => x.p),
    painel: painel ? {
      resumo: lim(painel.resumo, 240),
      em: Number(painel.em) || 0,
      cartoes: (Array.isArray(painel.cartoes) ? painel.cartoes : []).slice(0, 24).map((c) => ({
        id: lim(c && c.id, 30) || uid(),
        categoria: cats.indexOf(c && c.categoria) >= 0 ? c.categoria : "proposito",
        titulo: lim(c && c.titulo, 70),
        texto: lim(c && c.texto, 420),
        emoji: lim(c && c.emoji, 8),
        fav: !!(c && c.fav),
      })).filter((c) => c.texto),
    } : null,
    meus: (Array.isArray(m.meus) ? m.meus : []).slice(0, 30)
      .map((c) => ({ id: lim(c && c.id, 30) || uid(), texto: lim(c && c.texto, 420), fav: !!(c && c.fav) }))
      .filter((c) => c.texto),
  };
}

async function falarComMotivacao(nuvem, corpo) {
  const token = await pegarTokenDaConta(nuvem);
  if (!token) return { erro: "Entre na sua conta para usar o painel de motivação." };
  const { dados, erro } = await chamarApi(ROTA_MOTIVACAO, { ...corpo, token }, "O painel de motivação");
  return erro ? { erro } : (dados || {});
}

/* todos os cartões: os da IA e os que a pessoa escreveu */
function cartoesDaMotivacao(mot) {
  const daIA = (mot.painel && mot.painel.cartoes) || [];
  const meus = (mot.meus || []).map((c) => ({ ...c, categoria: "meu", titulo: "", emoji: "💜" }));
  return [...daIA, ...meus];
}

/* o momento nos estudos, para a IA falar com o dia de hoje na mão */
function momentoDosEstudos(data, today) {
  const sess = data.sessions || [];
  const minutosHoje = sess.filter((s) => s && s.date === today).reduce((t, s) => t + (Number(s.minutes) || 0), 0);
  const dias = new Set(sess.map((s) => s && s.date));
  let seguidos = 0;
  const d = new Date(`${today}T12:00:00`);
  if (!dias.has(today)) d.setDate(d.getDate() - 1);
  while (dias.has(toISO(d)) && seguidos < 400) { seguidos += 1; d.setDate(d.getDate() - 1); }
  const prova = data.profile && data.profile.examDate;
  const diasParaProva = prova ? Math.round((new Date(`${prova}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000) : null;
  return { minutosHoje, diasSeguidos: seguidos, diasParaProva: diasParaProva != null && diasParaProva >= 0 ? diasParaProva : null };
}

/* ── a aba ───────────────────────────────────────────────────────────── */
function Motivacao({ data, setData, nuvem, notify, today, irPara }) {
  const mot = limparMotivacao(data.motivacao);
  const [entrevistando, setEntrevistando] = useState(false);
  const [agora, setAgora] = useState(false);
  const mudar = useCallback((f) => setData((p) => ({ ...p, motivacao: f(limparMotivacao(p.motivacao)) })), [setData]);

  if (entrevistando || (!mot.painel && mot.entrevista.length)) {
    return <EntrevistaMotivacao mot={mot} mudar={mudar} nuvem={nuvem} notify={notify} nome={(data.profile && (data.profile.apelido || data.profile.name)) || ""}
      onPronto={() => setEntrevistando(false)} onCancelar={mot.painel ? () => setEntrevistando(false) : null} />;
  }
  if (!mot.painel) {
    return (
      <Card className="px-6 sm:px-8 py-8">
        <div data-teste="motivacao-inicio" className="flex flex-col items-center" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 54, lineHeight: 1 }}>🔥</div>
          <div style={{ fontSize: 23, fontWeight: 800, color: T.ink, marginTop: 14 }}>O que te move?</div>
          <div style={{ fontSize: 15.5, lineHeight: 1.6, color: T.dim, marginTop: 8, maxWidth: 560 }}>
            Uma conversa rápida para descobrir os seus motivos: por que medicina, por quem você estuda, a sua fé se você quiser contar,
            o seu sonho e o que você já venceu. No fim, um painel só seu, para abrir nos dias em que estudar pesa.
          </div>
          <button type="button" onClick={() => setEntrevistando(true)} data-teste="motivacao-comecar"
            className="btn-neon" style={{ marginTop: 20, display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", borderRadius: 99, fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>
            <MessageCircle size={16} /> Começar a conversa
          </button>
          <Mini style={{ marginTop: 10 }}>uns 5 minutos · dá para pular qualquer pergunta</Mini>
        </div>
      </Card>
    );
  }
  return (
    <>
      <PainelMotivacao mot={mot} mudar={mudar} onAgora={() => setAgora(true)} onRefazer={() => setEntrevistando(true)} />
      {agora ? (
        <AgoraMotivacao mot={mot} data={data} today={today} nuvem={nuvem} notify={notify}
          onFechar={() => setAgora(false)} irPara={(aba) => { setAgora(false); if (irPara) irPara(aba); }} />
      ) : null}
    </>
  );
}

/* ── a entrevista ───────────────────────────────────────────────────── */
function EntrevistaMotivacao({ mot, mudar, nuvem, notify, nome, onPronto, onCancelar }) {
  const [atual, setAtual] = useState(null);       // { pergunta, sugestoes, fim }
  const [resposta, setResposta] = useState("");
  const [ocupado, setOcupado] = useState("");
  const fim = useRef(null);
  const ent = mot.entrevista;

  const perguntar = useCallback(async (lista) => {
    setOcupado("pensando na próxima pergunta…");
    const r = await falarComMotivacao(nuvem, { acao: "pergunta", entrevista: lista, nome });
    setOcupado("");
    if (r.erro) { notify(r.erro); return; }
    setAtual({ pergunta: r.pergunta, sugestoes: r.sugestoes || [], fim: !!r.fim });
  }, [nuvem, nome, notify]);

  useEffect(() => { if (!atual && !ocupado) perguntar(ent); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (fim.current && fim.current.scrollIntoView) fim.current.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [ent.length, atual]);

  const montar = useCallback(async (lista) => {
    setOcupado("montando o seu painel…");
    const r = await falarComMotivacao(nuvem, { acao: "painel", entrevista: lista, nome });
    setOcupado("");
    if (r.erro) { notify(r.erro); return; }
    mudar((m) => ({
      ...m, entrevista: lista,
      painel: {
        resumo: r.resumo, em: Date.now(),
        /* o que a pessoa marcou como favorito no painel anterior não some */
        cartoes: r.cartoes.map((c) => ({ ...c, id: uid(), fav: false })),
      },
    }));
    notify("Seu painel está pronto.");
    onPronto();
  }, [nuvem, nome, notify, mudar, onPronto]);

  const responder = async (pulou) => {
    if (!atual || atual.fim) return;
    const texto = resposta.trim();
    if (!pulou && !texto) { notify("Escreva a sua resposta, ou toque em Pular."); return; }
    const lista = [...ent, { p: atual.pergunta, r: pulou ? "" : texto, pulou: !!pulou }];
    mudar((m) => ({ ...m, entrevista: lista }));
    setResposta(""); setAtual(null);
    if (lista.length >= MAX_PERGUNTAS_MOTIVACAO) { await montar(lista); return; }
    await perguntar(lista);
  };

  const respondidas = ent.filter((x) => x.r && !x.pulou).length;
  return (
    <div className="flex flex-col gap-4" data-teste="motivacao-entrevista">
      <style>{ESTILO_ESTUDO}</style>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--neon)" }}>Conversa sobre o que te move</div>
          <div style={{ fontSize: 14, color: T.faint, marginTop: 2 }}>pergunta {Math.min(ent.length + 1, MAX_PERGUNTAS_MOTIVACAO)} de até {MAX_PERGUNTAS_MOTIVACAO}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {respondidas >= 3 && !ocupado ? <Btn size="sm" tone="outline" onClick={() => montar(ent)}><Sparkles size={14} /> Montar meu painel já</Btn> : null}
          {onCancelar && !ocupado ? <Btn size="sm" tone="outline" onClick={onCancelar}>Voltar ao painel</Btn> : null}
        </div>
      </div>

      <Card className="px-5 sm:px-6 py-5">
        <div className="flex flex-col gap-3">
          {ent.map((x, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div style={{ alignSelf: "flex-start", maxWidth: "88%", padding: "10px 14px", borderRadius: "16px 16px 16px 4px", background: T.card2, color: T.ink, fontSize: 15, lineHeight: 1.5 }}>{x.p}</div>
              <div style={{ alignSelf: "flex-end", maxWidth: "88%", padding: "10px 14px", borderRadius: "16px 16px 4px 16px", background: soft("var(--neon)", x.pulou ? 6 : 16), color: x.pulou ? T.faint : T.ink, fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-line", fontStyle: x.pulou ? "italic" : "normal" }}>
                {x.pulou ? "preferi pular" : x.r}
              </div>
            </div>
          ))}
          {atual ? (
            <div data-estudo-anima="1" style={{ ...anima("estudoSobe"), alignSelf: "flex-start", maxWidth: "92%", padding: "12px 16px", borderRadius: "16px 16px 16px 4px", background: soft("var(--neon)", 8), border: `1px solid ${soft("var(--neon)", 35)}`, color: T.ink, fontSize: 16.5, fontWeight: 600, lineHeight: 1.5 }}
              data-teste="motivacao-pergunta">
              {atual.pergunta}
            </div>
          ) : null}
          {ocupado ? <Mini style={{ color: T.dim }} data-teste="motivacao-ocupado">{ocupado}</Mini> : null}
          {!atual && !ocupado ? (
            <div>
              <Btn size="sm" onClick={() => perguntar(ent)}><RefreshCw size={14} /> Tentar de novo</Btn>
            </div>
          ) : null}
          <div ref={fim} />
        </div>

        {atual && !atual.fim ? (
          <div style={{ marginTop: 14 }}>
            {atual.sugestoes.length ? (
              <div className="flex flex-wrap gap-2" style={{ marginBottom: 10 }}>
                {atual.sugestoes.map((s, i) => (
                  <button key={i} type="button" onClick={() => setResposta((r) => (r ? `${r} ${s}` : s))}
                    style={{ padding: "6px 12px", borderRadius: 99, border: `1px solid ${T.line}`, background: T.card2, color: T.dim, fontSize: 13.5, cursor: "pointer" }}>{s}</button>
                ))}
              </div>
            ) : null}
            <textarea value={resposta} onChange={(e) => setResposta(e.target.value)} rows={3} data-teste="motivacao-resposta"
              placeholder="Escreva do seu jeito. Quanto mais você contar, mais seu fica o painel."
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) responder(false); }}
              style={{ ...inp, fontSize: 15.5, lineHeight: 1.55, resize: "vertical" }} />
            <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 10 }}>
              <button type="button" onClick={() => responder(false)} disabled={!!ocupado} data-teste="motivacao-responder"
                className="btn-neon" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 99, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                <Send size={15} /> Responder
              </button>
              <Btn size="sm" tone="outline" onClick={() => responder(true)} disabled={!!ocupado}>Pular</Btn>
            </div>
          </div>
        ) : null}
        {atual && atual.fim ? (
          <div style={{ marginTop: 14 }}>
            <button type="button" onClick={() => montar(ent)} disabled={!!ocupado} data-teste="motivacao-montar"
              className="btn-neon" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 99, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              <Sparkles size={15} /> Montar meu painel
            </button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

/* ── o painel ───────────────────────────────────────────────────────── */
function CartaoMotivo({ c, onFav, onApagar }) {
  const cat = CATEGORIAS_MOTIVACAO[c.categoria] || CATEGORIAS_MOTIVACAO.proposito;
  return (
    <div data-teste="motivacao-cartao" data-categoria={c.categoria}
      style={{ position: "relative", background: T.card, border: `1px solid ${T.line}`, borderRadius: 20, padding: "16px 16px 14px", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: cat.cor }} />
      <div className="flex items-start justify-between gap-2">
        <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: cat.cor }}>{cat.nome}</span>
        <div className="flex items-center gap-1">
          {onFav ? (
            <button type="button" onClick={onFav} aria-label={c.fav ? "Tirar dos favoritos" : "Favoritar"} aria-pressed={c.fav ? "true" : "false"}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: c.fav ? "#E0598B" : T.faint, fontSize: 16, lineHeight: 1 }}>{c.fav ? "♥" : "♡"}</button>
          ) : null}
          {onApagar ? (
            <button type="button" onClick={onApagar} aria-label="Apagar" style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: T.faint }}><X size={14} /></button>
          ) : null}
        </div>
      </div>
      <div className="flex items-start gap-3" style={{ marginTop: 8 }}>
        {c.emoji ? <span style={{ fontSize: 28, lineHeight: 1 }}>{c.emoji}</span> : null}
        <div style={{ minWidth: 0 }}>
          {c.titulo ? <div style={{ fontSize: 16.5, fontWeight: 800, color: T.ink, lineHeight: 1.3 }}>{c.titulo}</div> : null}
          <div style={{ fontSize: 15, lineHeight: 1.6, color: T.dim, marginTop: c.titulo ? 4 : 0, whiteSpace: "pre-line" }}>{c.texto}</div>
        </div>
      </div>
    </div>
  );
}

function PainelMotivacao({ mot, mudar, onAgora, onRefazer }) {
  const [filtro, setFiltro] = useState("todos");
  const [novo, setNovo] = useState("");
  const todos = cartoesDaMotivacao(mot);
  const presentes = Object.keys(CATEGORIAS_MOTIVACAO).filter((k) => todos.some((c) => c.categoria === k));
  const mostrar = filtro === "todos" ? [...todos].sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0))
    : filtro === "fav" ? todos.filter((c) => c.fav) : todos.filter((c) => c.categoria === filtro);

  const alternarFav = (c) => mudar((m) => (c.categoria === "meu"
    ? { ...m, meus: m.meus.map((x) => (x.id === c.id ? { ...x, fav: !x.fav } : x)) }
    : { ...m, painel: { ...m.painel, cartoes: m.painel.cartoes.map((x) => (x.id === c.id ? { ...x, fav: !x.fav } : x)) } }));
  const adicionar = () => {
    const t = novo.trim();
    if (!t) return;
    mudar((m) => ({ ...m, meus: [{ id: uid(), texto: t, fav: false }, ...m.meus].slice(0, 30) }));
    setNovo("");
  };

  return (
    <div className="flex flex-col gap-5" data-teste="motivacao-painel">
      <div style={{ borderRadius: 24, padding: "24px 22px", background: `linear-gradient(135deg, ${soft("var(--neon)", 18)}, ${soft("var(--neon2)", 12)})`, border: `1px solid ${soft("var(--neon)", 35)}` }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--neon)" }}>Por que você está aqui</div>
        <div style={{ fontSize: 21, fontWeight: 800, color: T.ink, marginTop: 6, lineHeight: 1.35 }} data-teste="motivacao-resumo">{mot.painel.resumo || "Os seus motivos, para os dias difíceis."}</div>
        <div className="flex flex-wrap gap-3" style={{ marginTop: 18 }}>
          <button type="button" onClick={onAgora} data-teste="motivacao-agora"
            className="btn-neon" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 22px", borderRadius: 99, fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
            <Flame size={17} /> Preciso de motivação agora
          </button>
          <Btn tone="outline" onClick={onRefazer}><RefreshCw size={14} /> Conversar de novo</Btn>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" data-teste="motivacao-filtros">
        {[["todos", "Todos"], ["fav", "♥ Favoritos"], ...presentes.map((k) => [k, CATEGORIAS_MOTIVACAO[k].nome])].map(([k, nome]) => (
          <button key={k} type="button" onClick={() => setFiltro(k)} aria-pressed={filtro === k ? "true" : "false"}
            style={{ padding: "7px 14px", borderRadius: 99, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${filtro === k ? "var(--neon)" : T.line}`, background: filtro === k ? soft("var(--neon)", 14) : "transparent", color: filtro === k ? T.ink : T.dim }}>{nome}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {mostrar.map((c) => (
          <CartaoMotivo key={c.id} c={c} onFav={() => alternarFav(c)}
            onApagar={c.categoria === "meu" ? () => mudar((m) => ({ ...m, meus: m.meus.filter((x) => x.id !== c.id) })) : null} />
        ))}
      </div>
      {!mostrar.length ? <Mini>{filtro === "fav" ? "Toque no coração dos cartões que mais falam com você." : "Nada nesta categoria."}</Mini> : null}

      <Card className="px-5 py-5">
        <Label>Acrescentar um motivo seu</Label>
        <div className="flex gap-2 flex-wrap" style={{ marginTop: 10 }}>
          <input value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }}
            placeholder="Ex.: Meu pai vai me ver de jaleco no HC." data-teste="motivacao-novo"
            style={{ ...inp, flex: 1, minWidth: 220 }} />
          <Btn onClick={adicionar} disabled={!novo.trim()}><Plus size={15} /> Acrescentar</Btn>
        </div>
      </Card>
    </div>
  );
}

/* ── preciso de motivação agora ─────────────────────────────────────── */
function AgoraMotivacao({ mot, data, today, nuvem, notify, onFechar, irPara }) {
  const [humor, setHumor] = useState("");
  const [texto, setTexto] = useState("");
  const [resposta, setResposta] = useState(null);
  const [pensando, setPensando] = useState(false);
  const cartoes = cartoesDaMotivacao(mot);
  const ordem = useMemo(() => {
    const favs = cartoes.filter((c) => c.fav), resto = cartoes.filter((c) => !c.fav);
    const emb = (l) => l.map((c) => [Math.random(), c]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    return [...emb(favs), ...emb(resto)];
  }, [mot.painel && mot.painel.em, cartoes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const c = ordem.length ? ordem[((i % ordem.length) + ordem.length) % ordem.length] : null;

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onFechar();
      const el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") { setDir(1); setI((n) => n + 1); }
      if (e.key === "ArrowLeft") { setDir(-1); setI((n) => n - 1); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onFechar]);

  const pedir = async () => {
    if (!humor && !texto.trim()) { notify("Escolha como você está, ou escreva."); return; }
    setPensando(true);
    const r = await falarComMotivacao(nuvem, {
      acao: "agora", humor, texto: texto.trim(),
      nome: (data.profile && (data.profile.apelido || data.profile.name)) || "",
      resumo: mot.painel && mot.painel.resumo,
      cartoes: cartoes.map((x) => ({ categoria: x.categoria === "meu" ? "proposito" : x.categoria, titulo: x.titulo, texto: x.texto })),
      momento: momentoDosEstudos(data, today),
    });
    setPensando(false);
    if (r.erro) { notify(r.erro); return; }
    setResposta(r);
  };

  const ROTULO_ACAO = { foco: ["Começar um bloco no Foco", "foco"], revisoes: ["Ir para as revisões", "revisoes"], cartoes: ["Fazer uma rodada de cartões", "cartoes"] };
  return createPortal((
    <div role="dialog" aria-label="Motivação agora" data-teste="motivacao-agora-tela" className="fixed"
      style={{ inset: 0, zIndex: 95, background: T.bg, overflowY: "auto", padding: "calc(2.5vh + env(safe-area-inset-top, 0px)) 4vw 4vh" }}>
      <style>{ESTILO_ESTUDO}</style>
      <div style={{ maxWidth: 820, margin: "0 auto" }} className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--neon)" }}>Respira. Você não está sozinho.</div>
          <button type="button" onClick={onFechar} aria-label="Fechar" data-teste="motivacao-fechar"
            style={{ width: 40, height: 40, borderRadius: 99, border: `1px solid ${T.line}`, background: T.card2, color: T.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={18} /></button>
        </div>

        {!resposta ? (
          <div data-estudo-anima="1" style={{ ...anima("estudoSobe") }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: T.ink }}>Como você está agora?</div>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 14 }}>
              {HUMORES_MOTIVACAO.map(([id, nome, emoji]) => (
                <button key={id} type="button" onClick={() => setHumor(humor === id ? "" : id)} data-teste="motivacao-humor" aria-pressed={humor === id ? "true" : "false"}
                  style={{ padding: "10px 15px", borderRadius: 99, fontSize: 15, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${humor === id ? "var(--neon)" : T.line}`, background: humor === id ? soft("var(--neon)", 16) : T.card, color: T.ink }}>{emoji} {nome}</button>
              ))}
            </div>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} data-teste="motivacao-desabafo"
              placeholder="Se quiser, desabafa: o que aconteceu, o que está pesando…"
              style={{ ...inp, marginTop: 14, fontSize: 15.5, lineHeight: 1.55, resize: "vertical" }} />
            <button type="button" onClick={pedir} disabled={pensando} data-teste="motivacao-pedir"
              className="btn-neon" style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", borderRadius: 99, fontWeight: 700, fontSize: 15.5, cursor: pensando ? "default" : "pointer", opacity: pensando ? 0.7 : 1 }}>
              <Sparkles size={16} /> {pensando ? "Pensando em você…" : "Fala comigo"}
            </button>
          </div>
        ) : (
          <div data-estudo-anima="1" data-teste="motivacao-mensagem" style={{ ...anima("estudoSobe"), padding: "22px 22px", borderRadius: 24, background: T.card, border: `1px solid ${soft("var(--neon)", 40)}` }}>
            <div style={{ fontSize: 18, lineHeight: 1.7, color: T.ink, whiteSpace: "pre-line" }}>{resposta.mensagem}</div>
            {resposta.apoio ? (
              <div data-teste="motivacao-apoio" style={{ marginTop: 14, padding: "12px 14px", borderRadius: 14, background: soft("var(--bad)", 10), border: `1px solid ${soft("var(--bad)", 40)}`, fontSize: 15, lineHeight: 1.55, color: T.ink }}>
                Se estiver pesado demais, fala com alguém agora: o <b>CVV atende pelo 188</b>, 24 horas e de graça, ou em cvv.org.br. E chama alguém de confiança.
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2" style={{ marginTop: 16 }}>
              {ROTULO_ACAO[resposta.acao] ? (
                <button type="button" onClick={() => irPara(ROTULO_ACAO[resposta.acao][1])} data-teste="motivacao-acao"
                  className="btn-neon" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 99, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  <Play size={15} /> {ROTULO_ACAO[resposta.acao][0]}
                </button>
              ) : null}
              <Btn tone="outline" onClick={() => setResposta(null)}>Falar de novo</Btn>
            </div>
            {resposta.acaoTexto ? <div style={{ fontSize: 14.5, color: T.dim, marginTop: 10 }}>{resposta.acaoTexto}</div> : null}
          </div>
        )}

        {c ? (
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <Label>Os seus motivos</Label>
              <Mini>{(((i % ordem.length) + ordem.length) % ordem.length) + 1}/{ordem.length}</Mini>
            </div>
            <div key={i} data-estudo-anima="1" style={{ ...anima(dir >= 0 ? "estudoEntraDir" : "estudoEntraEsq", 0, 0.45) }}>
              <CartaoMotivo c={c} />
            </div>
            <div className="flex gap-2" style={{ marginTop: 12 }}>
              <button type="button" onClick={() => { setDir(-1); setI((n) => n - 1); }} aria-label="Motivo anterior"
                style={{ width: 44, height: 44, borderRadius: 99, border: `1px solid ${T.line}`, background: T.card2, color: T.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={18} /></button>
              <button type="button" onClick={() => { setDir(1); setI((n) => n + 1); }} data-teste="motivacao-proximo"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 18px", height: 44, borderRadius: 99, border: `1px solid ${T.line}`, background: T.card2, color: T.ink, fontWeight: 600, cursor: "pointer" }}>
                Outro motivo <ChevronRight size={16} />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  ), document.body);
}

/* ── no Hoje: um motivo por dia ─────────────────────────────────────── */
function MotivoDoDia({ data, today, go }) {
  const mot = limparMotivacao(data.motivacao);
  const cartoes = cartoesDaMotivacao(mot);
  if (!cartoes.length) return null;
  const n = Math.floor(new Date(`${today}T12:00:00`).getTime() / 86400000);
  const c = cartoes[((n % cartoes.length) + cartoes.length) % cartoes.length];
  const cat = CATEGORIAS_MOTIVACAO[c.categoria] || CATEGORIAS_MOTIVACAO.proposito;
  return (
    <button type="button" onClick={() => go && go("motivacao")} data-teste="motivo-do-dia"
      style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 18, cursor: "pointer",
        background: soft(cat.cor, 9), border: `1px solid ${soft(cat.cor, 35)}`, color: T.ink }}>
      <span style={{ fontSize: 28, lineHeight: 1 }}>{c.emoji || "🔥"}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 11.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: cat.cor }}>Lembra por quê</span>
        <span style={{ display: "block", fontSize: 15, lineHeight: 1.5, marginTop: 2 }}>{c.titulo ? <b>{c.titulo}. </b> : null}{c.texto}</span>
      </span>
      <ChevronRight size={16} style={{ color: T.faint, flexShrink: 0 }} />
    </button>
  );
}
