/* ═══════════════════════════════════════════════════════════════════
   33 · PAINEL DE DESENVOLVEDOR E LEMBRETES

   Duas coisas que não têm a ver uma com a outra, juntas porque as duas
   moram em Configurações.

   · Desenvolvedor: só para o e-mail em DONOS, e a conferência de verdade
     é do servidor (/api/acessos confere o token com o Google antes de
     qualquer coisa). Esconder a tela aqui é conveniência; o que protege
     é a rota.

   · Lembretes: a notificação do navegador para a revisão do dia e o
     bloco que vai começar. Fica no aparelho, sem servidor nenhum.
   ═══════════════════════════════════════════════════════════════════ */

const PLANOS_CUPOM = [
  ["semanal", "1 semana"], ["mensal", "1 mês"], ["anual", "1 ano"], ["vitalicio", "vitalício"],
];

function Cupons({ nuvem, notify }) {
  const [lista, setLista] = useState(null);
  const [f, setF] = useState({ codigo: "", plano: "anual", maxUsos: "" });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const refNuvem = useRef(nuvem);
  refNuvem.current = nuvem;

  const chamar = useCallback(async (corpo) => {
    let token = "";
    try {
      const n = refNuvem.current;
      if (n && n.sdk && n.sdk.auth && n.sdk.auth.currentUser) {
        token = await n.sdk.auth.currentUser.getIdToken();
      }
    } catch (e) { /* sem conta, a rota recusa */ }
    if (!token) return { erro: "Entre na sua conta." };
    const { dados, erro: falhou } = await chamarApi(ROTA_ACESSOS, { ...corpo, token }, "O painel");
    return falhou ? { erro: falhou } : (dados || {});
  }, []);

  const carregar = useCallback(async () => {
    const j = await chamar({ acao: "cupons" });
    if (j.erro) { setErro(j.erro); return; }
    setLista(j.cupons || []);
    setErro("");
  }, [chamar]);

  useEffect(() => { carregar(); }, [carregar]);

  const criar = async () => {
    setOcupado(true);
    const j = await chamar({
      acao: "cupom-criar", codigo: f.codigo, plano: f.plano,
      maxUsos: Number(f.maxUsos) || 0,
    });
    setOcupado(false);
    if (j.erro) { setErro(j.erro); return; }
    notify(`Cupom ${j.codigo} criado.`);
    setF({ codigo: "", plano: "anual", maxUsos: "" });
    carregar();
  };

  return (
    <Card className="px-6 py-6">
      <H size={18} color="var(--warn)" icon={<Zap size={16} />}>Cupons</H>
      <Label style={{ marginTop: 6, lineHeight: 1.6 }}>
        Criados aqui, valem na hora. Antes eles viviam numa variável do servidor e
        criar um exigia publicar o site de novo.
      </Label>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label>Código</Label>
          <TextInput style={{ marginTop: 4 }} value={f.codigo} placeholder="ex.: medeasy10"
            onChange={(e) => setF((p) => ({ ...p, codigo: e.target.value }))} />
        </div>
        <div>
          <Label>Libera</Label>
          <select value={f.plano} style={{ ...inp, marginTop: 4 }}
            onChange={(e) => setF((p) => ({ ...p, plano: e.target.value }))}>
            {PLANOS_CUPOM.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
        </div>
        <div>
          <Label>Limite de usos</Label>
          <TextInput style={{ marginTop: 4 }} value={f.maxUsos} inputMode="numeric" placeholder="vazio = sem limite"
            onChange={(e) => setF((p) => ({ ...p, maxUsos: e.target.value }))} />
        </div>
      </div>
      <div className="mt-4">
        <Btn tone="primary" size="sm" disabled={ocupado || f.codigo.trim().length < 4} onClick={criar}>
          <Plus size={14} /> {ocupado ? "Criando…" : "Criar cupom"}
        </Btn>
      </div>

      {lista && lista.length ? (
        <div className="mt-5 flex flex-col gap-2">
          {lista.map((c) => (
            <div key={c.codigo} className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ background: T.card2 }}>
              <span className="flex-1 min-w-0" style={{ fontFamily: F_MONO, fontSize: 14.5 }}>{c.codigo}</span>
              <Mini>
                {(PLANOS_CUPOM.find((x) => x[0] === c.plano) || [, c.plano])[1]}
                {" · "}{c.usos} uso{c.usos === 1 ? "" : "s"}
                {c.maxUsos ? ` de ${c.maxUsos}` : ""}
              </Mini>
              <button type="button" aria-label={`Apagar cupom ${c.codigo}`} className="toque"
                onClick={async () => {
                  const j = await chamar({ acao: "cupom-apagar", codigo: c.codigo });
                  if (j.erro) { setErro(j.erro); return; }
                  notify("Cupom apagado.");
                  carregar();
                }}
                style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer" }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {lista && !lista.length ? (
        <Mini style={{ marginTop: 14 }}>nenhum cupom criado por aqui ainda</Mini>
      ) : null}
      {erro ? <Label style={{ marginTop: 12, color: T.bad }}>{erro}</Label> : null}
    </Card>
  );
}

/* Quais variáveis do Worker estão preenchidas, e se cada rota /api
   responde. Não mostra valor nenhum: só o "tem ou não tem".

   Isto existe por experiência própria. A /api/treino-ia ficou um dia
   inteiro respondendo 404 porque faltava registrá-la no roteador, e do
   lado de fora isso aparece como "não consegui falar com o servidor" —
   igualzinho a falta de internet. Uma linha verde ou vermelha por rota
   responde isso em dois segundos. */
const ROTAS_DO_SITE = [
  "/api/assistente", "/api/flashcards-ia", "/api/cronograma-ia", "/api/treino-ia",
  "/api/ler-foto", "/api/buscar-imagem", "/api/salas", "/api/baralhos",
  "/api/google", "/api/notion", "/api/mentor", "/api/plano", "/api/cupom",
  "/api/acessos", "/api/compra",
];

function SaudeDoSite({ nuvem }) {
  const [variaveis, setVariaveis] = useState(null);
  const [rotas, setRotas] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const refNuvem = useRef(nuvem);
  refNuvem.current = nuvem;

  const conferir = async () => {
    setOcupado(true);
    let token = "";
    try {
      const n = refNuvem.current;
      if (n && n.sdk && n.sdk.auth && n.sdk.auth.currentUser) {
        token = await n.sdk.auth.currentUser.getIdToken();
      }
    } catch (e) { /* segue */ }
    const { dados } = await chamarApi(ROTA_ACESSOS, { acao: "saude", token }, "O painel");
    setVariaveis((dados && dados.variaveis) || []);

    /* Um POST vazio em cada rota. 404 é rota que não existe (o defeito que
       isto procura); 400/401/403 é rota viva recusando um pedido vazio,
       que é exatamente o esperado. */
    const fora = [];
    for (const caminho of ROTAS_DO_SITE) {
      let status = 0;
      try {
        const r = await fetch(caminho, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
        });
        status = r.status;
      } catch (e) { status = 0; }
      fora.push({ caminho, status, viva: status > 0 && status !== 404 && status !== 405 });
    }
    setRotas(fora);
    setOcupado(false);
  };

  return (
    <Card className="px-6 py-6">
      <H size={18} color="var(--ok)" icon={<Stethoscope size={16} />}>Saúde do site</H>
      <Label style={{ marginTop: 6, lineHeight: 1.6 }}>
        Diz quais variáveis do servidor estão preenchidas e se cada rota responde.
        Nunca mostra o valor de nenhuma chave.
      </Label>
      <div className="mt-4">
        <Btn size="sm" disabled={ocupado} onClick={conferir}>
          <RefreshCw size={14} /> {ocupado ? "Conferindo…" : "Conferir agora"}
        </Btn>
      </div>

      {variaveis ? (
        <div className="mt-5">
          <Label>Variáveis do servidor</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {variaveis.map(([nome, tem]) => (
              <span key={nome} className="rounded-2xl px-3 py-1.5"
                style={{
                  background: soft(tem ? "var(--ok)" : "var(--bad)", 14),
                  color: tem ? T.ok : T.bad, fontFamily: F_MONO, fontSize: 12,
                }}>
                {tem ? "✓" : "✗"} {nome}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {rotas ? (
        <div className="mt-5">
          <Label>Rotas</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {rotas.map((r) => (
              <span key={r.caminho} className="rounded-2xl px-3 py-1.5"
                style={{
                  background: soft(r.viva ? "var(--ok)" : "var(--bad)", 14),
                  color: r.viva ? T.ok : T.bad, fontFamily: F_MONO, fontSize: 12,
                }}>
                {r.caminho.replace("/api/", "")} {r.status || "sem resposta"}
              </span>
            ))}
          </div>
          <Mini style={{ marginTop: 10, lineHeight: 1.6 }}>
            403 e 400 são rota viva recusando um pedido vazio, que é o certo.
            404 é rota que não existe: falta registrar no roteador do Worker.
          </Mini>
        </div>
      ) : null}
    </Card>
  );
}

/* O que o servidor responde sobre a ligação permanente do Google, cru.
 *
 * Existe porque "o Google não conecta" é a queixa mais difícil de
 * diagnosticar à distância: o mesmo sintoma na tela sai de conta não
 * ligada, credencial faltando no servidor, janela bloqueada pelo navegador
 * e origem não liberada no console do Google. Estas três linhas separam os
 * quatro casos em um clique. */
function DiagnosticoGoogle({ nuvem }) {
  const [r, setR] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const refNuvem = useRef(nuvem);
  refNuvem.current = nuvem;

  const conferir = async () => {
    setOcupado(true);
    let token = "";
    try {
      const n = refNuvem.current;
      if (n && n.sdk && n.sdk.auth && n.sdk.auth.currentUser) {
        token = await n.sdk.auth.currentUser.getIdToken();
      }
    } catch (e) { /* segue */ }
    const { dados, erro } = await chamarApi("/api/google", { acao: "estado", token }, "A ligação com o Google");
    setR(erro ? { erro } : (dados || {}));
    setOcupado(false);
  };

  const linha = (rotulo, valor, bom) => (
    <div className="flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5"
      style={{ background: T.card2 }}>
      <Mini>{rotulo}</Mini>
      <span style={{ fontFamily: F_MONO, fontSize: 13, color: bom ? T.ok : T.warn }}>{valor}</span>
    </div>
  );

  return (
    <Card className="px-6 py-6">
      <H size={18} color="var(--a-GO)" icon={<CalendarDays size={16} />}>Google, por dentro</H>
      <Label style={{ marginTop: 6, lineHeight: 1.6 }}>
        O que o servidor responde sobre a sua ligação permanente.
      </Label>
      <div className="mt-4">
        <Btn size="sm" disabled={ocupado} onClick={conferir}>
          <RefreshCw size={14} /> {ocupado ? "Conferindo…" : "Conferir agora"}
        </Btn>
      </div>
      {r ? (
        <div className="mt-4 flex flex-col gap-2">
          {linha("este site sabe ligar de vez", r.disponivel === false ? "não" : "sim", r.disponivel !== false)}
          {linha("a sua conta está ligada", r.ligado ? "sim" : "não", !!r.ligado)}
          {r.email ? linha("conta do Google ligada", r.email, true) : null}
          {r.erro ? linha("erro", String(r.erro).slice(0, 80), false) : null}
          <Mini style={{ marginTop: 6, lineHeight: 1.6 }}>
            "sabe ligar" em não quer dizer GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET
            faltando no Worker. "sua conta ligada" em não com "sabe ligar" em sim quer
            dizer que falta clicar em Ligar a conta de vez na aba Agenda.
          </Mini>
        </div>
      ) : null}
    </Card>
  );
}

/* ── quem vê o quê ─────────────────────────────────────────────────────
 *
 * Cada aba do site tem uma regra: todo mundo, quem assina, ou só você.
 * A regra é gravada no servidor e é lá que ela vale — /api/plano lê daqui
 * para dizer à tela o que desenhar. Esconder a aba no navegador, que era o
 * que existia antes, não fecha nada: quem soubesse o nome chegava nela.
 *
 * Mudar aqui vale na hora para quem abrir o site depois; quem já está com
 * ele aberto pega na próxima conferência de plano.
 */
const COMO_LER = {
  todos: { rotulo: "Todo mundo", cor: "var(--ok)" },
  pro: { rotulo: "Quem assina", cor: "var(--neon)" },
  dono: { rotulo: "Só você", cor: "var(--warn)" },
};

function QuemVeOQue({ nuvem, notify }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState("");
  const refNuvem = useRef(nuvem);
  refNuvem.current = nuvem;

  const chamar = useCallback(async (corpo) => {
    let token = "";
    try {
      const n = refNuvem.current;
      if (n && n.sdk && n.sdk.auth && n.sdk.auth.currentUser) {
        token = await n.sdk.auth.currentUser.getIdToken();
      }
    } catch (e) { /* sem conta, a rota recusa */ }
    if (!token) return { erro: "Entre na sua conta." };
    const { dados, erro: falhou } = await chamarApi(ROTA_ACESSOS, { ...corpo, token }, "O painel de acessos");
    return falhou ? { erro: falhou } : (dados || {});
  }, []);

  const carregar = useCallback(async () => {
    const j = await chamar({ acao: "recursos" });
    if (j.erro) { setErro(j.erro); setLista([]); return; }
    setLista(j.recursos || []);
    setErro("");
  }, [chamar]);

  useEffect(() => { carregar(); }, [carregar]);

  const definir = async (id, regra) => {
    setOcupado(id);
    const j = await chamar({ acao: "recursos-definir", id, regra });
    setOcupado("");
    if (j.erro) { notify(j.erro); return; }
    notify(j.mensagem || "Pronto.");
    carregar();
  };

  return (
    <Card className="px-6 py-5" brilho="var(--neon2)">
      <H color="var(--neon2)" icon={<Eye size={16} />}>Quem vê o quê</H>
      <Texto style={{ marginTop: 8 }}>
        A regra de cada aba. Vale no servidor: aba fechada não aparece na barra e
        também não entrega os dados dela.
      </Texto>

      {lista === null ? <Mini style={{ marginTop: 14 }}>carregando…</Mini> : null}

      <div className="mt-4 flex flex-col gap-2">
        {(lista || []).map((r) => (
          <div key={r.id} className="rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap"
            style={{ background: T.card2 }}>
            <span className="flex-1 min-w-0">
              <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{r.nome}</span>
              <Mini>
                {r.mudado ? `mudado por você · o padrão é ${COMO_LER[r.padrao].rotulo.toLowerCase()}` : "no padrão"}
              </Mini>
            </span>
            <span className="flex gap-1.5 flex-wrap">
              {Object.entries(COMO_LER).map(([id, c]) => (
                <Btn key={id} size="sm" disabled={ocupado === r.id}
                  tone={r.regra === id ? "primary" : "quiet"}
                  onClick={() => definir(r.id, id)}>{c.rotulo}</Btn>
              ))}
            </span>
          </div>
        ))}
      </div>
      {erro ? <Label style={{ marginTop: 12, color: T.bad }}>{erro}</Label> : null}
    </Card>
  );
}

function PainelDesenvolvedor({ nuvem, notify }) {
  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-5" brilho="var(--warn)">
        <H color="var(--warn)" icon={<Settings2 size={16} />}>Desenvolvedor</H>
        <Mini style={{ marginTop: 6, lineHeight: 1.6 }}>
          só a sua conta enxerga esta parte · quem confere de verdade é o servidor,
          que lê o token antes de qualquer coisa
        </Mini>
      </Card>
      <QuemVeOQue nuvem={nuvem} notify={notify} />
      <Cupons nuvem={nuvem} notify={notify} />
      <PainelDono nuvem={nuvem} notify={notify} />
      <SaudeDoSite nuvem={nuvem} />
      <DiagnosticoGoogle nuvem={nuvem} />
    </div>
  );
}

/* ── lembretes ─────────────────────────────────────────────────────────
 *
 * Notificação do navegador para o que vence hoje e para o bloco que vai
 * começar. Mora no aparelho: nada de servidor, nada de push — o site não
 * tem servidor acordado para empurrar notificação, e prometer isso seria
 * mentira. O que existe de verdade é: com o site aberto numa aba (ou
 * instalado no celular), ele avisa na hora.
 *
 * A permissão só é pedida quando a pessoa liga o lembrete. Pedir de saída,
 * antes de a pessoa saber o que é, é o jeito mais rápido de ouvir "não"
 * para sempre — o navegador lembra a recusa.
 */
const CHAVE_AVISADOS = "cadencia:v3:avisados";

function lerAvisados() {
  try { return JSON.parse(window.localStorage.getItem(CHAVE_AVISADOS) || "{}"); }
  catch (e) { return {}; }
}
function gravarAvisados(v) {
  try { window.localStorage.setItem(CHAVE_AVISADOS, JSON.stringify(v)); } catch (e) { /* noop */ }
}

function podeNotificar() {
  return typeof window !== "undefined" && "Notification" in window;
}

/* O site instalado na tela de início. No iPhone isso não é detalhe: lá a
   notificação SÓ existe para o site instalado, e pedir permissão no
   Safari comum falha sem dizer por quê. A tela precisa saber disso para
   explicar o que fazer, em vez de mostrar um botão que não funciona. */
function instalado() {
  try {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
      || window.navigator.standalone === true;
  } catch (e) { return false; }
}

function ehIOS() {
  try {
    const ua = String(window.navigator.userAgent || "");
    return /iPad|iPhone|iPod/.test(ua)
      || (/Mac/.test(ua) && typeof document !== "undefined" && "ontouchend" in document);
  } catch (e) { return false; }
}

/* Como a notificação é mostrada.
 *
 * Pelo service worker, e não por "new Notification".
 *
 * Isto não é preferência: no Chrome do Android o construtor Notification
 * simplesmente LANÇA ("Illegal constructor"), e só o showNotification do
 * registro funciona. Como a chamada estava dentro de um try que engolia o
 * erro, no Android o lembrete nunca aparecia e nada acusava nada — a
 * pessoa ligava o aviso, via "ligados" na tela, e não recebia aviso
 * nenhum. O construtor fica de reserva para o computador.
 *
 * O "tag" separa um aviso do outro. Era o título, e dois blocos com o
 * mesmo nome no mesmo dia se substituíam: o segundo "Anatomia" apagava o
 * primeiro em vez de aparecer. */
async function avisar(titulo, corpo, marca) {
  if (!podeNotificar() || Notification.permission !== "granted") return false;
  const opcoes = {
    body: corpo,
    icon: "/icone-192.png",
    badge: "/icone-192.png",
    tag: marca || titulo,
  };
  try {
    if (navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(titulo, opcoes);
        return true;
      }
    }
  } catch (e) { /* cai na reserva abaixo */ }
  try {
    const n = new Notification(titulo, opcoes);
    window.setTimeout(() => { try { n.close(); } catch (e) { /* noop */ } }, 12000);
    return true;
  } catch (e) {
    return false;
  }
}

/* Roda com o site aberto e avisa uma vez por coisa por dia.
 *
 * "Uma vez por dia" é guardado por chave no próprio aparelho, e não no
 * estado do app: a notificação é do aparelho, e sincronizar isso faria o
 * computador engolir o aviso que o celular já mostrou. */
function useLembretes({ ligado, vencendoHoje, blocosHoje, today }) {
  const blocosRef = useRef(blocosHoje);
  blocosRef.current = blocosHoje;
  const vencendoRef = useRef(vencendoHoje);
  vencendoRef.current = vencendoHoje;

  useEffect(() => {
    if (!ligado || !podeNotificar()) return undefined;

    const rodar = () => {
      if (Notification.permission !== "granted") return;
      const avisados = lerAvisados();
      const agora = new Date();
      const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

      /* As revisões do dia, uma vez só, a partir das 7h: antes disso o
         aviso chega enquanto a pessoa dorme e é descartado pelo sistema. */
      const chaveRev = `rev:${today}`;
      if (vencendoRef.current > 0 && minutosAgora >= 420 && !avisados[chaveRev]) {
        avisados[chaveRev] = 1;
        gravarAvisados(avisados);
        avisar("Revisões de hoje",
          `${vencendoRef.current} ${vencendoRef.current === 1 ? "aula vence" : "aulas vencem"} hoje.`,
          chaveRev);
      }

      /* O bloco que começa nos próximos 10 minutos. */
      for (const b of blocosRef.current || []) {
        const [h, m] = String(b.start || "").split(":").map(Number);
        if (!Number.isFinite(h)) continue;
        const inicio = h * 60 + (m || 0);
        const faltam = inicio - minutosAgora;
        const chave = `bloco:${today}:${b.id}`;
        if (faltam >= 0 && faltam <= 10 && !avisados[chave]) {
          avisados[chave] = 1;
          gravarAvisados(avisados);
          avisar(b.label || "Bloco da agenda",
            faltam === 0 ? "Começa agora." : `Começa em ${faltam} min.`,
            chave);
        }
      }
    };

    rodar();
    const t = window.setInterval(rodar, 60000);
    /* Voltar para a aba depois de um tempo fora é quando mais adianta
       conferir: o navegador segura o timer em segundo plano. */
    const aoVoltar = () => { if (document.visibilityState === "visible") rodar(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [ligado, today]);
}

function Lembretes({ data, setData, notify }) {
  const ligado = !!(data.lembretes && data.lembretes.ligado);
  const [permissao, setPermissao] = useState(
    podeNotificar() ? Notification.permission : "indisponivel");
  const [testando, setTestando] = useState(false);

  /* A permissão pode mudar FORA daqui: pelo cadeado ao lado do endereço,
     por outra aba, pelos ajustes do sistema. Lida uma vez só, a tela
     passava a mentir — dizia "recusado" para quem tinha acabado de
     liberar, e o botão continuava travado. */
  useEffect(() => {
    if (!podeNotificar()) return undefined;
    const conferir = () => setPermissao(Notification.permission);
    conferir();
    const aoVoltar = () => { if (document.visibilityState === "visible") conferir(); };
    document.addEventListener("visibilitychange", aoVoltar);
    const t = window.setInterval(conferir, 3000);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.clearInterval(t);
    };
  }, []);

  /* No iPhone a notificação só existe para o site instalado na tela de
     início. Antes disso o botão pedir permissão falha calado, e a pessoa
     fica achando que o site é que está quebrado. */
  const precisaInstalar = ehIOS() && !instalado();

  const ligar = async () => {
    if (!podeNotificar()) return;
    let p = Notification.permission;
    if (p === "default") {
      try { p = await Notification.requestPermission(); } catch (e) { p = "denied"; }
      setPermissao(p);
    }
    if (p !== "granted") {
      notify("O navegador não liberou as notificações para este site.");
      return;
    }
    setData((x) => ({ ...x, lembretes: { ...(x.lembretes || {}), ligado: true } }));
    /* O aviso de teste sai na hora, e a tela CONFERE se ele saiu. Dizer
       "ligados" sem ter conseguido mostrar nada é a forma mais rápida de
       a pessoa descobrir que não funciona só no dia em que precisava. */
    const foi = await avisar("Lembretes ligados", "É assim que eles vão aparecer.", "teste");
    if (!foi) {
      notify("Liguei, mas este navegador não deixou mostrar o aviso de teste.");
    }
  };

  const testar = async () => {
    setTestando(true);
    const foi = await avisar("Teste do Cadência",
      "Se você está lendo isto, os lembretes funcionam neste aparelho.", "teste");
    setTestando(false);
    notify(foi
      ? "Mandei um aviso agora. Se ele não apareceu, confira as notificações do sistema."
      : "Este navegador não deixou mostrar o aviso.");
  };

  return (
    <Card className="px-6 py-6">
      <H size={18} color="var(--a-PE)" icon={<Flame size={16} />}>Lembretes</H>
      <Texto style={{ marginTop: 8 }}>
        Aviso do navegador para as revisões que vencem hoje, para o bloco da agenda que
        vai começar e para quando alguém chamar você para um duelo.
      </Texto>

      {permissao === "indisponivel" ? (
        <Mini style={{ marginTop: 12, lineHeight: 1.6 }}>
          Este navegador não tem notificação. No iPhone é preciso instalar o site na
          tela de início primeiro.
        </Mini>
      ) : precisaInstalar ? (
        <div className="mt-4 rounded-2xl px-4 py-3"
          style={{ background: soft("var(--warn)", 12), border: `1px solid ${soft("var(--warn)", 35)}` }}>
          <Mini style={{ color: "var(--warn)", lineHeight: 1.65 }}>
            No iPhone a notificação só funciona com o site instalado na tela de início.
            Toque em compartilhar, no Safari, depois em "Adicionar à Tela de Início", e
            abra o Cadência por lá. Aí este botão passa a funcionar.
          </Mini>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            {ligado ? (
              <>
                <Btn size="sm" tone="outline"
                  onClick={() => setData((x) => ({ ...x, lembretes: { ...(x.lembretes || {}), ligado: false } }))}>
                  desligar
                </Btn>
                <Btn size="sm" disabled={testando} onClick={testar}>
                  {testando ? "mandando…" : "mandar um agora"}
                </Btn>
                <Mini style={{ color: T.ok }}>ligados</Mini>
              </>
            ) : (
              <Btn size="sm" tone="primary" disabled={permissao === "denied"} onClick={ligar}>
                Ligar os lembretes
              </Btn>
            )}
          </div>
          {permissao === "denied" ? (
            <Mini style={{ marginTop: 10, lineHeight: 1.6, color: T.warn }}>
              Você recusou as notificações para este site alguma vez, e o navegador
              guarda essa recusa. Para liberar, toque no cadeado ao lado do endereço
              e mude a permissão de notificações. Assim que mudar, esta tela percebe
              sozinha.
            </Mini>
          ) : null}
          {/* Prometer aviso com o site fechado seria mentira: não há
              servidor empurrando notificação aqui. */}
          <Mini style={{ marginTop: 12, lineHeight: 1.6 }}>
            Funciona com o site aberto numa aba, ou instalado no celular. Sem o site
            aberto não há aviso: o Cadência não tem servidor empurrando notificação.
          </Mini>
        </>
      )}
    </Card>
  );
}
