/* ═══════════════════════════════════════════════════════════════════
   5 · CONTA E SINCRONIZAÇÃO
   ═══════════════════════════════════════════════════════════════════ */

const NUVEM_CFG = (typeof window !== "undefined" && window.CADENCIA_FIREBASE) || null;
const FB_VERSAO = (typeof window !== "undefined" && window.CADENCIA_FIREBASE_VERSAO) || "10.12.2";
const CHAVE_BACKUP = "cadencia:v3:antes-da-nuvem";

const ERROS_AUTH = {
  "auth/invalid-email": "E-mail inválido.",
  "auth/missing-email": "Digite o e-mail.",
  "auth/missing-password": "Digite a senha.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/email-already-in-use": "Esse e-mail já tem conta. Tente entrar.",
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "Senha incorreta.",
  "auth/user-not-found": "Não encontrei conta com esse e-mail.",
  "auth/too-many-requests": "Muitas tentativas seguidas. Espere alguns minutos.",
  "auth/network-request-failed": "Sem conexão com o servidor.",
  "auth/operation-not-allowed": "Falta ativar o login por e-mail e senha no console do Firebase.",
  "auth/unauthorized-domain": "Este endereço não está liberado no Firebase. Adicione em Authentication, Settings, Domínios autorizados.",
};
const traduzErro = (e) => ERROS_AUTH[e && e.code] || "Não deu certo. Tente de novo.";

function idDispositivo() {
  try {
    let v = window.localStorage.getItem("cadencia:dispositivo");
    if (!v) { v = uid() + uid(); window.localStorage.setItem("cadencia:dispositivo", v); }
    return v;
  } catch (e) { return "efemero"; }
}

function useNuvem(data, setData, notify, pronto, pro) {
  const [sdk, setSdk] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [estado, setEstado] = useState(NUVEM_CFG ? "carregando" : "desligado");
  const [erro, setErro] = useState("");
  const [ultima, setUltima] = useState(null);
  const [temBackup, setTemBackup] = useState(false);
  const stamp = useRef(0);
  const veioDaNuvem = useRef(false);
  const disp = useRef(idDispositivo());
  const tmr = useRef(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    try { setTemBackup(!!window.localStorage.getItem(CHAVE_BACKUP)); } catch (e) { /* noop */ }
  }, [usuario]);

  useEffect(() => {
    if (!NUVEM_CFG) return undefined;
    let vivo = true;
    (async () => {
      try {
        const importar = new Function("u", "return import(u)");
        const b = `https://www.gstatic.com/firebasejs/${FB_VERSAO}/`;
        const [A, U, F] = await Promise.all([
          importar(b + "firebase-app.js"),
          importar(b + "firebase-auth.js"),
          importar(b + "firebase-firestore.js"),
        ]);
        if (!vivo) return;
        const app = A.initializeApp(NUVEM_CFG);
        const auth = U.getAuth(app);
        const db = F.getFirestore(app);
        setSdk({ A, U, F, app, auth, db });
        U.onAuthStateChanged(auth, (u) => {
          if (!vivo) return;
          setUsuario(u ? { uid: u.uid, email: u.email } : null);
          setEstado(u ? "conectado" : "deslogado");
          if (!u) stamp.current = 0;
          /* Guarda o vínculo entre e-mail e conta. É por aqui que a função
             de compra descobre quem pagou, já que a plataforma só informa
             o e-mail do comprador. */
          if (u && u.email) {
            F.setDoc(F.doc(db, "emails", u.uid), {
              email: String(u.email).toLowerCase(), em: Date.now(),
            }).catch(() => {});
          }
        });
      } catch (e) {
        if (vivo) { setEstado("erro"); setErro("Não consegui carregar o serviço de sincronização."); }
      }
    })();
    return () => { vivo = false; };
  }, []);

  const enviar = useCallback(async () => {
    if (!sdk || !usuario) return;
    try {
      stamp.current = Date.now();
      await sdk.F.setDoc(sdk.F.doc(sdk.db, "usuarios", usuario.uid), {
        dados: JSON.stringify(dataRef.current),
        atualizadoEm: stamp.current,
        dispositivo: disp.current,
      });
      setUltima(Date.now());
      setErro("");
    } catch (e) {
      setErro("Não consegui salvar na nuvem. Os dados seguem salvos neste aparelho.");
    }
  }, [sdk, usuario]);

  /* Mede quanto conteúdo real existe, para decidir quem vence no primeiro
     encontro entre este aparelho e a conta. */
  const riqueza = useCallback((x) => {
    if (!x) return 0;
    const marcas = Object.keys(x.marks || {}).length;
    const degraus = Object.values(x.reviews || {})
      .reduce((a, r) => a + Object.keys((r && r.done) || {}).length, 0);
    return marcas * 10 + degraus * 5 + (x.sessions || []).length
      + (x.routine || []).length + (x.agenda || []).length + (x.provas || []).length;
  }, []);

  useEffect(() => {
    if (!sdk || !usuario || !pro) return undefined;   // sincronizar é do plano pago
    const ref = sdk.F.doc(sdk.db, "usuarios", usuario.uid);
    let primeira = true;
    const parar = sdk.F.onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        if (primeira) { primeira = false; enviar(); }
        return;
      }
      const d = snap.data() || {};
      const era = primeira;
      primeira = false;
      if (d.dispositivo === disp.current) return;
      if (Number(d.atualizadoEm || 0) <= stamp.current) return;
      try {
        const novo = normalize(JSON.parse(d.dados));
        if (era && riqueza(dataRef.current) > riqueza(novo)) {
          notify("Mantive os dados deste aparelho e enviei para a conta.");
          enviar();
          return;
        }
        if (era) {
          try {
            window.localStorage.setItem(CHAVE_BACKUP, JSON.stringify(dataRef.current));
            setTemBackup(true);
          } catch (e2) { /* sem espaço */ }
        }
        veioDaNuvem.current = true;
        stamp.current = Number(d.atualizadoEm);
        setData((p) => ({ ...novo, theme: p.theme, layout: p.layout }));
        setUltima(Date.now());
        notify(era ? "Dados da sua conta carregados." : "Atualizado a partir de outro aparelho.");
      } catch (e) { /* documento ilegível */ }
    }, () => setErro("Não consegui ler os dados na nuvem."));
    return parar;
  }, [sdk, usuario, pro, enviar, setData, notify, riqueza]);

  useEffect(() => {
    if (!sdk || !usuario || !pronto || !pro) return undefined;
    if (veioDaNuvem.current) { veioDaNuvem.current = false; return undefined; }
    if (tmr.current) window.clearTimeout(tmr.current);
    tmr.current = window.setTimeout(enviar, 2500);
    return () => { if (tmr.current) window.clearTimeout(tmr.current); };
  }, [data, sdk, usuario, pronto, pro, enviar]);

  /* "Manter conectado" escolhe onde a sessão fica guardada: no disco, e aí
     ela sobrevive a fechar o navegador, ou só na aba, e aí some ao fechar.
     Precisa ser decidido ANTES de entrar — depois já está gravado. Num
     computador compartilhado, deixar desmarcado é o certo. */
  const entrar = useCallback(async (email, senha, manter) => {
    if (!sdk) return "Serviço indisponível.";
    try {
      const guardar = manter === false
        ? sdk.U.browserSessionPersistence
        : sdk.U.browserLocalPersistence;
      /* Se o navegador não aceitar a escolha (aba anônima, por exemplo), o
         login continua valendo para esta sessão: melhor entrar com a
         persistência padrão do que recusar a entrada. */
      if (guardar) await sdk.U.setPersistence(sdk.auth, guardar).catch(() => {});
      await sdk.U.signInWithEmailAndPassword(sdk.auth, email.trim(), senha);
      return null;
    } catch (e) { return traduzErro(e); }
  }, [sdk]);

  const cadastrar = useCallback(async (nome, email, senha) => {
    if (!sdk) return "Serviço indisponível.";
    try {
      const cred = await sdk.U.createUserWithEmailAndPassword(sdk.auth, email.trim(), senha);
      if (nome.trim()) {
        try { await sdk.U.updateProfile(cred.user, { displayName: nome.trim() }); } catch (e) { /* opcional */ }
        setData((p) => ({ ...p, profile: { ...p.profile, name: nome.trim(), onboarded: true } }));
      }
      return null;
    } catch (e) { return traduzErro(e); }
  }, [sdk, setData]);

  const recuperar = useCallback(async (email) => {
    if (!sdk) return "Serviço indisponível.";
    try { await sdk.U.sendPasswordResetEmail(sdk.auth, email.trim()); return null; }
    catch (e) { return traduzErro(e); }
  }, [sdk]);

  const sair = useCallback(async () => {
    if (!sdk) return;
    try { await sdk.U.signOut(sdk.auth); notify("Você saiu. Os dados continuam neste aparelho."); }
    catch (e) { /* noop */ }
  }, [sdk, notify]);

  const restaurarBackup = useCallback(() => {
    try {
      const b = window.localStorage.getItem(CHAVE_BACKUP);
      if (!b) return notify("Não há cópia local guardada.");
      setData(normalize(JSON.parse(b)));
      notify("Cópia local restaurada.");
    } catch (e) { notify("Não consegui ler a cópia local."); }
  }, [setData, notify]);

  /* Este objeto precisa manter a identidade entre renders.
   *
   * Sem o useMemo ele nascia novo a cada render, e quem o usa como
   * dependência — as salas de amigos, os baralhos publicados — via uma
   * dependência sempre diferente: o efeito disparava, mudava estado,
   * renderizava de novo, e recomeçava. Na tela isso aparecia como a aba
   * recarregando sozinha sem parar, e por baixo era uma chamada por render
   * ao servidor. */
  return useMemo(() => ({
    ligado: !!NUVEM_CFG, estado, usuario, erro, ultima, temBackup, sdk, sincroniza: !!pro,
    entrar, cadastrar, recuperar, sair, enviar, restaurarBackup,
  }), [estado, usuario, erro, ultima, temBackup, sdk, pro,
    entrar, cadastrar, recuperar, sair, enviar, restaurarBackup]);
}

/* ═══════════════════════════════════════════════════════════════════
   6 · GOOGLE AGENDA
   ═══════════════════════════════════════════════════════════════════ */

const GOOGLE_CFG = (typeof window !== "undefined" && window.CADENCIA_GOOGLE) || null;
const ESCOPO_GC = "https://www.googleapis.com/auth/calendar.app.created"
  + " https://www.googleapis.com/auth/calendar.events.readonly";
/* drive.file dá acesso só ao que o próprio app criou no Drive: as
   anotações enviadas daqui, e nada mais do que a pessoa tem lá. */
const ESCOPO_DRIVE = "https://www.googleapis.com/auth/drive.file";
/* A ligação permanente pede os dois de uma vez. Autorizar é o passo chato;
   fazer isso duas vezes, uma para a agenda e outra para o Drive, é chato em
   dobro por nada — e é o que fazia "enviar para o Drive" abrir janela toda
   vez, mesmo com a conta já ligada. */
const ESCOPO_PERMANENTE = `${ESCOPO_GC} ${ESCOPO_DRIVE}`;
const API_GC = "https://www.googleapis.com/calendar/v3";
const FUSO = "America/Sao_Paulo";
const NOME_AGENDA = "Cadência · Estudos";
const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

const B32 = "0123456789abcdefghijklmnopqrstuv";
function idGoogle(txt) {
  let bits = "";
  for (let i = 0; i < txt.length; i++) bits += txt.charCodeAt(i).toString(2).padStart(8, "0");
  while (bits.length % 5) bits += "0";
  let out = "";
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out.slice(0, 900);
}

function eventosGoogle({ routine, agenda, ladder, simulados, examDate, today, opts }) {
  const ev = [];
  const monday = weekStart(today);
  if (opts.rotina) {
    for (const b of (agenda || [])) {
      if (b.gid) continue;
      ev.push({
        cat: "rotina", id: idGoogle(`agenda-${b.id}`),
        summary: b.label,
        description: `${b.type} · compromisso do dia (Cadência)`,
        start: { dateTime: `${b.date}T${b.start}:00`, timeZone: FUSO },
        end: { dateTime: `${b.date}T${b.end}:00`, timeZone: FUSO },
      });
    }
    for (const b of routine) {
      const dia = addDays(monday, Number(b.day) || 0);
      ev.push({
        cat: "rotina", id: idGoogle(`rotina-${b.id}`),
        summary: b.label,
        description: `${b.type} · bloco fixo da semana (Cadência)`,
        start: { dateTime: `${dia}T${b.start}:00`, timeZone: FUSO },
        end: { dateTime: `${dia}T${b.end}:00`, timeZone: FUSO },
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[Number(b.day) || 0]}`],
      });
    }
  }
  if (opts.revisoes) {
    const limite = addDays(today, 240);
    for (const r of ladder) {
      for (const st of r.steps) {
        if (st.on || st.due > limite) continue;
        ev.push({
          cat: "revisoes", id: idGoogle(`revisao-${r.id}-${st.d}`),
          summary: `Revisar ${st.label}: ${r.title}`,
          description: `${aLabel(r.area)} · estudado em ${brDate(r.anchor)}`,
          start: { date: st.due }, end: { date: addDays(st.due, 1) },
          transparency: "transparent",
        });
      }
    }
  }
  if (opts.simulados) {
    SIMULADOS.forEach(([nome, ini, fim], i) => {
      if (simulados[i]) return;
      ev.push({
        cat: "simulados", id: idGoogle(`simulado-${i}`),
        summary: `${nome} · janela aberta`,
        description: "Janela oficial do cronograma (Cadência)",
        start: { date: ini }, end: { date: addDays(fim, 1) },
        transparency: "transparent",
      });
    });
  }
  if (opts.prova && examDate) {
    ev.push({
      cat: "prova", id: idGoogle(`prova-${examDate}`),
      summary: "Dia da prova",
      start: { date: examDate }, end: { date: addDays(examDate, 1) },
    });
  }
  return ev;
}

/* O evento como o Google quer receber: sem o "cat", que é etiqueta nossa
   para saber de que grupo ele veio e não campo da API. */
function corpoDoEvento(ev) {
  const { cat, ...resto } = ev;
  return resto;
}

/* Uma marca curta do conteúdo do evento. Serve para o envio automático
   mandar só o que mudou: sem isso, mexer num bloco reescreveria os
   duzentos eventos da agenda a cada edição. */
function marcaDoEvento(ev) {
  const txt = JSON.stringify(corpoDoEvento(ev));
  let h = 5381;
  for (let i = 0; i < txt.length; i++) h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/* As marcas de uma lista de eventos, no formato que fica guardado:
   id do evento → "grupo:marca do conteúdo". */
function marcasDaLista(lista) {
  const m = {};
  for (const ev of lista) m[ev.id] = `${ev.cat}:${marcaDoEvento(ev)}`;
  return m;
}

/* O que precisa subir e o que precisa sumir da agenda do Google.
 *
 * Pura de propósito: são as duas regras que sustentam o envio automático.
 * A primeira é não reescrever o que já está lá igual — sem ela, mexer num
 * bloco reenviaria a agenda inteira a cada tecla. A segunda é só apagar
 * dentro dos grupos ligados — sem ela, desmarcar "revisões" limparia oito
 * meses de revisões da agenda de quem só queria parar de mandar as novas.
 */
function diferencaDaAgenda(lista, antes, opts) {
  const agora = marcasDaLista(lista);
  const velho = antes || {};
  const subir = lista.filter((ev) => velho[ev.id] !== agora[ev.id]);
  const apagar = Object.keys(velho)
    .filter((id) => !agora[id] && !!(opts || {})[String(velho[id]).split(":")[0]]);
  return { agora, subir, apagar };
}

/* Padrão do envio automático: o que a pessoa realmente edita no dia a dia,
   e o que o assistente cria. Revisões, simulados e prova continuam sendo
   escolha dela no cartão da aba Metas — se ela sincronizar com eles
   marcados, a escolha fica guardada e o automático passa a incluí-los. */
const AUTO_PADRAO = { rotina: true, revisoes: false, simulados: false, prova: false };

/* Quanto o envio automático espera parar de mudar antes de subir, e quanta
   mudança ele aceita mandar sem alguém ter clicado em nada. */
const ESPERA_AUTO = 6000;
const LIMITE_AUTO = 400;

/* ── a ligação que não vence ───────────────────────────────────────────
 *
 * O token que o navegador consegue sozinho vale cerca de uma hora e some
 * quando o aplicativo fecha. Renovar sem janela depende de cookie de
 * terceiros, que celular e modo aplicativo costumam barrar, e aí volta a
 * aparecer a tela de autorizar toda vez que a pessoa abre o site.
 *
 * Com a rota /api/google isso muda: a autorização é feita uma vez, pelo
 * fluxo de código, e o servidor guarda o token de atualização. Daí em diante
 * o navegador pede um token de acesso ao próprio site, sem janela nenhuma e
 * sem depender de cookie de terceiros. */
async function falarComGoogle(nuvem, corpo) {
  let token = "";
  try {
    if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
      token = await nuvem.sdk.auth.currentUser.getIdToken();
    }
  } catch (e) { /* sem conta, a rota recusa */ }
  if (!token) return { erro: "Entre na sua conta para ligar o Google." };
  const { dados, erro } = await chamarApi("/api/google", { ...corpo, token }, "A ligação com o Google");
  return erro ? { erro } : (dados || {});
}

function useGoogleAgenda({ data, setData, notify, ladder, today, nuvem }) {
  const [pronto, setPronto] = useState(false);
  const [token, setToken] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [erro, setErro] = useState("");
  const cliente = useRef(null);
  /* null = ainda não perguntei; false = o site não tem isso configurado */
  const [permanente, setPermanente] = useState(null);
  const validade = useRef(0);
  const logado = !!(nuvem && nuvem.usuario);
  /* Espelho de "permanente" sempre atual. Quem clica em sincronizar no
     primeiro segundo, antes da resposta do servidor, decidiria pelo valor
     velho do fechamento e podia abrir duas janelas seguidas. */
  const permanenteRef = useRef(permanente);
  permanenteRef.current = permanente;
  /* O que já subiu para a agenda do Google: id do evento → "grupo:marca".
     Fica num ref porque o envio automático precisa comparar sem se
     reagendar a cada gravação, e é copiado para os dados (googleCal.
     enviados) para sobreviver a fechar o aplicativo. */
  const marcasRef = useRef((data.googleCal && data.googleCal.enviados) || {});
  const semeado = useRef(false);
  useEffect(() => {
    if (semeado.current) return;
    const guardado = data.googleCal && data.googleCal.enviados;
    if (!guardado) return;
    semeado.current = true;
    /* o desta sessão por cima: é o mais recente */
    marcasRef.current = { ...guardado, ...marcasRef.current };
  }, [data.googleCal]);

  useEffect(() => {
    if (!GOOGLE_CFG) return undefined;
    if (window.google && window.google.accounts) { setPronto(true); return undefined; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => setPronto(true);
    s.onerror = () => setErro("Não consegui carregar o login do Google.");
    document.head.appendChild(s);
    return () => { /* o script fica na página */ };
  }, []);

  /* Por que a autorização do Google falhou.
   *
   * Antes tudo virava "Autorização cancelada.", que é justamente a leitura
   * errada nos dois casos mais comuns: o navegador barrando a janela (quase
   * sempre no celular) e o endereço do site não estar liberado no Google
   * Cloud. Nos dois a pessoa não cancelou nada, e a frase mandava procurar
   * defeito no lugar errado. */
  const porQueFalhou = (e) => {
    const tipo = String((e && e.type) || "");
    if (tipo === "popup_failed_to_open") {
      return "O navegador bloqueou a janela do Google. Libere as janelas "
        + "pop-up para este site e tente de novo. No celular é o caso mais comum.";
    }
    if (tipo === "popup_closed") return "A janela do Google foi fechada antes de concluir.";
    const origem = (typeof window !== "undefined" && window.location && window.location.origin) || "este endereço";
    return `Não consegui autorizar com o Google. Se o erro na janela falar em `
      + `"origin_mismatch", falta liberar ${origem} em Origens JavaScript `
      + "autorizadas, no console do Google Cloud, dentro da credencial ID do "
      + "cliente OAuth.";
  };

  /* Já ligado permanentemente? A pergunta é feita uma vez, quando a pessoa
     entra na conta, e a resposta decide se o botão oferece "ligar de vez" ou
     o caminho antigo. */
  useEffect(() => {
    if (!GOOGLE_CFG || !logado) { setPermanente(null); return undefined; }
    let vivo = true;
    (async () => {
      const r = await falarComGoogle(nuvem, { acao: "estado" });
      if (!vivo) return;
      setPermanente(r.disponivel === false ? false : !!r.ligado);
    })();
    return () => { vivo = false; };
  }, [logado, nuvem]);

  /* Um token de acesso vindo do servidor, sem abrir janela. É o caminho que
     faz a conta continuar ligada depois de fechar o aplicativo. */
  const tokenDoServidor = useCallback(async () => {
    if (!logado) return null;
    const r = await falarComGoogle(nuvem, { acao: "token" });
    if (r.acesso) {
      validade.current = Number(r.expiraEm || 0);
      setToken(r.acesso);
      setPermanente(true);
      return r.acesso;
    }
    /* disponivel false é site sem a credencial cadastrada; ligado false é
       autorização que não existe mais. Nos dois casos não adianta perguntar
       de novo a cada token: cai no caminho antigo, com janela. */
    if (r.ligado === false || r.disponivel === false) setPermanente(false);
    return null;
  }, [logado, nuvem]);

  /* Liga a conta de vez: uma janela só, uma vez. O que volta dela é um
     código, que o servidor troca por uma autorização que não vence.
     Devolve o token de acesso quando dá certo; devolve a string vazia
     quando este site não tem a ligação permanente configurada (aí quem
     chamou tenta o caminho antigo, com janela a cada sessão); e devolve
     null quando falhou por outro motivo — janela bloqueada, fechada,
     recusada —, caso em que insistir com outra janela só piora. */
  const ligarDeVez = useCallback(async () => {
    if (!window.google || !window.google.accounts || !GOOGLE_CFG) {
      setErro("O login do Google ainda não carregou. Tente de novo em instantes.");
      return null;
    }
    setErro("");
    const codigo = await new Promise((resolve) => {
      try {
        const c = window.google.accounts.oauth2.initCodeClient({
          client_id: GOOGLE_CFG.clientId,
          scope: ESCOPO_PERMANENTE,
          ux_mode: "popup",
          /* Sem isto, quem já tinha autorizado antes recebe um código que o
             Google troca só por token de acesso, sem o de atualização, e a
             ligação permanente não sai do lugar. */
          prompt: "consent",
          callback: (r) => resolve((r && r.code) || ""),
          error_callback: (e) => { setErro(porQueFalhou(e)); resolve(""); },
        });
        c.requestCode();
      } catch (e) { setErro("Não consegui abrir a autorização do Google."); resolve(""); }
    });
    if (!codigo) return null;

    const r = await falarComGoogle(nuvem, { acao: "ligar", codigo });
    if (r.erro) {
      setErro(r.erro);
      if (r.disponivel === false) { setPermanente(false); return ""; }
      return null;
    }
    if (r.acesso) { setToken(r.acesso); validade.current = Number(r.expiraEm || 0); }
    setPermanente(true);
    setData((p) => ({ ...p, googleCal: { ...(p.googleCal || {}), autoSync: true } }));
    notify("Google ligado. Não precisa autorizar de novo.");
    return r.acesso || (await tokenDoServidor()) || null;
  }, [nuvem, notify, setData, tokenDoServidor]);

  const pedirToken = useCallback(() => new Promise((resolve) => {
    if (!window.google || !window.google.accounts) return resolve(null);
    try {
      cliente.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CFG.clientId,
        scope: ESCOPO_GC,
        callback: (r) => {
          if (r && r.access_token) { setToken(r.access_token); resolve(r.access_token); return; }
          /* O Google devolve o motivo em r.error quando recusa o pedido, e
             engolir isso deixava só "não concluída" na tela. */
          const motivo = (r && (r.error_description || r.error)) || "";
          setErro(motivo ? `O Google recusou a autorização: ${motivo}` : "Autorização não concluída.");
          resolve(null);
        },
        error_callback: (e) => { setErro(porQueFalhou(e)); resolve(null); },
      });
      cliente.current.requestAccessToken();
    } catch (e) { setErro("Não consegui abrir a autorização do Google."); resolve(null); }
  }), []);

  /* O token que vale agora, do jeito menos incômodo possível: o que já está
     na mão, senão o do servidor (silencioso), e só em último caso a janela
     do Google.
     Quando a janela é inevitável, ela é a do fluxo de código — a que liga a
     conta de vez. Antes a janela padrão era a do fluxo de token, que vale
     uma hora e some ao fechar o aplicativo: quem não achasse o cartão
     "Ligar a conta de vez" lá embaixo da aba Metas autorizava de novo a
     cada abertura, para sempre. Agora a primeira autorização já é a
     definitiva, e o cartão virou só o aviso de que está ligada. */
  const garantirToken = useCallback(async (semJanela) => {
    if (token && (!validade.current || validade.current > Date.now())) return token;
    if (permanente !== false && logado) {
      const doServidor = await tokenDoServidor();
      if (doServidor) return doServidor;
    }
    if (semJanela) return null;
    if (logado && permanenteRef.current !== false) {
      const daLigacao = await ligarDeVez();
      /* string com token: deu certo. null: falhou com motivo já na tela, e
         abrir outra janela em cima seria só um segundo bloqueio. "": este
         site não tem a ligação permanente, então vale o caminho antigo. */
      if (daLigacao) return daLigacao;
      if (daLigacao === null) return null;
    }
    return pedirToken();
  }, [token, permanente, logado, tokenDoServidor, ligarDeVez, pedirToken]);

  const chamar = useCallback(async (tk, caminho, metodo, corpo) => {
    const r = await fetch(API_GC + caminho, {
      method: metodo || "GET",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { ok: r.ok, status: r.status, dados: r.status === 204 ? null : await r.json().catch(() => null) };
  }, []);

  const garantirAgenda = useCallback(async (tk) => {
    const salvo = data.googleCal && data.googleCal.id;
    if (salvo) {
      const r = await chamar(tk, `/calendars/${encodeURIComponent(salvo)}`);
      if (r.ok) return salvo;
    }
    const nova = await chamar(tk, "/calendars", "POST", { summary: NOME_AGENDA, timeZone: FUSO });
    if (!nova.ok || !nova.dados || !nova.dados.id) throw new Error("criar agenda");
    setData((p) => ({ ...p, googleCal: { ...(p.googleCal || {}), id: nova.dados.id } }));
    return nova.dados.id;
  }, [data.googleCal, chamar, setData]);

  const sincronizar = useCallback(async (opts) => {
    setErro(""); setOcupado(true); setProgresso({ feito: 0, total: 0 });
    try {
      const tk = await garantirToken();
      if (!tk) { setOcupado(false); setProgresso(null); return; }
      const cal = await garantirAgenda(tk);
      const lista = eventosGoogle({
        routine: data.routine, agenda: data.agenda, ladder, simulados: data.simulados,
        examDate: data.profile.examDate, today, opts,
      });
      if (lista.length === 0) {
        setOcupado(false); setProgresso(null);
        return notify("Nada selecionado para sincronizar.");
      }
      setProgresso({ feito: 0, total: lista.length });
      let feito = 0, falhas = 0;
      const enviados = {};
      const fila = lista.slice();
      const trabalhar = async () => {
        for (;;) {
          const ev = fila.shift();
          if (!ev) return;
          const corpo = corpoDoEvento(ev);
          let r = await chamar(tk, `/calendars/${encodeURIComponent(cal)}/events`, "POST", corpo);
          if (r.status === 409) {
            r = await chamar(tk, `/calendars/${encodeURIComponent(cal)}/events/${ev.id}`, "PUT", corpo);
          }
          if (!r.ok) falhas += 1;
          else enviados[ev.id] = `${ev.cat}:${marcaDoEvento(ev)}`;
          feito += 1;
          setProgresso({ feito, total: lista.length });
        }
      };
      await Promise.all([trabalhar(), trabalhar(), trabalhar(), trabalhar()]);
      /* Guarda o que subiu e com quais grupos: daqui em diante o envio
         automático compara com isso e manda só a diferença. */
      marcasRef.current = { ...marcasRef.current, ...enviados };
      setData((p) => ({
        ...p,
        googleCal: {
          ...(p.googleCal || {}),
          id: cal, ultima: Date.now(), autoSync: true,
          opts: { ...AUTO_PADRAO, ...opts },
          enviados: marcasRef.current,
        },
      }));
      notify(falhas
        ? `${lista.length - falhas} de ${lista.length} eventos sincronizados.`
        : `${lista.length} eventos sincronizados na agenda.`);
    } catch (e) {
      setErro("A sincronização falhou. Tente conectar de novo.");
      setToken(null);
    } finally { setOcupado(false); setProgresso(null); }
  }, [token, pedirToken, garantirAgenda, data.routine, data.agenda, data.simulados,
    data.profile.examDate, ladder, today, chamar, setData, notify]);

  /* Lê os compromissos com horário marcado da semana pedida e grava com a
     data exata. O identificador do Google evita duplicar ao puxar de novo.
     Separada do clique do botão (importarRotina) para poder ser chamada
     também pela sincronização automática, já com o token em mãos — assim
     ela nunca dispara um pedido de autorização sozinha. */
  const executarImportacao = useCallback(async (tk, inicioSemana, silencioso) => {
    const de = inicioSemana || weekStart(today);
    const ini = new Date(`${de}T00:00:00`).toISOString();
    const fim = new Date(`${addDays(de, 7)}T00:00:00`).toISOString();
    const r = await chamar(tk,
      `/calendars/primary/events?timeMin=${encodeURIComponent(ini)}`
      + `&timeMax=${encodeURIComponent(fim)}&singleEvents=true&orderBy=startTime&maxResults=250`);
    if (!r.ok || !r.dados || !r.dados.items) throw new Error("busca");

    const tipoDe = (txt) => {
      const s = (txt || "").toLowerCase();
      if (/plant[ãa]o/.test(s)) return "Plantão";
      if (/enferm|visita|ambulat|amb\b|consult|parecer|sess[ãa]o/.test(s)) return "Enfermaria";
      if (/aula|reuni[ãa]o|semin[áa]rio|palestra/.test(s)) return "Aula";
      if (/quest|banco/.test(s)) return "Questões";
      if (/estud|revis/.test(s)) return "Estudo";
      if (/almo[çc]o|descans|folga|academia|treino/.test(s)) return "Descanso";
      return "Pessoal";
    };

    const novos = [];
    for (const ev of r.dados.items) {
      if (ev.status === "cancelled") continue;
      if (!ev.start || !ev.start.dateTime || !ev.end || !ev.end.dateTime) continue;
      if ((ev.attendees || []).some((a) => a.self && a.responseStatus === "declined")) continue;
      const a = new Date(ev.start.dateTime), b = new Date(ev.end.dateTime);
      if (toISO(a) !== toISO(b)) continue;
      novos.push({
        id: uid(), gid: ev.id || null, date: toISO(a),
        label: (ev.summary || "Sem título").slice(0, 60),
        type: tipoDe(ev.summary),
        start: `${pad(a.getHours())}:${pad(a.getMinutes())}`,
        end: `${pad(b.getHours())}:${pad(b.getMinutes())}`,
      });
    }

    /* Chegou até aqui com a leitura ok: conta como sincronização válida,
       tenha ou não achado compromisso novo — é o que liga o "sozinho daqui
       pra frente" na primeira vez que a pessoa clica em Puxar do Google. */
    setData((p) => ({ ...p, googleCal: { ...(p.googleCal || {}), autoSync: true, ultima: Date.now() } }));

    if (novos.length === 0) {
      if (!silencioso) notify("Nenhum compromisso com horário marcado nesta semana.");
      return;
    }

    let somados = 0, atualizados = 0;
    setData((p) => {
      const atual = (p.agenda || []).slice();
      const chave = (x) => (x.gid ? `g:${x.gid}` : `m:${x.date}|${x.start}|${x.end}|${(x.label || "").toLowerCase()}`);
      const idx = new Map(atual.map((x, i) => [chave(x), i]));
      for (const n of novos) {
        const k = chave(n);
        if (idx.has(k)) {
          const i = idx.get(k);
          atual[i] = { ...atual[i], date: n.date, label: n.label, start: n.start, end: n.end };
          atualizados += 1;
        } else { atual.push(n); idx.set(k, atual.length - 1); somados += 1; }
      }
      return { ...p, agenda: atual };
    });
    if (!silencioso) {
      window.setTimeout(() => {
        const partes = [];
        if (somados) partes.push(`${somados} novo${somados === 1 ? "" : "s"}`);
        if (atualizados) partes.push(`${atualizados} atualizado${atualizados === 1 ? "" : "s"}`);
        notify(`Compromissos da semana: ${partes.join(" e ")}.`);
      }, 60);
    }
  }, [today, chamar, setData, notify]);

  const importarRotina = useCallback(async (inicioSemana) => {
    setErro(""); setOcupado(true);
    try {
      const tk = await garantirToken();
      if (!tk) { setOcupado(false); return; }
      await executarImportacao(tk, inicioSemana, false);
    } catch (e) {
      setErro("Não consegui ler a agenda. Talvez falte autorizar a leitura.");
    } finally { setOcupado(false); }
  }, [token, pedirToken, executarImportacao]);

  const desconectar = useCallback(async () => {
    try {
      if (token && window.google && window.google.accounts) {
        window.google.accounts.oauth2.revoke(token, () => {});
      }
    } catch (e) { /* noop */ }
    /* Se a conta estava ligada de vez, apagar no servidor é o que desliga de
       verdade: sem isso o próximo token viria do token de atualização
       guardado lá e a pessoa continuaria conectada sem entender por quê. */
    if (permanente) { await falarComGoogle(nuvem, { acao: "desligar" }); setPermanente(false); }
    setToken(null);
    validade.current = 0;
    setData((p) => ({ ...p, googleCal: { ...(p.googleCal || {}), autoSync: false } }));
    notify("Desconectado do Google Agenda.");
  }, [token, permanente, nuvem, notify, setData]);

  /* Sincronização sozinha: depois que a pessoa puxa do Google uma vez
     (importarRotina acima liga autoSync), pega um token sem abrir janela
     nenhuma e relê a semana atual a cada 30 minutos com a aba aberta, e de
     novo sempre que a aba volta a ficar visível depois de ficar 15 minutos
     ou mais em segundo plano.
     O token vem do servidor, e só de lá. Aqui existia uma segunda
     tentativa, pelo próprio navegador, com prompt vazio: em teoria ela
     renovava calada, na prática ela É a tela de "entrar com o Google" que
     aparecia sozinha a cada abertura. Prompt vazio não quer dizer janela
     nenhuma — quer dizer sem tela de consentimento; quando o navegador não
     consegue resolver a sessão em silêncio, e hoje ele quase nunca
     consegue (Chrome e Safari barram cookie de terceiros, e no aplicativo
     instalado não há cookie nenhum), ele abre a escolha de conta. Sem
     ninguém ter clicado em nada, um segundo e meio depois de abrir o app.

     Então sumiu. Sem token do servidor, a sincronização sozinha para e
     diz que parou (autoParou), em vez de pedir para entrar de novo. */
  const autoSync = !!(data.googleCal && data.googleCal.autoSync);
  const ultimaAutoRef = useRef(0);
  /* A tentativa silenciosa falhou: sem a conta ligada de vez, o token do
     navegador vale uma hora e renovar sem janela depende de cookie de
     terceiros, que celular e modo aplicativo barram. Antes isso era mudo —
     a linha continuava dizendo "sincronizando sozinho a cada 30 min" com
     uma hora velha embaixo, e a pessoa só descobria puxando na mão. */
  const [autoParou, setAutoParou] = useState(false);
  useEffect(() => {
    if (!GOOGLE_CFG || !autoSync || !pronto) return undefined;
    let cancelado = false;

    const rodar = async () => {
      if (cancelado) return;
      /* semJanela: este caminho nunca pode abrir nada. Ninguém clicou. */
      const tk = await garantirToken(true);
      if (cancelado) return;
      if (!tk) { setAutoParou(true); return; }
      setAutoParou(false);
      if (!token) setToken(tk);
      ultimaAutoRef.current = Date.now();
      try { await executarImportacao(tk, weekStart(today), true); } catch (e) { /* tentativa silenciosa, ignora */ }
    };

    const primeira = window.setTimeout(rodar, 1500);
    const intervalo = window.setInterval(rodar, 30 * 60 * 1000);
    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimaAutoRef.current < 15 * 60 * 1000) return;
      rodar();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      cancelado = true;
      window.clearTimeout(primeira);
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [autoSync, pronto, token, executarImportacao, today]);

  /* ── mão dupla: o que muda aqui sobe sozinho para o Google ──────────
   *
   * A volta (Google → site) já existia na importação automática acima. A
   * ida só acontecia no clique de "Sincronizar agora": criar um plantão na
   * aba Rotina, ou pedir um bloco ao assistente, deixava a agenda do
   * Google para trás até alguém lembrar do botão. Agora cada mudança sobe
   * sozinha alguns segundos depois de parar de digitar.
   *
   * Sobe só a diferença. Cada evento carrega uma marca do próprio
   * conteúdo, e o que já está lá com a mesma marca não é reescrito — sem
   * isso, mexer num bloco reenviaria a agenda inteira a cada tecla. O que
   * sumiu daqui é apagado lá, mas só dentro dos grupos ligados: senão
   * desmarcar "revisões" limparia oito meses de revisões da agenda de quem
   * só queria parar de mandar as novas.
   *
   * Nunca abre janela: usa garantirToken(true), o caminho silencioso. Por
   * isso exige a conta ligada de vez — sem ela não há token silencioso, e
   * a alternativa seria justamente a janela que ninguém pediu.
   */
  const autoEnviar = !!(data.googleCal && data.googleCal.autoEnviar !== false);
  const [enviandoAuto, setEnviandoAuto] = useState(false);
  const ocupadoAuto = useRef(false);
  const agendaRef = useRef("");
  agendaRef.current = (data.googleCal && data.googleCal.id) || agendaRef.current;
  /* Estas funções mudam de identidade a cada token novo. Guardadas em ref,
     o efeito não precisa tê-las como dependência — e assim ele só acorda
     quando o conteúdo muda de verdade, nunca por rerrenderização. */
  const garantirTokenRef = useRef(garantirToken);
  garantirTokenRef.current = garantirToken;
  const garantirAgendaRef = useRef(garantirAgenda);
  garantirAgendaRef.current = garantirAgenda;

  const autoMapa = useMemo(() => {
    if (!GOOGLE_CFG || !autoSync || !autoEnviar || permanente !== true) return { chave: "" };
    const opts = { ...AUTO_PADRAO, ...((data.googleCal && data.googleCal.opts) || null) };
    const lista = eventosGoogle({
      routine: data.routine, agenda: data.agenda, ladder, simulados: data.simulados,
      examDate: data.profile.examDate, today, opts,
    });
    const agora = marcasDaLista(lista);
    /* A chave é texto de propósito: ladder e agenda são arrays novos a cada
       rerrenderização, e depender deles reiniciaria a espera para sempre. */
    return { chave: JSON.stringify([opts, agora]), lista, opts };
  }, [autoSync, autoEnviar, permanente, data.googleCal, data.routine, data.agenda,
    data.simulados, data.profile.examDate, ladder, today]);

  useEffect(() => {
    if (!autoMapa.chave) return undefined;
    let cancelado = false;
    const t = window.setTimeout(async () => {
      if (cancelado || ocupadoAuto.current) return;
      const antes = marcasRef.current || {};
      const { agora, subir, apagar } = diferencaDaAgenda(autoMapa.lista, antes, autoMapa.opts);
      if (!subir.length && !apagar.length) return;
      /* Volume de mudança que não vem de edição humana (troca de conta,
         restauração de backup). Melhor deixar para o botão, que mostra o
         andamento, do que escrever centenas de eventos em silêncio. */
      if (subir.length + apagar.length > LIMITE_AUTO) return;
      ocupadoAuto.current = true;
      setEnviandoAuto(true);
      try {
        const tk = await garantirTokenRef.current(true);
        if (!tk || cancelado) return;
        const cal = agendaRef.current || await garantirAgendaRef.current(tk);
        agendaRef.current = cal;
        const feitas = { ...antes };
        for (const ev of subir) {
          if (cancelado) break;
          const corpo = corpoDoEvento(ev);
          let r = await chamar(tk, `/calendars/${encodeURIComponent(cal)}/events`, "POST", corpo);
          if (r.status === 409) {
            r = await chamar(tk, `/calendars/${encodeURIComponent(cal)}/events/${ev.id}`, "PUT", corpo);
          }
          if (r.ok) feitas[ev.id] = agora[ev.id];
        }
        for (const id of apagar) {
          if (cancelado) break;
          const r = await chamar(tk, `/calendars/${encodeURIComponent(cal)}/events/${id}`, "DELETE");
          /* 404 e 410 são "já não está lá", que é exatamente o que se queria */
          if (r.ok || r.status === 404 || r.status === 410) delete feitas[id];
        }
        marcasRef.current = feitas;
        if (!cancelado) {
          setData((p) => ({
            ...p,
            googleCal: { ...(p.googleCal || {}), id: cal, enviados: feitas, ultima: Date.now() },
          }));
        }
      } catch (e) {
        /* Calado de propósito: é trabalho de fundo, e a próxima mudança
           tenta de novo com o mesmo resultado esperado. */
      } finally { ocupadoAuto.current = false; setEnviandoAuto(false); }
    }, ESPERA_AUTO);
    return () => { cancelado = true; window.clearTimeout(t); };
  }, [autoMapa.chave, chamar, setData]);

  const mudarAutoEnviar = useCallback((ligado) => {
    setData((p) => ({ ...p, googleCal: { ...(p.googleCal || {}), autoEnviar: !!ligado } }));
  }, [setData]);

  return {
    disponivel: !!GOOGLE_CFG, pronto, conectado: !!token, ocupado, progresso, erro,
    sincronizar, importarRotina, desconectar, autoSync, autoParou,
    autoEnviar, mudarAutoEnviar, enviandoAuto,
    /* permanente: true já ligado de vez, false não dá (ou foi desligado),
       null ainda não perguntei ao servidor. */
    permanente, ligarDeVez, podeLigarDeVez: logado && permanente !== false, logado,
    ultima: (data.googleCal && data.googleCal.ultima) || 0,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   6.4 · GOOGLE DRIVE
   Usado só para enviar a anotação exportada (parte17.jsx) para uma pasta
   que a pessoa escolhe no Drive dela. Pedido de autorização separado do da
   Agenda, com um escopo diferente (drive.file) — só na hora em que a
   pessoa realmente clica em enviar algo, não de saída: quem nunca usa essa
   função nunca vê essa tela de permissão do Google.

   drive.file é o escopo mínimo: só alcança os arquivos que este app criou
   ou que a pessoa abriu com ele — nunca o Drive inteiro. É por isso que dá
   para criar pasta e enviar arquivo aqui, mas não listar tudo que já existe
   fora do que este app criou (a pasta em si a pessoa escolhe/cria por
   aqui, então esse limite não atrapalha o fluxo).
   ═══════════════════════════════════════════════════════════════════ */

const API_DRIVE = "https://www.googleapis.com/drive/v3";
const API_DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

function useGoogleDrive(nuvem) {
  const [pronto, setPronto] = useState(false);
  const [token, setToken] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const cliente = useRef(null);
  /* Se o token do servidor serve para o Drive. Começa "não sei"; vira
     false quando o servidor não tem ligação guardada, ou quando a ligação
     é antiga e foi autorizada só para a agenda (aí o Drive responde 403 e
     não adianta insistir nesta sessão). */
  const servidorServe = useRef(null);

  useEffect(() => {
    if (!GOOGLE_CFG) return undefined;
    if (window.google && window.google.accounts) { setPronto(true); return undefined; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => setPronto(true);
    s.onerror = () => setErro("Não consegui carregar o login do Google.");
    document.head.appendChild(s);
    return undefined;
  }, []);

  /* Sempre resolve com { token, erro } — nunca só o token — porque quem
     chama (enviarArquivo, sobretudo) precisa da mensagem exata de erro na
     hora, como valor de retorno. Ler o estado erro logo depois de um
     await aqui dentro pegaria o valor de ANTES do setErro acima ter
     efeito (o fechamento da função já capturou aquele valor no
     render passado) — foi assim que uma falha ao enviar para o Drive
     ficava muda: o botão "parava" sem avisar nada. */
  const pedirToken = useCallback(() => new Promise((resolve) => {
    if (!window.google || !window.google.accounts) {
      const msg = "O login do Google ainda não carregou. Espere um instante e tente de novo.";
      setErro(msg); resolve({ token: null, erro: msg });
      return;
    }
    try {
      cliente.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CFG.clientId,
        scope: ESCOPO_DRIVE,
        callback: (r) => {
          if (r && r.access_token) { setToken(r.access_token); resolve({ token: r.access_token, erro: "" }); return; }
          const motivo = (r && (r.error_description || r.error)) || "";
          const msg = motivo ? `O Google recusou a autorização: ${motivo}` : "Autorização não concluída.";
          setErro(msg); resolve({ token: null, erro: msg });
        },
        error_callback: () => { const msg = "Não consegui autorizar o Google Drive."; setErro(msg); resolve({ token: null, erro: msg }); },
      });
      cliente.current.requestAccessToken();
    } catch (e) { const msg = "Não consegui abrir a autorização do Google."; setErro(msg); resolve({ token: null, erro: msg }); }
  }), []);

  /* Token sem abrir janela nenhuma, vindo da conta ligada de vez. É o que
     faz "enviar para o Drive" parar de pedir autorização toda vez. */
  const tokenDoServidor = useCallback(async () => {
    if (!nuvem || servidorServe.current === false) return null;
    const r = await falarComGoogle(nuvem, { acao: "token" });
    if (r.acesso) { setToken(r.acesso); return r.acesso; }
    servidorServe.current = false;
    return null;
  }, [nuvem]);

  const conseguirToken = useCallback(async () => {
    if (token) return { token, erro: "", doServidor: servidorServe.current === true };
    const doServidor = await tokenDoServidor();
    if (doServidor) { servidorServe.current = true; return { token: doServidor, erro: "", doServidor: true }; }
    return pedirToken();
  }, [token, tokenDoServidor, pedirToken]);

  /* O Google recusou o token do servidor: quase sempre é ligação antiga,
     autorizada quando a permanente ainda não pedia o escopo do Drive. Uma
     janela só resolve, e desta sessão em diante o servidor não é mais
     tentado. */
  const janelaDepoisDoServidor = useCallback(async () => {
    servidorServe.current = false;
    setToken(null);
    return pedirToken();
  }, [pedirToken]);

  const conectar = useCallback(async () => {
    setErro(""); setOcupado(true);
    const { token: tk } = await conseguirToken();
    setOcupado(false);
    return !!tk;
  }, [conseguirToken]);

  const chamar = useCallback(async (caminho, opts) => {
    const { token: tk, doServidor } = await conseguirToken();
    if (!tk) return null;
    const ir = (t) => fetch(API_DRIVE + caminho, { ...opts, headers: { Authorization: `Bearer ${t}`, ...(opts && opts.headers) } });
    const r = await ir(tk);
    if (r.ok || !doServidor || (r.status !== 401 && r.status !== 403)) return r;
    const outro = await janelaDepoisDoServidor();
    return outro.token ? ir(outro.token) : r;
  }, [conseguirToken, janelaDepoisDoServidor]);

  const listarPastas = useCallback(async (paiId) => {
    setErro(""); setOcupado(true);
    const pai = paiId || "root";
    const q = encodeURIComponent(`'${pai}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const r = await chamar(`/files?q=${q}&fields=files(id,name)&orderBy=name&pageSize=100&spaces=drive`);
    setOcupado(false);
    if (!r) return null;
    if (!r.ok) { setErro("Não consegui listar as pastas do Drive."); return null; }
    const j = await r.json().catch(() => null);
    return (j && j.files) || [];
  }, [chamar]);

  const criarPasta = useCallback(async (nome, paiId) => {
    setErro(""); setOcupado(true);
    const r = await chamar("/files?fields=id,name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nome, mimeType: "application/vnd.google-apps.folder", parents: [paiId || "root"] }),
    });
    setOcupado(false);
    if (!r) return null;
    if (!r.ok) { setErro("Não consegui criar a pasta no Drive."); return null; }
    return r.json().catch(() => null);
  }, [chamar]);

  /* Devolve { ok, dados, erro } sempre — nunca só null no fracasso — pelo
     mesmo motivo do pedirToken acima: quem chama (ModalDrive.enviar, em
     parte17.jsx) precisa saber IMEDIATAMENTE, pelo valor devolvido, o que
     deu errado, em vez de reler o estado erro depois (que pode não ter
     sido atualizado ainda quando o await volta). */
  const enviarArquivo = useCallback(async (nome, mime, blob, pastaId) => {
    setErro(""); setOcupado(true);
    const { token: tk, erro: motivoToken, doServidor } = await conseguirToken();
    if (!tk) { setOcupado(false); return { ok: false, erro: motivoToken || "Não consegui autorizar o Google Drive." }; }
    const metadados = { name: nome, parents: [pastaId || "root"] };
    const boundary = `cadencia-${uid()}`;
    const cabecalho = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadados)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
    const corpo = new Blob([cabecalho, blob, `\r\n--${boundary}--`]);
    const subir = (t) => fetch(`${API_DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,webViewLink`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body: corpo,
    });
    let r;
    try {
      r = await subir(tk);
      /* Token do servidor recusado: ligação autorizada antes de a
         permanente pedir o escopo do Drive. Abre a janela uma vez e sobe
         de novo, em vez de devolver um erro que a pessoa não tem como
         entender. */
      if (!r.ok && doServidor && (r.status === 401 || r.status === 403)) {
        const outro = await janelaDepoisDoServidor();
        if (outro.token) r = await subir(outro.token);
      }
    } catch (e) {
      setOcupado(false);
      const msg = "Sem conexão para enviar ao Drive. Confira a internet e tente de novo.";
      setErro(msg);
      return { ok: false, erro: msg };
    }
    setOcupado(false);
    if (!r.ok) {
      /* O Google costuma mandar o motivo exato (ex.: "Drive API não está
         ativada"); mostrar esse texto em vez de um genérico ajuda a
         pessoa (ou quem for configurar o site) a saber o que corrigir. */
      const detalhe = await r.json().catch(() => null);
      const msg = (detalhe && detalhe.error && detalhe.error.message)
        ? `Não consegui enviar ao Drive: ${detalhe.error.message}`
        : "Não consegui enviar o arquivo para o Drive.";
      setErro(msg);
      return { ok: false, erro: msg };
    }
    const dados = await r.json().catch(() => null);
    return { ok: true, dados };
  }, [conseguirToken, janelaDepoisDoServidor]);

  return {
    disponivel: !!GOOGLE_CFG, pronto, conectado: !!token, ocupado, erro,
    conectar, listarPastas, criarPasta, enviarArquivo,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   6.5 · MENTOR
   Quem resgata o cupom "mentor1612" (rota /api/cupom) ganha esta aba, e
   adiciona alunos pelo e-mail com que eles se cadastraram. Os dados do
   aluno ficam inteiros na nuvem dele — o hook só chama o servidor, nunca
   mexe direto no Firestore, porque as regras não deixam ninguém ler o
   documento de outra pessoa. Isso é papel da rota /api/mentor, com a
   conta de serviço.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_MENTOR = "/api/mentor";

async function chamarMentor(nuvem, corpo) {
  let token = "";
  try {
    if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
      token = await nuvem.sdk.auth.currentUser.getIdToken();
    }
  } catch (e) { /* segue sem token, o servidor recusa */ }
  if (!token) return { erro: "Entre na sua conta para usar a aba Mentor." };
  const { dados, erro } = await chamarApi(ROTA_MENTOR, { ...corpo, token }, "A aba Mentor");
  return erro ? { erro } : dados;
}

function useMentor(nuvem) {
  const [mentor, setMentor] = useState(false);
  const [alunos, setAlunos] = useState([]);
  const [carregado, setCarregado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const atualizar = useCallback(async () => {
    if (!nuvem.usuario) { setMentor(false); setAlunos([]); setCarregado(true); return; }
    const r = await chamarMentor(nuvem, { acao: "status" });
    if (r.erro) { setErro(r.erro); setCarregado(true); return; }
    setMentor(!!r.mentor); setAlunos(r.alunos || []); setErro(""); setCarregado(true);
  }, [nuvem]);

  useEffect(() => { atualizar(); }, [nuvem.usuario, atualizar]);

  const adicionar = useCallback(async (email) => {
    setOcupado(true); setErro("");
    const r = await chamarMentor(nuvem, { acao: "adicionar", email });
    setOcupado(false);
    if (r.erro) { setErro(r.erro); return r; }
    setAlunos(r.alunos || []);
    return r;
  }, [nuvem]);

  const remover = useCallback(async (uid) => {
    setOcupado(true); setErro("");
    const r = await chamarMentor(nuvem, { acao: "remover", uid });
    setOcupado(false);
    if (r.erro) { setErro(r.erro); return r; }
    setAlunos(r.alunos || []);
    return r;
  }, [nuvem]);

  const buscarAluno = useCallback((uid) => chamarMentor(nuvem, { acao: "aluno", uid }), [nuvem]);
  const salvarRotina = useCallback((uid, rotina) => chamarMentor(nuvem, { acao: "rotina", uid, rotina }), [nuvem]);
  const salvarTarefas = useCallback((uid, tarefas) => chamarMentor(nuvem, { acao: "tarefas", uid, tarefas }), [nuvem]);
  const marcar = useCallback((uid, materiaId, feito) => chamarMentor(nuvem, { acao: "marcar", uid, materiaId, feito }), [nuvem]);

  return {
    mentor, alunos, carregado, ocupado, erro, atualizar,
    adicionar, remover, buscarAluno, salvarRotina, salvarTarefas, marcar,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   7 · CRONÔMETRO
   O estado vive em disco como instantes absolutos, então continua
   correndo com o site fechado.
   ═══════════════════════════════════════════════════════════════════ */

function beep(times) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 660;
      const t0 = ctx.currentTime + i * 0.28;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.start(t0); o.stop(t0 + 0.24);
    }
    window.setTimeout(() => { try { ctx.close(); } catch (e) { /* noop */ } }, 1600);
  } catch (e) { /* áudio indisponível */ }
}

const CHAVE_TIMER = "cadencia:v3:timer";
function lerTimer() {
  try { const r = window.localStorage.getItem(CHAVE_TIMER); return r ? JSON.parse(r) : null; }
  catch (e) { return null; }
}
function gravarTimer(v) {
  try { window.localStorage.setItem(CHAVE_TIMER, JSON.stringify(v)); } catch (e) { /* noop */ }
}

function usePomodoro({ pomo, onFocusDone, notify, pronto }) {
  const guardado = useRef(null);
  if (guardado.current === null) guardado.current = lerTimer() || false;
  const S = guardado.current || {};

  const [phase, setPhase] = useState(S.phase || "foco");
  const [round, setRound] = useState(S.round || 1);
  const [running, setRunningRaw] = useState(!!S.running);
  const [endsAt, setEndsAt] = useState(S.endsAt || 0);
  const [rest, setRest] = useState(typeof S.rest === "number" ? S.rest : pomo.focus * 60);
  const [swInicio, setSwInicio] = useState(S.swInicio || 0);
  const [swAcum, setSwAcum] = useState(S.swAcum || 0);
  const [, force] = useState(0);
  const cfg = useRef(pomo);
  cfg.current = pomo;
  const durAnterior = useRef(false);
  const avisado = useRef(false);

  const modo = pomo.modo === "corrido" ? "corrido" : "pomodoro";
  const durOf = useCallback((ph) => {
    const c = cfg.current;
    return (ph === "foco" ? c.focus : ph === "curta" ? c.short : c.long) * 60;
  }, []);

  const left = running ? Math.max(0, Math.round((endsAt - Date.now()) / 1000)) : rest;
  const total = durOf(phase);
  const corrido = running ? swAcum + Math.max(0, Math.round((Date.now() - swInicio) / 1000)) : swAcum;

  useEffect(() => {
    gravarTimer({ modo, phase, round, running, endsAt, rest, swInicio, swAcum, em: Date.now() });
  }, [modo, phase, round, running, endsAt, rest, swInicio, swAcum]);

  useEffect(() => {
    if (!running) return undefined;
    const i = window.setInterval(() => force((n) => n + 1), 250);
    return () => window.clearInterval(i);
  }, [running]);

  /* durações mudaram nos ajustes: acompanha, mas só depois que os dados
     salvos chegaram, senão apagaria o que foi restaurado */
  useEffect(() => {
    if (!pronto) return;
    const chave = `${pomo.focus}|${pomo.short}|${pomo.long}`;
    if (durAnterior.current === false) { durAnterior.current = chave; return; }
    if (durAnterior.current === chave) return;
    durAnterior.current = chave;
    if (!running) setRest(durOf(phase));
  }, [pronto, pomo.focus, pomo.short, pomo.long]); // eslint-disable-line

  const setRunning = useCallback((v) => {
    if (modo === "corrido") {
      if (v) { setSwInicio(Date.now()); setRunningRaw(true); }
      else {
        setSwAcum((a) => a + Math.max(0, Math.round((Date.now() - swInicio) / 1000)));
        setRunningRaw(false);
      }
      return;
    }
    if (v) { setEndsAt(Date.now() + Math.max(1, rest) * 1000); setRunningRaw(true); }
    else { setRest(Math.max(0, Math.round((endsAt - Date.now()) / 1000))); setRunningRaw(false); }
  }, [modo, rest, endsAt, swInicio]);

  const encerrarCorrido = useCallback(() => {
    const seg = running ? swAcum + Math.max(0, Math.round((Date.now() - swInicio) / 1000)) : swAcum;
    const min = Math.round(seg / 60);
    setRunningRaw(false); setSwAcum(0); setSwInicio(0);
    if (min < 1) { notify("Menos de um minuto, não registrei."); return; }
    onFocusDone(min, "tempo corrido");
    if (cfg.current.sound) beep(1);
    notify(`${fmtMin(min)} registrados.`);
  }, [running, swAcum, swInicio, onFocusDone, notify]);

  const modoAnterior = useRef(null);
  useEffect(() => {
    if (!pronto) return;
    if (modoAnterior.current === null) { modoAnterior.current = modo; return; }
    if (modoAnterior.current === modo) return;
    modoAnterior.current = modo;
    setRunningRaw(false); setSwAcum(0); setSwInicio(0); setRest(durOf(phase));
  }, [pronto, modo]); // eslint-disable-line

  const advance = useCallback((auto) => {
    const c = cfg.current;
    const goTo = (ph) => {
      const d = durOf(ph);
      setPhase(ph); setRest(d);
      if (auto && c.autoNext) { setEndsAt(Date.now() + d * 1000); setRunningRaw(true); }
      else setRunningRaw(false);
    };
    if (phase === "foco") {
      if (c.sound) beep(2);
      onFocusDone(c.focus, "pomodoro");
      const isLong = round % c.cycle === 0;
      goTo(isLong ? "longa" : "curta");
      notify(isLong ? "Ciclo fechado. Pausa longa." : "Pomodoro concluído. Pausa curta.");
    } else {
      if (c.sound) beep(1);
      setRound((r) => r + 1);
      goTo("foco");
      notify("Pausa encerrada. De volta ao foco.");
    }
  }, [phase, round, durOf, onFocusDone, notify]);

  /* Reabriu depois que o bloco já tinha vencido: fecha aquele bloco uma
     vez só e para, em vez de emendar ciclos que ninguém acompanhou. */
  useEffect(() => {
    if (!pronto || avisado.current) return;
    if (modo === "corrido") { avisado.current = true; return; }
    const s = guardado.current;
    if (!s || !s.running || !s.endsAt || Date.now() < s.endsAt) { avisado.current = true; return; }
    avisado.current = true;
    const atraso = Math.round((Date.now() - s.endsAt) / 60000);
    if (s.phase === "foco") {
      const longa = round % cfg.current.cycle === 0;
      onFocusDone(cfg.current.focus, "pomodoro");
      setPhase(longa ? "longa" : "curta");
      setRest(durOf(longa ? "longa" : "curta"));
      setRunningRaw(false);
      notify(`O pomodoro terminou com o site fechado, há ${fmtMin(atraso)}. Registrei o bloco.`);
    } else {
      setPhase("foco"); setRest(durOf("foco")); setRunningRaw(false); setRound((r) => r + 1);
      notify("A pausa terminou enquanto você estava fora.");
    }
  }, [pronto, modo, durOf, onFocusDone, notify, round]);

  useEffect(() => {
    if (modo === "corrido") return;
    if (running && left <= 0) advance(true);
  }, [modo, running, left, advance]);

  const reset = useCallback(() => {
    if (modo === "corrido") { setRunningRaw(false); setSwAcum(0); setSwInicio(0); return; }
    setRunningRaw(false); setRest(durOf(phase));
  }, [modo, durOf, phase]);
  const jumpTo = useCallback((ph) => { setRunningRaw(false); setPhase(ph); setRest(durOf(ph)); }, [durOf]);

  return {
    modo, phase, left, running, round, total, corrido,
    setRunning, advance, reset, jumpTo, encerrarCorrido,
  };
}
