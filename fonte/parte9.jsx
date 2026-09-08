/* ═══════════════════════════════════════════════════════════════════
   19 · ASSISTENTE
   Conversa com o Claude através de uma função no servidor do Netlify.
   A chave da API fica lá, como variável de ambiente, e nunca chega ao
   navegador. Se a função não existir, a aba explica isso em vez de falhar
   silenciosamente.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_IA = "/.netlify/functions/assistente";

/* Resumo do estado do estudo, enviado junto com a pergunta para o modelo
   ter contexto real em vez de responder no vácuo. */
function resumoParaIA({ subjects, ladder, data, today, totals, minWeek, qWeek }) {
  const porEsp = new Map();
  for (const s of subjects) {
    const k = `${aLabel(s.area)} · ${s.esp}`;
    if (!porEsp.has(k)) porEsp.set(k, { total: 0, feitas: 0, fracas: 0 });
    const g = porEsp.get(k);
    g.total += 1;
    if (s.aula) g.feitas += 1;
    if (s.perf === 3) g.fracas += 1;
  }
  const especialidades = [...porEsp.entries()]
    .map(([k, v]) => `${k}: ${v.feitas}/${v.total}${v.fracas ? `, ${v.fracas} com desempenho baixo` : ""}`)
    .join("\n");

  const atrasadas = ladder.filter((r) => r.late.length)
    .slice(0, 15)
    .map((r) => `${r.title} (${r.late.map((x) => x.label).join(", ")}${r.overdueBy > 0 ? `, ${r.overdueBy} dias de atraso` : ""})`)
    .join("\n") || "nenhuma";

  const diaSem = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  const rotina = (data.routine || [])
    .map((b) => `${diaSem[Number(b.day) || 0]} ${b.start}–${b.end}: ${b.label} (${b.type})`)
    .join("\n") || "nada fixo cadastrado";

  const daFrente = (data.agenda || [])
    .filter((b) => b.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 20)
    .map((b) => `${brDate(b.date)} ${b.start}–${b.end}: ${b.label}`)
    .join("\n") || "nada marcado";

  const prova = data.profile.examDate
    ? `${brDate(data.profile.examDate)}, faltam ${diffDays(today, data.profile.examDate)} dias`
    : "sem data definida";

  const pendencias = (data.tasks || []).filter((t) => !t.done).map((t) => t.text).join("; ") || "nenhuma";
  const rever = (data.rever || []).filter((t) => !t.done).map((t) => t.text).join("; ") || "nenhum";

  return `DATA DE HOJE: ${brDate(today)}
ESTUDANTE: ${data.profile.name || "não informado"}
PROVA: ${prova}

PROGRESSO GERAL
Aulas principais: ${subjects.filter((s) => s.aula).length} de ${subjects.length}
Aulas tópicos: ${subjects.reduce((a, s) => a + s.bonusCount, 0)} de ${TOTAL_BONUS}
Tempo total registrado: ${fmtMin(totals.min)} em ${data.sessions.length} sessões
Nesta semana: ${fmtMin(minWeek)} e ${qWeek} questões (metas: ${fmtMin(data.goals.weekly)} e ${data.goals.questions} questões)
Acerto geral: ${totals.pct === null ? "sem questões lançadas" : totals.pct + "%"}

POR ESPECIALIDADE (feitas/total)
${especialidades}

REVISÕES ATRASADAS OU PARA HOJE
${atrasadas}

ROTINA FIXA DA SEMANA
${rotina}

COMPROMISSOS COM DATA
${daFrente}

PENDÊNCIAS ABERTAS: ${pendencias}
LISTA "PRECISO REVER": ${rever}`;
}

const INSTRUCOES_IA = `Você é o assistente do Cadência Med, um painel de estudos de um estudante brasileiro que se prepara para a prova de residência médica.

Responda sempre em português do Brasil, de forma direta e concreta. Use os dados reais fornecidos: cite números, nomes de aulas e datas em vez de dar conselhos genéricos. Se a pessoa perguntar o que estudar, olhe as revisões atrasadas, as especialidades mais fracas e o tempo livre na rotina antes de responder.

Você não é médico e não dá conduta clínica para pacientes reais. Se perguntarem conteúdo médico para fins de estudo, pode explicar normalmente, como material de revisão.

Quando a pessoa pedir para você REGISTRAR algo no painel, além de responder em texto, inclua no fim da mensagem um bloco de ações neste formato exato:

<acoes>
[{"tipo":"tarefa","texto":"..."}]
</acoes>

Tipos aceitos:
- {"tipo":"tarefa","texto":"..."} adiciona uma pendência
- {"tipo":"rever","texto":"..."} adiciona um item na lista "preciso rever"
- {"tipo":"bloco","dia":0,"inicio":"14:00","fim":"16:00","titulo":"...","categoria":"Estudo"} adiciona um bloco fixo na rotina, com dia de 0 (segunda) a 6 (domingo) e categoria entre Plantão, Enfermaria, Aula, Estudo, Questões, Descanso ou Pessoal

Só inclua o bloco de ações quando a pessoa pedir para registrar, agendar ou anotar. Nunca invente ações que não foram pedidas. O texto da resposta deve fazer sentido sozinho, sem o bloco.`;

function Assistente({ data, setData, subjects, ladder, today, totals, minWeek, qWeek, notify, nuvem }) {
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const fim = useRef(null);

  useEffect(() => {
    if (fim.current && fim.current.scrollIntoView) {
      try { fim.current.scrollIntoView({ behavior: "smooth", block: "end" }); } catch (e) { /* noop */ }
    }
  }, [msgs, ocupado]);

  const aplicarAcoes = useCallback((texto) => {
    const m = texto.match(/<acoes>([\s\S]*?)<\/acoes>/i);
    if (!m) return { limpo: texto, feitas: 0 };
    let lista = [];
    try { lista = JSON.parse(m[1].trim()); } catch (e) { return { limpo: texto.replace(m[0], "").trim(), feitas: 0 }; }
    if (!Array.isArray(lista)) lista = [lista];

    let feitas = 0;
    setData((p) => {
      const novo = { ...p };
      for (const a of lista) {
        if (!a || typeof a !== "object") continue;
        if (a.tipo === "tarefa" && a.texto) {
          novo.tasks = [{ id: uid(), text: String(a.texto).slice(0, 200), done: false }, ...(novo.tasks || [])];
          feitas += 1;
        } else if (a.tipo === "rever" && a.texto) {
          novo.rever = [{ id: uid(), text: String(a.texto).slice(0, 200), done: false }, ...(novo.rever || [])];
          feitas += 1;
        } else if (a.tipo === "bloco" && a.titulo && a.inicio && a.fim) {
          const cat = BLOCK_IDS.indexOf(a.categoria) >= 0 ? a.categoria : "Estudo";
          novo.routine = [...(novo.routine || []), {
            id: uid(), day: Math.min(6, Math.max(0, Number(a.dia) || 0)),
            label: String(a.titulo).slice(0, 60), type: cat,
            start: String(a.inicio), end: String(a.fim),
          }];
          feitas += 1;
        }
      }
      return novo;
    });
    return { limpo: texto.replace(m[0], "").trim(), feitas };
  }, [setData]);

  const enviar = useCallback(async (pergunta) => {
    const p = (pergunta === undefined ? txt : pergunta).trim();
    if (!p || ocupado) return;
    setErro("");
    setTxt("");
    const historico = [...msgs, { papel: "user", texto: p }];
    setMsgs(historico);
    setOcupado(true);
    try {
      let tokenFirebase = "";
      try {
        if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
          tokenFirebase = await nuvem.sdk.auth.currentUser.getIdToken();
        }
      } catch (e) { /* segue sem token, o servidor decide */ }
      const r = await fetch(ROTA_IA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokenFirebase,
          contexto: resumoParaIA({ subjects, ladder, data, today, totals, minWeek, qWeek }),
          instrucoes: INSTRUCOES_IA,
          mensagens: historico.slice(-14).map((m) => ({
            role: m.papel === "user" ? "user" : "assistant",
            content: m.texto,
          })),
        }),
      });
      if (r.status === 404) {
        setErro("O assistente ainda não foi ligado neste site. Falta publicar a função e cadastrar a chave da API no Netlify.");
        setMsgs(historico);
        return;
      }
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.texto) {
        setErro((j && j.erro) || "O assistente não respondeu. Tente de novo em alguns instantes.");
        return;
      }
      const { limpo, feitas } = aplicarAcoes(j.texto);
      setMsgs([...historico, { papel: "claude", texto: limpo || j.texto }]);
      if (feitas) notify(`${feitas} ite${feitas === 1 ? "m adicionado" : "ns adicionados"} ao painel.`);
    } catch (e) {
      setErro("Não consegui falar com o assistente. Verifique a conexão.");
    } finally { setOcupado(false); }
  }, [txt, ocupado, msgs, subjects, ladder, data, today, totals, minWeek, qWeek, aplicarAcoes, notify, nuvem]);

  const sugestoes = [
    "O que eu deveria estudar hoje?",
    "Quais especialidades estão mais atrasadas?",
    "Monte um plano para esta semana",
    "Como está meu ritmo para a prova?",
  ];

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-6" brilho="var(--neon)">
        <H color="var(--neon)" icon={<Sparkles size={16} />}>Assistente</H>
        <Label style={{ marginTop: 6, lineHeight: 1.6 }}>
          Ele enxerga seu progresso, suas revisões atrasadas e sua rotina, então
          pode responder com base no que você realmente fez. Peça para anotar algo
          e ele registra direto no painel.
        </Label>
      </Card>

      <Card className="flex flex-col" style={{ minHeight: 420 }}>
        <div className="flex-1 px-5 sm:px-6 py-5 flex flex-col gap-4" style={{ maxHeight: 520, overflowY: "auto" }}>
          {msgs.length === 0 ? (
            <div className="flex flex-col items-center text-center py-8 px-4">
              <div style={{ color: "var(--neon)", opacity: 0.6 }}><Sparkles size={26} /></div>
              <div className="mt-4" style={{ fontFamily: F_SERIF, fontSize: 19, color: T.dim }}>Pergunte alguma coisa</div>
              <div className="mt-1.5" style={{ fontSize: 14, color: T.faint, maxWidth: 340, lineHeight: 1.55 }}>
                Ele já sabe onde você parou no cronograma.
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-6">
                {sugestoes.map((s) => (
                  <button key={s} type="button" onClick={() => enviar(s)} className="rounded-full px-4 py-2"
                    style={{
                      background: soft("var(--neon)", 10), border: `1px solid ${T.line}`,
                      color: T.dim, fontSize: 13.5, cursor: "pointer",
                    }}>{s}</button>
                ))}
              </div>
            </div>
          ) : msgs.map((m, i) => (
            <div key={i} className="flex" style={{ justifyContent: m.papel === "user" ? "flex-end" : "flex-start" }}>
              <div className="rounded-2xl px-4 py-3" style={{
                maxWidth: "86%",
                background: m.papel === "user" ? soft("var(--neon2)", 20) : T.card2,
                border: `1px solid ${m.papel === "user" ? "transparent" : T.line}`,
                fontSize: 14.5, lineHeight: 1.65, color: T.ink, whiteSpace: "pre-wrap",
              }}>{m.texto}</div>
            </div>
          ))}
          {ocupado ? (
            <div className="flex">
              <div className="rounded-2xl px-4 py-3 breathe" style={{ background: T.card2, border: `1px solid ${T.line}`, fontSize: 14.5, color: T.faint }}>
                pensando…
              </div>
            </div>
          ) : null}
          <div ref={fim} />
        </div>

        {erro ? (
          <div className="px-5 sm:px-6 pb-3">
            <div className="rounded-2xl px-4 py-3" style={{ background: soft("var(--warn)", 12), border: `1px solid ${soft("var(--warn)", 34)}` }}>
              <Mini style={{ lineHeight: 1.6, color: T.ink }}>{erro}</Mini>
            </div>
          </div>
        ) : null}

        <div className="px-5 sm:px-6 py-4 flex gap-2" style={{ borderTop: `1px solid ${T.line}` }}>
          <TextInput value={txt} placeholder="Escreva sua pergunta" disabled={ocupado}
            onChange={(e) => setTxt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
          <Btn tone="primary" onClick={() => enviar()} disabled={ocupado || !txt.trim()}>
            <ArrowUpRight size={16} />
          </Btn>
        </div>
      </Card>

      {msgs.length ? (
        <div className="flex justify-center">
          <Btn tone="outline" size="sm" onClick={() => { setMsgs([]); setErro(""); }}>limpar conversa</Btn>
        </div>
      ) : null}
    </div>
  );
}
