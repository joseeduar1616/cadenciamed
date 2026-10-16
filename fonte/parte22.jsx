/* ═══════════════════════════════════════════════════════════════════
   34 · DUPLAS E DUELO

   Duas coisas que a sala de amigos não resolve.

   · Estudar junto com UMA pessoa, sem combinar nome e senha de sala: é
     só o e-mail com que ela criou a conta. A ligação só existe depois que
     ela aceita — convite que vira amizade sozinho é convite que qualquer
     um usa para aparecer na tela dos outros.

   · O duelo: as duas respondem as MESMAS questões ao mesmo tempo, com um
     relógio por questão. As questões saem de um material que alguém
     mandou (PDF, Word ou resumo colado), pela IA.

   Quem corrige é o servidor, e o gabarito não desce para o navegador
   antes de a questão fechar — senão bastava abrir a aba de rede para
   gabaritar o duelo inteiro. O relógio também é do servidor: dois
   relógios diferentes deixariam uma pessoa ainda respondendo a questão
   que a outra já viu a resposta.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_DUPLAS = "/api/duplas";
const ROTA_QUESTOES_IA = "/api/questoes-ia";

async function falarComDuplas(nuvem, corpo) {
  let token = "";
  try {
    if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
      token = await nuvem.sdk.auth.currentUser.getIdToken();
    }
  } catch (e) { /* sem conta, a rota recusa */ }
  if (!token) return { erro: "Entre na sua conta para estudar em dupla." };
  const { dados, erro } = await chamarApi(ROTA_DUPLAS, { ...corpo, token }, "As duplas");
  return erro ? { erro } : (dados || {});
}

/* De quanto em quanto tempo o duelo pergunta ao servidor onde está.
   Um segundo: o relógio na tela precisa bater com o da outra pessoa, e
   meio segundo dobraria a conta sem ninguém perceber diferença. */
const RITMO_DUELO = 1000;

const TEMPOS_DUELO = [30, 45, 60];
const QUANTAS_DUELO = [5, 10, 15, 20];

function Convidar({ nuvem, notify, aoMudar }) {
  const [email, setEmail] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const convidar = async () => {
    setOcupado(true); setErro("");
    const j = await falarComDuplas(nuvem, { acao: "convidar", email: email.trim() });
    setOcupado(false);
    if (j.erro) { setErro(j.erro); return; }
    notify(j.mensagem || "Convite enviado.");
    setEmail("");
    aoMudar();
  };

  return (
    <div className="mt-4 flex items-center gap-2 flex-wrap">
      <TextInput style={{ flex: 1, minWidth: 200 }} value={email} type="email"
        placeholder="e-mail de quem estuda com você"
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && email.trim()) convidar(); }} />
      <Btn size="sm" tone="primary" disabled={ocupado || !email.trim()} onClick={convidar}>
        {ocupado ? "Enviando…" : "Convidar"}
      </Btn>
      {erro ? <Label style={{ color: T.bad, width: "100%" }}>{erro}</Label> : null}
    </div>
  );
}

/* O relógio do foco combinado com a dupla. Anda aqui, e não no servidor:
   a lista só recarrega de tempos em tempos, e um contador preso a isso
   andaria aos pulos de meio minuto. */
function RelogioDaDupla({ foco }) {
  const [agora, setAgora] = useState(Date.now());
  const fim = foco ? foco.inicio + foco.minutos * 60000 : 0;
  useEffect(() => {
    if (!fim) return undefined;
    const t = window.setInterval(() => setAgora(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [fim]);
  if (!fim) return null;
  const resta = Math.max(0, Math.ceil((fim - agora) / 1000));
  if (!resta) return null;
  return (
    <span style={{ fontFamily: F_MONO, fontSize: 18, fontWeight: 600, color: T.neon }}>
      {fmtRelogio(resta)}
    </span>
  );
}

function CartaoDupla({ d, nuvem, notify, aoMudar, aoDuelar, aoEntrarNoDuelo }) {
  const [ocupado, setOcupado] = useState("");

  const mandar = async (corpo, qual) => {
    setOcupado(qual);
    const j = await falarComDuplas(nuvem, { ...corpo, id: d.id });
    setOcupado("");
    if (j.erro) { notify(j.erro); return; }
    if (j.mensagem) notify(j.mensagem);
    aoMudar();
  };

  return (
    <div className="rounded-2xl px-4 py-4" style={{ background: T.card2 }}>
      <div className="flex items-center gap-3 flex-wrap">
        <Face nome={d.nome} foto={d.foto} cor={corDoNome(d.nome)} tamanho={36} forte={d.estudando} />
        <span className="flex-1 min-w-0">
          <span style={{ display: "block", fontSize: 15.5, fontWeight: 600 }}>{d.nome}</span>
          <Mini>
            {!d.aceita
              ? (d.euConvidei ? "convite enviado, esperando aceitar" : "quer estudar com você")
              : d.estudando ? `estudando agora · ${fmtMin(d.minutos)}` : "não está estudando agora"}
          </Mini>
        </span>
        <RelogioDaDupla foco={d.foco} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!d.aceita && !d.euConvidei ? (
          <Btn size="sm" tone="primary" disabled={!!ocupado}
            onClick={() => mandar({ acao: "aceitar" }, "aceitar")}>Aceitar</Btn>
        ) : null}
        {/* O duelo em pé aparece PARA OS DOIS. Antes ele só existia na tela
            de quem tinha acabado de criá-lo: a outra pessoa abria a aba
            Amigos e não via nada, o que é exatamente o contrário de um
            duelo. */}
        {d.aceita && d.duelo && !d.duelo.acabou ? (
          <Btn size="sm" tone="primary" onClick={() => aoEntrarNoDuelo(d)}>
            <Zap size={14} />
            {d.duelo.correndo ? "Duelo em andamento"
              : d.duelo.euAceitei ? "Esperando a outra pessoa"
                : `Duelo: ${d.duelo.total} questões`}
          </Btn>
        ) : null}
        {d.aceita && !d.foco && !(d.duelo && !d.duelo.acabou) ? (
          <>
            {[25, 50].map((m) => (
              <Btn key={m} size="sm" disabled={!!ocupado}
                onClick={() => mandar({ acao: "focar", minutos: m }, "foco")}>focar {m} min</Btn>
            ))}
            <Btn size="sm" tone="primary" onClick={() => aoDuelar(d)}>Duelo</Btn>
          </>
        ) : null}
        {d.aceita && d.foco ? (
          <Btn size="sm" tone="outline" disabled={!!ocupado}
            onClick={() => mandar({ acao: "focar", minutos: 0 }, "foco")}>encerrar o foco</Btn>
        ) : null}
        <Btn size="sm" tone="outline" disabled={!!ocupado}
          onClick={() => mandar({ acao: "remover" }, "remover")}>
          {d.aceita ? "desfazer" : "recusar"}
        </Btn>
      </div>
    </div>
  );
}

/* As figuras do material — encolherFigura, nomesDeFigura e
   figurasDoMaterial — moram no parte12.jsx, junto do leitor de PDF que as
   recorta e do marcador [[img:nome]] que as nomeia. Ficam lá porque os
   flashcards montados pela IA precisam exatamente das mesmas: duas cópias
   divergiriam, e a diferença apareceria como "no duelo a imagem vai e no
   baralho não". */

/* A figura de uma questão, baixada quando ela abre.
 *
 * Uma por vez, e não todas de uma: uma prova de imagem inteira baixada no
 * começo faria o duelo demorar para abrir justo no 4G, que é onde ele mais
 * é usado. O que já desceu fica guardado aqui em memória, então voltar ao
 * gabarito no fim não baixa de novo. */
function FiguraDaQuestao({ nuvem, id, nome }) {
  const [uri, setUri] = useState("");
  const [faltou, setFaltou] = useState(false);
  const guardadas = useRef({});

  useEffect(() => {
    if (!nome) { setUri(""); setFaltou(false); return undefined; }
    if (guardadas.current[nome]) { setUri(guardadas.current[nome]); setFaltou(false); return undefined; }
    let vivo = true;
    setUri(""); setFaltou(false);
    (async () => {
      const j = await falarComDuplas(nuvem, { acao: "duelo-figura", id, nome });
      if (!vivo) return;
      if (j.erro || !j.dataUri) { setFaltou(true); return; }
      guardadas.current[nome] = j.dataUri;
      setUri(j.dataUri);
    })();
    return () => { vivo = false; };
  }, [nuvem, id, nome]);

  if (!nome) return null;
  if (faltou) return <Mini style={{ marginTop: 12 }}>a figura desta questão não está mais guardada</Mini>;
  if (!uri) return <Mini style={{ marginTop: 12 }}>carregando a figura…</Mini>;
  return (
    <img src={uri} alt="Figura da questão"
      style={{
        marginTop: 14, width: "100%", maxHeight: "38vh", objectFit: "contain",
        borderRadius: 14, border: `1px solid ${T.line}`, background: T.card2,
        display: "block",
      }} />
  );
}

/* ── montar o duelo ──────────────────────────────────────────────────── */

/* O estilo da banca fica guardado no aparelho, e não junto dos dados de
   estudo, por dois motivos: são milhares de caracteres que não têm nada a
   ver com o progresso da pessoa, e ela cola isso uma vez e usa em todo
   duelo — reescrever a cada duelo é o que faria o campo não ser usado. */
const CHAVE_BANCA = "cadencia:v3:estilo-da-banca";

/* O mesmo teto do servidor. Cortar aqui evita mandar 200 KB de questões
   colada para a rota devolver só os 8 KB primeiros sem avisar. */
const MAX_BANCA = 8000;

const lerBancaGuardada = () => {
  try { return window.localStorage.getItem(CHAVE_BANCA) || ""; }
  catch (e) { return ""; }
};


function MontarDuelo({ dupla, nuvem, notify, aoComecar, aoFechar }) {
  const [texto, setTexto] = useState("");
  const [quantas, setQuantas] = useState(10);
  const [segundos, setSegundos] = useState(45);
  const [banca, setBanca] = useState(lerBancaGuardada);
  const [verBanca, setVerBanca] = useState(false);
  const [passo, setPasso] = useState("");
  const [erro, setErro] = useState("");
  const arquivoRef = useRef(null);

  /* Contadas do próprio texto, então acompanham o que a pessoa colar,
     apagar ou juntar de dois arquivos. */
  const quantasFiguras = useMemo(() => nomesDeFigura(texto).length, [texto]);

  const comecar = async () => {
    setErro(""); setPasso("Separando as figuras…");
    let token = "";
    try {
      if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
        token = await nuvem.sdk.auth.currentUser.getIdToken();
      }
    } catch (e) { /* segue */ }
    if (!token) { setPasso(""); setErro("Entre na sua conta."); return; }

    /* As figuras sobem junto com o texto: a IA precisa VER a imagem para
       escrever questão sobre ela e para saber qual questão depende de qual
       figura. Mandar só o nome do arquivo não dizia nada a ela. */
    const figuras = await figurasDoMaterial(texto);

    const estiloBanca = banca.trim().slice(0, MAX_BANCA);
    try {
      if (estiloBanca) window.localStorage.setItem(CHAVE_BANCA, estiloBanca);
      else window.localStorage.removeItem(CHAVE_BANCA);
    } catch (e) { /* aparelho sem espaço: o duelo segue sem guardar */ }

    setPasso("Escrevendo as questões…");
    const { dados, erro: falhou } = await chamarApi(
      ROTA_QUESTOES_IA, { token, texto, quantas, figuras, estiloBanca },
      "O montador de questões");
    if (falhou || !dados || dados.erro) {
      setPasso("");
      setErro(falhou || (dados && dados.erro) || "Não consegui montar as questões.");
      return;
    }
    if (dados.questoes.length < quantas) {
      notify(`O material deu para ${dados.questoes.length} questões, e não ${quantas}.`);
    }

    setPasso("Começando o duelo…");
    const j = await falarComDuplas(nuvem, {
      acao: "duelo-criar", id: dupla.id, segundos,
      tema: dados.tema, questoes: dados.questoes, figuras,
    });
    setPasso("");
    if (j.erro) { setErro(j.erro); return; }
    notify(j.mensagem || "Duelo criado.");
    aoComecar();
  };

  return (
    <Card className="px-6 py-6" brilho="var(--neon)">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <H color="var(--neon)" icon={<Zap size={16} />}>Duelo com {dupla.nome}</H>
        <Btn size="sm" tone="outline" onClick={aoFechar}>fechar</Btn>
      </div>
      <Texto style={{ marginTop: 10 }}>
        Mande o material, escolha quantas questões e quanto tempo cada uma tem. As duas
        veem as mesmas questões ao mesmo tempo, e o gabarito só aparece quando a questão
        fecha.
      </Texto>

      <div className="mt-5">
        <Label>Material</Label>
        <Area style={{ marginTop: 6, minHeight: 120 }} value={texto}
          placeholder="Cole aqui o resumo, ou mande um PDF/Word no botão abaixo"
          onChange={(e) => setTexto(e.target.value)} />
        <input ref={arquivoRef} type="file" hidden
          accept=".pdf,.docx,.txt,.md,application/pdf,text/plain,image/*"
          onChange={async (e) => {
            const arq = (e.target.files || [])[0];
            e.target.value = "";
            if (!arq) return;
            setErro(""); setPasso("Lendo o arquivo…");
            try {
              const r = await textoDeAnexo(arq, nuvem, (m) => setPasso(m));
              if (r.erro) setErro(r.erro);
              else setTexto((t) => `${t}\n\n${r.texto}`.trim());
            } catch (err) {
              setErro((err && err.message) || "Não consegui ler esse arquivo.");
            }
            setPasso("");
          }} />
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <Btn size="sm" onClick={() => arquivoRef.current && arquivoRef.current.click()}>
            <Upload size={14} /> Mandar um arquivo
          </Btn>
          {/* Quantas figuras o material trouxe. Dito aqui porque é a
              diferença entre "o PDF não tinha figura" e "a figura não
              chegou" — sem isso, as duas parecem a mesma coisa na tela. */}
          {texto.trim() ? (
            <Mini>
              {quantasFiguras === 0
                ? "nenhuma figura neste material"
                : quantasFiguras > MAX_FIGURAS_IA
                  ? `${quantasFiguras} figuras · as ${MAX_FIGURAS_IA} primeiras entram`
                  : `${quantasFiguras} ${quantasFiguras === 1 ? "figura, que a IA vai ver" : "figuras, que a IA vai ver"}`}
            </Mini>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <div>
          <Label>Quantas questões</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {QUANTAS_DUELO.map((n) => (
              <Btn key={n} size="sm" tone={quantas === n ? "primary" : "quiet"}
                onClick={() => setQuantas(n)}>{n}</Btn>
            ))}
          </div>
        </div>
        <div>
          <Label>Tempo por questão</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {TEMPOS_DUELO.map((s) => (
              <Btn key={s} size="sm" tone={segundos === s ? "primary" : "quiet"}
                onClick={() => setSegundos(s)}>{s}s</Btn>
            ))}
          </div>
        </div>
      </div>

      {/* Estilo da banca · opcional, e escondido até ser pedido.
          Fica fechado porque o duelo funciona sem ele, e um campo grande
          aberto no meio da tela faria a pessoa achar que é obrigatório
          colar prova antes de conseguir duelar. */}
      <div className="mt-5">
        {verBanca ? (
          <div>
            <Label>Estilo da banca · opcional</Label>
            <Texto style={{ marginTop: 6 }}>
              Cole algumas questões da banca que você vai prestar. A IA copia só a FORMA —
              tamanho do enunciado, vinheta clínica, jeito das alternativas — e escreve
              sobre o material que você mandou acima. As questões coladas não entram no
              duelo.
            </Texto>
            <Area style={{ marginTop: 8, minHeight: 100 }} value={banca}
              placeholder="Cole aqui duas ou três questões da banca, com as alternativas"
              onChange={(e) => setBanca(e.target.value.slice(0, MAX_BANCA))} />
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <Mini>
                {banca.trim()
                  ? `${banca.trim().length} de ${MAX_BANCA} caracteres · fica guardado neste aparelho`
                  : "sem exemplo, as questões saem no estilo geral de residência"}
              </Mini>
              {banca.trim()
                ? <Btn size="sm" tone="quiet" onClick={() => setBanca("")}>limpar</Btn>
                : null}
              <Btn size="sm" tone="quiet" onClick={() => setVerBanca(false)}>fechar</Btn>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <Btn size="sm" tone="outline" onClick={() => setVerBanca(true)}>
              <Sparkles size={14} /> Estilo da banca
            </Btn>
            <Mini>
              {banca.trim()
                ? "as questões vão sair com a cara da banca que você colou"
                : "opcional: cole questões da sua banca e as do duelo saem parecidas"}
            </Mini>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2 items-center">
        <Btn tone="primary" disabled={!!passo || texto.trim().length < 40} onClick={comecar}>
          <Zap size={15} /> {passo || "Começar o duelo"}
        </Btn>
        {texto.trim().length < 40 ? <Mini>mande um material primeiro</Mini> : null}
      </div>
      {erro ? <Label style={{ marginTop: 12, color: T.bad }}>{erro}</Label> : null}
    </Card>
  );
}

/* ── o duelo acontecendo ─────────────────────────────────────────────── */

function DueloAoVivo({ dupla, nuvem, notify, aoSair }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const refNuvem = useRef(nuvem);
  refNuvem.current = nuvem;

  const puxar = useCallback(async (corpo) => {
    const j = await falarComDuplas(refNuvem.current, { acao: "duelo-estado", id: dupla.id, ...corpo });
    if (j.erro) { setErro(j.erro); return; }
    setErro("");
    /* duelo-aceitar responde só "ok", sem estado. Apagar a tela por causa
       disso faria a sala de espera piscar "carregando" no instante em que
       a pessoa toca em entrar, que é justo quando ela está olhando. */
    if (!("duelo" in j)) { puxarRef.current(); return; }
    setD(j.duelo);
  }, [dupla.id]);
  const puxarRef = useRef(puxar);
  puxarRef.current = puxar;

  /* O relógio é do servidor, então a tela pergunta de segundo em segundo
     onde o duelo está. Contar sozinho aqui deixaria as duas pessoas em
     questões diferentes assim que uma delas tivesse a rede mais lenta. */
  useEffect(() => {
    puxar();
    const t = window.setInterval(() => puxar(), RITMO_DUELO);
    return () => window.clearInterval(t);
  }, [puxar]);

  /* Tela cheia, por portal, como o estudo de flashcards.
   *
   * Não é enfeite: o duelo se atualiza de segundo em segundo, e desenhado
   * no meio da aba Amigos — que é uma página comprida, com ranking e
   * recados recarregando por baixo — a página ficava descendo sozinha a
   * cada atualização. Fora do fluxo da página, isso some. */
  const tela = (dentro) => createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 60, background: T.bg,
      overflowY: "auto", WebkitOverflowScrolling: "touch",
      padding: "calc(14px + env(safe-area-inset-top,0px)) 14px calc(20px + env(safe-area-inset-bottom,0px))",
      /* Sem cursor de texto piscando: o duelo se responde clicando na
         alternativa, e não há campo nenhum aqui. Ver parte12.jsx. */
      caretColor: "transparent",
    }}>
      <div className="mx-auto" style={{ maxWidth: 680 }}>{dentro}</div>
    </div>, document.body);

  if (erro) {
    return tela(
      <Card className="px-6 py-6">
        <Label style={{ color: T.bad }}>{erro}</Label>
        <div className="mt-4"><Btn size="sm" onClick={aoSair}>voltar</Btn></div>
      </Card>);
  }
  if (!d) return tela(<Card className="px-6 py-6"><Mini>carregando o duelo…</Mini></Card>);

  /* ── sala de espera ──────────────────────────────────────────────────
     O relógio só anda quando as duas estiverem aqui. Antes disso quem
     criou respondia sozinho, com o tempo correndo, enquanto a outra
     pessoa nem sabia que havia duelo. */
  if (d.esperando) {
    return tela(
      <Card className="px-6 py-10 text-center" brilho="var(--neon)">
        <div className="flex justify-center" style={{ color: "var(--neon)" }}>
          <span className="flex items-center justify-center rounded-full"
            style={{ width: 56, height: 56, background: soft("var(--neon)", 16) }}>
            <Zap size={24} />
          </span>
        </div>
        <h2 style={{ fontFamily: F_SERIF, fontSize: 24, fontWeight: 400, margin: "18px 0 0", color: T.ink }}>
          {d.tema || "Duelo"}
        </h2>
        <Label style={{ marginTop: 8 }}>
          {d.total} questões · {d.segundos}s cada
        </Label>
        <p style={{ color: T.dim, fontSize: 15, lineHeight: 1.65, marginTop: 14, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
          {d.euAceitei
            ? `Esperando ${d.faltam.join(" e ") || "a outra pessoa"} entrar. O relógio começa para os dois no mesmo instante.`
            : "Toque em entrar quando estiver pronto. O relógio começa quando os dois estiverem aqui."}
        </p>
        <div className="mt-7 flex justify-center gap-2 flex-wrap">
          {!d.euAceitei ? (
            <Btn tone="primary" onClick={() => puxar({ acao: "duelo-aceitar" })}>
              <Zap size={15} /> Entrar no duelo
            </Btn>
          ) : <Mini style={{ color: T.ok }}>você já está pronto</Mini>}
          <Btn tone="outline" size="sm" onClick={aoSair}>sair</Btn>
        </div>
      </Card>);
  }

  const responder = (i) => puxar({ acao: "duelo-responder", n: d.indice, escolha: i });
  const minhaEscolha = d.minhas[d.indice];

  if (d.acabou) {
    return tela(
      <div className="flex flex-col gap-5">
        <Card className="px-6 py-6" brilho="var(--neon)">
          <H color="var(--neon)" icon={<Trophy size={16} />}>Fim do duelo</H>
          {d.tema ? <Label style={{ marginTop: 4 }}>{d.tema}</Label> : null}
          <div className="mt-5 flex flex-col gap-2">
            {d.placar.map((x, i) => (
              <div key={x.uid} className="rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{ background: i === 0 ? soft("var(--ok)", 14) : T.card2 }}>
                <span style={{ fontFamily: F_MONO, fontSize: 15, color: T.ghost, minWidth: 22 }}>{i + 1}</span>
                <Face nome={x.nome} foto={x.foto} cor={corDoNome(x.nome)} tamanho={32} />
                <span className="flex-1 min-w-0" style={{ fontSize: 15, fontWeight: 600 }}>{x.nome}</span>
                <span style={{ fontFamily: F_MONO, fontSize: 16, color: i === 0 ? T.ok : T.dim }}>
                  {x.acertos}/{d.total}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Btn size="sm" onClick={aoSair}>voltar</Btn>
            <Btn size="sm" tone="outline" onClick={async () => {
              await falarComDuplas(refNuvem.current, { acao: "duelo-apagar", id: dupla.id });
              notify("Duelo encerrado.");
              aoSair();
            }}>apagar este duelo</Btn>
          </div>
        </Card>

        {/* O gabarito só vira estudo no fim, com a explicação de cada uma. */}
        <Card className="px-6 py-6">
          <H size={18} color="var(--a-CI)" icon={<ListChecks size={16} />}>O que caiu</H>
          <div className="mt-4 flex flex-col gap-4">
            {(d.gabarito || []).map((q) => {
              const minha = d.minhas[q.n - 1];
              const acertei = minha === q.certa;
              return (
                <div key={q.n} className="rounded-2xl px-4 py-4" style={{ background: T.card2 }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Mini>{q.n} de {d.total}</Mini>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: acertei ? T.ok : T.bad }}>
                      {minha === undefined ? "não respondeu" : acertei ? "acertou" : "errou"}
                    </span>
                  </div>
                  <Texto style={{ marginTop: 8 }}>{q.enunciado}</Texto>
                  {/* A figura aparece de novo no gabarito: sem ela, rever a
                      questão de imagem no fim é rever meia questão. */}
                  <FiguraDaQuestao nuvem={nuvem} id={dupla.id} nome={q.imagem} />
                  <div className="mt-3 flex flex-col gap-1.5">
                    {q.alternativas.map((a, i) => (
                      <div key={i} className="rounded-2xl px-3 py-2" style={{
                        background: i === q.certa ? soft("var(--ok)", 14)
                          : i === minha ? soft("var(--bad)", 12) : "transparent",
                        color: i === q.certa ? T.ok : T.dim, fontSize: 14,
                      }}>{a}</div>
                    ))}
                  </div>
                  {q.porque ? <Mini style={{ marginTop: 8, lineHeight: 1.6 }}>{q.porque}</Mini> : null}
                </div>
              );
            })}
          </div>
        </Card>
      </div>);
  }

  return tela(
    <Card className="px-6 py-6" brilho="var(--neon)">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <H color="var(--neon)" icon={<Zap size={16} />}>
          Questão {d.indice + 1} de {d.total}
        </H>
        <span style={{
          fontFamily: F_MONO, fontSize: 26, fontWeight: 700,
          color: d.restaSeg <= 10 ? T.bad : T.neon,
        }}>{d.restaSeg}s</span>
      </div>
      <div className="mt-3"><Track pct={(d.restaSeg / d.segundos) * 100} color={d.restaSeg <= 10 ? "var(--bad)" : "var(--neon)"} /></div>

      <Texto style={{ marginTop: 18, fontSize: 17, lineHeight: 1.6, color: T.ink }}>
        {d.questao.enunciado}
      </Texto>

      <FiguraDaQuestao nuvem={nuvem} id={dupla.id} nome={d.questao.imagem} />

      <div className="mt-5 flex flex-col gap-2">
        {d.questao.alternativas.map((a, i) => (
          <button key={i} type="button" className="rounded-2xl px-4 py-3 toque"
            disabled={minhaEscolha !== undefined}
            onClick={() => responder(i)}
            style={{
              background: minhaEscolha === i ? soft("var(--neon)", 20) : T.card2,
              border: `1px solid ${minhaEscolha === i ? soft("var(--neon)", 45) : "transparent"}`,
              color: T.ink, fontSize: 15, textAlign: "left", cursor: minhaEscolha === undefined ? "pointer" : "default",
              fontFamily: F_UI,
            }}>{a}</button>
        ))}
      </div>

      {minhaEscolha !== undefined ? (
        <Mini style={{ marginTop: 14 }}>
          respondida · o resultado aparece quando o tempo acabar
        </Mini>
      ) : null}

      <div className="mt-5 pt-5 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderTop: `1px solid ${T.line}` }}>
        <Mini>
          {d.placar.map((x) => `${x.nome}: ${x.respondidas}`).join(" · ")}
        </Mini>
        <Btn size="sm" tone="outline" onClick={aoSair}>sair</Btn>
      </div>
    </Card>);
}

/* ── o cartão inteiro, na aba Amigos ─────────────────────────────────── */

function Duplas({ nuvem, notify }) {
  const [duplas, setDuplas] = useState(null);
  const [erro, setErro] = useState("");
  const [montando, setMontando] = useState(null);
  const [duelando, setDuelando] = useState(null);
  const refNuvem = useRef(nuvem);
  refNuvem.current = nuvem;
  const logado = !!(nuvem && nuvem.usuario);
  const meuUid = logado ? nuvem.usuario.uid : "";

  const carregar = useCallback(async () => {
    const j = await falarComDuplas(refNuvem.current, { acao: "listar" });
    if (j.erro) { setErro(j.erro); setDuplas([]); return; }
    setDuplas(j.duplas || []);
    setErro("");
  }, []);

  useEffect(() => {
    if (!meuUid) return undefined;
    carregar();
    /* Quem está estudando agora muda sozinho, então a lista se atualiza —
       no mesmo ritmo do ranking das salas. */
    /* Com duelo esperando, a lista recarrega rápido: é o que faz o convite
       aparecer para a outra pessoa sem ela ter de recarregar a página. */
    const t = window.setInterval(carregar, 8000);
    return () => window.clearInterval(t);
  }, [meuUid, carregar]);

  if (!logado) return null;
  if (duelando) {
    return <DueloAoVivo dupla={duelando} nuvem={nuvem} notify={notify}
      aoSair={() => { setDuelando(null); carregar(); }} />;
  }
  if (montando) {
    return <MontarDuelo dupla={montando} nuvem={nuvem} notify={notify}
      aoFechar={() => setMontando(null)}
      aoComecar={() => { setDuelando(montando); setMontando(null); }} />;
  }

  return (
    <Card className="px-6 py-6" brilho="var(--neon)">
      <H color="var(--neon)" icon={<Users size={16} />}>Estudar em dupla</H>
      <Texto style={{ marginTop: 10 }}>
        Sem sala, sem senha: chame pelo e-mail com que a pessoa criou a conta. Dá para
        combinar um foco com ela e para duelar em questões que a IA escreve do material
        que vocês mandarem.
      </Texto>

      <Convidar nuvem={nuvem} notify={notify} aoMudar={carregar} />

      {duplas === null ? <Mini style={{ marginTop: 14 }}>carregando…</Mini> : null}
      {duplas && !duplas.length ? (
        <Blank icon={<Users size={22} />} title="Nenhuma dupla ainda"
          hint="Chame alguém pelo e-mail. O convite aparece para a pessoa quando ela entrar." />
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        {(duplas || []).map((d) => (
          <CartaoDupla key={d.id} d={d} nuvem={nuvem} notify={notify}
            aoMudar={carregar} aoDuelar={(x) => setMontando(x)}
            aoEntrarNoDuelo={(x) => setDuelando(x)} />
        ))}
      </div>
      {erro ? <Label style={{ marginTop: 12, color: T.bad }}>{erro}</Label> : null}
    </Card>
  );
}

/* ── o convite para duelar tem de CHEGAR ──────────────────────────────
 *
 * O primeiro duelo não funcionou por um motivo bobo: quem foi chamado só
 * descobria o duelo se estivesse com a aba Amigos aberta na hora. Não
 * havia aviso, e a lista só era consultada dentro daquela aba.
 *
 * Isto roda na raiz do app, com qualquer aba aberta: pergunta de tempos
 * em tempos se há duelo esperando por mim, acende o número na aba Amigos
 * e avisa — uma vez por duelo, senão seria um alarme a cada rodada.
 *
 * Só com a aba do site à frente. Em segundo plano o navegador congela o
 * relógio de qualquer jeito, e a notificação chegaria fora de hora, para
 * um duelo que já acabou.
 */
const RITMO_CONVITE = 20000;

function useConviteDeDuelo({ nuvem, notify, lembretes }) {
  const [esperando, setEsperando] = useState(0);
  const jaAvisei = useRef({});
  const refNotify = useRef(notify);
  refNotify.current = notify;
  const refNuvem = useRef(nuvem);
  refNuvem.current = nuvem;
  const refLembretes = useRef(lembretes);
  refLembretes.current = lembretes;
  const uid = nuvem && nuvem.usuario ? nuvem.usuario.uid : "";

  useEffect(() => {
    if (!uid) { setEsperando(0); return undefined; }
    let vivo = true;

    const olhar = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const j = await falarComDuplas(refNuvem.current, { acao: "listar" });
      if (!vivo || j.erro) return;
      /* Só conta o que espera POR MIM: o duelo que eu mesmo criei está
         esperando a outra pessoa, e avisar disso seria avisar do próprio
         clique. */
      const meus = (j.duplas || []).filter(
        (d) => d.duelo && d.duelo.esperando && !d.duelo.euAceitei);
      setEsperando(meus.length);
      for (const d of meus) {
        if (jaAvisei.current[d.duelo.marca]) continue;
        jaAvisei.current[d.duelo.marca] = 1;
        /* A notificação do sistema só sai para quem ligou os lembretes.
           Quem nunca ligou recebe o recado dentro do site, e só. */
        if (refLembretes.current) {
          avisar("Duelo esperando você",
            `${d.nome} chamou você para um duelo de questões.`, `duelo:${d.duelo.marca}`);
        }
        if (refNotify.current) refNotify.current(`${d.nome} chamou você para um duelo. Abra a aba Amigos.`);
      }
    };

    olhar();
    const t = window.setInterval(olhar, RITMO_CONVITE);
    const aoVoltar = () => { if (!document.hidden) olhar(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [uid]);

  return esperando;
}
