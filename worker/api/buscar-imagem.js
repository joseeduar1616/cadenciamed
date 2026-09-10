/* Traz uma imagem de fora para dentro da anotação · Cloudflare Worker
 *
 * Quem cola um trecho do Notion (ou do Google Docs, ou de uma página) traz
 * junto <img src="https://..."> apontando para o servidor de lá. O navegador
 * desenha aquilo, mas não consegue LER os bytes: é outro domínio, e sem
 * CORS o fetch é barrado. Sem os bytes a imagem não vira base64, não entra
 * no IndexedDB da anotação, e fica dependendo do endereço original.
 *
 * No caso do Notion o endereço é assinado e vence em cerca de uma hora:
 * pouco depois de colar, a figura some e sobra o texto alternativo. Era
 * exatamente o que estava acontecendo.
 *
 * Esta rota é a ponte: o servidor busca a imagem e devolve em base64, para o
 * navegador guardar como se tivesse escolhido o arquivo à mão.
 *
 * Buscar um endereço que o usuário escolheu é coisa para fazer com cuidado.
 * Só http e https, só resposta que é imagem de verdade, com teto de tamanho,
 * e nada de nome que aponte para dentro da rede. E só para quem está na
 * própria conta: a rota não é um proxy aberto para a internet inteira.
 */
import { json, quemPede, corpoJson } from "./_comum.js";

const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/svg+xml"];

/* Nomes que não devem ser buscados. O Worker não alcança rede interna, mas
   a regra fica escrita: é o tipo de coisa que muda de ambiente sem avisar. */
const PROIBIDOS = [
  /^localhost$/i, /^127\./, /^0\./, /^10\./, /^192\.168\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /\.internal$/i, /^\[?::1\]?$/,
];

function enderecoOk(bruto) {
  let u;
  try { u = new URL(String(bruto || "")); } catch (e) { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname;
  if (PROIBIDOS.some((r) => r.test(host))) return null;
  return u;
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);

  if (!env.FIREBASE_API_KEY) {
    return json({ erro: "Falta FIREBASE_API_KEY nas variáveis do site." }, 500);
  }
  if (!corpo.token) return json({ erro: "Entre na sua conta para usar esta função." }, 403);
  const pessoa = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pessoa) return json({ erro: "Sua sessão expirou. Entre de novo." }, 403);

  const alvo = enderecoOk(corpo.url);
  if (!alvo) return json({ erro: "Endereço de imagem inválido." }, 400);

  let r;
  try {
    r = await fetch(alvo.toString(), {
      headers: {
        /* Alguns servidores recusam pedido sem Accept de imagem, e outros
           mandam a versão em HTML quando não sabem quem está pedindo. */
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "CadenciaMed/1.0 (+https://cadenciamed.com.br)",
      },
      redirect: "follow",
    });
  } catch (e) {
    return json({ erro: "Não consegui alcançar o endereço da imagem." }, 502);
  }

  if (!r.ok) {
    /* 403 aqui é quase sempre endereço do Notion que já venceu: a assinatura
       dura cerca de uma hora. Vale dizer isso, senão parece defeito do app. */
    if (r.status === 403 || r.status === 401) {
      return json({ erro: "O endereço da imagem expirou. Copie de novo do lugar de origem." }, 200);
    }
    return json({ erro: `O servidor da imagem respondeu ${r.status}.` }, 200);
  }

  const tipo = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (TIPOS.indexOf(tipo) < 0) {
    return json({ erro: "Esse endereço não devolveu uma imagem." }, 200);
  }

  const declarado = Number(r.headers.get("content-length") || 0);
  if (declarado > MAX_BYTES) return json({ erro: "A imagem é grande demais." }, 200);

  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > MAX_BYTES) return json({ erro: "A imagem é grande demais." }, 200);

  /* base64 em pedaços: String.fromCharCode com milhões de argumentos de uma
     vez estoura a pilha. */
  let bruto = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    bruto += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }

  return json({ dados: `data:${tipo};base64,${btoa(bruto)}` });
}
