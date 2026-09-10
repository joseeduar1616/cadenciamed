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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
                  <span className="flex-1 min-w-0" style={{ fontSize: 14.5 }}>{x.text}</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
                <span className="flex-1 min-w-0" style={{ fontSize: 14.5, color: habitsOn[h.id] ? T.dim : T.ink, textDecoration: habitsOn[h.id] ? "line-through" : "none" }}>{h.text}</span>
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
                  <span className="flex-1 min-w-0" style={{ fontSize: 14.5, color: x.done ? T.ghost : T.ink, textDecoration: x.done ? "line-through" : "none" }}>{x.text}</span>
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
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
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

        {/* A ligação de vez. Sem ela o Google devolve um token que vale cerca
            de uma hora e some quando o aplicativo fecha, e a autorização
            volta a aparecer toda vez que a pessoa abre o site. */}
        {gcal && gcal.disponivel && gcal.podeLigarDeVez ? (
          <div className="mt-4 rounded-2xl px-4 py-4"
            style={{
              background: soft(gcal.permanente ? "var(--ok)" : "var(--a-GO)", 10),
              border: `1px solid ${soft(gcal.permanente ? "var(--ok)" : "var(--a-GO)", 30)}`,
            }}>
            {gcal.permanente ? (
              <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                <span style={{ fontSize: 14.5, fontWeight: 600, color: T.ok }}>
                  Conta do Google ligada de vez
                </span>
                <Mini>não precisa autorizar de novo ao abrir o app</Mini>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>
                  Cansado de autorizar toda vez que abre?
                </div>
                <Mini style={{ marginTop: 6, lineHeight: 1.6 }}>
                  Ligue a conta de vez: você autoriza uma única vez e o site
                  renova o acesso sozinho daí em diante, sem abrir janela
                  nenhuma. Dá para desligar quando quiser.
                </Mini>
                <div className="mt-4">
                  <Btn size="sm" tone="primary" disabled={!gcal.pronto} onClick={gcal.ligarDeVez}>
                    Ligar a conta de vez
                  </Btn>
                </div>
              </>
            )}
          </div>
        ) : null}
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
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-4 gap-4">
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
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="mt-4">
            <div className="flex flex-wrap gap-4 items-center">
              <label className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background: T.card2, border: `1px solid ${T.line}`, cursor: "pointer" }}>
                <input type="color" value={tema.neon || "#A855F7"}
                  onChange={(e) => {
                    const nova = corLegivel(e.target.value);
                    /* a segunda cor só é preenchida sozinha na primeira vez —
                       depois que a pessoa mexeu nela, trocar a primeira não
                       apaga a escolha dela. */
                    mudar({ neon: nova, neon2: tema.neon2 || corCombinando(nova) });
                  }}
                  style={{ width: 30, height: 30, border: "none", background: "none", padding: 0, cursor: "pointer" }} />
                <span>
                  <Label>Primeira cor</Label>
                  <Mini style={{ fontFamily: F_MONO, marginTop: 2 }}>{tema.neon || "—"}</Mini>
                </span>
              </label>
              <label className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background: T.card2, border: `1px solid ${T.line}`, cursor: "pointer" }}>
                <input type="color" value={tema.neon2 || "#A855F7"}
                  onChange={(e) => mudar({ neon2: corLegivel(e.target.value) })}
                  style={{ width: 30, height: 30, border: "none", background: "none", padding: 0, cursor: "pointer" }} />
                <span>
                  <Label>Segunda cor</Label>
                  <Mini style={{ fontFamily: F_MONO, marginTop: 2 }}>{tema.neon2 || "—"}</Mini>
                </span>
              </label>
              <Btn size="sm" tone="outline" onClick={() => mudar({ neon2: corCombinando(tema.neon || "#A855F7") })}>
                <Palette size={14} /> sugerir combinação
              </Btn>
            </div>
            <Mini style={{ marginTop: 10, lineHeight: 1.5, maxWidth: 420 }}>
              A cor escolhida é ajustada para continuar legível tanto no fundo
              escuro quanto no claro, e a segunda cor já nasce combinando com a
              primeira. Dá para trocar as duas à vontade depois.
            </Mini>
          </div>
        ) : null}
      </div>

      {/* ── fonte ───────────────────────────────────────────────────── */}
      <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
        <Label>Fonte da interface</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-3">
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
  const ativo = useAtivo();

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
          {doneCount} de {subjects.length} aulas e {bonusCount} de {ativo.totalBonus} tópicos marcados
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
   17 · PÁGINA DE ENTRADA

   A primeira tela de quem ainda não entrou. Ela não é um formulário com
   um parágrafo em cima: é a página de apresentação do site, em capítulos
   de tela cheia, e o formulário é o último deles.

   A ordem segue o que a pessoa precisa em cada momento. No topo, fixo,
   "já tenho conta" — quem já é de casa não deve ter que rolar nada para
   entrar. No meio, um capítulo por recurso, que é o que responde "por que
   eu criaria uma conta aqui". No fim, os dois jeitos de começar: criar a
   conta (com cupom, para quem recebeu um) e assinar, com o preço de
   lançamento e a garantia ao lado.

   Sem sincronização configurada, ou com ela fora do ar, não há conta a
   pedir: os capítulos continuam, e o último vira a entrada pelo nome. Sem
   essa reserva, quem abrisse o site com o Firebase fora do ar veria um
   login que não funciona e não teria como passar.
   ═══════════════════════════════════════════════════════════════════ */

/* As classes com prefixo pe- são escritas aqui embaixo, no <style> da
   própria página, e não no gerador de utilitários — por isso o
   gerar_css.py as ignora. */
const ESTILO_ENTRADA = `
.pe{position:relative;z-index:1}
.pe-sec{position:relative;display:flex;align-items:center;
  padding:112px 0 92px;scroll-margin-top:68px;overflow:hidden}
.pe-alta{min-height:100vh;min-height:100svh}
.pe-in{position:relative;z-index:1;width:100%;max-width:1180px;margin:0 auto;padding:0 22px}
@media(min-width:900px){.pe-in{padding:0 56px}}

/* Título de capítulo: caixa alta, pesado e apertado, como nas páginas que
   serviram de referência. A entrelinha não desce mais do que isso porque em
   português a caixa alta carrega cedilha e til — com o 0,93 das referências,
   em inglês, o Ç de "LANÇAMENTO" batia na linha de cima. */
.pe-t{font-family:var(--f-ui);text-transform:uppercase;font-weight:800;
  letter-spacing:-0.028em;line-height:1.0;margin:0;color:var(--ink);
  font-size:clamp(33px,6.2vw,74px);text-wrap:balance}
.pe-t2{font-size:clamp(28px,5.2vw,56px);line-height:1.04}
.pe-neon{background:linear-gradient(104deg,var(--neon),var(--neon2));
  -webkit-background-clip:text;background-clip:text;
  -webkit-text-fill-color:transparent;color:transparent}
.pe-eye{display:flex;align-items:center;gap:11px;font-family:var(--f-mono);
  font-size:10.5px;letter-spacing:.34em;text-transform:uppercase;color:var(--neon)}
.pe-eye::before{content:"";width:26px;height:1px;background:currentColor;flex-shrink:0}
/* No celular o rótulo mais longo passava de uma linha, e o risco ficava
   sozinho na primeira: menos espaçamento e ele volta a caber. */
@media(max-width:520px){.pe-eye{font-size:10px;letter-spacing:.2em;gap:9px}
  .pe-eye::before{width:20px}}
.pe-p{font-size:16.5px;line-height:1.72;font-weight:500;color:var(--dim);
  max-width:47ch;margin:22px 0 0}

/* Lavagem de cor de cada capítulo: é o que faz a rolagem parecer atravessar
   ambientes diferentes, em vez de percorrer um fundo só. */
.pe-lav{position:absolute;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(62% 66% at var(--x,76%) 44%,
    color-mix(in srgb,var(--c) 22%,transparent),transparent 72%)}

/* Revelação ao entrar na tela. O estado escondido só existe com
   data-anim="1", que o JavaScript liga depois de montar: sem ele — sem
   script, sem IntersectionObserver — a página nasce visível em vez de
   ficar em branco para sempre. */
.pe-rev{transition:opacity .85s cubic-bezier(.2,.8,.2,1),transform .85s cubic-bezier(.2,.8,.2,1)}
[data-anim="1"] .pe-rev{opacity:0;transform:translateY(28px)}
[data-anim="1"] .pe-rev[data-on="1"]{opacity:1;transform:none}

/* Trilho de capítulos na borda direita, como nas referências. Só aparece
   onde sobra largura e altura; no celular ele roubaria a margem do texto. */
.pe-trilho{position:fixed;right:18px;top:50%;transform:translateY(-50%);z-index:6;
  display:none;flex-direction:column;gap:13px;align-items:flex-end}
@media(min-width:1120px) and (min-height:620px){.pe-trilho{display:flex}}
.pe-passo{display:flex;align-items:center;gap:9px;padding:3px 0;background:none;
  border:none;cursor:pointer;font-family:var(--f-mono);font-size:9.5px;
  letter-spacing:.22em;text-transform:uppercase;color:var(--ghost);transition:color .3s}
.pe-passo:hover{color:var(--dim)}
.pe-passo[data-on="1"]{color:var(--ink)}
.pe-bola{width:7px;height:7px;border-radius:50%;border:1px solid currentColor;
  flex-shrink:0;transition:background .3s,box-shadow .3s,border-color .3s}
.pe-passo[data-on="1"] .pe-bola{background:var(--neon);border-color:var(--neon);
  box-shadow:0 0 12px var(--neon)}

/* Barra do topo: transparente sobre o primeiro capítulo, embaçada assim
   que a página rola — para o nome do site nunca sumir dentro da figura. */
.pe-topo{position:fixed;top:0;left:0;right:0;z-index:7;display:flex;
  align-items:center;justify-content:space-between;gap:12px;
  padding:calc(13px + env(safe-area-inset-top,0px)) 18px 13px;
  border-bottom:1px solid transparent;
  transition:background .4s,border-color .4s,backdrop-filter .4s}
.pe-topo[data-preso="1"]{background:color-mix(in srgb,var(--bg) 84%,transparent);
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  border-bottom-color:var(--line)}
@media(min-width:900px){.pe-topo{padding-left:56px;padding-right:56px}}

.pe-cta{display:inline-flex;align-items:center;justify-content:center;gap:9px;
  border-radius:999px;padding:14px 25px;font-family:var(--f-ui);font-size:15px;
  font-weight:700;cursor:pointer;white-space:nowrap;border:1px solid transparent;
  transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .3s,background .3s,
    color .3s,border-color .3s,opacity .2s}
.pe-cta:active{transform:translateY(0) scale(.985)}
.pe-cta:disabled{opacity:.4;cursor:not-allowed}
.pe-cheio{background:linear-gradient(112deg,var(--neon),var(--neon2));color:#08050F}
/* No tema claro as duas cores de acento são escuras — são as mesmas nos dois
   fundos —, e o texto quase preto por cima do roxo ficava sem contraste. Lá
   o botão inverte: fundo mais fechado, letra branca. */
[data-theme="light"] .pe-cheio{
  background:linear-gradient(112deg,color-mix(in srgb,var(--neon) 84%,black),var(--neon2));
  color:#FFFFFF}
.pe-cheio:hover:not(:disabled){transform:translateY(-2px);
  box-shadow:0 16px 42px -14px var(--neon2)}
.pe-vazio{background:transparent;color:var(--ink);border-color:var(--line2)}
.pe-vazio:hover:not(:disabled){transform:translateY(-2px);border-color:var(--neon);
  box-shadow:0 0 26px -10px var(--neon)}
.pe-pequeno{padding:9px 17px;font-size:13.5px}

@keyframes pe-desce{0%,100%{transform:translateY(0);opacity:.45}50%{transform:translateY(7px);opacity:1}}
.pe-desce{animation:pe-desce 2.4s ease-in-out infinite}

/* O traço do eletro que atravessa o primeiro capítulo: é a figura da marca
   aberta em linha, e resolve a falta de fotografia sem pedir nenhuma. */
@keyframes pe-corre{to{stroke-dashoffset:-1500}}
.pe-traco{stroke-dasharray:210 1290;animation:pe-corre 6.5s linear infinite}

/* As peças de dentro das figuras acendem quando o capítulo aparece, não
   quando a página monta — senão a animação já teria acabado antes de
   alguém chegar até lá. */
@keyframes pe-acende{from{opacity:0;transform:translateY(9px) scale(.94)}to{opacity:1;transform:none}}
[data-anim="1"] .pe-peca{opacity:0}
[data-anim="1"] .pe-rev[data-on="1"] .pe-peca{animation:pe-acende .55s cubic-bezier(.2,.8,.2,1) both}
/* Com movimento reduzido as animações são desligadas no estilo geral do
   app, e sem esta linha as peças ficariam escondidas para sempre. */
@media(prefers-reduced-motion:reduce){[data-anim="1"] .pe-peca{opacity:1}}

/* Rodapé em lista grande, também como nas referências. */
.pe-link{display:block;width:100%;padding:11px 0;background:none;border:none;
  cursor:pointer;text-align:center;text-decoration:none;font-family:var(--f-ui);
  text-transform:uppercase;font-weight:700;letter-spacing:-0.01em;
  font-size:clamp(19px,3.6vw,36px);color:var(--dim);
  transition:color .25s,letter-spacing .25s}
.pe-link:hover{color:var(--ink);letter-spacing:.014em}

/* Encaixe de capítulo, só onde a tela é alta e o ponteiro é preciso. No
   celular, com teclado abrindo em cima do formulário, prender a rolagem
   atrapalharia mais do que ajuda. */
@media(min-width:900px) and (min-height:820px) and (pointer:fine){
  html{scroll-snap-type:y proximity}
  .pe-alta{scroll-snap-align:start}
}
`;

/* ── figuras ────────────────────────────────────────────────────────────
   Nenhuma delas é imagem: são desenhos em SVG e caixas coloridas, feitos
   com as mesmas variáveis de cor do resto do app. Assim a página de
   entrada acompanha o tema e a cor de acento que a pessoa escolher
   depois, e nada aqui pesa no arquivo publicado. */

/* Um complexo de eletro por unidade de 300, repetido para atravessar a
   tela. Sai daqui em vez de ser um "d" escrito à mão para poder mudar de
   comprimento sem virar uma linha ilegível. */
function caminhoPulso(repeticoes = 6, meio = 80) {
  const partes = [`M0,${meio}`];
  for (let i = 0; i < repeticoes; i += 1) {
    const x = i * 300;
    partes.push(
      `L${x + 118},${meio}`, `L${x + 132},${meio - 13}`, `L${x + 144},${meio + 17}`,
      `L${x + 156},${meio - 48}`, `L${x + 170},${meio + 60}`, `L${x + 182},${meio - 9}`,
      `L${x + 196},${meio}`, `L${x + 300},${meio}`,
    );
  }
  return partes.join(" ");
}

function TracoPulso({ estilo }) {
  const d = caminhoPulso(6, 80);
  return (
    <svg viewBox="0 0 1800 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true"
      style={{ width: "100%", height: 160, display: "block", ...estilo }}>
      <defs>
        <linearGradient id="peGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--neon)" stopOpacity="0" />
          <stop offset="26%" stopColor="var(--neon)" />
          <stop offset="68%" stopColor="var(--neon2)" />
          <stop offset="100%" stopColor="var(--neon2)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="url(#peGrad)" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.28" />
      <path className="pe-traco" d={d} fill="none" stroke="var(--neon)" strokeWidth="2.6"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 0 9px var(--neon))" }} />
    </svg>
  );
}

/* Cronograma: uma coluna por área, e uma casinha por aula marcada. */
function FiguraGrade() {
  const feitas = { PR: 10, CL: 8, CI: 6, PE: 9, GO: 5 };
  return (
    <div className="flex gap-2.5" style={{ alignItems: "flex-end" }}>
      {AREA_IDS.map((a, ci) => (
        <div key={a} className="flex flex-col gap-1.5" style={{ flex: 1, minWidth: 0 }}>
          {Array.from({ length: 13 }).map((_, i) => {
            const cheia = i >= 13 - feitas[a];
            return (
              <span key={i} className="pe-peca" style={{
                display: "block", height: 12, borderRadius: 3,
                background: cheia ? soft(aColor(a), 78) : soft("var(--ink)", 5),
                border: `1px solid ${cheia ? "transparent" : soft("var(--ink)", 10)}`,
                boxShadow: cheia ? `0 0 14px -5px ${aColor(a)}` : "none",
                animationDelay: `${0.1 + ci * 0.06 + i * 0.022}s`,
              }} />
            );
          })}
          <span style={{
            fontFamily: F_MONO, fontSize: 10, letterSpacing: "0.18em",
            color: aColor(a), textAlign: "center", marginTop: 4,
          }}>{a}</span>
        </div>
      ))}
    </div>
  );
}

/* Revisão: a escada de verdade, lida do esquema padrão do app. */
function FiguraEscada() {
  return (
    <div className="flex flex-col gap-3">
      {LADDER.map((degrau, i) => (
        <div key={degrau.d} className="pe-peca flex items-center gap-3.5"
          style={{ animationDelay: `${0.12 + i * 0.11}s` }}>
          <span className="flex items-center justify-center rounded-full" style={{
            width: 42, height: 42, flexShrink: 0,
            background: soft("var(--ok)", 12 + i * 5),
            border: `1px solid ${soft("var(--ok)", 30 + i * 12)}`,
            boxShadow: `0 0 ${10 + i * 7}px -6px var(--ok)`,
            fontFamily: F_MONO, fontSize: 12.5, fontWeight: 700, color: T.ok,
          }}>{degrau.d}d</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>{degrau.label}</div>
            <div style={{
              height: 4, borderRadius: 99, marginTop: 7,
              background: `linear-gradient(90deg, ${soft("var(--ok)", 70)} ${18 + i * 24}%, ${soft("var(--ink)", 7)} ${18 + i * 24}%)`,
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Cartões: a pilha, com o de cima virado para a resposta. */
function FiguraCartoes() {
  /* As de trás são mais estreitas e nascem mais acima, que é como uma pilha
     de cartas se enxerga de frente: com a mesma largura da primeira, elas
     ficavam escondidas atrás dela e a pilha virava um risco só. */
  const pilha = [
    { lado: 34, y: 0, g: -3, o: 0.4, alt: 196 },
    { lado: 17, y: 12, g: 2, o: 0.68, alt: 196 },
    { lado: 0, y: 26, g: -1, o: 1, alt: null },
  ];
  return (
    <div style={{ position: "relative", height: 250 }}>
      {pilha.map((c, i) => (
        <div key={i} className="pe-peca rounded-2xl px-6 py-6" style={{
          position: "absolute", top: c.y, left: c.lado, right: c.lado, opacity: c.o,
          height: c.alt || undefined,
          transform: `rotate(${c.g}deg)`, transformOrigin: "50% 50%",
          background: i === 2 ? T.card2 : T.card3,
          border: `1px solid ${i === 2 ? soft("var(--neon)", 40) : T.line2}`,
          boxShadow: i === 2 ? "0 30px 70px -34px var(--neon2)" : "none",
          animationDelay: `${0.1 + i * 0.12}s`,
        }}>
          {i === 2 ? (
            <>
              <div style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: "0.24em", color: "var(--neon)" }}>
                CARDIOLOGIA
              </div>
              <div style={{ fontSize: 19, fontWeight: 600, color: T.ink, marginTop: 12, lineHeight: 1.35 }}>
                Primeira conduta na fibrilação atrial com instabilidade?
              </div>
              <div className="flex gap-2 mt-5 flex-wrap">
                {[["Errei", T.bad], ["Difícil", T.warn], ["Bom", T.ok], ["Fácil", "var(--neon)"]].map(([lb, cor]) => (
                  <span key={lb} className="rounded-full px-3 py-1.5" style={{
                    fontSize: 12.5, fontWeight: 600, color: cor,
                    background: soft(cor, 12), border: `1px solid ${soft(cor, 32)}`,
                  }}>{lb}</span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* Foco: o anel do cronômetro e o que a sessão guarda. */
function FiguraAnel() {
  const r = 78;
  const volta = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="pe-peca" style={{ position: "relative", width: 190, height: 190, animationDelay: ".1s" }}>
        <svg viewBox="0 0 190 190" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }} aria-hidden="true">
          <circle cx="95" cy="95" r={r} fill="none" stroke={soft("var(--ink)", 8)} strokeWidth="7" />
          <circle cx="95" cy="95" r={r} fill="none" stroke="var(--neon)" strokeWidth="7"
            strokeLinecap="round" strokeDasharray={`${volta * 0.68} ${volta}`}
            style={{ filter: "drop-shadow(0 0 10px var(--neon))" }} />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 3,
        }}>
          <span style={{
            fontFamily: F_MONO, fontSize: 34, fontWeight: 700, color: T.ink,
            letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums",
          }}>17:04</span>
          <span style={{ fontFamily: F_MONO, fontSize: 9.5, letterSpacing: "0.26em", color: T.faint }}>
            POMODORO
          </span>
        </div>
      </div>
      <div className="flex gap-6 flex-wrap justify-center">
        {[["4h20", "hoje"], ["182", "questões"], ["79%", "acerto"]].map(([n, lb], i) => (
          <div key={lb} className="pe-peca text-center" style={{ animationDelay: `${0.22 + i * 0.08}s` }}>
            <div style={{
              fontFamily: F_MONO, fontSize: 22, fontWeight: 700, color: T.ink,
              letterSpacing: "-0.03em",
            }}>{n}</div>
            <div style={{ fontFamily: F_MONO, fontSize: 9.5, letterSpacing: "0.2em", color: T.faint, marginTop: 4, textTransform: "uppercase" }}>
              {lb}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Amigos: o ranking da sala, com quem está estudando agora aceso. */
function FiguraRanking() {
  const gente = [
    { nome: "Marina", h: "12h40", pct: 100, agora: true },
    { nome: "Você", h: "11h05", pct: 87, agora: true },
    { nome: "Rafael", h: "8h30", pct: 67, agora: false },
    { nome: "Bia", h: "6h15", pct: 49, agora: false },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      {gente.map((p, i) => (
        <div key={p.nome} className="pe-peca rounded-2xl px-4 py-3.5 flex items-center gap-3.5"
          style={{
            background: p.nome === "Você" ? soft("var(--neon2)", 12) : T.card2,
            border: `1px solid ${p.nome === "Você" ? soft("var(--neon2)", 38) : T.line}`,
            animationDelay: `${0.1 + i * 0.09}s`,
          }}>
          <span style={{
            fontFamily: F_MONO, fontSize: 13, fontWeight: 700, color: T.faint, width: 16, flexShrink: 0,
          }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>{p.nome}</span>
              {p.agora ? (
                <span className="aovivo" style={{
                  width: 6, height: 6, borderRadius: 99, background: T.ok, flexShrink: 0,
                }} />
              ) : null}
            </div>
            <div style={{
              height: 4, borderRadius: 99, marginTop: 7,
              background: `linear-gradient(90deg, ${p.nome === "Você" ? "var(--neon2)" : soft("var(--neon)", 55)} ${p.pct}%, ${soft("var(--ink)", 7)} ${p.pct}%)`,
            }} />
          </div>
          <span style={{
            fontFamily: F_MONO, fontSize: 13, color: T.dim, flexShrink: 0,
            fontVariantNumeric: "tabular-nums",
          }}>{p.h}</span>
        </div>
      ))}
    </div>
  );
}

/* ── capítulo ───────────────────────────────────────────────────────────
   O molde de todos os capítulos do meio: rótulo, título, parágrafo e a
   figura ao lado. Cada peça entra um pouco depois da anterior, e é o
   atraso escalonado que faz a leitura acompanhar a rolagem. */
function CapituloEntrada({ id, numero, rotulo, titulo, texto, cor, x, figura, rodape }) {
  return (
    <section id={id} data-sec={id} className="pe-sec pe-alta">
      <span aria-hidden="true" className="pe-lav" style={{ "--c": cor, "--x": x || "76%" }} />
      <div className="pe-in">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="pe-rev pe-eye" data-rev>
              {numero} · {rotulo}
            </div>
            <h2 className="pe-rev pe-t pe-t2" data-rev
              style={{ marginTop: 20, transitionDelay: ".07s" }}>{titulo}</h2>
            <p className="pe-rev pe-p" data-rev style={{ transitionDelay: ".14s" }}>{texto}</p>
            {rodape ? (
              <div className="pe-rev mt-7" data-rev style={{ transitionDelay: ".2s" }}>{rodape}</div>
            ) : null}
          </div>
          <div className="pe-rev" data-rev style={{ transitionDelay: ".24s" }}>{figura}</div>
        </div>
      </div>
    </section>
  );
}

/* Três números embaixo de um título, na fonte monoespaçada. */
function NumerosEntrada({ itens }) {
  return (
    <div className="flex gap-x-8 gap-y-4 flex-wrap">
      {itens.map(([n, lb]) => (
        <div key={lb}>
          <div style={{
            fontFamily: F_MONO, fontSize: 27, fontWeight: 700, color: T.ink,
            letterSpacing: "-0.04em", lineHeight: 1,
          }}>{n}</div>
          <div style={{
            fontFamily: F_MONO, fontSize: 9.5, letterSpacing: "0.2em", marginTop: 6,
            textTransform: "uppercase", color: T.faint,
          }}>{lb}</div>
        </div>
      ))}
    </div>
  );
}

/* Os capítulos do meio, na ordem em que aparecem. Ficam numa lista só para
   o trilho da direita e as seções saírem do mesmo lugar — acrescentar um
   capítulo é acrescentar um item aqui. */
const CAPITULOS = [
  {
    id: "cronograma", rotulo: "Cronograma", cor: "var(--a-GO)", x: "78%",
    titulo: "O cronograma inteiro, num lugar só.",
    texto: `As ${CURRICULUM.length} aulas principais e ${TOTAL_BONUS} tópicos, divididos pelas cinco áreas da prova. Você marca o que fez, e o radar mostra onde está atrasado. Sem planilha, sem caderno de controle e sem montar cronograma do zero.`,
    figura: <FiguraGrade />,
    numeros: [[String(CURRICULUM.length), "aulas"], [String(TOTAL_BONUS), "tópicos"], ["5", "áreas"]],
  },
  {
    id: "revisao", rotulo: "Revisão", cor: "var(--ok)", x: "74%",
    titulo: "A revisão volta na hora certa.",
    texto: "Toda aula marcada entra numa escada de revisão. O que venceu aparece em Hoje, no dia, sem você precisar lembrar. E se a escada padrão não é a sua, escreva os prazos que você usa.",
    figura: <FiguraEscada />,
  },
  {
    id: "cartoes", rotulo: "Flashcards", cor: "var(--neon)", x: "76%",
    titulo: "Seus cartões, com repetição espaçada.",
    texto: "Faça os seus, traga um baralho do Anki ou monte os cartões a partir de um PDF ou de um Word. Cada resposta decide quando aquele cartão volta, e o baralho anda junto com o cronograma.",
    figura: <FiguraCartoes />,
  },
  {
    id: "foco", rotulo: "Foco", cor: "var(--a-CL)", x: "74%",
    titulo: "O cronômetro que vira estatística.",
    texto: "Pomodoro ou tempo corrido. Cada sessão guarda minutos, questões e acertos, e isso vira o seu ritmo e a projeção até o dia da prova. A agenda da semana entra junto, com o Google Agenda ao lado.",
    figura: <FiguraAnel />,
  },
  {
    id: "amigos", rotulo: "Amigos", cor: "var(--neon2)", x: "74%",
    titulo: "Estudar junto rende mais.",
    texto: "Combine um nome e uma senha com quem estuda com você e abram uma sala. Horas, questões e acerto de todo mundo no mesmo ranking, e quem está estudando agora aparece aceso.",
    figura: <FiguraRanking />,
  },
];

function Onboarding({ onDone, theme, toggleTheme, nuvem, aoLiberar }) {
  /* A conta vem antes do nome.
   *
   * Pedir só o nome deixava a pessoa entrar, estudar, e descobrir depois
   * que nada daquilo estava sincronizado. Quem quiser experimentar antes
   * tem a saída no fim da página — e quem faz a conta depois traz junto o
   * que já anotou, porque os dados são deste aparelho até o primeiro
   * envio. */
  const [modo, setModo] = useState("criar");      // criar | entrar
  const [f, setF] = useState({ nome: "", email: "", senha: "", cupom: "" });
  const [manter, setManter] = useState(true);
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [semConta, setSemConta] = useState(false);
  const [entrarAberto, setEntrarAberto] = useState(false);
  const [ativa, setAtiva] = useState("inicio");
  const [preso, setPreso] = useState(false);
  const raiz = useRef(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const semNuvem = !nuvem || !nuvem.ligado || nuvem.estado === "erro" || semConta;
  /* O corpo do formulário é montado sempre, inclusive quando não vai ser
     usado, então a leitura precisa aguentar não haver nuvem nenhuma. */
  const conectando = !!nuvem && nuvem.estado === "carregando";

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
       entrar numa conta que já existe é tratado no componente raiz, que
       fecha esta página assim que a sessão abre. */
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

  const irPara = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const abrirEntrar = () => {
    setModo("entrar"); setMsg(""); setEntrarAberto(true);
  };

  /* Fechar o painel devolve o formulário de baixo ao que ele era: sem isso,
     abrir "já tenho conta" lá em cima trocava o capítulo de criar conta
     para o modo de entrar, e ele ficava assim depois de fechar. */
  const fecharEntrar = () => { setEntrarAberto(false); setModo("criar"); setMsg(""); };

  /* Revelação e trilho.
   *
   * O estado escondido só é ligado aqui, depois de montar e só quando o
   * navegador tem IntersectionObserver: assim a página nunca fica em
   * branco esperando um observador que não existe. */
  useEffect(() => {
    const no = raiz.current;
    if (!no || typeof IntersectionObserver === "undefined") return undefined;
    no.setAttribute("data-anim", "1");

    const oRev = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (e.isIntersecting) { e.target.setAttribute("data-on", "1"); oRev.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
    no.querySelectorAll("[data-rev]").forEach((el) => oRev.observe(el));

    const oSec = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => { if (e.isIntersecting) setAtiva(e.target.getAttribute("data-sec")); });
    }, { threshold: 0.34 });
    no.querySelectorAll("[data-sec]").forEach((el) => oSec.observe(el));

    return () => { oRev.disconnect(); oSec.disconnect(); };
  }, [semNuvem]);

  useEffect(() => {
    const rolou = () => setPreso(window.scrollY > 36);
    rolou();
    window.addEventListener("scroll", rolou, { passive: true });
    return () => window.removeEventListener("scroll", rolou);
  }, []);

  /* Com o painel de entrar aberto, a rolagem por baixo continuava andando
     no celular — e ao fechar a página estava em outro lugar. */
  useEffect(() => {
    if (!entrarAberto) return undefined;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = antes; };
  }, [entrarAberto]);

  const marca = (
    <img src={MARCA} alt="Cadência Med" width="132" height="65" className="marca"
      style={{ display: "block", width: 118, height: "auto" }} />
  );

  const botaoTema = (
    <button type="button" aria-label="Alternar tema" onClick={toggleTheme}
      className="flex items-center justify-center rounded-full toque"
      style={{
        width: 38, height: 38, flexShrink: 0, background: T.card,
        border: `1px solid ${T.line}`, color: T.dim, cursor: "pointer",
      }}>
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );

  /* ── formulário de conta ──────────────────────────────────────────────
     O mesmo corpo serve para o painel de entrar, lá em cima, e para o
     capítulo de criar conta, lá embaixo. */
  const campos = (
    <div className="flex flex-col gap-4">
      {modo === "criar" ? (
        <Field label="Seu nome">
          <TextInput value={f.nome} placeholder="Como quer ser chamado"
            onChange={(e) => set("nome", e.target.value)} />
        </Field>
      ) : null}
      <Field label="E-mail">
        <TextInput type="email" autoComplete="email" value={f.email} placeholder="voce@email.com"
          onChange={(e) => set("email", e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} />
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
            onChange={(e) => set("cupom", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} />
        </Field>
      ) : null}
      {modo === "entrar" ? (
        <label className="flex items-center gap-2.5" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={manter} onChange={(e) => setManter(e.target.checked)} />
          <span style={{ fontSize: 13.5, color: T.dim }}>
            Manter conectado
            <span style={{ color: T.ghost }}>{" · "}desmarque num computador compartilhado</span>
          </span>
        </label>
      ) : null}
      {msg ? (
        <div style={{ fontSize: 14.5, lineHeight: 1.5, color: T.bad }}>{msg}</div>
      ) : null}
      <button type="button" className="pe-cta pe-cheio w-full" onClick={enviar}
        disabled={ocupado || conectando}>
        {ocupado ? "Aguarde…" : conectando ? "Conectando…"
          : modo === "entrar" ? "Entrar" : "Criar conta"}
        <ArrowUpRight size={16} />
      </button>
    </div>
  );

  return (
    <div ref={raiz} className="pe" data-anim="0">
      <style>{ESTILO_ENTRADA}</style>

      {/* ── barra do topo ───────────────────────────────────────────── */}
      <div className="pe-topo" data-preso={preso ? "1" : "0"}>
        <button type="button" onClick={() => irPara("inicio")}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
          aria-label="Voltar ao começo">{marca}</button>
        <div className="flex items-center gap-2.5">
          {botaoTema}
          {semNuvem ? null : (
            <button type="button" className="pe-cta pe-vazio pe-pequeno" onClick={abrirEntrar}>
              Já tenho conta
            </button>
          )}
        </div>
      </div>

      {/* ── trilho de capítulos ─────────────────────────────────────── */}
      <nav className="pe-trilho" aria-label="Capítulos da página">
        {[{ id: "inicio", rotulo: "Início" }, ...CAPITULOS,
          { id: "conta", rotulo: "Criar conta" }, { id: "planos", rotulo: "Planos" }].map((c) => (
          <button key={c.id} type="button" className="pe-passo"
            data-on={ativa === c.id ? "1" : "0"} onClick={() => irPara(c.id)}>
            {c.rotulo}<span className="pe-bola" />
          </button>
        ))}
      </nav>

      {/* ── 00 · abertura ───────────────────────────────────────────── */}
      <section id="inicio" data-sec="inicio" className="pe-sec pe-alta">
        <span aria-hidden="true" className="pe-lav" style={{ "--c": "var(--neon2)", "--x": "72%" }} />
        <div aria-hidden="true" style={{
          position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 0, opacity: 0.55,
        }}><TracoPulso /></div>

        <div className="pe-in">
          {/* Duas colunas de texto para uma de figura: o título precisa caber
              em duas linhas, e na metade exata da tela "A RESIDÊNCIA" quebrava
              logo depois do "A". */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-center">
            <div className="lg:col-span-2">
              <div className="pe-rev pe-eye" data-rev>Preparação para residência médica</div>
              <h1 className="pe-rev pe-t" data-rev style={{ marginTop: 22, transitionDelay: ".07s" }}>
                A residência<br />pede <span className="pe-neon">cadência</span>.
              </h1>
              <p className="pe-rev pe-p" data-rev style={{ transitionDelay: ".14s" }}>
                O cronograma inteiro, a revisão que volta na hora certa e os seus
                flashcards, no mesmo lugar, no computador e no celular.
                {" "}{CURRICULUM.length} aulas e {TOTAL_BONUS} tópicos já prontos para marcar.
              </p>
              <div className="pe-rev mt-8 flex gap-3 flex-wrap" data-rev style={{ transitionDelay: ".2s" }}>
                <button type="button" className="pe-cta pe-cheio" onClick={() => irPara("conta")}>
                  Criar minha conta <ArrowUpRight size={17} />
                </button>
                <button type="button" className="pe-cta pe-vazio"
                  onClick={() => (semNuvem ? irPara("conta") : abrirEntrar())}>
                  Já tenho conta
                </button>
              </div>
              <div className="pe-rev mt-10" data-rev style={{ transitionDelay: ".26s" }}>
                <NumerosEntrada itens={[
                  [String(CURRICULUM.length), "aulas"],
                  [String(TOTAL_BONUS), "tópicos"],
                  ["5", "áreas da prova"],
                ]} />
              </div>
            </div>

            <div className="pe-rev" data-rev style={{ transitionDelay: ".3s" }}>
              <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
                <span aria-hidden="true" style={{
                  position: "absolute", top: "50%", left: "50%",
                  width: 320, height: 320, transform: "translate(-50%,-50%)",
                  borderRadius: "50%", border: `1px solid ${T.line}`,
                }} />
                <span aria-hidden="true" className="breathe" style={{
                  position: "absolute", top: "50%", left: "50%",
                  width: 210, height: 210, transform: "translate(-50%,-50%)",
                  borderRadius: "50%", border: `1px solid ${soft("var(--neon)", 30)}`,
                }} />
                <img src={MARCA} alt="" width="440" height="216" className="marca"
                  style={{ position: "relative", width: "min(74%, 330px)", height: "auto" }} />
              </div>
            </div>
          </div>

          <button type="button" className="pe-desce flex items-center gap-2.5 mt-10"
            onClick={() => irPara(CAPITULOS[0].id)}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              fontFamily: F_MONO, fontSize: 9.5, letterSpacing: "0.26em",
              textTransform: "uppercase", color: T.faint,
            }}>
            <ChevronDown size={15} /> role para ver
          </button>
        </div>
      </section>

      {/* ── 01 a 05 · o que o site faz ──────────────────────────────── */}
      {CAPITULOS.map((c, i) => (
        <CapituloEntrada key={c.id} id={c.id} numero={`0${i + 1}`} rotulo={c.rotulo}
          titulo={c.titulo} texto={c.texto} cor={c.cor} x={c.x} figura={c.figura}
          rodape={c.numeros ? <NumerosEntrada itens={c.numeros} /> : null} />
      ))}

      {/* ── 06 · criar conta ────────────────────────────────────────── */}
      <SecaoConta id="conta" semNuvem={semNuvem} modo={modo} setModo={setModo} setMsg={setMsg}
        f={f} set={set} campos={campos} onDone={onDone}
        semContaLigado={semConta} voltarParaConta={() => { setSemConta(false); setMsg(""); }}
        usarSemConta={() => { setSemConta(true); setMsg(""); }} />

      {/* ── 07 · planos ─────────────────────────────────────────────── */}
      <SecaoPlanos irPara={irPara} />

      {/* ── rodapé ──────────────────────────────────────────────────── */}
      <footer className="pe-sec" style={{ paddingTop: 40, paddingBottom: 56 }}>
        <span aria-hidden="true" className="pe-lav" style={{ "--c": "var(--neon2)", "--x": "50%" }} />
        <div className="pe-in">
          <div className="pe-rev" data-rev style={{ maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
            <button type="button" className="pe-link" onClick={() => irPara("conta")}>
              Criar minha conta
            </button>
            <button type="button" className="pe-link" onClick={() => irPara("planos")}>
              Ver os planos
            </button>
            {semNuvem ? null : (
              <button type="button" className="pe-link" onClick={abrirEntrar}>
                Entrar na minha conta
              </button>
            )}
            <a className="pe-link" href={`mailto:${EMAIL_SUPORTE}`}>Falar com o suporte</a>
          </div>

          <div className="mt-10 pt-6 flex items-center justify-between gap-4 flex-wrap"
            style={{ borderTop: `1px solid ${T.line}` }}>
            <div className="flex items-center gap-3">
              <img src={MARCA} alt="" width="92" height="45" style={{ width: 84, height: "auto", opacity: 0.75 }} />
              <Mini>Cadência Med · {VERSAO}</Mini>
            </div>
            <Mini style={{ fontFamily: F_MONO }}>{EMAIL_SUPORTE}</Mini>
          </div>
        </div>
      </footer>

      {/* ── painel de entrar ────────────────────────────────────────── */}
      {entrarAberto && !semNuvem ? (
        <div style={{
          position: "fixed", inset: 0, zIndex: 30, display: "flex",
          alignItems: "center", justifyContent: "center", padding: 20,
          background: "color-mix(in srgb, var(--bg) 78%, transparent)",
          backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        }}
          onClick={(e) => { if (e.target === e.currentTarget) fecharEntrar(); }}>
          <Card className="px-7 sm:px-9 py-8 rise" style={{
            width: "100%", maxWidth: 430, maxHeight: "88vh", overflowY: "auto",
            boxShadow: T.shadow,
          }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label>{modo === "entrar" ? "Já tenho conta" : "Criar conta"}</Label>
                <h2 className="pe-t pe-t2" style={{ fontSize: 27, marginTop: 8 }}>
                  {modo === "entrar" ? "Entrar" : "Começo rápido"}
                </h2>
              </div>
              <button type="button" aria-label="Fechar" onClick={fecharEntrar}
                className="flex items-center justify-center rounded-full toque"
                style={{
                  width: 34, height: 34, flexShrink: 0, background: T.card2,
                  border: `1px solid ${T.line}`, color: T.dim, cursor: "pointer",
                }}>
                <X size={15} />
              </button>
            </div>
            <div className="mt-6">{campos}</div>
            <div className="mt-5 text-center">
              <button type="button"
                onClick={() => { setModo(modo === "entrar" ? "criar" : "entrar"); setMsg(""); }}
                style={{
                  background: "none", border: "none", color: T.faint, fontSize: 13.5,
                  cursor: "pointer", textDecoration: "underline",
                }}>
                {modo === "entrar" ? "ainda não tenho conta" : "já tenho conta"}
              </button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

/* ── capítulo de criar conta ────────────────────────────────────────────
   Sem sincronização, este capítulo é a entrada pelo nome — é o caminho que
   precisa existir quando o Firebase não carrega. */
function SecaoConta({
  id, semNuvem, modo, setModo, setMsg, f, set, campos, onDone,
  semContaLigado, voltarParaConta, usarSemConta,
}) {
  return (
    <section id={id} data-sec={id} className="pe-sec">
      <span aria-hidden="true" className="pe-lav" style={{ "--c": "var(--neon)", "--x": "26%" }} />
      <div className="pe-in">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div>
            <div className="pe-rev pe-eye" data-rev>06 · Sua conta</div>
            <h2 className="pe-rev pe-t pe-t2" data-rev style={{ marginTop: 20, transitionDelay: ".07s" }}>
              {semNuvem ? "Comece agora mesmo." : "Crie sua conta."}
            </h2>
            <p className="pe-rev pe-p" data-rev style={{ transitionDelay: ".14s" }}>
              {semNuvem
                ? "A sincronização não está disponível agora, mas nada disso trava: escreva seu nome e comece. Dá para criar a conta depois, e o que você já tiver anotado vai junto."
                : `O cronograma com as ${CURRICULUM.length} aulas e ${TOTAL_BONUS} tópicos, o cronômetro e o registro das suas sessões são de graça, para sempre. A conta é o que guarda tudo isso e leva de um aparelho para o outro.`}
            </p>
            {!semNuvem ? (
              <div className="pe-rev mt-7" data-rev style={{ transitionDelay: ".2s" }}>
                <Card className="px-5 py-5" flat>
                  <div className="flex items-start gap-3">
                    <span className="flex items-center justify-center rounded-full" style={{
                      width: 26, height: 26, flexShrink: 0, marginTop: 1,
                      background: soft("var(--warn)", 16), color: T.warn,
                    }}><Sparkles size={14} /></span>
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>
                        Recebeu um cupom?
                      </div>
                      <Mini style={{ marginTop: 5, lineHeight: 1.6 }}>
                        Escreva o código no campo "cupom" do formulário de criar
                        conta. Ele libera o plano completo assim que a conta é
                        criada, sem passar pelo pagamento.
                      </Mini>
                    </div>
                  </div>
                </Card>
              </div>
            ) : null}
          </div>

          <div className="pe-rev" data-rev style={{ transitionDelay: ".24s" }}>
            <Card className="px-6 sm:px-7 py-7" brilho="var(--neon)" style={{ boxShadow: T.shadow }}>
              {semNuvem ? (
                <>
                  <Label>Entrar sem conta</Label>
                  <div className="mt-5">
                    <Field label="Como quer ser chamado">
                      <TextInput value={f.nome} placeholder="Seu nome"
                        onChange={(e) => set("nome", e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") onDone(f.nome.trim() || "Estudante"); }} />
                    </Field>
                  </div>
                  <button type="button" className="pe-cta pe-cheio w-full mt-5"
                    onClick={() => onDone(f.nome.trim() || "Estudante")}>
                    Começar <ArrowUpRight size={16} />
                  </button>
                  {semContaLigado ? (
                    <div className="mt-4 text-center">
                      <button type="button" onClick={voltarParaConta} style={{
                        background: "none", border: "none", color: T.faint, fontSize: 13.5,
                        cursor: "pointer", textDecoration: "underline",
                      }}>voltar para a conta</button>
                    </div>
                  ) : (
                    <Mini style={{ marginTop: 14, lineHeight: 1.6 }}>
                      Dá para criar conta depois e sincronizar o que você já anotou.
                    </Mini>
                  )}
                </>
              ) : (
                <>
                  <div className="flex gap-2 flex-wrap">
                    {[["criar", "Criar conta"], ["entrar", "Entrar"]].map(([k, lb]) => (
                      <button key={k} type="button" onClick={() => { setModo(k); setMsg(""); }}
                        className="toque-larg rounded-full px-4 py-2"
                        style={{
                          background: modo === k ? T.card3 : "transparent",
                          border: `1px solid ${modo === k ? "transparent" : T.line}`,
                          color: modo === k ? T.ink : T.dim,
                          fontSize: 14, fontWeight: modo === k ? 700 : 500, cursor: "pointer",
                        }}>{lb}</button>
                    ))}
                  </div>
                  <div className="mt-5">{campos}</div>
                  <div className="mt-5 text-center">
                    <button type="button" onClick={usarSemConta} style={{
                      background: "none", border: "none", color: T.faint, fontSize: 13.5,
                      cursor: "pointer", textDecoration: "underline",
                    }}>usar sem conta por enquanto</button>
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── capítulo dos planos ────────────────────────────────────────────────
   O preço cheio fica riscado ao lado do de lançamento, e a garantia vem
   logo abaixo: as duas coisas que decidem a compra ficam na mesma tela. */
function SecaoPlanos({ irPara }) {
  const abrir = (tipo) => {
    const url = CHECKOUT[tipo];
    if (!url) { irPara("conta"); return; }
    window.open(url, "_blank", "noopener");
  };

  return (
    <section id="planos" data-sec="planos" className="pe-sec">
      <span aria-hidden="true" className="pe-lav" style={{ "--c": "var(--neon2)", "--x": "62%" }} />
      <div className="pe-in">
        <div className="pe-rev pe-eye" data-rev>07 · Planos</div>
        <div className="pe-rev mt-5" data-rev style={{ transitionDelay: ".07s" }}>
          <span className="inline-flex items-center gap-2 rounded-full px-4 py-2" style={{
            background: soft("var(--warn)", 14), border: `1px solid ${soft("var(--warn)", 40)}`,
            color: T.warn, fontSize: 12.5, fontWeight: 700,
            letterSpacing: "0.1em", textTransform: "uppercase",
          }}>
            <Sparkles size={14} /> {PROMO}
          </span>
        </div>
        <h2 className="pe-rev pe-t pe-t2 mt-5" data-rev style={{ transitionDelay: ".12s", maxWidth: 780 }}>
          Assine agora,<br />pelo preço de lançamento.
        </h2>
        <p className="pe-rev pe-p" data-rev style={{ transitionDelay: ".16s" }}>
          Os valores abaixo são os de lançamento e valem para quem assina agora.
          Quem assinar mantém o preço enquanto a assinatura ficar ativa.
        </p>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-5">
          {["mensal", "anual"].map((k, i) => {
            const p = PRECOS[k];
            const destaque = k === "anual";
            return (
              <div key={k} className="pe-rev" data-rev style={{ transitionDelay: `${0.2 + i * 0.07}s` }}>
                <Card className="px-6 sm:px-7 py-8" tilt
                  brilho={destaque ? "var(--neon2)" : "var(--neon)"}
                  style={{
                    height: "100%", boxShadow: T.shadow,
                    borderColor: destaque ? soft("var(--neon2)", 45) : undefined,
                  }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <Label>{p.rotulo}</Label>
                    {destaque ? (
                      <span className="rounded-full px-3 py-1" style={{
                        background: soft("var(--neon2)", 20), color: "var(--neon2)",
                        fontSize: 12, fontWeight: 700,
                      }}>{p.economia}</span>
                    ) : null}
                  </div>

                  {p.de ? (
                    <div className="flex items-center gap-2.5 mt-5">
                      <span style={{
                        fontFamily: F_MONO, fontSize: 19, color: T.ghost,
                        textDecoration: "line-through",
                      }}>{p.de}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.faint }}>
                        preço normal
                      </span>
                    </div>
                  ) : null}

                  {/* O cifrão sai menor e separado: em fonte monoespaçada,
                      "R$ 250" num corpo só abre um vão entre o símbolo e o
                      número que parece erro de digitação. */}
                  <div className="flex items-baseline gap-2 mt-2">
                    <span style={{
                      fontFamily: F_MONO, fontSize: 24, fontWeight: 700,
                      color: destaque ? "var(--neon2)" : T.dim,
                    }}>R$</span>
                    <span style={{
                      fontFamily: F_MONO, fontSize: 56, fontWeight: 700,
                      letterSpacing: "-0.05em", lineHeight: 1,
                      color: destaque ? "var(--neon2)" : T.ink,
                    }}>{p.valor.replace(/^R\$\s*/, "")}</span>
                    <Mini>{p.periodo}</Mini>
                  </div>
                  <Mini style={{ marginTop: 8 }}>
                    se assinar agora{destaque ? " · válido até 31/12/2027" : ""}
                  </Mini>

                  <div className="mt-7">
                    <button type="button"
                      className={`pe-cta w-full ${destaque ? "pe-cheio" : "pe-vazio"}`}
                      onClick={() => abrir(k)}>
                      {CHECKOUT[k] ? `Assinar ${p.rotulo.toLowerCase()}` : "Criar conta e assinar"}
                      <ArrowUpRight size={16} />
                    </button>
                  </div>

                  <div className="mt-6 pt-5 flex flex-col gap-2.5" style={{ borderTop: `1px solid ${T.line}` }}>
                    {Object.values(RECURSOS_PRO).map((r) => (
                      <div key={r} className="flex items-start gap-2.5">
                        <span className="flex items-center justify-center rounded-full" style={{
                          width: 19, height: 19, flexShrink: 0, marginTop: 1,
                          background: soft("var(--ok)", 16), color: T.ok,
                        }}><Check size={11} strokeWidth={3} /></span>
                        <span style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.5 }}>{r}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            );
          })}
        </div>

        <div className="pe-rev mt-5" data-rev style={{ transitionDelay: ".3s" }}>
          <Garantia className="px-6 sm:px-7 py-7" />
        </div>

        <div className="pe-rev mt-5" data-rev style={{ transitionDelay: ".34s" }}>
          <Card className="px-6 py-5" flat>
            <Mini style={{ lineHeight: 1.7 }}>
              Crie sua conta antes de assinar e pague com o mesmo e-mail: é por ele
              que a assinatura é reconhecida. E o cronograma completo com
              as {CURRICULUM.length} aulas e {TOTAL_BONUS} tópicos, o cronômetro e o
              registro das sessões continuam de graça, para sempre.
            </Mini>
          </Card>
        </div>
      </div>
    </section>
  );
}
