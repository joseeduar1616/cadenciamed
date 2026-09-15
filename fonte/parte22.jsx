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

function CartaoDupla({ d, nuvem, notify, aoMudar, aoDuelar }) {
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
        <Face nome={d.nome} cor={corDoNome(d.nome)} tamanho={36} forte={d.estudando} />
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
        {d.aceita && !d.foco ? (
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

/* ── montar o duelo ──────────────────────────────────────────────────── */

function MontarDuelo({ dupla, nuvem, notify, aoComecar, aoFechar }) {
  const [texto, setTexto] = useState("");
  const [quantas, setQuantas] = useState(10);
  const [segundos, setSegundos] = useState(45);
  const [passo, setPasso] = useState("");
  const [erro, setErro] = useState("");
  const arquivoRef = useRef(null);

  const comecar = async () => {
    setErro(""); setPasso("Escrevendo as questões…");
    let token = "";
    try {
      if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
        token = await nuvem.sdk.auth.currentUser.getIdToken();
      }
    } catch (e) { /* segue */ }
    if (!token) { setPasso(""); setErro("Entre na sua conta."); return; }

    const { dados, erro: falhou } = await chamarApi(
      ROTA_QUESTOES_IA, { token, texto, quantas }, "O montador de questões");
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
      tema: dados.tema, questoes: dados.questoes,
    });
    setPasso("");
    if (j.erro) { setErro(j.erro); return; }
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
          accept=".pdf,.docx,.txt,.md,application/pdf,text/plain"
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
        <div className="mt-3">
          <Btn size="sm" onClick={() => arquivoRef.current && arquivoRef.current.click()}>
            <Upload size={14} /> Mandar um arquivo
          </Btn>
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
    setD(j.duelo);
    setErro("");
  }, [dupla.id]);

  /* O relógio é do servidor, então a tela pergunta de segundo em segundo
     onde o duelo está. Contar sozinho aqui deixaria as duas pessoas em
     questões diferentes assim que uma delas tivesse a rede mais lenta. */
  useEffect(() => {
    puxar();
    const t = window.setInterval(() => puxar(), RITMO_DUELO);
    return () => window.clearInterval(t);
  }, [puxar]);

  if (erro) {
    return (
      <Card className="px-6 py-6">
        <Label style={{ color: T.bad }}>{erro}</Label>
        <div className="mt-4"><Btn size="sm" onClick={aoSair}>voltar</Btn></div>
      </Card>
    );
  }
  if (!d) return <Card className="px-6 py-6"><Mini>carregando o duelo…</Mini></Card>;

  const responder = (i) => puxar({ acao: "duelo-responder", n: d.indice, escolha: i });
  const minhaEscolha = d.minhas[d.indice];

  if (d.acabou) {
    const meu = d.placar.find((x) => x.nome && x.uid) || null;
    return (
      <div className="flex flex-col gap-5">
        <Card className="px-6 py-6" brilho="var(--neon)">
          <H color="var(--neon)" icon={<Trophy size={16} />}>Fim do duelo</H>
          {d.tema ? <Label style={{ marginTop: 4 }}>{d.tema}</Label> : null}
          <div className="mt-5 flex flex-col gap-2">
            {d.placar.map((x, i) => (
              <div key={x.uid} className="rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{ background: i === 0 ? soft("var(--ok)", 14) : T.card2 }}>
                <span style={{ fontFamily: F_MONO, fontSize: 15, color: T.ghost, minWidth: 22 }}>{i + 1}</span>
                <Face nome={x.nome} cor={corDoNome(x.nome)} tamanho={32} />
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
      </div>
    );
  }

  return (
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
    </Card>
  );
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
    const t = window.setInterval(carregar, 45000);
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
            aoMudar={carregar} aoDuelar={(x) => setMontando(x)} />
        ))}
      </div>
      {erro ? <Label style={{ marginTop: 12, color: T.bad }}>{erro}</Label> : null}
    </Card>
  );
}
