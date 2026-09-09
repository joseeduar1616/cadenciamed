/* ═══════════════════════════════════════════════════════════════════
   15 · METAS
   ═══════════════════════════════════════════════════════════════════ */

function Metas({ data, setData, today, qWeek, notify, ladder, gcal }) {
  const [prova, setProva] = useState("");
  const [rever, setRever] = useState("");
  const [habit, setHabit] = useState("");
  const [cal, setCal] = useState({ rotina: true, revisoes: true, simulados: true, prova: true });
  const ws = weekStart(today);
  const note = data.notes[ws] || "";

  const contagem = useMemo(() => {
    const limite = addDays(today, 240);
    let rev = 0;
    for (const r of ladder) for (const st of r.steps) if (!st.on && st.due <= limite) rev += 1;
    return {
      rotina: (data.routine || []).length + (data.agenda || []).filter((x) => !x.gid).length,
      revisoes: rev,
      simulados: SIMULADOS.filter((_, i) => !data.simulados[i]).length,
      prova: data.profile.examDate ? 1 : 0,
    };
  }, [ladder, data.routine, data.agenda, data.simulados, data.profile.examDate, today]);

  const exportarCalendario = () => {
    const r = buildICS({
      routine: data.routine, agenda: data.agenda, ladder, simulados: data.simulados,
      examDate: data.profile.examDate, today, opts: cal,
    });
    if (r.total === 0) return notify("Nada selecionado para exportar.");
    if (baixar(`cadencia-${today}.ics`, "text/calendar;charset=utf-8", r.texto, notify)) {
      notify(`${r.total} evento${r.total === 1 ? "" : "s"} no arquivo.`);
    }
  };

  const toggleSim = (i) => setData((p) => {
    const s = { ...p.simulados };
    if (s[i]) delete s[i]; else s[i] = todayISO();
    return { ...p, simulados: s };
  });
  const toggleHabit = (id) => setData((p) => {
    const log = { ...p.habitLog };
    const wk = { ...(log[ws] || {}) };
    if (wk[id]) delete wk[id]; else wk[id] = 1;
    log[ws] = wk;
    return { ...p, habitLog: log };
  });
  const habitsOn = data.habitLog[ws] || {};

  return (
    <div className="flex flex-col gap-5">
      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="px-6 py-6">
          <H color="var(--warn)" icon={<Target size={16} />}>Simulados</H>
          <Label style={{ marginTop: 4 }}>janelas oficiais do cronograma</Label>
          <div className="mt-4 flex flex-col gap-2">
            {SIMULADOS.map(([nome, ini, fim], i) => {
              const on = !!data.simulados[i];
              const aberto = today >= ini && today <= fim;
              const passou = today > fim;
              return (
                <div key={nome} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                  style={{ background: aberto && !on ? soft("var(--warn)", 10) : T.card2 }}>
                  <Tick on={on} size={20} color={T.ok} label={nome} onClick={() => toggleSim(i)} />
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: on ? T.dim : T.ink, textDecoration: on ? "line-through" : "none" }}>{nome}</div>
                    <Mini style={{ marginTop: 1 }}>{brDate(ini)} a {brDate(fim)}</Mini>
                  </div>
                  {on ? <Num size={12} color={T.ok} weight={600}>feito</Num>
                    : aberto ? <Num size={12} color={T.warn} weight={600}>aberto</Num>
                      : passou ? <Num size={12} color={T.bad} weight={600}>passou</Num> : null}
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="px-6 py-6">
          <H color="var(--a-GO)" icon={<BookMarked size={16} />}>Provas na íntegra</H>
          <Label style={{ marginTop: 4 }}>anote cada prova antiga que resolver</Label>
          <div className="mt-4 flex gap-2">
            <TextInput value={prova} placeholder="Ex.: UFRJ 2019" onChange={(e) => setProva(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !prova.trim()) return;
                setData((p) => ({ ...p, provas: [{ id: uid(), text: prova.trim(), date: todayISO() }, ...p.provas] }));
                setProva("");
              }} />
            <Btn onClick={() => {
              if (!prova.trim()) return;
              setData((p) => ({ ...p, provas: [{ id: uid(), text: prova.trim(), date: todayISO() }, ...p.provas] }));
              setProva("");
            }}><Plus size={15} /></Btn>
          </div>
          {data.provas.length === 0 ? (
            <Blank icon={<FileText size={22} />} title="Nenhuma prova ainda" hint="Cada prova completa resolvida entra aqui com a data." />
          ) : (
            <div className="mt-3 flex flex-col gap-1.5" style={{ maxHeight: 260, overflowY: "auto" }}>
              {data.provas.map((x) => (
                <div key={x.id} className="flex items-center gap-3 rounded-2xl px-4 py-2.5" style={{ background: T.card2 }}>
                  <BookMarked size={14} style={{ color: T.faint, flexShrink: 0 }} />
                  <span className="flex-1" style={{ fontSize: 14.5 }}>{x.text}</span>
                  <Mini>{brDate(x.date)}</Mini>
                  <button type="button" aria-label="Excluir" className="toque"
                    onClick={() => setData((p) => ({ ...p, provas: p.provas.filter((y) => y.id !== x.id) }))}
                    style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer" }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-4 flex items-baseline gap-3" style={{ borderTop: `1px solid ${T.line}` }}>
            <Num size={24}>{data.provas.length}</Num><Label>provas resolvidas</Label>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="px-6 py-6">
          <H color="var(--ok)" icon={<Flame size={16} />}>Hábitos da semana</H>
          <Label style={{ marginTop: 4 }}>zera toda segunda-feira</Label>
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: T.card2 }}>
              <Target size={16} style={{ color: qWeek >= data.goals.questions ? T.ok : T.faint, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{data.goals.questions} questões por semana</div>
                <div className="mt-2"><Track pct={(qWeek / data.goals.questions) * 100} color={qWeek >= data.goals.questions ? T.ok : T.dim} height={5} /></div>
              </div>
              <Num size={14} color={qWeek >= data.goals.questions ? T.ok : T.dim} weight={600}>{qWeek}</Num>
            </div>
            {data.habits.map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: T.card2 }}>
                <Tick on={!!habitsOn[h.id]} size={20} color={T.ok} label={h.text} onClick={() => toggleHabit(h.id)} />
                <span className="flex-1" style={{ fontSize: 14.5, color: habitsOn[h.id] ? T.dim : T.ink, textDecoration: habitsOn[h.id] ? "line-through" : "none" }}>{h.text}</span>
                <button type="button" aria-label="Excluir" className="toque"
                  onClick={() => setData((p) => ({ ...p, habits: p.habits.filter((y) => y.id !== h.id) }))}
                  style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer" }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <TextInput value={habit} placeholder="Novo hábito" onChange={(e) => setHabit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !habit.trim()) return;
                setData((p) => ({ ...p, habits: [...p.habits, { id: uid(), text: habit.trim() }] }));
                setHabit("");
              }} />
            <Btn onClick={() => {
              if (!habit.trim()) return;
              setData((p) => ({ ...p, habits: [...p.habits, { id: uid(), text: habit.trim() }] }));
              setHabit("");
            }}><Plus size={15} /></Btn>
          </div>
        </Card>

        <Card className="px-6 py-6">
          <H color="var(--a-PE)" icon={<ListChecks size={16} />}>Preciso rever</H>
          <Label style={{ marginTop: 4 }}>tema que travou, para não esquecer</Label>
          <div className="mt-4 flex gap-2">
            <TextInput value={rever} placeholder="Ex.: cistos de via biliar" onChange={(e) => setRever(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !rever.trim()) return;
                setData((p) => ({ ...p, rever: [{ id: uid(), text: rever.trim(), done: false }, ...p.rever] }));
                setRever("");
              }} />
            <Btn onClick={() => {
              if (!rever.trim()) return;
              setData((p) => ({ ...p, rever: [{ id: uid(), text: rever.trim(), done: false }, ...p.rever] }));
              setRever("");
            }}><Plus size={15} /></Btn>
          </div>
          {data.rever.length === 0 ? (
            <Blank icon={<ListChecks size={22} />} title="Nada pendente" hint="Anote aqui o que ficou frágil na aula." />
          ) : (
            <div className="mt-3 flex flex-col gap-1.5" style={{ maxHeight: 260, overflowY: "auto" }}>
              {data.rever.map((x) => (
                <div key={x.id} className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5" style={{ background: T.card2 }}>
                  <Tick on={x.done} size={19} label="Concluir"
                    onClick={() => setData((p) => ({ ...p, rever: p.rever.map((y) => y.id === x.id ? { ...y, done: !y.done } : y) }))} />
                  <span className="flex-1" style={{ fontSize: 14.5, color: x.done ? T.ghost : T.ink, textDecoration: x.done ? "line-through" : "none" }}>{x.text}</span>
                  <button type="button" aria-label="Excluir" className="toque"
                    onClick={() => setData((p) => ({ ...p, rever: p.rever.filter((y) => y.id !== x.id) }))}
                    style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer" }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="px-6 py-6">
        <H color="var(--a-GO)" icon={<CalendarDays size={16} />}>Google Agenda</H>
        <Label style={{ marginTop: 6, lineHeight: 1.6 }}>
          Manda o cronograma para a sua agenda. Sincronizar de novo atualiza os
          mesmos eventos em vez de criar cópias.
        </Label>
        <div className="mt-5 grid sm:grid-cols-2 gap-3">
          {[
            ["rotina", "Rotina e compromissos", contagem.rotina, "os fixos viram evento semanal"],
            ["revisoes", "Revisões pendentes", contagem.revisoes, "dia inteiro, próximos 8 meses"],
            ["simulados", "Janelas de simulado", contagem.simulados, "as que ainda não fez"],
            ["prova", "Data da prova", contagem.prova, data.profile.examDate ? brDate(data.profile.examDate) : "sem data definida"],
          ].map(([k, lb, qt, hint]) => (
            <label key={k} className="flex items-start gap-3 rounded-2xl px-4 py-3"
              style={{ background: T.card2, cursor: qt ? "pointer" : "not-allowed", opacity: qt ? 1 : 0.45 }}>
              <input type="checkbox" checked={!!cal[k] && !!qt} disabled={!qt}
                onChange={() => setCal((p) => ({ ...p, [k]: !p[k] }))} style={{ marginTop: 3, flexShrink: 0 }} />
              <span className="flex-1 min-w-0">
                <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{lb}</span>
                <Mini style={{ marginTop: 2 }}>{qt ? `${qt} · ${hint}` : hint}</Mini>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 items-center">
          {gcal && gcal.disponivel ? (
            <Btn tone="primary" disabled={!gcal.pronto || gcal.ocupado} onClick={() => gcal.sincronizar(cal)}>
              <RefreshCw size={15} />
              {gcal.ocupado
                ? (gcal.progresso ? `Enviando ${gcal.progresso.feito}/${gcal.progresso.total}` : "Conectando…")
                : gcal.conectado ? "Sincronizar agora" : "Conectar ao Google Agenda"}
            </Btn>
          ) : null}
          <Btn tone={gcal && gcal.disponivel ? "outline" : "primary"} onClick={exportarCalendario}>
            <Download size={15} /> Baixar arquivo .ics
          </Btn>
          {gcal && gcal.conectado ? <Btn tone="outline" size="sm" onClick={gcal.desconectar}>desconectar</Btn> : null}
        </div>
        {gcal && gcal.progresso ? (
          <div className="mt-4"><Track pct={(gcal.progresso.feito / Math.max(1, gcal.progresso.total)) * 100} color="var(--a-GO)" /></div>
        ) : null}
        {gcal && gcal.erro ? <Label style={{ marginTop: 12, color: T.bad }}>{gcal.erro}</Label> : null}
        {gcal && gcal.disponivel && gcal.ultima ? (
          <Mini style={{ marginTop: 12 }}>
            última sincronização em {brDate(toISO(new Date(gcal.ultima)))} às {pad(new Date(gcal.ultima).getHours())}:{pad(new Date(gcal.ultima).getMinutes())}
          </Mini>
        ) : null}
        <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
          {gcal && gcal.disponivel ? (
            <Mini style={{ lineHeight: 1.7 }}>
              O app cria uma agenda separada chamada {NOME_AGENDA} e escreve só
              dentro dela. Você pode esconder ou apagar essa agenda a qualquer
              momento sem afetar o resto.
            </Mini>
          ) : (
            <>
              <Label>Como importar o arquivo</Label>
              <ol style={{ margin: "10px 0 0", paddingLeft: 20, color: T.dim, fontSize: 15, lineHeight: 1.75 }}>
                <li>No computador, abra o Google Agenda e crie uma agenda nova chamada Estudos.</li>
                <li>Clique na engrenagem e vá em Importar e exportar.</li>
                <li>Escolha o arquivo baixado, selecione a agenda Estudos e importe.</li>
              </ol>
            </>
          )}
        </div>
      </Card>

      <Card className="px-6 py-6">
        <div className="flex items-center justify-between">
          <H color="var(--a-PR)" icon={<FileText size={16} />}>Anotações da semana</H>
          <Label>semana de {brDate(ws)}</Label>
        </div>
        <div className="mt-4">
          <Area value={note} placeholder="Como foi a semana, o que atrapalhou, o que ajustar"
            onChange={(e) => setData((p) => ({ ...p, notes: { ...p.notes, [ws]: e.target.value } }))} />
        </div>
      </Card>

      <Card className="px-6 py-6">
        <H color="var(--a-CI)" icon={<Zap size={16} />}>Metas e data da prova</H>
        <div className="mt-5 grid sm:grid-cols-4 gap-4">
          <NumField label="Meta diária (min)" value={data.goals.daily} min={5} max={1440}
            onCommit={(v) => setData((p) => ({ ...p, goals: { ...p.goals, daily: v } }))} />
          <NumField label="Meta semanal (min)" value={data.goals.weekly} min={10} max={10080}
            onCommit={(v) => setData((p) => ({ ...p, goals: { ...p.goals, weekly: v } }))} />
          <NumField label="Questões por semana" value={data.goals.questions} min={1} max={5000}
            onCommit={(v) => setData((p) => ({ ...p, goals: { ...p.goals, questions: v } }))} />
          <Field label="Data da prova">
            <TextInput type="date" value={data.profile.examDate}
              onChange={(e) => setData((p) => ({ ...p, profile: { ...p.profile, examDate: e.target.value } }))} />
          </Field>
        </div>
        <div className="mt-5">
          <Field label="Seu nome">
            <TextInput value={data.profile.name} placeholder="Como quer ser chamado"
              onChange={(e) => setData((p) => ({ ...p, profile: { ...p.profile, name: e.target.value } }))} />
          </Field>
        </div>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   16 · PROGRESSO
   ═══════════════════════════════════════════════════════════════════ */

function Heatmap({ byDay, today, weeks = 22 }) {
  const cells = [];
  const end = weekStart(today);
  const start = addDays(end, -7 * (weeks - 1));
  let max = 1;
  for (let i = 0; i < weeks * 7; i++) max = Math.max(max, byDay[addDays(start, i)] || 0);
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const iso = addDays(start, w * 7 + d);
      const v = byDay[iso] || 0;
      const lvl = v === 0 ? 0 : v < max * 0.25 ? 1 : v < max * 0.5 ? 2 : v < max * 0.75 ? 3 : 4;
      col.push({ iso, v, lvl, future: iso > today });
    }
    cells.push(col);
  }
  const shade = [T.card2, soft("var(--ok)", 22), soft("var(--ok)", 42), soft("var(--ok)", 68), "var(--ok)"];
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1" style={{ minWidth: weeks * 15 }}>
        {cells.map((col, i) => (
          <div key={i} className="flex flex-col gap-1">
            {col.map((c) => (
              <div key={c.iso} title={`${brDate(c.iso)} · ${fmtMin(c.v)}`}
                style={{
                  width: 11, height: 11, borderRadius: 3,
                  background: c.future ? "transparent" : shade[c.lvl],
                  border: c.future ? `1px dashed ${T.line}` : "none",
                }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   16c · CUPOM
   O código é conferido no servidor, nunca aqui: se a lista de cupons
   estivesse no navegador, bastaria abrir o código-fonte da página para
   descobrir todos. Daqui só sai o que a pessoa digitou.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_CUPOM = "/api/cupom";

async function resgatarCupom(nuvem, codigo) {
  let token = "";
  try {
    if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
      token = await nuvem.sdk.auth.currentUser.getIdToken();
    }
  } catch (e) { /* segue sem token, o servidor recusa */ }
  if (!token) return { erro: "Entre na sua conta antes de resgatar o cupom." };

  /* 404 com JSON é cupom inválido; sem JSON é servidor ausente */
  const { dados, erro } = await chamarApi(
    ROTA_CUPOM, { token, codigo }, "O resgate de cupom");
  return erro ? { erro } : dados;
}

/* Caixa avulsa, para quem já tem conta criada. */
function Cupom({ nuvem, notify, aoLiberar }) {
  const [codigo, setCodigo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  const [bom, setBom] = useState(false);

  const enviar = async () => {
    if (!codigo.trim()) { setBom(false); setMsg("Escreva o código."); return; }
    setOcupado(true); setMsg("");
    const j = await resgatarCupom(nuvem, codigo.trim());
    setOcupado(false);
    setBom(!!j.ok);
    setMsg(j.erro || j.mensagem || "");
    if (j.ok) {
      setCodigo(""); notify(j.mensagem || "Acesso liberado.");
      /* A assinatura acabou de ser gravada pelo servidor. Perguntar de novo
         agora é o que abre as abas na hora, sem depender de o navegador
         conseguir ler a coleção por conta própria. */
      if (aoLiberar) aoLiberar();
    }
  };

  return (
    <Card className="px-6 py-6" brilho="var(--ok)">
      <H size={18} color="var(--ok)" icon={<Sparkles size={16} />}>Tenho um cupom</H>
      <Texto style={{ marginTop: 10 }}>
        Recebeu um código de liberação? Escreva aqui para abrir o plano completo
        na sua conta.
      </Texto>
      <div className="mt-5 flex gap-2 flex-wrap items-end">
        <div style={{ flex: 1, minWidth: 200 }}>
          <Field label="Código do cupom">
            <TextInput value={codigo} placeholder="Ex.: meucupom" autoCapitalize="none"
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} />
          </Field>
        </div>
        <Btn tone="primary" onClick={enviar} disabled={ocupado}>
          {ocupado ? "Conferindo…" : "Resgatar"}
        </Btn>
      </div>
      {msg ? (
        <Label style={{ marginTop: 14, color: bom ? T.ok : T.bad, textTransform: "none", letterSpacing: 0, fontSize: 14.5 }}>
          {msg}
        </Label>
      ) : null}
    </Card>
  );
}

function ContaNuvem({ nuvem, notify }) {
  const [modo, setModo] = useState("entrar");
  /* Marcado por padrão: é o que a maioria quer, e quem está num computador
     de todo mundo desmarca. */
  const [manter, setManter] = useState(true);
  const [f, setF] = useState({ nome: "", email: "", senha: "", cupom: "" });
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  if (!nuvem.ligado) {
    return (
      <Card className="px-6 py-6">
        <H size={18} color="var(--faint)" icon={<CloudOff size={16} />}>Sincronização desligada</H>
        <Texto style={{ marginTop: 10 }}>
          Os dados ficam guardados só neste navegador. Quem publica o site pode
          ligar as contas preenchendo a configuração no topo do arquivo HTML.
        </Texto>
      </Card>
    );
  }
  if (nuvem.estado === "carregando") {
    return (
      <Card className="px-6 py-6">
        <H size={18} color="var(--a-GO)" icon={<RefreshCw size={16} />}>Conta</H>
        <Label style={{ marginTop: 8 }}>Conectando ao servidor…</Label>
      </Card>
    );
  }
  if (nuvem.estado === "erro") {
    return (
      <Card className="px-6 py-6">
        <H size={18} color="var(--bad)" icon={<CloudOff size={16} />}>Sincronização indisponível</H>
        <Texto style={{ marginTop: 10 }}>{nuvem.erro} Seus dados continuam salvos neste aparelho.</Texto>
      </Card>
    );
  }
  if (nuvem.usuario) {
    return (
      <Card className="px-6 py-6">
        <H size={18} color="var(--ok)" icon={<Cloud size={16} />}>Conta conectada</H>
        <div className="mt-5 flex items-center gap-3 rounded-2xl px-4 py-3.5" style={{ background: T.card2 }}>
          <span className="flex items-center justify-center rounded-full"
            style={{ width: 38, height: 38, background: soft("var(--ok)", 18), color: T.ok, flexShrink: 0 }}>
            <User size={17} />
          </span>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nuvem.usuario.email}</div>
            <Mini style={{ marginTop: 2 }}>
              {nuvem.ultima ? `sincronizado às ${pad(new Date(nuvem.ultima).getHours())}:${pad(new Date(nuvem.ultima).getMinutes())}` : "aguardando primeira sincronização"}
            </Mini>
          </div>
        </div>
        {nuvem.erro ? <Label style={{ marginTop: 12, color: T.bad }}>{nuvem.erro}</Label> : null}
        {!nuvem.sincroniza ? (
          <div className="mt-4 rounded-2xl px-4 py-3.5" style={{ background: soft("var(--neon2)", 12), border: `1px solid ${soft("var(--neon2)", 30)}` }}>
            <Mini style={{ lineHeight: 1.65, color: T.ink }}>
              Sua conta está criada, mas a sincronização entre aparelhos faz parte
              do plano completo. Por enquanto os dados ficam salvos só aqui, e o
              backup em arquivo continua liberado.
            </Mini>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          {nuvem.sincroniza ? (
            <Btn onClick={() => { nuvem.enviar(); notify("Enviando para a nuvem."); }}><RefreshCw size={15} /> Sincronizar agora</Btn>
          ) : null}
          {nuvem.temBackup ? <Btn tone="outline" onClick={nuvem.restaurarBackup}>Recuperar cópia local anterior</Btn> : null}
          <Btn tone="danger" onClick={nuvem.sair}><LogOut size={15} /> Sair da conta</Btn>
        </div>
      </Card>
    );
  }

  const enviarForm = async () => {
    setMsg(""); setOcupado(true);
    let e = null;
    if (modo === "entrar") e = await nuvem.entrar(f.email, f.senha, manter);
    else if (modo === "criar") e = await nuvem.cadastrar(f.nome, f.email, f.senha);
    else {
      e = await nuvem.recuperar(f.email);
      if (!e) { setMsg("Enviei um link de redefinição para o seu e-mail."); setOcupado(false); return; }
    }
    setOcupado(false);
    if (e) { setMsg(e); return; }

    /* Conta criada. Se veio cupom junto, ele é resgatado agora, já com a
       sessão aberta: o servidor precisa do token para saber de quem é. */
    const cod = f.cupom.trim();
    setF({ nome: "", email: "", senha: "", cupom: "" });
    if (!cod) return;
    setOcupado(true);
    const j = await resgatarCupom(nuvem, cod);
    setOcupado(false);
    if (j.ok) {
      setMsg(j.mensagem || "Cupom aceito."); notify(j.mensagem || "Acesso liberado.");
      if (aoLiberar) aoLiberar();
    }
    else setMsg(`Conta criada, mas o cupom não passou: ${j.erro}`);
  };

  return (
    <Card className="px-6 py-6">
      <H size={18} color="var(--a-GO)" icon={<Cloud size={16} />}>Conta</H>
      <Texto style={{ marginTop: 10 }}>
        Criar uma conta guarda seus dados no servidor e deixa continuar de onde
        parou em qualquer aparelho.
      </Texto>
      <div className="flex gap-2 mt-5 flex-wrap">
        {[["entrar", "Entrar"], ["criar", "Criar conta"], ["senha", "Esqueci a senha"]].map(([id, lb]) => (
          <button key={id} type="button" onClick={() => { setModo(id); setMsg(""); }} className="toque-larg rounded-full px-4 py-2"
            style={{
              background: modo === id ? T.card3 : "transparent",
              border: `1px solid ${modo === id ? "transparent" : T.line}`,
              color: modo === id ? T.ink : T.dim, fontSize: 14, fontWeight: modo === id ? 700 : 500, cursor: "pointer",
            }}>{lb}</button>
        ))}
      </div>
      <div className="mt-5 grid sm:grid-cols-2 gap-4">
        {modo === "criar" ? (
          <Field label="Seu nome"><TextInput value={f.nome} placeholder="Como quer ser chamado" onChange={(e) => set("nome", e.target.value)} /></Field>
        ) : null}
        <Field label="E-mail">
          <TextInput type="email" autoComplete="email" value={f.email} placeholder="voce@email.com" onChange={(e) => set("email", e.target.value)} />
        </Field>
        {modo === "criar" ? (
          <Field label="Cupom (opcional)">
            <TextInput value={f.cupom} placeholder="Se você recebeu um código" autoCapitalize="none"
              onChange={(e) => set("cupom", e.target.value)} />
          </Field>
        ) : null}
        {modo !== "senha" ? (
          <Field label="Senha">
            <TextInput type="password" value={f.senha} placeholder="mínimo 6 caracteres"
              autoComplete={modo === "criar" ? "new-password" : "current-password"}
              onChange={(e) => set("senha", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") enviarForm(); }} />
          </Field>
        ) : null}
      </div>
      {modo === "entrar" ? (
        <label className="mt-4 flex items-center gap-2.5" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={manter} onChange={(e) => setManter(e.target.checked)} />
          <span style={{ fontSize: 13.5, color: T.dim }}>
            Manter conectado
            <span style={{ color: T.ghost }}>
              {" · "}desmarque num computador compartilhado: a sessão acaba ao fechar o navegador
            </span>
          </span>
        </label>
      ) : null}
      {msg ? <Label style={{ marginTop: 14, lineHeight: 1.5, textTransform: "none", letterSpacing: 0, fontSize: 14.5, color: /^(Enviei|Cupom aceito)/.test(msg) ? T.ok : T.bad }}>{msg}</Label> : null}
      <div className="mt-5">
        <Btn tone="primary" onClick={enviarForm} disabled={ocupado}>
          {ocupado ? "Aguarde…" : modo === "entrar" ? "Entrar" : modo === "criar" ? "Criar conta" : "Enviar link"}
        </Btn>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   16b · APARÊNCIA
   Cor de acento, fonte e tamanho do texto. A escolha vira variável CSS
   no <html>, feito pelo componente raiz, então vale em toda a interface
   sem precisar passar nada de mão em mão.
   ═══════════════════════════════════════════════════════════════════ */

const TAMANHOS = [
  { v: 0.9, rotulo: "Menor" },
  { v: 1, rotulo: "Padrão" },
  { v: 1.1, rotulo: "Maior" },
  { v: 1.2, rotulo: "Bem maior" },
];

function Aparencia({ data, setData }) {
  const tema = data.tema || DEFAULTS.tema;
  const mudar = (patch) => setData((p) => ({ ...p, tema: { ...(p.tema || DEFAULTS.tema), ...patch } }));
  const propria = tema.cor === "propria";

  return (
    <Card className="px-6 py-6" brilho="var(--neon2)">
      <H size={18} color="var(--neon2)" icon={<Sparkles size={16} />}>Aparência</H>
      <Texto style={{ marginTop: 10 }}>
        A cor de acento, a fonte e o tamanho do texto. As cores das cinco áreas
        continuam as mesmas, para você não perder a referência do laranja da
        Clínica, do verde da Cirurgia e assim por diante.
      </Texto>

      {/* ── claro ou escuro ─────────────────────────────────────────── */}
      <div className="mt-6">
        <Label>Fundo</Label>
        <div className="flex gap-2 mt-3 flex-wrap">
          {[["dark", "Escuro", <Moon size={14} key="e" />], ["light", "Claro", <Sun size={14} key="c" />]].map(([id, lb, ic]) => (
            <button key={id} type="button" onClick={() => setData((p) => ({ ...p, theme: id }))}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 brilhar"
              style={{
                background: data.theme === id ? T.card3 : "transparent",
                border: `1px solid ${data.theme === id ? "transparent" : T.line}`,
                color: data.theme === id ? T.ink : T.dim,
                fontSize: 14, fontWeight: data.theme === id ? 700 : 500, cursor: "pointer",
              }}>{ic} {lb}</button>
          ))}
        </div>
      </div>

      {/* ── cor de acento ───────────────────────────────────────────── */}
      <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
        <Label>Cor de acento</Label>
        <div className="flex flex-wrap gap-2.5 mt-3">
          {CORES_TEMA.map((c) => {
            const on = tema.cor === c.id;
            return (
              <button key={c.id} type="button" title={c.nome}
                onClick={() => mudar({ cor: c.id })}
                className="flex items-center gap-2.5 rounded-full px-3 py-2 brilhar"
                style={{
                  background: on ? T.card3 : "transparent",
                  border: `1px solid ${on ? soft(c.neon2, 60) : T.line}`,
                  cursor: "pointer", color: on ? T.ink : T.dim, fontSize: 13.5,
                  fontWeight: on ? 700 : 500,
                }}>
                <span style={{
                  width: 20, height: 20, borderRadius: 99, flexShrink: 0,
                  background: `linear-gradient(135deg, ${c.neon}, ${c.neon2})`,
                  boxShadow: on ? `0 0 14px ${c.neon2}` : "none",
                }} />
                {c.nome}
              </button>
            );
          })}
          <button type="button" onClick={() => mudar({
            cor: "propria",
            neon: tema.neon || CORES_TEMA[0].neon,
            neon2: tema.neon2 || CORES_TEMA[0].neon2,
          })}
            className="flex items-center gap-2.5 rounded-full px-3 py-2 brilhar"
            style={{
              background: propria ? T.card3 : "transparent",
              border: `1px solid ${propria ? T.line2 : T.line}`,
              cursor: "pointer", color: propria ? T.ink : T.dim, fontSize: 13.5,
              fontWeight: propria ? 700 : 500,
            }}>
            <Settings2 size={15} /> Escolher
          </button>
        </div>

        {propria ? (
          <div className="flex flex-wrap gap-4 mt-4">
            {[["neon", "Primeira cor"], ["neon2", "Segunda cor"]].map(([k, lb]) => (
              <label key={k} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background: T.card2, border: `1px solid ${T.line}`, cursor: "pointer" }}>
                <input type="color" value={tema[k] || "#A855F7"}
                  onChange={(e) => mudar({ [k]: e.target.value })}
                  style={{ width: 30, height: 30, border: "none", background: "none", padding: 0, cursor: "pointer" }} />
                <span>
                  <Label>{lb}</Label>
                  <Mini style={{ fontFamily: F_MONO, marginTop: 2 }}>{tema[k] || "—"}</Mini>
                </span>
              </label>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── fonte ───────────────────────────────────────────────────── */}
      <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
        <Label>Fonte da interface</Label>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-3">
          {FONTES.map((f) => {
            const on = tema.fonte === f.id;
            return (
              <button key={f.id} type="button" onClick={() => mudar({ fonte: f.id })}
                className="rounded-2xl px-4 py-3 text-left brilhar"
                style={{
                  background: on ? soft("var(--neon2)", 13) : T.card2,
                  border: `1px solid ${on ? soft("var(--neon2)", 50) : T.line}`,
                  cursor: "pointer", color: T.ink,
                }}>
                {/* a amostra é escrita na própria fonte, para dar para comparar */}
                <div style={{ fontFamily: f.ui, fontSize: 17, fontWeight: 600 }}>{f.nome}</div>
                <div style={{ fontFamily: f.ui, fontSize: 13, color: T.faint, marginTop: 3 }}>{f.amostra}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── tamanho ─────────────────────────────────────────────────── */}
      <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
        <Label>Tamanho do texto</Label>
        <div className="flex gap-2 mt-3 flex-wrap">
          {TAMANHOS.map((t) => {
            const on = Math.abs((Number(tema.tamanho) || 1) - t.v) < 0.01;
            return (
              <button key={t.v} type="button" onClick={() => mudar({ tamanho: t.v })}
                className="rounded-full px-4 py-2 brilhar"
                style={{
                  background: on ? T.card3 : "transparent",
                  border: `1px solid ${on ? "transparent" : T.line}`,
                  color: on ? T.ink : T.dim, cursor: "pointer",
                  fontSize: Math.round(13 * t.v), fontWeight: on ? 700 : 500,
                }}>{t.rotulo}</button>
            );
          })}
        </div>
        <Mini style={{ marginTop: 10, lineHeight: 1.6 }}>
          Aumenta o texto e os espaços junto, para nada ficar apertado. Vale
          para o painel inteiro, menos o fundo animado.
        </Mini>
      </div>

      <div className="mt-6 pt-5 flex items-center gap-3 flex-wrap" style={{ borderTop: `1px solid ${T.line}` }}>
        <Btn tone="outline" size="sm" onClick={() => setData((p) => ({ ...p, tema: { ...DEFAULTS.tema } }))}>
          <RotateCcw size={13} /> voltar ao padrão
        </Btn>
        <Mini>a escolha fica guardada com o resto dos seus dados</Mini>
      </div>
    </Card>
  );
}

function Progresso({ data, setData, byDay, today, totals, subjects, notify, nuvem, pro, aoLiberar }) {
  const [confirm, setConfirm] = useState(false);
  const fileRef = useRef(null);

  const last14 = useMemo(() => {
    const out = [];
    for (let i = 13; i >= 0; i--) {
      const iso = addDays(today, -i);
      out.push({ dia: brDate(iso).slice(0, 5), min: byDay[iso] || 0 });
    }
    return out;
  }, [byDay, today]);

  const areaMin = useMemo(() => {
    const m = {};
    for (const s of data.sessions) if (s.area) m[s.area] = (m[s.area] || 0) + (s.minutes || 0);
    return AREA_IDS.map((a) => ({ a, min: m[a] || 0 })).filter((x) => x.min > 0);
  }, [data.sessions]);

  const perfLine = useMemo(() => {
    const m = {};
    for (const s of data.sessions) {
      if (!s.questions) continue;
      if (!m[s.date]) m[s.date] = { q: 0, ok: 0 };
      m[s.date].q += s.questions; m[s.date].ok += s.correct || 0;
    }
    return Object.keys(m).sort().slice(-20).map((d) => ({ dia: brDate(d).slice(0, 5), pct: Math.round((m[d].ok / m[d].q) * 100) }));
  }, [data.sessions]);

  const kindMin = useMemo(() => {
    const m = {};
    for (const s of data.sessions) m[s.kind] = (m[s.kind] || 0) + (s.minutes || 0);
    return KINDS.map((k) => ({ k, min: m[k] || 0 })).filter((x) => x.min > 0).sort((a, b) => b.min - a.min);
  }, [data.sessions]);

  const tip = { background: T.card3, border: `1px solid ${T.line}`, borderRadius: 14, color: T.ink, fontSize: 13.5, boxShadow: T.shadow };
  const media = Math.round(last14.reduce((a, d) => a + d.min, 0) / 14);
  const ativos = last14.filter((d) => d.min > 0).length;
  const doneCount = subjects.filter((s) => s.aula).length;
  const bonusCount = subjects.reduce((a, s) => a + s.bonusCount, 0);

  const exportar = () => {
    const txt = JSON.stringify(data, null, 2);
    if (baixar(`cadencia-${today}.json`, "application/json", txt, notify)) notify("Backup baixado.");
  };

  const importar = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const novo = normalize(JSON.parse(String(rd.result)));
        setData(novo);
        const aulas = Object.values(novo.marks || {}).filter((m) => m && m.aula).length;
        const degraus = Object.values(novo.reviews || {}).reduce((a, r) => a + Object.keys((r && r.done) || {}).length, 0);
        notify(`Restaurado: ${aulas} aula${aulas === 1 ? "" : "s"} e ${degraus} revis${degraus === 1 ? "ão" : "ões"}.`);
      } catch (err) { notify("Arquivo inválido."); }
    };
    rd.onerror = () => notify("Não consegui ler o arquivo.");
    rd.readAsText(f);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-5">
      <ContaNuvem nuvem={nuvem} notify={notify} />
      {nuvem.usuario && !pro ? <Cupom nuvem={nuvem} notify={notify} aoLiberar={aoLiberar} /> : null}
      {ehDono(nuvem.usuario) ? <PainelDono nuvem={nuvem} notify={notify} /> : null}
      <Aparencia data={data} setData={setData} />

      <Card className="px-6 sm:px-8 py-7">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-7">
          <div><Num size={34}>{fmtMin(totals.min)}</Num><Label style={{ marginTop: 9 }}>horas registradas</Label></div>
          <div><Num size={34}>{data.sessions.length}</Num><Label style={{ marginTop: 9 }}>sessões</Label></div>
          <div><Num size={34}>{fmtMin(media)}</Num><Label style={{ marginTop: 9 }}>média em 14 dias · {ativos} ativos</Label></div>
          <div>
            <Num size={34} color={totals.pct === null ? T.dim : totals.pct >= 80 ? T.ok : totals.pct >= 61 ? T.warn : T.bad}>
              {totals.pct === null ? "—" : `${totals.pct}%`}
            </Num>
            <Label style={{ marginTop: 9 }}>{totals.q ? `acerto em ${totals.q} questões` : "sem questões lançadas"}</Label>
          </div>
        </div>
      </Card>

      <Card className="px-6 py-6">
        <H size={18} color="var(--ok)" icon={<Flame size={16} />}>Constância</H>
        <Label style={{ marginTop: 4 }}>cada quadradinho é um dia, das últimas 22 semanas</Label>
        <div className="mt-5"><Heatmap byDay={byDay} today={today} /></div>
      </Card>

      <Card className="px-5 sm:px-7 py-6">
        <H size={18} color="var(--a-CL)" icon={<BarChart3 size={16} />}>Minutos por dia</H>
        <div className="mt-5" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last14} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 5" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="dia" tick={{ fill: "var(--ghost)", fontSize: 10, fontFamily: F_MONO }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--ghost)", fontSize: 10, fontFamily: F_MONO }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tip} cursor={{ fill: "var(--line)" }} formatter={(v) => [fmtMin(v), "estudo"]} />
              <Bar dataKey="min" fill="var(--a-CL)" radius={[6, 6, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="px-6 py-6">
          <H size={18} color="var(--a-GO)" icon={<Layers size={16} />}>Onde o tempo foi</H>
          {areaMin.length === 0 ? (
            <Blank icon={<BarChart3 size={22} />} title="Sem dados" hint="Registre sessões ligadas a uma matéria." />
          ) : (
            <div className="mt-5 flex flex-col gap-4">
              {areaMin.slice().sort((a, b) => b.min - a.min).map((x) => {
                const max = Math.max.apply(null, areaMin.map((y) => y.min)) || 1;
                return (
                  <div key={x.a}>
                    <div className="flex items-center justify-between mb-2">
                      <Chip area={x.a} small />
                      <Num size={13} color={T.dim} weight={500}>{fmtMin(x.min)}</Num>
                    </div>
                    <Track pct={(x.min / max) * 100} color={aColor(x.a)} height={5} />
                  </div>
                );
              })}
              {kindMin.length ? (
                <div className="pt-4 mt-1" style={{ borderTop: `1px solid ${T.line}` }}>
                  <Label>Por tipo de estudo</Label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {kindMin.map((x) => (
                      <span key={x.k} className="rounded-full px-3 py-1.5" style={{ background: T.card2, fontSize: 13, color: T.dim }}>
                        {x.k} <span style={{ fontFamily: F_MONO, color: T.ink }}>{fmtMin(x.min)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Card>

        <Card className="px-6 py-6">
          <H size={18} color="var(--a-CI)" icon={<ListChecks size={16} />}>Acerto ao longo do tempo</H>
          {perfLine.length < 2 ? (
            <Blank icon={<ListChecks size={22} />} title="Poucos dados" hint="A curva aparece com dois dias de questões lançadas." />
          ) : (
            <div className="mt-5" style={{ height: 195 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={perfLine} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 5" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fill: "var(--ghost)", fontSize: 10, fontFamily: F_MONO }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: "var(--ghost)", fontSize: 10, fontFamily: F_MONO }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tip} formatter={(v) => [`${v}%`, "acerto"]} />
                  <Line type="monotone" dataKey="pct" stroke="var(--a-CI)" strokeWidth={2} dot={{ r: 3, fill: "var(--a-CI)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card className="px-6 py-6">
        <H size={18} color="var(--a-PR)" icon={<Download size={16} />}>Seus dados</H>
        <Label style={{ marginTop: 4 }}>
          {doneCount} de {subjects.length} aulas e {bonusCount} de {TOTAL_BONUS} tópicos marcados
        </Label>
        <div className="mt-5 flex flex-wrap gap-2">
          <Btn onClick={exportar}><Download size={15} /> Baixar backup</Btn>
          <Btn onClick={() => fileRef.current && fileRef.current.click()}><Upload size={15} /> Restaurar backup</Btn>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={importar} style={{ display: "none" }} />
          {confirm ? (
            <>
              <Btn tone="danger" onClick={() => { setData({ ...DEFAULTS, theme: data.theme, layout: data.layout, tema: data.tema, revisao: data.revisao }); setConfirm(false); notify("Tudo apagado."); }}>
                <Trash2 size={15} /> Confirmar
              </Btn>
              <Btn tone="outline" onClick={() => setConfirm(false)}>Cancelar</Btn>
            </>
          ) : (
            <Btn tone="danger" onClick={() => setConfirm(true)}><Trash2 size={15} /> Apagar tudo</Btn>
          )}
        </div>
        {confirm ? (
          <Label style={{ marginTop: 14, color: T.bad }}>
            Isso apaga sessões, marcações, revisões, cartões, pastas, rotina, metas
            e anotações. A aparência e o esquema de revisão continuam como estão.
            Baixe um backup antes.
          </Label>
        ) : null}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   17 · ONBOARDING
   ═══════════════════════════════════════════════════════════════════ */

function Onboarding({ onDone, theme, toggleTheme, nuvem, aoLiberar }) {
  /* A primeira tela pede conta, não nome.
   *
   * Pedir só o nome deixava a pessoa entrar sem conta, estudar, e descobrir
   * depois que nada daquilo estava sincronizado. Aqui a conta vem primeiro,
   * e quem quiser experimentar antes tem a saída logo abaixo — quem faz a
   * conta depois traz junto o que já anotou, porque os dados são deste
   * aparelho até o primeiro envio. */
  const [modo, setModo] = useState("entrar");   // entrar | criar
  const [f, setF] = useState({ nome: "", email: "", senha: "", cupom: "" });
  const [manter, setManter] = useState(true);
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [semConta, setSemConta] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const enviar = async () => {
    if (!f.email.trim()) { setMsg("Escreva seu e-mail."); return; }
    if (!f.senha) { setMsg("Escreva sua senha."); return; }
    setMsg(""); setOcupado(true);
    const e = modo === "entrar"
      ? await nuvem.entrar(f.email, f.senha, manter)
      : await nuvem.cadastrar(f.nome, f.email, f.senha);
    setOcupado(false);
    if (e) { setMsg(e); return; }
    /* Criar conta já marca as boas-vindas como vistas, com o nome digitado;
       entrar numa conta existente é tratado no componente raiz, que fecha
       esta tela assim que a sessão abre. */
    if (modo === "criar") {
      onDone(f.nome.trim() || "Estudante");
      const cod = f.cupom.trim();
      if (cod) {
        setOcupado(true);
        const j = await resgatarCupom(nuvem, cod);
        setOcupado(false);
        if (!j.ok) setMsg(`Conta criada, mas o cupom não passou: ${j.erro}`);
      }
    }
  };

  const cabecalho = (
    <>
      <div className="flex justify-end mb-4">
        <button type="button" aria-label="Alternar tema" onClick={toggleTheme}
          className="flex items-center justify-center rounded-full"
          style={{ width: 38, height: 38, background: T.card, border: `1px solid ${T.line}`, color: T.dim, cursor: "pointer" }}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
      <div className="flex items-center gap-2.5">
        <h1 style={{ fontFamily: F_SERIF, fontSize: 38, fontWeight: 400, margin: 0, lineHeight: 1 }}>Cadência</h1>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: T.warn }} />
      </div>
    </>
  );

  const moldura = (dentro) => (
    <div className="flex items-center justify-center px-6" style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
      <div style={{ width: "100%", maxWidth: 460 }}>{dentro}</div>
    </div>
  );

  /* Sem sincronização configurada, ou com ela fora do ar, não há conta a
     pedir: continua valendo a entrada pelo nome. */
  if (!nuvem || !nuvem.ligado || nuvem.estado === "erro" || semConta) {
    return moldura(
      <>
        {cabecalho}
        <Card className="px-7 sm:px-9 py-9" style={{ boxShadow: T.shadow }}>
          <p style={{ color: T.dim, fontSize: 15, lineHeight: 1.6, marginTop: 4 }}>
            Painel de estudos e rotina para residência médica. Traz o cronograma
            completo com {CURRICULUM.length} aulas principais e {TOTAL_BONUS} tópicos,
            cronômetro, escada de revisão espaçada e acompanhamento por especialidade.
          </p>
          <div className="mt-7">
            <Field label="Como quer ser chamado">
              <TextInput value={f.nome} placeholder="Seu nome" autoFocus
                onChange={(e) => set("nome", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onDone(f.nome.trim() || "Estudante"); }} />
            </Field>
          </div>
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <Btn tone="primary" onClick={() => onDone(f.nome.trim() || "Estudante")}>
              Começar <ArrowUpRight size={15} />
            </Btn>
            {semConta ? (
              <Btn tone="outline" size="sm" onClick={() => { setSemConta(false); setMsg(""); }}>
                voltar para a conta
              </Btn>
            ) : <Label>dá para criar conta depois e sincronizar</Label>}
          </div>
        </Card>
      </>
    );
  }

  return moldura(
    <>
      {cabecalho}
      <Card className="px-7 sm:px-9 py-9" style={{ boxShadow: T.shadow }}>
        <p style={{ color: T.dim, fontSize: 15, lineHeight: 1.6, marginTop: 4 }}>
          Painel de estudos para residência médica: {CURRICULUM.length} aulas,
          revisão espaçada, cartões e rotina. Entre na sua conta para continuar
          de onde parou em qualquer aparelho.
        </p>

        <div className="flex gap-2 mt-6 flex-wrap">
          {[["entrar", "Entrar"], ["criar", "Criar conta"]].map(([id, lb]) => (
            <button key={id} type="button" onClick={() => { setModo(id); setMsg(""); }}
              className="toque-larg rounded-full px-4 py-2"
              style={{
                background: modo === id ? T.card3 : "transparent",
                border: `1px solid ${modo === id ? "transparent" : T.line}`,
                color: modo === id ? T.ink : T.dim,
                fontSize: 14, fontWeight: modo === id ? 700 : 500, cursor: "pointer",
              }}>{lb}</button>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-4">
          {modo === "criar" ? (
            <Field label="Seu nome">
              <TextInput value={f.nome} placeholder="Como quer ser chamado" autoFocus
                onChange={(e) => set("nome", e.target.value)} />
            </Field>
          ) : null}
          <Field label="E-mail">
            <TextInput type="email" autoComplete="email" value={f.email} placeholder="voce@email.com"
              autoFocus={modo === "entrar"}
              onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Senha">
            <TextInput type="password" value={f.senha} placeholder="mínimo 6 caracteres"
              autoComplete={modo === "criar" ? "new-password" : "current-password"}
              onChange={(e) => set("senha", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} />
          </Field>
          {modo === "criar" ? (
            <Field label="Cupom (opcional)">
              <TextInput value={f.cupom} placeholder="Se você recebeu um código" autoCapitalize="none"
                onChange={(e) => set("cupom", e.target.value)} />
            </Field>
          ) : null}
        </div>

        {modo === "entrar" ? (
          <label className="mt-4 flex items-center gap-2.5" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={manter} onChange={(e) => setManter(e.target.checked)} />
            <span style={{ fontSize: 13.5, color: T.dim }}>
              Manter conectado
              <span style={{ color: T.ghost }}>
                {" · "}desmarque num computador compartilhado
              </span>
            </span>
          </label>
        ) : null}

        {msg ? (
          <Label style={{ marginTop: 14, lineHeight: 1.5, textTransform: "none", letterSpacing: 0, fontSize: 14.5, color: T.bad }}>
            {msg}
          </Label>
        ) : null}

        <div className="mt-6 flex items-center gap-3 flex-wrap">
          <Btn tone="primary" onClick={enviar} disabled={ocupado || nuvem.estado === "carregando"}>
            {ocupado ? "Aguarde…" : nuvem.estado === "carregando" ? "Conectando…"
              : modo === "entrar" ? "Entrar" : "Criar conta"}
            <ArrowUpRight size={15} />
          </Btn>
          <button type="button" onClick={() => { setSemConta(true); setMsg(""); }}
            style={{ background: "none", border: "none", color: T.faint, fontSize: 13.5, cursor: "pointer", textDecoration: "underline" }}>
            usar sem conta por enquanto
          </button>
        </div>
      </Card>
    </>
  );
}
