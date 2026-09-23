/* ═══════════════════════════════════════════════════════════════════
   35 · PROVAS

   A pessoa manda uma prova — PDF, Word, foto do caderno de questões — e
   recebe de volta cada questão reescrita, com a alternativa certa e com
   o comentário de TODAS as alternativas.

   O comentário de toda alternativa é o ponto. Gabarito a pessoa já tem:
   vem no fim da prova. "A letra C está certa" não ensina nada. O que
   ensina é saber por que a A seria a resposta se houvesse febre, e por
   que a D descreve outra doença — e é isso que faz a questão virar
   estudo em vez de conferência.

   A parte incômoda, que a tela não esconde: a IA responde a partir do
   que aprendeu, e não consultando fonte nenhuma na hora. Ela erra. Quem
   estuda para residência decorando um gabarito errado sai pior do que
   entrou, então cada questão mostra o quanto ela está segura e em que se
   baseia — na cara, junto da resposta, e não num rodapé. Onde ela não
   está segura, a tela pede conferência antes de a pessoa decorar.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_PROVAS_IA = "/api/provas-ia";

const SEGURANCA = {
  alta: { rotulo: "consenso firme", cor: "var(--ok)" },
  media: { rotulo: "confira antes de decorar", cor: "var(--warn)" },
  baixa: { rotulo: "duvidoso, confira", cor: "var(--bad)" },
};

const LETRAS = ["A", "B", "C", "D", "E", "F"];

/* ── uma questão comentada ──────────────────────────────────────────── */

function QuestaoDaProva({ q, n, total }) {
  /* Fechada, a questão é só o enunciado e as alternativas: dá para tentar
     responder antes de ver o gabarito, que é como ela vira estudo. Aberta
     de saída, a pessoa lê a resposta junto com a pergunta e não chega a
     pensar. */
  const [aberta, setAberta] = useState(false);
  const [escolhi, setEscolhi] = useState(-1);
  const seg = SEGURANCA[q.seguranca] || SEGURANCA.media;
  const mostrar = aberta || escolhi >= 0;

  return (
    <Card className="px-6 py-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Mini style={{ fontFamily: F_MONO }}>{n} de {total}</Mini>
        {q.assunto ? (
          <span style={{
            fontSize: 12, fontWeight: 600, borderRadius: 99, padding: "2px 10px",
            background: soft("var(--neon)", 16), color: "var(--neon)",
          }}>{q.assunto}</span>
        ) : null}
      </div>

      {/* O enunciado passa pelo desenhador de cartão porque ele já sabe
          trocar [[img:nome]] pela figura guardada no aparelho. Prova de
          residência é cheia de questão que não existe sem a imagem: sem
          isto o marcador apareceria como texto cru no meio da pergunta. */}
      <div style={{ margin: "12px 0 0" }}>
        <LadoDoCartao texto={q.enunciado} tamanho={15.5} peso={400} entrelinha={1.13} altura={320} />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {q.alternativas.map((a, i) => {
          const certa = i === q.certa;
          const minha = i === escolhi;
          const pinta = mostrar && (certa || minha);
          const cor = certa ? "var(--ok)" : "var(--bad)";
          return (
            <button key={i} type="button"
              onClick={() => { if (escolhi < 0) setEscolhi(i); }}
              disabled={escolhi >= 0}
              className="text-left rounded-2xl px-4 py-3 flex items-start gap-3"
              style={{
                background: pinta ? soft(cor, 14) : T.card2,
                border: `1px solid ${pinta ? soft(cor, 45) : "transparent"}`,
                cursor: escolhi >= 0 ? "default" : "pointer",
                width: "100%", fontFamily: F_UI,
              }}>
              <span style={{
                fontFamily: F_MONO, fontSize: 13, fontWeight: 700, marginTop: 1,
                color: pinta ? cor : T.ghost, flexShrink: 0,
              }}>{LETRAS[i] || i + 1}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, lineHeight: 1.6, color: T.ink }}>
                {a}
              </span>
              {mostrar && certa ? <Check size={16} style={{ color: "var(--ok)", flexShrink: 0, marginTop: 2 }} /> : null}
              {mostrar && minha && !certa ? <X size={16} style={{ color: "var(--bad)", flexShrink: 0, marginTop: 2 }} /> : null}
            </button>
          );
        })}
      </div>

      {!mostrar ? (
        <div className="mt-4">
          <Btn size="sm" tone="outline" onClick={() => setAberta(true)}>
            ver o comentário
          </Btn>
        </div>
      ) : (
        <div className="mt-5">
          <Label style={{ color: seg.cor }}>
            Resposta: {LETRAS[q.certa] || q.certa + 1} · {seg.rotulo}
          </Label>

          {/* O comentário de cada alternativa, na ordem. É a parte que
              ensina, então ela vem inteira e não recolhida. */}
          <div className="mt-3 flex flex-col gap-3">
            {q.comentarios.map((c, i) => (
              <div key={i} className="flex items-start gap-3">
                <span style={{
                  fontFamily: F_MONO, fontSize: 12, fontWeight: 700, marginTop: 2, flexShrink: 0,
                  color: i === q.certa ? "var(--ok)" : T.ghost,
                }}>{LETRAS[i] || i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.65, color: T.dim }}>{c}</span>
              </div>
            ))}
          </div>

          {q.avisos ? (
            <div className="mt-4 rounded-2xl px-4 py-3"
              style={{ background: soft("var(--warn)", 12), border: `1px solid ${soft("var(--warn)", 35)}` }}>
              <Mini style={{ color: "var(--warn)", lineHeight: 1.6 }}>{q.avisos}</Mini>
            </div>
          ) : null}

          {q.fonte ? <Mini style={{ marginTop: 12 }}>Base: {q.fonte}</Mini> : null}
        </div>
      )}
    </Card>
  );
}

/* ── a prova em lotes ─────────────────────────────────────────────────
 *
 * Uma prova de sessenta questões nunca cabia numa resposta só. Cada
 * questão comentada custa uns quinhentos tokens — enunciado reescrito,
 * quatro alternativas e um comentário para CADA uma —, e umas vinte já
 * encostam no teto de saída da IA. O que vinha depois disso era cortado no
 * meio de uma frase. Daí as "em média 20 questões por arquivo": não era a
 * leitura do arquivo que parava, era a resposta.
 *
 * Então o material é dividido aqui e mandado em lotes, um por chamada.
 *
 * O corte não pode cair no meio de uma questão: meia questão num lote e
 * meia no outro vira duas questões inventadas. Por isso o corte procura
 * para trás o começo de uma questão — uma linha que abre com número —, e
 * só se não achar nenhuma recua para uma quebra de parágrafo.
 */
const LOTE_ALVO = 14000;     // caracteres por chamada, com folga sobre o teto da rota
const LOTE_MINIMO = 4000;    // abaixo disso não vale partir
const MAX_LOTES = 12;        // teto de segurança: 12 lotes já são ~240 questões

/* Onde começa uma questão: linha que abre com número, seguido de ponto,
   parêntese, traço ou espaço. Pega "1.", "01)", "QUESTÃO 12", "12 -". */
const INICIO_DE_QUESTAO = /\n[ \t]*(?:quest[ãa]o\s*)?\d{1,3}\s*[).\-–—:]?\s/gi;

function dividirEmLotes(texto) {
  const t = String(texto || "");
  if (t.length <= LOTE_ALVO) return [t];

  const lotes = [];
  let resto = t;
  while (resto.length > LOTE_ALVO && lotes.length < MAX_LOTES - 1) {
    const janela = resto.slice(0, LOTE_ALVO);

    /* O último começo de questão dentro da janela é o corte ideal. */
    let corte = -1;
    INICIO_DE_QUESTAO.lastIndex = 0;
    let m;
    while ((m = INICIO_DE_QUESTAO.exec(janela))) {
      if (m.index > LOTE_MINIMO) corte = m.index;
    }
    /* Sem nenhum começo de questão: uma quebra de parágrafo serve. */
    if (corte < 0) corte = janela.lastIndexOf("\n\n");
    if (corte < LOTE_MINIMO) corte = LOTE_ALVO;

    lotes.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte);
  }
  if (resto.trim()) lotes.push(resto.trim());
  return lotes.filter(Boolean);
}

/* Duas questões são a mesma quando o enunciado começa igual. O número não
   serve de chave sozinho: cada lote pode recomeçar a contagem, e uma prova
   com dois cadernos repete os números de propósito. */
function juntarQuestoes(anteriores, novas) {
  const vistas = new Set(anteriores.map(
    (q) => String(q.enunciado || "").replace(/\s+/g, " ").slice(0, 60).toLowerCase()
  ));
  const fora = anteriores.slice();
  for (const q of novas) {
    const chave = String(q.enunciado || "").replace(/\s+/g, " ").slice(0, 60).toLowerCase();
    if (!chave || vistas.has(chave)) continue;
    vistas.add(chave);
    fora.push(q);
  }
  return fora;
}

/* ── a aba ──────────────────────────────────────────────────────────── */

const ROTA_PROVAS = "/api/provas";

function Provas({ nuvem, notify }) {
  const [texto, setTexto] = useState("");
  const [passo, setPasso] = useState("");
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState(null);
  const arquivoRef = useRef(null);

  /* Entrar por código: quem recebeu um código pronto não manda arquivo
     nenhum e não gasta IA — a prova já está comentada do outro lado. */
  const [codigo, setCodigo] = useState("");

  /* Publicar: só do dono, e a barra lateral já esconde a aba de quem não
     pode. Esconder não protege nada por si — quem manda é o servidor, que
     confere o e-mail do token —, mas evita oferecer o que não se pode. */
  const souDono = ehDono(nuvem && nuvem.usuario);
  const [publicando, setPublicando] = useState(false);
  const [codigoNovo, setCodigoNovo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [publicadas, setPublicadas] = useState([]);

  const comToken = useCallback(async (corpo, oQue) => {
    let token = "";
    try {
      if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
        token = await nuvem.sdk.auth.currentUser.getIdToken();
      }
    } catch (e) { /* a rota recusa sem token */ }
    if (!token) return { erro: "Entre na sua conta." };
    return chamarApi(ROTA_PROVAS, { token, ...corpo }, oQue);
  }, [nuvem]);

  const carregarPublicadas = useCallback(async () => {
    if (!souDono) return;
    const { dados } = await comToken({ acao: "listar" }, "As provas publicadas");
    setPublicadas((dados && dados.provas) || []);
  }, [souDono, comToken]);

  useEffect(() => { carregarPublicadas(); }, [carregarPublicadas]);

  const entrarPorCodigo = async () => {
    const c = codigo.trim();
    if (!c) return;
    setErro(""); setResultado(null); setPasso("Procurando a prova…");
    const { dados, erro: falhou } = await comToken({ acao: "resgatar", codigo: c }, "As provas");
    setPasso("");
    if (falhou || !dados || dados.erro) {
      setErro(falhou || (dados && dados.erro) || "Não achei prova com esse código.");
      return;
    }
    setResultado({ prova: dados.prova, questoes: dados.questoes, deCodigo: dados.codigo });
    setCodigo("");
  };

  const publicar = async () => {
    const qs = (resultado && resultado.questoes) || [];
    if (!qs.length) return;
    setPublicando(true);
    const { dados, erro: falhou } = await comToken({
      acao: "publicar",
      codigo: codigoNovo,
      prova: (resultado && resultado.prova) || "",
      descricao,
      questoes: qs,
    }, "A publicação da prova");
    setPublicando(false);
    if (falhou || !dados || dados.erro) {
      notify(falhou || (dados && dados.erro) || "Não consegui publicar.");
      return;
    }
    notify(`Publicada em "${dados.codigo}": ${dados.questoes} questões.`
      + (dados.descartadas ? ` ${dados.descartadas} ficaram de fora por virem incompletas.` : ""));
    setCodigoNovo(""); setDescricao("");
    carregarPublicadas();
  };

  const despublicar = async (c) => {
    const { dados } = await comToken({ acao: "despublicar", codigo: c }, "A remoção da prova");
    if (dados && dados.ok) { notify(`"${c}" saiu do ar.`); carregarPublicadas(); }
  };

  const comentar = async () => {
    setErro(""); setResultado(null);
    setPasso("Lendo a prova e escrevendo os comentários…");
    let token = "";
    try {
      if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
        token = await nuvem.sdk.auth.currentUser.getIdToken();
      }
    } catch (e) { /* segue: a rota recusa sem token */ }
    if (!token) { setPasso(""); setErro("Entre na sua conta."); return; }

    /* A prova vai em lotes, e o resultado aparece a cada lote: numa prova
       grande são minutos de espera, e uma tela parada nesse tempo parece
       travada. Melhor ver as primeiras questões enquanto as outras vêm. */
    const lotes = dividirEmLotes(texto);
    const figurasTodas = await figurasDoMaterial(texto, 40).catch(() => []);

    let juntas = [];
    let nomeDaProva = "";
    let descartadas = 0;
    let cortadaNoFim = false;
    let falhou = "";

    for (let i = 0; i < lotes.length; i++) {
      setPasso(lotes.length > 1
        ? `Lote ${i + 1} de ${lotes.length}${juntas.length ? ` · ${juntas.length} questões até agora` : ""}…`
        : "Lendo a prova e escrevendo os comentários…");

      /* Só as figuras deste lote: mandar as quarenta em toda chamada
         estouraria o pedido e pagaria pela mesma imagem várias vezes. */
      const daqui = figurasTodas.filter((f) => lotes[i].indexOf(`[[img:${f.nome}]]`) >= 0);

      const { dados, erro: falha } = await chamarApi(
        ROTA_PROVAS_IA, { token, texto: lotes[i], figuras: daqui }, "O comentador de provas");

      if (falha || !dados || dados.erro) {
        /* Um lote que falha não joga fora os anteriores: o que já veio
           vale, e a mensagem diz onde parou. */
        falhou = falha || (dados && dados.erro) || "";
        break;
      }
      juntas = juntarQuestoes(juntas, dados.questoes || []);
      if (!nomeDaProva && dados.prova) nomeDaProva = dados.prova;
      descartadas += Number(dados.descartadas) || 0;
      cortadaNoFim = !!dados.cortada;
    }

    setPasso("");

    if (!juntas.length) {
      setErro(falhou || "Não consegui comentar essa prova.");
      return;
    }

    setResultado({ prova: nomeDaProva, questoes: juntas, descartadas, cortada: cortadaNoFim });

    if (falhou) {
      notify(`Parei no meio: ${juntas.length} questões comentadas antes do erro. ${falhou}`);
    } else if (cortadaNoFim) {
      notify(`A resposta do último lote acabou antes do fim: vieram ${juntas.length} questões.`);
    }
    if (descartadas) {
      notify(`${descartadas} questão(ões) veio(ram) pela metade e ficou(aram) de fora.`);
    }
  };

  if (resultado) {
    const qs = resultado.questoes || [];
    const inseguras = qs.filter((q) => q.seguranca !== "alta").length;
    return (
      <div className="flex flex-col gap-5">
        <Card className="px-6 py-6" brilho="var(--warn)">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <H color="var(--warn)" icon={<FileText size={16} />}>
              {resultado.prova || "Prova comentada"}
            </H>
            <Btn size="sm" tone="outline" onClick={() => { setResultado(null); setTexto(""); }}>
              comentar outra
            </Btn>
          </div>
          <Texto style={{ marginTop: 10 }}>
            {qs.length} questões. Tente responder antes de abrir o comentário: a questão
            só vira estudo se você pensar nela primeiro.
          </Texto>
          {/* O aviso fica aqui em cima, e não escondido no rodapé: quem
              decora um gabarito errado sai pior do que entrou. */}
          <div className="mt-4 rounded-2xl px-4 py-3"
            style={{ background: soft("var(--warn)", 12), border: `1px solid ${soft("var(--warn)", 35)}` }}>
            <Mini style={{ color: "var(--warn)", lineHeight: 1.6 }}>
              Quem respondeu foi a IA, de cabeça, sem consultar fonte na hora. Cada questão
              diz o quanto ela está segura e em que se baseia.
              {inseguras ? ` ${inseguras} pede conferência antes de você decorar.` : ""}
            </Mini>
          </div>
        </Card>

        {/* ── publicar com código ────────────────────────────────────
          * Só do dono. O código é a chave: quem o recebe digita na aba
          * Provas e recebe esta mesma prova comentada, sem mandar arquivo
          * e sem gastar IA. Quem esconde a aba é a barra lateral; quem
          * decide de verdade é o servidor, que confere o e-mail do token. */}
        {souDono && !resultado.deCodigo ? (
          <Card className="px-6 py-6">
            <H size={18} color="var(--neon2)" icon={<Upload size={16} />}>Publicar por código</H>
            <Texto style={{ marginTop: 8 }}>
              Escolha um código e quem digitar ele na aba Provas recebe estas
              {" "}{qs.length} questões comentadas, sem precisar mandar arquivo nenhum.
            </Texto>
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              <TextInput value={codigoNovo} placeholder="provoes71" disabled={publicando}
                style={{ maxWidth: 200 }}
                onChange={(e) => setCodigoNovo(e.target.value)} />
              <TextInput value={descricao} placeholder="descrição (opcional)" disabled={publicando}
                style={{ flex: 1, minWidth: 180 }}
                onChange={(e) => setDescricao(e.target.value)} />
              <Btn tone="primary" size="sm" disabled={publicando || codigoNovo.trim().length < 3}
                onClick={publicar}>
                {publicando ? "Publicando…" : "Publicar"}
              </Btn>
            </div>
            <Mini style={{ marginTop: 10 }}>
              Letras e números, de 3 a 40. Maiúscula, acento e espaço não importam:
              quem digitar "PROVÕES 71" chega na mesma prova.
            </Mini>
          </Card>
        ) : null}

        {qs.map((q, i) => (
          <QuestaoDaProva key={i} q={q} n={q.numero || i + 1} total={qs.length} />
        ))}
      </div>
    );
  }

  return (
    <Card className="px-6 py-6" brilho="var(--warn)">
      <H color="var(--warn)" icon={<FileText size={16} />}>Provas</H>
      <Texto style={{ marginTop: 10 }}>
        Mande uma prova e receba cada questão reescrita, com a alternativa certa e o
        comentário de todas as alternativas, explicando o conteúdo. PDF, Word ou foto
        do caderno de questões.
      </Texto>

      {/* ── entrar por código ──────────────────────────────────────────
        * Vem antes do envio de arquivo de propósito: para quem recebeu um
        * código, este é o caminho inteiro — nada de mandar PDF, nada de
        * esperar a IA, nada de gastar cota. */}
      <div className="mt-5 rounded-2xl px-4 py-4"
        style={{ background: T.card2, border: `1px solid ${soft("var(--neon2)", 30)}` }}>
        <Label style={{ color: "var(--neon2)" }}>Tenho um código</Label>
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <TextInput value={codigo} placeholder="ex.: provoes71" disabled={!!passo}
            style={{ flex: 1, minWidth: 160 }}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") entrarPorCodigo(); }} />
          <Btn size="sm" disabled={!!passo || !codigo.trim()} onClick={entrarPorCodigo}>
            Abrir a prova
          </Btn>
        </div>
        <Mini style={{ marginTop: 8 }}>
          Prova já comentada, pronta para estudar.
        </Mini>
      </div>

      {/* ── as provas que o dono publicou ────────────────────────────── */}
      {souDono && publicadas.length ? (
        <div className="mt-5">
          <Label>Publicadas por você</Label>
          <div className="mt-3 flex flex-col gap-2">
            {publicadas.map((p) => (
              <div key={p.codigo} className="flex items-center justify-between gap-3 flex-wrap"
                style={{ background: T.card2, border: `1px solid ${T.line}`, borderRadius: 12, padding: "10px 14px" }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontFamily: F_MONO, fontWeight: 700, color: "var(--neon2)" }}>{p.codigo}</span>
                  <span style={{ color: T.dim, fontSize: 14 }}>
                    {" · "}{p.questoes} questões{p.prova ? ` · ${p.prova}` : ""}
                  </span>
                  {p.descricao ? <div style={{ fontSize: 13, color: T.dim }}>{p.descricao}</div> : null}
                </div>
                <Btn size="sm" tone="outline" onClick={() => despublicar(p.codigo)}>tirar do ar</Btn>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <Label>A prova</Label>
        <Area style={{ marginTop: 6, minHeight: 140 }} value={texto}
          placeholder="Cole aqui as questões, ou mande o arquivo no botão abaixo"
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
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <Btn size="sm" onClick={() => arquivoRef.current && arquivoRef.current.click()}>
            <Upload size={14} /> Mandar a prova
          </Btn>
          <Btn tone="primary" size="sm" disabled={!!passo || texto.trim().length < 60}
            onClick={comentar}>
            {passo ? "Um momento…" : "Comentar a prova"}
          </Btn>
        </div>
      </div>

      {passo ? <Mini style={{ marginTop: 12 }}>{passo}</Mini> : null}
      {erro ? <Label style={{ marginTop: 12, color: T.bad }}>{erro}</Label> : null}

      {!passo && !erro && texto.trim().length > 0 && texto.trim().length < 60 ? (
        <Mini style={{ marginTop: 12 }}>
          Ainda é pouco texto. Mande a prova inteira para eu conseguir separar as questões.
        </Mini>
      ) : null}
    </Card>
  );
}
