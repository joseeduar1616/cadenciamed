/* Notificação com o site fechado · rota /api/push e a batida de hora em hora
 *
 * O lembrete que já existia era um setTimeout na aba aberta: fechar o
 * navegador cancelava. Quem precisava do aviso por não ter aberto o site
 * nunca recebia — o único caso em que o lembrete importa era o único em que
 * ele não funcionava.
 *
 * Como funciona agora, de ponta a ponta:
 *
 *   1. O navegador pede a chave pública do site (ação "chave") e registra
 *      um endereço de entrega no servidor do fabricante dele.
 *   2. Manda esse endereço para cá (ação "assinar"), junto da hora que a
 *      pessoa escolheu e do fuso do aparelho.
 *   3. A cada abertura do site, o próprio aplicativo atualiza a frase do dia
 *      (ação "resumo") — "3 revisões atrasadas", "bloco de cardio às 19h".
 *   4. O Worker acorda de hora em hora, procura quem está na hora escolhida
 *      e ainda não recebeu hoje, cifra a frase para cada aparelho e entrega.
 *
 * Por que a frase vem do navegador e não é calculada aqui: o que a pessoa
 * tem para estudar mora no aparelho dela, e trazer tudo para o servidor
 * seria subir o histórico de estudo inteiro de todo mundo para poder contar
 * revisões. O servidor guarda uma frase e uma hora, e nada mais.
 *
 * A criptografia e a decisão de enviar moram em _push.js, testadas pelo
 * testar-push.mjs.
 */
import {
  json, corpoJson, quemPede, ehDono, contaDeServico, tokenDeAcesso, BASE_FIRESTORE,
} from "./_comum.js";
import {
  gerarChavesVapid, publicaDaPrivada, autorizacaoVapid, cifrarParaAparelho,
  deveEnviar, horaLocal, horaUtcDe, idDoAparelho, endpointValido,
} from "./_push.js";

/* Quem assina as entregas, para o servidor de push ter a quem reclamar se
   este site passar a mandar notificação indevida. É exigência da norma. */
const CONTATO = "mailto:suporte@cadenciamed.com.br";

/* Tetos de uma batida. O Worker tem limite de sub-pedidos por invocação, e
   uma rodada que estoura o limite falha no meio.
   O teto é por HORA, não pelo site inteiro: a consulta abaixo já filtra por
   quem escolheu esta hora, então cabem 300 pessoas em cada um dos 24
   horários. Passar disso é um problema bom de ter, e o jeito de resolver
   está escrito: dividir a batida em minutos diferentes por faixa. */
const MAX_APARELHOS_POR_RODADA = 300;
const POR_LOTE = 20;

const MAX_RESUMO = 160;
const MAX_TITULO = 60;

const texto = (v) => (v && v.stringValue) || "";
const numero = (v) => Number((v && (v.doubleValue || v.integerValue)) || 0);

const enderecoAparelho = (uid, id) =>
  `${BASE_FIRESTORE}/push/${encodeURIComponent(uid)}/aparelhos/${id}`;
const enderecoDaPessoa = (uid) =>
  `${BASE_FIRESTORE}/push/${encodeURIComponent(uid)}/aparelhos`;

async function lerDoc(token, url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

async function gravarDoc(token, url, fields, apenas) {
  const q = apenas ? "?" + apenas.map((c) => `updateMask.fieldPaths=${c}`).join("&") : "";
  const r = await fetch(url + q, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  return r.ok;
}

const apagarDoc = (token, url) =>
  fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => null);

/* ── a chave do site ──────────────────────────────────────────────────
 *
 * Gerada pelo próprio Worker na primeira vez e guardada no banco. É de
 * propósito: uma chave privada que ninguém precisa copiar de um lado para
 * o outro é uma chave que não acaba numa conversa, numa captura de tela
 * nem no repositório.
 */
async function chavesDoSite(token) {
  const url = `${BASE_FIRESTORE}/config/push`;
  const doc = await lerDoc(token, url);
  const guardada = texto(((doc || {}).fields || {}).privada);
  if (guardada) {
    try {
      const privada = JSON.parse(guardada);
      return { privada, publica: await publicaDaPrivada(privada) };
    } catch (e) { /* ilegível: gera de novo, abaixo */ }
  }
  const novas = await gerarChavesVapid();
  await gravarDoc(token, url, {
    privada: { stringValue: JSON.stringify(novas.privada) },
    criadaEm: { doubleValue: Date.now() },
  });
  return novas;
}

/* ── uma entrega ──────────────────────────────────────────────────────── */
async function entregar(privada, aparelho, aviso) {
  if (!endpointValido(aparelho.endpoint)) return { ok: false, morto: true };
  let corpo;
  try {
    corpo = await cifrarParaAparelho(JSON.stringify(aviso), aparelho.p256dh, aparelho.auth);
  } catch (e) {
    /* Chave estragada no banco. O registro não serve mais para nada. */
    return { ok: false, morto: true };
  }

  let r;
  try {
    r = await fetch(aparelho.endpoint, {
      method: "POST",
      headers: {
        Authorization: await autorizacaoVapid(aparelho.endpoint, privada, CONTATO),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        /* Quatro horas guardado se o aparelho estiver desligado. Mais que
           isso entrega o lembrete de hoje no meio da tarde, quando ele já
           não serve. */
        TTL: "14400",
        Urgency: "normal",
      },
      body: corpo,
    });
  } catch (e) {
    return { ok: false, morto: false };
  }

  /* 404 e 410 são o servidor de push dizendo que esse aparelho não existe
     mais — desinstalou, limpou os dados, revogou a permissão. Guardar o
     registro faria a rodada tentar para sempre. */
  if (r.status === 404 || r.status === 410) return { ok: false, morto: true };
  return { ok: r.ok, morto: false, status: r.status };
}

const lerAparelho = (nome, f) => ({
  nome,
  endpoint: texto(f.endpoint),
  p256dh: texto(f.p256dh),
  auth: texto(f.auth),
  resumo: texto(f.resumo),
  titulo: texto(f.titulo),
  hora: numero(f.hora),
  fuso: numero(f.fuso),
  enviadoEm: texto(f.enviadoEm),
});

async function aparelhosDaPessoa(token, uid) {
  const r = await fetch(`${enderecoDaPessoa(uid)}?pageSize=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  return ((j || {}).documents || []).map((d) => lerAparelho(d.name, d.fields || {}));
}

/* ── a batida de hora em hora ─────────────────────────────────────────
 *
 * Uma consulta de grupo de coleção: todos os "aparelhos" de todas as
 * pessoas de uma vez. Sem isso seria uma leitura por assinante a cada hora,
 * vinte e quatro vezes por dia.
 */
export async function enviarRodada(env, agora = Date.now()) {
  const conta = contaDeServico(env);
  if (!conta) return { erro: "sem conta de serviço" };
  const token = await tokenDeAcesso(conta);
  const { privada } = await chavesDoSite(token);

  const r = await fetch(`${BASE_FIRESTORE}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "aparelhos", allDescendants: true }],
        /* Só quem escolheu ESTA hora. É o que torna a batida barata e, mais
           importante, o que faz o teto abaixo ser um teto por hora em vez
           de um teto sobre o site inteiro — com o teto global, quem ficasse
           além dele nunca receberia e nada indicaria isso. */
        where: {
          fieldFilter: {
            field: { fieldPath: "horaUtc" },
            op: "EQUAL",
            value: { integerValue: String(new Date(agora).getUTCHours()) },
          },
        },
        limit: MAX_APARELHOS_POR_RODADA,
      },
    }),
  });
  if (!r.ok) return { erro: "não consegui listar os aparelhos" };
  const linhas = await r.json().catch(() => []);

  const fila = [];
  for (const linha of (Array.isArray(linhas) ? linhas : [])) {
    const d = linha && linha.document;
    if (!d) continue;
    const ap = lerAparelho(d.name, d.fields || {});
    if (deveEnviar(ap, agora)) fila.push(ap);
  }

  let enviados = 0, mortos = 0, falhas = 0;
  for (let i = 0; i < fila.length; i += POR_LOTE) {
    const lote = fila.slice(i, i + POR_LOTE);
    const saidas = await Promise.allSettled(lote.map(async (ap) => {
      const res = await entregar(privada, ap, {
        titulo: ap.titulo || "Cadência Med",
        corpo: ap.resumo,
      });
      const url = `https://firestore.googleapis.com/v1/${ap.nome}`;
      if (res.morto) { await apagarDoc(token, url); return "morto"; }
      if (!res.ok) return "falha";
      /* A marca de "já foi hoje" é gravada DEPOIS da entrega dar certo.
         Marcando antes, uma falha de rede silenciava o lembrete do dia. */
      await gravarDoc(token, url, {
        enviadoEm: { stringValue: horaLocal(agora, ap.fuso).dia },
      }, ["enviadoEm"]);
      return "ok";
    }));
    for (const s of saidas) {
      const v = s.status === "fulfilled" ? s.value : "falha";
      if (v === "ok") enviados += 1;
      else if (v === "morto") mortos += 1;
      else falhas += 1;
    }
  }
  return { ok: true, candidatos: fila.length, enviados, mortos, falhas };
}

/* ── a rota ───────────────────────────────────────────────────────────── */
export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);
  if (!env.FIREBASE_API_KEY || !env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ erro: "Faltam FIREBASE_API_KEY ou FIREBASE_SERVICE_ACCOUNT nas variáveis do site." }, 500);
  }

  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);
  if (!corpo.token) return json({ erro: "Entre na sua conta." }, 403);
  const pessoa = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pessoa) return json({ erro: "Sua sessão expirou. Entre de novo." }, 403);

  const conta = contaDeServico(env);
  if (!conta) return json({ erro: "Conta de serviço inválida." }, 500);
  let servico;
  try { servico = await tokenDeAcesso(conta); }
  catch (e) { return json({ erro: "Não consegui autenticar no banco." }, 500); }

  const acao = String(corpo.acao || "").trim();
  const uid = pessoa.uid;

  /* A chave pública do site. Pública de verdade: ela viaja na página para o
     navegador reconhecer de quem é o push. */
  if (acao === "chave") {
    const { publica } = await chavesDoSite(servico);
    return json({ ok: true, chave: publica });
  }

  if (acao === "assinar") {
    const endpoint = String(corpo.endpoint || "").trim();
    if (!endpointValido(endpoint)) {
      return json({ erro: "Esse endereço de notificação não é de um serviço conhecido." }, 400);
    }
    const p256dh = String(corpo.p256dh || "").trim();
    const auth = String(corpo.auth || "").trim();
    if (!p256dh || !auth) return json({ erro: "Faltou a chave do aparelho." }, 400);

    const hora = Math.max(0, Math.min(23, Math.round(Number(corpo.hora) || 7)));
    /* O fuso vem do navegador em minutos, do jeito que getTimezoneOffset
       devolve. O intervalo real vai de -14h a +12h. */
    const fusoCru = Math.round(Number(corpo.fuso) || 0);
    const fuso = Math.max(-840, Math.min(720, fusoCru));

    const id = await idDoAparelho(endpoint);
    const gravou = await gravarDoc(servico, enderecoAparelho(uid, id), {
      endpoint: { stringValue: endpoint },
      p256dh: { stringValue: p256dh.slice(0, 200) },
      auth: { stringValue: auth.slice(0, 80) },
      hora: { integerValue: String(hora) },
      fuso: { integerValue: String(fuso) },
      /* Por onde a batida de hora em hora acha este registro. Ver
         horaUtcDe: sem ele a batida leria todo mundo 24 vezes por dia. */
      horaUtc: { integerValue: String(horaUtcDe(hora, fuso)) },
      resumo: { stringValue: String(corpo.resumo || "").trim().slice(0, MAX_RESUMO) },
      titulo: { stringValue: String(corpo.titulo || "").trim().slice(0, MAX_TITULO) },
      email: { stringValue: String(pessoa.email || "") },
      assinadoEm: { doubleValue: Date.now() },
    });
    if (!gravou) return json({ erro: "Não consegui guardar a assinatura." }, 502);
    return json({ ok: true, id });
  }

  /* A frase do dia, que o aplicativo atualiza a cada abertura. Só ela, a
     hora e o fuso: o resto do registro fica como está. */
  if (acao === "resumo") {
    const aparelhos = await aparelhosDaPessoa(servico, uid);
    if (!aparelhos.length) return json({ ok: true, aparelhos: 0 });

    const resumo = String(corpo.resumo || "").trim().slice(0, MAX_RESUMO);
    const titulo = String(corpo.titulo || "").trim().slice(0, MAX_TITULO);
    const campos = {
      resumo: { stringValue: resumo },
      titulo: { stringValue: titulo },
    };
    const apenas = ["resumo", "titulo"];
    if (corpo.hora !== undefined) {
      campos.hora = { integerValue: String(Math.max(0, Math.min(23, Math.round(Number(corpo.hora) || 7)))) };
      apenas.push("hora");
    }
    if (corpo.fuso !== undefined) {
      campos.fuso = { integerValue: String(Math.max(-840, Math.min(720, Math.round(Number(corpo.fuso) || 0)))) };
      apenas.push("fuso");
    }
    /* A hora de busca anda junto: mudar o horário ou viajar de fuso sem
       atualizá-la deixaria o aviso saindo na hora antiga para sempre. */
    if (campos.hora || campos.fuso) {
      const h = campos.hora ? Number(campos.hora.integerValue) : aparelhos[0].hora;
      const f = campos.fuso ? Number(campos.fuso.integerValue) : aparelhos[0].fuso;
      campos.horaUtc = { integerValue: String(horaUtcDe(h, f)) };
      apenas.push("horaUtc");
    }
    for (const ap of aparelhos) {
      await gravarDoc(servico, `https://firestore.googleapis.com/v1/${ap.nome}`, campos, apenas);
    }
    return json({ ok: true, aparelhos: aparelhos.length });
  }

  if (acao === "estado") {
    const aparelhos = await aparelhosDaPessoa(servico, uid);
    return json({
      ok: true,
      aparelhos: aparelhos.length,
      hora: aparelhos.length ? aparelhos[0].hora : null,
      resumo: aparelhos.length ? aparelhos[0].resumo : "",
    });
  }

  if (acao === "desassinar") {
    const endpoint = String(corpo.endpoint || "").trim();
    if (endpoint) {
      await apagarDoc(servico, enderecoAparelho(uid, await idDoAparelho(endpoint)));
      return json({ ok: true });
    }
    for (const ap of await aparelhosDaPessoa(servico, uid)) {
      await apagarDoc(servico, `https://firestore.googleapis.com/v1/${ap.nome}`);
    }
    return json({ ok: true });
  }

  /* Mandar agora, para a própria pessoa. É o único jeito de conferir que a
     notificação chega NESTE aparelho: a criptografia não dá erro quando
     está errada, ela só não aparece. */
  if (acao === "testar") {
    const aparelhos = await aparelhosDaPessoa(servico, uid);
    if (!aparelhos.length) return json({ erro: "Este aparelho ainda não está assinado." }, 400);
    const { privada } = await chavesDoSite(servico);
    let enviados = 0;
    for (const ap of aparelhos) {
      const res = await entregar(privada, ap, {
        titulo: "Cadência Med",
        corpo: "Se você está lendo isto com o site fechado, os lembretes estão funcionando.",
      });
      if (res.morto) await apagarDoc(servico, `https://firestore.googleapis.com/v1/${ap.nome}`);
      if (res.ok) enviados += 1;
    }
    if (!enviados) return json({ erro: "Não consegui entregar em nenhum aparelho." }, 502);
    return json({ ok: true, enviados });
  }

  /* Rodar a batida à mão, para conferir sem esperar a hora. Só o dono: ela
     percorre os aparelhos de todo mundo. */
  if (acao === "rodada") {
    if (!ehDono(pessoa.email)) return json({ erro: "Só o dono roda a batida à mão." }, 403);
    return json(await enviarRodada(env, Number(corpo.agora) || Date.now()));
  }

  return json({ erro: "Ação desconhecida." }, 400);
}
