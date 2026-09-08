/* ═══════════════════════════════════════════════════════════════════
   8 · ROTINA (agenda da semana e do dia)

   Duas vistas sobre os mesmos blocos: a semana inteira numa linha do
   tempo, para enxergar onde sobra espaço, e um dia por vez em cartões,
   que é como se usa na hora de estudar.

   Um bloco vem de dois lugares. Os de data.routine se repetem toda
   semana; os de data.agenda valem só naquela data. Marcar um como
   cumprido grava em data.blocos com a data junto, porque "terça de manhã"
   é um compromisso diferente em cada terça.
   ═══════════════════════════════════════════════════════════════════ */

const H0 = 6, H1 = 24, PXH = 46;

/* Que horas são, em minutos desde a meia-noite, para a linha do agora e
   para saber qual bloco está acontecendo. Anda de meio em meio minuto: o
   traço desce sozinho sem obrigar a recarregar a página. */
function useAgora() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return { data: toISO(agora), minutos: agora.getHours() * 60 + agora.getMinutes() };
}

const chaveBloco = (b, iso) => `${b.id}|${iso}`;

/* O estado de um bloco num dia: já passou, está acontecendo ou ainda vem.
   "feito" ganha de tudo, porque é o que a pessoa marcou à mão. */
function estadoBloco(b, iso, feito, hoje, minutosAgora) {
  if (feito) return "feito";
  if (iso < hoje) return "passou";
  if (iso > hoje) return "futuro";
  if (minutosAgora >= b.fim) return "passou";
  if (minutosAgora >= b.ini) return "agora";
  return "futuro";
}

const CORES_ESTADO = {
  feito: "var(--ok)", agora: "var(--neon)", passou: "var(--faint)", futuro: null,
};

function Etiqueta({ cor, children, forte }) {
  return (
    <span className="inline-flex items-center rounded-full"
      style={{
        padding: "2px 9px", fontSize: 11.5, fontWeight: 700,
        letterSpacing: "0.02em", whiteSpace: "nowrap",
        background: soft(cor, forte ? 22 : 14), color: cor,
      }}>{children}</span>
  );
}

/* Um bloco do dia, em cartão. É onde se marca o que foi cumprido. */
function CartaoBloco({ b, iso, estado, onAlternar, onRemover, minutosAgora }) {
  const cor = BLOCKS[b.type] || T.faint;
  const dur = b.fim - b.ini;
  const feito = estado === "feito";
  const agora = estado === "agora";
  /* Quanto do bloco já correu, para a barra andar durante o estudo. */
  const andamento = agora ? Math.min(100, Math.max(0, ((minutosAgora - b.ini) / dur) * 100)) : 0;

  return (
    <div className="rounded-2xl px-4 py-4 brilhar"
      style={{
        background: agora ? soft("var(--neon)", 9) : T.card2,
        border: `1px solid ${agora ? soft("var(--neon)", 38) : "transparent"}`,
        borderLeft: `3px ${b.fixo ? "solid" : "dashed"} ${cor}`,
        opacity: feito || estado === "passou" ? 0.72 : 1,
      }}>
      <div className="flex items-start gap-3">
        <Tick on={feito} color={cor} size={22}
          label={feito ? "Desmarcar bloco" : "Marcar como cumprido"}
          onClick={() => onAlternar(chaveBloco(b, iso))} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
            <span style={{
              fontSize: 15.5, fontWeight: 600, lineHeight: 1.3,
              color: feito ? T.dim : T.ink,
              textDecoration: feito ? "line-through" : "none",
            }}>{b.label}</span>
            <Etiqueta cor={cor}>{b.type}</Etiqueta>
            {agora ? <Etiqueta cor="var(--neon)" forte>agora</Etiqueta> : null}
            {feito ? <Etiqueta cor="var(--ok)">cumprido</Etiqueta> : null}
          </div>

          <Mini style={{ marginTop: 5, fontFamily: F_MONO }}>
            {b.start}–{b.end} · {fmtMin(dur)}
            {b.fixo ? " · toda semana" : " · só nesta data"}
          </Mini>

          {agora ? (
            <div style={{ marginTop: 10, maxWidth: 260 }}>
              <Track pct={andamento} color="var(--neon)" height={4} />
              <Mini style={{ marginTop: 5 }}>
                faltam {fmtMin(b.fim - minutosAgora)} para terminar
              </Mini>
            </div>
          ) : null}
        </div>

        <button type="button" aria-label="Remover bloco" onClick={() => onRemover(b)}
          style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer", padding: 4, flexShrink: 0 }}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/* Distribui blocos que se cruzam em colunas lado a lado, como o Google
   Agenda faz. Sem isso um bloco cobre o outro e o texto some. */
function distribuir(blocos) {
  const itens = blocos
    .map((b) => ({ ...b, ini: toMin(b.start), fim: Math.max(toMin(b.end), toMin(b.start) + 20) }))
    .sort((a, b) => a.ini - b.ini || b.fim - a.fim);

  const saida = [];
  let grupo = [], fimGrupo = -1;

  const fecharGrupo = () => {
    if (!grupo.length) return;
    const colunas = [];                       // fim ocupado de cada coluna
    for (const it of grupo) {
      let c = 0;
      while (c < colunas.length && colunas[c] > it.ini) c += 1;
      colunas[c] = it.fim;
      it.col = c;
    }
    const total = colunas.length;
    for (const it of grupo) saida.push({ ...it, col: it.col, colunas: total });
    grupo = []; fimGrupo = -1;
  };

  for (const it of itens) {
    if (grupo.length && it.ini >= fimGrupo) fecharGrupo();
    grupo.push(it);
    fimGrupo = Math.max(fimGrupo, it.fim);
  }
  fecharGrupo();
  return saida;
}

function Rotina({ data, setData, gcal, today }) {
  const [semana, setSemana] = useState(() => weekStart(today));
  const [vista, setVista] = useState("dia");
  const [escolhido, setEscolhido] = useState(() => (fromISO(today).getDay() + 6) % 7);
  const [nb, setNb] = useState({ day: "0", label: "", type: BLOCK_IDS[0], start: "07:00", end: "12:00", repete: true });
  const [novo, setNovo] = useState(false);
  const [err, setErr] = useState("");
  const agora = useAgora();

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(semana, i)), [semana]);
  const ehSemanaAtual = semana === weekStart(today);
  const isoEscolhido = dias[escolhido] || dias[0];

  /* Ao trocar de semana o dia escolhido continua o mesmo da semana: pular
     para segunda-feira toda vez faria perder o lugar. */
  const irPara = (delta) => setSemana((s) => addDays(s, delta * 7));

  const porDia = useMemo(() => {
    const bruto = dias.map(() => []);
    for (const b of data.routine || []) {
      const i = Number(b.day) || 0;
      if (bruto[i]) bruto[i].push({ ...b, fixo: true });
    }
    for (const b of data.agenda || []) {
      const i = dias.indexOf(b.date);
      if (i >= 0) bruto[i].push({ ...b, fixo: false });
    }
    return bruto.map(distribuir);
  }, [data.routine, data.agenda, dias]);

  const feitos = data.blocos || {};
  const alternar = (chave) => setData((p) => {
    const m = { ...(p.blocos || {}) };
    if (m[chave]) delete m[chave]; else m[chave] = Date.now();
    return { ...p, blocos: m };
  });

  /* Quanto do dia escolhido já foi cumprido, em minutos de bloco. */
  const doDia = useMemo(
    () => [...(porDia[escolhido] || [])].sort((a, b) => a.ini - b.ini),
    [porDia, escolhido]);

  const resumoDia = useMemo(() => {
    let total = 0, cumprido = 0, estudo = 0;
    for (const b of doDia) {
      const dur = b.fim - b.ini;
      total += dur;
      if (feitos[chaveBloco(b, isoEscolhido)]) cumprido += dur;
      if (b.type === "Estudo" || b.type === "Questões" || b.type === "Aula") estudo += dur;
    }
    return { total, cumprido, estudo, pct: total ? (cumprido / total) * 100 : 0 };
  }, [doDia, feitos, isoEscolhido]);

  const emAndamento = doDia.find(
    (b) => estadoBloco(b, isoEscolhido, feitos[chaveBloco(b, isoEscolhido)], agora.data, agora.minutos) === "agora");

  const add = () => {
    if (!nb.label.trim()) return setErr("Dê um nome ao bloco.");
    if (toMin(nb.end) <= toMin(nb.start)) return setErr("O fim precisa vir depois do início.");
    setErr("");
    const base = { id: uid(), label: nb.label.trim(), type: nb.type, start: nb.start, end: nb.end };
    setData((p) => (nb.repete
      ? { ...p, routine: [...p.routine, { ...base, day: Number(nb.day) }] }
      : { ...p, agenda: [...(p.agenda || []), { ...base, date: dias[Number(nb.day)] }] }));
    setNb((p) => ({ ...p, label: "" }));
    setEscolhido(Number(nb.day));
  };

  /* Apagar o bloco sem apagar as marcas deixaria lixo crescendo em
     data.blocos a cada bloco removido. */
  const remover = (b) => setData((p) => {
    const m = { ...(p.blocos || {}) };
    for (const k of Object.keys(m)) if (k.split("|")[0] === b.id) delete m[k];
    return b.fixo
      ? { ...p, blocos: m, routine: p.routine.filter((x) => x.id !== b.id) }
      : { ...p, blocos: m, agenda: (p.agenda || []).filter((x) => x.id !== b.id) };
  });

  const limparSemana = () => {
    const alvo = new Set(dias);
    setData((p) => ({ ...p, agenda: (p.agenda || []).filter((x) => !alvo.has(x.date)) }));
    setErr("");
  };

  const hours = [];
  for (let h = H0; h <= H1; h++) hours.push(h);
  const Hgt = (H1 - H0) * PXH;

  const load = useMemo(() => {
    const m = {};
    for (const col of porDia) for (const b of col) {
      m[b.type] = (m[b.type] || 0) + (b.fim - b.ini) / 60;
    }
    return m;
  }, [porDia]);

  const ocupadas = Object.values(load).reduce((a, x) => a + x, 0);
  const livre = Math.max(0, 7 * (H1 - H0) - ocupadas);
  const totalBlocos = porDia.reduce((a, c) => a + c.length, 0);
  const datados = (data.agenda || []).filter((x) => dias.indexOf(x.date) >= 0).length;

  /* Onde fica o traço do agora na coluna do dia. Fora da faixa desenhada
     (madrugada) ele simplesmente não aparece. */
  const topoAgora = agora.minutos >= H0 * 60 && agora.minutos <= H1 * 60
    ? ((agora.minutos - H0 * 60) / 60) * PXH : null;

  const formulario = (
    <Card className="px-6 py-6">
      <H color="var(--a-PE)" icon={<Plus size={16} />}>Novo bloco</H>
      <div className="mt-5 grid grid-cols-2 lg:grid-cols-6 gap-4">
        <Field label="Dia">
          <Select value={nb.day} onChange={(e) => setNb((p) => ({ ...p, day: e.target.value }))}>
            {dias.map((iso, i) => <option key={iso} value={String(i)}>{DAYS[i]} {fromISO(iso).getDate()}</option>)}
          </Select>
        </Field>
        <Field label="Tipo">
          <Select value={nb.type} onChange={(e) => setNb((p) => ({ ...p, type: e.target.value }))}>
            {BLOCK_IDS.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </Field>
        <Field label="Início"><TextInput type="time" value={nb.start} onChange={(e) => setNb((p) => ({ ...p, start: e.target.value }))} /></Field>
        <Field label="Fim"><TextInput type="time" value={nb.end} onChange={(e) => setNb((p) => ({ ...p, end: e.target.value }))} /></Field>
        <div className="col-span-2">
          <Field label="Nome">
            <TextInput value={nb.label} placeholder="Ex.: enfermaria clínica médica"
              onChange={(e) => setNb((p) => ({ ...p, label: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          </Field>
        </div>
      </div>
      <div className="mt-4 flex gap-2 flex-wrap">
        {[[true, "Toda semana"], [false, `Só em ${fromISO(dias[Number(nb.day)]).getDate()}/${pad(fromISO(dias[Number(nb.day)]).getMonth() + 1)}`]].map(([v, lb]) => (
          <button key={String(v)} type="button" onClick={() => setNb((p) => ({ ...p, repete: v }))}
            className="toque-larg rounded-full px-4 py-2"
            style={{
              background: nb.repete === v ? soft("var(--a-PE)", 18) : "transparent",
              border: `1px solid ${nb.repete === v ? "transparent" : T.line}`,
              color: nb.repete === v ? "var(--a-PE)" : T.dim,
              fontSize: 14, fontWeight: nb.repete === v ? 700 : 500, cursor: "pointer",
            }}>{lb}</button>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <Btn tone="primary" onClick={add}><Plus size={15} /> Adicionar bloco</Btn>
        {err ? <span style={{ fontSize: 14, color: T.bad }}>{err}</span> : null}
      </div>
    </Card>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* ── cabeçalho: semana, vista e atalhos ───────────────────────── */}
      <Card className="px-5 sm:px-6 py-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Semana anterior" onClick={() => irPara(-1)}
              className="flex items-center justify-center rounded-full brilhar"
              style={{ width: 38, height: 38, background: T.card2, border: `1px solid ${T.line}`, color: T.ink, cursor: "pointer" }}>
              <ChevronLeft size={17} />
            </button>
            <button type="button" aria-label="Próxima semana" onClick={() => irPara(1)}
              className="flex items-center justify-center rounded-full brilhar"
              style={{ width: 38, height: 38, background: T.card2, border: `1px solid ${T.line}`, color: T.ink, cursor: "pointer" }}>
              <ChevronRight size={17} />
            </button>
            <div style={{ marginLeft: 6 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, letterSpacing: "-0.02em" }}>{rotuloSemana(semana)}</div>
              <Mini style={{ marginTop: 2 }}>
                {fromISO(semana).getFullYear()}{ehSemanaAtual ? " · semana atual" : ""}
              </Mini>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-full" style={{ background: T.card2, padding: 3, border: `1px solid ${T.line}` }}>
              {[["dia", "Dia"], ["semana", "Semana"]].map(([id, lb]) => (
                <button key={id} type="button" onClick={() => setVista(id)}
                  className="toque-larg rounded-full px-4 py-1.5"
                  style={{
                    background: vista === id ? soft("var(--a-PE)", 20) : "transparent",
                    border: "none", color: vista === id ? "var(--a-PE)" : T.dim,
                    fontSize: 13.5, fontWeight: vista === id ? 700 : 500, cursor: "pointer",
                  }}>{lb}</button>
              ))}
            </div>
            {!ehSemanaAtual ? (
              <Btn size="sm" onClick={() => { setSemana(weekStart(today)); setEscolhido((fromISO(today).getDay() + 6) % 7); }}>Hoje</Btn>
            ) : null}
            {gcal && gcal.disponivel ? (
              <Btn size="sm" disabled={!gcal.pronto || gcal.ocupado} onClick={() => gcal.importarRotina(semana)}>
                <CalendarDays size={14} />{gcal.ocupado ? "Lendo…" : "Puxar do Google"}
              </Btn>
            ) : null}
          </div>
        </div>
        {gcal && gcal.erro ? <Label style={{ marginTop: 12, color: T.bad }}>{gcal.erro}</Label> : null}

        {/* fita dos sete dias: onde se escolhe o dia e se vê a carga */}
        <div className="mt-5 flex gap-2" style={{ overflowX: "auto", paddingBottom: 2 }}>
          {dias.map((iso, i) => {
            const hoje = iso === today;
            const marcado = i === escolhido;
            const col = porDia[i] || [];
            const cumpridos = col.filter((b) => feitos[chaveBloco(b, iso)]).length;
            return (
              <button key={iso} type="button" onClick={() => { setEscolhido(i); setVista("dia"); }}
                className="rounded-2xl px-3 py-3 brilhar"
                style={{
                  flex: "1 1 0%", minWidth: 76, cursor: "pointer", textAlign: "center",
                  background: marcado ? soft("var(--a-PE)", 16) : T.card2,
                  border: `1px solid ${marcado ? soft("var(--a-PE)", 42) : "transparent"}`,
                }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: hoje ? "var(--a-PE)" : T.faint, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {DAYS[i]}
                </div>
                <div style={{
                  fontFamily: F_MONO, fontSize: 19, fontWeight: 700, marginTop: 3,
                  color: marcado ? T.ink : hoje ? "var(--a-PE)" : T.dim,
                }}>{fromISO(iso).getDate()}</div>
                <div style={{ marginTop: 7, display: "flex", gap: 2, justifyContent: "center", minHeight: 5 }}>
                  {col.slice(0, 5).map((b, k) => (
                    <span key={b.id + k} style={{
                      width: 5, height: 5, borderRadius: 99,
                      background: BLOCKS[b.type] || T.faint,
                      opacity: feitos[chaveBloco(b, iso)] ? 0.35 : 1,
                    }} />
                  ))}
                </div>
                <Mini style={{ marginTop: 5, fontSize: 10.5 }}>
                  {col.length ? `${cumpridos}/${col.length}` : "livre"}
                </Mini>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── o dia escolhido ──────────────────────────────────────────── */}
      {vista === "dia" ? (
        <Card className="px-5 sm:px-6 py-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <H size={19} color="var(--a-PE)" icon={<CalendarDays size={16} />}>
                {isoEscolhido === today ? "Hoje" : `${DAYS[escolhido]}, ${brDate(isoEscolhido)}`}
              </H>
              <Mini style={{ marginTop: 6 }}>
                {doDia.length
                  ? `${doDia.length} ${doDia.length === 1 ? "bloco" : "blocos"} · ${fmtMin(resumoDia.total)} planejados`
                  : "nada marcado neste dia"}
                {resumoDia.estudo ? ` · ${fmtMin(resumoDia.estudo)} de estudo` : ""}
              </Mini>
            </div>
            {doDia.length ? (
              <div style={{ minWidth: 190, flex: "0 1 260px" }}>
                <div className="flex items-baseline justify-between" style={{ marginBottom: 6 }}>
                  <Label>cumprido</Label>
                  <Num size={15} weight={700} color={resumoDia.pct >= 100 ? T.ok : T.ink}>
                    {Math.round(resumoDia.pct)}%
                  </Num>
                </div>
                <Track pct={resumoDia.pct} color={resumoDia.pct >= 100 ? "var(--ok)" : "var(--a-PE)"} height={6} />
                <Mini style={{ marginTop: 6 }}>{fmtMin(resumoDia.cumprido)} de {fmtMin(resumoDia.total)}</Mini>
              </div>
            ) : null}
          </div>

          {emAndamento ? (
            <div className="mt-5 rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ background: soft("var(--neon)", 11), border: `1px solid ${soft("var(--neon)", 32)}` }}>
              <Clock size={16} style={{ color: "var(--neon)", flexShrink: 0 }} />
              <span style={{ fontSize: 14.5, color: T.ink }}>
                Agora: <strong style={{ fontWeight: 700 }}>{emAndamento.label}</strong>
                <span style={{ color: T.dim }}> · termina {emAndamento.end}</span>
              </span>
            </div>
          ) : null}

          {doDia.length === 0 ? (
            <div style={{ marginTop: 8 }}>
              <Blank icon={<Coffee size={26} />} title="Dia livre"
                hint="Coloque primeiro o que é imexível, plantão e enfermaria, e o estudo se encaixa no que sobra." />
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-2.5">
              {doDia.map((b) => (
                <CartaoBloco key={b.id} b={b} iso={isoEscolhido}
                  estado={estadoBloco(b, isoEscolhido, feitos[chaveBloco(b, isoEscolhido)], agora.data, agora.minutos)}
                  onAlternar={alternar} onRemover={remover} minutosAgora={agora.minutos} />
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {/* ── a semana inteira ─────────────────────────────────────────── */}
      {vista === "semana" ? (
        <>
          {Object.keys(load).length ? (
            <div className="flex gap-2 flex-wrap">
              {BLOCK_IDS.filter((b) => load[b]).map((b) => (
                <div key={b} className="rounded-full px-4 py-2 flex items-center gap-2.5" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: BLOCKS[b] }} />
                  <Label>{b}</Label>
                  <Num size={13.5} weight={600}>{load[b].toFixed(1)}h</Num>
                </div>
              ))}
              <div className="rounded-full px-4 py-2 flex items-center gap-2.5" style={{ background: T.card2 }}>
                <Label>livre entre 6h e 24h</Label>
                <Num size={13.5} weight={600}>{livre.toFixed(0)}h</Num>
              </div>
            </div>
          ) : null}

          <Card className="px-4 sm:px-6 py-6">
            <div className="flex items-center justify-end" style={{ marginBottom: 12 }}>
              {datados ? (
                <Btn size="sm" tone="outline" onClick={limparSemana}
                  title="Remove só os blocos desta data, mantendo os que se repetem">limpar a semana</Btn>
              ) : null}
            </div>
            {totalBlocos === 0 ? (
              <Blank icon={<CalendarDays size={26} />} title="Semana sem nada marcado"
                hint="Coloque primeiro o que é imexível, plantão e enfermaria, e o estudo se encaixa no que sobra." />
            ) : (
              <div className="overflow-x-auto">
                <div style={{ minWidth: 780 }}>
                  <div className="flex pb-3">
                    <div style={{ width: 44, flexShrink: 0 }} />
                    {dias.map((iso, i) => {
                      const hoje = iso === today, fds = i >= 5;
                      return (
                        <div key={iso} className="flex-1 text-center">
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: hoje ? "var(--a-PE)" : fds ? T.ghost : T.faint }}>{DAYS[i]}</div>
                          <div className="flex items-center justify-center" style={{ marginTop: 3 }}>
                            <span style={{
                              fontFamily: F_MONO, fontSize: 15, fontWeight: 700,
                              color: hoje ? "var(--bg2)" : fds ? T.dim : T.ink,
                              background: hoje ? "var(--a-PE)" : "transparent",
                              borderRadius: 99, minWidth: 27, height: 27, lineHeight: "27px", display: "inline-block",
                            }}>{fromISO(iso).getDate()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex">
                    <div style={{ width: 44, flexShrink: 0, position: "relative", height: Hgt }}>
                      {hours.map((h, i) => (
                        <div key={h} style={{ position: "absolute", top: i * PXH - 7, right: 8, fontFamily: F_MONO, fontSize: 11, color: T.ghost }}>{pad(h)}</div>
                      ))}
                    </div>
                    {dias.map((iso, di) => (
                      <div key={iso} className="flex-1" style={{
                        position: "relative", height: Hgt,
                        background: iso === today ? soft("var(--a-PE)", 5) : "transparent",
                      }}>
                        {hours.map((h, i) => (
                          <div key={h} style={{ position: "absolute", top: i * PXH, left: 0, right: 0, borderTop: `1px solid ${T.line}` }} />
                        ))}
                        {/* o traço do agora, só na coluna de hoje */}
                        {iso === agora.data && topoAgora !== null ? (
                          <div aria-hidden="true" style={{
                            position: "absolute", top: topoAgora, left: 0, right: 0, height: 0,
                            borderTop: "2px solid var(--neon)", zIndex: 2,
                            boxShadow: "0 0 10px color-mix(in srgb, var(--neon) 70%, transparent)",
                          }} />
                        ) : null}
                        {porDia[di].map((b) => {
                          const top = Math.max(0, ((b.ini - H0 * 60) / 60) * PXH);
                          const hh = Math.max(26, ((b.fim - b.ini) / 60) * PXH - 2);
                          const col = BLOCKS[b.type] || T.faint;
                          const larg = 100 / b.colunas;
                          const curto = hh < 46;
                          const est = estadoBloco(b, iso, feitos[chaveBloco(b, iso)], agora.data, agora.minutos);
                          const acento = CORES_ESTADO[est] || col;
                          return (
                            <div key={b.id} className="rounded-lg"
                              onClick={() => alternar(chaveBloco(b, iso))}
                              title={`${b.label} · ${b.start} às ${b.end}${b.fixo ? " · toda semana" : " · só nesta data"} · clique para marcar como cumprido`}
                              style={{
                                position: "absolute", top, height: hh,
                                left: `calc(${b.col * larg}% + 2px)`,
                                width: `calc(${larg}% - 4px)`,
                                background: soft(col, est === "feito" ? 9 : 18),
                                borderLeft: `3px ${b.fixo ? "solid" : "dashed"} ${acento}`,
                                boxShadow: est === "agora" ? `0 0 0 1px ${soft("var(--neon)", 55)}` : "none",
                                opacity: est === "feito" || est === "passou" ? 0.6 : 1,
                                overflow: "hidden", padding: curto ? "2px 4px" : "4px 5px", cursor: "pointer",
                              }}>
                              <div className="flex items-start justify-between" style={{ gap: 2 }}>
                                <span style={{
                                  fontSize: b.colunas > 1 ? 10.5 : 12, fontWeight: 600,
                                  lineHeight: 1.2, color: T.ink, overflow: "hidden",
                                  textDecoration: est === "feito" ? "line-through" : "none",
                                  display: "-webkit-box", WebkitLineClamp: curto ? 1 : 3, WebkitBoxOrient: "vertical",
                                }}>{b.label}</span>
                                <button type="button" aria-label="Remover"
                                  onClick={(e) => { e.stopPropagation(); remover(b); }}
                                  style={{ background: "none", border: "none", color: T.faint, cursor: "pointer", padding: 0, flexShrink: 0, lineHeight: 1 }}>
                                  <X size={11} />
                                </button>
                              </div>
                              {!curto ? (
                                <div style={{ fontFamily: F_MONO, fontSize: 9.5, color: acento, marginTop: 2 }}>
                                  {est === "feito" ? "cumprido" : `${b.start}–${b.end}`}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-5 mt-4 pt-4 flex-wrap" style={{ borderTop: `1px solid ${T.line}` }}>
                    <span className="inline-flex items-center gap-2" style={{ fontSize: 13, color: T.faint }}>
                      <span style={{ width: 3, height: 14, background: T.dim, borderRadius: 2 }} /> toda semana
                    </span>
                    <span className="inline-flex items-center gap-2" style={{ fontSize: 13, color: T.faint }}>
                      <span style={{ width: 3, height: 14, borderLeft: `3px dashed ${T.dim}` }} /> só nesta data
                    </span>
                    <span className="inline-flex items-center gap-2" style={{ fontSize: 13, color: T.faint }}>
                      <span style={{ width: 14, height: 2, background: "var(--neon)" }} /> agora
                    </span>
                    <Mini>clique num bloco para marcar como cumprido</Mini>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </>
      ) : null}

      {/* ── acrescentar bloco ────────────────────────────────────────── */}
      {novo ? formulario : (
        <div className="flex justify-center">
          <Btn tone="outline" onClick={() => { setNovo(true); setNb((p) => ({ ...p, day: String(escolhido) })); }}>
            <Plus size={15} /> Novo bloco
          </Btn>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   9 · TEMAS (o cronograma agrupado por especialidade)
   ═══════════════════════════════════════════════════════════════════ */

function Temas({ subjects, setMark, minutos, sessoes, today }) {
  const [aberta, setAberta] = useState(null);
  const [ordem, setOrdem] = useState("area");

  /* desempenho em questões por matéria, vindo das sessões lançadas */
  const questoes = useMemo(() => {
    const m = {};
    for (const s of sessoes) {
      if (!s.subjectId || !s.questions) continue;
      if (!m[s.subjectId]) m[s.subjectId] = { q: 0, ok: 0 };
      m[s.subjectId].q += s.questions;
      m[s.subjectId].ok += s.correct || 0;
    }
    return m;
  }, [sessoes]);

  const grupos = useMemo(() => {
    const m = new Map();
    for (const s of subjects) {
      const k = `${s.area}|${s.esp}`;
      if (!m.has(k)) m.set(k, { area: s.area, esp: s.esp, itens: [] });
      m.get(k).itens.push(s);
    }
    const lista = [...m.values()].map((g) => {
      const feitas = g.itens.filter((x) => x.aula).length;
      const bonusTot = g.itens.reduce((a, x) => a + x.bonus.length, 0);
      const bonusFeit = g.itens.reduce((a, x) => a + x.bonusCount, 0);
      const min = g.itens.reduce((a, x) => a + (minutos[x.id] || 0), 0);
      let q = 0, ok = 0;
      for (const x of g.itens) {
        const d = questoes[x.id];
        if (d) { q += d.q; ok += d.ok; }
      }
      const fracos = g.itens.filter((x) => x.perf === 3).length;
      return {
        ...g, feitas, total: g.itens.length, bonusTot, bonusFeit, min,
        q, pct: q ? Math.round((ok / q) * 100) : null, fracos,
        prog: g.itens.length ? (feitas / g.itens.length) * 100 : 0,
      };
    });
    if (ordem === "area") {
      lista.sort((a, b) => {
        if (a.area !== b.area) return AREA_IDS.indexOf(a.area) - AREA_IDS.indexOf(b.area);
        const oa = ORDEM_ESP[a.area] || [];
        return oa.indexOf(a.esp) - oa.indexOf(b.esp);
      });
    } else if (ordem === "atraso") {
      lista.sort((a, b) => a.prog - b.prog || b.total - a.total);
    } else {
      lista.sort((a, b) => b.min - a.min);
    }
    return lista;
  }, [subjects, minutos, questoes, ordem]);

  const porArea = useMemo(() => AREA_IDS.map((a) => {
    const g = grupos.filter((x) => x.area === a);
    const total = g.reduce((s, x) => s + x.total, 0);
    const feitas = g.reduce((s, x) => s + x.feitas, 0);
    return { a, total, feitas, esp: g.length };
  }), [grupos]);

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-6">
        <H color="var(--a-CI)" icon={<Stethoscope size={16} />}>O cronograma por especialidade</H>
        <Label style={{ marginTop: 6, lineHeight: 1.6 }}>
          As mesmas {subjects.length} aulas, agrupadas por assunto em vez de por semana.
          Serve para enxergar onde você está devendo dentro de cada grande área.
        </Label>
        <div className="mt-6"><Radar dados={porArea.map((x) => ({
          rotulo: aLabel(x.a), pct: x.total ? (x.feitas / x.total) * 100 : 0, cor: aColor(x.a),
        }))} /></div>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-5 gap-4">
          {porArea.map((x) => (
            <div key={x.a}>
              <div className="flex items-center justify-between mb-2">
                <Chip area={x.a} small />
                <Num size={12.5} color={T.faint} weight={500}>{x.feitas}/{x.total}</Num>
              </div>
              <Track pct={(x.feitas / x.total) * 100} color={aColor(x.a)} height={5} />
              <Mini style={{ marginTop: 5 }}>{x.esp} especialidades</Mini>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex gap-2 flex-wrap items-center">
        <Label>Ordenar por</Label>
        {[["area", "Área"], ["atraso", "Menos estudadas"], ["tempo", "Mais tempo"]].map(([id, lb]) => (
          <button key={id} type="button" onClick={() => setOrdem(id)} className="toque-larg rounded-full px-4 py-2"
            style={{
              background: ordem === id ? T.card3 : T.card, border: `1px solid ${T.line}`,
              color: ordem === id ? T.ink : T.dim, fontSize: 14,
              fontWeight: ordem === id ? 700 : 500, cursor: "pointer",
            }}>{lb}</button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {grupos.map((g) => {
          const k = `${g.area}|${g.esp}`;
          const on = aberta === k;
          return (
            <Card key={k}>
              <button type="button" onClick={() => setAberta(on ? null : k)}
                className="w-full flex items-center gap-3.5 px-5 py-4 text-left"
                style={{ background: "none", border: "none", cursor: "pointer" }}>
                <span style={{ width: 4, height: 34, borderRadius: 3, background: aColor(g.area), flexShrink: 0 }} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2.5" style={{ flexWrap: "wrap" }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{g.esp}</span>
                    <Chip area={g.area} small />
                    {g.fracos ? (
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.bad, background: soft("var(--bad)", 14), padding: "2px 8px", borderRadius: 99 }}>
                        {g.fracos} com desempenho baixo
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-3 mt-2" style={{ maxWidth: 380 }}>
                    <Track pct={g.prog} color={aColor(g.area)} height={5} />
                  </span>
                  <Mini style={{ marginTop: 6 }}>
                    {g.feitas} de {g.total} aulas
                    {g.bonusTot ? ` · ${g.bonusFeit}/${g.bonusTot} tópicos` : ""}
                    {g.min ? ` · ${fmtMin(g.min)}` : ""}
                    {g.pct !== null ? ` · ${g.pct}% em ${g.q} questões` : ""}
                  </Mini>
                </span>
                <ChevronDown size={17} style={{ color: T.ghost, transform: on ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }} />
              </button>

              {on ? (
                <div className="px-5 pb-5 pt-1" style={{ borderTop: `1px solid ${T.line}` }}>
                  {g.itens.map((s) => {
                    const d = questoes[s.id];
                    return (
                      <div key={s.id} className="flex items-center gap-3 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
                        <Tick on={s.aula} color={aColor(s.area)} size={21}
                          label={s.aula ? "Desmarcar aula" : "Marcar aula"}
                          onClick={() => setMark(s.id, { aula: !s.aula, date: !s.aula && !s.date ? today : s.date })} />
                        <span className="flex-1 min-w-0">
                          <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: s.aula ? T.dim : T.ink, lineHeight: 1.35 }}>{s.title}</span>
                          <Mini style={{ marginTop: 2 }}>
                            {s.esp}
                            {s.date ? ` · ${brDate(s.date)}` : ""}
                            {minutos[s.id] ? ` · ${fmtMin(minutos[s.id])}` : ""}
                            {d ? ` · ${d.ok}/${d.q}` : ""}
                          </Mini>
                        </span>
                        {s.perf ? (
                          <span style={{
                            fontFamily: F_MONO, fontSize: 12, color: perfColor(s.perf),
                            background: soft(perfColor(s.perf), 15), padding: "3px 9px", borderRadius: 99, whiteSpace: "nowrap",
                          }}>{PERF[s.perf]}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
