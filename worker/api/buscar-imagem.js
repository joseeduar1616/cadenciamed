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
import {
  json, quemPede, corpoJson, contaDeServico, tokenDeAcesso, BASE_FIRESTORE,
} from "./_comum.js";

const NOTION = "https://api.notion.com/v1";
const VERSAO_NOTION = "2022-06-28";

const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/svg+xml"];

/* O mesmo tipo escrito de outro jeito. Não é frescura: "image/jpg" não
   existe no padrão e mesmo assim é o que muitos servidores mandam. */
const APELIDOS = {
  "image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png", "image/heic": "image/avif", "image/heif": "image/avif",
  "image/svg": "image/svg+xml",
};

/* O que o arquivo É, lido dos primeiros bytes.
 *
 * Isto existe porque o S3 do Notion (e vários outros depósitos) devolve a
 * figura como "application/octet-stream": bytes sem nome. A regra antiga
 * olhava só o cabeçalho e recusava tudo isso com "esse endereço não
 * devolveu uma imagem" — ou seja, colar uma página do Notion nunca trazia
 * figura nenhuma, enquanto colar a imagem sozinha funcionava. O que o
 * cabeçalho diz é um palpite do servidor; os bytes são o fato. */
function tipoPelosBytes(b) {
  const eh = (...bytes) => bytes.every((v, i) => b[i] === v);
  if (eh(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) return "image/png";
  if (eh(0xFF, 0xD8, 0xFF)) return "image/jpeg";
  if (eh(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (eh(0x42, 0x4D)) return "image/bmp";
  /* RIFF....WEBP */
  if (eh(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  /* caixa ftyp: avif, heic e heif começam iguais e mudam a marca */
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const marca = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
    if (marca.startsWith("avi")) return "image/avif";
    if (marca.startsWith("hei") || marca.startsWith("mif") || marca.startsWith("msf")) return "image/avif";
  }
  /* SVG é texto: procura a abertura nas primeiras centenas de bytes */
  const inicio = String.fromCharCode.apply(null, b.subarray(0, Math.min(b.length, 300))).toLowerCase();
  if (inicio.includes("<svg")) return "image/svg+xml";
  return "";
}

/* O Notion embrulha a figura num endereço próprio,
   notion.so/image/<endereço-de-verdade-codificado>, que só abre com a
   sessão de quem copiou. O endereço de dentro é o do depósito, assinado e
   aberto para quem tiver o link — é esse que a ponte consegue buscar. */
function desembrulhar(u) {
  if (!/(^|\.)notion\.so$/i.test(u.hostname)) return u;
  const m = u.pathname.match(/^\/image\/(.+)$/);
  if (!m) return u;
  try {
    const dentro = new URL(decodeURIComponent(m[1]));
    if (dentro.protocol === "https:" || dentro.protocol === "http:") return dentro;
  } catch (e) { /* não era endereço embrulhado, segue com o de fora */ }
  return u;
}

/* Nomes que não devem ser buscados. O Worker não alcança rede interna, mas
   a regra fica escrita: é o tipo de coisa que muda de ambiente sem avisar. */
const PROIBIDOS = [
  /^localhost$/i, /^127\./, /^0\./, /^10\./, /^192\.168\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /\.internal$/i, /^\[?::1\]?$/,
];

/* ── figura que mora dentro do Notion ─────────────────────────────────
 *
 * O endereço colado é notion.so/image/<endereço do depósito>?table=block&id=…
 * e ele NÃO abre para ninguém de fora: depende do cookie de sessão de quem
 * copiou. Nem o servidor alcança, nem o próprio navegador — num <img> de
 * outro site o cookie do Notion não vai junto, e é por isso que no lugar da
 * figura não aparecia nem a imagem quebrada, só o vazio.
 *
 * Desembrulhar também não resolve: o endereço de dentro vem SEM assinatura,
 * e o depósito responde 403 para pedido sem assinatura. Era esse 403 que
 * chegava na tela como "o endereço da imagem expirou" — a mensagem estava
 * errada, o endereço nunca chegou a valer.
 *
 * O caminho que funciona é pedir ao próprio Notion, com o token de quem
 * conectou a conta (o mesmo do cronograma, guardado em notion/{uid}): a API
 * devolve um endereço novo, assinado, que vale cerca de uma hora e que
 * qualquer um com o link consegue buscar.
 */
function blocoDoNotion(u) {
  if (!/(^|\.)notion\.so$/i.test(u.hostname)) return "";
  if (!/^\/image\//.test(u.pathname)) return "";
  if ((u.searchParams.get("table") || "block") !== "block") return "";
  const id = u.searchParams.get("id") || "";
  return /^[0-9a-f-]{32,36}$/i.test(id) ? id : "";
}

/* O id de bloco que o navegador achou no HTML colado.
 *
 * Nem sempre o endereço colado é o embrulho do notion.so: no Notion de hoje
 * o <img> costuma vir apontando DIRETO para o depósito na Amazon, e sem
 * assinatura — foi o que o aviso na tela acabou revelando, dizendo "de
 * s3-us-west-2.amazonaws.com". Aí não há id nenhum no endereço, e o id vem
 * de fora: o <figure> que embrulha a figura no HTML colado carrega o id do
 * bloco, e o navegador manda junto. */
function idDeBloco(bruto) {
  const id = String(bruto || "").trim();
  return /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id) ? id : "";
}

async function tokenDoNotion(env, uid) {
  const conta = contaDeServico(env);
  if (!conta) return "";
  let servico;
  try { servico = await tokenDeAcesso(conta); } catch (e) { return ""; }
  const r = await fetch(`${BASE_FIRESTORE}/notion/${uid}`, {
    headers: { Authorization: `Bearer ${servico}` },
  });
  if (!r.ok) return "";
  const j = await r.json().catch(() => null);
  const campo = ((j || {}).fields || {}).acesso;
  return (campo && campo.stringValue) || "";
}

/* O endereço novo daquela figura, ou o motivo de não ter dado. */
async function figuraDoNotion(acesso, bloco) {
  let r;
  try {
    r = await fetch(`${NOTION}/blocks/${bloco}`, {
      headers: { Authorization: `Bearer ${acesso}`, "Notion-Version": VERSAO_NOTION },
    });
  } catch (e) {
    return { erro: "não consegui falar com o Notion para buscar a figura." };
  }
  if (r.status === 404) {
    return {
      erro: "essa página do Notion não está compartilhada com a integração do Cadência. "
        + "No Notion, abra a página, clique nos três pontinhos, "
        + "Conexões, e adicione o Cadência Med.",
    };
  }
  if (!r.ok) return { erro: `o Notion respondeu ${r.status} ao buscar a figura.` };
  const j = await r.json().catch(() => null);
  const bloco_ = (j || {})[(j || {}).type] || {};
  const url = (bloco_.file && bloco_.file.url) || (bloco_.external && bloco_.external.url) || "";
  if (!url) return { erro: "esse bloco do Notion não é uma figura." };
  return { url };
}

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

  const pedido = enderecoOk(corpo.url);
  if (!pedido) return json({ erro: "Endereço de imagem inválido." }, 400);

  const buscar = (u) => fetch(u.toString(), {
    headers: {
      /* Alguns servidores recusam pedido sem Accept de imagem, e outros
         mandam a versão em HTML quando não sabem quem está pedindo. E há
         os que recusam de cara quem não parece navegador: com o
         User-Agent do próprio app, a resposta vinha 403. */
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        + " (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      /* CDN com proteção contra link de fora costuma exigir que o pedido
         venha do próprio site da imagem. */
      Referer: `${u.origin}/`,
    },
    redirect: "follow",
  });

  /* O id do bloco vem do endereço (embrulho do notion.so) ou do HTML colado
     (o <figure> que embrulha a figura). O segundo é o caso comum hoje. */
  const bloco = blocoDoNotion(pedido) || idDeBloco(corpo.bloco);
  /* O embrulho do notion.so nunca abre de fora, e o endereço de dentro vem
     sem assinatura: com id de bloco na mão, não vale gastar um pedido que
     já se sabe que vai voltar 403. */
  const soPeloNotion = !!blocoDoNotion(pedido);

  let alvo = enderecoOk(desembrulhar(pedido).toString());
  if (!alvo) return json({ erro: "Endereço de imagem inválido." }, 400);

  let r = null;
  let recusou = "";
  if (!soPeloNotion) {
    try {
      r = await buscar(alvo);
    } catch (e) {
      return json({ erro: "Não consegui alcançar o endereço da imagem." }, 502);
    }
    if (!r.ok) {
      recusou = (r.status === 403 || r.status === 401)
        /* 403 tem duas causas que a pessoa não tem como distinguir, e
           chamar as duas de "o endereço expirou" mandava procurar no lugar
           errado: ou a assinatura do endereço venceu, ou a figura
           simplesmente não abre para quem não está logado no site. */
        ? "o site da imagem recusou: ou o endereço venceu, ou a figura só abre para quem está logado lá."
        : `O servidor da imagem respondeu ${r.status}.`;
    }
  }

  /* Recusado (ou nem tentado): com id de bloco, o Notion devolve um
     endereço novo e assinado daquela mesma figura. */
  if ((soPeloNotion || recusou) && bloco) {
    const acesso = await tokenDoNotion(env, pessoa.uid);
    if (!acesso) {
      return json({
        erro: "essa figura mora dentro do Notion, e só abre para quem está logado lá. "
          + "Conecte o Notion na aba Cronograma e tente de novo, ou copie a imagem "
          + "sozinha (botão direito nela, copiar imagem).",
      }, 200);
    }
    const novo = await figuraDoNotion(acesso, bloco);
    if (novo.erro) return json({ erro: novo.erro }, 200);
    const outro = enderecoOk(novo.url);
    if (!outro) return json({ erro: "o Notion devolveu um endereço que não dá para buscar." }, 200);
    alvo = outro;
    try {
      r = await buscar(alvo);
    } catch (e) {
      return json({ erro: "Não consegui alcançar o endereço que o Notion devolveu." }, 502);
    }
    if (!r.ok) return json({ erro: `o endereço que o Notion devolveu respondeu ${r.status}.` }, 200);
    recusou = "";
  }

  if (recusou) return json({ erro: recusou }, 200);
  if (!r) return json({ erro: "Não consegui buscar essa figura." }, 200);

  const cabecalho = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const dito = APELIDOS[cabecalho] || cabecalho;
  /* Página de erro em HTML não vale a pena baixar inteira. Qualquer outra
     coisa segue: o tipo de verdade sai dos bytes, logo abaixo. */
  if (dito === "text/html") return json({ erro: "Esse endereço devolveu uma página, não uma imagem." }, 200);

  const declarado = Number(r.headers.get("content-length") || 0);
  if (declarado > MAX_BYTES) return json({ erro: "A imagem é grande demais." }, 200);

  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > MAX_BYTES) return json({ erro: "A imagem é grande demais." }, 200);

  /* O cabeçalho vale quando diz um tipo de imagem conhecido; senão, quem
     decide são os bytes. */
  const tipo = TIPOS.indexOf(dito) >= 0 ? dito : tipoPelosBytes(bytes);
  if (!tipo) return json({ erro: "Esse endereço não devolveu uma imagem." }, 200);

  /* base64 em pedaços: String.fromCharCode com milhões de argumentos de uma
     vez estoura a pilha. */
  let bruto = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    bruto += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }

  return json({ dados: `data:${tipo};base64,${btoa(bruto)}` });
}
