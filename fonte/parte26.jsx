/* ═══════════════════════════════════════════════════════════════════
   36 · MENTORIA DE ESTUDO

   Um modo do Assistente. A IA entrevista a pessoa sobre o jeito dela de
   estudar, e monta um plano: a semana, como estudar cada coisa, o
   checklist do dia. O conhecimento vem do material "Estratégias de
   Estudo para Residência Médica" — os seis métodos com evidência, as oito
   estratégias dos aprovados e o fluxo de sete etapas por tema — e mora no
   servidor (worker/api/_metodos.js), junto das instruções de como
   conduzir a entrevista.

   Três decisões que moldam esta tela.

   1. A entrevista NÃO depende da conversa. A rota só enxerga as últimas
      catorze mensagens, e uma entrevista com plano e ajustes passa disso;
      as primeiras respostas sumiriam e a mentoria perguntaria tudo de
      novo. Então cada coisa que a pessoa conta vira um campo do PERFIL,
      guardado na conta, e o perfil vai inteiro em toda chamada. A conversa
      é só o caminho; o que fica é o perfil e o plano.

   2. Ela não pergunta o que o painel já sabe. Data da prova, revisões
      atrasadas, progresso por especialidade, rotina fixa e o cronograma do
      curso vão junto, e a primeira mensagem dela já diz o que viu.

   3. Pôr o plano na Agenda é uma decisão da pessoa, com confirmação. Os
      blocos vão para a rotina e, se o Google Agenda estiver ligado, viram
      eventos que se repetem toda semana na agenda dela. Os blocos que ela
      mesma criou nunca são mexidos: os da mentoria levam uma marca de
      origem, e reaplicar um plano novo troca só esses.
   ═══════════════════════════════════════════════════════════════════ */

/* O que a entrevista quer saber, com o nome que aparece na tela. As
   chaves são as mesmas do servidor (DIMENSOES, em _metodos.js), e o
   testar-mentoria.mjs confere que as duas listas batem. */
const DIMENSOES_MENTORIA = [
  ["horarios", "Horários livres"],
  ["alerta", "Horário de pico"],
  ["fase", "Fase"],
  ["jeitoAtual", "Jeito de estudar"],
  ["questoes", "Questões"],
  ["flashcards", "Flashcards"],
  ["cadernoErros", "Caderno de erros"],
  ["simulados", "Simulados"],
  ["saude", "Sono e descanso"],
  ["instituicoes", "Provas-alvo"],
  ["dificuldades", "O que trava"],
];

const DIAS_MENTORIA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

/* ── a conversa da entrevista, só neste aparelho ──────────────────────── */
const CHAVE_CONVERSA_MENTORIA = "cadencia:v3:mentoria-conversa";
const MAX_MSGS_MENTORIA = 40;

function lerConversaMentoria() {
  try {
    const v = JSON.parse(window.localStorage.getItem(CHAVE_CONVERSA_MENTORIA) || "[]");
    return Array.isArray(v)
      ? v.filter((m) => m && typeof m.texto === "string").slice(-MAX_MSGS_MENTORIA)
      : [];
  } catch (e) { return []; }
}
function guardarConversaMentoria(msgs) {
  try {
    window.localStorage.setItem(CHAVE_CONVERSA_MENTORIA,
      JSON.stringify(msgs.slice(-MAX_MSGS_MENTORIA).map((m) => ({ ...m, texto: m.texto.slice(0, 6000) }))));
  } catch (e) { /* sem espaço no aparelho: a conversa só não fica guardada */ }
}

const minutosDe = (h) => {
  const m = /^(\d{2}):(\d{2})$/.exec(String(h || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/* Segunda é 0, como na Agenda; o getDay do JavaScript começa no domingo. */
const diaDaSemana = (iso) => (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;

/* ── pôr o plano na Agenda ────────────────────────────────────────────
 *
 * Calculado ANTES de gravar, e não dentro do setData: a tela de
 * confirmação precisa mostrar o número exato do que vai acontecer — e é
 * melhor a pessoa ler "3 blocos ficaram de fora porque batem com o seu
 * plantão" antes de confirmar do que descobrir depois.
 */
function blocosParaAgenda(plano, routine) {
  const minhas = (routine || []).filter((b) => b && b.origem !== "mentoria");
  const novos = [];
  const colidiram = [];
  for (const d of (plano && plano.semana) || []) {
    for (const b of d.blocos || []) {
      const ini = minutosDe(b.inicio);
      const fim = minutosDe(b.fim);
      if (ini === null || fim === null || fim <= ini) continue;
      /* Um bloco da mentoria por cima de um bloco que a pessoa criou — um
         plantão, uma aula — fica de fora. A mentoria recebe a rotina e é
         instruída a desviar dela, mas quem garante é esta conta. */
      const bate = minhas.find((x) => Number(x.day) === d.dia
        && minutosDe(x.start) !== null && minutosDe(x.start) < fim && minutosDe(x.end) > ini);
      if (bate) { colidiram.push(`${DIAS_MENTORIA[d.dia]} ${b.inicio} (bate com "${bate.label}")`); continue; }
      novos.push({
        id: uid(), day: d.dia, label: b.titulo, type: b.tipo, start: b.inicio, end: b.fim,
        origem: "mentoria",
      });
    }
  }
  const diasDeEstudo = ((plano && plano.semana) || [])
    .filter((d) => (d.blocos || []).some((b) => b.tipo !== "Descanso" && b.tipo !== "Pessoal")).length;
  return { minhas, novos, colidiram, diasDeEstudo };
}

/* ── o cartão do plano ──────────────────────────────────────────────── */

function PlanoDaMentoria({ data, setData, today, notify, ocupado, perguntar }) {
  const m = data.mentoria || {};
  const plano = m.plano;
  const [confirmando, setConfirmando] = useState(false);
  const [ajustarMeta, setAjustarMeta] = useState(true);
  const [abertoComo, setAbertoComo] = useState(-1);
  if (!plano) return null;

  const hoje = diaDaSemana(today);
  const deHoje = (plano.semana[hoje] && plano.semana[hoje].blocos) || [];
  const feitos = (m.feitos && m.feitos[today]) || [];
  const daMentoriaNaAgenda = (data.routine || []).filter((b) => b && b.origem === "mentoria").length;
  const previa = blocosParaAgenda(plano, data.routine);
  const metaSemanal = plano.metas.questoesDia * Math.max(1, previa.diasDeEstudo);

  const marcar = (i) => setData((p) => {
    const mm = p.mentoria || {};
    const ja = (mm.feitos && mm.feitos[today]) || [];
    const novo = ja.indexOf(i) >= 0 ? ja.filter((x) => x !== i) : [...ja, i];
    return { ...p, mentoria: { ...mm, feitos: { ...(mm.feitos || {}), [today]: novo } } };
  });

  const aplicar = () => {
    const { minhas, novos, colidiram } = blocosParaAgenda(plano, data.routine);
    setData((p) => ({
      ...p,
      routine: [...minhas, ...novos],
      goals: ajustarMeta && plano.metas.questoesDia
        ? { ...p.goals, questions: metaSemanal }
        : p.goals,
      mentoria: { ...(p.mentoria || {}), aplicadoEm: Date.now() },
    }));
    setConfirmando(false);
    notify(colidiram.length
      ? `${novos.length} blocos foram para a Agenda. ${colidiram.length} ficaram de fora porque batiam com blocos seus.`
      : `${novos.length} blocos foram para a Agenda.`);
  };

  const tirar = () => {
    setData((p) => ({
      ...p,
      routine: (p.routine || []).filter((b) => !b || b.origem !== "mentoria"),
      mentoria: { ...(p.mentoria || {}), aplicadoEm: 0 },
    }));
    notify("Os blocos da mentoria saíram da Agenda. Os seus continuam lá.");
  };

  const Bloco = ({ b, destaque }) => (
    <div className="flex items-start gap-3 rounded-xl px-3.5 py-2.5"
      style={{ background: destaque ? soft(BLOCKS[b.tipo] || "var(--warn)", 12) : T.card2 }}>
      <span style={{
        width: 8, height: 8, borderRadius: 99, marginTop: 7, flexShrink: 0,
        background: BLOCKS[b.tipo] || "var(--warn)",
      }} />
      <span className="flex-1 min-w-0">
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: T.ink }}>
          <span style={{ fontFamily: F_MONO, fontSize: 13, color: T.dim, marginRight: 8 }}>
            {b.inicio}–{b.fim}
          </span>
          {b.titulo}
        </span>
        {b.como ? <Mini style={{ marginTop: 3, lineHeight: 1.55 }}>{b.como}</Mini> : null}
      </span>
    </div>
  );

  return (
    <Card className="px-6 py-6" brilho="var(--ok)">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <H color="var(--ok)" icon={<ListChecks size={16} />}>Seu plano</H>
        {m.planoEm ? <Mini>montado em {brDate(new Date(m.planoEm).toISOString().slice(0, 10))}</Mini> : null}
      </div>
      {plano.resumo ? <Texto style={{ marginTop: 10 }}>{plano.resumo}</Texto> : null}

      {/* ── hoje, primeiro: é a pergunta de todo dia ─────────────────── */}
      <div className="mt-5">
        <Label style={{ color: T.ok }}>Hoje, {DIAS_MENTORIA[hoje].toLowerCase()}</Label>
        <div className="mt-2 flex flex-col gap-2">
          {deHoje.length
            ? deHoje.map((b, i) => <Bloco key={i} b={b} destaque />)
            : <Mini>Nada no plano para hoje. Se for o dia de descanso, aproveite: ele faz parte do método.</Mini>}
        </div>
        <div className="mt-3">
          <Btn size="sm" disabled={ocupado} onClick={() => perguntar("O que eu faço hoje? Diga os temas concretos e como estudar cada um.")}>
            O que eu faço hoje, em detalhe?
          </Btn>
        </div>
      </div>

      {/* ── checklist do dia, do material ───────────────────────────── */}
      {plano.checklist.length ? (
        <div className="mt-6">
          <Label>Checklist de hoje</Label>
          <div className="mt-2 flex flex-col gap-1.5">
            {plano.checklist.map((c, i) => {
              const on = feitos.indexOf(i) >= 0;
              return (
                <label key={i} className="flex items-start gap-3 rounded-xl px-3.5 py-2.5 toque-larg"
                  style={{ background: T.card2, cursor: "pointer" }}>
                  <input type="checkbox" checked={on} onChange={() => marcar(i)} style={{ marginTop: 3, flexShrink: 0 }} />
                  <span style={{ fontSize: 14.5, color: on ? T.faint : T.ink, textDecoration: on ? "line-through" : "none" }}>{c}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── a semana inteira ─────────────────────────────────────────── */}
      <div className="mt-6">
        <Label>A semana</Label>
        <div className="mt-2 flex flex-col gap-3">
          {plano.semana.map((d) => (
            <div key={d.dia}>
              <Mini style={{ fontWeight: 700, color: d.dia === hoje ? T.ok : T.dim, marginBottom: 6 }}>
                {DIAS_MENTORIA[d.dia]}{d.dia === hoje ? " · hoje" : ""}
              </Mini>
              <div className="flex flex-col gap-1.5">
                {d.blocos.length
                  ? d.blocos.map((b, i) => <Bloco key={i} b={b} />)
                  : <Mini style={{ paddingLeft: 4 }}>livre</Mini>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── como estudar cada coisa ──────────────────────────────────── */}
      {plano.comoEstudar.length ? (
        <div className="mt-6">
          <Label>Como estudar cada coisa</Label>
          <div className="mt-2 flex flex-col gap-2">
            {plano.comoEstudar.map((c, i) => (
              <div key={i} className="rounded-xl" style={{ background: T.card2 }}>
                <button type="button" onClick={() => setAbertoComo(abertoComo === i ? -1 : i)}
                  className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left"
                  aria-expanded={abertoComo === i}
                  style={{ background: "none", border: "none", cursor: "pointer", color: T.ink, fontFamily: F_UI }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600 }}>{c.situacao}</span>
                  <ChevronDown size={16} style={{
                    color: T.ghost, flexShrink: 0,
                    transform: abertoComo === i ? "rotate(180deg)" : "none", transition: "transform .2s",
                  }} />
                </button>
                {abertoComo === i ? (
                  <ol style={{ margin: 0, padding: "0 16px 14px 34px", color: T.dim, fontSize: 14, lineHeight: 1.65 }}>
                    {c.passos.map((p, j) => <li key={j} style={{ marginTop: j ? 4 : 0 }}>{p}</li>)}
                  </ol>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {plano.metas.questoesDia || plano.metas.simuladosPorMes ? (
        <div className="mt-6 flex gap-6 flex-wrap">
          {plano.metas.questoesDia ? (
            <div><Num size={22} weight={700} color="var(--a-CI)">{plano.metas.questoesDia}</Num><Mini style={{ marginTop: 3 }}>questões por dia</Mini></div>
          ) : null}
          {plano.metas.simuladosPorMes ? (
            <div><Num size={22} weight={700} color="var(--a-CI)">{plano.metas.simuladosPorMes}</Num><Mini style={{ marginTop: 3 }}>simulado{plano.metas.simuladosPorMes === 1 ? "" : "s"} por mês</Mini></div>
          ) : null}
        </div>
      ) : null}

      {/* ── pôr na Agenda, com confirmação ───────────────────────────── */}
      <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
        {!confirmando ? (
          <div className="flex gap-2 flex-wrap items-center">
            <Btn size="sm" tone="primary" onClick={() => setConfirmando(true)} disabled={ocupado}>
              <CalendarDays size={14} /> {daMentoriaNaAgenda ? "Atualizar na Agenda" : "Pôr na minha Agenda"}
            </Btn>
            <Btn size="sm" disabled={ocupado}
              onClick={() => perguntar("Refaça o meu plano com base no que você já sabe de mim.")}>
              Refazer o plano
            </Btn>
            {daMentoriaNaAgenda ? (
              <Btn size="sm" tone="outline" onClick={tirar}>tirar da Agenda</Btn>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl px-4 py-4" style={{ background: soft("var(--neon)", 10), border: `1px solid ${soft("var(--neon)", 30)}` }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>
              {previa.novos.length} bloco{previa.novos.length === 1 ? "" : "s"} vão para a sua Agenda, repetindo toda semana.
            </div>
            <Mini style={{ marginTop: 8, lineHeight: 1.65 }}>
              Os blocos que você mesmo criou não são mexidos.
              {daMentoriaNaAgenda ? ` Os ${daMentoriaNaAgenda} blocos que a mentoria tinha posto antes são trocados por estes.` : ""}
              {" "}Se o Google Agenda estiver ligado, eles aparecem lá também.
            </Mini>
            {previa.colidiram.length ? (
              <Mini style={{ marginTop: 8, lineHeight: 1.65, color: T.warn }}>
                Ficam de fora {previa.colidiram.length}, porque batem com blocos seus: {previa.colidiram.join("; ")}.
              </Mini>
            ) : null}
            {plano.metas.questoesDia ? (
              <label className="mt-3 flex items-start gap-3" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={ajustarMeta} onChange={(e) => setAjustarMeta(e.target.checked)}
                  style={{ marginTop: 3, flexShrink: 0 }} />
                <Mini style={{ lineHeight: 1.6, color: T.ink }}>
                  Também ajustar a meta de questões da semana para {metaSemanal}
                  {" "}({plano.metas.questoesDia} por dia em {Math.max(1, previa.diasDeEstudo)} dias de estudo)
                </Mini>
              </label>
            ) : null}
            <div className="mt-4 flex gap-2 flex-wrap">
              <Btn size="sm" tone="primary" onClick={aplicar} disabled={!previa.novos.length}>Confirmar</Btn>
              <Btn size="sm" tone="outline" onClick={() => setConfirmando(false)}>cancelar</Btn>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ── a mentoria ─────────────────────────────────────────────────────── */

function Mentoria({ data, setData, subjects, ladder, today, totals, minWeek, qWeek, notify, nuvem }) {
  const ativo = useAtivo();
  const [msgs, setMsgs] = useState(lerConversaMentoria);
  const [opcoes, setOpcoes] = useState([]);
  const [txt, setTxt] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const caixa = useRef(null);
  const m = data.mentoria || {};
  const perfil = m.perfil || {};
  const sabidas = DIMENSOES_MENTORIA.filter(([k]) => perfil[k]).length;

  useEffect(() => { guardarConversaMentoria(msgs); }, [msgs]);

  /* Mesma regra da conversa comum: rola a caixa, não a página, e só se a
     pessoa já estava no fim — quem subiu para reler fica onde está. */
  useEffect(() => {
    const c = caixa.current;
    if (!c) return;
    if (c.scrollHeight - c.scrollTop - c.clientHeight > 160) return;
    c.scrollTop = c.scrollHeight;
  }, [msgs, ocupado]);

  const perguntar = useCallback(async (pergunta) => {
    const p = String(pergunta || "").trim();
    if (!p || ocupado) return;
    setErro(""); setTxt(""); setOpcoes([]);
    const ateAqui = [...msgs, { papel: "user", texto: p }];
    setMsgs(ateAqui);
    setOcupado(true);
    try {
      let token = "";
      try {
        if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
          token = await nuvem.sdk.auth.currentUser.getIdToken();
        }
      } catch (e) { /* segue: o servidor recusa sem token */ }
      const { dados: j, erro: falha } = await chamarApi(ROTA_IA, {
        token,
        modo: "mentoria",
        contexto: resumoParaIA({ subjects, ladder, data, today, totals, minWeek, qWeek, totalBonus: ativo.totalBonus }),
        perfil: m.perfil || {},
        plano: m.plano || null,
        mensagens: ateAqui.slice(-14).map((x) => ({
          role: x.papel === "user" ? "user" : "assistant", content: x.texto,
        })),
      }, "A mentoria");
      if (falha) { setErro(falha); return; }
      if (!j || typeof j.texto !== "string") { setErro("A mentoria não respondeu. Tente de novo em instantes."); return; }

      const resposta = { papel: "claude", texto: j.texto || "Anotei.", cortado: !!j.cortado };
      setMsgs([...ateAqui, resposta]);
      setOpcoes(Array.isArray(j.opcoes) ? j.opcoes : []);

      const novoPerfil = j.perfil && typeof j.perfil === "object" ? j.perfil : {};
      if (Object.keys(novoPerfil).length || j.plano) {
        setData((pp) => {
          const mm = pp.mentoria || {};
          return {
            ...pp,
            mentoria: {
              ...mm,
              perfil: { ...(mm.perfil || {}), ...novoPerfil },
              ...(j.plano ? { plano: j.plano, planoEm: Date.now() } : {}),
            },
          };
        });
      }
      if (j.plano) notify("Plano montado. Ele está no cartão Seu plano, logo abaixo.");
    } catch (e) {
      setErro("Não consegui falar com a mentoria. Verifique a conexão.");
    } finally { setOcupado(false); }
  }, [msgs, ocupado, nuvem, subjects, ladder, data, today, totals, minWeek, qWeek, ativo.totalBonus, m.perfil, m.plano, setData, notify]);

  /* Recomeçar apaga o que a mentoria sabe e o plano, mas NÃO tira nada
     da Agenda: isso é decisão separada, no botão do plano. */
  const recomecar = () => {
    setMsgs([]); setOpcoes([]); setErro("");
    setData((pp) => ({ ...pp, mentoria: { ...(pp.mentoria || {}), perfil: {}, plano: null, planoEm: 0, feitos: {} } }));
  };

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-6" brilho="var(--neon2)">
        <H color="var(--neon2)" icon={<Compass size={16} />}>Mentoria de estudo</H>
        <Texto style={{ marginTop: 10 }}>
          Ela faz perguntas sobre o seu jeito de estudar e monta o seu plano: o que fazer em
          cada dia e como estudar cada coisa. Segue os métodos com mais evidência para prova
          de residência, como prática de recuperação, repetição espaçada, intercalação e
          caderno de erros. Ela já enxerga a sua prova, o que está atrasado e a sua rotina,
          então não pergunta o que o painel já sabe.
        </Texto>

        {/* O que a entrevista já descobriu: mostra o andamento e deixa a
            pessoa ver, com as palavras dela, o que a mentoria guardou. */}
        <div className="mt-5">
          <Label>O que ela já sabe de você · {sabidas} de {DIMENSOES_MENTORIA.length}</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DIMENSOES_MENTORIA.map(([k, rotulo]) => (
              <span key={k} title={perfil[k] || "ainda não sabe"}
                style={{
                  fontSize: 12.5, fontWeight: 600, borderRadius: 99, padding: "4px 10px",
                  background: perfil[k] ? soft("var(--ok)", 16) : T.card2,
                  color: perfil[k] ? T.ok : T.faint,
                  border: `1px solid ${perfil[k] ? soft("var(--ok)", 35) : T.line}`,
                }}>
                {perfil[k] ? "✓ " : ""}{rotulo}
              </span>
            ))}
          </div>
        </div>
      </Card>

      <PlanoDaMentoria data={data} setData={setData} today={today} notify={notify}
        ocupado={ocupado} perguntar={perguntar} />

      <Card className="flex flex-col" style={{ minHeight: 380 }}>
        <div className="px-5 sm:px-6 pt-4 pb-3 flex items-center justify-between gap-2 flex-wrap"
          style={{ borderBottom: `1px solid ${T.line}` }}>
          <Mini>{msgs.length ? "a entrevista fica guardada neste aparelho" : "a entrevista leva uns cinco minutos"}</Mini>
          {msgs.length || sabidas || m.plano ? (
            <Btn size="sm" tone="outline" onClick={recomecar} disabled={ocupado}>recomeçar do zero</Btn>
          ) : null}
        </div>

        <div ref={caixa} className="flex-1 px-5 sm:px-6 py-5 flex flex-col gap-4"
          style={{ maxHeight: 520, overflowY: "auto", overscrollBehavior: "contain" }}>
          {msgs.length === 0 ? (
            <div className="flex flex-col items-center text-center py-8 px-4">
              <div style={{ color: "var(--neon2)", opacity: 0.7 }}><Compass size={26} /></div>
              <div className="mt-4" style={{ fontFamily: F_SERIF, fontSize: 19, color: T.dim }}>
                {sabidas || m.plano ? "Continuar de onde parou" : "Vamos montar o seu plano"}
              </div>
              <div className="mt-1.5" style={{ fontSize: 14, color: T.faint, maxWidth: 360, lineHeight: 1.55 }}>
                Uma pergunta por vez. Dá para responder tocando nas opções ou escrevendo do seu jeito.
              </div>
              <div className="mt-6">
                <Btn tone="primary" disabled={ocupado}
                  onClick={() => perguntar(sabidas || m.plano
                    ? "Vamos continuar a mentoria de onde paramos."
                    : "Quero começar a mentoria.")}>
                  {sabidas || m.plano ? "Continuar a mentoria" : "Começar a mentoria"}
                </Btn>
              </div>
            </div>
          ) : msgs.map((x, i) => (
            <div key={i} className="flex" style={{ justifyContent: x.papel === "user" ? "flex-end" : "flex-start" }}>
              <div className="rounded-2xl px-4 py-3" style={{
                maxWidth: "86%",
                background: x.papel === "user" ? soft("var(--neon2)", 20) : T.card2,
                border: `1px solid ${x.papel === "user" ? "transparent" : T.line}`,
                fontSize: 14.5, lineHeight: 1.65, color: T.ink,
                whiteSpace: x.papel === "user" ? "pre-wrap" : "normal",
              }}>
                {x.papel === "user" ? x.texto : <Markdown texto={x.texto} />}
                {x.cortado ? (
                  <Mini style={{ marginTop: 10, color: T.warn, display: "block" }}>
                    A resposta bateu no limite e parou aqui. Peça para ela continuar.
                  </Mini>
                ) : null}
              </div>
            </div>
          ))}
          {ocupado ? <Mini style={{ paddingLeft: 4 }}>pensando…</Mini> : null}
        </div>

        {/* Opções de toque: no celular, responder tocando é o que faz a
            entrevista durar cinco minutos em vez de quinze. */}
        {opcoes.length && !ocupado ? (
          <div className="px-5 sm:px-6 pb-3 flex flex-wrap gap-2">
            {opcoes.map((o) => (
              <button key={o} type="button" onClick={() => perguntar(o)}
                className="rounded-full px-4 py-2 toque-larg"
                style={{
                  background: soft("var(--neon2)", 14), border: `1px solid ${soft("var(--neon2)", 35)}`,
                  color: T.ink, fontSize: 14, cursor: "pointer", fontFamily: F_UI,
                }}>{o}</button>
            ))}
          </div>
        ) : null}

        {erro ? <Label style={{ margin: "0 24px 12px", color: T.bad, textTransform: "none", letterSpacing: 0 }}>{erro}</Label> : null}

        <div className="px-5 sm:px-6 pb-5 pt-1 flex gap-2 items-end">
          <Area value={txt} placeholder={msgs.length ? "Responda do seu jeito" : "Ou escreva para começar"}
            style={{ minHeight: 48, flex: 1 }}
            onChange={(e) => setTxt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); perguntar(txt); } }} />
          <Btn tone="primary" disabled={ocupado || !txt.trim()} onClick={() => perguntar(txt)} title="Enviar">
            <Send size={15} />
          </Btn>
        </div>
      </Card>
    </div>
  );
}
