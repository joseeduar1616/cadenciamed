/* ═══════════════════════════════════════════════════════════════════
   12 · MATÉRIAS
   ═══════════════════════════════════════════════════════════════════ */

/* ── a ficha de estudo do tópico ──────────────────────────────────────
 *
 * Tempo, acertos e dificuldade de um conteúdo estavam em três abas
 * diferentes: os minutos no Foco, as questões no registro de estudo, a
 * dificuldade em Revisões. Quem queria saber "como estou em insuficiência
 * cardíaca?" tinha de abrir as três e fazer a conta de cabeça.
 *
 * Aqui os três ficam juntos, dentro da própria aula, com o registro na
 * mesma tela — e é essa dificuldade que decide quando o conteúdo volta.
 *
 * A conta toda mora no base.jsx (fichaDoTopico), testada pelo
 * testar-ficha.mjs. Aqui é só tela.
 */
function FichaDoTopico({ s, sessions, rec, today, addSession, marcarDificuldade, setMark, setData, notify }) {
  const [abrir, setAbrir] = useState(false);
  const [campos, setCampos] = useState({ minutos: "", questoes: "", acertos: "", comoFoi: "" });
  const [erro, setErro] = useState("");

  const f = useMemo(() => fichaDoTopico(s.id, sessions, rec, today), [s.id, sessions, rec, today]);

  const declarada = f.dificuldade === null ? (f.sugerida === null ? 5 : f.sugerida) : f.dificuldade;
  const faixaMedida = perfDeAproveitamento(f.aproveitamento);
  /* A faixa escolhida à mão discordando do que foi medido: ela entra na
     escada de revisão, então uma escolha velha desloca as revisões sem nada
     na tela discordando dela. */
  const discorda = faixaMedida > 0 && s.perf > 0 && faixaMedida !== s.perf;

  const salvar = () => {
    const r = lerRegistro(campos);
    if (!r.ok) { setErro(r.erro); return; }
    setErro("");
    addSession({
      id: uid(), date: today, subjectId: s.id, area: s.area,
      topic: s.title, kind: r.questoes ? "Questões" : "Aula",
      minutes: r.minutos, questions: r.questoes, correct: r.acertos,
      notes: "ficha da matéria", createdAt: Date.now(),
    });
    /* Uma resposta de "como foi" é uma revisão feita, e ela mexe na escada
       deste tópico — é o que liga o registro à hora em que ele volta. */
    if (r.comoFoi) {
      setData((p) => ({
        ...p,
        reviews: { ...p.reviews, [s.id]: depoisDaRevisao(p.reviews[s.id], r.comoFoi, today) },
      }));
    }
    /* O registro também atualiza a faixa de desempenho, que estava sendo
       escolhida à mão e envelhecia junto. Só quando houve questão: tempo
       sozinho não diz nada sobre acerto. */
    if (r.questoes) {
      const nova = perfDeAproveitamento(aproveitamento(f.questoes + r.questoes, f.acertos + r.acertos));
      if (nova > 0 && nova !== s.perf) setMark(s.id, { perf: nova });
    }
    if (!s.date) setMark(s.id, { date: today });
    setCampos({ minutos: "", questoes: "", acertos: "", comoFoi: "" });
    setAbrir(false);
    notify("Registrado nesta aula.");
  };

  const set = (k, v) => setCampos((p) => ({ ...p, [k]: v }));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Label>Sua ficha nesta aula</Label>
        <Mini>{f.quando}</Mini>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="rounded-xl px-3 py-3" style={{ background: T.card2, border: `1px solid ${T.line}` }}>
          <Mini>tempo</Mini>
          <div style={{ marginTop: 3 }}>
            <Num size={17} color={f.minutos ? T.ink : T.faint} weight={600}>
              {f.minutos ? fmtMin(f.minutos) : "—"}
            </Num>
          </div>
          <Mini style={{ marginTop: 2 }}>{f.sessoes ? `${f.sessoes} ${f.sessoes === 1 ? "vez" : "vezes"}` : "nada ainda"}</Mini>
        </div>
        <div className="rounded-xl px-3 py-3" style={{ background: T.card2, border: `1px solid ${T.line}` }}>
          <Mini>acerto</Mini>
          <div style={{ marginTop: 3 }}>
            <Num size={17} weight={600}
              color={f.aproveitamento === null ? T.faint : perfColor(faixaMedida)}>
              {f.aproveitamento === null ? "—" : `${f.aproveitamento}%`}
            </Num>
          </div>
          <Mini style={{ marginTop: 2 }}>
            {f.questoes ? `${f.acertos} de ${f.questoes}` : "sem questões"}
          </Mini>
        </div>
        <div className="rounded-xl px-3 py-3" style={{ background: T.card2, border: `1px solid ${T.line}` }}>
          <Mini>dificuldade</Mini>
          <div style={{ marginTop: 3 }}>
            <Num size={17} weight={600}
              color={f.dificuldade === null ? T.faint : declarada >= 7 ? T.bad : declarada <= 3 ? T.ok : T.warn}>
              {f.dificuldade === null ? "—" : `${declarada}/10`}
            </Num>
          </div>
          <Mini style={{ marginTop: 2 }}>
            {f.revisoes ? `${f.revisoes} ${f.revisoes === 1 ? "revisão" : "revisões"}` : "sem revisão"}
          </Mini>
        </div>
      </div>

      {/* O quanto este conteúdo é difícil PARA ESTA PESSOA é o que decide
          quando ele volta. Fica aqui, ao lado do acerto medido, porque é
          olhando os dois juntos que a resposta faz sentido. */}
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <Mini style={{ minWidth: 72 }}>o quanto pesa</Mini>
        <input type="range" min="0" max="10" step="1" value={declarada}
          onChange={(e) => marcarDificuldade(s.id, e.target.value)}
          style={{ flex: 1, minWidth: 130, maxWidth: 240, accentColor: "var(--neon)" }}
          aria-label={`Dificuldade de ${s.title}`} />
        <Mini style={{ color: T.dim }}>
          {declarada <= 3 ? "tranquilo" : declarada >= 7 ? "pesado" : "médio"}
          {f.dificuldade === null && f.sugerida !== null ? " · palpite pelo seu acerto" : ""}
        </Mini>
      </div>
      <Mini style={{ marginTop: 6, lineHeight: 1.6 }}>
        É isto que decide quando esta aula volta para revisar: o que pesa volta antes,
        o que é tranquilo se afasta.
      </Mini>

      {discorda ? (
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <Mini style={{ color: T.warn }}>
            a faixa marcada aqui é "{PERF[s.perf]}" e suas questões deram {f.aproveitamento}%
          </Mini>
          <Btn size="sm" tone="quiet" onClick={() => setMark(s.id, { perf: faixaMedida })}>
            usar {PERF[faixaMedida]}
          </Btn>
        </div>
      ) : null}

      {abrir ? (
        <div className="mt-4 rounded-2xl px-4 py-4" style={{ background: T.card2, border: `1px solid ${T.line}` }}>
          <Label>Registrar estudo de hoje</Label>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Minutos">
              <TextInput type="number" min="0" inputMode="numeric" value={campos.minutos}
                placeholder="50" onChange={(e) => set("minutos", e.target.value)} />
            </Field>
            <Field label="Questões">
              <TextInput type="number" min="0" inputMode="numeric" value={campos.questoes}
                placeholder="20" onChange={(e) => set("questoes", e.target.value)} />
            </Field>
            <Field label="Acertos">
              <TextInput type="number" min="0" inputMode="numeric" value={campos.acertos}
                placeholder="14" onChange={(e) => set("acertos", e.target.value)} />
            </Field>
          </div>
          <div className="mt-3">
            <Label>Foi revisão? Como ela foi (opcional)</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {COMO_FOI.map((op) => (
                <Btn key={op.id} size="sm" tone={campos.comoFoi === op.id ? "primary" : "outline"} title={op.dica}
                  onClick={() => set("comoFoi", campos.comoFoi === op.id ? "" : op.id)}>
                  {op.rotulo}
                </Btn>
              ))}
            </div>
            <Mini style={{ marginTop: 8, lineHeight: 1.6 }}>
              Respondendo aqui, a escada desta aula se ajusta: o que foi fácil se afasta,
              e o que você não lembrou recomeça a contagem de hoje. Os degraus continuam
              sendo marcados na aba Revisões. Deixe em branco se foi estudo novo.
            </Mini>
          </div>
          {erro ? <Label style={{ marginTop: 12, color: T.bad }}>{erro}</Label> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn size="sm" tone="primary" onClick={salvar}>Registrar</Btn>
            <Btn size="sm" tone="quiet" onClick={() => { setAbrir(false); setErro(""); }}>cancelar</Btn>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Btn size="sm" onClick={() => setAbrir(true)}>
            <Plus size={14} /> Registrar estudo desta aula
          </Btn>
        </div>
      )}
    </div>
  );
}

function SubjectRow({ s, open, minutes, onToggleOpen, setMark, toggleBonus, anotacao, salvarAnotacao, notify, setData, nuvem, pastas,
  sessions, rec, today, addSession, marcarDificuldade }) {
  const temNota = temAnotacao(anotacao);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3.5 px-5 py-4">
        <Tick on={s.aula} color={aColor(s.area)} size={22} label={s.aula ? "Desmarcar aula" : "Marcar aula"}
          onClick={() => setMark(s.id, { aula: !s.aula, date: !s.aula && !s.date ? todayISO() : s.date })} />
        <button type="button" onClick={onToggleOpen} className="flex-1 min-w-0 text-left flex items-center gap-3"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <span style={{ fontFamily: F_MONO, fontSize: 12, color: T.ghost, width: 24, flexShrink: 0 }}>{pad(s.week)}</span>
          <span className="flex-1 min-w-0">
            <span data-teste="titulo-materia" style={{ display: "block", fontSize: 15, fontWeight: 600, color: s.aula ? T.dim : T.ink, lineHeight: 1.35 }}>{s.title}</span>
            <Mini style={{ marginTop: 2 }}>
              {s.esp}{s.date ? ` · ${brDate(s.date)}` : ""}{minutes ? ` · ${fmtMin(minutes)}` : ""}
            </Mini>
          </span>
        </button>
        {s.bonus.length ? (
          <span style={{
            fontFamily: F_MONO, fontSize: 12, color: s.bonusCount === s.bonus.length ? T.ok : T.faint,
            background: T.card2, padding: "3px 8px", borderRadius: 99, whiteSpace: "nowrap",
          }}>+{s.bonusCount}/{s.bonus.length}</span>
        ) : null}
        {s.perf ? (
          <span className="hidden sm:inline" style={{
            fontFamily: F_MONO, fontSize: 12, color: perfColor(s.perf),
            background: soft(perfColor(s.perf), 15), padding: "3px 9px", borderRadius: 99, whiteSpace: "nowrap",
          }}>{PERF[s.perf]}</span>
        ) : null}
        {temNota ? <NotebookPen size={15} style={{ color: "var(--neon)", flexShrink: 0 }} /> : null}
        <ChevronDown size={16} style={{ color: T.ghost, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }} />
      </div>

      {open ? (
        <div className="px-5 pb-5 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-5" style={{ borderTop: `1px solid ${T.line}` }}>
          {/* A ficha vem primeiro porque é a resposta da pergunta que fez a
              pessoa abrir a linha: "como eu estou nisto?" */}
          <div className="sm:col-span-2 pb-4" style={{ borderBottom: `1px solid ${T.line}` }}>
            <FichaDoTopico s={s} sessions={sessions} rec={rec} today={today}
              addSession={addSession} marcarDificuldade={marcarDificuldade}
              setMark={setMark} setData={setData} notify={notify} />
          </div>
          <div className="sm:col-span-2 pb-4" style={{ borderBottom: `1px solid ${T.line}` }}>
            <AnotacaoMateria subjectId={s.id} area={s.area} titulo={s.title}
              anotacao={anotacao} salvarAnotacao={salvarAnotacao} notify={notify} setData={setData} nuvem={nuvem} pastas={pastas} />
          </div>
          <div className="flex flex-col gap-3">
            <Label>Etapas</Label>
            {[["aula", "Aula assistida"], ["qts", "Questões pós-aula"], ["cards", "Flashcards prontos"]].map(([k, lb]) => (
              <label key={k} className="flex items-center gap-3" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={!!s[k]} onChange={() => setMark(s.id, { [k]: !s[k] })} />
                <span style={{ fontSize: 14.5, color: s[k] ? T.ink : T.dim }}>{lb}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Desempenho nas questões">
              <Select value={s.perf} onChange={(e) => setMark(s.id, { perf: Number(e.target.value) })}>
                {PERF.map((p, i) => <option key={p} value={i}>{p}</option>)}
              </Select>
            </Field>
            <Field label="Data do estudo (âncora das revisões)">
              <TextInput type="date" value={s.date || ""} onChange={(e) => setMark(s.id, { date: e.target.value })} />
            </Field>
          </div>
          {s.bonus.length ? (
            <div className="sm:col-span-2 pt-4" style={{ borderTop: `1px solid ${T.line}` }}>
              <div className="flex items-center justify-between mb-3">
                <Label>Tópicos relacionados</Label>
                <Num size={12} color={T.faint} weight={500}>{s.bonusCount}/{s.bonus.length}</Num>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                {s.bonus.map((b, i) => {
                  const star = b.charAt(0) === "*";
                  const nm = star ? b.slice(1) : b;
                  const on = !!s.bonusDone[i];
                  return (
                    <label key={i} className="flex items-start gap-2.5" style={{ cursor: "pointer" }}>
                      <input type="checkbox" checked={on} onChange={() => toggleBonus(s.id, i)} style={{ marginTop: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, lineHeight: 1.4, color: on ? T.ghost : T.dim, textDecoration: on ? "line-through" : "none" }}>
                        {star ? <span style={{ color: T.warn, marginRight: 4 }}>★</span> : null}{nm}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function Materias({ subjects, setMark, toggleBonus, minutes, done, bonusDone, anotacoes, salvarAnotacao, notify, setData, nuvem, pastas, vazioEm, irPara,
  sessions, reviews, today, addSession, marcarDificuldade }) {
  const [area, setArea] = useState("todas");
  const [status, setStatus] = useState("todas");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);
  const [grouped, setGrouped] = useState(true);
  const ativo = useAtivo();

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return subjects.filter((s) => {
      if (area !== "todas" && s.area !== area) return false;
      if (status === "feitas" && !s.aula) return false;
      if (status === "pendentes" && s.aula) return false;
      if (status === "questoes" && !(s.aula && !s.qts)) return false;
      if (status === "bonus" && !(s.bonus.length > s.bonusCount)) return false;
      if (status === "fracas" && s.perf !== 3) return false;
      if (t) {
        const hit = s.title.toLowerCase().includes(t) || String(s.week).includes(t)
          || s.esp.toLowerCase().includes(t) || s.bonus.some((b) => b.toLowerCase().includes(t));
        if (!hit) return false;
      }
      return true;
    }).sort((a, b) => a.week - b.week || a.area.localeCompare(b.area));
  }, [subjects, area, status, q]);

  const byWeek = useMemo(() => {
    const m = new Map();
    for (const s of list) {
      if (!m.has(s.week)) m.set(s.week, []);
      m.get(s.week).push(s);
    }
    return [...m.entries()];
  }, [list]);

  const byArea = AREA_IDS.map((a) => {
    const all = subjects.filter((s) => s.area === a);
    return { a, total: all.length, done: all.filter((s) => s.aula).length };
  });

  const row = (s) => (
    <SubjectRow key={s.id} s={s} open={openId === s.id} minutes={minutes[s.id] || 0}
      onToggleOpen={() => setOpenId(openId === s.id ? null : s.id)} setMark={setMark} toggleBonus={toggleBonus}
      anotacao={(anotacoes || {})[s.id]} salvarAnotacao={salvarAnotacao} notify={notify} setData={setData} nuvem={nuvem} pastas={pastas}
      sessions={sessions} rec={(reviews || {})[s.id]} today={today}
      addSession={addSession} marcarDificuldade={marcarDificuldade} />
  );

  /* Quem substituiu o currículo inteiro pelo ciclo clínico deixa esta aba
     sem nenhuma matéria. Uma tela em branco parece defeito; aqui ela diz
     onde as matérias foram parar. */
  if (subjects.length === 0 && vazioEm) {
    return (
      <Card className="px-6 py-7">
        <H size={18} color="var(--ok)" icon={<Layers size={16} />}>Suas matérias estão no ciclo clínico</H>
        <Texto style={{ marginTop: 10 }}>
          O cronograma que você subiu cobre todas as áreas, então não sobrou
          nenhuma aula da residência aqui. Elas estão na aba Ciclo clínico,
          com as mesmas anotações e etapas.
        </Texto>
        <Btn tone="primary" className="mt-5" onClick={() => irPara && irPara(vazioEm)}>
          Ir para o Ciclo clínico
        </Btn>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-6">
        <div className="flex flex-wrap items-baseline gap-x-9 gap-y-3">
          <div className="flex items-baseline gap-3">
            <Num size={36}>{done}</Num>
            <Label style={{ fontSize: 15 }}>de {subjects.length} aulas principais</Label>
          </div>
          <div className="flex items-baseline gap-3">
            <Num size={24} color={T.dim}>{bonusDone}</Num>
            <Label>de {ativo.totalBonus} tópicos</Label>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-5 gap-4">
          {byArea.map((x) => (
            <div key={x.a}>
              <div className="flex items-center justify-between mb-2">
                <Chip area={x.a} small />
                <Num size={12.5} color={T.faint} weight={500}>{x.done}/{x.total}</Num>
              </div>
              <Track pct={(x.done / x.total) * 100} color={aColor(x.a)} height={5} />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 rounded-full px-4 flex-1" style={{ background: T.card, border: `1px solid ${T.line}` }}>
          <Search size={15} style={{ color: T.faint }} />
          <input value={q} placeholder="Buscar aula, tópico ou especialidade" onChange={(e) => setQ(e.target.value)}
            style={{ ...inp, background: "transparent", border: "none", padding: "11px 0", borderRadius: 0 }} />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[["todas", "Todas"], ["pendentes", "A fazer"], ["feitas", "Feitas"], ["questoes", "Sem questões"], ["bonus", "Tópicos abertos"], ["fracas", "Baixo desempenho"]].map(([id, lb]) => (
            <button key={id} type="button" onClick={() => setStatus(id)} className="rounded-full px-4 py-2 whitespace-nowrap"
              style={{
                background: status === id ? T.card3 : T.card, border: `1px solid ${T.line}`,
                color: status === id ? T.ink : T.dim, fontSize: 14, fontWeight: status === id ? 700 : 500, cursor: "pointer",
              }}>{lb}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => setArea("todas")} className="toque-larg rounded-full px-4 py-1.5"
          style={{
            background: area === "todas" ? T.card3 : "transparent", border: `1px solid ${area === "todas" ? "transparent" : T.line}`,
            color: area === "todas" ? T.ink : T.dim, fontSize: 14, cursor: "pointer",
          }}>Todas as áreas</button>
        {AREA_IDS.map((a) => (
          <button key={a} type="button" onClick={() => setArea(a)} className="toque-larg rounded-full px-4 py-1.5"
            style={{
              background: area === a ? soft(aColor(a), 18) : "transparent",
              border: `1px solid ${area === a ? "transparent" : T.line}`,
              color: area === a ? aColor(a) : T.dim, fontSize: 14, fontWeight: area === a ? 700 : 500, cursor: "pointer",
            }}>{aLabel(a)}</button>
        ))}
        <div className="flex-1" />
        <Btn size="sm" tone="outline" onClick={() => setGrouped((v) => !v)}>
          {grouped ? "lista corrida" : "agrupar por bloco"}
        </Btn>
      </div>

      {list.length === 0 ? (
        <Card><Blank icon={<Layers size={24} />} title="Nada neste filtro" hint="Afrouxe a busca ou troque a área." /></Card>
      ) : grouped ? (
        <div className="flex flex-col gap-6">
          {byWeek.map(([w, items]) => {
            const wDone = items.filter((s) => s.aula).length;
            return (
              <div key={w}>
                <div className="flex items-center gap-3 mb-2.5 px-1">
                  <span style={{ fontFamily: F_SERIF, fontSize: 20, color: T.ink }}>Bloco {pad(w)} · {items[0].esp}</span>
                  <div className="flex-1" style={{ height: 1, background: T.line }} />
                  <Num size={12.5} color={T.faint} weight={500}>{wDone}/{items.length}</Num>
                </div>
                <div className="flex flex-col gap-2">{items.map(row)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2">{list.map(row)}</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   13 · REVISÕES
   ═══════════════════════════════════════════════════════════════════ */

const Leg = ({ color, t }) => (
  <span className="inline-flex items-center gap-2" style={{ fontSize: 14, color: T.faint }}>
    <span style={{ width: 7, height: 7, borderRadius: 99, background: color }} />{t}
  </span>
);

/* ── o teste de memória ───────────────────────────────────────────────
 *
 * Seis perguntas que dizem de que escada de revisão ESTA pessoa precisa,
 * em vez de ela escolher num cardápio de nomes sem saber qual serve.
 * O cálculo mora no base.jsx (perfilDeMemoria, escadaDoPerfil) e está
 * testado no testar-memoria.mjs; aqui é a tela.
 *
 * O resultado não é uma "categoria" de estudante, é uma escada de dias —
 * e ela só vale quando a pessoa aperta "usar". Até lá o teste é só uma
 * simulação, e a escada em uso continua a de antes.
 */
function TesteDeMemoria({ data, setData, notify }) {
  const pm = data.perfilMemoria || {};
  const [aberto, setAberto] = useState(!pm.aplicadoEm);
  const [resp, setResp] = useState(() => ({ ...(pm.respostas || {}) }));

  /* A data da prova cadastrada no perfil ganha da pergunta de prazo: ela é
     exata, e a pergunta é uma faixa. */
  const prova = data.profile && data.profile.examDate;
  const diasProva = prova ? diasEntreISO(todayISO(), prova) : null;
  const temData = Number.isFinite(diasProva) && diasProva > 0;
  const perguntas = PERGUNTAS_MEMORIA.filter((q) => !(q.id === "prazo" && temData));
  const respondidas = perguntas.filter((q) => resp[q.id] !== undefined).length;
  const completo = respondidas === perguntas.length;

  const perfil = useMemo(() => perfilDeMemoria(resp, temData ? diasProva : null), [resp, temData, diasProva]);
  const dias = useMemo(() => escadaDoPerfil(perfil), [perfil]);
  const curva = useMemo(() => curvaDeRetencao(perfil, dias, perfil.horizonte), [perfil, dias]);
  const noFim = curva[curva.length - 1] || { com: 0, sem: 0 };

  const usar = () => {
    setData((x) => ({
      ...x,
      revisao: { esquema: "personalizado", dias },
      perfilMemoria: { respostas: resp, dias, aplicadoEm: todayISO() },
    }));
    setAberto(false);
    notify(`Escada do seu perfil em uso: ${dias.length} revisões por assunto.`);
  };

  const tip = { background: T.card3, border: `1px solid ${T.line}`, borderRadius: 14, color: T.ink, fontSize: 13.5, boxShadow: T.shadow };
  const emUso = pm.aplicadoEm && (data.revisao || {}).esquema === "personalizado"
    && JSON.stringify((data.revisao || {}).dias) === JSON.stringify(pm.dias);

  if (!aberto) {
    return (
      <Card className="px-6 py-5" brilho="var(--neon)">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <H size={17} color="var(--neon)" icon={<Brain size={16} />}>Seu perfil de memória</H>
          <Btn size="sm" tone="outline" onClick={() => setAberto(true)}>refazer o teste</Btn>
        </div>
        <Texto style={{ marginTop: 8 }}>
          {emUso
            ? <>Suas revisões seguem a escada do seu teste de {brDate(pm.aplicadoEm)}:{" "}
                <span style={{ fontFamily: F_MONO, color: T.ink }}>{pm.dias.map(rotuloDias).join(" · ")}</span></>
            : <>Você trocou de escada depois do teste. Refaça, ou volte a usar a dele quando quiser.</>}
        </Texto>
      </Card>
    );
  }

  return (
    <Card className="px-6 py-6" brilho="var(--neon)">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <H size={18} color="var(--neon)" icon={<Brain size={16} />}>Descubra a sua escada de revisão</H>
        {pm.aplicadoEm ? <Btn size="sm" tone="quiet" onClick={() => setAberto(false)}>fechar</Btn> : null}
      </div>
      <Texto style={{ marginTop: 8 }}>
        Cada pessoa esquece num ritmo diferente, e uma escada que serve para uma
        revisa cedo demais ou tarde demais para outra. Responda com sinceridade:
        daqui sai quando cada assunto volta para você.
      </Texto>

      <div className="mt-5 flex flex-col gap-5">
        {perguntas.map((q, i) => (
          <div key={q.id}>
            <Label>{i + 1}. {q.texto}</Label>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {q.opcoes.map((o) => {
                const on = resp[q.id] === o.valor;
                return (
                  <button key={o.rotulo} type="button"
                    onClick={() => setResp((r) => ({ ...r, [q.id]: o.valor }))}
                    className="rounded-full px-3.5 py-2 brilhar"
                    style={{
                      fontSize: 13.5, cursor: "pointer",
                      background: on ? soft("var(--neon)", 16) : T.card2,
                      border: `1px solid ${on ? soft("var(--neon)", 55) : T.line}`,
                      color: on ? "var(--neon)" : T.dim, fontWeight: on ? 700 : 500,
                    }}>
                    {o.rotulo}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {temData ? (
          <Mini style={{ lineHeight: 1.6 }}>
            O prazo vem da data da sua prova, {brDate(prova)} — daqui a {diasProva} dias.
          </Mini>
        ) : null}
      </div>

      {/* ── o resultado ──────────────────────────────────────────────────
          Aparece desde a primeira resposta, e vai mudando: ver a escada
          reagir a cada resposta é o que faz a pessoa entender o que cada
          pergunta estava medindo. */}
      <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Label>A escada que sai das suas respostas</Label>
          <Mini>{respondidas} de {perguntas.length} respondidas</Mini>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {dias.map((d, i) => (
            <span key={d} style={{
              fontFamily: F_MONO, fontSize: 12, borderRadius: 99, padding: "4px 10px",
              background: T.card2, border: `1px solid ${T.line}`, color: T.ink,
            }}>{i + 1}ª · {rotuloDias(d)}</span>
          ))}
        </div>

        <div className="mt-4" style={{ height: 190 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={curva} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 5" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="dia" type="number" domain={[0, perfil.horizonte]}
                tick={{ fill: "var(--ghost)", fontSize: 10, fontFamily: F_MONO }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `${Math.round(v)}d`} />
              <YAxis domain={[0, 100]} tick={{ fill: "var(--ghost)", fontSize: 10, fontFamily: F_MONO }}
                axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tip}
                labelFormatter={(v) => `dia ${Math.round(v)}`}
                formatter={(v, k) => [`${Math.round(v)}%`, k === "com" ? "revisando" : "sem revisar"]} />
              <Line type="linear" dataKey="sem" stroke="var(--bad)" strokeWidth={1.5}
                strokeDasharray="4 4" dot={false} isAnimationActive={false} />
              <Line type="linear" dataKey="com" stroke="var(--ok)" strokeWidth={2.2}
                dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex items-center gap-4 flex-wrap">
          <Leg color="var(--ok)" t={`revisando: ${Math.round(noFim.com)}% no dia ${perfil.horizonte}`} />
          <Leg color="var(--bad)" t={`sem revisar: ${Math.round(noFim.sem)}%`} />
        </div>
        <Mini style={{ marginTop: 10, lineHeight: 1.65 }}>
          A linha sobe a cada revisão e cai mais devagar depois de cada uma: é a
          memória ficando mais estável. São {dias.length} revisões por assunto — e
          a escada se ajusta sozinha a cada tópico depois, conforme o "como foi"
          de cada revisão.
        </Mini>

        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <Btn tone="primary" disabled={!completo} onClick={usar}>
            <Check size={15} /> Usar esta escada nas minhas revisões
          </Btn>
          {!completo ? <Mini>responda todas para poder usar</Mini> : null}
        </div>
        <Mini style={{ marginTop: 10, lineHeight: 1.6 }}>
          Trocar de escada não apaga nenhuma revisão já feita.
        </Mini>
      </div>
    </Card>
  );
}

/* Escolha do esquema de intervalos. Os degraus cumpridos são guardados pelo
   número de dias, não pela posição, então trocar de esquema não apaga nada:
   o que existe nos dois esquemas continua marcado, e o que só existia no
   antigo apenas some da tela. */
function EsquemaRevisao({ data, setData, degraus, notify }) {
  const cfg = data.revisao || DEFAULTS.revisao;
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState((cfg.dias || []).join(", "));
  const atual = ESQUEMAS.find((e) => e.id === cfg.esquema) || ESQUEMA_PADRAO;

  const escolher = (id) => {
    setData((p) => ({ ...p, revisao: { ...(p.revisao || DEFAULTS.revisao), esquema: id } }));
    if (id === "personalizado") setAberto(true);
  };

  const salvarDias = () => {
    const dias = limparDias(rascunho.split(/[^\d]+/));
    if (dias.length === 0) { notify("Escreva pelo menos um número de dias."); return; }
    setData((p) => ({ ...p, revisao: { esquema: "personalizado", dias } }));
    setRascunho(dias.join(", "));
    notify(`Escada com ${dias.length} degrau${dias.length === 1 ? "" : "s"}.`);
  };

  return (
    <Card className="px-6 py-6" brilho="var(--ok)">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <H size={18} color="var(--ok)" icon={<RotateCcw size={16} />}>Intervalos da revisão</H>
        <button type="button" onClick={() => setAberto((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 brilhar"
          style={{ background: T.card2, border: `1px solid ${T.line}`, color: T.dim, fontSize: 13.5, cursor: "pointer" }}>
          <Settings2 size={14} /> {aberto ? "fechar" : "trocar esquema"}
        </button>
      </div>
      <Texto style={{ marginTop: 10 }}>
        Em uso: <span style={{ color: T.ink, fontWeight: 700 }}>
          {cfg.esquema === "personalizado" && (data.perfilMemoria || {}).aplicadoEm
            && JSON.stringify(cfg.dias) === JSON.stringify((data.perfilMemoria || {}).dias)
            ? "Pelo seu perfil de memória" : atual.nome}
        </span> ·{" "}
        {degraus.map((d) => d.label).join(" · ")}
      </Texto>

      {aberto ? (
        <>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {ESQUEMAS.map((e) => {
              const on = e.id === cfg.esquema;
              const dias = e.id === "personalizado"
                ? (limparDias(cfg.dias).length ? limparDias(cfg.dias) : e.dias)
                : e.dias;
              return (
                <button key={e.id} type="button" onClick={() => escolher(e.id)}
                  className="rounded-2xl px-4 py-3.5 text-left brilhar"
                  style={{
                    background: on ? soft("var(--ok)", 13) : T.card2,
                    border: `1px solid ${on ? soft("var(--ok)", 55) : T.line}`,
                    cursor: "pointer", color: T.ink,
                  }}>
                  <div className="flex items-center gap-2">
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: on ? T.ok : T.ghost, flexShrink: 0 }} />
                    <span style={{ fontSize: 15, fontWeight: on ? 700 : 600 }}>{e.nome}</span>
                    <span style={{ fontFamily: F_MONO, fontSize: 11, color: T.ghost, marginLeft: "auto" }}>
                      {dias.length} degraus
                    </span>
                  </div>
                  <Mini style={{ marginTop: 6, lineHeight: 1.5 }}>{e.descricao}</Mini>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {dias.map((d) => (
                      <span key={d} style={{
                        fontFamily: F_MONO, fontSize: 10.5, borderRadius: 99, padding: "2px 7px",
                        background: T.card3, color: on ? T.ok : T.faint,
                      }}>{rotuloDias(d)}</span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
            <Field label={`Do seu jeito: os dias, separados por vírgula (até ${MAX_DEGRAUS})`}>
              <div className="flex gap-2 items-center flex-wrap">
                <TextInput value={rascunho} placeholder="Ex.: 1, 7, 30, 90"
                  onChange={(ev) => setRascunho(ev.target.value)}
                  onKeyDown={(ev) => { if (ev.key === "Enter") salvarDias(); }}
                  style={{ flex: 1, minWidth: 200, fontFamily: F_MONO }} />
                <Btn tone="primary" onClick={salvarDias}>Usar estes dias</Btn>
              </div>
            </Field>
            <Mini style={{ marginTop: 10, lineHeight: 1.65 }}>
              Cada número é quantos dias depois da aula aquela revisão cai.
              Trocar de esquema não apaga o que já foi feito: os degraus que
              existem nos dois continuam marcados.
            </Mini>
          </div>
        </>
      ) : null}
    </Card>
  );
}

/* Como foi a revisão. É a pergunta que faz a escada se ajustar: sem ela, o
   intervalo seria o mesmo para o que a pessoa lembrou de cara e para o que
   ela não lembrou de jeito nenhum. */
const COMO_FOI = [
  { id: "facil", rotulo: "fácil", cor: "var(--ok)", dica: "lembrei de cara — pode demorar mais a voltar" },
  { id: "ok", rotulo: "ok", cor: "var(--neon)", dica: "lembrei com esforço" },
  { id: "dificil", rotulo: "difícil", cor: "var(--warn)", dica: "custou — volta mais cedo" },
  { id: "errei", rotulo: "não lembrei", cor: "var(--bad)", dica: "recomeça a contagem de hoje" },
];

function Revisoes({ rows, toggleStep, resetCycle, marcarDificuldade, data, setData, degraus, notify }) {
  /* Qual degrau está esperando a resposta de "como foi". Guardado como
     "id do tópico|dia" porque o mesmo tópico tem vários degraus. */
  const [perguntando, setPerguntando] = useState("");
  const [onlyLate, setOnlyLate] = useState(false);
  const list = onlyLate ? rows.filter((r) => r.late.length > 0) : rows;
  const colunas = { gridTemplateColumns: `repeat(${Math.max(1, degraus.length)}, minmax(0, 1fr))` };
  const ativo = useAtivo();

  return (
    <div className="flex flex-col gap-4">
      <TesteDeMemoria data={data} setData={setData} notify={notify} />
      <EsquemaRevisao data={data} setData={setData} degraus={degraus} notify={notify} />

      {rows.length === 0 ? (
        <Card><Blank icon={<RotateCcw size={26} />} title="Nenhuma aula concluída ainda"
          hint="Marque uma aula como feita em Matérias e ela entra na escada de revisão." /></Card>
      ) : (
        <>
          <Card className="px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <Leg color={T.ok} t="cumprido" />
                <Leg color={T.warn} t="vencido ou vence hoje" />
                <Leg color={T.ghost} t="dentro do prazo" />
              </div>
              <Btn size="sm" tone={onlyLate ? "primary" : "outline"} onClick={() => setOnlyLate((v) => !v)}>só os atrasados</Btn>
            </div>
          </Card>

          {list.map((r) => (
            <Card key={r.id} className="px-5 sm:px-6 py-5">
              <div className="flex items-start gap-3.5">
                <span style={{ width: 3, height: 32, borderRadius: 3, background: aColor(r.area), flexShrink: 0, marginTop: 2 }} />
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>{r.title}</div>
                  <Mini style={{ marginTop: 3 }}>
                    {ativo.byId[r.id] ? ativo.byId[r.id].esp : ""} · âncora em {brDate(r.anchor)}{r.minutes ? ` · ${fmtMin(r.minutes)} registrados` : ""}
                  </Mini>
                </div>
                <Btn size="sm" tone="outline" onClick={() => resetCycle(r.id)} title="Recomeça a contagem hoje">
                  <RotateCcw size={12} /> <span className="hidden sm:inline">reiniciar</span>
                </Btn>
              </div>
              {/* uma coluna por degrau, seja qual for o esquema escolhido */}
              <div className="mt-4 grid gap-1.5 sm:gap-2" style={colunas}>
                {r.steps.map((st) => {
                  const active = st.state === "vencida" || st.state === "hoje";
                  const col = st.state === "feita" ? T.ok : active ? T.warn : T.ghost;
                  return (
                    <button key={st.d} type="button"
                      onClick={() => {
                        /* Marcar pergunta como foi; desmarcar é só desfazer
                           um clique, e não mexe na adaptação. */
                        if (st.state === "feita") toggleStep(r.id, st.d, r.anchor);
                        else setPerguntando(`${r.id}|${st.d}`);
                      }}
                      className="rounded-2xl px-1 py-3 flex flex-col items-center gap-2 brilhar"
                      title={st.on ? `revisado em ${brDate(st.on)}` : `vence em ${brDate(st.due)}`}
                      style={{
                        background: st.state === "feita" ? soft("var(--ok)", 12) : active ? soft("var(--warn)", 12) : T.card2,
                        border: `1px solid ${st.state === "feita" ? soft("var(--ok)", 26) : active ? soft("var(--warn)", 26) : "transparent"}`,
                        cursor: "pointer",
                      }}>
                      <span className={active ? "breathe" : ""} style={{ width: 7, height: 7, borderRadius: 99, background: col, display: "block", boxShadow: active ? `0 0 10px ${col}` : "none" }} />
                      <span style={{ fontFamily: F_MONO, fontSize: 11.5, color: col }}>{st.label}</span>
                      <span style={{ fontSize: 10.5, color: T.ghost }}>{brDate(st.on || st.due)}</span>
                    </button>
                  );
                })}
              </div>

              {/* ── como foi a revisão ───────────────────────────────────
                * A escada deste tópico sai daqui. Quatro respostas, porque
                * duas ("lembrei" / "não lembrei") não distinguem o que
                * voltou de cara do que voltou a duras penas — e é
                * justamente essa diferença que diz se o intervalo pode
                * crescer. */}
              {perguntando.startsWith(`${r.id}|`) ? (
                <div className="mt-4 rounded-2xl px-4 py-4"
                  style={{ background: T.card2, border: `1px solid ${T.line}` }}>
                  <Label>Como foi essa revisão?</Label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {COMO_FOI.map((op) => (
                      <Btn key={op.id} size="sm" tone="outline" title={op.dica}
                        style={{ borderColor: soft(op.cor, 40), color: op.cor }}
                        onClick={() => {
                          const dia = Number(perguntando.split("|")[1]);
                          toggleStep(r.id, dia, r.anchor, op.id);
                          setPerguntando("");
                          if (op.id === "errei") notify("Contagem reiniciada hoje: esse conteúdo volta logo.");
                        }}>
                        {op.rotulo}
                      </Btn>
                    ))}
                    <Btn size="sm" tone="quiet" onClick={() => setPerguntando("")}>cancelar</Btn>
                  </div>
                  <Mini style={{ marginTop: 10, lineHeight: 1.6 }}>
                    A resposta muda quando este conteúdo volta. Nada de escada fixa:
                    o que você lembra fácil se afasta, o que custa volta antes.
                  </Mini>
                </div>
              ) : null}

              {/* ── o quanto este conteúdo é difícil PARA VOCÊ ──────────
                * É o ponto de partida da escada, antes de existir qualquer
                * revisão para corrigi-la. */}
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <Mini>dificuldade</Mini>
                <input type="range" min="0" max="10" step="1"
                  value={Number((data.reviews[r.id] || {}).dificuldade ?? 5)}
                  onChange={(e) => marcarDificuldade(r.id, e.target.value)}
                  style={{ flex: 1, minWidth: 140, maxWidth: 260, accentColor: "var(--neon)" }}
                  aria-label={`Dificuldade de ${r.title}`} />
                <Mini style={{ color: T.dim }}>
                  {(() => {
                    const d = Number((data.reviews[r.id] || {}).dificuldade ?? 5);
                    return d <= 3 ? "tranquilo" : d >= 7 ? "pesado" : "médio";
                  })()}
                </Mini>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   14 · CALENDÁRIO .ICS
   ═══════════════════════════════════════════════════════════════════ */

function icsText(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function icsFold(line) {
  if (line.length <= 74) return line;
  const out = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length > 73) { out.push(" " + rest.slice(0, 73)); rest = rest.slice(73); }
  if (rest) out.push(" " + rest);
  return out.join("\r\n");
}
const icsDay = (iso) => String(iso).replace(/-/g, "");
const icsLocal = (iso, hhmm) => `${icsDay(iso)}T${String(hhmm).replace(":", "")}00`;
function icsStamp() {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function buildICS({ routine, agenda, ladder, simulados, examDate, today, opts }) {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cadencia//Painel de estudos//PT-BR",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Cadência", "X-WR-TIMEZONE:America/Sao_Paulo"];
  const stamp = icsStamp();
  const monday = weekStart(today);
  let n = 0;
  const push = (lines) => { n += 1; L.push(...lines); };

  if (opts.rotina) {
    for (const b of (agenda || [])) {
      if (b.gid) continue;
      push(["BEGIN:VEVENT", `UID:agenda-${b.id}@cadencia`, `DTSTAMP:${stamp}`,
        `DTSTART:${icsLocal(b.date, b.start)}`, `DTEND:${icsLocal(b.date, b.end)}`,
        `SUMMARY:${icsText(b.label)}`, `DESCRIPTION:${icsText(`${b.type} · compromisso do dia (Cadência)`)}`,
        `CATEGORIES:${icsText(b.type)}`, "END:VEVENT"]);
    }
    for (const b of routine) {
      const dia = addDays(monday, Number(b.day) || 0);
      push(["BEGIN:VEVENT", `UID:rotina-${b.id}@cadencia`, `DTSTAMP:${stamp}`,
        `DTSTART:${icsLocal(dia, b.start)}`, `DTEND:${icsLocal(dia, b.end)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[Number(b.day) || 0]}`,
        `SUMMARY:${icsText(b.label)}`, `DESCRIPTION:${icsText(`${b.type} · bloco fixo da semana (Cadência)`)}`,
        `CATEGORIES:${icsText(b.type)}`, "END:VEVENT"]);
    }
  }
  if (opts.revisoes) {
    const limite = addDays(today, 240);
    for (const r of ladder) {
      for (const st of r.steps) {
        if (st.on || st.due > limite) continue;
        push(["BEGIN:VEVENT", `UID:revisao-${r.id}-${st.d}@cadencia`, `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${icsDay(st.due)}`, `DTEND;VALUE=DATE:${icsDay(addDays(st.due, 1))}`,
          `SUMMARY:${icsText(`Revisar ${st.label}: ${r.title}`)}`,
          `DESCRIPTION:${icsText(`${aLabel(r.area)} · estudado em ${brDate(r.anchor)}`)}`,
          "CATEGORIES:Revisão", "TRANSP:TRANSPARENT", "END:VEVENT"]);
      }
    }
  }
  if (opts.simulados) {
    SIMULADOS.forEach(([nome, ini, fim], i) => {
      if (simulados[i]) return;
      push(["BEGIN:VEVENT", `UID:simulado-${i}@cadencia`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDay(ini)}`, `DTEND;VALUE=DATE:${icsDay(addDays(fim, 1))}`,
        `SUMMARY:${icsText(`${nome} · janela aberta`)}`,
        `DESCRIPTION:${icsText("Janela oficial do cronograma (Cadência)")}`,
        "CATEGORIES:Simulado", "TRANSP:TRANSPARENT", "END:VEVENT"]);
    });
  }
  if (opts.prova && examDate) {
    push(["BEGIN:VEVENT", `UID:prova-${icsDay(examDate)}@cadencia`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDay(examDate)}`, `DTEND;VALUE=DATE:${icsDay(addDays(examDate, 1))}`,
      "SUMMARY:Dia da prova", "CATEGORIES:Prova", "END:VEVENT"]);
  }
  L.push("END:VCALENDAR");
  return { texto: L.map(icsFold).join("\r\n") + "\r\n", total: n };
}

function baixar(nome, mime, texto, notify) {
  try {
    const blob = new Blob([texto], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) {
    if (navigator.clipboard) navigator.clipboard.writeText(texto).then(
      () => notify && notify("Não deu para baixar, então copiei o conteúdo."), () => {});
    return false;
  }
}
