/* ═══════════════════════════════════════════════════════════════════
   25 · CARTÕES
   Cada pessoa escreve os próprios cartões, ligados a uma aula do
   cronograma. O intervalo até a próxima aparição cresce conforme a
   resposta, seguindo a ideia do SM-2: acertou fácil, demora mais a
   voltar; errou, volta hoje mesmo.
   ═══════════════════════════════════════════════════════════════════ */

const NOTAS = [
  { id: "errei", rotulo: "Errei", atalho: "1", cor: "var(--bad)", dica: "volta ainda hoje" },
  { id: "dificil", rotulo: "Difícil", atalho: "2", cor: "var(--warn)", dica: "volta logo" },
  { id: "bom", rotulo: "Bom", atalho: "3", cor: "var(--neon)", dica: "intervalo normal" },
  { id: "facil", rotulo: "Fácil", atalho: "4", cor: "var(--ok)", dica: "demora mais a voltar" },
];

const BARALHO_PADRAO = "Geral";
const PASTA_SOLTA = "Sem pasta";

/* Os baralhos moram em pastas. A pasta é um rótulo guardado no cartão, o que
   evita uma estrutura paralela que poderia sair de sincronia. A lista em
   data.pastas existe só para as pastas vazias não sumirem ao recarregar:
   uma pasta recém-criada ainda não tem cartão nenhum apontando para ela. */
function agruparEmPastas(cartoes, hoje, avulsas) {
  const pastas = new Map();
  const garantir = (nome) => {
    if (!pastas.has(nome)) pastas.set(nome, { nome, baralhos: new Map(), total: 0, hoje: 0 });
    return pastas.get(nome);
  };
  for (const c of cartoes) {
    const P = garantir(c.pasta || PASTA_SOLTA);
    const b = c.baralho || BARALHO_PADRAO;
    if (!P.baralhos.has(b)) P.baralhos.set(b, { nome: b, total: 0, hoje: 0 });
    const B = P.baralhos.get(b);
    const venceu = (c.prox || hoje) <= hoje;
    B.total += 1; P.total += 1;
    if (venceu) { B.hoje += 1; P.hoje += 1; }
  }
  for (const nome of (avulsas || [])) garantir(nome);
  return [...pastas.values()]
    .map((p) => ({ ...p, baralhos: [...p.baralhos.values()].sort((a, b) => b.hoje - a.hoje || a.nome.localeCompare(b.nome)) }))
    .sort((a, b) => (a.nome === PASTA_SOLTA ? 1 : b.nome === PASTA_SOLTA ? -1 : b.hoje - a.hoje || a.nome.localeCompare(b.nome)));
}

/* Enquanto o estudo está aberto, as teclas de 1 a 4 respondem o cartão.
   Sem esta trava elas também trocariam de aba, porque o app usa números
   como atalho de navegação. */
let estudandoCartoes = false;
const estaEstudando = () => estudandoCartoes;

function novoCartao(frente, verso, subjectId, baralho, pasta) {
  return {
    id: uid(),
    frente: String(frente).slice(0, 400),
    verso: String(verso).slice(0, 800),
    subjectId: subjectId || null,
    baralho: (baralho || BARALHO_PADRAO).slice(0, 40),
    pasta: (pasta || PASTA_SOLTA).slice(0, 40),
    criado: todayISO(),
    prox: todayISO(),      // nasce para ser estudado hoje
    inter: 0,              // dias até a próxima vez
    facilidade: 2.5,       // quanto o intervalo cresce a cada acerto
    revisoes: 0,
    lapsos: 0,
  };
}

/* Devolve o cartão atualizado depois de uma resposta. */
function reagendar(c, nota) {
  const n = { ...c, revisoes: (c.revisoes || 0) + 1 };
  let f = Number(c.facilidade) || 2.5;
  let inter = Number(c.inter) || 0;

  if (nota === "errei") {
    n.lapsos = (c.lapsos || 0) + 1;
    f = Math.max(1.3, f - 0.2);
    inter = 0;                       // volta na mesma sessão
  } else if (nota === "dificil") {
    f = Math.max(1.3, f - 0.15);
    inter = inter === 0 ? 1 : Math.max(1, Math.round(inter * 1.2));
  } else if (nota === "bom") {
    inter = inter === 0 ? 1 : inter === 1 ? 3 : Math.round(inter * f);
  } else {
    f = Math.min(3.2, f + 0.15);
    inter = inter === 0 ? 2 : inter === 1 ? 5 : Math.round(inter * f * 1.3);
  }

  inter = Math.min(365, inter);
  n.facilidade = Math.round(f * 100) / 100;
  n.inter = inter;
  n.prox = addDays(todayISO(), inter);
  return n;
}

/* Lê o texto de uma exportação e devolve os cartões.
   Aceita tabulação, ponto e vírgula ou vírgula como separador, que é o
   que sai do Anki, do Quizlet e de uma planilha. */
function lerImportacao(texto, baralhoPadrao) {
  const linhas = String(texto).split(/\r?\n/);
  const fora = [];
  let separador = "\t";
  const amostra = linhas.filter((l) => l.trim() && l[0] !== "#").slice(0, 12).join("\n");
  if (!amostra.includes("\t")) {
    const pv = (amostra.match(/;/g) || []).length;
    const vg = (amostra.match(/,/g) || []).length;
    separador = pv >= vg && pv > 0 ? ";" : ",";
  }

  const partir = (linha) => {
    /* respeita aspas, para uma resposta com vírgula não virar duas colunas */
    const col = [];
    let atual = "", dentro = false;
    for (let i = 0; i < linha.length; i++) {
      const c = linha[i];
      if (c === '"') {
        if (dentro && linha[i + 1] === '"') { atual += '"'; i += 1; }
        else dentro = !dentro;
      } else if (c === separador && !dentro) { col.push(atual); atual = ""; }
      else atual += c;
    }
    col.push(atual);
    return col;
  };

  const limpar = (s) => String(s || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

  for (const linha of linhas) {
    const cru = linha.trim();
    if (!cru || cru[0] === "#") continue;          // o Anki começa com comentários
    const col = partir(linha).map(limpar);
    const frente = col[0], verso = col[1];
    if (!frente || !verso) continue;
    if (/^(frente|front|pergunta|question|term)$/i.test(frente)) continue;   // cabeçalho
    const baralho = col[2] && col[2].length < 40 ? col[2] : baralhoPadrao;
    fora.push(novoCartao(frente, verso, null, baralho));
  }
  return fora;
}

const estagio = (c) => (
  (c.inter || 0) === 0 ? "novo" : (c.inter || 0) < 21 ? "aprendendo" : "firme"
);

/* Guarda o nome da pasta na lista salva, sem repetir e sem a solta, que é
   só o rótulo de quem não está em pasta nenhuma. */
function registrarPasta(lista, nome) {
  if (!nome || nome === PASTA_SOLTA) return lista || [];
  return [...new Set([...(lista || []), nome])].slice(0, 60);
}

function Cartoes({ data, setData, subjects, today, notify }) {
  const [modo, setModo] = useState("painel");   // painel | estudo | criar
  const [fila, setFila] = useState([]);
  const [virado, setVirado] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [novo, setNovo] = useState({ frente: "", verso: "", subjectId: null, baralho: BARALHO_PADRAO, pasta: PASTA_SOLTA });
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [baralhoAtivo, setBaralhoAtivo] = useState("todos");
  const [pastaAtiva, setPastaAtiva] = useState("todas");
  const [abertas, setAbertas] = useState({});
  const [renomeando, setRenomeando] = useState(null);   // {tipo, nome, pasta}
  const [confirmando, setConfirmando] = useState(null); // {tipo, nome, pasta}
  const [novoNome, setNovoNome] = useState("");
  const [novaPasta, setNovaPasta] = useState("");
  const [colado, setColado] = useState("");
  const [nomeImport, setNomeImport] = useState("");
  const arquivoRef = useRef(null);
  const [lendo, setLendo] = useState("");

  const cartoes = data.flash || [];

  const baralhos = useMemo(() => {
    const m = new Map();
    for (const c of cartoes) {
      const b = c.baralho || BARALHO_PADRAO;
      if (!m.has(b)) m.set(b, { nome: b, total: 0, hoje: 0 });
      const g = m.get(b);
      g.total += 1;
      if ((c.prox || today) <= today) g.hoje += 1;
    }
    return [...m.values()].sort((a, b) => b.hoje - a.hoje || a.nome.localeCompare(b.nome));
  }, [cartoes, today]);

  const pastas = useMemo(
    () => agruparEmPastas(cartoes, today, data.pastas || []),
    [cartoes, today, data.pastas]
  );
  const nomesDePasta = useMemo(
    () => [...new Set([PASTA_SOLTA, ...pastas.map((p) => p.nome)])],
    [pastas]
  );

  const renomear = useCallback(() => {
    const alvo = renomeando;
    const nome = novoNome.trim().slice(0, 40);
    if (!alvo || !nome) return;
    setData((p) => {
      const flash = (p.flash || []).map((c) => {
        const cp = c.pasta || PASTA_SOLTA, cb = c.baralho || BARALHO_PADRAO;
        if (alvo.tipo === "pasta" && cp === alvo.nome) return { ...c, pasta: nome };
        if (alvo.tipo === "baralho" && cb === alvo.nome && cp === alvo.pasta) return { ...c, baralho: nome };
        return c;
      });
      const pastasSalvas = alvo.tipo === "pasta"
        ? [...new Set((p.pastas || []).map((x) => (x === alvo.nome ? nome : x)))]
        : (p.pastas || []);
      return { ...p, flash, pastas: pastasSalvas };
    });
    if (alvo.tipo === "pasta") {
      if (pastaAtiva === alvo.nome) setPastaAtiva(nome);
      setAbertas((a) => ({ ...a, [nome]: true }));
    } else if (baralhoAtivo === alvo.nome) setBaralhoAtivo(nome);
    setRenomeando(null); setNovoNome("");
    notify("Nome alterado.");
  }, [renomeando, novoNome, setData, notify, pastaAtiva, baralhoAtivo]);

  const moverBaralho = useCallback((baralho, dePasta, paraPasta) => {
    if (dePasta === paraPasta) return;
    setData((p) => ({
      ...p,
      flash: (p.flash || []).map((c) => (
        (c.baralho || BARALHO_PADRAO) === baralho && (c.pasta || PASTA_SOLTA) === dePasta
          ? { ...c, pasta: paraPasta } : c
      )),
      pastas: registrarPasta(p.pastas, paraPasta),
    }));
    setAbertas((a) => ({ ...a, [paraPasta]: true }));
    notify(`"${baralho}" foi para "${paraPasta}".`);
  }, [setData, notify]);

  const criarPasta = useCallback(() => {
    const nome = novaPasta.trim().slice(0, 40);
    if (!nome) return;
    if (nome === PASTA_SOLTA) { notify(`"${PASTA_SOLTA}" é o nome reservado das soltas.`); return; }
    if (pastas.some((p) => p.nome === nome)) { notify("Já existe uma pasta com esse nome."); return; }
    /* fica guardada junto com os dados, senão sumiria ao recarregar,
       porque uma pasta recém-criada ainda não tem cartão apontando nela */
    setData((p) => ({ ...p, pastas: registrarPasta(p.pastas, nome) }));
    setAbertas((a) => ({ ...a, [nome]: true }));
    setPastaAtiva(nome);
    setNovaPasta("");
    notify(`Pasta "${nome}" criada. Mova um baralho para dentro dela.`);
  }, [novaPasta, notify, setData, pastas]);

  /* Apagar a pasta não apaga cartão: os baralhos de dentro voltam para as
     soltas. Quem quiser apagar cartão apaga o baralho. */
  const apagarPasta = useCallback((nome) => {
    setData((p) => ({
      ...p,
      flash: (p.flash || []).map((c) => ((c.pasta || PASTA_SOLTA) === nome ? { ...c, pasta: PASTA_SOLTA } : c)),
      pastas: (p.pastas || []).filter((x) => x !== nome),
    }));
    setAbertas((a) => { const n = { ...a }; delete n[nome]; return n; });
    if (pastaAtiva === nome) { setPastaAtiva("todas"); setBaralhoAtivo("todos"); }
    setConfirmando(null);
    notify(`Pasta "${nome}" desfeita. Os baralhos foram para "${PASTA_SOLTA}".`);
  }, [setData, notify, pastaAtiva]);

  const apagarBaralho = useCallback((baralho, pasta) => {
    setData((p) => ({
      ...p,
      flash: (p.flash || []).filter((c) => !(
        (c.baralho || BARALHO_PADRAO) === baralho && (c.pasta || PASTA_SOLTA) === pasta
      )),
    }));
    if (baralhoAtivo === baralho) setBaralhoAtivo("todos");
    setConfirmando(null);
    notify(`Baralho "${baralho}" apagado.`);
  }, [setData, notify, baralhoAtivo]);

  const doBaralho = useMemo(() => cartoes.filter((c) => {
    if (pastaAtiva !== "todas" && (c.pasta || PASTA_SOLTA) !== pastaAtiva) return false;
    if (baralhoAtivo !== "todos" && (c.baralho || BARALHO_PADRAO) !== baralhoAtivo) return false;
    return true;
  }), [cartoes, pastaAtiva, baralhoAtivo]);

  const vencidos = useMemo(
    () => doBaralho.filter((c) => (c.prox || today) <= today),
    [doBaralho, today]
  );

  const importar = useCallback((texto, origem) => {
    const base = (origem || "").replace(/\.[^.]+$/, "").slice(0, 40) || BARALHO_PADRAO;
    const novos = lerImportacao(texto, base).map((c) => ({ ...c, pasta: base }));
    if (novos.length === 0) {
      setErro("Não encontrei nenhum par de pergunta e resposta nesse conteúdo.");
      return;
    }
    setErro("");
    setData((p) => ({ ...p, flash: [...novos, ...(p.flash || [])], pastas: registrarPasta(p.pastas, base) }));
    setAbertas((a) => ({ ...a, [base]: true }));
    notify(`${novos.length} cartõe${novos.length === 1 ? "" : "s"} importado${novos.length === 1 ? "" : "s"} para "${base}".`);
    setColado("");
    setNomeImport("");
  }, [setData, notify]);

  const arquivoEscolhido = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setErro("");

    if (/\.apkg$/i.test(f.name)) {
      setLendo("abrindo o arquivo");
      try {
        const r = await lerApkg(f, setLendo);
        if (r.cartoes.length === 0) {
          setErro("Não encontrei notas com frente e verso nessa coleção.");
          return;
        }
        const comPasta = r.cartoes.map((c) => ({ ...c, pasta: r.baralho }));
        setData((p) => ({ ...p, flash: [...comPasta, ...(p.flash || [])], pastas: registrarPasta(p.pastas, r.baralho) }));
        setAbertas((a) => ({ ...a, [r.baralho]: true }));
        const mb = r.peso ? ` e ${(r.peso / 1048576).toFixed(1)} MB de imagens` : "";
        notify(`${r.cartoes.length} cartões de "${r.baralho}"${r.imagens ? `, com ${r.imagens} imagens${mb}` : ""}.`);
      } catch (err) {
        setErro((err && err.message) || "Não consegui ler esse arquivo do Anki.");
      } finally { setLendo(""); }
      return;
    }

    const rd = new FileReader();
    rd.onload = () => importar(String(rd.result), f.name);
    rd.onerror = () => setErro("Não consegui ler o arquivo.");
    rd.readAsText(f);
  };

  const resumo = useMemo(() => {
    const r = { novo: 0, aprendendo: 0, firme: 0 };
    for (const c of doBaralho) r[estagio(c)] += 1;
    return r;
  }, [doBaralho]);

  const comecar = () => {
    if (vencidos.length === 0) return notify("Nenhum cartão para hoje.");
    setFila(vencidos.map((c) => c.id));
    setFeitos(0);
    setVirado(false);
    setModo("estudo");
  };

  const atual = fila.length ? cartoes.find((c) => c.id === fila[0]) : null;

  const responder = useCallback((nota) => {
    if (!atual) return;
    const atualizado = reagendar(atual, nota);
    setData((p) => ({
      ...p,
      flash: (p.flash || []).map((c) => (c.id === atual.id ? atualizado : c)),
    }));
    setVirado(false);
    setFeitos((n) => n + 1);
    setFila((f) => {
      const resto = f.slice(1);
      /* errou volta para o fim da fila, para ser visto de novo hoje */
      return nota === "errei" ? [...resto, atual.id] : resto;
    });
  }, [atual, setData]);

  useEffect(() => {
    estudandoCartoes = modo === "estudo";
    return () => { estudandoCartoes = false; };
  }, [modo]);

  useEffect(() => {
    if (modo !== "estudo") return undefined;
    const h = (e) => {
      const el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.code === "Space") { e.preventDefault(); setVirado((v) => !v); return; }
      if (!virado) return;
      const i = ["1", "2", "3", "4"].indexOf(e.key);
      if (i >= 0) responder(NOTAS[i].id);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [modo, virado, responder]);

  const criar = () => {
    if (!novo.frente.trim()) return setErro("Escreva a pergunta.");
    if (!novo.verso.trim()) return setErro("Escreva a resposta.");
    setErro("");
    setData((p) => ({
      ...p,
      flash: [novoCartao(novo.frente.trim(), novo.verso.trim(), novo.subjectId, novo.baralho, novo.pasta), ...(p.flash || [])],
      pastas: registrarPasta(p.pastas, (novo.pasta || "").trim().slice(0, 40)),
    }));
    setNovo((p) => ({ frente: "", verso: "", subjectId: p.subjectId, baralho: p.baralho, pasta: p.pasta }));
    notify("Cartão criado.");
  };

  const apagar = (id) => setData((p) => ({ ...p, flash: (p.flash || []).filter((c) => c.id !== id) }));

  /* ── modo de estudo ─────────────────────────────────────────────── */
  if (modo === "estudo") {
    if (!atual) {
      return (
        <Card className="px-6 py-14 text-center" brilho="var(--ok)">
          <div className="flex justify-center" style={{ color: T.ok }}>
            <span className="flex items-center justify-center rounded-full" style={{ width: 56, height: 56, background: soft("var(--ok)", 16) }}>
              <Check size={26} />
            </span>
          </div>
          <h2 style={{ fontFamily: F_SERIF, fontSize: 25, fontWeight: 400, margin: "18px 0 0", color: T.ink }}>
            Sessão encerrada
          </h2>
          <Label style={{ marginTop: 10 }}>{feitos} resposta{feitos === 1 ? "" : "s"} nesta rodada</Label>
          <div className="mt-7 flex justify-center gap-2 flex-wrap">
            <Btn tone="primary" onClick={() => setModo("painel")}>Voltar ao painel</Btn>
            {vencidos.length ? <Btn onClick={comecar}>Estudar de novo</Btn> : null}
          </div>
        </Card>
      );
    }

    const aula = atual.subjectId ? BY_ID[atual.subjectId] : null;
    return (
      <div className="flex flex-col gap-5">
        <Card className="px-5 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Num size={20} weight={700} color="var(--neon)">{fila.length}</Num>
              <Label>na fila</Label>
              <span style={{ width: 1, height: 18, background: T.line }} />
              <Num size={20} weight={700} color={T.dim}>{feitos}</Num>
              <Label>respondidos</Label>
            </div>
            <Btn size="sm" tone="outline" onClick={() => setModo("painel")}>encerrar</Btn>
          </div>
          <div className="mt-3"><Track pct={(feitos / Math.max(1, feitos + fila.length)) * 100} color="var(--neon)" height={5} /></div>
        </Card>

        {/* o cartão gira em 3D ao ser virado */}
        <div style={{ perspective: 1400 }}>
          <div style={{
            position: "relative", minHeight: 300,
            transformStyle: "preserve-3d",
            transition: "transform .55s cubic-bezier(.2,.8,.2,1)",
            transform: virado ? "rotateY(180deg)" : "rotateY(0deg)",
          }}>
            {[false, true].map((lado) => (
              <div key={String(lado)}
                onClick={() => setVirado((v) => !v)}
                className="rounded-3xl vidro flex flex-col items-center justify-center px-6 sm:px-10 py-12 text-center"
                style={{
                  position: lado ? "absolute" : "relative", inset: lado ? 0 : undefined,
                  minHeight: 300, width: "100%", cursor: "pointer",
                  background: `${T.vidro}, ${T.card}`,
                  border: `1px solid ${lado ? soft("var(--neon)", 40) : T.line}`,
                  backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
                  backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
                  transform: lado ? "rotateY(180deg)" : "none",
                }}>
                {aula ? (
                  <div className="flex items-center gap-2 mb-5">
                    <Chip area={aula.area} small />
                    <Mini>{aula.esp}</Mini>
                  </div>
                ) : null}
                <div style={{ maxWidth: 640, width: "100%" }}>
                  <LadoDoCartao
                    texto={lado ? atual.verso : atual.frente}
                    imagens={lado ? atual.imgVerso : atual.imgFrente}
                    tamanho={lado ? 19 : 22}
                    peso={lado ? 500 : 600}
                    altura={280} />
                </div>
                {!lado ? <Mini style={{ marginTop: 26 }}>toque ou aperte espaço para ver a resposta</Mini> : null}
              </div>
            ))}
          </div>
        </div>

        {virado ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {NOTAS.map((n) => (
              <button key={n.id} type="button" onClick={() => responder(n.id)}
                className="rounded-2xl px-3 py-4 flex flex-col items-center gap-1 nota"
                style={{
                  background: soft(n.cor, 12), border: `1px solid ${soft(n.cor, 36)}`,
                  color: n.cor, cursor: "pointer", "--c": n.cor,
                }}>
                <span style={{ fontSize: 15.5, fontWeight: 700 }}>{n.rotulo}</span>
                <span style={{ fontSize: 12, color: T.faint }}>{n.dica}</span>
                <span style={{ fontFamily: F_MONO, fontSize: 11, color: T.ghost, marginTop: 2 }}>tecla {n.atalho}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex justify-center">
            <Btn tone="primary" onClick={() => setVirado(true)}>Ver a resposta</Btn>
          </div>
        )}
      </div>
    );
  }

  /* ── painel ─────────────────────────────────────────────────────── */
  const lista = doBaralho.filter((c) => {
    if (filtro !== "todos" && estagio(c) !== filtro) return false;
    const t = busca.trim().toLowerCase();
    if (!t) return true;
    const aula = c.subjectId ? BY_ID[c.subjectId] : null;
    return c.frente.toLowerCase().includes(t) || c.verso.toLowerCase().includes(t)
      || (aula && aula.title.toLowerCase().includes(t));
  });

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-6" brilho="var(--neon)" tilt>
        <H color="var(--neon)" icon={<Layers size={16} />}>Seus cartões</H>
        <Texto style={{ marginTop: 8 }}>
          Você escreve a pergunta e a resposta. O intervalo até o cartão voltar
          cresce conforme você acerta, e encolhe quando erra.
        </Texto>

        <div className="mt-6 flex items-center gap-5 flex-wrap">
          <Medidor pct={cartoes.length ? (vencidos.length / cartoes.length) * 100 : 0} cor="var(--neon)" tamanho={92} largura={7}>
            <Num size={24} weight={700} color="var(--neon)">{vencidos.length}</Num>
            <Mini style={{ fontSize: 11 }}>para hoje</Mini>
          </Medidor>
          <div className="flex gap-6 flex-wrap">
            <div><Num size={22} weight={700}>{cartoes.length}</Num><Mini style={{ marginTop: 3 }}>no total</Mini></div>
            <div><Num size={22} weight={700} color="var(--a-GO)">{resumo.novo}</Num><Mini style={{ marginTop: 3 }}>novos</Mini></div>
            <div><Num size={22} weight={700} color="var(--warn)">{resumo.aprendendo}</Num><Mini style={{ marginTop: 3 }}>aprendendo</Mini></div>
            <div><Num size={22} weight={700} color="var(--ok)">{resumo.firme}</Num><Mini style={{ marginTop: 3 }}>firmes</Mini></div>
          </div>
        </div>

        <div className="mt-6 flex gap-2 flex-wrap">
          <Btn tone="primary" onClick={comecar} disabled={vencidos.length === 0}>
            <Play size={15} /> Estudar {vencidos.length ? `(${vencidos.length})` : ""}
          </Btn>
          <Btn onClick={() => setModo(modo === "criar" ? "painel" : "criar")}>
            <Plus size={15} /> Novo cartão
          </Btn>
          <Btn onClick={() => setModo(modo === "importar" ? "painel" : "importar")}>
            <Upload size={15} /> Trazer baralho
          </Btn>
        </div>

        {cartoes.length || (data.pastas || []).length ? (
          <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Label>Pastas e baralhos</Label>
              <div className="flex gap-2 items-center">
                <TextInput value={novaPasta} placeholder="Nova pasta"
                  onChange={(e) => setNovaPasta(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") criarPasta(); }}
                  style={{ width: 170, padding: "8px 12px", fontSize: 14 }} />
                <Btn size="sm" onClick={criarPasta}><Plus size={14} /> Criar pasta</Btn>
              </div>
            </div>

            <button type="button" onClick={() => { setPastaAtiva("todas"); setBaralhoAtivo("todos"); }}
              className="rounded-full px-4 py-2 mt-4 brilhar"
              style={{
                background: pastaAtiva === "todas" && baralhoAtivo === "todos" ? T.card3 : "transparent",
                border: `1px solid ${T.line}`, color: T.ink, fontSize: 13.5, cursor: "pointer",
              }}>Ver tudo</button>

            <div className="flex flex-col gap-2 mt-3">
              {pastas.map((p) => {
                const aberta = abertas[p.nome] !== false && (abertas[p.nome] || pastaAtiva === p.nome || pastas.length <= 3);
                const editandoPasta = renomeando && renomeando.tipo === "pasta" && renomeando.nome === p.nome;
                const confirmaPasta = confirmando && confirmando.tipo === "pasta" && confirmando.nome === p.nome;
                const selPasta = pastaAtiva === p.nome && baralhoAtivo === "todos";
                return (
                  <div key={p.nome} className="rounded-2xl"
                    style={{
                      border: `1px solid ${selPasta ? soft("var(--neon)", 45) : T.line}`,
                      background: T.card2,
                      boxShadow: selPasta ? `0 0 24px -14px var(--neon)` : "none",
                    }}>
                    <div className="flex items-center gap-2 px-4 py-3">
                      <button type="button" aria-label={aberta ? "Fechar pasta" : "Abrir pasta"}
                        onClick={() => setAbertas((a) => ({ ...a, [p.nome]: !aberta }))}
                        className="flex items-center justify-center"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                        <ChevronDown size={15} style={{ color: T.faint, transform: aberta ? "none" : "rotate(-90deg)", transition: "transform .2s" }} />
                      </button>
                      {editandoPasta ? (
                        <div className="flex gap-2 items-center flex-1 flex-wrap">
                          <TextInput value={novoNome} autoFocus
                            onChange={(e) => setNovoNome(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") renomear(); if (e.key === "Escape") setRenomeando(null); }}
                            style={{ padding: "7px 11px", fontSize: 14, flex: 1, minWidth: 140 }} />
                          <Btn size="sm" tone="primary" onClick={renomear}>Salvar</Btn>
                          <Btn size="sm" tone="outline" onClick={() => setRenomeando(null)}>cancelar</Btn>
                        </div>
                      ) : (
                        <>
                          {/* clicar no nome filtra a lista por esta pasta */}
                          <button type="button"
                            onClick={() => {
                              setBaralhoAtivo("todos");
                              setPastaAtiva(selPasta ? "todas" : p.nome);
                            }}
                            className="flex items-center gap-2.5 flex-1 min-w-0"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                            <Layers size={15} style={{ color: p.nome === PASTA_SOLTA ? T.ghost : "var(--neon)", flexShrink: 0 }} />
                            <span style={{ fontSize: 15, fontWeight: selPasta ? 700 : 600, color: selPasta ? "var(--neon)" : T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
                            <Mini style={{ flexShrink: 0 }}>
                              {p.baralhos.length
                                ? `${p.baralhos.length} baralho${p.baralhos.length === 1 ? "" : "s"} · ${p.total} cartõe${p.total === 1 ? "" : "s"}`
                                : "vazia"}
                            </Mini>
                            {p.hoje ? (
                              <span style={{ fontFamily: F_MONO, fontSize: 10.5, background: soft("var(--warn)", 20), color: T.warn, borderRadius: 99, padding: "1px 7px", flexShrink: 0 }}>
                                {p.hoje} hoje
                              </span>
                            ) : null}
                          </button>
                          {p.nome !== PASTA_SOLTA ? (
                            <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                              <button type="button" aria-label="Renomear pasta" title="Renomear"
                                onClick={() => { setRenomeando({ tipo: "pasta", nome: p.nome }); setNovoNome(p.nome); }}
                                style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer", padding: 4 }}>
                                <Settings2 size={14} />
                              </button>
                              <button type="button" aria-label="Desfazer pasta" title="Desfazer a pasta"
                                onClick={() => setConfirmando(confirmaPasta ? null : { tipo: "pasta", nome: p.nome })}
                                style={{ background: "none", border: "none", color: confirmaPasta ? T.bad : T.ghost, cursor: "pointer", padding: 4 }}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>

                    {confirmaPasta ? (
                      <div className="px-4 pb-3 flex items-center gap-2.5 flex-wrap">
                        <Mini style={{ color: T.bad }}>
                          Desfazer a pasta? Os {p.baralhos.length} baralho{p.baralhos.length === 1 ? "" : "s"} voltam
                          para “{PASTA_SOLTA}”. Nenhum cartão é apagado.
                        </Mini>
                        <Btn size="sm" tone="danger" onClick={() => apagarPasta(p.nome)}>Desfazer</Btn>
                        <Btn size="sm" tone="outline" onClick={() => setConfirmando(null)}>cancelar</Btn>
                      </div>
                    ) : null}

                    {aberta ? (
                      <div className="px-4 pb-3 flex flex-col gap-1.5">
                        {p.baralhos.length === 0 ? (
                          <Mini style={{ padding: "6px 0 4px" }}>
                            Pasta vazia. Use o seletor “mover” de um baralho para trazê-lo para cá.
                          </Mini>
                        ) : p.baralhos.map((b) => {
                          const sel = baralhoAtivo === b.nome && pastaAtiva === p.nome;
                          const editandoB = renomeando && renomeando.tipo === "baralho"
                            && renomeando.nome === b.nome && renomeando.pasta === p.nome;
                          const confirmaB = confirmando && confirmando.tipo === "baralho"
                            && confirmando.nome === b.nome && confirmando.pasta === p.nome;
                          return (
                            <div key={b.nome} className="rounded-xl"
                              style={{ background: sel ? soft("var(--neon)", 14) : "transparent", border: `1px solid ${sel ? soft("var(--neon)", 40) : T.line}` }}>
                              <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
                                {editandoB ? (
                                  <>
                                    <TextInput value={novoNome} autoFocus
                                      onChange={(e) => setNovoNome(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === "Enter") renomear(); if (e.key === "Escape") setRenomeando(null); }}
                                      style={{ padding: "6px 10px", fontSize: 13.5, flex: 1, minWidth: 130 }} />
                                    <Btn size="sm" tone="primary" onClick={renomear}>Salvar</Btn>
                                    <Btn size="sm" tone="outline" onClick={() => setRenomeando(null)}>cancelar</Btn>
                                  </>
                                ) : (
                                  <>
                                    <button type="button"
                                      onClick={() => { setPastaAtiva(p.nome); setBaralhoAtivo(sel ? "todos" : b.nome); }}
                                      className="flex-1 min-w-0 flex items-center gap-2"
                                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                                      <span style={{ fontSize: 14, fontWeight: sel ? 700 : 500, color: sel ? "var(--neon)" : T.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nome}</span>
                                      <span style={{ fontFamily: F_MONO, fontSize: 11, color: b.hoje ? T.warn : T.ghost, flexShrink: 0 }}>
                                        {b.hoje ? `${b.hoje} hoje` : b.total}
                                      </span>
                                    </button>
                                    <label className="flex items-center gap-1.5" style={{ flexShrink: 0 }} title="Mover para outra pasta">
                                      <span style={{ fontSize: 11, color: T.ghost }}>mover</span>
                                      <select value={p.nome}
                                        onChange={(e) => moverBaralho(b.nome, p.nome, e.target.value)}
                                        style={{
                                          background: T.card2, border: `1px solid ${T.line}`, color: T.dim,
                                          borderRadius: 5, fontSize: 12, padding: "4px 6px", cursor: "pointer", maxWidth: 140,
                                        }}>
                                        {nomesDePasta.map((n) => <option key={n} value={n}>{n}</option>)}
                                      </select>
                                    </label>
                                    <button type="button" aria-label="Renomear baralho" title="Renomear"
                                      onClick={() => { setRenomeando({ tipo: "baralho", nome: b.nome, pasta: p.nome }); setNovoNome(b.nome); }}
                                      style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer", padding: 4, flexShrink: 0 }}>
                                      <Settings2 size={13} />
                                    </button>
                                    <button type="button" aria-label="Apagar baralho" title="Apagar o baralho"
                                      onClick={() => setConfirmando(confirmaB ? null : { tipo: "baralho", nome: b.nome, pasta: p.nome })}
                                      style={{ background: "none", border: "none", color: confirmaB ? T.bad : T.ghost, cursor: "pointer", padding: 4, flexShrink: 0 }}>
                                      <Trash2 size={13} />
                                    </button>
                                  </>
                                )}
                              </div>
                              {confirmaB ? (
                                <div className="px-3 pb-2.5 flex items-center gap-2.5 flex-wrap">
                                  <Mini style={{ color: T.bad }}>
                                    Apagar “{b.nome}” e os {b.total} cartõe{b.total === 1 ? "" : "s"} dentro dele?
                                  </Mini>
                                  <Btn size="sm" tone="danger" onClick={() => apagarBaralho(b.nome, p.nome)}>Apagar</Btn>
                                  <Btn size="sm" tone="outline" onClick={() => setConfirmando(null)}>cancelar</Btn>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Card>

      {modo === "importar" ? (
        <Card className="px-6 py-6" brilho="var(--neon)">
          <H size={18} color="var(--neon)" icon={<Upload size={16} />}>Trazer seus baralhos</H>
          <Texto style={{ marginTop: 10 }}>
            Duas colunas por linha: a pergunta e a resposta. Uma terceira coluna,
            se existir, vira o nome do baralho. Serve arquivo separado por
            tabulação, ponto e vírgula ou vírgula.
          </Texto>

          <div className="mt-5 flex flex-wrap gap-2">
            <Btn tone="primary" disabled={!!lendo} onClick={() => arquivoRef.current && arquivoRef.current.click()}>
              <Upload size={15} /> {lendo ? "Lendo…" : "Escolher arquivo"}
            </Btn>
            <input ref={arquivoRef} type="file" accept=".apkg,.txt,.csv,.tsv,text/plain,text/csv"
              onChange={arquivoEscolhido} style={{ display: "none" }} />
            <Btn tone="outline" onClick={() => setModo("painel")}>fechar</Btn>
          </div>

          <div className="mt-5">
            <Field label="Ou cole aqui">
              <Area value={colado} placeholder={"Tríade da síndrome nefrítica\tHematúria, hipertensão e edema\nTratamento da crise asmática\tBeta-2 de curta + corticoide"}
                onChange={(e) => setColado(e.target.value)} style={{ minHeight: 130, fontFamily: F_MONO, fontSize: 13.5 }} />
            </Field>
            <div className="mt-3 flex flex-wrap gap-3 items-end">
              <div style={{ flex: 1, minWidth: 200 }}>
                <Field label="Nome do baralho">
                  <TextInput value={nomeImport} placeholder="Ex.: Cardiologia"
                    onChange={(e) => setNomeImport(e.target.value)} />
                </Field>
              </div>
              <Btn onClick={() => importar(colado, nomeImport)} disabled={!colado.trim()}>
                Importar o texto
              </Btn>
            </div>
          </div>

          {lendo ? (
            <div className="mt-4 rounded-2xl px-4 py-3 breathe" style={{ background: soft("var(--neon)", 12), border: `1px solid ${T.line}` }}>
              <Mini style={{ color: T.ink }}>{lendo}…</Mini>
            </div>
          ) : null}
          {erro ? <Label style={{ marginTop: 14, color: T.bad, textTransform: "none", letterSpacing: 0, fontSize: 14, lineHeight: 1.6 }}>{erro}</Label> : null}

          <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
            <Label>Vindo do Anki</Label>
            <Mini style={{ marginTop: 8, lineHeight: 1.7 }}>
              O arquivo .apkg entra direto, com as imagens junto. Na hora de
              exportar no Anki, marque a opção de compatibilidade com versões
              antigas, porque o formato mais novo vem compactado de um jeito que
              o navegador não abre. Exportações em texto simples também servem.
            </Mini>
          </div>
        </Card>
      ) : null}

      {modo === "criar" ? (
        <Card className="px-6 py-6" brilho="var(--neon2)">
          <H size={18} color="var(--neon2)" icon={<Plus size={16} />}>Criar cartão</H>
          <div className="mt-5 flex flex-col gap-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Pasta">
                <TextInput value={novo.pasta || ""} placeholder="Ex.: Clínica"
                  onChange={(e) => setNovo((p) => ({ ...p, pasta: e.target.value }))} />
              </Field>
              <Field label="Baralho">
                <TextInput value={novo.baralho} placeholder="Ex.: Cardiologia"
                  onChange={(e) => setNovo((p) => ({ ...p, baralho: e.target.value }))} />
              </Field>
            </div>
            <Field label="Aula do cronograma (opcional)">
              <SubjectPicker value={novo.subjectId} onChange={(v) => setNovo((p) => ({ ...p, subjectId: v }))} />
            </Field>
            <Field label="Frente, a pergunta">
              <Area value={novo.frente} placeholder="Ex.: Tríade da síndrome nefrítica"
                onChange={(e) => setNovo((p) => ({ ...p, frente: e.target.value }))} style={{ minHeight: 80 }} />
            </Field>
            <Field label="Verso, a resposta">
              <Area value={novo.verso} placeholder="Ex.: hematúria, hipertensão e edema"
                onChange={(e) => setNovo((p) => ({ ...p, verso: e.target.value }))} style={{ minHeight: 110 }} />
            </Field>
            <div className="flex items-center gap-3 flex-wrap">
              <Btn tone="primary" onClick={criar}>Criar cartão</Btn>
              <Btn tone="outline" onClick={() => setModo("painel")}>fechar</Btn>
              {erro ? <span style={{ fontSize: 14, color: T.bad }}>{erro}</span> : null}
              <Mini>a aula fica guardada para o próximo cartão</Mini>
            </div>
          </div>
        </Card>
      ) : null}

      {cartoes.length === 0 ? (
        <Card>
          <Blank icon={<Layers size={26} />} title="Nenhum cartão ainda"
            hint="Escreva um cartão logo depois de assistir a aula, enquanto o assunto está fresco." />
        </Card>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 rounded-full px-4 flex-1" style={{ background: T.card, border: `1px solid ${T.line}` }}>
              <Search size={15} style={{ color: T.faint }} />
              <input value={busca} placeholder="Buscar nos seus cartões" onChange={(e) => setBusca(e.target.value)}
                style={{ ...inp, background: "transparent", border: "none", padding: "11px 0", borderRadius: 0 }} />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[["todos", "Todos"], ["novo", "Novos"], ["aprendendo", "Aprendendo"], ["firme", "Firmes"]].map(([id, lb]) => (
                <button key={id} type="button" onClick={() => setFiltro(id)} className="rounded-full px-4 py-2 whitespace-nowrap"
                  style={{
                    background: filtro === id ? T.card3 : T.card, border: `1px solid ${T.line}`,
                    color: filtro === id ? T.ink : T.dim, fontSize: 14,
                    fontWeight: filtro === id ? 700 : 500, cursor: "pointer",
                  }}>{lb}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {lista.map((c) => {
              const aula = c.subjectId ? BY_ID[c.subjectId] : null;
              const venceu = (c.prox || today) <= today;
              const e = estagio(c);
              return (
                <Card key={c.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span style={{
                      width: 3, alignSelf: "stretch", borderRadius: 3, flexShrink: 0,
                      background: e === "firme" ? T.ok : e === "aprendendo" ? T.warn : "var(--a-GO)",
                    }} />
                    <div className="flex-1 min-w-0">
                      <LadoDoCartao texto={c.frente} imagens={c.imgFrente} tamanho={15} peso={600} altura={120} />
                      <div style={{ marginTop: 4, opacity: 0.75 }}>
                        <LadoDoCartao texto={c.verso} imagens={c.imgVerso} tamanho={14} peso={500} altura={120} />
                      </div>
                      <Mini style={{ marginTop: 6 }}>
                        {c.baralho && c.baralho !== BARALHO_PADRAO ? `${c.baralho} · ` : ""}
                        {aula ? `${aula.title} · ` : ""}
                        {venceu ? "para hoje" : `volta em ${brDate(c.prox)}`}
                        {c.revisoes ? ` · ${c.revisoes} revisõe${c.revisoes === 1 ? "m" : "s"}` : ""}
                        {c.lapsos ? ` · ${c.lapsos} erro${c.lapsos === 1 ? "" : "s"}` : ""}
                      </Mini>
                    </div>
                    <button type="button" aria-label="Excluir cartão" onClick={() => apagar(c.id)}
                      style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer", flexShrink: 0 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </Card>
              );
            })}
            {lista.length === 0 ? (
              <Card><Blank icon={<Search size={22} />} title="Nada neste filtro" hint="Tente outra busca." /></Card>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
