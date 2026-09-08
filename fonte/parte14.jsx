/* ═══════════════════════════════════════════════════════════════════
   28 · AMIGOS (salas com ranking)

   Uma sala é um nome mais uma senha. Quem confere a senha é o servidor,
   em /api/salas: se a conferência estivesse aqui, bastaria abrir o código
   da página para entrar em qualquer sala.

   Os números de cada pessoa ficam em perfis/{uid}, escrito pelo próprio
   dono. O ranking vem montado do servidor porque, pelas regras do
   Firestore, o navegador só lê o próprio perfil — sem isso bastaria saber
   o uid de alguém para bisbilhotar os números dessa pessoa.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_SALAS = "/api/salas";

/* De quanto em quanto tempo o ranking se atualiza sozinho enquanto a aba
   está aberta. Curto demais vira uma chamada por segundo à toa. */
const RITMO_RANKING = 45000;

/* Os recados pedem resposta rápida, então vão num ritmo mais curto que o
   ranking — mas só com a aba à vista: em segundo plano ninguém está lendo,
   e o app ficaria conversando com o servidor à toa. */
const RITMO_RECADOS = 12000;

/* De quanto em quanto tempo quem está com o cronômetro andando avisa que
   continua na mesa. O servidor descarta o sinal com mais de 2min30. */
const RITMO_PRESENCA = 45000;

/* Precisam bater com o MAX_LETRAS e o MAX_MENSAGENS do servidor, que é
   quem corta de verdade. Aqui é só para a tela não prometer o que a rota
   vai recusar. */
const MAX_RECADO = 400;
const MAX_RECADO_ITENS = 80;

const PERIODOS = [
  ["semana", "Semana"],
  ["mes", "Mês"],
  ["total", "Desde sempre"],
];

/* Publica os números de quem está logado, para aparecerem no ranking.
 *
 * Vão três recortes: a semana, o mês e o total. Cada um leva junto a que
 * semana e a que mês se refere — sem isso, quem estudou muito na semana
 * passada e não abriu o app desde então continuaria no topo do ranking desta
 * semana, com números que já não valem.
 *
 * Só números: nada do que foi estudado, nenhuma anotação. */
function usePerfilPublico(nuvem, nome, sessions, today, mostrar, aoVivo) {
  const dados = useMemo(() => {
    const iniSemana = weekStart(today);
    const mes = String(today).slice(0, 7);
    const soma = { min: 0, q: 0, ok: 0 };
    const sem = { min: 0, q: 0, ok: 0 };
    const mensal = { min: 0, q: 0, ok: 0 };

    for (const s of sessions || []) {
      if (!s) continue;
      const m = Math.max(0, Number(s.minutes) || 0);
      const q = Math.max(0, Number(s.questions) || 0);
      const ok = Math.min(q, Math.max(0, Number(s.correct) || 0));
      soma.min += m; soma.q += q; soma.ok += ok;
      const d = String(s.date || "");
      if (d >= iniSemana && d <= today) { sem.min += m; sem.q += q; sem.ok += ok; }
      if (d.slice(0, 7) === mes) { mensal.min += m; mensal.q += q; mensal.ok += ok; }
    }

    /* Quem escolheu não mostrar publica só o nome e o aviso. Zerar aqui, e
       não esconder na hora de desenhar, é o que garante que os números não
       saiam do aparelho: eles nem chegam a ser gravados. */
    if (!mostrar) {
      return {
        nome: String(nome || "").trim().slice(0, 40),
        oculto: true,
        minutos: 0, questoes: 0, acertos: 0,
        semanaChave: iniSemana, semanaMinutos: 0, semanaQuestoes: 0, semanaAcertos: 0,
        mesChave: mes, mesMinutos: 0, mesQuestoes: 0, mesAcertos: 0,
      };
    }

    return {
      nome: String(nome || "").trim().slice(0, 40),
      oculto: false,
      minutos: Math.round(soma.min), questoes: soma.q, acertos: soma.ok,
      semanaChave: iniSemana,
      semanaMinutos: Math.round(sem.min), semanaQuestoes: sem.q, semanaAcertos: sem.ok,
      mesChave: mes,
      mesMinutos: Math.round(mensal.min), mesQuestoes: mensal.q, mesAcertos: mensal.ok,
    };
  }, [nome, sessions, today, mostrar]);

  const ultimo = useRef("");

  useEffect(() => {
    if (!nuvem || !nuvem.sdk || !nuvem.usuario) return undefined;
    const assinatura = JSON.stringify(dados);
    if (assinatura === ultimo.current) return undefined;

    /* Espera o dedo parar: lançar uma sessão mexe nos três números de uma
       vez, e sem isto seriam três gravações seguidas. */
    const t = setTimeout(() => {
      ultimo.current = assinatura;
      const { F, db } = nuvem.sdk;
      /* merge para não apagar a marca de "estudando agora", que é gravada
         em separado, por outro efeito, em outro ritmo. */
      F.setDoc(F.doc(db, "perfis", nuvem.usuario.uid), {
        ...dados, atualizadoEm: Date.now(),
      }, { merge: true }).catch(() => { ultimo.current = ""; });
    }, 2500);
    return () => clearTimeout(t);
  }, [nuvem, dados]);

  /* ── estudando agora ───────────────────────────────────────────────────
   *
   * Enquanto o cronômetro anda, o app dá sinal de vida de tempos em tempos.
   * Fechar a aba não avisa ninguém, então o sinal vem com hora: o servidor
   * descarta o que ficou velho, e a marca some sozinha.
   *
   * Vai só o tempo em andamento. Que matéria está sendo estudada não sai
   * daqui — a promessa da sala é essa, o ranking mostra números, não o que
   * cada um está fazendo. */
  const ativo = !!(aoVivo && aoVivo.ativo && mostrar);
  const minRef = useRef(0);
  minRef.current = aoVivo ? Math.max(0, Math.round(aoVivo.minutos || 0)) : 0;
  const marcado = useRef(false);

  useEffect(() => {
    if (!nuvem || !nuvem.sdk || !nuvem.usuario) return undefined;
    const { F, db } = nuvem.sdk;
    const ref = F.doc(db, "perfis", nuvem.usuario.uid);
    const marcar = (em) => {
      marcado.current = !!em;
      return F.setDoc(ref, {
        presencaEm: em, presencaMin: em ? minRef.current : 0,
      }, { merge: true }).catch(() => {});
    };

    if (!ativo) {
      /* Apagar na saída faz a marca sumir na hora para quem pausou ou
         desligou o cronômetro, em vez de esperar o prazo vencer. Quem nunca
         apareceu como estudando não tem o que apagar. */
      if (marcado.current) marcar(0);
      return undefined;
    }
    marcar(Date.now());
    const i = setInterval(() => marcar(Date.now()), RITMO_PRESENCA);
    return () => clearInterval(i);
  }, [nuvem, ativo]);
}

async function falarComSalas(nuvem, corpo) {
  let token = "";
  try {
    if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
      token = await nuvem.sdk.auth.currentUser.getIdToken();
    }
  } catch (e) { /* segue sem token, o servidor recusa */ }
  if (!token) return { erro: "Entre na sua conta para usar as salas." };
  const { dados, erro } = await chamarApi(ROTA_SALAS, { ...corpo, token }, "As salas de amigos");
  return erro ? { erro } : dados;
}

const MEDALHA = ["var(--warn)", "var(--dim)", "var(--a-CL)"];

/* Quem está com o cronômetro andando neste instante.
 *
 * O tempo aqui é o do bloco em andamento, e ele não entra no ranking: entra
 * quando a sessão termina e é lançada. Somar antes contaria o mesmo tempo
 * duas vezes enquanto o cronômetro anda. */
function Estudando({ minutos }) {
  return (
    <span className="inline-flex items-center gap-1.5"
      style={{
        fontSize: 11, fontWeight: 700, color: "var(--ok)",
        background: soft("var(--ok)", 15), padding: "2px 9px 2px 7px", borderRadius: 99,
      }}>
      <span className="aovivo" style={{
        width: 6, height: 6, borderRadius: 99, background: "var(--ok)", display: "inline-block",
      }} />
      estudando {minutos > 0 ? `· ${fmtMin(minutos)}` : "agora"}
    </span>
  );
}

function LinhaRanking({ x }) {
  const cor = !x.oculto && x.posicao <= 3 ? MEDALHA[x.posicao - 1] : T.ghost;
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5"
      style={{
        background: x.souEu ? soft("var(--neon)", 10) : T.card2,
        border: `1px solid ${x.souEu ? soft("var(--neon)", 34) : "transparent"}`,
      }}>
      <span className="flex items-center justify-center rounded-full"
        style={{
          width: 30, height: 30, flexShrink: 0,
          background: !x.oculto && x.posicao <= 3 ? soft(cor, 18) : "transparent",
          border: !x.oculto && x.posicao <= 3 ? "none" : `1px solid ${T.line}`,
          fontFamily: F_MONO, fontSize: 13, fontWeight: 700,
          color: x.oculto ? T.ghost : cor,
        }}>{x.oculto ? "—" : x.posicao}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          <span style={{
            fontSize: 15, fontWeight: 600, color: T.ink,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220,
          }}>{x.nome}</span>
          {x.souEu ? (
            <span style={{
              fontSize: 11, fontWeight: 700, color: "var(--neon)",
              background: soft("var(--neon)", 16), padding: "2px 8px", borderRadius: 99,
            }}>você</span>
          ) : null}
          {x.estudando ? <Estudando minutos={x.agoraMin} /> : null}
          {x.dono ? <Mini>criou a sala</Mini> : null}
        </div>
        <Mini style={{ marginTop: 3 }}>
          {x.oculto ? "escolheu não mostrar o desempenho"
            : x.questoes ? `${x.acertos} de ${x.questoes} questões` : "sem questões lançadas"}
          {x.oculto ? "" : !x.atualizadoEm ? " · ainda não sincronizou"
            : x.foraDoRecorte ? " · não abriu o app neste período" : ""}
        </Mini>
      </div>

      {x.oculto ? (
        <span style={{ flexShrink: 0, color: T.ghost, display: "inline-flex" }}>
          <Lock size={15} />
        </span>
      ) : (
        <div className="flex items-center gap-5" style={{ flexShrink: 0 }}>
          <div className="text-right">
            <Num size={17} weight={700}>{fmtMin(x.minutos)}</Num>
            <Mini>líquidas</Mini>
          </div>
          <div className="text-right" style={{ minWidth: 52 }}>
            <Num size={17} weight={700} color={x.pct === null ? T.ghost : x.pct >= 70 ? T.ok : x.pct >= 50 ? T.warn : T.bad}>
              {x.pct === null ? "—" : `${x.pct}%`}
            </Num>
            <Mini>acerto</Mini>
          </div>
        </div>
      )}
    </div>
  );
}

/* Hora curta para a conversa: "14:32" quando é de hoje, com o dia junto
   quando é de outro dia. */
function horaCurta(em) {
  const d = new Date(em || 0);
  if (!em || Number.isNaN(d.getTime())) return "";
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia ? hora : `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

/* Os recados da sala.
 *
 * Vai e volta pelo servidor, como o resto: pelas regras do Firestore o
 * navegador não abre a sala nem para ler. Quem não é da sala não recebe
 * nada — quem confere é a rota, que já sabe quem está pedindo. */
function Recados({ nuvem, slug, quem }) {
  const [itens, setItens] = useState(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const fim = useRef(null);
  const refNuvem = useRef(nuvem);
  refNuvem.current = nuvem;

  const buscar = useCallback(async () => {
    if (!slug) return;
    const j = await falarComSalas(refNuvem.current, { acao: "recados", nome: slug });
    if (j.erro) return;                        // silencioso: é atualização de fundo
    setItens(j.recados || []);
  }, [slug]);

  useEffect(() => {
    setItens(null);
    buscar();
    /* Em segundo plano ninguém está lendo, e continuar perguntando seria
       conversa com o servidor à toa — e bateria do celular. */
    const t = setInterval(() => {
      if (!document.hidden) buscar();
    }, RITMO_RECADOS);
    const aoVoltar = () => { if (!document.hidden) buscar(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", aoVoltar); };
  }, [buscar]);

  /* Desce até a última mensagem quando chega coisa nova. */
  useEffect(() => {
    if (fim.current && fim.current.scrollIntoView) {
      fim.current.scrollIntoView({ block: "nearest" });
    }
  }, [itens]);

  const mandar = async () => {
    const escrito = texto.trim();
    if (!escrito || enviando) return;
    setEnviando(true); setErro("");
    const j = await falarComSalas(refNuvem.current, { acao: "dizer", nome: slug, texto: escrito });
    setEnviando(false);
    if (j.erro) { setErro(j.erro); return; }
    setTexto("");
    setItens(j.recados || []);
  };

  return (
    <Card className="px-6 py-6">
      <H color="var(--neon2)" icon={<MessageCircle size={16} />}>Recados da sala</H>

      <div className="mt-4 flex flex-col gap-3" style={{
        maxHeight: 340, overflowY: "auto", overflowX: "hidden",
      }}>
        {itens === null ? (
          <Label>carregando…</Label>
        ) : itens.length === 0 ? (
          <Mini>Nenhum recado ainda. Combine o horário, conte como foi o dia.</Mini>
        ) : itens.map((m, i) => {
          const meu = m.uid === quem;
          return (
            <div key={`${m.em}-${i}`} className="flex flex-col"
              style={{ alignItems: meu ? "flex-end" : "flex-start" }}>
              <div className="rounded-2xl px-3.5 py-2.5" style={{
                maxWidth: "86%",
                background: meu ? soft("var(--neon)", 12) : T.card2,
                border: `1px solid ${meu ? soft("var(--neon)", 26) : T.line}`,
              }}>
                {meu ? null : (
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.dim, marginBottom: 3 }}>
                    {m.nome}
                  </div>
                )}
                <div style={{
                  fontSize: 14.5, color: T.ink, lineHeight: 1.5,
                  overflowWrap: "anywhere", whiteSpace: "pre-wrap",
                }}>{m.texto}</div>
              </div>
              <Mini style={{ marginTop: 3 }}>{horaCurta(m.em)}</Mini>
            </div>
          );
        })}
        <div ref={fim} />
      </div>

      <div className="mt-4 flex gap-2 items-end">
        <div className="flex-1 min-w-0">
          <TextInput value={texto} placeholder="escreva um recado"
            maxLength={MAX_RECADO}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") mandar(); }} />
        </div>
        <Btn tone="primary" onClick={mandar} disabled={enviando || !texto.trim()}>
          {enviando ? "…" : <Send size={15} />}
        </Btn>
      </div>

      {erro ? <span style={{ fontSize: 14, color: T.bad }}>{erro}</span> : null}
      <Mini style={{ marginTop: 10 }}>
        Fica só para quem está na sala, e a sala guarda os {MAX_RECADO_ITENS} últimos
        recados. Atualiza sozinho a cada {Math.round(RITMO_RECADOS / 1000)} segundos.
      </Mini>
    </Card>
  );
}

function Amigos({ nuvem, notify, data, setData }) {
  const [salas, setSalas] = useState(null);
  const [atual, setAtual] = useState(null);        // slug escolhido
  const [ranking, setRanking] = useState(null);
  const [cabecalho, setCabecalho] = useState(null);
  const [form, setForm] = useState({ nome: "", senha: "" });
  const [modo, setModo] = useState("entrar");      // entrar | criar
  /* A semana é a corrida que interessa: dá para virar o jogo. O mês e o
     total ficam a um toque, para quem quer ver o acumulado. */
  const [periodo, setPeriodo] = useState("semana");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const estudandoAgora = (ranking || []).filter((x) => x.estudando).length;

  const logado = !!(nuvem && nuvem.usuario);
  /* O objeto da nuvem entra por referência, e não como dependência: quem
     manda no recarregamento é quem está logado. Se um dia esse objeto voltar
     a nascer novo a cada render, isto impede que o efeito dispare em laço —
     foi assim que a aba começou a se recarregar sozinha sem parar. */
  const refNuvem = useRef(nuvem);
  refNuvem.current = nuvem;
  const quem = nuvem && nuvem.usuario ? nuvem.usuario.uid : "";

  const carregarSalas = useCallback(async () => {
    if (!quem) return;
    const j = await falarComSalas(refNuvem.current, { acao: "minhas" });
    if (j.erro) { setErro(j.erro); return; }
    setSalas(j.salas || []);
    /* Primeira sala vira a escolhida, senão a aba abre vazia mesmo para
       quem já participa de alguma. */
    setAtual((p) => (p || (j.salas && j.salas[0] ? j.salas[0].slug : null)));
  }, [quem]);

  useEffect(() => { carregarSalas(); }, [carregarSalas]);

  const carregarRanking = useCallback(async (slug, silencioso) => {
    if (!slug) return;
    if (!silencioso) setOcupado(true);
    const j = await falarComSalas(refNuvem.current, { acao: "ranking", nome: slug, periodo });
    if (!silencioso) setOcupado(false);
    if (j.erro) { if (!silencioso) setErro(j.erro); return; }
    setRanking(j.ranking || []);
    setCabecalho(j.sala || null);
    setErro("");
  }, [periodo]);

  useEffect(() => {
    if (!atual) { setRanking(null); setCabecalho(null); return undefined; }
    carregarRanking(atual);
    const t = setInterval(() => carregarRanking(atual, true), RITMO_RANKING);
    return () => clearInterval(t);
  }, [atual, carregarRanking]);

  const enviar = async () => {
    if (!form.nome.trim()) { setErro("Escreva o nome da sala."); return; }
    if (form.senha.length < 4) { setErro("A senha precisa ter pelo menos 4 caracteres."); return; }
    setOcupado(true); setErro("");
    const j = await falarComSalas(refNuvem.current, { acao: modo, nome: form.nome.trim(), senha: form.senha });
    setOcupado(false);
    if (j.erro) { setErro(j.erro); return; }
    notify(j.mensagem || "Pronto.");
    setForm({ nome: "", senha: "" });
    setAtual(j.slug);
    await carregarSalas();
  };

  const sair = async () => {
    if (!atual) return;
    setOcupado(true);
    const j = await falarComSalas(refNuvem.current, { acao: "sair", nome: atual });
    setOcupado(false);
    if (j.erro) { setErro(j.erro); return; }
    notify(j.mensagem || "Você saiu da sala.");
    setAtual(null); setRanking(null); setCabecalho(null);
    setSalas(null);
    await carregarSalas();
  };

  if (!logado) {
    return (
      <Card className="px-6 sm:px-10 py-12 text-center" brilho="var(--neon2)">
        <div className="flex justify-center" style={{ color: "var(--neon2)" }}>
          <span className="flex items-center justify-center rounded-full"
            style={{ width: 56, height: 56, background: soft("var(--neon2)", 16) }}>
            <Users size={24} />
          </span>
        </div>
        <h2 style={{ fontFamily: F_SERIF, fontSize: 24, fontWeight: 400, margin: "18px 0 0", color: T.ink }}>
          Estudar acompanhado
        </h2>
        <p style={{ color: T.dim, fontSize: 15, lineHeight: 1.65, marginTop: 10, maxWidth: 430, marginLeft: "auto", marginRight: "auto" }}>
          Crie uma conta em Progresso para montar salas com seus amigos e comparar
          horas estudadas, questões e acerto.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-6" brilho="var(--neon2)">
        <H color="var(--neon2)" icon={<Users size={16} />}>Salas de amigos</H>
        <Texto style={{ marginTop: 10 }}>
          Combine um nome e uma senha com quem você estuda. Todo mundo que entrar
          com os dois vê o mesmo ranking, feito com as horas líquidas, as questões
          e o acerto que cada um já lançou aqui.
        </Texto>

        <label className="mt-4 flex items-start gap-2.5" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={data.mostrarDesempenho !== false}
            style={{ marginTop: 2 }}
            onChange={(e) => setData((p) => ({ ...p, mostrarDesempenho: e.target.checked }))} />
          <span style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>
            Mostrar meu desempenho no ranking
            <span style={{ color: T.ghost }}>
              {" · "}desligado, você continua nas salas e vê o de todo mundo, mas
              seus números param de ser enviados
            </span>
          </span>
        </label>

        {salas && salas.length ? (
          <div className="mt-5 flex gap-2 flex-wrap">
            {salas.map((s) => (
              <button key={s.slug} type="button" onClick={() => setAtual(s.slug)}
                className="rounded-full px-4 py-2 brilhar"
                style={{
                  background: atual === s.slug ? soft("var(--neon2)", 18) : T.card,
                  border: `1px solid ${atual === s.slug ? "transparent" : T.line}`,
                  color: atual === s.slug ? "var(--neon2)" : T.dim,
                  fontSize: 14, fontWeight: atual === s.slug ? 700 : 500, cursor: "pointer",
                }}>
                {s.nome} <span style={{ opacity: 0.65 }}>· {s.membros}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
          <div className="flex gap-2 flex-wrap">
            {[["entrar", "Entrar numa sala"], ["criar", "Criar uma sala"]].map(([id, lb]) => (
              <button key={id} type="button" onClick={() => { setModo(id); setErro(""); }}
                className="rounded-full px-4 py-2"
                style={{
                  background: modo === id ? T.card3 : "transparent",
                  border: `1px solid ${modo === id ? "transparent" : T.line}`,
                  color: modo === id ? T.ink : T.dim,
                  fontSize: 14, fontWeight: modo === id ? 700 : 500, cursor: "pointer",
                }}>{lb}</button>
            ))}
          </div>

          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <Field label="Nome da sala">
              <TextInput value={form.nome} placeholder="Ex.: plantão da madrugada"
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} />
            </Field>
            <Field label="Senha">
              <TextInput type="password" value={form.senha} placeholder="pelo menos 4 caracteres"
                autoComplete={modo === "criar" ? "new-password" : "current-password"}
                onChange={(e) => setForm((p) => ({ ...p, senha: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} />
            </Field>
          </div>

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <Btn tone="primary" onClick={enviar} disabled={ocupado}>
              {ocupado ? "Aguarde…" : modo === "criar" ? "Criar sala" : "Entrar"}
            </Btn>
            <Mini style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Lock size={12} /> a senha é conferida no servidor
            </Mini>
            {erro ? <span style={{ fontSize: 14, color: T.bad }}>{erro}</span> : null}
          </div>
        </div>
      </Card>

      {atual && ranking ? (
        <Card className="px-6 py-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <H color="var(--warn)" icon={<Trophy size={16} />}>
              {cabecalho ? cabecalho.nome : "Ranking"}
            </H>
            <div className="flex items-center gap-2">
              <Btn size="sm" tone="outline" onClick={() => carregarRanking(atual)} disabled={ocupado}>
                <RefreshCw size={14} /> atualizar
              </Btn>
              <Btn size="sm" tone="danger" onClick={sair} disabled={ocupado}>sair da sala</Btn>
            </div>
          </div>

          <div className="mt-4 flex gap-2 flex-wrap items-center">
            <div className="flex rounded-full" style={{ background: T.card2, padding: 3, border: `1px solid ${T.line}` }}>
              {PERIODOS.map(([id, lb]) => (
                <button key={id} type="button" onClick={() => setPeriodo(id)}
                  className="toque-larg rounded-full px-4 py-1.5"
                  style={{
                    background: periodo === id ? soft("var(--warn)", 20) : "transparent",
                    border: "none", color: periodo === id ? "var(--warn)" : T.dim,
                    fontSize: 13.5, fontWeight: periodo === id ? 700 : 500, cursor: "pointer",
                  }}>{lb}</button>
              ))}
            </div>
            {cabecalho && cabecalho.rotulo ? <Mini>{cabecalho.rotulo}</Mini> : null}
          </div>

          <Mini style={{ marginTop: 10 }}>
            {ranking.length} {ranking.length === 1 ? "pessoa" : "pessoas"}
            {estudandoAgora ? ` · ${estudandoAgora} estudando agora` : ""}
            {" · "}ordenado por horas líquidas · atualiza sozinho a cada {Math.round(RITMO_RANKING / 1000)} segundos
          </Mini>

          {ranking.length === 0 ? (
            <Blank icon={<Users size={26} />} title="Sala vazia"
              hint="Passe o nome e a senha para quem estuda com você." />
          ) : (
            <div className="mt-5 flex flex-col gap-2">
              {ranking.map((x) => <LinhaRanking key={x.uid} x={x} />)}
            </div>
          )}

          <Mini style={{ marginTop: 16, lineHeight: 1.7 }}>
            Aparecem só o nome do perfil e os três números do ranking, mais a
            marca de quem está com o cronômetro andando agora. O que você
            estudou, suas anotações e seus cartões não são compartilhados. Para
            mudar o nome que os outros veem, é o nome em Progresso.
          </Mini>
        </Card>
      ) : atual && ocupado ? (
        <Card className="px-6 py-6"><Label>carregando o ranking…</Label></Card>
      ) : null}

      {atual && ranking ? <Recados nuvem={nuvem} slug={atual} quem={quem} /> : null}
    </div>
  );
}
