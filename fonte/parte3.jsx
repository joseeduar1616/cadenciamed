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
        id: idGoogle(`agenda-${b.id}`),
        summary: b.label,
        description: `${b.type} · compromisso do dia (Cadência)`,
        start: { dateTime: `${b.date}T${b.start}:00`, timeZone: FUSO },
        end: { dateTime: `${b.date}T${b.end}:00`, timeZone: FUSO },
      });
    }
    for (const b of routine) {
      const dia = addDays(monday, Number(b.day) || 0);
      ev.push({
        id: idGoogle(`rotina-${b.id}`),
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
          id: idGoogle(`revisao-${r.id}-${st.d}`),
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
        id: idGoogle(`simulado-${i}`),
        summary: `${nome} · janela aberta`,
        description: "Janela oficial do cronograma (Cadência)",
        start: { date: ini }, end: { date: addDays(fim, 1) },
        transparency: "transparent",
      });
    });
  }
  if (opts.prova && examDate) {
    ev.push({
      id: idGoogle(`prova-${examDate}`),
      summary: "Dia da prova",
      start: { date: examDate }, end: { date: addDays(examDate, 1) },
    });
  }
  return ev;
}

function useGoogleAgenda({ data, setData, notify, ladder, today }) {
  const [pronto, setPronto] = useState(false);
  const [token, setToken] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [erro, setErro] = useState("");
  const cliente = useRef(null);

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
      const tk = token || (await pedirToken());
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
      const fila = lista.slice();
      const trabalhar = async () => {
        for (;;) {
          const ev = fila.shift();
          if (!ev) return;
          let r = await chamar(tk, `/calendars/${encodeURIComponent(cal)}/events`, "POST", ev);
          if (r.status === 409) {
            r = await chamar(tk, `/calendars/${encodeURIComponent(cal)}/events/${ev.id}`, "PUT", ev);
          }
          if (!r.ok) falhas += 1;
          feito += 1;
          setProgresso({ feito, total: lista.length });
        }
      };
      await Promise.all([trabalhar(), trabalhar(), trabalhar(), trabalhar()]);
      setData((p) => ({ ...p, googleCal: { ...(p.googleCal || {}), id: cal, ultima: Date.now() } }));
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
     data exata. O identificador do Google evita duplicar ao puxar de novo. */
  const importarRotina = useCallback(async (inicioSemana) => {
    setErro(""); setOcupado(true);
    try {
      const tk = token || (await pedirToken());
      if (!tk) { setOcupado(false); return; }
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
      if (novos.length === 0) { notify("Nenhum compromisso com horário marcado nesta semana."); return; }

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
      window.setTimeout(() => {
        const partes = [];
        if (somados) partes.push(`${somados} novo${somados === 1 ? "" : "s"}`);
        if (atualizados) partes.push(`${atualizados} atualizado${atualizados === 1 ? "" : "s"}`);
        notify(`Compromissos da semana: ${partes.join(" e ")}.`);
      }, 60);
    } catch (e) {
      setErro("Não consegui ler a agenda. Talvez falte autorizar a leitura.");
    } finally { setOcupado(false); }
  }, [token, pedirToken, chamar, today, setData, notify]);

  const desconectar = useCallback(() => {
    try {
      if (token && window.google && window.google.accounts) {
        window.google.accounts.oauth2.revoke(token, () => {});
      }
    } catch (e) { /* noop */ }
    setToken(null);
    notify("Desconectado do Google Agenda.");
  }, [token, notify]);

  return {
    disponivel: !!GOOGLE_CFG, pronto, conectado: !!token, ocupado, progresso, erro,
    sincronizar, importarRotina, desconectar,
    ultima: (data.googleCal && data.googleCal.ultima) || 0,
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
