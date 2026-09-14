/* ═══════════════════════════════════════════════════════════════════
   32 · SIMULADOS DA SALA

   Onde os amigos comparam acerto em simulado. Usa as mesmas salas de
   estudo da aba Amigos — aqui é estudo, e quem compara hora estudada é
   quem compara nota de simulado.

   A regra que dá forma à aba: só vê o resultado dos outros quem lançou o
   próprio. Ela vale no servidor (/api/salas, ação sim-listar), não aqui:
   esconder na tela não esconderia nada, bastaria abrir a aba de rede do
   navegador para ler o número de todo mundo. Quem não lançou recebe uma
   resposta que nem traz os números.

   É uma troca, e é de propósito. Sem ela o simulado da sala viraria um
   lugar de observar o desempenho alheio sem expor o próprio, que é
   exatamente o que desanima quem foi mal e o que envaidece quem foi bem.
   ═══════════════════════════════════════════════════════════════════ */

const corDoAcertoSim = (pct) => (pct === null ? T.dim : pct >= 80 ? T.ok : pct >= 60 ? T.warn : T.bad);

function LancarNoSimulado({ sim, aoLancar }) {
  const [valor, setValor] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const mandar = async () => {
    const n = Math.round(Number(valor));
    if (!(n >= 0 && n <= sim.total)) return;
    setOcupado(true);
    await aoLancar(n);
    setOcupado(false);
    setValor("");
  };

  return (
    <div className="mt-4 flex items-center gap-2 flex-wrap">
      <TextInput style={{ maxWidth: 120 }} value={valor} inputMode="numeric"
        aria-label="Seus acertos" placeholder={`0 a ${sim.total}`}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") mandar(); }} />
      <Btn size="sm" tone="primary" disabled={ocupado || valor === ""} onClick={mandar}>
        {sim.meu ? "corrigir o meu" : "lançar o meu"}
      </Btn>
      {!sim.meu && sim.quantos ? (
        <Mini>{sim.quantos} já lançou{sim.quantos === 1 ? "" : "aram"} · lance o seu para ver</Mini>
      ) : null}
    </div>
  );
}

function CartaoSimulado({ sim, souDono, aoLancar, aoApagar }) {
  const pctMeu = sim.meu ? sim.meu.pct : null;
  return (
    <Card className="px-6 py-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <H size={18} color="var(--a-CI)" icon={<Flag size={16} />}>{sim.nome}</H>
        {souDono ? (
          <button type="button" aria-label="Apagar simulado" className="toque" onClick={aoApagar}
            style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer" }}>
            <Trash2 size={13} />
          </button>
        ) : null}
      </div>
      <Mini style={{ marginTop: 4 }}>
        {brDate(sim.data)} · {sim.total} questões
        {sim.porQuem ? ` · posto por ${sim.porQuem}` : ""}
      </Mini>

      {sim.meu ? (
        <div className="mt-4 rounded-2xl px-4 py-3" style={{ background: T.card2 }}>
          <div className="flex items-center gap-3 flex-wrap">
            <Num size={26} color={corDoAcertoSim(pctMeu)}>{sim.meu.acertos}</Num>
            <span className="flex-1 min-w-0">
              <Mini>de {sim.total}{pctMeu === null ? "" : ` · ${pctMeu}% de acerto`}</Mini>
            </span>
          </div>
        </div>
      ) : null}

      <LancarNoSimulado sim={sim} aoLancar={aoLancar} />

      {sim.liberado ? (
        <div className="mt-5 flex flex-col gap-2">
          {sim.linhas.map((x) => (
            <div key={x.uid} className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ background: x.souEu ? soft("var(--neon)", 12) : T.card2 }}>
              <span style={{ fontFamily: F_MONO, fontSize: 15, color: T.ghost, minWidth: 22 }}>{x.posicao}</span>
              <Face nome={x.nome} cor={corDoNome(x.nome)} tamanho={30} forte={x.souEu} />
              <span className="flex-1 min-w-0" style={{ fontSize: 15, fontWeight: x.souEu ? 700 : 600 }}>
                {x.nome}
              </span>
              <span style={{ fontFamily: F_MONO, fontSize: 15, color: corDoAcertoSim(x.pct) }}>
                {x.acertos}{x.pct === null ? "" : ` · ${x.pct}%`}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl px-4 py-3"
          style={{ background: soft("var(--warn)", 10), border: `1px solid ${soft("var(--warn)", 26)}` }}>
          <Mini style={{ lineHeight: 1.6, color: T.ink }}>
            O resultado dos outros aparece quando você lançar o seu. É troca: ninguém
            olha a nota alheia sem mostrar a própria.
          </Mini>
        </div>
      )}
    </Card>
  );
}

function NovoSimulado({ aoCriar, hoje }) {
  const [f, setF] = useState({ titulo: "", total: "", data: hoje });
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  if (!aberto) {
    return (
      <Card className="px-6 py-5">
        <Btn tone="primary" onClick={() => setAberto(true)}><Plus size={15} /> Novo simulado na sala</Btn>
      </Card>
    );
  }
  return (
    <Card className="px-6 py-6">
      <H size={18} color="var(--neon)" icon={<Plus size={16} />}>Novo simulado</H>
      <Label style={{ marginTop: 6 }}>
        todo mundo da sala lança o próprio acerto neste mesmo simulado
      </Label>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <Label>Nome</Label>
          <TextInput style={{ marginTop: 4 }} value={f.titulo} placeholder="Ex.: Simulado USP 2025"
            onChange={(e) => setF((p) => ({ ...p, titulo: e.target.value }))} />
        </div>
        <div>
          <Label>Questões</Label>
          <TextInput style={{ marginTop: 4 }} value={f.total} inputMode="numeric" placeholder="100"
            onChange={(e) => setF((p) => ({ ...p, total: e.target.value }))} />
        </div>
        <div>
          <Label>Data</Label>
          <TextInput style={{ marginTop: 4 }} type="date" value={f.data}
            onChange={(e) => setF((p) => ({ ...p, data: e.target.value }))} />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Btn tone="primary" disabled={ocupado || !f.titulo.trim()} onClick={async () => {
          setOcupado(true);
          const deuCerto = await aoCriar(f);
          setOcupado(false);
          if (deuCerto) { setF({ titulo: "", total: "", data: hoje }); setAberto(false); }
        }}>{ocupado ? "Criando…" : "Criar"}</Btn>
        <Btn tone="outline" onClick={() => setAberto(false)}>cancelar</Btn>
      </div>
    </Card>
  );
}

/* Criar ou entrar numa sala DE SIMULADO.
 *
 * Sala própria, com nome e senha próprios. Quem faz os mesmos simulados
 * que você não é necessariamente quem estuda com você nem quem treina com
 * você: costuma ser quem faz o mesmo cursinho, ou quem presta a mesma
 * prova. Juntar tudo numa sala só obrigaria cada grupo a ver o placar dos
 * outros dois.
 *
 * A tela é a mesma das outras duas de propósito: quem já entrou numa sala
 * não precisa aprender um segundo jeito de fazer a mesma coisa. */
function SalaDeSimulado({ nuvem, notify, aoEntrar, erro: erroDeFora }) {
  const [form, setForm] = useState({ nome: "", senha: "" });
  const [modo, setModo] = useState("entrar");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const enviar = async () => {
    if (!form.nome.trim()) { setErro("Escreva o nome da sala."); return; }
    if (form.senha.length < 4) { setErro("A senha precisa ter pelo menos 4 caracteres."); return; }
    setOcupado(true); setErro("");
    const j = await falarComSalas(nuvem, {
      tipo: "simulado", acao: modo, nome: form.nome.trim(), senha: form.senha,
    });
    setOcupado(false);
    if (j.erro) { setErro(j.erro); return; }
    notify(j.mensagem || "Pronto.");
    setForm({ nome: "", senha: "" });
    aoEntrar(j.slug);
  };

  return (
    <Card className="px-6 py-6" brilho="var(--a-CI)">
      <H color="var(--a-CI)" icon={<Flag size={16} />}>Sala de simulados</H>
      <Texto style={{ marginTop: 10 }}>
        Combine um nome e uma senha com quem faz os mesmos simulados que você. É
        uma sala só de simulado, separada das salas de estudo e das de treino.
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
          <TextInput style={{ marginTop: 6 }} value={form.nome} placeholder="Ex.: turma do Medcurso"
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

function Simulados({ nuvem, notify, irPara }) {
  const [salas, setSalas] = useState(null);
  const [slug, setSlug] = useState("");
  const [lista, setLista] = useState(null);
  const [souDono, setSouDono] = useState(false);
  const [erro, setErro] = useState("");
  const hoje = todayISO();
  const refNuvem = useRef(nuvem);
  refNuvem.current = nuvem;
  const logado = !!(nuvem && nuvem.usuario);
  const meuUid = logado ? nuvem.usuario.uid : "";

  const recarregarSalas = useCallback(async (escolher) => {
    const j = await falarComSalas(refNuvem.current, { tipo: "simulado", acao: "minhas" });
    if (j.erro) { setErro(j.erro); setSalas([]); return; }
    setSalas(j.salas || []);
    setSlug((p) => escolher || p || ((j.salas || [])[0] || {}).slug || "");
  }, []);

  useEffect(() => { if (meuUid) recarregarSalas(); }, [meuUid, recarregarSalas]);

  const carregar = useCallback(async (qual) => {
    if (!qual) return;
    const j = await falarComSalas(refNuvem.current, { tipo: "simulado", acao: "sim-listar", nome: qual });
    if (j.erro) { setErro(j.erro); return; }
    setLista(j.simulados || []);
    setErro("");
    /* Quem criou a sala é quem pode apagar simulado. O cabeçalho do
       ranking já sabe disso, então vem de lá em vez de um campo novo. */
    const r = await falarComSalas(refNuvem.current, { tipo: "simulado", acao: "ranking", nome: qual });
    setSouDono(!!(r && r.sala && r.sala.souDono));
  }, []);

  useEffect(() => { carregar(slug); }, [slug, carregar]);

  if (!logado) {
    return (
      <Card className="px-6 py-12 text-center" brilho="var(--a-CI)">
        <div className="flex justify-center" style={{ color: "var(--a-CI)" }}>
          <span className="flex items-center justify-center rounded-full"
            style={{ width: 56, height: 56, background: soft("var(--a-CI)", 16) }}>
            <Flag size={24} />
          </span>
        </div>
        <h2 style={{ fontFamily: F_SERIF, fontSize: 24, fontWeight: 400, margin: "18px 0 0", color: T.ink }}>
          Comparar simulado com os amigos
        </h2>
        <p style={{ color: T.dim, fontSize: 15, lineHeight: 1.65, marginTop: 10, maxWidth: 430, marginLeft: "auto", marginRight: "auto" }}>
          Crie uma conta em Configurações para lançar os seus acertos e ver os de quem
          estuda com você.
        </p>
      </Card>
    );
  }

  if (salas === null) return <Card className="px-6 py-6"><Mini>carregando as suas salas…</Mini></Card>;

  if (!salas.length) return <SalaDeSimulado {...{ nuvem, notify, aoEntrar: recarregarSalas, erro }} />;

  const mandar = async (corpo) => {
    const j = await falarComSalas(refNuvem.current, { tipo: "simulado", ...corpo, nome: slug });
    if (j.erro) { setErro(j.erro); return false; }
    setErro("");
    await carregar(slug);
    return true;
  };

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-6" brilho="var(--a-CI)">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <H color="var(--a-CI)" icon={<Flag size={16} />}>Simulados da sala</H>
          {salas.length > 1 ? (
            <select value={slug} onChange={(e) => setSlug(e.target.value)} style={{ ...inp, maxWidth: 220 }}>
              {salas.map((s) => <option key={s.slug} value={s.slug}>{s.nome}</option>)}
            </select>
          ) : null}
        </div>
        <Texto style={{ marginTop: 10 }}>
          Alguém cria o simulado, todo mundo lança o próprio acerto e o placar aparece.
          Você só vê o resultado dos outros depois de lançar o seu, e isso vale para todo
          mundo: ninguém olha a nota alheia sem mostrar a própria.
        </Texto>
        {erro ? <Label style={{ marginTop: 12, color: T.bad }}>{erro}</Label> : null}
      </Card>

      <NovoSimulado hoje={hoje} aoCriar={(f) => mandar({
        acao: "sim-criar", titulo: f.titulo.trim(), total: Number(f.total), data: f.data,
      })} />

      {lista && !lista.length ? (
        <Card className="px-6 py-6">
          <Blank icon={<Flag size={22} />} title="Nenhum simulado ainda"
            hint="Crie o primeiro e chame a sala para lançar o acerto." />
        </Card>
      ) : null}

      {(lista || []).map((sim) => (
        <CartaoSimulado key={sim.id} sim={sim} souDono={souDono}
          aoLancar={(acertos) => mandar({ acao: "sim-lancar", id: sim.id, acertos })}
          aoApagar={async () => {
            if (await mandar({ acao: "sim-apagar", id: sim.id })) notify("Simulado apagado.");
          }} />
      ))}
    </div>
  );
}
