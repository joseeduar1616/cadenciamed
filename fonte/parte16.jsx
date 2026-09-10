/* ═══════════════════════════════════════════════════════════════════
   30 · MENTOR
   Quem resgatou o cupom "mentor1612" adiciona alunos pelo e-mail com que
   eles se cadastraram (useMentor, no parte3.jsx) e daqui monta a rotina,
   as metas e marca o currículo de cada um — os mesmos três campos que o
   próprio aluno mexe em Rotina, Hoje e Matérias, só que a rota /api/mentor
   é quem grava, do lado do servidor.
   ═══════════════════════════════════════════════════════════════════ */

function resumoSessoesAluno(sessions, today) {
  const desde = addDays(today, -6);
  let minutos = 0, questoes = 0, acertos = 0;
  for (const s of sessions || []) {
    if (!s || !s.date || s.date < desde || s.date > today) continue;
    minutos += Number(s.minutes) || 0;
    questoes += Number(s.questions) || 0;
    acertos += Number(s.correct) || 0;
  }
  return {
    minutos: Math.round(minutos), questoes, acertos,
    pct: questoes ? Math.round((acertos / questoes) * 100) : null,
  };
}

function NovoAluno({ mentorInfo, notify }) {
  const [email, setEmail] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const enviar = async () => {
    const e = email.trim();
    if (!e) return;
    setOcupado(true);
    const r = await mentorInfo.adicionar(e);
    setOcupado(false);
    if (r && r.erro) return notify(r.erro);
    setEmail("");
    notify(r.mensagem || "Aluno adicionado.");
  };

  return (
    <div className="flex gap-2 flex-wrap items-end">
      <div style={{ flex: 1, minWidth: 220 }}>
        <Field label="E-mail do aluno">
          <TextInput value={email} placeholder="a pessoa precisa já ter conta no Cadência" autoCapitalize="none"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} />
        </Field>
      </div>
      <Btn tone="primary" disabled={ocupado || !email.trim()} onClick={enviar}>
        <Plus size={15} />{ocupado ? "Adicionando…" : "Adicionar"}
      </Btn>
    </div>
  );
}

function LinhaAluno({ a, aberto, onAbrir, onRemover }) {
  return (
    <button type="button" onClick={onAbrir}
      className="flex items-center gap-3 rounded-2xl px-4 py-3 w-full text-left"
      style={{
        background: aberto ? soft("var(--neon2)", 14) : T.card2,
        border: `1px solid ${aberto ? soft("var(--neon2)", 34) : T.line}`, cursor: "pointer",
      }}>
      <span className="flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: soft("var(--neon2)", 18), color: "var(--neon2)", flexShrink: 0 }}>
        <User size={15} />
      </span>
      <span className="flex-1 min-w-0">
        <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.email}</div>
        <Mini>desde {brDate(toISO(new Date(a.adicionadoEm || Date.now())))}</Mini>
      </span>
      <span role="button" tabIndex={0} aria-label="Remover aluno"
        onClick={(e) => { e.stopPropagation(); onRemover(); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onRemover(); } }}
        className="flex items-center justify-center rounded-full brilhar"
        style={{ width: 30, height: 30, color: T.faint, flexShrink: 0 }}>
        <Trash2 size={14} />
      </span>
    </button>
  );
}

function BlocoRotinaEditor({ rotina, setRotina }) {
  const [nb, setNb] = useState({ day: "0", label: "", type: "Estudo", start: "07:00", end: "08:00" });
  const add = () => {
    setRotina([...rotina, {
      id: uid(), day: Number(nb.day), label: nb.label.trim() || nb.type,
      type: nb.type, start: nb.start, end: nb.end,
    }]);
    setNb((p) => ({ ...p, label: "" }));
  };
  const del = (id) => setRotina(rotina.filter((b) => b.id !== id));

  return (
    <div className="flex flex-col gap-3">
      {rotina.length === 0 ? <Mini>ainda sem blocos nesta rotina</Mini> : null}
      {rotina.map((b) => (
        <div key={b.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={{ background: T.card2, border: `1px solid ${T.line}` }}>
          <span className="rounded-full" style={{ width: 8, height: 8, background: BLOCKS[b.type] || T.faint, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: T.dim, width: 34, flexShrink: 0 }}>{DAYS[b.day] || "?"}</span>
          <span className="flex-1 min-w-0" style={{ fontSize: 13.5, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {b.label || b.type} <span style={{ color: T.faint }}>· {b.start}-{b.end}</span>
          </span>
          <button type="button" onClick={() => del(b.id)} className="flex items-center justify-center rounded-full" style={{ width: 26, height: 26, color: T.faint, cursor: "pointer", background: "none", border: "none" }}>
            <X size={13} />
          </button>
        </div>
      ))}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-1">
        <Select value={nb.day} onChange={(e) => setNb((p) => ({ ...p, day: e.target.value }))}>
          {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </Select>
        <Select value={nb.type} onChange={(e) => setNb((p) => ({ ...p, type: e.target.value }))}>
          {BLOCK_IDS.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <TextInput value={nb.label} placeholder="rótulo (opcional)" onChange={(e) => setNb((p) => ({ ...p, label: e.target.value }))} />
        <TextInput type="time" value={nb.start} onChange={(e) => setNb((p) => ({ ...p, start: e.target.value }))} />
        <TextInput type="time" value={nb.end} onChange={(e) => setNb((p) => ({ ...p, end: e.target.value }))} />
      </div>
      <Btn size="sm" onClick={add}><Plus size={14} />Acrescentar bloco</Btn>
    </div>
  );
}

function TarefasEditor({ tarefas, setTarefas }) {
  const [texto, setTexto] = useState("");
  const add = () => {
    const t = texto.trim();
    if (!t) return;
    setTarefas([{ id: uid(), text: t, done: false }, ...tarefas]);
    setTexto("");
  };
  const toggle = (id) => setTarefas(tarefas.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const del = (id) => setTarefas(tarefas.filter((t) => t.id !== id));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <TextInput value={texto} placeholder="nova meta para o aluno" onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <Btn onClick={add}><Plus size={15} /></Btn>
      </div>
      {tarefas.length === 0 ? <Mini>nenhuma meta ainda</Mini> : null}
      {tarefas.map((t) => (
        <label key={t.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={{ background: T.card2, border: `1px solid ${T.line}`, cursor: "pointer" }}>
          <input type="checkbox" checked={!!t.done} onChange={() => toggle(t.id)} />
          <span className="flex-1 min-w-0" style={{ fontSize: 13.5, color: t.done ? T.faint : T.ink, textDecoration: t.done ? "line-through" : "none" }}>{t.text}</span>
          <button type="button" onClick={() => del(t.id)} className="flex items-center justify-center rounded-full" style={{ width: 24, height: 24, color: T.faint, cursor: "pointer", background: "none", border: "none" }}>
            <X size={12} />
          </button>
        </label>
      ))}
    </div>
  );
}

function CurriculoDoAluno({ cronogramaProprio, marks, buscaMateria, setBuscaMateria, onMarcar }) {
  const filtro = chaveTexto(buscaMateria);
  /* O currículo ativo é do ALUNO, não do mentor: cada um pode ter subido o
     seu próprio (parte9.jsx, Cronograma), então usa a mesma função pura de
     montar o currículo (base.jsx) direto com o que veio na resposta de
     /api/mentor, em vez do useAtivo() — esse reflete o currículo do mentor,
     que aqui não tem nada a ver com o que se está editando. */
  const lista = useMemo(() => montarCurriculo(cronogramaProprio).lista, [cronogramaProprio]);
  const porArea = useMemo(() => {
    const m = new Map();
    for (const s of lista) {
      if (filtro && !chaveTexto(s.title).includes(filtro) && !chaveTexto(s.area).includes(filtro)) continue;
      if (!m.has(s.area)) m.set(s.area, []);
      m.get(s.area).push(s);
    }
    return m;
  }, [lista, filtro]);

  return (
    <div className="flex flex-col gap-3">
      <TextInput value={buscaMateria} placeholder="buscar matéria ou área…" onChange={(e) => setBuscaMateria(e.target.value)} />
      <div className="flex flex-col gap-4" style={{ maxHeight: 360, overflowY: "auto" }}>
        {[...porArea.entries()].map(([area, itens]) => (
          <div key={area}>
            <Mini style={{ marginBottom: 6 }}>{AREAS[area] || area}</Mini>
            <div className="flex flex-col gap-1.5">
              {itens.map((s) => {
                const feito = !!(marks[s.id] && marks[s.id].aula);
                return (
                  <label key={s.id} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5" style={{ cursor: "pointer" }}>
                    <input type="checkbox" checked={feito} onChange={() => onMarcar(s.id, !feito)} />
                    <span style={{ fontSize: 13, color: feito ? T.faint : T.ink }}>{s.title}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {porArea.size === 0 ? <Mini>nenhuma matéria encontrada</Mini> : null}
      </div>
    </div>
  );
}

function PainelAluno({ mentorInfo, uid, notify }) {
  const [carregando, setCarregando] = useState(true);
  const [aluno, setAluno] = useState(null);
  const [encontrado, setEncontrado] = useState(true);
  const [mensagem, setMensagem] = useState("");
  const [rotina, setRotina] = useState([]);
  const [tarefas, setTarefas] = useState([]);
  const [buscaMateria, setBuscaMateria] = useState("");
  const [salvandoRotina, setSalvandoRotina] = useState(false);
  const [salvandoTarefas, setSalvandoTarefas] = useState(false);
  const today = todayISO();

  useEffect(() => {
    let vivo = true;
    setCarregando(true); setAluno(null); setBuscaMateria("");
    (async () => {
      const r = await mentorInfo.buscarAluno(uid);
      if (!vivo) return;
      setCarregando(false);
      if (r && r.erro) { setMensagem(r.erro); setEncontrado(false); return; }
      setEncontrado(!!r.encontrado);
      setMensagem(r.mensagem || "");
      if (r.encontrado) {
        setAluno(r.aluno);
        setRotina(r.aluno.routine || []);
        setTarefas(r.aluno.tasks || []);
      }
    })();
    return () => { vivo = false; };
  }, [uid, mentorInfo]);

  const marcar = async (materiaId, feito) => {
    setAluno((p) => (p ? { ...p, marks: { ...p.marks, [materiaId]: { ...(p.marks[materiaId] || {}), aula: feito } } } : p));
    const r = await mentorInfo.marcar(uid, materiaId, feito);
    if (r && r.erro) notify(r.erro);
  };

  const salvarRotina = async () => {
    setSalvandoRotina(true);
    const r = await mentorInfo.salvarRotina(uid, rotina);
    setSalvandoRotina(false);
    notify(r && r.erro ? r.erro : "Rotina salva.");
  };

  const salvarTarefas = async () => {
    setSalvandoTarefas(true);
    const r = await mentorInfo.salvarTarefas(uid, tarefas);
    setSalvandoTarefas(false);
    notify(r && r.erro ? r.erro : "Metas salvas.");
  };

  if (carregando) return <Card className="px-6 py-10 text-center"><Mini>carregando…</Mini></Card>;
  if (!encontrado) {
    return (
      <Card className="px-6 py-8">
        <Blank icon={<CloudOff size={26} />} title="Sem dados na nuvem" hint={mensagem} />
      </Card>
    );
  }
  if (!aluno) return null;

  const resumo = resumoSessoesAluno(aluno.sessions, today);
  const total = montarCurriculo(aluno.cronogramaProprio).lista.length;
  const concluidas = Object.values(aluno.marks || {}).filter((m) => m && m.aula).length;

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-6" brilho="var(--neon2)">
        <H color="var(--neon2)" icon={<GraduationCap size={16} />}>{aluno.nome || "sem nome"}</H>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div><Mini>currículo</Mini><div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>{concluidas}/{total}</div></div>
          <div><Mini>minutos · 7 dias</Mini><div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>{resumo.minutos}</div></div>
          <div><Mini>questões · 7 dias</Mini><div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>{resumo.questoes}</div></div>
          <div><Mini>acerto · 7 dias</Mini><div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>{resumo.pct === null ? "—" : `${resumo.pct}%`}</div></div>
        </div>
        {aluno.examDate ? <Mini style={{ marginTop: 10 }}>prova marcada para {brDate(aluno.examDate)}</Mini> : null}
      </Card>

      <Card className="px-6 py-6">
        <H color="var(--a-PE)" icon={<CalendarDays size={16} />}>Rotina</H>
        <div className="mt-4"><BlocoRotinaEditor rotina={rotina} setRotina={setRotina} /></div>
        <Btn tone="primary" className="mt-4" disabled={salvandoRotina} onClick={salvarRotina}>
          {salvandoRotina ? "Salvando…" : "Salvar rotina"}
        </Btn>
      </Card>

      <Card className="px-6 py-6">
        <H color="var(--warn)" icon={<ListChecks size={16} />}>Metas</H>
        <div className="mt-4"><TarefasEditor tarefas={tarefas} setTarefas={setTarefas} /></div>
        <Btn tone="primary" className="mt-4" disabled={salvandoTarefas} onClick={salvarTarefas}>
          {salvandoTarefas ? "Salvando…" : "Salvar metas"}
        </Btn>
      </Card>

      <Card className="px-6 py-6">
        <H color="var(--a-GO)" icon={<BookMarked size={16} />}>Currículo</H>
        <Texto style={{ marginTop: 6 }}>marcar aqui é o mesmo que o aluno marcar em Matérias: grava na hora, sem precisar salvar</Texto>
        <div className="mt-4">
          <CurriculoDoAluno cronogramaProprio={aluno.cronogramaProprio} marks={aluno.marks} buscaMateria={buscaMateria} setBuscaMateria={setBuscaMateria} onMarcar={marcar} />
        </div>
      </Card>
    </div>
  );
}

function Mentor({ nuvem, notify, mentorInfo }) {
  const [abertoUid, setAbertoUid] = useState(null);

  const remover = async (a) => {
    const r = await mentorInfo.remover(a.uid);
    if (r && r.erro) notify(r.erro);
    else { notify(`${a.email} removido(a).`); if (abertoUid === a.uid) setAbertoUid(null); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      <Card className="px-6 py-6" brilho="var(--neon2)">
        <H color="var(--neon2)" icon={<GraduationCap size={16} />}>Seus alunos</H>
        <Texto style={{ marginTop: 8 }}>
          Adicione pelo e-mail com que a pessoa se cadastrou no Cadência. Só funciona
          com quem já tem conta e o plano com a nuvem ligada. Sem isso não há dados
          para ler nem gravar.
        </Texto>
        <div className="mt-5"><NovoAluno mentorInfo={mentorInfo} notify={notify} /></div>
        <div className="mt-5 flex flex-col gap-2">
          {mentorInfo.alunos.length === 0 ? (
            <Blank icon={<Users size={26} />} title="Nenhum aluno ainda"
              hint="Assim que adicionar alguém, a pessoa aparece aqui para você montar a rotina e as metas dela." />
          ) : mentorInfo.alunos.map((a) => (
            <LinhaAluno key={a.uid} a={a} aberto={abertoUid === a.uid}
              onAbrir={() => setAbertoUid(a.uid)} onRemover={() => remover(a)} />
          ))}
        </div>
      </Card>

      {abertoUid ? (
        <PainelAluno key={abertoUid} mentorInfo={mentorInfo} uid={abertoUid} notify={notify} />
      ) : (
        <Card className="px-6 py-10 text-center">
          <Blank icon={<GraduationCap size={26} />} title="Escolha um aluno"
            hint="Clique num nome à esquerda para ver o progresso e montar a rotina, as metas e o currículo." />
        </Card>
      )}
    </div>
  );
}
