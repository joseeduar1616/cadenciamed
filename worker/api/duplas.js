/* Amizade direta e duelo de questões · rota /api/duplas
 *
 * Duas coisas que a sala de amigos não resolve:
 *
 * 1. Estudar junto com UMA pessoa, sem combinar nome e senha de sala. Aqui
 *    a pessoa é achada pelo e-mail com que ela criou a conta, e a ligação
 *    só existe depois que ela aceita. Convite que vira amizade sozinho é
 *    convite que qualquer um usa para aparecer na tela dos outros.
 *
 * 2. O duelo: duas pessoas respondendo as mesmas questões ao mesmo tempo,
 *    com um relógio por questão. As questões saem de um material que
 *    alguém mandou, pela IA, e ficam guardadas no próprio duelo — as duas
 *    pessoas têm de ver exatamente as mesmas, na mesma ordem.
 *
 * Quem corrige é o SERVIDOR. A resposta certa nunca é mandada para o
 * navegador antes de a questão fechar: se fosse, bastaria abrir a aba de
 * rede para gabaritar o duelo inteiro.
 */
import {
  json, corpoJson, quemPede, contaDeServico, tokenDeAcesso, BASE_FIRESTORE,
} from "./_comum.js";

const MAX_AMIGOS = 60;
const MAX_QUESTOES = 30;
const MIN_SEG = 30;
const MAX_SEG = 60;

const texto = (v) => (v && v.stringValue) || "";
const numero = (v) => Number((v && (v.doubleValue || v.integerValue)) || 0);
const booleano = (v) => !!(v && v.booleanValue);
const lista = (v) => (((v && v.arrayValue) || {}).values || []);
const mapa = (v) => ((v && v.mapValue) || {}).fields || {};

/* O par sempre na mesma ordem, para a amizade ter um endereço só. Sem
   isto, A→B e B→A virariam dois documentos e cada lado veria um estado
   diferente da mesma amizade. */
const idDaDupla = (a, b) => [a, b].sort().join("_");

async function lerDoc(token, caminho) {
  const r = await fetch(`${BASE_FIRESTORE}/${caminho}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return (j || {}).fields || null;
}

async function gravarDoc(token, caminho, fields) {
  const r = await fetch(`${BASE_FIRESTORE}/${caminho}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  return r.ok;
}

async function apagarDoc(token, caminho) {
  await fetch(`${BASE_FIRESTORE}/${caminho}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

/* Quem é a pessoa deste e-mail. A coleção "emails" é escrita pelo próprio
   dono da conta quando ele entra (ver useNuvem, no parte3.jsx). */
async function uidPeloEmail(token, email) {
  const r = await fetch(`${BASE_FIRESTORE}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "emails" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "email" }, op: "EQUAL",
            value: { stringValue: String(email).toLowerCase().trim() },
          },
        },
        limit: 1,
      },
    }),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const doc = (j || []).find((x) => x.document);
  return doc ? doc.document.name.split("/").pop() : null;
}

async function perfisDe(token, uids) {
  if (!uids.length) return {};
  const base = BASE_FIRESTORE.replace(/^https:\/\/[^/]+\/v\d+\//, "");
  const r = await fetch(`${BASE_FIRESTORE}:batchGet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ documents: uids.slice(0, MAX_AMIGOS).map((u) => `${base}/perfis/${u}`) }),
  });
  if (!r.ok) return {};
  const j = await r.json().catch(() => null);
  const fora = {};
  for (const item of j || []) {
    if (!item || !item.found) continue;
    const f = item.found.fields || {};
    fora[item.found.name.split("/").pop()] = {
      nome: texto(f.nome),
      presencaEm: numero(f.presencaEm),
      presencaMin: numero(f.presencaMin),
    };
  }
  return fora;
}

/* As duplas de quem está perguntando, dos dois lados. */
async function duplasDe(token, uid) {
  const r = await fetch(`${BASE_FIRESTORE}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "duplas" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "gente" }, op: "ARRAY_CONTAINS",
            value: { stringValue: uid },
          },
        },
        limit: MAX_AMIGOS,
      },
    }),
  });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  return (j || []).filter((x) => x.document).map((x) => {
    const f = x.document.fields || {};
    return {
      id: x.document.name.split("/").pop(),
      gente: lista(f.gente).map(texto),
      quemConvidou: texto(f.quemConvidou),
      aceita: booleano(f.aceita),
      em: numero(f.em),
      focoInicio: numero(f.focoInicio),
      focoMin: numero(f.focoMin),
      focoPor: texto(f.focoPor),
    };
  });
}

const camposDaDupla = (d) => ({
  gente: { arrayValue: { values: d.gente.map((x) => ({ stringValue: x })) } },
  quemConvidou: { stringValue: d.quemConvidou },
  aceita: { booleanValue: !!d.aceita },
  em: { doubleValue: d.em || Date.now() },
  focoInicio: { doubleValue: d.focoInicio || 0 },
  focoMin: { doubleValue: d.focoMin || 0 },
  focoPor: { stringValue: d.focoPor || "" },
});

/* O foco combinado, como a tela precisa: quanto falta, em segundos.
   Vencido é o mesmo que não existir — ninguém precisa desligar. */
function focoDaDupla(d) {
  const fim = (d.focoInicio || 0) + (d.focoMin || 0) * 60000;
  const resta = fim - Date.now();
  if (!d.focoInicio || !d.focoMin || resta <= 0) return null;
  return { por: d.focoPor || "", minutos: d.focoMin, inicio: d.focoInicio, restaSeg: Math.ceil(resta / 1000) };
}

/* ── duelo ────────────────────────────────────────────────────────────
 *
 * Um documento por duelo, com as questões dentro. A resposta certa fica
 * guardada aqui e NUNCA sai para o navegador antes de a questão fechar:
 * mandar junto seria entregar o gabarito a quem abrisse a aba de rede.
 *
 * As figuras do material (o ECG, a lâmina, a tomografia) moram em
 * documentos separados, duelos/{id}/figuras/{nome}, e não dentro do duelo.
 * Duas razões: uma prova de imagem estoura o teto de um megabyte por
 * documento do Firestore e derrubaria o duelo inteiro por causa de uma
 * figura; e assim cada tela baixa só a figura da questão que está aberta,
 * em vez de todas de uma vez no 4G de quem está no ônibus.
 *
 * Elas precisam viajar pelo servidor: o material é lido no aparelho de
 * quem enviou, e a outra pessoa não tem aquele arquivo em lugar nenhum.
 */

/* Quantas figuras um duelo carrega, e o tamanho de cada uma já em base64.
   O navegador encolhe antes de mandar; isto aqui é o corte de segurança,
   porque o pedido é só JSON e nada impede alguém de mandar outra coisa. */
const MAX_FIGURAS = 12;
const MAX_FIGURA_BYTES = 700000;

const nomeDeFiguraValido = (s) => /^[A-Za-z0-9._-]{1,80}$/.test(String(s || ""));
function questaoParaTela(q, indice, mostrarGabarito) {
  return {
    n: indice + 1,
    enunciado: q.enunciado,
    alternativas: q.alternativas,
    /* Só o nome. Os bytes descem por duelo-figura, quando a tela pedir. */
    ...(q.imagem ? { imagem: q.imagem } : {}),
    ...(mostrarGabarito ? { certa: q.certa, porque: q.porque } : {}),
  };
}

function lerDuelo(f) {
  if (!f) return null;
  return {
    gente: lista(f.gente).map(texto),
    quemCriou: texto(f.quemCriou),
    tema: texto(f.tema),
    segundos: numero(f.segundos),
    /* Quem já disse "estou pronto". O relógio só começa a andar quando as
       duas estão aqui: antes disso, quem criou ficava respondendo sozinho
       enquanto a outra pessoa nem sabia que havia duelo. */
    prontos: lista(f.prontos).map(texto),
    /* Hora em que o duelo foi montado. Serve de identidade: a dupla tem um
       id só, então o segundo duelo mora no mesmo documento do primeiro, e
       sem isto o aviso "fulano chamou você" só tocaria uma vez na vida. */
    criadoEm: numero(f.criadoEm),
    comecouEm: numero(f.comecouEm),
    /* Quanto tempo o duelo já pulou por todo mundo ter respondido antes de
       a questão fechar. O relógio continua sendo um só, do servidor: este
       número simplesmente o adianta, e as duas telas veem a mesma coisa no
       segundo seguinte. */
    adiantado: numero(f.adiantado),
    questoes: lista(f.questoes).map((v) => {
      const m = mapa(v);
      return {
        enunciado: texto(m.enunciado),
        alternativas: lista(m.alternativas).map(texto),
        certa: numero(m.certa),
        porque: texto(m.porque),
        imagem: texto(m.imagem),
      };
    }),
    /* respostas: "uid:indice" → { escolha, em } */
    respostas: Object.entries(mapa(f.respostas)).reduce((acc, [k, v]) => {
      const m = mapa(v);
      acc[k] = { escolha: numero(m.escolha), em: numero(m.em) };
      return acc;
    }, {}),
  };
}

const camposDoDuelo = (d) => ({
  gente: { arrayValue: { values: d.gente.map((x) => ({ stringValue: x })) } },
  quemCriou: { stringValue: d.quemCriou },
  tema: { stringValue: d.tema },
  segundos: { doubleValue: d.segundos },
  prontos: { arrayValue: { values: (d.prontos || []).map((x) => ({ stringValue: x })) } },
  criadoEm: { doubleValue: d.criadoEm || 0 },
  comecouEm: { doubleValue: d.comecouEm },
  adiantado: { doubleValue: d.adiantado || 0 },
  questoes: {
    arrayValue: {
      values: d.questoes.map((q) => ({
        mapValue: {
          fields: {
            enunciado: { stringValue: q.enunciado },
            alternativas: { arrayValue: { values: q.alternativas.map((a) => ({ stringValue: a })) } },
            certa: { doubleValue: q.certa },
            porque: { stringValue: q.porque || "" },
            imagem: { stringValue: q.imagem || "" },
          },
        },
      })),
    },
  },
  respostas: {
    mapValue: {
      fields: Object.entries(d.respostas).reduce((m, [k, v]) => {
        m[k] = { mapValue: { fields: { escolha: { doubleValue: v.escolha }, em: { doubleValue: v.em } } } };
        return m;
      }, {}),
    },
  },
});

/* Em que questão o duelo está, pelo relógio. É o servidor que decide, e
   não cada navegador: dois relógios diferentes fariam uma pessoa ainda
   respondendo a questão que a outra já viu o gabarito. */
function ondeEstamos(d, agora = Date.now()) {
  if (!d.comecouEm) return { indice: 0, restaSeg: d.segundos, acabou: false };
  const passou = (agora - d.comecouEm + (d.adiantado || 0)) / 1000;
  const indice = Math.floor(passou / d.segundos);
  if (indice >= d.questoes.length) return { indice: d.questoes.length, restaSeg: 0, acabou: true };
  return { indice, restaSeg: Math.ceil(d.segundos - (passou % d.segundos)), acabou: false };
}

/* Quantos milissegundos faltam para a questão aberta fechar sozinha.
   É esse o tanto que o duelo pula quando ninguém mais tem o que responder. */
function faltaDaQuestao(d, agora = Date.now()) {
  const janela = d.segundos * 1000;
  const passou = agora - d.comecouEm + (d.adiantado || 0);
  return janela - (passou % janela);
}

function placarDoDuelo(d, perfis) {
  return d.gente.map((uid) => {
    let acertos = 0;
    let respondidas = 0;
    d.questoes.forEach((q, i) => {
      const r = d.respostas[`${uid}:${i}`];
      if (!r) return;
      respondidas += 1;
      if (r.escolha === q.certa) acertos += 1;
    });
    return { uid, nome: (perfis[uid] && perfis[uid].nome) || "Alguém", acertos, respondidas };
  }).sort((a, b) => b.acertos - a.acertos);
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);
  if (!env.FIREBASE_API_KEY || !env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ erro: "Faltam FIREBASE_API_KEY ou FIREBASE_SERVICE_ACCOUNT nas variáveis do site." }, 500);
  }

  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);
  const pessoa = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pessoa) return json({ erro: "Entre na sua conta para usar esta função." }, 401);

  const conta = contaDeServico(env);
  if (!conta) return json({ erro: "Conta de serviço inválida." }, 500);
  let token;
  try { token = await tokenDeAcesso(conta); }
  catch (e) { return json({ erro: "Não consegui autenticar no banco." }, 500); }

  const acao = String(corpo.acao || "listar");

  /* ── amizades ────────────────────────────────────────────────────── */
  if (acao === "listar") {
    const duplas = await duplasDe(token, pessoa.uid);
    const outros = duplas.map((d) => d.gente.find((u) => u !== pessoa.uid)).filter(Boolean);
    const perfis = await perfisDe(token, outros);
    const agora = Date.now();
    /* O duelo de cada dupla vai junto da lista. Sem isto a outra pessoa
       não tinha como saber que havia um duelo esperando por ela: ele só
       aparecia para quem tinha acabado de criá-lo. */
    const duelos = {};
    for (const d of duplas) {
      const dd = lerDuelo(await lerDoc(token, `duelos/${d.id}`));
      if (!dd) continue;
      const onde = dd.comecouEm ? ondeEstamos(dd) : null;
      duelos[d.id] = {
        /* A tela usa isto para saber se já avisou deste duelo. */
        marca: `${d.id}:${dd.criadoEm || 0}`,
        tema: dd.tema,
        total: dd.questoes.length,
        segundos: dd.segundos,
        esperando: !dd.comecouEm,
        euAceitei: dd.prontos.indexOf(pessoa.uid) >= 0,
        correndo: !!dd.comecouEm && !(onde && onde.acabou),
        acabou: !!(onde && onde.acabou),
      };
    }
    return json({
      ok: true,
      duplas: duplas.map((d) => {
        const outro = d.gente.find((u) => u !== pessoa.uid) || "";
        const p = perfis[outro] || {};
        const vivo = !!p.presencaEm && (agora - p.presencaEm) < 150000;
        return {
          id: d.id,
          uid: outro,
          nome: p.nome || "Alguém",
          aceita: d.aceita,
          euConvidei: d.quemConvidou === pessoa.uid,
          estudando: vivo,
          minutos: vivo ? Math.max(0, Math.round((p.presencaMin || 0) + (agora - p.presencaEm) / 60000)) : 0,
          foco: focoDaDupla(d),
          duelo: duelos[d.id] || null,
        };
      }),
    });
  }

  if (acao === "convidar") {
    const email = String(corpo.email || "").toLowerCase().trim();
    if (!email) return json({ erro: "Escreva o e-mail da pessoa." }, 400);
    if (email === String(pessoa.email || "").toLowerCase()) {
      return json({ erro: "Esse é o seu próprio e-mail." }, 400);
    }
    const outro = await uidPeloEmail(token, email);
    /* Sem dizer se a conta existe: responder "não achei" para um e-mail e
       "convite enviado" para outro transforma esta rota num jeito de
       descobrir quem tem conta no site. */
    if (!outro) {
      return json({ ok: true, mensagem: "Convite enviado. Ele aparece para a pessoa quando ela entrar." });
    }
    const id = idDaDupla(pessoa.uid, outro);
    const ja = await lerDoc(token, `duplas/${id}`);
    if (ja) return json({ ok: true, mensagem: "Vocês já estão ligados, ou o convite já foi enviado." });
    const gravou = await gravarDoc(token, `duplas/${id}`, camposDaDupla({
      gente: [pessoa.uid, outro], quemConvidou: pessoa.uid, aceita: false, em: Date.now(),
    }));
    if (!gravou) return json({ erro: "Não consegui enviar o convite." }, 502);
    return json({ ok: true, mensagem: "Convite enviado." });
  }

  if (acao === "aceitar" || acao === "remover") {
    const id = String(corpo.id || "").slice(0, 80);
    const f = await lerDoc(token, `duplas/${id}`);
    if (!f) return json({ erro: "Esse convite já não existe." }, 404);
    const gente = lista(f.gente).map(texto);
    if (gente.indexOf(pessoa.uid) < 0) return json({ erro: "Isso não é seu." }, 403);

    if (acao === "remover") {
      await apagarDoc(token, `duplas/${id}`);
      return json({ ok: true, mensagem: "Pronto." });
    }
    /* Quem convidou não aceita o próprio convite: senão o convite vira
       amizade sozinho e a outra pessoa nunca escolheu nada. */
    if (texto(f.quemConvidou) === pessoa.uid) {
      return json({ erro: "Quem aceita é a outra pessoa." }, 403);
    }
    const gravou = await gravarDoc(token, `duplas/${id}`, camposDaDupla({
      gente, quemConvidou: texto(f.quemConvidou), aceita: true, em: numero(f.em),
      focoInicio: numero(f.focoInicio), focoMin: numero(f.focoMin), focoPor: texto(f.focoPor),
    }));
    if (!gravou) return json({ erro: "Não consegui aceitar agora." }, 502);
    return json({ ok: true, mensagem: "Agora vocês estudam juntos." });
  }

  if (acao === "focar") {
    const id = String(corpo.id || "").slice(0, 80);
    const minutos = Math.round(Number(corpo.minutos) || 0);
    /* O mesmo teto da sala de amigos: doze horas. Quem quer marcar um
       domingo inteiro de estudo com a dupla consegue, e o limite só existe
       para o número não virar absurdo. */
    if (minutos && (minutos < 5 || minutos > 720)) {
      return json({ erro: "O foco em conjunto vai de 5 minutos a 12 horas." }, 400);
    }
    const f = await lerDoc(token, `duplas/${id}`);
    if (!f) return json({ erro: "Essa dupla não existe." }, 404);
    const gente = lista(f.gente).map(texto);
    if (gente.indexOf(pessoa.uid) < 0) return json({ erro: "Isso não é seu." }, 403);
    if (!booleano(f.aceita)) return json({ erro: "O convite ainda não foi aceito." }, 400);
    const meu = (await perfisDe(token, [pessoa.uid]))[pessoa.uid] || {};
    const d = {
      gente, quemConvidou: texto(f.quemConvidou), aceita: true, em: numero(f.em),
      focoInicio: minutos ? Date.now() : 0,
      focoMin: minutos,
      focoPor: minutos ? String(meu.nome || "").slice(0, 40) : "",
    };
    if (!await gravarDoc(token, `duplas/${id}`, camposDaDupla(d))) {
      return json({ erro: "Não consegui combinar o foco." }, 502);
    }
    return json({ ok: true, foco: focoDaDupla(d) });
  }

  /* ── duelo ───────────────────────────────────────────────────────── */
  if (acao === "duelo-criar") {
    const id = String(corpo.id || "").slice(0, 80);
    const f = await lerDoc(token, `duplas/${id}`);
    if (!f) return json({ erro: "Essa dupla não existe." }, 404);
    const gente = lista(f.gente).map(texto);
    if (gente.indexOf(pessoa.uid) < 0) return json({ erro: "Isso não é seu." }, 403);
    if (!booleano(f.aceita)) return json({ erro: "O convite ainda não foi aceito." }, 400);

    const segundos = Math.round(Number(corpo.segundos) || 0);
    if (segundos < MIN_SEG || segundos > MAX_SEG) {
      return json({ erro: `O tempo por questão vai de ${MIN_SEG} a ${MAX_SEG} segundos.` }, 400);
    }
    const questoes = (Array.isArray(corpo.questoes) ? corpo.questoes : [])
      .filter((q) => q && typeof q.enunciado === "string" && Array.isArray(q.alternativas)
        && q.alternativas.length >= 2)
      .slice(0, MAX_QUESTOES)
      .map((q) => ({
        enunciado: String(q.enunciado).slice(0, 400),
        alternativas: q.alternativas.slice(0, 5).map((a) => String(a).slice(0, 200)),
        certa: Math.max(0, Math.min(q.alternativas.length - 1, Math.round(Number(q.certa) || 0))),
        porque: String(q.porque || "").slice(0, 300),
        imagem: nomeDeFiguraValido(q.imagem) ? String(q.imagem) : "",
      }));
    if (!questoes.length) return json({ erro: "Nenhuma questão para disputar." }, 400);

    /* As figuras: só as que alguma questão realmente cita. Guardar as
       outras seria subir o material inteiro para o banco sem ninguém
       nunca abrir. */
    const citadas = new Set(questoes.map((q) => q.imagem).filter(Boolean));
    const figuras = (Array.isArray(corpo.figuras) ? corpo.figuras : [])
      .filter((f) => f && citadas.has(String(f.nome)) && nomeDeFiguraValido(f.nome))
      .filter((f) => /^data:image\/(png|jpe?g|webp);base64,/.test(String(f.dataUri || "")))
      .filter((f) => String(f.dataUri).length <= MAX_FIGURA_BYTES)
      .slice(0, MAX_FIGURAS);

    /* Questão que cita figura que não chegou vira questão sobre uma imagem
       que ninguém vê. Melhor perder a figura e manter a questão. */
    const chegaram = new Set(figuras.map((f) => String(f.nome)));
    for (const q of questoes) if (q.imagem && !chegaram.has(q.imagem)) q.imagem = "";

    /* O segundo duelo da dupla mora no mesmo documento do primeiro, então
       as figuras do duelo anterior ainda estão penduradas aqui. Sem apagar,
       elas ficariam para sempre, e um nome repetido mostraria a imagem do
       duelo passado. */
    const anterior = lerDuelo(await lerDoc(token, `duelos/${id}`));
    for (const nome of new Set((anterior ? anterior.questoes : []).map((q) => q.imagem).filter(Boolean))) {
      if (!chegaram.has(nome)) await apagarDoc(token, `duelos/${id}/figuras/${nome}`);
    }

    /* comecouEm zero: o duelo existe, mas o relógio não anda. Quem criou
       já entra pronto; falta a outra pessoa aceitar. */
    const d = {
      gente, quemCriou: pessoa.uid, tema: String(corpo.tema || "").slice(0, 60),
      segundos, prontos: [pessoa.uid], criadoEm: Date.now(), comecouEm: 0,
      questoes, respostas: {}, adiantado: 0,
    };
    if (!await gravarDoc(token, `duelos/${id}`, camposDoDuelo(d))) {
      return json({ erro: "Não consegui criar o duelo." }, 502);
    }

    for (const f of figuras) {
      await gravarDoc(token, `duelos/${id}/figuras/${f.nome}`, {
        dataUri: { stringValue: String(f.dataUri) },
        em: { doubleValue: Date.now() },
      });
    }

    return json({ ok: true, mensagem: "Duelo criado. Ele começa quando a outra pessoa aceitar." });
  }

  if (acao === "duelo-aceitar") {
    const id = String(corpo.id || "").slice(0, 80);
    const d = lerDuelo(await lerDoc(token, `duelos/${id}`));
    if (!d) return json({ erro: "Esse duelo já não existe." }, 404);
    if (d.gente.indexOf(pessoa.uid) < 0) return json({ erro: "Isso não é seu." }, 403);
    if (d.prontos.indexOf(pessoa.uid) < 0) d.prontos.push(pessoa.uid);
    /* As duas prontas: o relógio começa AGORA, para as duas ao mesmo
       tempo. É o servidor que marca a hora, e não cada navegador. */
    if (!d.comecouEm && d.prontos.length >= d.gente.length) d.comecouEm = Date.now();
    if (!await gravarDoc(token, `duelos/${id}`, camposDoDuelo(d))) {
      return json({ erro: "Não consegui entrar no duelo." }, 502);
    }
    return json({ ok: true, comecou: !!d.comecouEm });
  }

  if (acao === "duelo-estado" || acao === "duelo-responder") {
    const id = String(corpo.id || "").slice(0, 80);
    const d = lerDuelo(await lerDoc(token, `duelos/${id}`));
    if (!d) return json({ ok: true, duelo: null });
    if (d.gente.indexOf(pessoa.uid) < 0) return json({ erro: "Isso não é seu." }, 403);

    /* Enquanto o relógio não anda não há questão nenhuma para mostrar, e
       muito menos para responder. */
    if (!d.comecouEm) {
      const perfis = await perfisDe(token, d.gente);
      return json({
        ok: true,
        duelo: {
          esperando: true,
          tema: d.tema,
          segundos: d.segundos,
          total: d.questoes.length,
          souDono: d.quemCriou === pessoa.uid,
          euAceitei: d.prontos.indexOf(pessoa.uid) >= 0,
          faltam: d.gente.filter((u) => d.prontos.indexOf(u) < 0)
            .map((u) => (perfis[u] && perfis[u].nome) || "a outra pessoa"),
          acabou: false, indice: 0, restaSeg: 0, questao: null,
          minhas: {}, placar: [], gabarito: null,
        },
      });
    }

    const onde = ondeEstamos(d);

    if (acao === "duelo-responder") {
      const n = Math.round(Number(corpo.n));
      const escolha = Math.round(Number(corpo.escolha));
      /* Só vale responder a questão que está aberta AGORA, e só uma vez.
         O relógio é do servidor: sem isso dava para responder tudo no fim,
         com calma, depois de ver o gabarito de cada uma. */
      if (n !== onde.indice || onde.acabou) {
        return json({ erro: "Essa questão já fechou." }, 409);
      }
      const chave = `${pessoa.uid}:${n}`;
      if (!d.respostas[chave]) {
        d.respostas[chave] = { escolha, em: Date.now() };

        /* Os dois já responderam: não há mais nada acontecendo nesta
           questão, e esperar o relógio acabar é só tempo parado olhando
           para uma tela que não muda. Adiantar o relógio do duelo move as
           duas telas juntas, porque quem manda no tempo continua sendo o
           servidor — cada uma descobre no próximo segundo, pelo mesmo
           caminho de sempre.

           Todo mundo, e não "os dois": a dupla tem duas pessoas hoje, mas
           contar quem falta em vez de fixar o número deixa isso certo se um
           dia o duelo virar trio. */
        const faltamResponder = d.gente.filter((u) => !d.respostas[`${u}:${n}`]);
        if (faltamResponder.length === 0) {
          d.adiantado = (d.adiantado || 0) + faltaDaQuestao(d);
        }

        await gravarDoc(token, `duelos/${id}`, camposDoDuelo(d));
      }
    }

    /* Recontado depois de responder: quem fechou a última resposta da
       questão já recebe a próxima nesta mesma chamada, em vez de esperar o
       próximo segundo para descobrir o que ela mesma acabou de causar. */
    const agora = ondeEstamos(d);

    const perfis = await perfisDe(token, d.gente);
    const minhas = {};
    d.questoes.forEach((q, i) => {
      const r = d.respostas[`${pessoa.uid}:${i}`];
      if (r) minhas[i] = r.escolha;
    });

    return json({
      ok: true,
      duelo: {
        tema: d.tema,
        segundos: d.segundos,
        total: d.questoes.length,
        indice: agora.indice,
        restaSeg: agora.restaSeg,
        acabou: agora.acabou,
        /* O gabarito só desce depois que a questão fecha. Antes disso ele
           não existe para o navegador. */
        questao: agora.acabou ? null : questaoParaTela(d.questoes[agora.indice], agora.indice, false),
        minhas,
        placar: placarDoDuelo(d, perfis),
        /* No fim, o gabarito inteiro, que é quando ele vira estudo. */
        gabarito: agora.acabou
          ? d.questoes.map((q, i) => questaoParaTela(q, i, true))
          : null,
      },
    });
  }

  /* ── a figura de uma questão ────────────────────────────────────────
   *
   * Uma por chamada, e só para quem está no duelo. Desce pelo servidor
   * porque o material foi lido no aparelho de quem enviou: a outra pessoa
   * não tem aquele arquivo em lugar nenhum. */
  if (acao === "duelo-figura") {
    const id = String(corpo.id || "").slice(0, 80);
    const nome = String(corpo.nome || "");
    if (!nomeDeFiguraValido(nome)) return json({ erro: "Figura inválida." }, 400);

    const d = lerDuelo(await lerDoc(token, `duelos/${id}`));
    if (!d) return json({ erro: "Esse duelo já não existe." }, 404);
    if (d.gente.indexOf(pessoa.uid) < 0) return json({ erro: "Isso não é seu." }, 403);
    /* Só figura que alguma questão cita. Sem isto, o nome vindo do pedido
       viraria um jeito de ler qualquer documento pendurado no duelo. */
    if (!d.questoes.some((q) => q.imagem === nome)) {
      return json({ erro: "Essa figura não é deste duelo." }, 404);
    }

    const doc = await lerDoc(token, `duelos/${id}/figuras/${nome}`);
    const dataUri = doc ? texto(doc.dataUri) : "";
    if (!dataUri) return json({ erro: "Essa figura não está mais guardada." }, 404);
    return json({ ok: true, dataUri });
  }

  if (acao === "duelo-apagar") {
    const id = String(corpo.id || "").slice(0, 80);
    const d = lerDuelo(await lerDoc(token, `duelos/${id}`));
    if (d && d.gente.indexOf(pessoa.uid) < 0) return json({ erro: "Isso não é seu." }, 403);
    /* As figuras primeiro: no Firestore a subcoleção sobrevive ao documento
       pai, e ficariam de herança para o próximo duelo da mesma dupla, que
       reusa este id. */
    for (const nome of new Set((d ? d.questoes : []).map((q) => q.imagem).filter(Boolean))) {
      await apagarDoc(token, `duelos/${id}/figuras/${nome}`);
    }
    await apagarDoc(token, `duelos/${id}`);
    return json({ ok: true });
  }

  return json({ erro: "Ação desconhecida." }, 400);
}
