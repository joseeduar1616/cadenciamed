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

      <p style={{ fontSize: 15.5, lineHeight: 1.7, color: T.ink, margin: "12px 0 0" }}>
        {q.enunciado}
      </p>

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

/* ── a aba ──────────────────────────────────────────────────────────── */

function Provas({ nuvem, notify }) {
  const [texto, setTexto] = useState("");
  const [passo, setPasso] = useState("");
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState(null);
  const arquivoRef = useRef(null);

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

    const { dados, erro: falhou } = await chamarApi(
      ROTA_PROVAS_IA, { token, texto }, "O comentador de provas");
    setPasso("");
    if (falhou || !dados || dados.erro) {
      setErro(falhou || (dados && dados.erro) || "Não consegui comentar essa prova.");
      return;
    }
    setResultado(dados);
    /* Prova comentada é a resposta mais longa do site: enunciado reescrito,
       alternativas e um comentário para cada uma, vezes o número de
       questões. Ela encosta no teto de saída da IA, e aí o resto da prova
       não vem. Dizer isso evita a conclusão errada — de que o site perdeu
       metade da prova — e já diz o que fazer. */
    if (dados.cortada) {
      notify(`A resposta da IA acabou antes do fim da prova: vieram ${(dados.questoes || []).length} questões comentadas. Mande o resto em outra leva.`);
    }
    if (dados.descartadas) {
      notify(`${dados.descartadas} questão(ões) veio(ram) pela metade e ficou(aram) de fora.`);
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
