/* ═══════════════════════════════════════════════════════════════════
   30 · DESEMPENHO, CICLO CLÍNICO E CONFIGURAÇÕES

   Três abas que arrumam coisas que já existiam espalhadas:

   · Desempenho: as questões já eram gravadas em cada sessão (questions e
     correct, desde sempre), mas só dava para lançá-las junto com tempo de
     estudo, e o acerto por matéria não aparecia em lugar nenhum. Aqui o
     lançamento é só de questões, e o resultado é lido por área e por
     matéria, com a mais fraca em primeiro.

   · Ciclo clínico: as matérias do ciclo são as de data.cronogramaProprio.
     Elas moram na mesma lista do currículo ativo, então esta aba é a
     mesma tela de Matérias com a lista filtrada. Isso é de propósito: a
     anotação, as etapas e o desempenho de cada aula são exatamente os
     mesmos, sem uma segunda implementação para manter em pé.

   · Configurações: conta, plano, aparência, layout, metas, esquema de
     revisão e backup, que estavam divididos entre o rodapé, a aba
     Progresso, a Revisões e a Metas.
   ═══════════════════════════════════════════════════════════════════ */

/* As matérias que vieram do cronograma próprio (o ciclo clínico), pelo id.
   Um Set, e não uma busca na lista, porque isto é consultado uma vez por
   matéria em toda renderização das duas abas. */
function idsDoCiclo(data) {
  return new Set(((data && data.cronogramaProprio) || []).map((s) => s.id));
}

/* ── desempenho ──────────────────────────────────────────────────────── */

/* Acerto de um monte de sessões. Devolve null quando não houve questão
   nenhuma: 0% e "não lancei nada" são coisas diferentes, e mostrar 0%
   para quem nunca lançou é dar uma nota que ninguém tirou. */
function acertoDe(sessoes) {
  let q = 0;
  let ok = 0;
  for (const s of sessoes) { q += s.questions || 0; ok += s.correct || 0; }
  return { q, ok, pct: q ? Math.round((ok / q) * 100) : null };
}

const corDoAcerto = (pct) => (pct === null ? T.dim : pct >= 80 ? T.ok : pct >= 61 ? T.warn : T.bad);

/* Barra de acerto: a parte cheia é o que acertou. A largura mínima de 2%
   existe para 1 acerto em 200 questões ainda aparecer como um risco, em
   vez de sumir e parecer zero. */
function BarraAcerto({ pct, cor, altura = 7 }) {
  return (
    <div style={{ height: altura, borderRadius: 99, background: T.card3, overflow: "hidden" }}>
      <div style={{
        width: `${pct === null ? 0 : Math.max(2, Math.min(100, pct))}%`,
        height: "100%", borderRadius: 99, background: cor, transition: "width .3s",
      }} />
    </div>
  );
}

function LancarQuestoes({ today, addSession, notify }) {
  const ativo = useAtivo();
  const [f, setF] = useState({ subjectId: null, livre: "", date: today, q: "", c: "", min: "", notas: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const q = Number(f.q) || 0;
  const ok = Number(f.c) || 0;

  const lancar = () => {
    const materia = f.subjectId ? ativo.byId[f.subjectId] : null;
    const tema = materia ? materia.title : f.livre.trim();
    if (!tema) return notify("Escolha a matéria ou escreva o assunto das questões.");
    if (q < 1) return notify("Quantas questões você fez?");
    if (ok > q) return notify("Os acertos não podem passar do total de questões.");
    addSession({
      id: uid(),
      date: f.date,
      subjectId: f.subjectId,
      area: materia ? materia.area : null,
      topic: tema,
      kind: "Questões",
      /* Tempo é opcional aqui, e esse é o ponto desta tela: o lançamento
         de sessão exigia pelo menos um minuto, então quem só queria
         registrar as questões não tinha por onde. */
      minutes: Math.max(0, Number(f.min) || 0),
      questions: q,
      correct: Math.min(ok, q),
      notes: f.notas.trim(),
      createdAt: Date.now(),
    });
    notify(`${q} questão${q === 1 ? "" : "ões"} lançada${q === 1 ? "" : "s"}, ${Math.round((ok / q) * 100)}% de acerto.`);
    setF((p) => ({ ...p, livre: "", q: "", c: "", min: "", notas: "" }));
    return undefined;
  };

  return (
    <Card className="px-6 py-6" brilho="var(--a-CI)">
      <H size={18} color="var(--a-CI)" icon={<ListChecks size={16} />}>Lançar questões</H>
      <Texto style={{ marginTop: 10 }}>
        Quantas você fez e quantas acertou. O tempo é opcional: dá para
        registrar só as questões, sem cronômetro nenhum.
      </Texto>

      <div className="mt-5 flex flex-col gap-4">
        <Field label="Matéria do cronograma">
          <SubjectPicker value={f.subjectId} onChange={(v) => set("subjectId", v)} />
        </Field>
        {!f.subjectId ? (
          <Field label="Ou um assunto fora do cronograma">
            <TextInput value={f.livre} placeholder="Ex.: simulado de Clínica"
              onChange={(e) => set("livre", e.target.value)} />
          </Field>
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Questões">
            <TextInput type="number" min="0" inputMode="numeric" value={f.q}
              onChange={(e) => set("q", e.target.value)} />
          </Field>
          <Field label="Acertos">
            <TextInput type="number" min="0" inputMode="numeric" value={f.c}
              onChange={(e) => set("c", e.target.value)} />
          </Field>
          <Field label="Minutos (opcional)">
            <TextInput type="number" min="0" inputMode="numeric" value={f.min}
              onChange={(e) => set("min", e.target.value)} />
          </Field>
          <Field label="Data">
            <TextInput type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
        </div>

        <Field label="Observação (opcional)">
          <TextInput value={f.notas} placeholder="Ex.: errei todas as de sódio"
            onChange={(e) => set("notas", e.target.value)} />
        </Field>

        <div className="flex items-center gap-3 flex-wrap">
          <Btn tone="primary" onClick={lancar}><Plus size={15} /> Lançar</Btn>
          {q > 0 ? (
            <Mini>
              {ok}/{q} ={" "}
              <span style={{ color: corDoAcerto(Math.round((ok / q) * 100)), fontWeight: 700 }}>
                {Math.round((ok / q) * 100)}%
              </span>
            </Mini>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function Desempenho({ data, today, addSession, delSession, notify }) {
  const ativo = useAtivo();
  const [area, setArea] = useState("todas");
  const [janela, setJanela] = useState(0);        // 0 = tudo, senão dias

  /* Só o que tem questão. Uma sessão de aula sem questão nenhuma não é
     desempenho ruim: é outra coisa, e entrar na conta puxaria tudo para
     baixo sem querer dizer nada. */
  const comQuestoes = useMemo(
    () => data.sessions.filter((s) => (s.questions || 0) > 0),
    [data.sessions],
  );

  const noPeriodo = useMemo(() => {
    if (!janela) return comQuestoes;
    const desde = addDays(today, -(janela - 1));
    return comQuestoes.filter((s) => s.date >= desde);
  }, [comQuestoes, janela, today]);

  const visiveis = useMemo(
    () => (area === "todas" ? noPeriodo : noPeriodo.filter((s) => s.area === area)),
    [noPeriodo, area],
  );

  const geral = useMemo(() => acertoDe(visiveis), [visiveis]);
  const semana = useMemo(
    () => acertoDe(comQuestoes.filter((s) => s.date >= weekStart(today) && s.date <= today)),
    [comQuestoes, today],
  );

  const porArea = useMemo(() => {
    const m = {};
    for (const s of noPeriodo) {
      const a = s.area || "livre";
      if (!m[a]) m[a] = [];
      m[a].push(s);
    }
    return [...AREA_IDS, "livre"]
      .filter((a) => m[a])
      .map((a) => ({ a, ...acertoDe(m[a]) }))
      .sort((x, y) => y.q - x.q);
  }, [noPeriodo]);

  const porMateria = useMemo(() => {
    const m = new Map();
    for (const s of visiveis) {
      const chave = s.subjectId || `livre:${s.topic}`;
      if (!m.has(chave)) {
        m.set(chave, {
          chave,
          titulo: (s.subjectId && ativo.byId[s.subjectId] ? ativo.byId[s.subjectId].title : s.topic),
          area: s.area,
          sessoes: [],
        });
      }
      m.get(chave).sessoes.push(s);
    }
    return [...m.values()]
      .map((x) => ({ ...x, ...acertoDe(x.sessoes) }))
      /* A mais fraca em primeiro: esta lista existe para achar onde
         estudar, não para comemorar o que já está bom. Com o mesmo
         acerto, ganha quem fez mais questões, que é o dado mais firme. */
      .sort((x, y) => (x.pct - y.pct) || (y.q - x.q));
  }, [visiveis, ativo]);

  const ultimas = useMemo(
    () => [...visiveis].sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : (b.createdAt || 0) - (a.createdAt || 0))).slice(0, 12),
    [visiveis],
  );

  const JANELAS = [[0, "tudo"], [7, "7 dias"], [30, "30 dias"], [90, "90 dias"]];

  return (
    <div className="flex flex-col gap-5">
      <LancarQuestoes today={today} addSession={addSession} notify={notify} />

      {comQuestoes.length === 0 ? (
        <Card className="px-6 py-7">
          <H size={18} color="var(--a-CI)" icon={<BarChart3 size={16} />}>Ainda sem questões</H>
          <Texto style={{ marginTop: 10 }}>
            Lance as primeiras aí em cima. A partir daí esta tela mostra o seu
            acerto por área e por matéria, com a mais fraca em primeiro.
          </Texto>
        </Card>
      ) : (
        <>
          <Card className="px-6 sm:px-8 py-7">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Label>Como você está indo</Label>
              <div className="flex rounded-full" style={{ background: T.card2, padding: 3, border: `1px solid ${T.line}` }}>
                {JANELAS.map(([d, lb]) => (
                  <button key={lb} type="button" onClick={() => setJanela(d)}
                    className="toque-larg rounded-full px-3.5 py-1.5"
                    style={{
                      background: janela === d ? soft("var(--a-CI)", 20) : "transparent",
                      border: "none", color: janela === d ? "var(--a-CI)" : T.dim,
                      fontSize: 13, fontWeight: janela === d ? 700 : 500, cursor: "pointer",
                    }}>{lb}</button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-7">
              <div>
                <Num size={34} color={corDoAcerto(geral.pct)}>{geral.pct === null ? "—" : `${geral.pct}%`}</Num>
                <Label style={{ marginTop: 9 }}>de acerto</Label>
              </div>
              <div><Num size={34}>{geral.q}</Num><Label style={{ marginTop: 9 }}>questões</Label></div>
              <div><Num size={34} color={T.ok}>{geral.ok}</Num><Label style={{ marginTop: 9 }}>acertos</Label></div>
              <div>
                <Num size={34} color={corDoAcerto(semana.pct)}>{semana.pct === null ? "—" : `${semana.pct}%`}</Num>
                <Label style={{ marginTop: 9 }}>nesta semana · {semana.q} questões</Label>
              </div>
            </div>
          </Card>

          <Card className="px-6 py-6">
            <H size={18} color="var(--a-GO)" icon={<Layers size={16} />}>Por área</H>
            <div className="mt-5 flex flex-col gap-4">
              {porArea.map((x) => (
                <div key={x.a}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span style={{ fontSize: 14.5, fontWeight: 600, color: x.a === "livre" ? T.dim : aColor(x.a) }}>
                      {x.a === "livre" ? "Fora do cronograma" : aLabel(x.a)}
                    </span>
                    <Mini>
                      <span style={{ color: corDoAcerto(x.pct), fontWeight: 700 }}>{x.pct}%</span>
                      {` · ${x.ok}/${x.q}`}
                    </Mini>
                  </div>
                  <div className="mt-2"><BarraAcerto pct={x.pct} cor={corDoAcerto(x.pct)} /></div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="px-6 py-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <H size={18} color="var(--a-CL)" icon={<Target size={16} />}>Por matéria</H>
              <div className="flex gap-1.5 flex-wrap">
                {[["todas", "Todas"], ...AREA_IDS.map((a) => [a, aLabel(a)])].map(([id, lb]) => (
                  <button key={id} type="button" onClick={() => setArea(id)}
                    className="toque-larg rounded-full px-3 py-1"
                    style={{
                      background: area === id ? T.card3 : "transparent",
                      border: `1px solid ${area === id ? "transparent" : T.line}`,
                      color: area === id ? (id === "todas" ? T.ink : aColor(id)) : T.dim,
                      fontSize: 12.5, fontWeight: area === id ? 700 : 500, cursor: "pointer",
                    }}>{lb}</button>
                ))}
              </div>
            </div>
            <Label style={{ marginTop: 6 }}>a mais fraca em primeiro</Label>

            {porMateria.length === 0 ? (
              <Mini style={{ marginTop: 16 }}>Nenhuma questão nesse recorte.</Mini>
            ) : (
              <div className="mt-5 flex flex-col gap-3">
                {porMateria.map((x) => (
                  <div key={x.chave} className="rounded-2xl px-4 py-3" style={{ background: T.card2 }}>
                    <div className="flex items-center gap-3">
                      <span style={{ width: 3, height: 26, borderRadius: 3, background: aColor(x.area), flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <div style={{ fontSize: 14.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {x.titulo}
                        </div>
                        <Mini style={{ marginTop: 1 }}>{x.ok}/{x.q} questões</Mini>
                      </div>
                      <Num size={16} weight={700} color={corDoAcerto(x.pct)}>{x.pct}%</Num>
                    </div>
                    <div className="mt-2.5"><BarraAcerto pct={x.pct} cor={corDoAcerto(x.pct)} altura={5} /></div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="px-6 py-6">
            <H size={18} color="var(--a-PR)" icon={<ListChecks size={16} />}>Últimos lançamentos</H>
            <div className="mt-5 flex flex-col gap-2">
              {ultimas.map((s) => (
                <SessionRow key={s.id} s={s} showDate onDel={() => delSession(s.id)} />
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ── configurações ───────────────────────────────────────────────────── */

/* O layout saiu do rodapé e veio para cá. No rodapé ele ficava longe de
   tudo que é ajuste, e quem procurava configuração não olhava lá embaixo. */
function EscolhaLayout({ data, setData }) {
  return (
    <Card className="px-6 py-6">
      <H size={18} color="var(--a-PE)" icon={<Smartphone size={16} />}>Formato da tela</H>
      <Texto style={{ marginTop: 10 }}>
        No automático o site se ajusta ao tamanho do aparelho. Em celular ele
        usa o layout estreito mesmo numa tela grande, que é útil para quem
        prefere a coluna única.
      </Texto>
      <div className="mt-5 flex items-center gap-2 rounded-full p-1" style={{ background: T.card2, border: `1px solid ${T.line}`, width: "fit-content" }}>
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
    </Card>
  );
}

function MetasDoEstudo({ data, setData }) {
  const metas = data.goals || DEFAULTS.goals;
  const mudar = (k, v) => setData((p) => ({
    ...p,
    goals: { ...(p.goals || DEFAULTS.goals), [k]: Math.max(0, Math.floor(Number(v) || 0)) },
  }));
  return (
    <Card className="px-6 py-6">
      <H size={18} color="var(--warn)" icon={<Target size={16} />}>Suas metas</H>
      <Texto style={{ marginTop: 10 }}>
        São as barras do painel de Hoje. Em minutos para o tempo, e em número
        de questões para a semana.
      </Texto>
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Minutos por dia">
          <TextInput type="number" min="0" inputMode="numeric" data-teste="meta-daily" value={metas.daily}
            onChange={(e) => mudar("daily", e.target.value)} />
        </Field>
        <Field label="Minutos por semana">
          <TextInput type="number" min="0" inputMode="numeric" data-teste="meta-weekly" value={metas.weekly}
            onChange={(e) => mudar("weekly", e.target.value)} />
        </Field>
        <Field label="Questões por semana">
          <TextInput type="number" min="0" inputMode="numeric" data-teste="meta-questions" value={metas.questions}
            onChange={(e) => mudar("questions", e.target.value)} />
        </Field>
      </div>
    </Card>
  );
}

/* Backup, restauração e o apagar tudo. Veio da aba Progresso: é ajuste da
   conta, não número de estudo. */
function SeusDados({ data, setData, today, notify }) {
  const [confirm, setConfirm] = useState(false);
  const arquivoRef = useRef(null);

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
    <Card className="px-6 py-6">
      <H size={18} color="var(--a-PR)" icon={<Download size={16} />}>Seus dados</H>
      <Label style={{ marginTop: 6, textTransform: "none", letterSpacing: 0, fontSize: 14, lineHeight: 1.6 }}>
        {data.sessions.length} sessõe{data.sessions.length === 1 ? "" : "s"} registradas
      </Label>
      <div className="mt-5 flex flex-wrap gap-2">
        <Btn onClick={exportar}><Download size={15} /> Baixar backup</Btn>
        <Btn onClick={() => arquivoRef.current && arquivoRef.current.click()}><Upload size={15} /> Restaurar backup</Btn>
        <input ref={arquivoRef} type="file" accept="application/json,.json" onChange={importar} style={{ display: "none" }} />
        {confirm ? (
          <>
            <Btn tone="danger" onClick={() => {
              setData({ ...DEFAULTS, theme: data.theme, layout: data.layout, tema: data.tema, revisao: data.revisao });
              setConfirm(false);
              notify("Tudo apagado.");
            }}>
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
  );
}

function Configuracoes({ data, setData, today, notify, nuvem, pro, aoLiberar, irPara }) {
  return (
    <div className="flex flex-col gap-5">
      <ContaNuvem nuvem={nuvem} notify={notify} />
      {nuvem.usuario && !pro ? <Cupom nuvem={nuvem} notify={notify} aoLiberar={aoLiberar} /> : null}
      {ehDono(nuvem.usuario) ? <PainelDono nuvem={nuvem} notify={notify} /> : null}

      <Aparencia data={data} setData={setData} />
      <EscolhaLayout data={data} setData={setData} />
      <MetasDoEstudo data={data} setData={setData} />

      {/* O esquema de revisão e as conexões têm tela própria, com o
          contexto que explica cada um. Repetir o controle aqui criaria
          dois lugares para mexer na mesma coisa; o que falta é só saber
          onde eles ficam. */}
      <Card className="px-6 py-6">
        <H size={18} color="var(--ok)" icon={<Settings2 size={16} />}>Ajustes que moram em outras abas</H>
        <div className="mt-5 flex flex-col gap-2">
          {[
            ["revisoes", "Esquema de revisão", "de quantos em quantos dias cada aula volta"],
            ["rotina", "Google Agenda", "puxar a rotina da sua agenda, e ligar a conta de vez"],
            ["cronograma", "Cronograma e Notion", "residência, ciclo clínico e a ligação com o Notion"],
          ].map(([id, titulo, sub]) => (
            <button key={id} type="button" onClick={() => irPara(id)}
              className="flex items-center gap-3 rounded-2xl px-4 py-3 w-full toque"
              style={{ background: T.card2, border: `1px solid ${T.line}`, cursor: "pointer", textAlign: "left" }}>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>{titulo}</div>
                <Mini style={{ marginTop: 2 }}>{sub}</Mini>
              </div>
              <ChevronRight size={15} style={{ color: T.ghost, flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </Card>

      <SeusDados data={data} setData={setData} today={today} notify={notify} />
    </div>
  );
}
