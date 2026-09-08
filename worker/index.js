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

const ROTAS = {
  "/api/assistente": assistente,
  "/api/cupom": cupom,
  "/api/acessos": acessos,
  "/api/compra": compra,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const rota = ROTAS[url.pathname.replace(/\/+$/, "")];
    if (rota) {
      try {
        return await rota({ request, env, ctx });
      } catch (e) {
        /* Uma exceção solta viraria a página de erro do Cloudflare, em
           inglês e sem explicação. Melhor devolver JSON, que é o que o
           painel sabe mostrar. */
        console.error("erro em", url.pathname, e && e.stack);
        return Response.json(
          { erro: "Algo quebrou no servidor. Tente de novo em instantes." },
          { status: 500 });
      }
    }
    /* Qualquer outra coisa é arquivo do site. */
    return env.ASSETS.fetch(request);
  },
};
