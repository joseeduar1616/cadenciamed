/* Entrada do Worker · Cadência Med
 *
 * O site é estático, então quase tudo é servido direto dos arquivos, sem
 * passar por aqui. Só os endereços /api/... chegam neste script, porque é o
 * que está declarado em run_worker_first no wrangler.jsonc.
 *
 * Cada rota é um arquivo em worker/api/. Acrescentar um endereço é escrever
 * o arquivo e citá-lo na tabela abaixo.
 */
import { onRequest as assistente } from "./api/assistente.js";
import { onRequest as cupom } from "./api/cupom.js";
import { onRequest as acessos } from "./api/acessos.js";
import { onRequest as compra } from "./api/compra.js";
import { onRequest as salas } from "./api/salas.js";
import { onRequest as baralhos } from "./api/baralhos.js";
import { onRequest as notion } from "./api/notion.js";
import { onRequest as plano } from "./api/plano.js";

const ROTAS = {
  "/api/assistente": assistente,
  "/api/cupom": cupom,
  "/api/acessos": acessos,
  "/api/compra": compra,
  "/api/salas": salas,
  "/api/baralhos": baralhos,
  "/api/notion": notion,
  "/api/plano": plano,
};

/* ── quem pode chamar de outro endereço ────────────────────────────────
 *
 * Enquanto as páginas vêm do Firebase Hosting e as rotas /api vêm do
 * Worker, toda chamada é entre domínios diferentes, e o navegador só deixa
 * passar com estes cabeçalhos.
 *
 * A lista é fechada de propósito: com "*" qualquer site conseguiria montar
 * uma página que chama estas rotas com o token de quem estivesse logado.
 * Para acrescentar endereço sem mexer no código, cadastre ORIGENS nas
 * variáveis do Worker, separando por vírgula.
 */
const ORIGENS_PADRAO = [
  "https://cadenciamed.com.br",
  "https://www.cadenciamed.com.br",
  "https://cadencia-7c1f1.web.app",
  "https://cadencia-7c1f1.firebaseapp.com",
  "https://cadenciamed.joseeduardo1616.workers.dev",
];

function origemLiberada(origem, env) {
  if (!origem) return false;
  const lista = String(env.ORIGENS || "").trim()
    ? String(env.ORIGENS).split(",").map((x) => x.trim()).filter(Boolean)
    : ORIGENS_PADRAO;
  return lista.indexOf(origem) >= 0;
}

function cabecalhosCors(origem) {
  return {
    "Access-Control-Allow-Origin": origem,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    /* Sem isto um proxy pode guardar a resposta liberada para uma origem e
       entregá-la a outra, ou o contrário: a mesma URL responde diferente
       conforme quem pergunta. */
    Vary: "Origin",
  };
}

/* Copia a resposta acrescentando os cabeçalhos: a que veio da rota pode ser
   imutável, então mexer nela direto quebraria. */
function comCors(resposta, origem) {
  if (!origem) return resposta;
  const h = new Headers(resposta.headers);
  for (const [k, v] of Object.entries(cabecalhosCors(origem))) h.set(k, v);
  return new Response(resposta.body, {
    status: resposta.status, statusText: resposta.statusText, headers: h,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const rota = ROTAS[url.pathname.replace(/\/+$/, "")];

    if (rota) {
      const pedida = request.headers.get("Origin");
      const origem = origemLiberada(pedida, env) ? pedida : "";

      /* Antes do POST de verdade o navegador pergunta se pode. Responder
         aqui evita que a pergunta chegue à rota, que exigiria token. */
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: origem ? 204 : 403,
          headers: origem ? cabecalhosCors(origem) : { Vary: "Origin" },
        });
      }

      try {
        return comCors(await rota({ request, env, ctx }), origem);
      } catch (e) {
        /* Uma exceção solta viraria a página de erro do Cloudflare, em
           inglês e sem explicação. Melhor devolver JSON, que é o que o
           painel sabe mostrar. */
        console.error("erro em", url.pathname, e && e.stack);
        return comCors(Response.json(
          { erro: "Algo quebrou no servidor. Tente de novo em instantes." },
          { status: 500 }), origem);
      }
    }

    /* Qualquer outra coisa é arquivo do site. */
    return env.ASSETS.fetch(request);
  },
};
