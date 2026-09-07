/* ═══════════════════════════════════════════════════════════════════
   24 · ASSINATURA
   O plano fica em assinaturas/{uid}, uma coleção que o app só consegue
   LER. Quem escreve ali é a função de compra, no servidor, com uma conta
   de serviço. Assim ninguém se promove a assinante mexendo no navegador.
   ═══════════════════════════════════════════════════════════════════ */

const PRECOS = {
  mensal: { rotulo: "Mensal", valor: "R$ 30", periodo: "por mês", chave: "mensal" },
  anual: { rotulo: "Anual", valor: "R$ 250", periodo: "por ano", chave: "anual", economia: "economiza R$ 110" },
};

/* Links de checkout da Kiwify ou Hotmart. Trocar pelos seus. */
const CHECKOUT = (typeof window !== "undefined" && window.CADENCIA_CHECKOUT) || {
  mensal: "", anual: "",
};

const RECURSOS_PRO = {
  cartoes: "Seus próprios flashcards, com repetição espaçada",
  revisoes: "A escada de revisão espaçada, com os prazos de cada aula",
  temas: "O cronograma por especialidade, com o radar das áreas",
  assistente: "O assistente que lê seu progresso e responde",
  rotina: "Calendário da semana e sincronização com o Google Agenda",
  metas: "Simulados, provas resolvidas, hábitos e exportação da agenda",
  nuvem: "Seus dados sincronizados em todos os aparelhos",
  projecao: "Ritmo e projeção até a prova",
};
const ABAS_PRO = ["cartoes", "revisoes", "temas", "assistente", "rotina", "metas"];

/* Conta do dono: acesso completo sem precisar assinar. O servidor faz a
   mesma verificação, então isso não é um atalho que outra pessoa consiga
   usar mudando o navegador. */
const DONOS = ["joseeduardo1616@gmail.com"];
const ehDono = (u) => !!(u && u.email && DONOS.indexOf(String(u.email).toLowerCase()) >= 0);

function useAssinatura(sdk, usuario) {
  const [plano, setPlano] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!sdk || !usuario) { setPlano(null); setCarregando(false); return undefined; }
    if (ehDono(usuario)) {
      setPlano({ tipo: "dono", ate: Infinity });
      setCarregando(false);
      return undefined;
    }
    setCarregando(true);
    const ref = sdk.F.doc(sdk.db, "assinaturas", usuario.uid);
    const parar = sdk.F.onSnapshot(ref, (snap) => {
      setCarregando(false);
      if (!snap.exists()) { setPlano(null); return; }
      const d = snap.data() || {};
      const ate = Number(d.validoAte || 0);
      setPlano(ate > Date.now() ? { tipo: d.plano || "mensal", ate } : null);
    }, () => setCarregando(false));
    return parar;
  }, [sdk, usuario]);

  return { pro: !!plano, plano, carregando };
}

function Cadeado({ tamanho = 15 }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function Precos({ compacto, onFechar, usuario, plano }) {
  const abrir = (tipo) => {
    const url = CHECKOUT[tipo];
    if (!url) return;
    const sep = url.indexOf("?") >= 0 ? "&" : "?";
    const extra = usuario && usuario.email ? `${sep}email=${encodeURIComponent(usuario.email)}` : "";
    window.open(url + extra, "_blank", "noopener");
  };

  return (
    <div className="flex flex-col gap-5">
      {!compacto ? (
        <div style={{ padding: "48px 0 40px", position: "relative" }}>
          <img src={MARCA} alt="" width="176" height="86" className="marca"
            style={{ display: "block", marginBottom: 22, width: 176, height: "auto" }} />
          <div style={{
            fontFamily: F_MONO, fontSize: 10, letterSpacing: "0.32em",
            textTransform: "uppercase", color: "var(--neon)", marginBottom: 18,
          }}>Residência médica · MEDCURSO 2026</div>
          <h2 style={{
            fontFamily: F_UI, fontSize: "clamp(30px, 5.4vw, 58px)", fontWeight: 300,
            margin: 0, color: T.ink, lineHeight: 1.1, letterSpacing: "-0.02em", maxWidth: 760,
          }}>
            O cronograma inteiro,<br />
            <span style={{ fontWeight: 500 }}>organizado num lugar só</span>
          </h2>
          <p style={{ color: T.dim, fontSize: 16, lineHeight: 1.7, marginTop: 22, maxWidth: 470 }}>
            As {CURRICULUM.length} aulas e {TOTAL_BONUS} bônus para marcar, revisão espaçada,
            flashcards seus, cronômetro e acompanhamento por especialidade.
          </p>
        </div>
      ) : null}

      {plano && plano.tipo === "dono" ? (
        <Card className="px-6 py-6" brilho="var(--ok)">
          <H size={18} color="var(--ok)" icon={<Check size={16} />}>Acesso completo</H>
          <Texto style={{ marginTop: 10 }}>
            Esta é a conta do dono do site, com todos os recursos liberados
            permanentemente e sem cobrança.
          </Texto>
        </Card>
      ) : null}

      <div className="grid sm:grid-cols-2 gap-5">
        {["mensal", "anual"].map((k) => {
          const p = PRECOS[k];
          const destaque = k === "anual";
          const atual = plano && plano.tipo === k;
          return (
            <Card key={k} className="px-6 py-7" brilho={destaque ? "var(--neon2)" : undefined} tilt
              style={destaque ? { borderColor: soft("var(--neon2)", 45) } : undefined}>
              {destaque ? (
                <div className="inline-flex rounded-full px-3 py-1" style={{ background: soft("var(--neon2)", 20), color: "var(--neon2)", fontSize: 12, fontWeight: 700 }}>
                  {p.economia}
                </div>
              ) : null}
              <div style={{ marginTop: destaque ? 14 : 0 }}>
                <Label>{p.rotulo}</Label>
                <div className="flex items-baseline gap-2" style={{ marginTop: 6 }}>
                  <Num size={38} weight={700} color={destaque ? "var(--neon2)" : T.ink}>{p.valor}</Num>
                  <Mini>{p.periodo}</Mini>
                </div>
              </div>
              <div className="mt-5">
                {atual ? (
                  <div className="rounded-full px-4 py-3 text-center" style={{ background: soft("var(--ok)", 16), color: T.ok, fontSize: 14.5, fontWeight: 700 }}>
                    Seu plano atual
                  </div>
                ) : CHECKOUT[k] ? (
                  <Btn tone={destaque ? "primary" : "quiet"} className="w-full" onClick={() => abrir(k)}>
                    Assinar {p.rotulo.toLowerCase()} <ArrowUpRight size={16} />
                  </Btn>
                ) : (
                  <div className="rounded-full px-4 py-3 text-center" style={{ background: T.card2, color: T.faint, fontSize: 14 }}>
                    link de pagamento não configurado
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="px-6 py-6">
        <Label>O que entra no plano</Label>
        <div className="mt-4 flex flex-col gap-3">
          {Object.values(RECURSOS_PRO).map((r) => (
            <div key={r} className="flex items-start gap-3">
              <span className="flex items-center justify-center rounded-full" style={{ width: 22, height: 22, background: soft("var(--ok)", 18), color: T.ok, flexShrink: 0, marginTop: 1 }}>
                <Check size={13} strokeWidth={3} />
              </span>
              <span style={{ fontSize: 14.5, color: T.dim, lineHeight: 1.5 }}>{r}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
          <Label>Continua de graça, para sempre</Label>
          <Mini style={{ marginTop: 8, lineHeight: 1.7 }}>
            O cronograma completo com as {CURRICULUM.length} aulas e {TOTAL_BONUS} bônus
            para marcar, o cronômetro com pomodoro e tempo corrido, o registro de
            sessões com questões e acertos, e o backup do seu arquivo. Nada do que
            você já anotou é perdido ou bloqueado.
          </Mini>
        </div>
      </Card>

      {!usuario ? (
        <Card className="px-6 py-5" flat>
          <Mini style={{ lineHeight: 1.7 }}>
            Crie sua conta em Progresso antes de assinar, e use o mesmo e-mail
            na hora do pagamento. É assim que a assinatura é reconhecida.
          </Mini>
        </Card>
      ) : null}

      {onFechar ? (
        <div className="flex justify-center">
          <Btn tone="outline" size="sm" onClick={onFechar}>voltar</Btn>
        </div>
      ) : null}
    </div>
  );
}

/* Tela que aparece no lugar de uma aba paga */
function Bloqueado({ recurso, onVerPlanos }) {
  return (
    <Card className="px-6 sm:px-10 py-12 text-center" brilho="var(--neon2)">
      <div className="flex justify-center" style={{ color: "var(--neon2)" }}>
        <span className="flex items-center justify-center rounded-full"
          style={{ width: 56, height: 56, background: soft("var(--neon2)", 16) }}>
          <Cadeado tamanho={24} />
        </span>
      </div>
      <h2 style={{ fontFamily: F_SERIF, fontSize: 24, fontWeight: 400, margin: "18px 0 0", color: T.ink }}>
        Recurso do plano completo
      </h2>
      <p style={{ color: T.dim, fontSize: 15, lineHeight: 1.65, marginTop: 10, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
        {recurso}
      </p>
      <div className="mt-7 flex justify-center">
        <Btn tone="primary" onClick={onVerPlanos}>Ver planos <ArrowUpRight size={16} /></Btn>
      </div>
      <Mini style={{ marginTop: 18 }}>R$ 30 por mês ou R$ 250 por ano</Mini>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   27 · PAINEL DO DONO
   Só aparece para o e-mail cadastrado em DONOS. A liberação em si é
   feita no servidor, que confere o token antes de gravar. Aqui é só a
   tela: quem pede, o servidor decide.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_ACESSOS = "/.netlify/functions/acessos";

function PainelDono({ nuvem, notify }) {
  const [lista, setLista] = useState(null);
  const [email, setEmail] = useState("");
  const [plano, setPlano] = useState("anual");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const chamar = useCallback(async (corpo) => {
    setErro("");
    let token = "";
    try {
      if (nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
        token = await nuvem.sdk.auth.currentUser.getIdToken();
      }
    } catch (e) { /* segue sem token, o servidor recusa */ }
    const r = await fetch(ROTA_ACESSOS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...corpo, token }),
    });
    if (r.status === 404) {
      setErro("A função de acessos ainda não foi publicada neste site.");
      return null;
    }
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) { setErro((j && j.erro) || "Não deu certo."); return null; }
    return j;
  }, [nuvem]);

  const carregar = useCallback(async () => {
    setOcupado(true);
    const j = await chamar({ acao: "listar" });
    if (j && j.lista) setLista(j.lista);
    setOcupado(false);
  }, [chamar]);

  useEffect(() => { carregar(); }, [carregar]);

  const liberar = async () => {
    if (!email.trim()) return setErro("Escreva o e-mail.");
    setOcupado(true);
    const j = await chamar({ acao: "liberar", email: email.trim(), plano });
    if (j && j.ok) { notify(j.mensagem); setEmail(""); await carregar(); }
    setOcupado(false);
  };

  const revogar = async (alvo) => {
    setOcupado(true);
    const j = await chamar({ acao: "revogar", email: alvo });
    if (j && j.ok) { notify(j.mensagem); await carregar(); }
    setOcupado(false);
  };

  return (
    <Card className="px-6 py-6" brilho="var(--warn)">
      <H size={18} color="var(--warn)" icon={<User size={16} />}>Acessos</H>
      <Texto style={{ marginTop: 10 }}>
        Libere o plano completo para quem você quiser. A pessoa precisa ter
        criado a conta no site antes, com o mesmo e-mail.
      </Texto>

      <div className="mt-5 grid sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2">
          <Field label="E-mail da pessoa">
            <TextInput type="email" value={email} placeholder="pessoa@email.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") liberar(); }} />
          </Field>
        </div>
        <Field label="Por quanto tempo">
          <Select value={plano} onChange={(e) => setPlano(e.target.value)}>
            <option value="mensal">Um mês</option>
            <option value="anual">Um ano</option>
            <option value="vitalicio">Sem prazo</option>
          </Select>
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <Btn tone="primary" onClick={liberar} disabled={ocupado}>
          {ocupado ? "Aguarde…" : "Liberar acesso"}
        </Btn>
        <Btn tone="outline" size="sm" onClick={carregar} disabled={ocupado}>
          <RefreshCw size={14} /> atualizar lista
        </Btn>
        {erro ? <span style={{ fontSize: 14, color: T.bad }}>{erro}</span> : null}
      </div>

      <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between">
          <Label>Quem tem acesso</Label>
          {lista ? <Mini>{lista.length}</Mini> : null}
        </div>

        {lista === null ? (
          <Mini style={{ marginTop: 12 }}>carregando…</Mini>
        ) : lista.length === 0 ? (
          <Mini style={{ marginTop: 12 }}>Ninguém liberado ainda.</Mini>
        ) : (
          <div className="mt-3 flex flex-col gap-1.5" style={{ maxHeight: 340, overflowY: "auto" }}>
            {lista.map((x) => {
              const ativo = x.validoAte > Date.now();
              const semPrazo = x.validoAte > Date.now() + 3650 * 86400000;
              return (
                <div key={x.uid} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: T.card2 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: 99, flexShrink: 0,
                    background: ativo ? T.ok : T.ghost,
                  }} />
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 14.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {x.email || x.uid}
                    </div>
                    <Mini style={{ marginTop: 1 }}>
                      {x.cortesia ? "cortesia" : "pagante"}
                      {x.plano ? ` · ${x.plano}` : ""}
                      {" · "}
                      {semPrazo ? "sem prazo" : ativo
                        ? `até ${brDate(toISO(new Date(x.validoAte)))}`
                        : "expirado"}
                    </Mini>
                  </div>
                  <Btn size="sm" tone="danger" onClick={() => revogar(x.email)} disabled={ocupado || !x.email}>
                    remover
                  </Btn>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
