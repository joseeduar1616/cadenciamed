/* Conta do Google ligada de vez · rota /api/google
 *
 * O problema que esta rota resolve: o login do Google feito só no navegador
 * (google.accounts.oauth2.initTokenClient) entrega um token que vale cerca
 * de uma hora e não vem com token de atualização. Fechou o aplicativo,
 * acabou. A tentativa silenciosa de renovar (prompt vazio) depende de
 * cookie de terceiros, que o navegador do celular e o modo aplicativo
 * costumam barrar — e aí a pessoa tem que autorizar de novo toda vez que
 * abre, que era exatamente a reclamação.
 *
 * A saída é a mesma do Notion: o navegador faz o fluxo de CÓDIGO, manda o
 * código para cá, e o servidor troca por um token de atualização usando o
 * segredo da credencial. O token de atualização fica guardado em
 * google/{uid} e não volta para a página nunca. Dali em diante o navegador
 * pede "me dá um token de acesso" e recebe um novinho, sem janela nenhuma,
 * pelo tempo que a autorização durar.
 *
 * Para funcionar precisa de duas variáveis no Worker:
 *   GOOGLE_CLIENT_ID      o mesmo ID que a página já usa
 *   GOOGLE_CLIENT_SECRET  o segredo da MESMA credencial, no Google Cloud
 * Sem elas a rota responde que não está configurada, e a página continua no
 * caminho antigo, de autorizar a cada sessão.
 */
import {
  json, corpoJson, quemPede, contaDeServico, tokenDeAcesso, BASE_FIRESTORE,
} from "./_comum.js";

const OAUTH = "https://oauth2.googleapis.com/token";
const REVOGAR = "https://oauth2.googleapis.com/revoke";

/* No fluxo de código em janela (ux_mode "popup"), o Google exige exatamente
   esta palavra no lugar do endereço de retorno. Não é um endereço: é a
   marca de que o código veio pela janela e não por um redirecionamento. */
const RETORNO_JANELA = "postmessage";

const texto = (v) => (v && v.stringValue) || "";

async function lerConexao(token, uid) {
  const r = await fetch(`${BASE_FIRESTORE}/google/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const f = (j || {}).fields || {};
  const atualizacao = texto(f.atualizacao);
  if (!atualizacao) return null;
  return { atualizacao, email: texto(f.email) };
}

async function gravarConexao(token, uid, dados) {
  const r = await fetch(`${BASE_FIRESTORE}/google/${uid}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        atualizacao: { stringValue: dados.atualizacao },
        email: { stringValue: dados.email || "" },
        em: { doubleValue: Date.now() },
      },
    }),
  });
  return r.ok;
}

async function apagarConexao(token, uid) {
  await fetch(`${BASE_FIRESTORE}/google/${uid}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

/* Traduz a recusa do Google para uma frase que diga o que fazer.
 *
 * O código do erro vem em "error" e a explicação em "error_description", e
 * as duas precisam ser lidas em separado: a descrição de um invalid_grant é
 * "Token has been expired or revoked", sem o código dentro. */
function explicar(status, j) {
  const codigo = String((j && j.error) || "");
  const erro = String((j && (j.error_description || j.error)) || "");
  if (/invalid_grant/i.test(codigo) || /invalid_grant/i.test(erro)) {
    return "A autorização do Google não vale mais. Ligue a conta de novo.";
  }
  if (/invalid_client|unauthorized_client/i.test(codigo) || /invalid_client|unauthorized_client/i.test(erro)) {
    return "O Google recusou a credencial do site. Confira GOOGLE_CLIENT_ID e "
      + "GOOGLE_CLIENT_SECRET nas variáveis do Worker: as duas precisam ser da mesma credencial.";
  }
  if (/redirect_uri_mismatch/i.test(erro)) {
    return "O Google recusou o endereço de retorno. A credencial precisa ser do tipo "
      + "Aplicativo da Web, com o endereço do site em Origens JavaScript autorizadas.";
  }
  return erro ? `O Google recusou: ${erro}` : `O Google respondeu com erro ${status}.`;
}

async function trocar(env, campos) {
  const corpo = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    ...campos,
  });
  const r = await fetch(OAUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corpo.toString(),
  });
  const j = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, j };
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);

  if (!env.FIREBASE_API_KEY) {
    return json({ erro: "Falta FIREBASE_API_KEY nas variáveis do site." }, 500);
  }
  if (!corpo.token) return json({ erro: "Entre na sua conta para ligar o Google." }, 403);
  const pessoa = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pessoa) return json({ erro: "Sua sessão expirou. Entre de novo." }, 403);

  const acao = String(corpo.acao || "").trim();

  /* Sem o segredo cadastrado não dá para guardar autorização nenhuma. A
     página pergunta isso antes de oferecer o botão, e continua funcionando
     do jeito antigo: autoriza a cada sessão. */
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    if (acao === "estado") return json({ ligado: false, disponivel: false });
    return json({
      erro: "A ligação permanente com o Google não está configurada neste site. "
        + "Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nas variáveis do Worker.",
      disponivel: false,
    }, 200);
  }

  const conta = contaDeServico(env);
  if (!conta) return json({ erro: "Falta a conta de serviço nas variáveis do site." }, 500);
  let servico;
  try { servico = await tokenDeAcesso(conta); }
  catch (e) { return json({ erro: "Não consegui falar com o banco de dados." }, 502); }

  const conexao = await lerConexao(servico, pessoa.uid);

  /* ── a página pergunta se já está ligado ───────────────────────────── */
  if (acao === "estado") {
    return json({ ligado: !!conexao, disponivel: true, email: conexao ? conexao.email : "" });
  }

  /* ── troca do código pelo token de atualização ─────────────────────── */
  if (acao === "ligar") {
    const codigo = String(corpo.codigo || "").trim();
    if (!codigo) return json({ erro: "Faltou o código do Google." }, 400);

    const { ok, status, j } = await trocar(env, {
      grant_type: "authorization_code",
      code: codigo,
      redirect_uri: corpo.retorno ? String(corpo.retorno) : RETORNO_JANELA,
    });
    if (!ok || !j) return json({ erro: explicar(status, j) }, 400);

    /* O Google só manda o token de atualização na primeira autorização de
       cada conta. Quem já tinha autorizado antes recebe só o de acesso, e
       aí a página precisa pedir a autorização de novo forçando a tela de
       consentimento — senão ficaria achando que ligou e não ligou. */
    if (!j.refresh_token) {
      return json({
        erro: "O Google não devolveu a autorização permanente, o que acontece quando "
          + "esta conta já tinha autorizado o site antes. Entre em "
          + "myaccount.google.com/permissions, remova o acesso do Cadência Med e "
          + "ligue de novo aqui: aí ele manda a autorização completa.",
        semAtualizacao: true,
      }, 200);
    }

    if (!await gravarConexao(servico, pessoa.uid, {
      atualizacao: j.refresh_token, email: String(pessoa.email || ""),
    })) {
      return json({ erro: "Não consegui guardar a ligação com o Google." }, 500);
    }
    return json({
      ok: true, ligado: true,
      acesso: j.access_token || "",
      expiraEm: Date.now() + Math.max(0, Number(j.expires_in || 0) - 60) * 1000,
    });
  }

  /* ── desligar ──────────────────────────────────────────────────────── */
  if (acao === "desligar") {
    if (conexao) {
      /* Revogar avisa o Google; apagar aqui é o que importa. A ordem é essa
         para que uma revogação que falhe não deixe o token guardado. */
      await fetch(REVOGAR, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: conexao.atualizacao }).toString(),
      }).catch(() => {});
      await apagarConexao(servico, pessoa.uid);
    }
    return json({ ok: true, ligado: false, mensagem: "O Google foi desligado da sua conta." });
  }

  /* ── um token de acesso novo, sem janela nenhuma ───────────────────── */
  if (acao === "token") {
    if (!conexao) return json({ erro: "Ligue sua conta do Google antes.", ligado: false }, 200);
    const { ok, status, j } = await trocar(env, {
      grant_type: "refresh_token", refresh_token: conexao.atualizacao,
    });
    if (!ok || !j || !j.access_token) {
      /* Autorização revogada pela pessoa, ou senha trocada: o token guardado
         virou lixo e ficar tentando com ele só gera erro a cada abertura. */
      if (j && /invalid_grant/i.test(String(j.error || ""))) {
        await apagarConexao(servico, pessoa.uid);
        return json({ erro: explicar(status, j), ligado: false }, 200);
      }
      return json({ erro: explicar(status, j) }, 200);
    }
    return json({
      acesso: j.access_token,
      expiraEm: Date.now() + Math.max(0, Number(j.expires_in || 0) - 60) * 1000,
      ligado: true,
    });
  }

  return json({ erro: "Ação desconhecida." }, 400);
}
