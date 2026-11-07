/* O histórico do assistente · rota /api/conversas
 *
 * Antes, a conversa com o assistente morava só na memória da tela: trocar
 * de aba, recarregar ou abrir no celular apagava tudo. Quem montou um
 * plano de semana conversando perdia o plano ao fechar o navegador.
 *
 * Por que aqui, no servidor, e não junto dos dados de estudo:
 *
 *   · os dados de estudo moram num documento só no Firestore, e o
 *     Firestore recusa documento acima de 1 MiB. Uma dúzia de conversas
 *     longas passaria disso sozinha, e aí quem pararia de sincronizar
 *     seria o cronograma, não as conversas;
 *   · gravar direto do navegador numa coleção à parte dependeria de uma
 *     regra do Firestore a mais. Até ela ser publicada, a função falharia
 *     calada. Pela conta de serviço, funciona desde já.
 *
 * Cada conversa é um documento em conversas/{uid}/itens/{id}. O uid vem do
 * TOKEN conferido, nunca do corpo do pedido: se viesse do corpo, bastaria
 * trocar um campo para ler a conversa de outra pessoa.
 */
import {
  json, corpoJson, quemPede, contaDeServico, tokenDeAcesso, BASE_FIRESTORE,
} from "./_comum.js";

/* Tetos. Duzentas mensagens de 12 mil caracteres dariam 2,4 MB, mais que o
   1 MiB que o Firestore aceita num documento — por isso o corte é também
   no total de caracteres da conversa, e não só na contagem. */
export const MAX_MENSAGENS = 200;
export const MAX_TEXTO = 12000;
export const MAX_TOTAL = 600000;
export const MAX_LISTA = 200;
export const MAX_PASTAS = 30;
export const MODOS = ["conversa", "mentoria"];

/* O id é gerado aqui ou vem de uma conversa que já existe, e entra no
   endereço do documento. Só letras minúsculas e números: um ".." ou uma
   barra no id levariam a gravação para fora da pasta desta pessoa. */
export const idValido = (id) => /^[a-z0-9]{8,32}$/.test(String(id || ""));

const novoId = () => {
  const b = crypto.getRandomValues(new Uint8Array(10));
  return [...b].map((x) => x.toString(36).padStart(2, "0")).join("").slice(0, 16);
};

/* As mensagens do jeito que podem ser guardadas. Papel desconhecido vira
   nada (e não "user"): uma mensagem com papel inventado reentraria no
   próximo pedido à IA como se fosse da pessoa. Quando passa do total,
   caem as MAIS ANTIGAS — é o fim da conversa que importa para continuar. */
export function mensagensParaGuardar(lista) {
  const limpas = [];
  for (const m of (Array.isArray(lista) ? lista : [])) {
    if (!m || typeof m !== "object") continue;
    const papel = m.papel === "user" ? "user" : m.papel === "claude" ? "claude" : "";
    if (!papel) continue;
    const texto = String(m.texto || "").slice(0, MAX_TEXTO);
    if (!texto.trim()) continue;
    const item = { papel, texto };
    if (m.cortado) item.cortado = true;
    limpas.push(item);
  }
  let fora = limpas.slice(-MAX_MENSAGENS);
  let total = fora.reduce((n, m) => n + m.texto.length, 0);
  while (total > MAX_TOTAL && fora.length > 1) {
    total -= fora[0].texto.length;
    fora = fora.slice(1);
  }
  return fora;
}

/* O título é a primeira pergunta, encurtada. Nada de pedir um título à IA:
   seria uma chamada paga a cada conversa só para dar nome a ela. */
export function tituloDaConversa(mensagens) {
  const primeira = (mensagens || []).find((m) => m && m.papel === "user" && String(m.texto || "").trim());
  if (!primeira) return "Conversa sem título";
  const t = String(primeira.texto).replace(/\s+/g, " ").trim();
  return t.length > 70 ? t.slice(0, 67).trimEnd() + "…" : t;
}

/* Nome de pasta: texto curto, sem quebra de linha. Vazio é "sem pasta". */
export const nomeDePasta = (v) => String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
export const modoValido = (v) => (MODOS.indexOf(String(v)) >= 0 ? String(v) : "conversa");

/* As pastas moram no documento da pessoa (conversas/{uid}), numa lista. */
export function pastasLimpas(lista) {
  const vistas = new Set();
  const saida = [];
  for (const x of (Array.isArray(lista) ? lista : [])) {
    const n = nomeDePasta(x);
    if (!n || vistas.has(n.toLowerCase())) continue;
    vistas.add(n.toLowerCase());
    saida.push(n);
    if (saida.length >= MAX_PASTAS) break;
  }
  return saida;
}

const endereco = (uid, id) =>
  `${BASE_FIRESTORE}/conversas/${encodeURIComponent(uid)}/itens/${id}`;
const pastaDe = (uid) => `${BASE_FIRESTORE}/conversas/${encodeURIComponent(uid)}/itens`;
const raizDe = (uid) => `${BASE_FIRESTORE}/conversas/${encodeURIComponent(uid)}`;
const mascara = (...campos) => campos.map((c) => `updateMask.fieldPaths=${c}`).join("&");

const texto = (v) => (v && v.stringValue) || "";
const numero = (v) => Number((v && (v.doubleValue || v.integerValue)) || 0);

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);
  if (!env.FIREBASE_API_KEY || !env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ erro: "Faltam FIREBASE_API_KEY ou FIREBASE_SERVICE_ACCOUNT nas variáveis do site." }, 500);
  }
  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);
  if (!corpo.token) return json({ erro: "Entre na sua conta para ver suas conversas." }, 403);
  const pessoa = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pessoa) return json({ erro: "Sua sessão expirou. Entre de novo." }, 403);

  const conta = contaDeServico(env);
  if (!conta) return json({ erro: "Conta de serviço inválida." }, 500);
  let servico;
  try { servico = await tokenDeAcesso(conta); }
  catch (e) { return json({ erro: "Não consegui autenticar no banco." }, 500); }
  const auth = { Authorization: `Bearer ${servico}` };

  const uid = pessoa.uid;
  const acao = String(corpo.acao || "").trim();

  const lerPastas = async () => {
    const r = await fetch(raizDe(uid), { headers: auth });
    if (!r.ok) return [];
    const d = await r.json().catch(() => null);
    try { return pastasLimpas(JSON.parse(texto(((d || {}).fields || {}).pastas) || "[]")); } catch (e) { return []; }
  };
  const gravarPastas = (lista) => fetch(`${raizDe(uid)}?${mascara("pastas")}`, {
    method: "PATCH",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { pastas: { stringValue: JSON.stringify(pastasLimpas(lista)) } } }),
  });
  const listarTodas = async () => {
    const r = await fetch(`${pastaDe(uid)}?pageSize=${MAX_LISTA}&orderBy=atualizadoEm%20desc&mask.fieldPaths=titulo&mask.fieldPaths=tituloAuto&mask.fieldPaths=atualizadoEm&mask.fieldPaths=quantas&mask.fieldPaths=pasta&mask.fieldPaths=modo`, { headers: auth });
    if (!r.ok) return [];
    const j = await r.json().catch(() => null);
    return ((j || {}).documents || []).map((d) => {
      const f = d.fields || {};
      return {
        id: String(d.name || "").split("/").pop(),
        titulo: texto(f.titulo) || texto(f.tituloAuto) || "Conversa",
        atualizadoEm: numero(f.atualizadoEm),
        mensagens: numero(f.quantas),
        pasta: nomeDePasta(texto(f.pasta)),
        modo: modoValido(texto(f.modo)),
      };
    }).sort((a, b) => b.atualizadoEm - a.atualizadoEm);
  };
  const mexer = (id, campos) => fetch(`${endereco(uid, id)}?${mascara(...Object.keys(campos))}&currentDocument.exists=true`, {
    method: "PATCH",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: campos }),
  });

  if (acao === "listar") {
    const [todas, pastas] = await Promise.all([listarTodas(), lerPastas()]);
    const modo = corpo.modo ? modoValido(corpo.modo) : "";
    const conversas = modo ? todas.filter((c) => c.modo === modo) : todas;
    /* pasta que só existe numa conversa (de antes da lista) também aparece */
    const todasAsPastas = pastasLimpas([...pastas, ...todas.map((c) => c.pasta).filter(Boolean)]);
    return json({ ok: true, conversas, pastas: todasAsPastas });
  }

  if (acao === "abrir") {
    const id = String(corpo.id || "");
    if (!idValido(id)) return json({ erro: "Conversa inválida." }, 400);
    const r = await fetch(endereco(uid, id), { headers: auth });
    if (!r.ok) return json({ erro: "Não achei essa conversa." }, 404);
    const d = await r.json().catch(() => null);
    const f = ((d || {}).fields || {});
    let mensagens = [];
    try { mensagens = mensagensParaGuardar(JSON.parse(texto(f.mensagens))); }
    catch (e) { /* conversa ilegível: devolve vazia em vez de quebrar a tela */ }
    return json({ ok: true, id, titulo: texto(f.titulo) || texto(f.tituloAuto), mensagens, pasta: nomeDePasta(texto(f.pasta)), modo: modoValido(texto(f.modo)) });
  }

  if (acao === "salvar") {
    const mensagens = mensagensParaGuardar(corpo.mensagens);
    if (!mensagens.length) return json({ erro: "Nada para guardar." }, 400);
    const nova = corpo.id === undefined || corpo.id === null || corpo.id === "";
    const id = nova ? novoId() : String(corpo.id);
    if (!idValido(id)) return json({ erro: "Conversa inválida." }, 400);
    /* Só os campos do conteúdo: o nome que a pessoa deu e a pasta em que
       ela pôs a conversa não são apagados a cada mensagem nova. */
    const campos = {
      tituloAuto: { stringValue: tituloDaConversa(mensagens) },
      mensagens: { stringValue: JSON.stringify(mensagens) },
      quantas: { integerValue: String(mensagens.length) },
      atualizadoEm: { doubleValue: Date.now() },
      modo: { stringValue: modoValido(corpo.modo) },
      ...(nova && nomeDePasta(corpo.pasta) ? { pasta: { stringValue: nomeDePasta(corpo.pasta) } } : {}),
    };
    const r = await fetch(`${endereco(uid, id)}?${mascara(...Object.keys(campos))}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: campos }),
    });
    if (!r.ok) return json({ erro: "Não consegui guardar a conversa." }, 502);
    return json({ ok: true, id, titulo: tituloDaConversa(mensagens) });
  }

  if (acao === "renomear") {
    const id = String(corpo.id || "");
    const titulo = String(corpo.titulo || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!idValido(id) || !titulo) return json({ erro: "Nome inválido." }, 400);
    const r = await mexer(id, { titulo: { stringValue: titulo } });
    if (!r.ok) return json({ erro: "Não achei essa conversa." }, 404);
    return json({ ok: true, id, titulo });
  }

  if (acao === "mover") {
    const id = String(corpo.id || "");
    const pasta = nomeDePasta(corpo.pasta);
    if (!idValido(id)) return json({ erro: "Conversa inválida." }, 400);
    if (pasta) {
      const pastas = await lerPastas();
      if (!pastas.some((x) => x.toLowerCase() === pasta.toLowerCase())) {
        if (pastas.length >= MAX_PASTAS) return json({ erro: `Dá para ter até ${MAX_PASTAS} pastas.` }, 400);
        await gravarPastas([...pastas, pasta]);
      }
    }
    const r = await mexer(id, { pasta: { stringValue: pasta } });
    if (!r.ok) return json({ erro: "Não achei essa conversa." }, 404);
    return json({ ok: true, id, pasta });
  }

  if (acao === "criarPasta") {
    const nome = nomeDePasta(corpo.nome);
    if (!nome) return json({ erro: "Dê um nome para a pasta." }, 400);
    const pastas = await lerPastas();
    if (pastas.some((x) => x.toLowerCase() === nome.toLowerCase())) return json({ ok: true, pastas });
    if (pastas.length >= MAX_PASTAS) return json({ erro: `Dá para ter até ${MAX_PASTAS} pastas.` }, 400);
    const novas = [...pastas, nome];
    const r = await gravarPastas(novas);
    if (!r.ok) return json({ erro: "Não consegui criar a pasta." }, 502);
    return json({ ok: true, pastas: pastasLimpas(novas) });
  }

  if (acao === "renomearPasta" || acao === "apagarPasta") {
    const de = nomeDePasta(corpo.de || corpo.nome);
    const para = acao === "renomearPasta" ? nomeDePasta(corpo.para) : "";
    if (!de || (acao === "renomearPasta" && !para)) return json({ erro: "Nome de pasta inválido." }, 400);
    const pastas = await lerPastas();
    const novas = acao === "renomearPasta"
      ? pastasLimpas(pastas.map((x) => (x.toLowerCase() === de.toLowerCase() ? para : x)))
      : pastas.filter((x) => x.toLowerCase() !== de.toLowerCase());
    await gravarPastas(novas);
    /* as conversas da pasta vão junto (renomear) ou ficam sem pasta (apagar):
       apagar uma pasta nunca apaga conversa */
    const daPasta = (await listarTodas()).filter((c) => c.pasta.toLowerCase() === de.toLowerCase());
    await Promise.all(daPasta.map((c) => mexer(c.id, { pasta: { stringValue: para } })));
    return json({ ok: true, pastas: novas, movidas: daPasta.length });
  }

  if (acao === "apagar") {
    const id = String(corpo.id || "");
    if (!idValido(id)) return json({ erro: "Conversa inválida." }, 400);
    await fetch(endereco(uid, id), { method: "DELETE", headers: auth }).catch(() => null);
    return json({ ok: true });
  }

  return json({ erro: "Ação desconhecida." }, 400);
}
