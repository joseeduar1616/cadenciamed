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

/* ── ajustes de cada baralho ──────────────────────────────────────────
 *
 * Ficam em data.baralhoCfg, com a pasta na chave: dois baralhos de mesmo
 * nome em pastas diferentes são baralhos diferentes.
 */
const CFG_PADRAO = { embaralhar: true, min: 0, max: 0 };
const chaveBaralho = (pasta, baralho) =>
  `${pasta || PASTA_SOLTA}|${baralho || BARALHO_PADRAO}`;
const lerCfg = (cfgs, chave) => ({ ...CFG_PADRAO, ...((cfgs || {})[chave] || {}) });

/* Embaralhar de verdade (Fisher-Yates). Um sort com Math.random() parece
   fazer isso, mas distribui torto e ainda depende do algoritmo do
   navegador. */
function baralhar(lista) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* A fila de um baralho, já com os ajustes dele aplicados.
 *
 * O mínimo adianta os cartões que vencem mais cedo, para um dia fraco não
 * ficar curto demais; eles entram no fim, depois dos que já venceram. O
 * máximo corta o excesso, para um dia pesado não virar desistência. */
function filaDoBaralho(lista, hoje, cfg) {
  const vencidos = lista.filter((c) => (c.prox || hoje) <= hoje);
  let fila = cfg.embaralhar ? baralhar(vencidos) : vencidos.slice();

  if (cfg.min > 0 && fila.length < cfg.min) {
    const adiantar = lista
      .filter((c) => (c.prox || hoje) > hoje)
      .sort((a, b) => String(a.prox || "").localeCompare(String(b.prox || "")))
      .slice(0, cfg.min - fila.length);
    fila = fila.concat(cfg.embaralhar ? baralhar(adiantar) : adiantar);
  }
  if (cfg.max > 0 && fila.length > cfg.max) fila = fila.slice(0, cfg.max);
  return fila;
}

/* Renomear ou mover um baralho muda a chave dele. Sem levar o ajuste junto,
   o embaralhar e os limites voltariam ao padrão calados, e a pessoa só
   perceberia dias depois, estudando demais ou de menos. */
function moverCfg(cfgs, mudar) {
  const fora = {};
  for (const [k, v] of Object.entries(cfgs || {})) {
    const [pasta, baralho] = k.split("|");
    const novo = mudar(pasta, baralho);
    fora[novo ? chaveBaralho(novo.pasta, novo.baralho) : k] = v;
  }
  return fora;
}

/* Estudando mais de um baralho de uma vez, cada um entra com os próprios
   ajustes, um depois do outro. Misturar tudo num embaralhamento só
   desrespeitaria quem desligou o embaralhar no baralho dele. */
function filaDeVarios(cartoes, hoje, cfgs) {
  const grupos = new Map();
  for (const c of cartoes) {
    const k = chaveBaralho(c.pasta, c.baralho);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(c);
  }
  const fora = [];
  for (const [k, lista] of grupos) {
    for (const c of filaDoBaralho(lista, hoje, lerCfg(cfgs, k))) fora.push(c);
  }
  return fora;
}

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

/* ── baralhos publicados ──────────────────────────────────────────────
 *
 * O dono publica um baralho dele; quem assina copia para a própria conta.
 * É cópia, não pasta compartilhada, e de propósito: duas pessoas estudando
 * o mesmo cartão têm intervalos de revisão diferentes.
 *
 * A senha do assunto é o servidor: publicar é só do dono, baixar é só de
 * quem tem plano em dia, e a rota confere as duas coisas. Aqui é só a tela.
 */
const ROTA_BARALHOS = "/api/baralhos";

async function falarComBaralhos(nuvem, corpo) {
  let token = "";
  try {
    if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
      token = await nuvem.sdk.auth.currentUser.getIdToken();
    }
  } catch (e) { /* segue sem token, o servidor recusa */ }
  if (!token) return { erro: "Entre na sua conta para ver os baralhos publicados." };
  const { dados, erro } = await chamarApi(ROTA_BARALHOS, { ...corpo, token }, "Os baralhos publicados");
  return erro ? { erro } : dados;
}

function Publicados({ nuvem, souDono, setData, notify, publicados, recarregar }) {
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState("");

  const baixar = async (b) => {
    setOcupado(b.slug); setErro("");
    const j = await falarComBaralhos(refNuvem.current, { acao: "baixar", slug: b.slug });
    setOcupado("");
    if (j.erro) { setErro(j.erro); return; }

    const pasta = (j.pasta || PASTA_SOLTA).slice(0, 40);
    const nome = (j.nome || BARALHO_PADRAO).slice(0, 40);
    /* Vindo uma pasta, cada cartão traz o baralho dele e a divisão é
       recriada; vindo um baralho só, todos entram nele. */
    const novos = (j.cartoes || []).map((c) => novoCartao(
      c.frente, c.verso, c.subjectId,
      j.tipo === "pasta" ? (c.baralho || BARALHO_PADRAO) : nome,
      pasta));
    if (!novos.length) { setErro("Isso veio vazio."); return; }

    setData((p) => ({
      ...p,
      flash: [...novos, ...(p.flash || [])],
      pastas: registrarPasta(p.pastas, pasta),
    }));
    notify(`${novos.length} cartõe${novos.length === 1 ? "" : "s"} copiado${novos.length === 1 ? "" : "s"} para "${j.tipo === "pasta" ? pasta : nome}".`);
  };

  const despublicar = async (b) => {
    setOcupado(b.slug); setErro("");
    const j = await falarComBaralhos(refNuvem.current, { acao: "despublicar", slug: b.slug });
    setOcupado("");
    if (j.erro) { setErro(j.erro); return; }
    notify(j.mensagem || "Baralho tirado do ar.");
    recarregar();
  };

  if (!publicados) return null;
  if (publicados.precisaPlano) {
    return (
      <Card className="px-6 py-5" flat>
        <Mini style={{ lineHeight: 1.7 }}>
          Baralhos prontos, montados por quem cuida do site, fazem parte do
          plano completo.
        </Mini>
      </Card>
    );
  }
  if (!publicados.lista.length) return null;

  return (
    <Card className="px-6 py-6" brilho="var(--ok)">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <H size={18} color="var(--ok)" icon={<Download size={16} />}>Baralhos prontos</H>
        <Btn size="sm" tone="outline" onClick={recarregar}><RefreshCw size={13} /> atualizar</Btn>
      </div>
      <Texto style={{ marginTop: 10 }}>
        Copie para a sua conta e eles viram seus: o agendamento das revisões
        passa a ser o seu, e mexer neles não muda nada para mais ninguém.
      </Texto>

      <div className="mt-5 flex flex-col gap-2">
        {publicados.lista.map((b) => (
          <div key={b.slug} className="flex items-center gap-3 rounded-2xl px-4 py-3 flex-wrap"
            style={{ background: T.card2 }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                <span style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>{b.nome}</span>
                {b.tipo === "pasta" ? (
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: "var(--neon2)",
                    background: soft("var(--neon2)", 16), padding: "2px 8px", borderRadius: 99,
                  }}>pasta</span>
                ) : null}
              </div>
              <Mini style={{ marginTop: 2 }}>
                {b.tipo !== "pasta" && b.pasta && b.pasta !== PASTA_SOLTA ? `${b.pasta} · ` : ""}
                {b.total} cartõe{b.total === 1 ? "" : "s"}
                {b.tipo === "pasta" && b.baralhos ? ` em ${b.baralhos} baralho${b.baralhos === 1 ? "" : "s"}` : ""}
              </Mini>
            </div>
            <Btn size="sm" tone="primary" disabled={!!ocupado} onClick={() => baixar(b)}>
              {ocupado === b.slug ? "…" : "copiar"}
            </Btn>
            {souDono ? (
              <Btn size="sm" tone="danger" disabled={!!ocupado} onClick={() => despublicar(b)}>
                tirar do ar
              </Btn>
            ) : null}
          </div>
        ))}
      </div>
      {erro ? <Label style={{ marginTop: 12, color: T.bad, textTransform: "none", letterSpacing: 0, fontSize: 14 }}>{erro}</Label> : null}
    </Card>
  );
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

function Cartoes({ data, setData, subjects, today, notify, nuvem, souDono }) {
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
  const [ajustando, setAjustando] = useState(null);     // {nome, pasta}
  const [confirmando, setConfirmando] = useState(null); // {tipo, nome, pasta}
  const [novoNome, setNovoNome] = useState("");
  const [novaPasta, setNovaPasta] = useState("");
  const [colado, setColado] = useState("");
  const [nomeImport, setNomeImport] = useState("");
  const arquivoRef = useRef(null);
  const [lendo, setLendo] = useState("");

  const cartoes = data.flash || [];

  /* O que está publicado. null = ainda não perguntou; a lista é carregada
     uma vez ao abrir a aba, e não a cada digitação na busca. */
  const [publicados, setPublicados] = useState(null);
  const [publicando, setPublicando] = useState("");

  /* Pela referência, e não pela dependência: o objeto da nuvem já é estável,
     mas depender dele aqui foi o que fez a lista se recarregar em laço. */
  const refNuvem = useRef(nuvem);
  refNuvem.current = nuvem;
  const quem = nuvem && nuvem.usuario ? nuvem.usuario.uid : "";

  const carregarPublicados = useCallback(async () => {
    if (!quem) { setPublicados(null); return; }
    const j = await falarComBaralhos(refNuvem.current, { acao: "listar" });
    if (j.erro) { setPublicados(null); return; }
    setPublicados({ lista: j.baralhos || [], precisaPlano: !!j.precisaPlano });
  }, [quem]);

  useEffect(() => { carregarPublicados(); }, [carregarPublicados]);

  /* Sem baralho, publica a pasta inteira: todos os cartões dela, cada um
     levando o baralho a que pertence. */
  const publicar = useCallback(async (pasta, baralho) => {
    const ehPasta = !baralho;
    setPublicando(ehPasta ? `pasta|${pasta}` : chaveBaralho(pasta, baralho));
    const escolhidos = (data.flash || []).filter((c) => (
      (c.pasta || PASTA_SOLTA) === pasta
      && (ehPasta || (c.baralho || BARALHO_PADRAO) === baralho)));
    const j = await falarComBaralhos(refNuvem.current, {
      acao: "publicar",
      tipo: ehPasta ? "pasta" : "baralho",
      pasta,
      baralho: baralho || "",
      cartoes: escolhidos.map((c) => ({ ...c, baralho: c.baralho || BARALHO_PADRAO })),
    });
    setPublicando("");
    if (j.erro) { notify(j.erro); return; }
    notify(j.mensagem || "Publicado.");
    carregarPublicados();
  }, [data.flash, nuvem, notify, carregarPublicados]);

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
      const cfgs = moverCfg(p.baralhoCfg, (pasta, baralho) => {
        if (alvo.tipo === "pasta" && pasta === alvo.nome) return { pasta: nome, baralho };
        if (alvo.tipo === "baralho" && baralho === alvo.nome && pasta === alvo.pasta) {
          return { pasta, baralho: nome };
        }
        return null;
      });
      return { ...p, flash, pastas: pastasSalvas, baralhoCfg: cfgs };
    });
    if (alvo.tipo === "pasta") {
      if (pastaAtiva === alvo.nome) setPastaAtiva(nome);
      setAbertas((a) => ({ ...a, [nome]: true }));
    } else if (baralhoAtivo === alvo.nome) setBaralhoAtivo(nome);
    setRenomeando(null); setNovoNome("");
    notify("Nome alterado.");
  }, [renomeando, novoNome, setData, notify, pastaAtiva, baralhoAtivo]);

  const mudarCfg = useCallback((pasta, baralho, campo, valor) => {
    const k = chaveBaralho(pasta, baralho);
    setData((p) => ({
      ...p,
      baralhoCfg: { ...(p.baralhoCfg || {}), [k]: { ...lerCfg(p.baralhoCfg, k), [campo]: valor } },
    }));
  }, [setData]);

  const moverBaralho = useCallback((baralho, dePasta, paraPasta) => {
    if (dePasta === paraPasta) return;
    setData((p) => ({
      ...p,
      flash: (p.flash || []).map((c) => (
        (c.baralho || BARALHO_PADRAO) === baralho && (c.pasta || PASTA_SOLTA) === dePasta
          ? { ...c, pasta: paraPasta } : c
      )),
      pastas: registrarPasta(p.pastas, paraPasta),
      baralhoCfg: moverCfg(p.baralhoCfg, (pasta, b) => (
        b === baralho && pasta === dePasta ? { pasta: paraPasta, baralho: b } : null)),
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
      baralhoCfg: moverCfg(p.baralhoCfg, (pasta, b) => (
        pasta === nome ? { pasta: PASTA_SOLTA, baralho: b } : null)),
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
      baralhoCfg: Object.fromEntries(Object.entries(p.baralhoCfg || {})
        .filter(([k]) => k !== chaveBaralho(pasta, baralho))),
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

  /* Sem escopo, estuda o que estiver filtrado na tela; com escopo, estuda um
     baralho só — que é o botão de play na linha de cada baralho. */
  const comecar = (escopo) => {
    const lista = escopo
      ? cartoes.filter((c) => (c.pasta || PASTA_SOLTA) === escopo.pasta
        && (c.baralho || BARALHO_PADRAO) === escopo.baralho)
      : doBaralho;

    const nova = filaDeVarios(lista, today, data.baralhoCfg);
    if (nova.length === 0) {
      return notify(escopo
        ? `Nada para hoje em "${escopo.baralho}".`
        : "Nenhum cartão para hoje.");
    }
    if (escopo) { setPastaAtiva(escopo.pasta); setBaralhoAtivo(escopo.baralho); }
    setFila(nova.map((c) => c.id));
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
            {vencidos.length ? <Btn onClick={() => comecar()}>Estudar de novo</Btn> : null}
          </div>
        </Card>
      );
    }

    const aula = atual.subjectId ? BY_ID[atual.subjectId] : null;

    /* Tela cheia de verdade: por cima de tudo, sem o cabeçalho, o menu e o
       rodapé disputando espaço com o cartão. Era isso que deixava uma coisa
       em cima da outra, principalmente no celular.

       A altura usa dvh, e não vh: no celular a barra do navegador some e
       aparece durante a rolagem, e com vh o rodapé de botões ficava
       escondido atrás dela justamente na hora de responder. */
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: T.bg, display: "flex", flexDirection: "column",
        height: "100dvh", maxHeight: "100dvh",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {/* ── barra de cima ─────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6"
            style={{ height: 56 }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <Num size={19} weight={700} color="var(--neon)">{fila.length}</Num>
              <Label>na fila</Label>
              <span style={{ width: 1, height: 16, background: T.line, flexShrink: 0 }} />
              <Num size={19} weight={700} color={T.dim}>{feitos}</Num>
              <Label>feitos</Label>
            </div>
            <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
              <Mini style={{ display: "none" }} className="sm:inline">
                {baralhoAtivo === "todos" ? "" : baralhoAtivo}
              </Mini>
              <button type="button" aria-label="Encerrar o estudo"
                onClick={() => setModo("painel")}
                className="flex items-center justify-center rounded-full brilhar"
                style={{
                  width: 38, height: 38, background: T.card2,
                  border: `1px solid ${T.line}`, color: T.dim, cursor: "pointer",
                }}>
                <X size={17} />
              </button>
            </div>
          </div>
          <Track pct={(feitos / Math.max(1, feitos + fila.length)) * 100} color="var(--neon)" height={3} />
        </div>

        {/* ── o cartão ──────────────────────────────────────────────── */}
        <div onClick={() => setVirado((v) => !v)}
          style={{
            flex: 1, minHeight: 0, overflowY: "auto", cursor: "pointer",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "28px 20px",
          }}>
          <div style={{ width: "100%", maxWidth: 760, textAlign: "center" }}>
            {aula ? (
              <div className="flex items-center justify-center gap-2" style={{ marginBottom: 22 }}>
                <Chip area={aula.area} small />
                <Mini>{aula.esp}</Mini>
              </div>
            ) : null}

            {/* A pergunta continua visível junto da resposta: some ela e a
                pessoa responde sem lembrar o que foi perguntado. */}
            <LadoDoCartao
              texto={atual.frente}
              imagens={atual.imgFrente}
              tamanho={virado ? "clamp(17px, 3vw, 21px)" : "clamp(22px, 4.4vw, 34px)"}
              peso={virado ? 500 : 650}
              altura={virado ? 200 : 320} />

            {virado ? (
              <>
                <div style={{
                  height: 1, background: T.line, margin: "26px auto",
                  maxWidth: 220,
                }} />
                <LadoDoCartao
                  texto={atual.verso}
                  imagens={atual.imgVerso}
                  tamanho="clamp(19px, 3.6vw, 27px)"
                  peso={550}
                  altura={340} />
              </>
            ) : (
              <Mini style={{ marginTop: 34, display: "block" }}>
                toque em qualquer lugar, ou aperte espaço, para ver a resposta
              </Mini>
            )}
          </div>
        </div>

        {/* ── as respostas ──────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0, borderTop: `1px solid ${T.line}`,
          padding: "14px 16px 18px", background: T.bg2,
        }}>
          {virado ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
              style={{ maxWidth: 760, margin: "0 auto" }}>
              {NOTAS.map((n) => (
                <button key={n.id} type="button" onClick={() => responder(n.id)}
                  className="rounded-2xl px-3 py-3 flex flex-col items-center gap-0.5 nota"
                  style={{
                    background: soft(n.cor, 12), border: `1px solid ${soft(n.cor, 36)}`,
                    color: n.cor, cursor: "pointer", "--c": n.cor,
                  }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{n.rotulo}</span>
                  <span style={{ fontSize: 11.5, color: T.faint }}>{n.dica}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex justify-center">
              <Btn tone="primary" onClick={() => setVirado(true)}>Ver a resposta</Btn>
            </div>
          )}
        </div>
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
          <Btn tone="primary" onClick={() => comecar()} disabled={vencidos.length === 0}>
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
                              {souDono && p.total ? (
                                <button type="button" aria-label={`Publicar a pasta ${p.nome}`}
                                  title="Publicar a pasta inteira, com os baralhos de dentro"
                                  onClick={() => publicar(p.nome)}
                                  disabled={publicando === `pasta|${p.nome}`}
                                  className="toque rounded-full px-3"
                                  style={{
                                    background: soft("var(--ok)", 12), border: `1px solid ${soft("var(--ok)", 32)}`,
                                    color: T.ok, fontSize: 12.5, fontWeight: 600, cursor: "pointer", minHeight: 28,
                                  }}>
                                  {publicando === `pasta|${p.nome}` ? "…" : "publicar"}
                                </button>
                              ) : null}
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
                          const abertoB = ajustando && ajustando.nome === b.nome && ajustando.pasta === p.nome;
                          const cfg = lerCfg(data.baralhoCfg, chaveBaralho(p.nome, b.nome));
                          const mudou = !cfg.embaralhar || cfg.min > 0 || cfg.max > 0;
                          return (
                            <div key={b.nome} className="rounded-xl"
                              style={{ background: sel ? soft("var(--neon)", 14) : "transparent", border: `1px solid ${sel ? soft("var(--neon)", 40) : T.line}` }}>
                              {/* A linha ficou com o essencial: o nome, estudar
                                  e a engrenagem. Mover, renomear e apagar
                                  desceram para o painel, porque cinco controles
                                  lado a lado não cabiam na largura do celular. */}
                              <div className="flex items-center gap-2 px-3 py-2">
                                <button type="button"
                                  onClick={() => { setPastaAtiva(p.nome); setBaralhoAtivo(sel ? "todos" : b.nome); }}
                                  className="flex-1 min-w-0 flex items-center gap-2"
                                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                                  <span style={{ fontSize: 14.5, fontWeight: sel ? 700 : 500, color: sel ? "var(--neon)" : T.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nome}</span>
                                  <span style={{ fontFamily: F_MONO, fontSize: 11, color: b.hoje ? T.warn : T.ghost, flexShrink: 0 }}>
                                    {b.hoje ? `${b.hoje} hoje` : b.total}
                                  </span>
                                </button>

                                <button type="button" aria-label={`Estudar ${b.nome}`} title="Estudar só este baralho"
                                  onClick={() => comecar({ pasta: p.nome, baralho: b.nome })}
                                  className="flex items-center justify-center rounded-full brilhar"
                                  style={{
                                    width: 30, height: 30, flexShrink: 0, cursor: "pointer",
                                    background: b.hoje ? soft("var(--neon)", 16) : "transparent",
                                    border: `1px solid ${b.hoje ? soft("var(--neon)", 40) : T.line}`,
                                    color: b.hoje ? "var(--neon)" : T.ghost,
                                  }}>
                                  <Play size={13} />
                                </button>

                                <button type="button" aria-label={`Ajustes de ${b.nome}`} title="Ajustes do baralho"
                                  onClick={() => { setAjustando(abertoB ? null : { nome: b.nome, pasta: p.nome }); setConfirmando(null); }}
                                  className="flex items-center justify-center rounded-full"
                                  style={{
                                    width: 30, height: 30, flexShrink: 0, cursor: "pointer",
                                    background: abertoB ? T.card3 : "transparent",
                                    border: `1px solid ${abertoB ? "transparent" : T.line}`,
                                    color: mudou ? "var(--warn)" : T.ghost,
                                  }}>
                                  <Settings2 size={13} />
                                </button>
                              </div>

                              {abertoB ? (
                                <div className="px-3 pb-3 flex flex-col gap-3" style={{ borderTop: `1px solid ${T.line}`, paddingTop: 12 }}>
                                  {editandoB ? (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <TextInput value={novoNome} autoFocus
                                        onChange={(e) => setNovoNome(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") renomear(); if (e.key === "Escape") setRenomeando(null); }}
                                        style={{ padding: "6px 10px", fontSize: 13.5, flex: 1, minWidth: 130 }} />
                                      <Btn size="sm" tone="primary" onClick={renomear}>Salvar</Btn>
                                      <Btn size="sm" tone="outline" onClick={() => setRenomeando(null)}>cancelar</Btn>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Btn size="sm" tone="outline"
                                        onClick={() => { setRenomeando({ tipo: "baralho", nome: b.nome, pasta: p.nome }); setNovoNome(b.nome); }}>
                                        renomear
                                      </Btn>
                                      <label className="flex items-center gap-1.5">
                                        <span style={{ fontSize: 11.5, color: T.ghost }}>mover para</span>
                                        <select value={p.nome}
                                          onChange={(e) => moverBaralho(b.nome, p.nome, e.target.value)}
                                          style={{
                                            background: T.card2, border: `1px solid ${T.line}`, color: T.dim,
                                            borderRadius: 5, fontSize: 12.5, padding: "5px 7px", cursor: "pointer", maxWidth: 150,
                                          }}>
                                          {nomesDePasta.map((n) => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                      </label>
                                      {souDono ? (
                                        <Btn size="sm" tone="outline"
                                          disabled={publicando === chaveBaralho(p.nome, b.nome)}
                                          onClick={() => publicar(p.nome, b.nome)}>
                                          {publicando === chaveBaralho(p.nome, b.nome) ? "publicando…" : "publicar"}
                                        </Btn>
                                      ) : null}
                                      <button type="button" aria-label={`Apagar o baralho ${b.nome}`}
                                        onClick={() => setConfirmando(confirmaB ? null : { tipo: "baralho", nome: b.nome, pasta: p.nome })}
                                        className="toque-larg rounded-full px-4 py-2"
                                        style={{
                                          background: soft("var(--bad)", 12), border: `1px solid ${soft("var(--bad)", 34)}`,
                                          color: T.bad, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                                        }}>
                                        apagar
                                      </button>
                                    </div>
                                  )}

                                  <label className="flex items-center gap-2.5" style={{ cursor: "pointer" }}>
                                    <input type="checkbox" checked={cfg.embaralhar}
                                      onChange={(e) => mudarCfg(p.nome, b.nome, "embaralhar", e.target.checked)} />
                                    <span style={{ fontSize: 13.5, color: T.dim }}>
                                      Embaralhar a ordem
                                      <span style={{ color: T.ghost }}> · sem isso você acaba decorando pela posição</span>
                                    </span>
                                  </label>

                                  <div className="flex gap-3 flex-wrap">
                                    <label className="flex items-center gap-2">
                                      <span style={{ fontSize: 12.5, color: T.ghost, whiteSpace: "nowrap" }}>mín. por dia</span>
                                      <TextInput type="number" min="0" max="999" value={cfg.min || ""}
                                        placeholder="0"
                                        onChange={(e) => mudarCfg(p.nome, b.nome, "min", Math.max(0, Math.min(999, Math.floor(Number(e.target.value) || 0))))}
                                        style={{ padding: "5px 8px", fontSize: 13, width: 78 }} />
                                    </label>
                                    <label className="flex items-center gap-2">
                                      <span style={{ fontSize: 12.5, color: T.ghost, whiteSpace: "nowrap" }}>máx. por dia</span>
                                      <TextInput type="number" min="0" max="999" value={cfg.max || ""}
                                        placeholder="0"
                                        onChange={(e) => mudarCfg(p.nome, b.nome, "max", Math.max(0, Math.min(999, Math.floor(Number(e.target.value) || 0))))}
                                        style={{ padding: "5px 8px", fontSize: 13, width: 78 }} />
                                    </label>
                                  </div>
                                  <Mini style={{ lineHeight: 1.6 }}>
                                    Zero é sem limite. O mínimo adianta os cartões que vencem
                                    mais cedo, para um dia fraco não ficar curto demais; o
                                    máximo corta o excesso, para um dia pesado não virar
                                    desistência.
                                  </Mini>
                                </div>
                              ) : null}

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

      <Publicados nuvem={nuvem} souDono={souDono} setData={setData}
        notify={notify} publicados={publicados} recarregar={carregarPublicados} />

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
