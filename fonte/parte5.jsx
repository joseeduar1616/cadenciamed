/* ═══════════════════════════════════════════════════════════════════
   10 · FOCO
   ═══════════════════════════════════════════════════════════════════ */

function Ring({ pct, color, size = 240, children }) {
  const r = size / 2 - 14;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card3)" strokeWidth={3} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - p)}
          style={{ transition: "stroke-dashoffset .9s linear, stroke .4s" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

function Foco({ data, setData, today, P, subjectId, setSubjectId }) {
  const [cfg, setCfg] = useState(false);
  const [full, setFull] = useState(false);
  const pref = useRef(P);
  pref.current = P;

  useEffect(() => {
    const h = (e) => {
      const el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      const p = pref.current;
      if (e.code === "Space") { e.preventDefault(); p.setRunning(!p.running); return; }
      if (e.key === "f" || e.key === "F") setFull((v) => !v);
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    try {
      if (full && document.documentElement.requestFullscreen) {
        const r = document.documentElement.requestFullscreen();
        if (r && r.catch) r.catch(() => {});
      } else if (!full && document.fullscreenElement && document.exitFullscreen) {
        const r = document.exitFullscreen();
        if (r && r.catch) r.catch(() => {});
      }
    } catch (e) { /* sem suporte */ }
  }, [full]);

  const corrido = P.modo === "corrido";
  const color = corrido || P.phase === "foco" ? data.pomo.corFoco : data.pomo.corPausa;
  const name = corrido ? "tempo corrido"
    : P.phase === "foco" ? "foco" : P.phase === "curta" ? "pausa curta" : "pausa longa";
  const pct = corrido ? (P.corrido % 3600) / 3600 : (P.total > 0 ? 1 - P.left / P.total : 0);
  const relogio = corrido ? fmtRelogio(P.corrido) : fmtClock(P.left);
  const todayLog = data.pomoLog.filter((x) => x.date === today);
  const set = (k, v) => setData((p) => ({ ...p, pomo: { ...p.pomo, [k]: v } }));
  const subj = subjectId ? BY_ID[subjectId] : null;

  if (full) {
    return (
      <div className="fixed flex flex-col items-center justify-center px-6" style={{ inset: 0, background: T.bg, zIndex: 90 }}>
        <button type="button" onClick={() => setFull(false)} aria-label="Sair da tela cheia"
          className="fixed flex items-center justify-center rounded-full"
          style={{ top: 20, right: 20, width: 44, height: 44, background: T.card2, border: `1px solid ${T.line}`, color: T.dim, cursor: "pointer" }}>
          <Minimize2 size={18} />
        </button>
        {subj ? (
          <div className="flex items-center gap-3 mb-8">
            <Chip area={subj.area} />
            <span style={{ fontSize: 17, fontWeight: 600, color: T.dim, textAlign: "center" }}>{subj.title}</span>
          </div>
        ) : null}
        <div style={{ fontFamily: F_UI, fontSize: 17, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color }}>{name}</div>
        <div style={{
          fontFamily: F_MONO, fontWeight: 700, color,
          fontSize: corrido ? "clamp(64px, 19vw, 200px)" : "clamp(88px, 26vw, 260px)",
          letterSpacing: "-0.05em", lineHeight: 1, marginTop: 18, fontVariantNumeric: "tabular-nums",
        }}>{relogio}</div>
        <div className="w-full mt-10" style={{ maxWidth: 640 }}><Track pct={pct * 100} color={color} height={10} /></div>
        {!corrido ? (
          <div className="flex gap-2 mt-5">
            {Array.from({ length: data.pomo.cycle }).map((_, i) => (
              <span key={i} style={{
                width: 10, height: 10, borderRadius: 99,
                background: i < ((P.round - 1) % data.pomo.cycle) + (P.phase === "foco" ? 0 : 1) ? color : T.card3,
              }} />
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap justify-center gap-3 mt-10">
          {P.running
            ? <Btn tone="primary" onClick={() => P.setRunning(false)}><Pause size={17} /> Pausar</Btn>
            : <Btn tone="primary" onClick={() => P.setRunning(true)}><Play size={17} /> {corrido && P.corrido > 0 ? "Retomar" : "Começar"}</Btn>}
          {corrido ? (
            <Btn onClick={() => { P.encerrarCorrido(); setFull(false); }} disabled={P.corrido < 60}>
              <Check size={15} /> Encerrar e registrar
            </Btn>
          ) : null}
          <Btn onClick={P.reset}><RotateCcw size={15} /> {corrido ? "Zerar" : "Reiniciar"}</Btn>
          {!corrido ? <Btn onClick={() => P.advance(false)}><SkipForward size={15} /> Pular</Btn> : null}
        </div>
        <Mini style={{ marginTop: 26 }}>espaço inicia e pausa · F ou Esc sai da tela cheia</Mini>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 sm:px-10 py-10" style={{ background: `linear-gradient(180deg, ${soft(color, 9)}, transparent 42%), ${T.card}` }}>
        <div className="flex flex-col lg:flex-row items-center gap-10">
          <Ring pct={pct} color={color}>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color }}>{name}</div>
            <div style={{ marginTop: 10 }}><Num size={corrido ? 52 : 62} weight={700} color={color}>{relogio}</Num></div>
            {corrido ? (
              <Mini style={{ marginTop: 12 }}>{P.running ? "contando" : P.corrido > 0 ? "pausado" : "pronto"}</Mini>
            ) : (
              <div className="flex gap-1.5 mt-5">
                {Array.from({ length: data.pomo.cycle }).map((_, i) => (
                  <span key={i} style={{
                    width: 7, height: 7, borderRadius: 99,
                    background: i < ((P.round - 1) % data.pomo.cycle) + (P.phase === "foco" ? 0 : 1) ? color : T.card3,
                  }} />
                ))}
              </div>
            )}
          </Ring>

          <div className="flex-1 w-full">
            <div className="flex gap-1.5 mb-5 rounded-full p-1" style={{ background: T.card2, border: `1px solid ${T.line}`, width: "fit-content" }}>
              {[["pomodoro", "Pomodoro"], ["corrido", "Tempo corrido"]].map(([id, lb]) => (
                <button key={id} type="button" onClick={() => set("modo", id)} className="toque-larg rounded-full px-4 py-2"
                  style={{
                    background: P.modo === id ? T.card3 : "transparent", border: "none",
                    color: P.modo === id ? T.ink : T.dim, fontSize: 14,
                    fontWeight: P.modo === id ? 700 : 500, cursor: "pointer",
                  }}>{lb}</button>
              ))}
            </div>

            <Label>Estudando agora</Label>
            <div className="mt-2"><SubjectPicker value={subjectId} onChange={setSubjectId} placeholder="Escolha a matéria (opcional)" /></div>

            <div className="flex flex-wrap gap-2 mt-5">
              {P.running
                ? <Btn tone="primary" onClick={() => P.setRunning(false)}><Pause size={16} /> Pausar</Btn>
                : <Btn tone="primary" onClick={() => P.setRunning(true)}><Play size={16} /> {corrido && P.corrido > 0 ? "Retomar" : "Começar"}</Btn>}
              {corrido ? (
                <Btn onClick={() => P.encerrarCorrido()} disabled={P.corrido < 60}
                  title={P.corrido < 60 ? "Precisa de pelo menos 1 minuto" : "Registra o tempo como sessão"}>
                  <Check size={15} /> Encerrar e registrar
                </Btn>
              ) : null}
              <Btn onClick={() => setFull(true)}><Maximize2 size={15} /> Tela cheia</Btn>
              <Btn onClick={P.reset}><RotateCcw size={15} /> {corrido ? "Zerar" : "Reiniciar"}</Btn>
              {!corrido ? <Btn onClick={() => P.advance(false)}><SkipForward size={15} /> Pular</Btn> : null}
              <Btn tone="outline" onClick={() => setCfg((v) => !v)}><Settings2 size={15} /> Ajustes</Btn>
            </div>

            {!corrido ? (
              <div className="flex gap-1.5 mt-4 flex-wrap">
                {[["foco", "Foco", data.pomo.corFoco], ["curta", "Pausa curta", data.pomo.corPausa], ["longa", "Pausa longa", data.pomo.corPausa]].map(([id, lb, c]) => (
                  <button key={id} type="button" onClick={() => P.jumpTo(id)} className="toque-larg rounded-full px-4 py-2"
                    style={{
                      background: P.phase === id ? soft(c, 18) : "transparent",
                      border: `1px solid ${P.phase === id ? "transparent" : T.line}`,
                      color: P.phase === id ? c : T.dim, fontSize: 14,
                      fontWeight: P.phase === id ? 700 : 500, cursor: "pointer",
                    }}>{lb}</button>
                ))}
              </div>
            ) : null}

            <div className="flex gap-7 mt-6 pt-5 flex-wrap" style={{ borderTop: `1px solid ${T.line}` }}>
              <div><Num size={26} color={data.pomo.corFoco}>{todayLog.length}</Num><Mini style={{ marginTop: 4 }}>blocos hoje</Mini></div>
              <div><Num size={26} color="var(--a-CI)">{fmtMin(todayLog.reduce((a, x) => a + (x.mins || 0), 0))}</Num><Mini style={{ marginTop: 4 }}>em foco</Mini></div>
              {!corrido ? <div><Num size={26} color="var(--warn)">{P.round}</Num><Mini style={{ marginTop: 4 }}>rodada</Mini></div> : null}
            </div>
            <Mini style={{ marginTop: 14 }}>
              espaço inicia e pausa · F abre a tela cheia
              {corrido ? " · o tempo corre mesmo com o site fechado" : ""}
            </Mini>
          </div>
        </div>

        {cfg ? (
          <div className="mt-8 pt-7 grid grid-cols-2 lg:grid-cols-4 gap-4" style={{ borderTop: `1px solid ${T.line}` }}>
            <NumField label="Foco (min)" value={data.pomo.focus} min={1} max={180} onCommit={(v) => set("focus", v)} />
            <NumField label="Pausa curta (min)" value={data.pomo.short} min={1} max={60} onCommit={(v) => set("short", v)} />
            <NumField label="Pausa longa (min)" value={data.pomo.long} min={1} max={90} onCommit={(v) => set("long", v)} />
            <NumField label="Blocos por ciclo" value={data.pomo.cycle} min={2} max={12} onCommit={(v) => set("cycle", v)} />
            <div className="col-span-2 flex flex-wrap gap-5 pt-1">
              <label className="flex items-center gap-2.5" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={data.pomo.autoNext} onChange={(e) => set("autoNext", e.target.checked)} />
                <span style={{ fontSize: 14, color: T.dim }}>Emendar a próxima fase</span>
              </label>
              <label className="flex items-center gap-2.5" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={data.pomo.sound} onChange={(e) => set("sound", e.target.checked)} />
                <span style={{ fontSize: 14, color: T.dim }}>Aviso sonoro</span>
              </label>
            </div>
            <div className="col-span-2 flex flex-wrap gap-2 items-center">
              <Label>Predefinições</Label>
              <Btn size="sm" onClick={() => setData((p) => ({ ...p, pomo: { ...p.pomo, focus: 25, short: 5, long: 15, cycle: 4 } }))}>25/5</Btn>
              <Btn size="sm" onClick={() => setData((p) => ({ ...p, pomo: { ...p.pomo, focus: 50, short: 10, long: 25, cycle: 3 } }))}>50/10</Btn>
              <Btn size="sm" onClick={() => setData((p) => ({ ...p, pomo: { ...p.pomo, focus: 90, short: 20, long: 30, cycle: 2 } }))}>90/20</Btn>
            </div>
            <div className="col-span-2 lg:col-span-4 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
              <div className="grid sm:grid-cols-2 gap-6">
                <Paleta titulo="Cor do foco" valor={data.pomo.corFoco} onPick={(c) => set("corFoco", c)} />
                <Paleta titulo="Cor das pausas" valor={data.pomo.corPausa} onPick={(c) => set("corPausa", c)} />
              </div>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   11 · HOJE
   ═══════════════════════════════════════════════════════════════════ */

function SessionRow({ s, onDel, showDate }) {
  const pct = s.questions > 0 ? Math.round(((s.correct || 0) / s.questions) * 100) : null;
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: T.card2 }}>
      <span style={{ width: 3, height: 26, borderRadius: 3, background: aColor(s.area), flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.topic}</div>
        <Mini style={{ marginTop: 1 }}>
          {s.kind}{showDate ? ` · ${brDate(s.date)}` : ""}{s.questions ? ` · ${s.correct}/${s.questions}` : ""}{s.notes ? ` · ${s.notes}` : ""}
        </Mini>
      </div>
      {pct !== null ? <Num size={13.5} weight={600} color={pct >= 80 ? T.ok : pct >= 61 ? T.warn : T.bad}>{pct}%</Num> : null}
      <Num size={14} color={T.dim} weight={500}>{fmtMin(s.minutes)}</Num>
      {onDel ? (
        <button type="button" onClick={onDel} aria-label="Excluir"
          style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer" }}><X size={14} /></button>
      ) : null}
    </div>
  );
}

function LogForm({ today, addSession, notify, onDone }) {
  const [f, setF] = useState({ subjectId: null, free: "", date: today, kind: KINDS[0], h: "", m: "", q: "", c: "", notes: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const mins = (Number(f.h) || 0) * 60 + (Number(f.m) || 0);
  const q = Number(f.q) || 0, ok = Number(f.c) || 0;

  const save = () => {
    const subj = f.subjectId ? BY_ID[f.subjectId] : null;
    const topic = subj ? subj.title : f.free.trim();
    if (!topic) return notify("Escolha uma matéria ou escreva um tema.");
    if (mins < 1) return notify("Informe o tempo estudado.");
    if (q > 0 && ok > q) return notify("Acertos não podem passar do total de questões.");
    addSession({
      id: uid(), date: f.date, subjectId: f.subjectId, area: subj ? subj.area : null,
      topic, kind: f.kind, minutes: mins, questions: q, correct: Math.min(ok, q),
      notes: f.notes.trim(), createdAt: Date.now(),
    });
    notify(`${fmtMin(mins)} registrados.`);
    setF((p) => ({ ...p, free: "", h: "", m: "", q: "", c: "", notes: "" }));
    if (onDone) onDone();
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Matéria do cronograma"><SubjectPicker value={f.subjectId} onChange={(v) => set("subjectId", v)} /></Field>
      {!f.subjectId ? (
        <Field label="Ou um tema fora do cronograma">
          <TextInput value={f.free} placeholder="Ex.: sedação paliativa" onChange={(e) => set("free", e.target.value)} />
        </Field>
      ) : null}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Data"><TextInput type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="Tipo"><Select value={f.kind} onChange={(e) => set("kind", e.target.value)}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</Select></Field>
        <Field label="Observação"><TextInput value={f.notes} placeholder="opcional" onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <NumBox label="Horas" value={f.h} placeholder="0" onChange={(v) => set("h", v)} />
        <NumBox label="Minutos" value={f.m} placeholder="45" onChange={(v) => set("m", v)} />
        <NumBox label="Questões" value={f.q} placeholder="0" onChange={(v) => set("q", v)} />
        <NumBox label="Acertos" value={f.c} placeholder="0" onChange={(v) => set("c", v)} />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Btn tone="primary" onClick={save}>Salvar sessão</Btn>
        <Label>{mins > 0 ? fmtMin(mins) : "sem tempo"}{q > 0 ? ` · ${Math.round((Math.min(ok, q) / q) * 100)}% de acerto` : ""}</Label>
      </div>
    </div>
  );
}

function Hoje({ data, setData, today, minToday, minWeek, qWeek, streak, late, done, bonusDone, addSession, delSession, notify, go, blocosHoje, projecao, pro, verPlanos }) {
  const [openLog, setOpenLog] = useState(false);
  const [newTask, setNewTask] = useState("");
  const todaySessions = data.sessions.filter((s) => s.date === today);
  const openTasks = data.tasks.filter((t) => !t.done).length;

  const addTask = () => {
    const t = newTask.trim();
    if (!t) return;
    setData((p) => ({ ...p, tasks: [{ id: uid(), text: t, done: false }, ...p.tasks] }));
    setNewTask("");
  };

  const cMin = useContagem(minToday);
  const cSem = useContagem(minWeek);
  const cQ = useContagem(qWeek);
  const cSeq = useContagem(streak);

  const stats = [
    { v: fmtMin(cMin), pct: (minToday / data.goals.daily) * 100, l: "hoje", sub: `meta ${fmtMin(data.goals.daily)}`, c: "var(--a-CL)" },
    { v: fmtMin(cSem), pct: (minWeek / data.goals.weekly) * 100, l: "na semana", sub: `meta ${fmtMin(data.goals.weekly)}`, c: "var(--a-GO)" },
    { v: String(Math.round(cQ)), pct: (qWeek / data.goals.questions) * 100, l: "questões", sub: `meta ${data.goals.questions}`, c: "var(--a-CI)" },
    { v: `${Math.round(cSeq)}d`, pct: Math.min(100, streak * 10), l: "seguidos", sub: streak > 0 ? "sem falhar" : "comece hoje", c: "var(--warn)" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 sm:px-8 py-7" brilho="var(--neon)" tilt>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-7">
          {stats.map((s, i) => (
            <div key={s.l} className="flex items-center gap-3.5">
              <Medidor pct={s.pct} cor={s.c} tamanho={76} largura={6} atraso={i * 130}>
                <span style={{ fontFamily: F_MONO, fontSize: 14, fontWeight: 700, color: s.c }}>
                  {Math.round(Math.min(999, s.pct))}%
                </span>
              </Medidor>
              <div className="min-w-0">
                <Num size={26} weight={700} color={T.ink}>{s.v}</Num>
                <Label style={{ marginTop: 2 }}>{s.l}</Label>
                <Mini style={{ marginTop: 1 }}>{s.sub}</Mini>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-7 pt-6 flex flex-wrap items-center gap-x-8 gap-y-4" style={{ borderTop: `1px solid ${T.line}` }}>
          <div className="flex items-baseline gap-2.5">
            <Num size={24} color="var(--a-PR)">{done}<span style={{ fontSize: 16, color: T.faint }}>/{CURRICULUM.length}</span></Num>
            <Label>aulas principais</Label>
          </div>
          <div className="flex items-baseline gap-2.5">
            <Num size={24} color="var(--a-PE)">{bonusDone}<span style={{ fontSize: 16, color: T.faint }}>/{TOTAL_BONUS}</span></Num>
            <Label>tópicos</Label>
          </div>
          <div className="flex-1" style={{ minWidth: 160 }}>
            <Track pct={((done + bonusDone) / (CURRICULUM.length + TOTAL_BONUS)) * 100} color={T.ok} />
          </div>
        </div>
      </Card>

      {projecao ? (
        <Card className="px-6 py-6" brilho="var(--neon2)" tilt>
          <H color="var(--neon2)" icon={<Zap size={16} />}>Ritmo e projeção</H>
          <div className="mt-5 grid sm:grid-cols-3 gap-5">
            <div className="flex items-center gap-3.5">
              <Medidor pct={projecao.pctCurso} cor="var(--neon2)" tamanho={84} largura={7}>
                <span style={{ fontFamily: F_MONO, fontSize: 15, fontWeight: 700, color: "var(--neon2)" }}>
                  {Math.round(projecao.pctCurso)}%
                </span>
              </Medidor>
              <div>
                <Num size={20} weight={700}>{projecao.feitas}<span style={{ fontSize: 14, color: T.faint }}>/{projecao.total}</span></Num>
                <Label style={{ marginTop: 2 }}>do cronograma</Label>
                <Mini style={{ marginTop: 1 }}>{projecao.faltam} aulas restantes</Mini>
              </div>
            </div>
            <div>
              <Num size={22} weight={700} color="var(--a-GO)">{projecao.porSemana.toFixed(1)}</Num>
              <Label style={{ marginTop: 4 }}>aulas por semana</Label>
              <Mini style={{ marginTop: 2 }}>seu ritmo nas últimas 4 semanas</Mini>
            </div>
            <div>
              <Num size={22} weight={700} color={projecao.folga >= 0 ? T.ok : T.bad}>
                {projecao.precisa.toFixed(1)}
              </Num>
              <Label style={{ marginTop: 4 }}>o ritmo necessário</Label>
              <Mini style={{ marginTop: 2 }}>para fechar antes da prova</Mini>
            </div>
          </div>
          <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
            <Mini style={{ lineHeight: 1.7 }}>{projecao.frase}</Mini>
          </div>
        </Card>
      ) : null}

      {!pro ? (
        <Card className="px-6 py-5" brilho="var(--neon2)">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center justify-center rounded-full" style={{ width: 42, height: 42, background: soft("var(--neon2)", 16), color: "var(--neon2)", flexShrink: 0 }}>
              <Cadeado tamanho={19} />
            </span>
            <div className="flex-1" style={{ minWidth: 200 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>Você está na versão gratuita</div>
              <Mini style={{ marginTop: 3, lineHeight: 1.55 }}>
                Especialidades, assistente, rotina e sincronização entram no plano completo.
              </Mini>
            </div>
            <Btn tone="primary" onClick={verPlanos}>Ver planos</Btn>
          </div>
        </Card>
      ) : null}

      {blocosHoje.length ? (
        <Card className="px-6 py-6">
          <div className="flex items-center justify-between">
            <H color="var(--a-PE)" icon={<CalendarDays size={16} />}>Sua agenda de hoje</H>
            <Btn size="sm" tone="outline" onClick={() => go("rotina")}>ver a semana <ChevronRight size={13} /></Btn>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {blocosHoje.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: T.card2 }}>
                <span style={{ width: 3, height: 26, borderRadius: 3, background: BLOCKS[b.type] || T.faint, flexShrink: 0 }} />
                <Num size={13} color={T.dim} weight={600}>{b.start}</Num>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.label}</div>
                  <Mini style={{ marginTop: 1 }}>{b.type} · até {b.end}</Mini>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid lg:grid-cols-5 gap-5">
        <Card className="px-6 py-6 lg:col-span-3">
          <div className="flex items-center justify-between">
            <H color="var(--warn)" icon={<RotateCcw size={16} />}>Revisões pedindo passagem</H>
            {late.length ? <Btn size="sm" tone="outline" onClick={() => go("revisoes")}>ver todas <ChevronRight size={13} /></Btn> : null}
          </div>
          {late.length === 0 ? (
            <Blank icon={<Check size={24} />} title="Nada atrasado" hint="Todos os degraus estão dentro do prazo." />
          ) : (
            <div className="mt-4 flex flex-col gap-2.5">
              {late.slice(0, 6).map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: T.card2 }}>
                  <span style={{ width: 3, height: 26, borderRadius: 3, background: aColor(r.area), flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                    <Mini style={{ marginTop: 1 }}>{BY_ID[r.id] ? BY_ID[r.id].esp : ""} · {r.late.map((x) => x.label).join(", ")}</Mini>
                  </div>
                  <Num size={13} color={T.warn} weight={600}>{r.overdueBy > 0 ? `${r.overdueBy}d` : "hoje"}</Num>
                </div>
              ))}
              {late.length > 6 ? <Label style={{ paddingLeft: 4 }}>e mais {late.length - 6}</Label> : null}
            </div>
          )}
        </Card>

        <Card className="px-6 py-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <H color="var(--a-GO)" icon={<ListChecks size={16} />}>Pendências</H>
            <Label>{openTasks} aberta{openTasks === 1 ? "" : "s"}</Label>
          </div>
          <div className="mt-4 flex gap-2">
            <TextInput value={newTask} placeholder="Anotar" onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addTask(); }} />
            <Btn onClick={addTask}><Plus size={15} /></Btn>
          </div>
          {data.tasks.length === 0 ? (
            <Blank icon={<ListChecks size={22} />} title="Lista limpa" hint="O que não pode escapar desta semana." />
          ) : (
            <div className="mt-3 flex flex-col gap-1.5" style={{ maxHeight: 300, overflowY: "auto" }}>
              {data.tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5" style={{ background: T.card2 }}>
                  <Tick on={t.done} size={19} label={t.done ? "Reabrir" : "Concluir"}
                    onClick={() => setData((p) => ({ ...p, tasks: p.tasks.map((x) => x.id === t.id ? { ...x, done: !x.done } : x) }))} />
                  <span className="flex-1" style={{ fontSize: 14.5, color: t.done ? T.ghost : T.ink, textDecoration: t.done ? "line-through" : "none" }}>{t.text}</span>
                  <button type="button" aria-label="Excluir" className="toque"
                    onClick={() => setData((p) => ({ ...p, tasks: p.tasks.filter((x) => x.id !== t.id) }))}
                    style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer" }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="px-6 py-6">
        <div className="flex items-center justify-between">
          <H color="var(--a-CL)" icon={<Coffee size={16} />}>Sessões de hoje</H>
          <Btn size="sm" onClick={() => setOpenLog((v) => !v)}><Plus size={14} /> Lançar à mão</Btn>
        </div>
        {openLog ? (
          <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
            <LogForm today={today} addSession={addSession} notify={notify} onDone={() => setOpenLog(false)} />
          </div>
        ) : null}
        {todaySessions.length === 0 ? (
          <Blank icon={<Coffee size={24} />} title="Ainda nada hoje" hint="Use o cronômetro na aba Foco ou lance a sessão aqui." />
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {todaySessions.map((s) => <SessionRow key={s.id} s={s} onDel={() => delSession(s.id)} />)}
          </div>
        )}
      </Card>
    </div>
  );
}
