/* ═══════════════════════════════════════════════════════════════════
   8 · ROTINA (calendário por datas)
   ═══════════════════════════════════════════════════════════════════ */

const H0 = 6, H1 = 24, PXH = 46;

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
  const [nb, setNb] = useState({ day: "0", label: "", type: BLOCK_IDS[0], start: "07:00", end: "12:00", repete: true });
  const [err, setErr] = useState("");

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(semana, i)), [semana]);
  const ehSemanaAtual = semana === weekStart(today);

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

  const add = () => {
    if (!nb.label.trim()) return setErr("Dê um nome ao bloco.");
    if (toMin(nb.end) <= toMin(nb.start)) return setErr("O fim precisa vir depois do início.");
    setErr("");
    const base = { id: uid(), label: nb.label.trim(), type: nb.type, start: nb.start, end: nb.end };
    setData((p) => (nb.repete
      ? { ...p, routine: [...p.routine, { ...base, day: Number(nb.day) }] }
      : { ...p, agenda: [...(p.agenda || []), { ...base, date: dias[Number(nb.day)] }] }));
    setNb((p) => ({ ...p, label: "" }));
  };

  const remover = (b) => setData((p) => (b.fixo
    ? { ...p, routine: p.routine.filter((x) => x.id !== b.id) }
    : { ...p, agenda: (p.agenda || []).filter((x) => x.id !== b.id) }));

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

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-5 sm:px-6 py-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Semana anterior" onClick={() => setSemana((s) => addDays(s, -7))}
              className="flex items-center justify-center rounded-full"
              style={{ width: 38, height: 38, background: T.card2, border: `1px solid ${T.line}`, color: T.ink, cursor: "pointer" }}>
              <ChevronLeft size={17} />
            </button>
            <button type="button" aria-label="Próxima semana" onClick={() => setSemana((s) => addDays(s, 7))}
              className="flex items-center justify-center rounded-full"
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
            {!ehSemanaAtual ? <Btn size="sm" onClick={() => setSemana(weekStart(today))}>Hoje</Btn> : null}
            {datados ? <Btn size="sm" tone="outline" onClick={limparSemana} title="Remove só os blocos desta data, mantendo os que se repetem">limpar a semana</Btn> : null}
            {gcal && gcal.disponivel ? (
              <Btn size="sm" disabled={!gcal.pronto || gcal.ocupado} onClick={() => gcal.importarRotina(semana)}>
                <CalendarDays size={14} />{gcal.ocupado ? "Lendo…" : "Puxar do Google"}
              </Btn>
            ) : null}
          </div>
        </div>
        {gcal && gcal.erro ? <Label style={{ marginTop: 12, color: T.bad }}>{gcal.erro}</Label> : null}
      </Card>

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
                    {porDia[di].map((b) => {
                      const top = Math.max(0, ((b.ini - H0 * 60) / 60) * PXH);
                      const hh = Math.max(26, ((b.fim - b.ini) / 60) * PXH - 2);
                      const col = BLOCKS[b.type] || T.faint;
                      const larg = 100 / b.colunas;
                      const curto = hh < 46;
                      return (
                        <div key={b.id} className="rounded-lg"
                          title={`${b.label} · ${b.start} às ${b.end}${b.fixo ? " · toda semana" : " · só nesta data"}`}
                          style={{
                            position: "absolute", top, height: hh,
                            left: `calc(${b.col * larg}% + 2px)`,
                            width: `calc(${larg}% - 4px)`,
                            background: soft(col, 18), borderLeft: `3px ${b.fixo ? "solid" : "dashed"} ${col}`,
                            overflow: "hidden", padding: curto ? "2px 4px" : "4px 5px",
                          }}>
                          <div className="flex items-start justify-between" style={{ gap: 2 }}>
                            <span style={{
                              fontSize: b.colunas > 1 ? 10.5 : 12, fontWeight: 600,
                              lineHeight: 1.2, color: T.ink, overflow: "hidden",
                              display: "-webkit-box", WebkitLineClamp: curto ? 1 : 3, WebkitBoxOrient: "vertical",
                            }}>{b.label}</span>
                            <button type="button" aria-label="Remover" onClick={() => remover(b)}
                              style={{ background: "none", border: "none", color: T.faint, cursor: "pointer", padding: 0, flexShrink: 0, lineHeight: 1 }}>
                              <X size={11} />
                            </button>
                          </div>
                          {!curto ? (
                            <div style={{ fontFamily: F_MONO, fontSize: 9.5, color: col, marginTop: 2 }}>{b.start}–{b.end}</div>
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
                <Mini>compromissos no mesmo horário dividem a coluna</Mini>
              </div>
            </div>
          </div>
        )}
      </Card>

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
              className="rounded-full px-4 py-2"
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
          <button key={id} type="button" onClick={() => setOrdem(id)} className="rounded-full px-4 py-2"
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
