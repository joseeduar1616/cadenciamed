/* ═══════════════════════════════════════════════════════════════════
   31 · TREINO

   A única aba que não tem nada a ver com estudo. De propósito: quem passa
   o ano inteiro estudando para residência precisa de um lugar para a
   academia que NÃO conte como hora de estudo, não entre no cronograma e
   não apareça na meta semanal. Nada daqui toca data.sessions.

   O que mora aqui:

   · Perfil e plano. A pessoa descreve objetivo, dias por semana e
     equipamento, e a IA (/api/treino-ia) devolve a divisão em JSON. Ou
     monta na mão, que é o mesmo editor. O plano é dado estruturado
     (série, repetição, descanso, grupo muscular) porque é isso que
     permite contar volume, achar platô e desenhar a evolução de carga.
     Um texto bonito não faria nada disso.

   · Execução. Começou o treino, cada série é anotada com peso e
     repetição, e o descanso conta sozinho com aviso sonoro. O registro
     guarda o grupo muscular junto: sem isso, editar o plano depois
     apagaria a que grupo pertencia o que já foi feito.

   · Corpo. Peso e circunferências ao longo do tempo, em gráfico.

   · Cargas. Evolução por exercício, 1RM estimado, volume por grupo na
     semana e os exercícios que empacaram.

   O vídeo do exercício é uma BUSCA no YouTube pelo nome, não um link que
   a IA inventou: busca sempre acha alguma coisa, link inventado morre em
   404. Quem quiser um vídeo específico cola o endereço no exercício.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_TREINO_IA = "/api/treino-ia";

/* A caixinha que o recharts mostra ao passar o dedo. O mesmo visual da
   aba Progresso, escrito aqui porque lá ele é local ao componente. */
const dicaGrafico = {
  background: T.card3, border: `1px solid ${T.line}`, borderRadius: 14,
  color: T.ink, fontSize: 13.5, boxShadow: T.shadow,
};

const GRUPOS_MUSCULO = [
  "Peito", "Costas", "Ombro", "Bíceps", "Tríceps", "Perna",
  "Posterior", "Glúteo", "Panturrilha", "Abdômen", "Cardio",
];

/* Nome, chave e unidade de cada medida do corpo. O peso vem primeiro
   porque é o que quase todo mundo acompanha; o resto é fita métrica. */
const MEDIDAS_CORPO = [
  ["peso", "Peso", "kg"],
  ["abdome", "Abdômen", "cm"],
  ["cintura", "Cintura", "cm"],
  ["quadril", "Quadril", "cm"],
  ["peito", "Peito", "cm"],
  ["ombro", "Ombro", "cm"],
  ["braco", "Braço", "cm"],
  ["antebraco", "Antebraço", "cm"],
  ["coxa", "Coxa", "cm"],
  ["panturrilha", "Panturrilha", "cm"],
];

/* Barra olímpica e o jogo de anilhas que quase toda academia tem. */
const BARRA_PADRAO = 20;
const ANILHAS_PADRAO = [20, 15, 10, 5, 2.5, 1.25];

/* ── as contas, todas puras ──────────────────────────────────────────
   Ficam juntas e sem React de propósito: são elas que o
   testar-treino.mjs exercita, via a cópia que o extrair_treino.py faz. */

/* 1RM estimado pela fórmula de Epley. Vale para série de força, até umas
   12 repetições; acima disso a fórmula desanda e vira número inventado,
   então devolve null em vez de mentir. */
function um1RM(peso, reps) {
  const p = Number(peso);
  const r = Math.round(Number(reps));
  if (!(p > 0) || !(r >= 1) || r > 12) return null;
  return Math.round(p * (1 + r / 30) * 10) / 10;
}

/* A série que mais valeu do dia: a de maior 1RM estimado. Comparar pelo
   peso puro diria que 100 kg × 1 é melhor que 90 kg × 8, o que é falso
   para acompanhar progresso. */
function melhorSerie(series) {
  let melhor = null;
  for (const s of series) {
    const e = um1RM(s.peso, s.reps);
    if (e === null) continue;
    if (!melhor || e > melhor.e1rm) melhor = { ...s, e1rm: e };
  }
  return melhor;
}

/* A evolução de um exercício: a melhor série de cada dia, em ordem. */
function progressaoDoExercicio(sessoes, nome) {
  const alvo = String(nome || "").toLowerCase();
  const porDia = new Map();
  for (const s of sessoes || []) {
    const doDia = (s.series || []).filter((x) => String(x.exNome || "").toLowerCase() === alvo);
    if (!doDia.length) continue;
    const m = melhorSerie(doDia);
    if (!m) continue;
    const atual = porDia.get(s.data);
    if (!atual || m.e1rm > atual.e1rm) porDia.set(s.data, { data: s.data, peso: m.peso, reps: m.reps, e1rm: m.e1rm });
  }
  return [...porDia.values()].sort((a, b) => (a.data < b.data ? -1 : 1));
}

/* Todo exercício que já foi registrado, do mais recente para o mais
   antigo, sem repetir. É a lista que a aba de cargas oferece. */
function exerciciosRegistrados(sessoes) {
  const vistos = new Map();
  for (const s of [...(sessoes || [])].sort((a, b) => (a.data < b.data ? 1 : -1))) {
    for (const x of s.series || []) {
      const n = String(x.exNome || "").trim();
      if (n && !vistos.has(n.toLowerCase())) vistos.set(n.toLowerCase(), n);
    }
  }
  return [...vistos.values()];
}

/* Volume de um período, por grupo muscular: séries × repetições × peso.
   É o número que responde "estou esquecendo algum grupo?". Série sem
   peso (peso do corpo) conta como série feita, não como zero de volume,
   por isso o total de séries vem junto. */
function volumePorGrupo(sessoes, deIso, ateIso) {
  const contas = new Map();
  for (const s of sessoes || []) {
    if (deIso && s.data < deIso) continue;
    if (ateIso && s.data > ateIso) continue;
    for (const x of s.series || []) {
      const g = String(x.grupo || "").trim() || "Sem grupo";
      const atual = contas.get(g) || { grupo: g, kg: 0, series: 0 };
      atual.kg += (Number(x.peso) || 0) * (Number(x.reps) || 0);
      atual.series += 1;
      contas.set(g, atual);
    }
  }
  return [...contas.values()]
    .map((c) => ({ ...c, kg: Math.round(c.kg) }))
    .sort((a, b) => b.kg - a.kg || b.series - a.series);
}

/* Grupos do plano ativo que não apareceram no período. Treinar é chato de
   auditar sozinho: quem pula perna há um mês costuma não perceber. */
function gruposEsquecidos(plano, volume) {
  const feitos = new Set(volume.map((v) => v.grupo));
  const doPlano = new Set();
  for (const d of (plano && plano.dias) || []) {
    for (const e of d.exercicios || []) if (e.grupo) doPlano.add(e.grupo);
  }
  return [...doPlano].filter((g) => !feitos.has(g));
}

/* Exercícios que empacaram: o melhor 1RM estimado das últimas `janela`
   semanas não passou do melhor de antes.
   Exige pelo menos 3 dias registrados e um histórico que cubra o dobro da
   janela — com menos que isso, "não subiu" ainda é só "comecei agora". */
function acharPlatos(sessoes, hojeIso, janelaDias = 21) {
  const saida = [];
  for (const nome of exerciciosRegistrados(sessoes)) {
    const linha = progressaoDoExercicio(sessoes, nome);
    if (linha.length < 3) continue;
    const corte = addDays(hojeIso, -janelaDias);
    if (linha[0].data > addDays(hojeIso, -janelaDias * 2)) continue;
    const recentes = linha.filter((x) => x.data >= corte);
    const antigos = linha.filter((x) => x.data < corte);
    if (!recentes.length || !antigos.length) continue;
    const melhorRecente = Math.max.apply(null, recentes.map((x) => x.e1rm));
    const melhorAntigo = Math.max.apply(null, antigos.map((x) => x.e1rm));
    if (melhorRecente <= melhorAntigo) {
      saida.push({ nome, melhorRecente, melhorAntigo, desde: antigos[antigos.length - 1].data });
    }
  }
  return saida.sort((a, b) => b.melhorAntigo - a.melhorAntigo);
}

/* Quais anilhas pôr de cada lado para chegar ao peso alvo.
   Devolve também o peso que realmente dá para montar: pedir 63 kg com
   anilhas de 1,25 em diante não fecha, e mostrar "63" seria mentira. */
function anilhasPara(alvo, barra = BARRA_PADRAO, disponiveis = ANILHAS_PADRAO) {
  const total = Number(alvo);
  const b = Number(barra) || 0;
  if (!(total > 0) || total < b) return { possivel: false, porLado: [], real: b };
  let resta = (total - b) / 2;
  const porLado = [];
  for (const a of [...disponiveis].sort((x, y) => y - x)) {
    while (resta >= a - 0.001) { porLado.push(a); resta -= a; }
  }
  const real = Math.round((b + porLado.reduce((s, a) => s + a, 0) * 2) * 100) / 100;
  return { possivel: Math.abs(real - total) < 0.001, porLado, real };
}

/* Aquecimento a partir da carga de trabalho. Percentuais clássicos,
   arredondados para 2,5 kg porque é o que dá para montar na barra. */
function aquecimentoPara(carga, barra = BARRA_PADRAO) {
  const c = Number(carga);
  if (!(c > 0)) return [];
  const arred = (v) => Math.max(barra, Math.round(v / 2.5) * 2.5);
  return [
    { pct: 50, peso: arred(c * 0.5), reps: 8 },
    { pct: 70, peso: arred(c * 0.7), reps: 5 },
    { pct: 85, peso: arred(c * 0.85), reps: 3 },
  ].filter((x, i, todos) => i === 0 || x.peso > todos[i - 1].peso);
}

/* A carga com que a pessoa fez este exercício da última vez, para o campo
   já vir preenchido. Repetir o peso da semana passada é o começo certo de
   quase toda série, e digitar tudo de novo a cada treino é o motivo
   número um de parar de registrar. */
function ultimaCarga(sessoes, nome) {
  const linha = progressaoDoExercicio(sessoes, nome);
  return linha.length ? linha[linha.length - 1] : null;
}

/* Busca no YouTube pelo nome do exercício, ou o vídeo que a pessoa colou.
   Nunca um link vindo da IA: link inventado vira 404 no meio do treino. */
function videoDoExercicio(ex) {
  const proprio = String((ex && ex.video) || "").trim();
  if (proprio) return proprio;
  const q = encodeURIComponent(`${(ex && ex.nome) || ""} execução correta`);
  return `https://www.youtube.com/results?search_query=${q}`;
}

const trecho = (v, n) => String(v == null ? "" : v).trim().slice(0, n);

/* ── perfil e montagem do plano ──────────────────────────────────────── */

function PerfilETreino({ treino, gravar, notify, nuvem }) {
  const p = treino.perfil || {};
  const [f, setF] = useState({
    objetivo: p.objetivo || "", dias: p.dias || 3, nivel: p.nivel || "iniciante",
    minutos: p.minutos || "60", equipamento: p.equipamento || "", limitacoes: p.limitacoes || "",
    observacoes: p.observacoes || "",
  });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const mudar = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const pedirParaIA = async () => {
    setErro(""); setOcupado(true);
    let token = "";
    try {
      if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
        token = await nuvem.sdk.auth.currentUser.getIdToken();
      }
    } catch (e) { /* sem conta, a rota recusa */ }
    if (!token) { setOcupado(false); setErro("Entre na sua conta para a IA montar o treino."); return; }
    const { dados, erro: falhou } = await chamarApi(ROTA_TREINO_IA, { token, perfil: f }, "O montador de treino");
    setOcupado(false);
    if (falhou) { setErro(falhou); return; }
    if (!dados || dados.erro) { setErro((dados && dados.erro) || "Não consegui montar o treino."); return; }
    const plano = {
      id: uid(),
      nome: dados.nome || "Meu treino",
      aviso: dados.aviso || "",
      criadoEm: Date.now(),
      dias: (dados.dias || []).map((d) => ({
        id: uid(),
        nome: d.nome,
        exercicios: (d.exercicios || []).map((e) => ({ id: uid(), video: "", ...e })),
      })),
    };
    gravar((t) => ({
      ...t,
      perfil: { ...f },
      planos: [plano, ...(t.planos || [])],
      planoAtivo: plano.id,
    }));
    notify(`Treino montado: ${plano.dias.length} dia${plano.dias.length === 1 ? "" : "s"} por semana.`);
  };

  return (
    <Card className="px-6 py-6">
      <H color="var(--neon)" icon={<Sparkles size={16} />}>Montar com a IA</H>
      <Label style={{ marginTop: 6, lineHeight: 1.6 }}>
        Conte o que você quer e o que tem disponível. Dá para editar tudo depois,
        e dá para montar na mão sem passar por aqui.
      </Label>

      <div className="mt-5 flex flex-col gap-4">
        <div>
          <Label>Seu objetivo</Label>
          <Area style={{ marginTop: 6, minHeight: 78 }} value={f.objetivo}
            placeholder="Ex.: ganhar massa nos ombros e nas costas, sem perder condicionamento"
            onChange={(e) => mudar("objetivo", e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Dias por semana</Label>
            <select value={f.dias} onChange={(e) => mudar("dias", Number(e.target.value))}
              style={{ ...inp, marginTop: 6 }}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <Label>Experiência</Label>
            <select value={f.nivel} onChange={(e) => mudar("nivel", e.target.value)}
              style={{ ...inp, marginTop: 6 }}>
              <option value="iniciante">Iniciante</option>
              <option value="intermediário">Intermediário</option>
              <option value="avançado">Avançado</option>
            </select>
          </div>
          <div>
            <Label>Minutos por treino</Label>
            <TextInput style={{ marginTop: 6 }} value={f.minutos} inputMode="numeric"
              placeholder="60" onChange={(e) => mudar("minutos", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Equipamento que você tem</Label>
          <TextInput style={{ marginTop: 6 }} value={f.equipamento}
            placeholder="Ex.: academia completa, ou halteres em casa, ou só peso do corpo"
            onChange={(e) => mudar("equipamento", e.target.value)} />
        </div>
        <div>
          <Label>Dores, lesões ou limitações</Label>
          <TextInput style={{ marginTop: 6 }} value={f.limitacoes}
            placeholder="Ex.: ombro direito trava acima da cabeça"
            onChange={(e) => mudar("limitacoes", e.target.value)} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 items-center">
        <Btn tone="primary" disabled={ocupado || !f.objetivo.trim()} onClick={pedirParaIA}>
          <Sparkles size={15} /> {ocupado ? "Montando…" : "Montar meu treino"}
        </Btn>
        <Mini>o plano fica editável depois</Mini>
      </div>
      {erro ? <Label style={{ marginTop: 12, color: T.bad }}>{erro}</Label> : null}
    </Card>
  );
}

/* ── editor do plano ─────────────────────────────────────────────────── */

function EditorExercicio({ ex, aoMudar, aoExcluir }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="rounded-2xl px-4 py-3" style={{ background: T.card2 }}>
      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0" style={{ fontSize: 15, fontWeight: 600 }}>{ex.nome}</span>
        <Mini>{ex.series}×{ex.reps}</Mini>
        <button type="button" aria-label="Editar exercício" className="toque" onClick={() => setAberto((v) => !v)}
          style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer" }}>
          <Settings2 size={14} />
        </button>
        <button type="button" aria-label="Excluir exercício" className="toque" onClick={aoExcluir}
          style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer" }}>
          <Trash2 size={13} />
        </button>
      </div>
      {ex.observacao ? <Mini style={{ marginTop: 4 }}>{ex.observacao}</Mini> : null}
      {aberto ? (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <Label>Nome</Label>
            <TextInput style={{ marginTop: 4 }} value={ex.nome}
              onChange={(e) => aoMudar({ ...ex, nome: trecho(e.target.value, 60) })} />
          </div>
          <div>
            <Label>Grupo</Label>
            <select value={ex.grupo || ""} style={{ ...inp, marginTop: 4 }}
              onChange={(e) => aoMudar({ ...ex, grupo: e.target.value })}>
              <option value="">sem grupo</option>
              {GRUPOS_MUSCULO.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <Label>Séries</Label>
            <TextInput style={{ marginTop: 4 }} value={ex.series} inputMode="numeric"
              onChange={(e) => aoMudar({ ...ex, series: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} />
          </div>
          <div>
            <Label>Repetições</Label>
            <TextInput style={{ marginTop: 4 }} value={ex.reps}
              onChange={(e) => aoMudar({ ...ex, reps: trecho(e.target.value, 12) })} />
          </div>
          <div>
            <Label>Descanso (s)</Label>
            <TextInput style={{ marginTop: 4 }} value={ex.descanso} inputMode="numeric"
              onChange={(e) => aoMudar({ ...ex, descanso: Math.max(15, Math.min(600, Number(e.target.value) || 90)) })} />
          </div>
          <div className="col-span-2">
            <Label>Vídeo (opcional)</Label>
            <TextInput style={{ marginTop: 4 }} value={ex.video || ""} placeholder="cole um link do YouTube"
              onChange={(e) => aoMudar({ ...ex, video: trecho(e.target.value, 200) })} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EditorPlano({ plano, gravar, notify }) {
  const mexer = (fn) => gravar((t) => ({
    ...t,
    planos: (t.planos || []).map((p) => (p.id === plano.id ? fn(p) : p)),
  }));

  const addDia = () => mexer((p) => ({
    ...p,
    dias: [...(p.dias || []), { id: uid(), nome: `Treino ${String.fromCharCode(65 + (p.dias || []).length)}`, exercicios: [] }],
  }));

  const addExercicio = (diaId) => mexer((p) => ({
    ...p,
    dias: p.dias.map((d) => (d.id === diaId ? {
      ...d,
      exercicios: [...d.exercicios, { id: uid(), nome: "Exercício novo", grupo: "", series: 3, reps: "8-12", descanso: 90, observacao: "", video: "" }],
    } : d)),
  }));

  return (
    <Card className="px-6 py-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <H color="var(--a-CI)" icon={<ListChecks size={16} />}>{plano.nome}</H>
        <Btn size="sm" onClick={addDia}><Plus size={14} /> dia</Btn>
      </div>
      {plano.aviso ? (
        <div className="mt-4 rounded-2xl px-4 py-3"
          style={{ background: soft("var(--warn)", 12), border: `1px solid ${soft("var(--warn)", 32)}` }}>
          <Mini style={{ color: T.warn, lineHeight: 1.6 }}>{plano.aviso}</Mini>
        </div>
      ) : null}

      {(plano.dias || []).length === 0 ? (
        <Blank icon={<Dumbbell size={22} />} title="Plano vazio" hint="Adicione o primeiro dia de treino." />
      ) : (
        <div className="mt-5 flex flex-col gap-5">
          {plano.dias.map((d) => (
            <div key={d.id}>
              <div className="flex items-center gap-2">
                <TextInput value={d.nome} style={{ fontWeight: 600 }}
                  onChange={(e) => mexer((p) => ({
                    ...p, dias: p.dias.map((x) => (x.id === d.id ? { ...x, nome: trecho(e.target.value, 40) } : x)),
                  }))} />
                <Btn size="sm" title="Adicionar exercício" onClick={() => addExercicio(d.id)}><Plus size={14} /></Btn>
                <button type="button" aria-label="Excluir dia" className="toque"
                  onClick={() => mexer((p) => ({ ...p, dias: p.dias.filter((x) => x.id !== d.id) }))}
                  style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer" }}>
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {d.exercicios.map((ex) => (
                  <EditorExercicio key={ex.id} ex={ex}
                    aoMudar={(novo) => mexer((p) => ({
                      ...p,
                      dias: p.dias.map((x) => (x.id === d.id
                        ? { ...x, exercicios: x.exercicios.map((y) => (y.id === ex.id ? novo : y)) } : x)),
                    }))}
                    aoExcluir={() => mexer((p) => ({
                      ...p,
                      dias: p.dias.map((x) => (x.id === d.id
                        ? { ...x, exercicios: x.exercicios.filter((y) => y.id !== ex.id) } : x)),
                    }))} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-5 pt-5 flex flex-wrap gap-2" style={{ borderTop: `1px solid ${T.line}` }}>
        <Btn size="sm" tone="outline" onClick={() => {
          gravar((t) => ({
            ...t,
            planos: (t.planos || []).filter((p) => p.id !== plano.id),
            planoAtivo: (t.planos || []).filter((p) => p.id !== plano.id)[0]?.id || "",
          }));
          notify("Plano excluído.");
        }}>excluir este plano</Btn>
      </div>
    </Card>
  );
}

/* ── cronômetro de descanso ──────────────────────────────────────────── */

/* Conta em instante absoluto, e não somando 1 a cada segundo: no celular
   a aba em segundo plano tem o timer estrangulado, e um contador que soma
   atrasaria justamente enquanto a pessoa guarda o telefone para fazer a
   série seguinte. */
function Descanso({ segundos, aoTerminar }) {
  const [fim, setFim] = useState(0);
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => {
    if (!fim) return undefined;
    const t = window.setInterval(() => setAgora(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [fim]);

  const resta = fim ? Math.max(0, Math.ceil((fim - agora) / 1000)) : 0;
  useEffect(() => {
    if (!fim || resta > 0) return;
    setFim(0);
    beep(2);
    if (aoTerminar) aoTerminar();
  }, [fim, resta]);

  if (!fim) {
    return (
      <Btn size="sm" onClick={() => { setAgora(Date.now()); setFim(Date.now() + segundos * 1000); }}>
        <Timer size={14} /> descansar {segundos}s
      </Btn>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span style={{ fontFamily: F_MONO, fontSize: 20, fontWeight: 600, color: T.neon }}>
        {fmtRelogio(resta)}
      </span>
      <Btn size="sm" tone="outline" onClick={() => setFim(0)}>pular</Btn>
      <Btn size="sm" tone="outline" onClick={() => setFim((f) => f + 30000)}>+30s</Btn>
    </div>
  );
}

/* ── execução do treino ──────────────────────────────────────────────── */

function LinhaExercicio({ ex, feitas, aoRegistrar, aoApagar, sessoes }) {
  const anterior = useMemo(() => ultimaCarga(sessoes, ex.nome), [sessoes, ex.nome]);
  const [peso, setPeso] = useState(anterior ? String(anterior.peso) : "");
  const [reps, setReps] = useState("");
  const [verAjuda, setVerAjuda] = useState(false);

  const registrar = () => {
    const p = Number(String(peso).replace(",", "."));
    const r = Math.round(Number(reps));
    if (!(r >= 1)) return;
    aoRegistrar({ peso: Number.isFinite(p) && p >= 0 ? p : 0, reps: r });
    setReps("");
  };

  const alvo = Number(String(peso).replace(",", "."));
  const montagem = alvo > 0 ? anilhasPara(alvo) : null;
  const aquece = alvo > 0 && feitas.length === 0 ? aquecimentoPara(alvo) : [];

  return (
    <div className="rounded-2xl px-4 py-4" style={{ background: T.card2 }}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="flex-1 min-w-0" style={{ fontSize: 15.5, fontWeight: 600 }}>{ex.nome}</span>
        {ex.grupo ? <Mini>{ex.grupo}</Mini> : null}
        <a href={videoDoExercicio(ex)} target="_blank" rel="noopener noreferrer"
          aria-label={`Ver vídeo de ${ex.nome}`} className="toque"
          style={{ color: T.ghost, display: "inline-flex", alignItems: "center" }}>
          <Youtube size={16} />
        </a>
      </div>
      <Mini style={{ marginTop: 3 }}>
        alvo {ex.series}×{ex.reps}
        {anterior ? ` · última vez ${anterior.peso} kg × ${anterior.reps}` : " · primeira vez"}
        {ex.observacao ? ` · ${ex.observacao}` : ""}
      </Mini>

      {feitas.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {feitas.map((s, i) => (
            <span key={s.id} className="rounded-2xl px-3 py-1 flex items-center gap-2"
              style={{ background: soft("var(--ok)", 14), color: T.ok, fontSize: 13, fontFamily: F_MONO }}>
              {i + 1}: {s.peso || "livre"}{s.peso ? " kg" : ""} × {s.reps}
              <button type="button" aria-label="Apagar série" onClick={() => aoApagar(s.id)}
                style={{ background: "none", border: "none", color: T.ok, cursor: "pointer", padding: 0 }}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <TextInput style={{ maxWidth: 96 }} value={peso} inputMode="decimal" placeholder="kg"
          aria-label="Peso" onChange={(e) => setPeso(e.target.value)} />
        <TextInput style={{ maxWidth: 90 }} value={reps} inputMode="numeric" placeholder="reps"
          aria-label="Repetições" onChange={(e) => setReps(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") registrar(); }} />
        <Btn size="sm" tone="primary" disabled={!reps} onClick={registrar}>
          <Check size={14} /> série {feitas.length + 1}
        </Btn>
        <Descanso segundos={ex.descanso || 90} />
        <button type="button" aria-label="Ajuda de carga" className="toque" onClick={() => setVerAjuda((v) => !v)}
          style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer" }}>
          <Calculator size={14} />
        </button>
      </div>

      {verAjuda && alvo > 0 ? (
        <div className="mt-3 rounded-2xl px-3 py-3" style={{ background: T.card3 }}>
          <Mini>
            {montagem.possivel
              ? `barra de ${BARRA_PADRAO} kg + por lado: ${montagem.porLado.join(" + ")}`
              : `com as anilhas comuns dá ${montagem.real} kg (por lado: ${montagem.porLado.join(" + ") || "nada"})`}
          </Mini>
          {aquece.length ? (
            <Mini style={{ marginTop: 6 }}>
              aquecimento: {aquece.map((a) => `${a.peso}kg×${a.reps}`).join(" · ")}
            </Mini>
          ) : null}
          {um1RM(alvo, 5) ? <Mini style={{ marginTop: 6 }}>1RM estimado com 5 reps: {um1RM(alvo, 5)} kg</Mini> : null}
        </div>
      ) : null}
    </div>
  );
}

function ExecutarTreino({ treino, gravar, notify, today }) {
  const plano = (treino.planos || []).find((p) => p.id === treino.planoAtivo) || (treino.planos || [])[0];
  const emCurso = treino.emCurso || null;
  const [escolhido, setEscolhido] = useState("");

  if (!plano) {
    return (
      <Card className="px-6 py-6">
        <Blank icon={<Dumbbell size={22} />} title="Nenhum plano ainda"
          hint="Monte um treino com a IA ou crie um na mão, na aba Plano." />
      </Card>
    );
  }

  const comecar = (dia) => {
    gravar((t) => ({
      ...t,
      emCurso: { id: uid(), data: today, planoId: plano.id, diaId: dia.id, nome: dia.nome, inicio: Date.now(), series: [] },
    }));
    setEscolhido("");
  };

  const encerrar = (guardar) => {
    gravar((t) => {
      const c = t.emCurso;
      if (!c) return t;
      if (!guardar || !c.series.length) return { ...t, emCurso: null };
      return {
        ...t,
        emCurso: null,
        sessoes: [{ ...c, fim: Date.now() }, ...(t.sessoes || [])],
      };
    });
    notify(guardar ? "Treino registrado." : "Treino descartado.");
  };

  if (!emCurso) {
    return (
      <Card className="px-6 py-6">
        <H color="var(--a-PE)" icon={<Dumbbell size={16} />}>Começar o treino de hoje</H>
        <Label style={{ marginTop: 6 }}>{plano.nome}</Label>
        <div className="mt-5 flex flex-col gap-2">
          {plano.dias.map((d) => {
            const ultimo = (treino.sessoes || []).find((s) => s.diaId === d.id);
            return (
              <button key={d.id} type="button" onClick={() => comecar(d)}
                className="rounded-2xl px-4 py-4 flex items-center gap-3 toque"
                style={{ background: T.card2, border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}>
                <span className="flex-1 min-w-0">
                  <span style={{ display: "block", fontSize: 15.5, fontWeight: 600, color: T.ink }}>{d.nome}</span>
                  <Mini style={{ marginTop: 2 }}>
                    {d.exercicios.length} exercício{d.exercicios.length === 1 ? "" : "s"}
                    {ultimo ? ` · último em ${brDate(ultimo.data)}` : " · nunca feito"}
                  </Mini>
                </span>
                <ChevronRight size={16} color={T.ghost} />
              </button>
            );
          })}
        </div>
      </Card>
    );
  }

  const dia = plano.dias.find((d) => d.id === emCurso.diaId);
  const exercicios = (dia && dia.exercicios) || [];
  const registrar = (ex, s) => gravar((t) => ({
    ...t,
    emCurso: {
      ...t.emCurso,
      series: [...t.emCurso.series, {
        id: uid(), exId: ex.id, exNome: ex.nome, grupo: ex.grupo || "",
        peso: s.peso, reps: s.reps, em: Date.now(),
      }],
    },
  }));
  const apagar = (id) => gravar((t) => ({
    ...t, emCurso: { ...t.emCurso, series: t.emCurso.series.filter((x) => x.id !== id) },
  }));

  const totalSeries = emCurso.series.length;
  const alvoSeries = exercicios.reduce((a, e) => a + (Number(e.series) || 0), 0);

  return (
    <Card className="px-6 py-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <H color="var(--a-PE)" icon={<Dumbbell size={16} />}>{emCurso.nome}</H>
        <Mini>{totalSeries} de {alvoSeries} séries</Mini>
      </div>
      <div className="mt-3"><Track pct={alvoSeries ? (totalSeries / alvoSeries) * 100 : 0} color="var(--a-PE)" /></div>

      <div className="mt-5 flex flex-col gap-3">
        {exercicios.map((ex) => (
          <LinhaExercicio key={ex.id} ex={ex} sessoes={treino.sessoes || []}
            feitas={emCurso.series.filter((s) => s.exId === ex.id)}
            aoRegistrar={(s) => registrar(ex, s)} aoApagar={apagar} />
        ))}
      </div>

      <div className="mt-5 pt-5 flex flex-wrap gap-2" style={{ borderTop: `1px solid ${T.line}` }}>
        <Btn tone="primary" onClick={() => encerrar(true)}><Check size={15} /> Encerrar e salvar</Btn>
        <Btn tone="outline" size="sm" onClick={() => encerrar(false)}>descartar</Btn>
      </div>
    </Card>
  );
}

/* ── medidas do corpo ────────────────────────────────────────────────── */

function Medidas({ treino, gravar, notify, today }) {
  const medidas = useMemo(
    () => [...(treino.medidas || [])].sort((a, b) => (a.data < b.data ? -1 : 1)),
    [treino.medidas],
  );
  const ultima = medidas.length ? medidas[medidas.length - 1] : null;
  const [f, setF] = useState({ data: today });
  const [qual, setQual] = useState("peso");

  const salvar = () => {
    const limpo = { id: uid(), data: f.data || today };
    let algum = false;
    for (const [k] of MEDIDAS_CORPO) {
      const v = Number(String(f[k] == null ? "" : f[k]).replace(",", "."));
      if (Number.isFinite(v) && v > 0) { limpo[k] = v; algum = true; }
    }
    if (!algum) { notify("Preencha pelo menos uma medida."); return; }
    gravar((t) => ({
      ...t,
      /* Uma anotação por dia: medir duas vezes no mesmo dia é corrigir o
         que ficou errado, não registrar evolução nova. */
      medidas: [...(t.medidas || []).filter((m) => m.data !== limpo.data), limpo],
    }));
    setF({ data: today });
    notify("Medidas anotadas.");
  };

  const serie = medidas
    .filter((m) => Number(m[qual]) > 0)
    .map((m) => ({ dia: brDate(m.data).slice(0, 5), v: Number(m[qual]) }));
  const rotulo = (MEDIDAS_CORPO.find((x) => x[0] === qual) || ["", "", ""])[1];
  const unidade = (MEDIDAS_CORPO.find((x) => x[0] === qual) || ["", "", ""])[2];
  const variacao = serie.length >= 2 ? Math.round((serie[serie.length - 1].v - serie[0].v) * 10) / 10 : null;

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-6">
        <H color="var(--a-GO)" icon={<Ruler size={16} />}>Anotar medidas</H>
        <Label style={{ marginTop: 6 }}>
          Deixe em branco o que não for medir hoje. Dá para anotar só o peso.
        </Label>
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label>Data</Label>
            <TextInput style={{ marginTop: 4 }} type="date" value={f.data || today}
              onChange={(e) => setF((x) => ({ ...x, data: e.target.value }))} />
          </div>
          {MEDIDAS_CORPO.map(([k, nome, un]) => (
            <div key={k}>
              <Label>{nome} ({un})</Label>
              <TextInput style={{ marginTop: 4 }} inputMode="decimal" value={f[k] == null ? "" : f[k]}
                placeholder={ultima && ultima[k] ? String(ultima[k]) : ""}
                onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div className="mt-5">
          <Btn tone="primary" onClick={salvar}><Check size={15} /> Anotar</Btn>
        </div>
      </Card>

      <Card className="px-6 py-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <H size={18} color="var(--a-GO)" icon={<TrendingUp size={16} />}>Evolução</H>
          <select value={qual} onChange={(e) => setQual(e.target.value)} style={{ ...inp, maxWidth: 200 }}>
            {MEDIDAS_CORPO.map(([k, nome]) => <option key={k} value={k}>{nome}</option>)}
          </select>
        </div>
        {serie.length < 2 ? (
          <Blank icon={<TrendingUp size={22} />} title="Ainda sem linha"
            hint={`Anote ${rotulo.toLowerCase()} em pelo menos dois dias para ver a evolução.`} />
        ) : (
          <>
            <Mini style={{ marginTop: 10 }}>
              {serie[0].v} → {serie[serie.length - 1].v} {unidade}
              {variacao === null ? "" : ` · ${variacao > 0 ? "+" : ""}${variacao} ${unidade} no período`}
            </Mini>
            <div className="mt-4" style={{ height: 230 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serie} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 5" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fill: "var(--ghost)", fontSize: 10, fontFamily: F_MONO }} axisLine={false} tickLine={false} />
                  <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fill: "var(--ghost)", fontSize: 10, fontFamily: F_MONO }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={dicaGrafico} formatter={(v) => [`${v} ${unidade}`, rotulo]} />
                  <Line type="monotone" dataKey="v" stroke="var(--a-GO)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/* ── cargas, volume e platôs ─────────────────────────────────────────── */

function Cargas({ treino, today }) {
  const sessoes = treino.sessoes || [];
  const nomes = useMemo(() => exerciciosRegistrados(sessoes), [sessoes]);
  const [qual, setQual] = useState("");
  const escolhido = qual || nomes[0] || "";
  const linha = useMemo(() => progressaoDoExercicio(sessoes, escolhido), [sessoes, escolhido]);
  const semana = useMemo(() => volumePorGrupo(sessoes, addDays(today, -6), today), [sessoes, today]);
  const plano = (treino.planos || []).find((p) => p.id === treino.planoAtivo) || (treino.planos || [])[0];
  const esquecidos = useMemo(() => gruposEsquecidos(plano, semana), [plano, semana]);
  const platos = useMemo(() => acharPlatos(sessoes, today), [sessoes, today]);

  if (!sessoes.length) {
    return (
      <Card className="px-6 py-6">
        <Blank icon={<TrendingUp size={22} />} title="Nada registrado ainda"
          hint="Faça um treino anotando as séries e a evolução aparece aqui." />
      </Card>
    );
  }

  const maxKg = Math.max.apply(null, [1, ...semana.map((v) => v.kg)]);

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <H size={18} color="var(--a-CI)" icon={<TrendingUp size={16} />}>Carga por exercício</H>
          <select value={escolhido} onChange={(e) => setQual(e.target.value)} style={{ ...inp, maxWidth: 240 }}>
            {nomes.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {linha.length < 2 ? (
          <Blank icon={<BarChart3 size={22} />} title="Só um dia registrado"
            hint="Faça este exercício de novo para a linha aparecer." />
        ) : (
          <>
            <Mini style={{ marginTop: 10 }}>
              1RM estimado: {linha[0].e1rm} → {linha[linha.length - 1].e1rm} kg
            </Mini>
            <div className="mt-4" style={{ height: 210 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={linha.map((x) => ({ dia: brDate(x.data).slice(0, 5), kg: x.e1rm }))}
                  margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 5" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fill: "var(--ghost)", fontSize: 10, fontFamily: F_MONO }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--ghost)", fontSize: 10, fontFamily: F_MONO }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={dicaGrafico} formatter={(v) => [`${v} kg`, "1RM estimado"]} />
                  <Line type="monotone" dataKey="kg" stroke="var(--a-CI)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>

      <Card className="px-6 py-6">
        <H size={18} color="var(--a-PE)" icon={<BarChart3 size={16} />}>Volume dos últimos 7 dias</H>
        <Label style={{ marginTop: 4 }}>séries × repetições × peso, por grupo</Label>
        <div className="mt-5 flex flex-col gap-3">
          {semana.map((v) => (
            <div key={v.grupo}>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 14.5 }}>{v.grupo}</span>
                <Mini>{v.series} série{v.series === 1 ? "" : "s"} · {v.kg.toLocaleString("pt-BR")} kg</Mini>
              </div>
              <div className="mt-1.5"><Track pct={(v.kg / maxKg) * 100} color="var(--a-PE)" /></div>
            </div>
          ))}
        </div>
        {esquecidos.length ? (
          <div className="mt-5 rounded-2xl px-4 py-3"
            style={{ background: soft("var(--warn)", 12), border: `1px solid ${soft("var(--warn)", 30)}` }}>
            <Mini style={{ color: T.warn, lineHeight: 1.6 }}>
              está no seu plano e não apareceu esta semana: {esquecidos.join(", ")}
            </Mini>
          </div>
        ) : null}
      </Card>

      {platos.length ? (
        <Card className="px-6 py-6">
          <H size={18} color="var(--warn)" icon={<Flag size={16} />}>Empacou</H>
          <Label style={{ marginTop: 4 }}>três semanas sem passar do melhor anterior</Label>
          <div className="mt-4 flex flex-col gap-2">
            {platos.map((p) => (
              <div key={p.nome} className="rounded-2xl px-4 py-3" style={{ background: T.card2 }}>
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>{p.nome}</span>
                <Mini style={{ marginTop: 2 }}>
                  melhor de antes {p.melhorAntigo} kg · melhor agora {p.melhorRecente} kg
                </Mini>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/* ── competição ────────────────────────────────────────────────────────
 *
 * A mesma sala de amigos do estudo, usada para a academia: quem estuda
 * junto costuma ser quem treina junto, e uma segunda sala só para treino
 * seria mais um nome e mais uma senha para combinar. Quem ainda não tem
 * sala nenhuma é mandado para a aba Amigos, que é onde se cria.
 *
 * Postar é o que pontua. Ninguém soma treino no placar sem dizer para a
 * sala que treinou — é isso que faz a competição valer alguma coisa.
 *
 * A foto é opcional e é prova social, como no GymRats: não entra em conta
 * nenhuma, e só é vista por quem está na sala. Ela desce uma por vez,
 * quando alguém abre, e não junto da lista: trinta fotos de uma vez
 * fariam o mural demorar para abrir num celular no 4G da academia.
 */
const LADO_FOTO_TREINO = 900;
const QUALIDADE_FOTO_TREINO = 0.6;

/* Menor que a foto do cronograma de propósito: lá o que importa é ler
   letra miúda, aqui é reconhecer que a pessoa estava na academia. */
function reduzirFotoDeTreino(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const fator = Math.min(1, LADO_FOTO_TREINO / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * fator));
      c.height = Math.max(1, Math.round(img.height * fator));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", QUALIDADE_FOTO_TREINO).split(",")[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não consegui abrir essa imagem. Se for foto do iPhone, mande como JPEG."));
    };
    img.src = url;
  });
}

function FotoDoTreino({ nuvem, slug, id }) {
  const [b64, setB64] = useState(null);
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    if (!aberta || b64 !== null) return undefined;
    let vivo = true;
    (async () => {
      const j = await falarComSalas(nuvem, { tipo: "treino", acao: "treino-foto", nome: slug, id });
      if (vivo) setB64((j && j.foto) || "");
    })();
    return () => { vivo = false; };
  }, [aberta, b64, nuvem, slug, id]);

  if (!aberta) {
    return (
      <Btn size="sm" tone="outline" onClick={() => setAberta(true)}>
        <Camera size={13} /> ver a foto
      </Btn>
    );
  }
  if (b64 === null) return <Mini>carregando a foto…</Mini>;
  if (!b64) return <Mini>a foto não está mais disponível</Mini>;
  return (
    <img src={`data:image/jpeg;base64,${b64}`} alt="Foto do treino"
      style={{ width: "100%", maxWidth: 420, borderRadius: 14, display: "block" }} />
  );
}

/* Criar ou entrar numa sala DE TREINO.
 *
 * Sala própria, com nome e senha próprios, e não a mesma do estudo: quem
 * estuda com você não é necessariamente quem treina com você, e juntar as
 * duas obrigaria o pessoal do grupo de estudo a ver o mural da academia de
 * gente que só entrou para comparar horas de prova.
 *
 * A tela é a mesma da aba Amigos de propósito — nome, senha, entrar ou
 * criar —, porque quem já entrou numa sala de estudo não precisa aprender
 * um segundo jeito de fazer a mesma coisa. */
function SalaDeTreino({ nuvem, notify, aoEntrar, erro: erroDeFora }) {
  const [form, setForm] = useState({ nome: "", senha: "" });
  const [modo, setModo] = useState("entrar");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const enviar = async () => {
    if (!form.nome.trim()) { setErro("Escreva o nome da sala."); return; }
    if (form.senha.length < 4) { setErro("A senha precisa ter pelo menos 4 caracteres."); return; }
    setOcupado(true); setErro("");
    const j = await falarComSalas(nuvem, {
      tipo: "treino", acao: modo, nome: form.nome.trim(), senha: form.senha,
    });
    setOcupado(false);
    if (j.erro) { setErro(j.erro); return; }
    notify(j.mensagem || "Pronto.");
    setForm({ nome: "", senha: "" });
    aoEntrar(j.slug);
  };

  return (
    <Card className="px-6 py-6" brilho="var(--neon2)">
      <H color="var(--neon2)" icon={<Trophy size={16} />}>Sala de treino</H>
      <Texto style={{ marginTop: 10 }}>
        Combine um nome e uma senha com quem treina com você. É uma sala só da
        academia, separada das salas de estudo: aqui entra quem você quiser puxar
        para o treino, e não precisa ser a mesma turma da prova.
      </Texto>

      <div className="mt-5 flex gap-2">
        {[["entrar", "Entrar numa sala"], ["criar", "Criar uma sala"]].map(([id, rotulo]) => (
          <Btn key={id} size="sm" tone={modo === id ? "primary" : "quiet"} onClick={() => setModo(id)}>
            {rotulo}
          </Btn>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Nome da sala</Label>
          <TextInput style={{ marginTop: 6 }} value={form.nome} placeholder="Ex.: treino da madrugada"
            onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} />
        </div>
        <div>
          <Label>Senha</Label>
          <TextInput style={{ marginTop: 6 }} type="password" value={form.senha}
            placeholder="pelo menos 4 caracteres"
            onChange={(e) => setForm((p) => ({ ...p, senha: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} />
        </div>
      </div>

      <div className="mt-5">
        <Btn tone="primary" disabled={ocupado} onClick={enviar}>
          {ocupado ? "Um instante…" : modo === "criar" ? "Criar a sala" : "Entrar na sala"}
        </Btn>
      </div>
      {erro || erroDeFora ? (
        <Label style={{ marginTop: 12, color: T.bad }}>{erro || erroDeFora}</Label>
      ) : null}
    </Card>
  );
}

function Competicao({ treino, nuvem, notify }) {
  const [salas, setSalas] = useState(null);
  const [slug, setSlug] = useState("");
  const [mural, setMural] = useState(null);
  const [placar, setPlacar] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [recado, setRecado] = useState("");
  const [foto, setFoto] = useState(null);
  const arquivoRef = useRef(null);
  const refNuvem = useRef(nuvem);
  refNuvem.current = nuvem;
  const meuUid = nuvem && nuvem.usuario ? nuvem.usuario.uid : "";

  /* O último treino registrado no aparelho é o que vai para o mural: os
     números vêm do que foi realmente anotado série a série, não de um
     campo que dá para preencher com qualquer coisa. */
  const ultimo = (treino.sessoes || [])[0] || null;
  const resumo = useMemo(() => {
    if (!ultimo) return null;
    const minutos = ultimo.fim && ultimo.inicio
      ? Math.max(0, Math.round((ultimo.fim - ultimo.inicio) / 60000)) : 0;
    const volume = (ultimo.series || []).reduce(
      (a, x) => a + (Number(x.peso) || 0) * (Number(x.reps) || 0), 0);
    return { nome: ultimo.nome || "Treino", minutos, series: (ultimo.series || []).length, volume: Math.round(volume) };
  }, [ultimo]);

  const recarregarSalas = useCallback(async (escolher) => {
    const j = await falarComSalas(refNuvem.current, { tipo: "treino", acao: "minhas" });
    if (j.erro) { setErro(j.erro); setSalas([]); return; }
    setSalas(j.salas || []);
    setSlug((p) => escolher || p || ((j.salas || [])[0] || {}).slug || "");
  }, []);

  useEffect(() => { recarregarSalas(); }, [meuUid, recarregarSalas]);

  const carregar = useCallback(async (qual) => {
    if (!qual) return;
    const j = await falarComSalas(refNuvem.current, { tipo: "treino", acao: "treino-mural", nome: qual });
    if (j.erro) { setErro(j.erro); return; }
    setMural(j.mural || []);
    setPlacar(j.placar || []);
    setErro("");
  }, []);

  useEffect(() => { carregar(slug); }, [slug, carregar]);

  const postar = async () => {
    if (!resumo) return;
    setOcupado(true); setErro("");
    const j = await falarComSalas(refNuvem.current, {
      tipo: "treino", acao: "treino-postar", nome: slug,
      texto: recado, treino: resumo.nome, minutos: resumo.minutos,
      series: resumo.series, volume: resumo.volume, foto: foto || "",
    });
    setOcupado(false);
    if (j.erro) { setErro(j.erro); return; }
    setRecado(""); setFoto(null);
    notify("Treino postado na sala.");
    carregar(slug);
  };

  if (salas === null) return <Card className="px-6 py-6"><Mini>carregando as suas salas…</Mini></Card>;

  if (!salas.length) return <SalaDeTreino {...{ nuvem, notify, aoEntrar: recarregarSalas, erro }} />;

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-6" brilho="var(--neon2)">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <H color="var(--neon2)" icon={<Trophy size={16} />}>Competição de treino</H>
          <div className="flex items-center gap-2 flex-wrap">
            {salas.length > 1 ? (
              <select value={slug} onChange={(e) => setSlug(e.target.value)} style={{ ...inp, maxWidth: 200 }}>
                {salas.map((s) => <option key={s.slug} value={s.slug}>{s.nome}</option>)}
              </select>
            ) : null}
            <Btn size="sm" tone="outline" onClick={async () => {
              const j = await falarComSalas(refNuvem.current, { tipo: "treino", acao: "sair", nome: slug });
              if (j.erro) { setErro(j.erro); return; }
              notify(j.mensagem || "Você saiu da sala.");
              setSlug(""); setMural(null); setPlacar([]);
              recarregarSalas("");
            }}>sair</Btn>
          </div>
        </div>
        <Label style={{ marginTop: 6, lineHeight: 1.6 }}>
          Últimos 7 dias, pela mesma sala do estudo. Só conta treino postado.
        </Label>

        <div className="mt-5 flex flex-col gap-2">
          {placar.map((x) => (
            <div key={x.uid} className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ background: x.souEu ? soft("var(--neon2)", 12) : T.card2 }}>
              <span style={{ fontFamily: F_MONO, fontSize: 15, color: T.ghost, minWidth: 22 }}>
                {x.posicao || "—"}
              </span>
              <Face nome={x.nome} foto={x.foto} cor={corDoNome(x.nome)} tamanho={32} forte={x.souEu} />
              <span className="flex-1 min-w-0">
                <span style={{ display: "block", fontSize: 15, fontWeight: x.souEu ? 700 : 600 }}>{x.nome}</span>
                <Mini>{x.treinos} treino{x.treinos === 1 ? "" : "s"} · {x.series} séries · {fmtMin(x.minutos)}</Mini>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="px-6 py-6">
        <H size={18} color="var(--a-PE)" icon={<Camera size={16} />}>Postar o último treino</H>
        {!resumo ? (
          <Blank icon={<Dumbbell size={22} />} title="Nenhum treino registrado"
            hint="Faça um treino na aba Hoje, anotando as séries, e ele aparece aqui para postar." />
        ) : (
          <>
            <Mini style={{ marginTop: 8 }}>
              {resumo.nome} · {resumo.series} séries · {fmtMin(resumo.minutos)}
              {resumo.volume ? ` · ${resumo.volume.toLocaleString("pt-BR")} kg` : ""}
            </Mini>
            <div className="mt-4">
              <TextInput value={recado} placeholder="Escreva algo (opcional)"
                onChange={(e) => setRecado(e.target.value.slice(0, 200))} />
            </div>
            <input ref={arquivoRef} type="file" hidden accept="image/*"
              onChange={async (e) => {
                const arq = (e.target.files || [])[0];
                e.target.value = "";
                if (!arq) return;
                setErro("");
                try { setFoto(await reduzirFotoDeTreino(arq)); }
                catch (err) { setErro((err && err.message) || "Não consegui ler essa foto."); }
              }} />
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              <Btn size="sm" onClick={() => arquivoRef.current && arquivoRef.current.click()}>
                <Camera size={14} /> {foto ? "trocar a foto" : "pôr uma foto"}
              </Btn>
              {foto ? <Btn size="sm" tone="outline" onClick={() => setFoto(null)}>tirar a foto</Btn> : null}
              <Btn tone="primary" size="sm" disabled={ocupado} onClick={postar}>
                {ocupado ? "Postando…" : "Postar na sala"}
              </Btn>
            </div>
            {foto ? (
              <img src={`data:image/jpeg;base64,${foto}`} alt="Foto escolhida"
                className="mt-4" style={{ width: "100%", maxWidth: 260, borderRadius: 14, display: "block" }} />
            ) : null}
          </>
        )}
        {erro ? <Label style={{ marginTop: 12, color: T.bad }}>{erro}</Label> : null}
      </Card>

      <Card className="px-6 py-6">
        <H size={18} color="var(--neon2)" icon={<Users size={16} />}>Mural da sala</H>
        {mural === null ? <Mini style={{ marginTop: 10 }}>carregando…</Mini> : null}
        {mural && !mural.length ? (
          <Blank icon={<Camera size={22} />} title="Mural vazio"
            hint="Poste o seu treino e puxe os outros junto." />
        ) : null}
        <div className="mt-4 flex flex-col gap-3">
          {(mural || []).map((t) => (
            <div key={t.id} className="rounded-2xl px-4 py-4" style={{ background: T.card2 }}>
              <div className="flex items-center gap-3">
                <Face nome={t.nome} foto={t.foto} cor={corDoNome(t.nome)} tamanho={32} />
                <span className="flex-1 min-w-0">
                  <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{t.nome}</span>
                  <Mini>
                    {t.treino || "Treino"} · {t.series} séries · {fmtMin(t.minutos)} · {horaCurta(t.em)}
                  </Mini>
                </span>
                {t.uid === meuUid ? (
                  <button type="button" aria-label="Apagar do mural" className="toque"
                    onClick={async () => {
                      const j = await falarComSalas(refNuvem.current, { tipo: "treino", acao: "treino-apagar", nome: slug, id: t.id });
                      if (j.erro) { setErro(j.erro); return; }
                      carregar(slug);
                    }}
                    style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer" }}>
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>
              {t.texto ? <Texto style={{ marginTop: 8 }}>{t.texto}</Texto> : null}
              {t.temFoto ? (
                <div className="mt-3"><FotoDoTreino nuvem={refNuvem.current} slug={slug} id={t.id} /></div>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ── a aba ───────────────────────────────────────────────────────────── */

function Treino({ data, setData, notify, today, nuvem }) {
  const treino = data.treino || {};
  const [vista, setVista] = useState("hoje");
  const gravar = useCallback(
    (fn) => setData((p) => ({ ...p, treino: fn(p.treino || {}) })),
    [setData],
  );
  const plano = (treino.planos || []).find((p) => p.id === treino.planoAtivo) || (treino.planos || [])[0];

  const VISTAS = [["hoje", "Hoje"], ["plano", "Plano"], ["corpo", "Corpo"],
    ["cargas", "Cargas"], ["sala", "Competição"]];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 flex-wrap">
        {VISTAS.map(([id, rotulo]) => (
          <Btn key={id} size="sm" tone={vista === id ? "primary" : "quiet"} onClick={() => setVista(id)}>
            {rotulo}
          </Btn>
        ))}
        {treino.emCurso ? <Mini style={{ color: T.neon }}>treino em andamento</Mini> : null}
      </div>

      {vista === "hoje" ? <ExecutarTreino {...{ treino, gravar, notify, today }} /> : null}
      {vista === "plano" ? (
        <>
          <PerfilETreino {...{ treino, gravar, notify, nuvem }} />
          {(treino.planos || []).length > 1 ? (
            <Card className="px-6 py-5">
              <Label>Plano ativo</Label>
              <select value={treino.planoAtivo || (plano && plano.id) || ""} style={{ ...inp, marginTop: 6 }}
                onChange={(e) => gravar((t) => ({ ...t, planoAtivo: e.target.value }))}>
                {(treino.planos || []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </Card>
          ) : null}
          {plano ? <EditorPlano {...{ plano, gravar, notify }} /> : null}
          {!plano ? (
            <Card className="px-6 py-6">
              <Btn tone="primary" onClick={() => {
                const novo = { id: uid(), nome: "Meu treino", aviso: "", criadoEm: Date.now(), dias: [] };
                gravar((t) => ({ ...t, planos: [novo, ...(t.planos || [])], planoAtivo: novo.id }));
              }}><Plus size={15} /> Criar um plano na mão</Btn>
            </Card>
          ) : null}
        </>
      ) : null}
      {vista === "corpo" ? <Medidas {...{ treino, gravar, notify, today }} /> : null}
      {vista === "cargas" ? <Cargas {...{ treino, today }} /> : null}
      {vista === "sala" ? <Competicao {...{ treino, nuvem, notify }} /> : null}
    </div>
  );
}
