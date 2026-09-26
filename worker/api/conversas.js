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
export const MAX_LISTA = 60;

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

const endereco = (uid, id) =>
  `${BASE_FIRESTORE}/conversas/${encodeURIComponent(uid)}/itens/${id}`;
const pastaDe = (uid) => `${BASE_FIRESTORE}/conversas/${encodeURIComponent(uid)}/itens`;

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

  if (acao === "listar") {
    const r = await fetch(`${pastaDe(uid)}?pageSize=${MAX_LISTA}&orderBy=atualizadoEm%20desc`, { headers: auth });
    if (!r.ok) return json({ ok: true, conversas: [] });
    const j = await r.json().catch(() => null);
    const conversas = ((j || {}).documents || []).map((d) => {
      const f = d.fields || {};
      return {
        id: String(d.name || "").split("/").pop(),
        titulo: texto(f.titulo),
        atualizadoEm: numero(f.atualizadoEm),
        mensagens: numero(f.quantas),
      };
    }).sort((a, b) => b.atualizadoEm - a.atualizadoEm);
    return json({ ok: true, conversas });
  }

  if (acao === "abrir") {
    const id = String(corpo.id || "");
    if (!idValido(id)) return json({ erro: "Conversa inválida." }, 400);
    const r = await fetch(endereco(uid, id), { headers: auth });
    if (!r.ok) return json({ erro: "Não achei essa conversa." }, 404);
    const d = await r.json().catch(() => null);
    let mensagens = [];
    try { mensagens = mensagensParaGuardar(JSON.parse(texto(((d || {}).fields || {}).mensagens))); }
    catch (e) { /* conversa ilegível: devolve vazia em vez de quebrar a tela */ }
    return json({ ok: true, id, titulo: texto(((d || {}).fields || {}).titulo), mensagens });
  }

  if (acao === "salvar") {
    const mensagens = mensagensParaGuardar(corpo.mensagens);
    if (!mensagens.length) return json({ erro: "Nada para guardar." }, 400);
    const id = corpo.id === undefined || corpo.id === null || corpo.id === "" ? novoId() : String(corpo.id);
    if (!idValido(id)) return json({ erro: "Conversa inválida." }, 400);
    const r = await fetch(endereco(uid, id), {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          titulo: { stringValue: tituloDaConversa(mensagens) },
          mensagens: { stringValue: JSON.stringify(mensagens) },
          quantas: { integerValue: String(mensagens.length) },
          atualizadoEm: { doubleValue: Date.now() },
        },
      }),
    });
    if (!r.ok) return json({ erro: "Não consegui guardar a conversa." }, 502);
    return json({ ok: true, id, titulo: tituloDaConversa(mensagens) });
  }

  if (acao === "apagar") {
    const id = String(corpo.id || "");
    if (!idValido(id)) return json({ erro: "Conversa inválida." }, 400);
    await fetch(endereco(uid, id), { method: "DELETE", headers: auth }).catch(() => null);
    return json({ ok: true });
  }

  return json({ erro: "Ação desconhecida." }, 400);
}
