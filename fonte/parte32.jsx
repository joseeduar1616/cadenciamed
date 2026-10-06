/* ═══════════════════════════════════════════════════════════════════
   42 · O DIA E OS NÚMEROS DOS CARTÕES (ideias da Easy Medicina)

   PainelDoDia (no topo de Hoje): "Olá, Fulano. Pronto para estudar?",
   quanto da rotina de hoje já foi, e as atividades do dia numa lista
   com o que falta e o botão para ir fazer. Ao lado, o anel dos cartões
   revisados hoje, com o tempo e os segundos por cartão.

   PrevisaoCartoes e CalendarioConstancia (no painel de Cartões): quantos
   cartões vencem em cada um dos próximos 30 dias, e a constância dos
   últimos meses, um quadradinho por dia.
   ═══════════════════════════════════════════════════════════════════ */

const DIAS_SEMANA_LONGO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function fmtTempoCurto(seg) {
  const s = Math.max(0, Math.round(seg || 0));
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return m ? `${m} min ${s % 60} s` : `${s} s`;
}

/* As atividades do dia, cada uma com quanto já foi (0 a 1). Item que não
   se aplica (sem cartão nenhum, sem bloco na agenda) fica de fora, para não
   puxar a porcentagem para baixo à toa. */
function atividadesDoDia({ data, today, minToday, late, blocosHoje, cartoesHoje }) {
  const itens = [];
  const flash = data.flash || [];
  if (flash.length) {
    const feitosHoje = flash.filter((c) => c.ultima === today).length;
    const total = feitosHoje + cartoesHoje;
    itens.push({
      id: "cartoes", titulo: "Flashcards do dia", aba: "cartoes", acao: "Estudar",
      frac: total ? feitosHoje / total : 1,
      sub: total ? `${feitosHoje}/${total} cartões do dia revisados.${cartoesHoje ? "" : " Tudo em dia."}` : "Nenhum cartão vence hoje.",
    });
  }
  const vencidas = (late || []).reduce((t, r) => t + ((r.late && r.late.length) || 0), 0);
  itens.push({
    id: "revisoes", titulo: "Revisões das aulas", aba: "revisoes", acao: "Revisar",
    frac: vencidas ? 0 : 1,
    sub: vencidas ? `${vencidas} revis${vencidas === 1 ? "ão vencida" : "ões vencidas"} em ${late.length} aula${late.length === 1 ? "" : "s"}.` : "Todas as revisões em dia.",
  });
  const estudo = (blocosHoje || []).filter((b) => b && b.type !== "Descanso" && b.type !== "Pessoal");
  if (estudo.length) {
    const cumpridos = estudo.filter((b) => (data.blocos || {})[`${b.id}|${today}`]).length;
    itens.push({
      id: "agenda", titulo: "Blocos da agenda", aba: "rotina", acao: "Abrir",
      frac: cumpridos / estudo.length,
      sub: `${cumpridos}/${estudo.length} bloco${estudo.length === 1 ? "" : "s"} de hoje cumprido${cumpridos === 1 ? "" : "s"}.`,
    });
  }
  const meta = Math.max(1, Number((data.goals || {}).daily) || 120);
  itens.push({
    id: "horas", titulo: "Meta de estudo", aba: "foco", acao: "Focar",
    frac: Math.min(1, (minToday || 0) / meta),
    sub: `${fmtMin(minToday || 0)} de ${fmtMin(meta)} hoje.`,
  });
  return itens;
}

function PainelDoDia({ data, today, minToday, late, blocosHoje, cartoesHoje, go }) {
  const itens = atividadesDoDia({ data, today, minToday, late, blocosHoje, cartoesHoje });
  const pct = Math.round((itens.reduce((t, i) => t + i.frac, 0) / Math.max(1, itens.length)) * 100);
  const nome = String((data.profile && (data.profile.apelido || data.profile.name)) || "").trim().split(/\s+/)[0];
  const dia = fromISO(today);
  const quando = `${DIAS_SEMANA_LONGO[dia.getDay()]}, ${dia.getDate()} de ${MESES[dia.getMonth()]}`;
  const cd = (data.cartoesDia || {})[today] || { respostas: 0, acertos: 0, segundos: 0 };
  const porCartao = cd.respostas ? Math.round(cd.segundos / cd.respostas) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" data-teste="painel-do-dia">
      {/* A faixa roxa com a saudação e, dentro, o cartão branco das
          atividades: o "Olá, Gabriela. Pronto para revisar?" da Easy. */}
      <div className="lg:col-span-2 rounded-2xl" style={{ background: "var(--btn)", padding: "18px 16px 16px", boxShadow: "var(--sombra-card, none)" }}>
        <div style={{ color: "#FFFFFF", padding: "0 6px" }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>
            {nome ? `Olá, ${nome}. ` : "Olá. "}Pronto para estudar?
          </div>
          <div style={{ fontSize: 14, opacity: 0.9, marginTop: 3 }}>
            Você completou {pct}% da sua rotina de hoje.
          </div>
        </div>
        <div className="rounded-xl" style={{ background: T.card, marginTop: 14, padding: "16px 16px 6px" }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.12em", color: "var(--neon)", textTransform: "uppercase" }}>Hoje</div>
          <div className="flex items-baseline justify-between gap-3 flex-wrap" style={{ marginTop: 2 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>
              Atividades do dia <span style={{ fontWeight: 500, color: T.faint, fontSize: 14 }}>· {quando}</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{pct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: T.card3, marginTop: 8, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--neon)", borderRadius: 99, transition: "width .4s" }} />
          </div>
          <div className="flex flex-col" style={{ marginTop: 6 }}>
            {itens.map((it, i) => {
              const feito = it.frac >= 1;
              return (
                <div key={it.id} className="flex items-center gap-3" data-teste={`atividade-${it.id}`}
                  style={{ padding: "11px 0", borderTop: i ? `1px solid ${T.line}` : "none" }}>
                  <span className="flex items-center justify-center rounded-full" style={{
                    width: 24, height: 24, flexShrink: 0,
                    background: feito ? "var(--ok)" : "transparent",
                    border: feito ? "none" : `2px solid ${T.line2}`, color: "#FFFFFF",
                  }}>{feito ? <Check size={14} strokeWidth={3} /> : null}</span>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink }}>{it.titulo}</div>
                    <Mini style={{ marginTop: 1 }}>{it.sub}</Mini>
                  </div>
                  {feito ? (
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.faint }}>Concluída</span>
                  ) : (
                    <Btn size="sm" tone="primary" onClick={() => go(it.aba)}>{it.acao}</Btn>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* O anel dos cartões revisados hoje, com tempo e ritmo. */}
      <Card className="px-6 py-6">
        <div className="flex items-center gap-4" style={{ height: "100%" }}>
          <Medidor pct={Math.min(100, (cd.respostas / Math.max(1, cd.respostas + cartoesHoje)) * 100)} cor="var(--neon)" tamanho={96} largura={8}>
            <span style={{ fontSize: 24, fontWeight: 800, color: T.ink, lineHeight: 1 }}>{cd.respostas}</span>
            <span style={{ fontSize: 11.5, color: T.faint }}>cartões</span>
          </Medidor>
          <div className="min-w-0">
            <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>Cartões revisados hoje</div>
            <Mini style={{ marginTop: 4, lineHeight: 1.5 }}>
              {cd.respostas
                ? cd.acertos / cd.respostas >= 0.8 ? "Continue assim! Você está no caminho certo." : "Errar agora é o que faz lembrar na prova."
                : cartoesHoje ? `${cartoesHoje} esperando por você.` : "Nada vencendo hoje."}
            </Mini>
            {cd.respostas ? (
              <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 8, fontSize: 13, color: T.dim }}>
                <span className="inline-flex items-center gap-1"><Clock size={13} /> {fmtTempoCurto(cd.segundos)}</span>
                <span className="inline-flex items-center gap-1"><Zap size={13} /> {porCartao} s/cartão</span>
                <span>{Math.round((cd.acertos / cd.respostas) * 100)}% de acerto</span>
              </div>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ── previsão: quantos cartões vencem em cada um dos próximos dias ───────
   Uma série só, uma cor só (o acento), barras finas com a ponta
   arredondada saindo da base. Hoje inclui o que já está atrasado. */
function previsaoDeCartoes(flash, hoje, dias = 30) {
  const contas = Array.from({ length: dias }, () => 0);
  for (const c of flash || []) {
    const d = diffDays(hoje, c.prox || hoje);
    const i = d < 0 ? 0 : d;
    if (i < dias) contas[i] += 1;
  }
  return contas.map((n, i) => ({ dia: addDays(hoje, i), n }));
}

function PrevisaoCartoes({ flash, today }) {
  const serie = previsaoDeCartoes(flash, today, 30);
  const max = Math.max(1, ...serie.map((s) => s.n));
  const [sobre, setSobre] = useState(-1);
  const total7 = serie.slice(0, 7).reduce((t, s) => t + s.n, 0);
  const H_ = 120;
  return (
    <div data-teste="previsao-cartoes">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div style={{ fontSize: 15.5, fontWeight: 800, color: T.ink }}>Previsão</div>
        <Mini>{total7} {total7 === 1 ? "cartão" : "cartões"} nos próximos 7 dias</Mini>
      </div>
      <Mini style={{ marginTop: 2 }}>Quantos cartões vencem em cada dia (hoje inclui os atrasados).</Mini>
      <div style={{ position: "relative", marginTop: 14 }}>
        <div className="flex items-end" style={{ height: H_, gap: 2, borderBottom: `1px solid ${T.line2}` }}
          onPointerLeave={() => setSobre(-1)}>
          {serie.map((s, i) => (
            <div key={s.dia} onPointerEnter={() => setSobre(i)} onClick={() => setSobre(i)}
              style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", cursor: "default" }}
              aria-label={`${brDate(s.dia)}: ${s.n} cartões`}>
              <div style={{
                width: "100%", height: s.n ? Math.max(3, (s.n / max) * (H_ - 6)) : 0,
                background: "var(--neon)", opacity: sobre === -1 || sobre === i ? 1 : 0.45,
                borderRadius: "4px 4px 0 0", transition: "opacity .15s",
              }} />
            </div>
          ))}
        </div>
        {sobre >= 0 ? (
          <div style={{
            position: "absolute", top: -6, left: `${Math.min(80, Math.max(0, (sobre / 30) * 100 - 8))}%`,
            background: T.card, border: `1px solid ${T.line2}`, borderRadius: 8, padding: "5px 9px",
            fontSize: 12.5, color: T.ink, boxShadow: "var(--sombra-card, none)", pointerEvents: "none", whiteSpace: "nowrap",
          }}>
            <b>{serie[sobre].n}</b> {serie[sobre].n === 1 ? "cartão" : "cartões"} · {sobre === 0 ? "hoje" : brDate(serie[sobre].dia)}
          </div>
        ) : null}
        <div className="flex justify-between" style={{ marginTop: 6, fontSize: 11.5, color: T.faint }}>
          <span>hoje</span><span>+15 dias</span><span>+29 dias</span>
        </div>
      </div>
    </div>
  );
}

/* ── constância: um quadradinho por dia, das últimas 18 semanas ─────────
   Escala de uma cor só, do apagado ao cheio: cinco degraus da cor de
   acento misturada ao fundo. Conta o dia como estudado com cartão
   respondido ou sessão registrada. */
function CalendarioConstancia({ data, today }) {
  const semanas = 18;
  const porDia = {};
  for (const [d, v] of Object.entries(data.cartoesDia || {})) porDia[d] = (porDia[d] || 0) + (v.respostas || 0);
  const minutos = {};
  for (const s of data.sessions || []) minutos[s.date] = (minutos[s.date] || 0) + (s.minutes || 0);
  const nivel = (d) => {
    const r = porDia[d] || 0, m = minutos[d] || 0;
    const pontos = r + m / 3;   // 30 min de estudo pesa como 10 cartões
    return pontos <= 0 ? 0 : pontos < 10 ? 1 : pontos < 30 ? 2 : pontos < 70 ? 3 : 4;
  };
  const cor = ["var(--card3)", "color-mix(in srgb,var(--neon) 28%,var(--card2))", "color-mix(in srgb,var(--neon) 52%,var(--card2))", "color-mix(in srgb,var(--neon) 76%,var(--card2))", "var(--neon)"];
  const hojeD = fromISO(today);
  const fimSemana = addDays(today, 6 - ((hojeD.getDay() + 6) % 7));   // domingo desta semana
  const inicio = addDays(fimSemana, -(semanas * 7 - 1));
  const colunas = [];
  for (let w = 0; w < semanas; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) col.push(addDays(inicio, w * 7 + d));
    colunas.push(col);
  }
  const dias = colunas.flat().filter((d) => d <= today);
  const estudados = dias.filter((d) => nivel(d) > 0).length;
  const [sobre, setSobre] = useState("");
  return (
    <div data-teste="calendario-constancia">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div style={{ fontSize: 15.5, fontWeight: 800, color: T.ink }}>Constância</div>
        <Mini>{estudados} de {dias.length} dias com estudo</Mini>
      </div>
      <div className="flex gap-1 mt-3" style={{ overflowX: "auto", paddingBottom: 4 }} onPointerLeave={() => setSobre("")}>
        {colunas.map((col, w) => (
          <div key={w} className="flex flex-col gap-1">
            {col.map((d) => (
              <span key={d} onPointerEnter={() => setSobre(d)} onClick={() => setSobre(d)}
                aria-label={`${brDate(d)}: ${porDia[d] || 0} cartões, ${fmtMin(minutos[d] || 0)}`}
                style={{
                  width: 13, height: 13, borderRadius: 3, display: "block",
                  background: d > today ? "transparent" : cor[nivel(d)],
                  outline: d === today ? `1.5px solid ${T.ink}` : "none", outlineOffset: 1,
                }} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: 8 }}>
        <Mini style={{ minHeight: 18 }}>
          {sobre ? `${brDate(sobre)}: ${porDia[sobre] || 0} cartões · ${fmtMin(minutos[sobre] || 0)} de estudo` : "Passe o dedo num dia para ver."}
        </Mini>
        <span className="inline-flex items-center gap-1" style={{ fontSize: 11.5, color: T.faint }}>
          menos {cor.map((c, i) => <span key={i} style={{ width: 11, height: 11, borderRadius: 3, background: c, display: "inline-block" }} />)} mais
        </span>
      </div>
    </div>
  );
}
