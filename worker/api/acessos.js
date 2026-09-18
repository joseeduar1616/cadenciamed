/* Painel de acessos do administrador · Cloudflare Pages Functions
 *
 * Só o e-mail cadastrado em DONOS consegue usar. A identidade vem do token
 * do Firebase, conferido direto com o Google, então não adianta forjar o
 * e-mail no navegador. A gravação usa a conta de serviço, que é a única
 * coisa capaz de escrever na coleção de assinaturas.
 */
import {
  json, corpoJson, quemPede, ehDono, contaDeServico, tokenDeAcesso,
  gravarAssinatura, validadeDoPlano, concederMentor, BASE_FIRESTORE, DIAS,
  RECURSOS, REGRAS, regrasGravadas, camposDasRegras,
} from "./_comum.js";

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
  const j = await r.json();
  const doc = (j || []).find((x) => x.document);
  return doc ? doc.document.name.split("/").pop() : null;
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  if (!env.FIREBASE_API_KEY || !env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ erro: "Faltam FIREBASE_API_KEY ou FIREBASE_SERVICE_ACCOUNT nas variáveis do site." }, 500);
  }

  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);

  const pedinte = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pedinte) return json({ erro: "Sessão inválida. Entre de novo." }, 401);
  if (!ehDono(pedinte.email)) {
    return json({ erro: "Só a conta do dono pode liberar acessos." }, 403);
  }

  const conta = contaDeServico(env);
  if (!conta) return json({ erro: "Conta de serviço inválida." }, 500);

  let token;
  try { token = await tokenDeAcesso(conta); }
  catch (e) { return json({ erro: "Não consegui autenticar no banco." }, 500); }

  const acao = String(corpo.acao || "listar");

  /* ── cupons ────────────────────────────────────────────────────────
   *
   * Antes os cupons viviam numa variável de ambiente do Worker: criar um
   * era editar a variável e publicar de novo. Agora moram no banco, em
   * cupons/{codigo}, e dão para criar da própria tela.
   *
   * A variável CUPONS continua valendo como reserva, para os cupons
   * antigos não morrerem de um dia para o outro — quem confere é o
   * /api/cupom, que olha o banco primeiro.
   *
   * O código é guardado em minúsculas porque é assim que ele é conferido
   * no resgate: "MEDEASY" e "medeasy" têm de ser o mesmo cupom, senão a
   * pessoa digita certo e ouve que não existe.
   */
  if (acao === "cupons") {
    const r = await fetch(`${BASE_FIRESTORE}/cupons?pageSize=200`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return json({ ok: true, cupons: [] });
    const j = await r.json().catch(() => null);
    const cupons = ((j || {}).documents || []).map((d) => {
      const f = d.fields || {};
      return {
        codigo: d.name.split("/").pop(),
        plano: (f.plano || {}).stringValue || "",
        usos: Number((f.usos || {}).doubleValue || (f.usos || {}).integerValue || 0),
        maxUsos: Number((f.maxUsos || {}).doubleValue || (f.maxUsos || {}).integerValue || 0),
        criadoEm: Number((f.criadoEm || {}).doubleValue || 0),
      };
    }).sort((a, b) => b.criadoEm - a.criadoEm);
    return json({ ok: true, cupons });
  }

  if (acao === "cupom-criar") {
    const codigo = String(corpo.codigo || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
    const plano = String(corpo.plano || "").toLowerCase();
    if (codigo.length < 4) return json({ erro: "O código precisa ter pelo menos 4 letras ou números." }, 400);
    if (!DIAS[plano]) return json({ erro: "Plano desconhecido. Use semanal, mensal, anual ou vitalicio." }, 400);
    /* 0 = sem limite. É o padrão do cupom de divulgação, que é o caso
       comum; o limite existe para o cupom de parceria, que tem cota. */
    const maxUsos = Math.max(0, Math.min(100000, Math.round(Number(corpo.maxUsos) || 0)));

    const ja = await fetch(`${BASE_FIRESTORE}/cupons/${codigo}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (ja.ok) return json({ erro: "Já existe um cupom com esse código." }, 409);

    const r = await fetch(`${BASE_FIRESTORE}/cupons/${codigo}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          plano: { stringValue: plano },
          usos: { doubleValue: 0 },
          maxUsos: { doubleValue: maxUsos },
          criadoEm: { doubleValue: Date.now() },
        },
      }),
    });
    if (!r.ok) return json({ erro: "Não consegui criar o cupom." }, 502);
    return json({ ok: true, codigo, plano, maxUsos });
  }

  if (acao === "cupom-apagar") {
    const codigo = String(corpo.codigo || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
    const r = await fetch(`${BASE_FIRESTORE}/cupons/${codigo}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return json({ erro: "Não consegui apagar o cupom." }, 502);
    return json({ ok: true });
  }

  /* ── saúde do site ─────────────────────────────────────────────────
   *
   * Diz quais variáveis do Worker estão preenchidas — NUNCA o conteúdo
   * delas. Só o "tem ou não tem" já responde a maior parte das perguntas
   * de "por que essa função parou": a ligação permanente do Google, a
   * chave da IA e a conta de serviço quebram exatamente assim, e do lado
   * de fora isso aparece como um erro genérico de conexão.
   *
   * Devolver o valor seria transformar esta tela no lugar mais fácil de
   * roubar as chaves do site inteiro. */
  /* ── quem vê o quê ────────────────────────────────────────────────
   *
   * A regra de cada aba, gravada em config/recursos. Ela vale no
   * SERVIDOR: /api/plano lê daqui para dizer à tela o que desenhar, e
   * quem tentar abrir uma aba fechada não recebe os dados dela.
   *
   * As liberações avulsas ficam na assinatura da pessoa, em
   * assinaturas/{uid}.recursos, porque são dela e não do site.
   */
  if (acao === "recursos") {
    const r = await fetch(`${BASE_FIRESTORE}/config/recursos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const doc = r.ok ? await r.json().catch(() => null) : null;
    const gravadas = regrasGravadas(doc);
    return json({
      ok: true,
      regras: REGRAS,
      recursos: RECURSOS.map((x) => ({
        id: x.id, nome: x.nome, padrao: x.padrao,
        regra: gravadas[x.id] || x.padrao,
        mudado: !!gravadas[x.id] && gravadas[x.id] !== x.padrao,
      })),
    });
  }

  if (acao === "recursos-definir") {
    const id = String(corpo.id || "");
    const regra = String(corpo.regra || "");
    if (!RECURSOS.some((x) => x.id === id)) return json({ erro: "Essa aba não existe." }, 400);
    if (REGRAS.indexOf(regra) < 0) return json({ erro: "Regra desconhecida." }, 400);

    /* Grava o conjunto INTEIRO de volta. Um PATCH sem updateMask troca o
       documento todo, então mandar só o campo mudado apagaria os outros —
       e o site inteiro voltaria ao padrão de uma vez. */
    const atual = await fetch(`${BASE_FIRESTORE}/config/recursos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const gravadas = regrasGravadas(atual.ok ? await atual.json().catch(() => null) : null);
    gravadas[id] = regra;

    const w = await fetch(`${BASE_FIRESTORE}/config/recursos`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: camposDasRegras(gravadas) }),
    });
    if (!w.ok) return json({ erro: "Não consegui gravar a regra." }, 502);
    const nome = (RECURSOS.find((x) => x.id === id) || {}).nome || id;
    const comoLer = { todos: "todo mundo", pro: "quem assina", dono: "só você" };
    return json({ ok: true, mensagem: `${nome}: agora ${comoLer[regra]} vê.` });
  }

  /* ── o que está cadastrado no servidor ─────────────────────────────
   *
   * Só a PRESENÇA de cada variável, nunca o valor: um painel que mostra
   * chave é um painel que vaza chave na primeira captura de tela.
   *
   * O terceiro campo diz se a variável é obrigatória. Sem ele, duas
   * variáveis que estão vazias de propósito (a chave da Anthropic, que
   * não é usada porque o site roda no Gemini; e CUPONS, que virou tabela
   * no banco) apareciam em vermelho, do mesmo jeito que uma chave que
   * falta de verdade. Vermelho que é normal ensina a ignorar vermelho, e
   * aí o dia em que faltar algo mesmo ninguém vai reparar.
   */
  if (acao === "saude") {
    const tem = (v) => !!(v && String(v).trim());
    return json({
      ok: true,
      variaveis: [
        ["FIREBASE_API_KEY", tem(env.FIREBASE_API_KEY), true],
        ["FIREBASE_SERVICE_ACCOUNT", tem(env.FIREBASE_SERVICE_ACCOUNT), true],
        ["GEMINI_API_KEY", tem(env.GEMINI_API_KEY), true],
        /* reserva: só é usada se a do Gemini faltar */
        ["ANTHROPIC_API_KEY", tem(env.ANTHROPIC_API_KEY), false],
        ["GOOGLE_CLIENT_ID", tem(env.GOOGLE_CLIENT_ID), true],
        ["GOOGLE_CLIENT_SECRET", tem(env.GOOGLE_CLIENT_SECRET), true],
        ["NOTION_CLIENT_ID", tem(env.NOTION_CLIENT_ID), true],
        ["NOTION_CLIENT_SECRET", tem(env.NOTION_CLIENT_SECRET), true],
        /* os cupons moram no banco desde que o painel passou a criá-los */
        ["CUPONS", tem(env.CUPONS), false],
        ["GEMINI_MODELO", tem(env.GEMINI_MODELO), false],
      ],
    });
  }

  /* ── lista quem tem acesso ─────────────────────────────────────────── */
  if (acao === "listar") {
    const r = await fetch(`${BASE_FIRESTORE}/assinaturas?pageSize=300`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return json({ erro: "Não consegui ler a lista." }, 500);
    const j = await r.json();
    const lista = (j.documents || []).map((d) => {
      const f = d.fields || {};
      return {
        uid: d.name.split("/").pop(),
        email: (f.email && f.email.stringValue) || "",
        plano: (f.plano && f.plano.stringValue) || "",
        validoAte: Number((f.validoAte && f.validoAte.doubleValue) || 0),
        cortesia: !!(f.cortesia && f.cortesia.booleanValue),
      };
    }).sort((a, b) => b.validoAte - a.validoAte);
    return json({ lista });
  }

  const email = String(corpo.email || "").toLowerCase().trim();
  if (!email) return json({ erro: "Informe o e-mail." }, 400);

  const uid = await uidPeloEmail(token, email);
  if (!uid) {
    return json({
      erro: "Não achei conta com esse e-mail. A pessoa precisa criar a conta no site antes.",
    }, 404);
  }

  /* ── tira o acesso ─────────────────────────────────────────────────── */
  if (acao === "revogar") {
    const r = await fetch(`${BASE_FIRESTORE}/assinaturas/${uid}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return json({ erro: "Não consegui remover." }, 500);
    return json({ ok: true, mensagem: `Acesso de ${email} removido.` });
  }

  /* ── concede o papel de mentor ────────────────────────────────────────
     Separado do plano: não mexe em assinaturas/{uid}, só em mentores/{uid}
     — o mesmo caminho que o cupom "mentor1612" usa (concederMentor, em
     _comum.js), preservando a lista de alunos se a pessoa já for mentora. */
  if (acao === "conceder-mentor") {
    const deu = await concederMentor(token, uid, email);
    if (!deu) return json({ erro: "Não consegui conceder o papel de mentor." }, 500);
    return json({ ok: true, mensagem: `${email} agora é mentor(a).` });
  }

  /* ── libera ────────────────────────────────────────────────────────── */
  const plano = DIAS[corpo.plano] ? corpo.plano : "mensal";
  const ate = validadeDoPlano(plano);
  const gravou = await gravarAssinatura(token, uid, {
    plano: { stringValue: plano },
    email: { stringValue: email },
    validoAte: { doubleValue: ate },
    cortesia: { booleanValue: true },
    liberadoPor: { stringValue: pedinte.email },
    atualizadoEm: { doubleValue: Date.now() },
  });
  if (!gravou) return json({ erro: "Não consegui gravar." }, 500);

  return json({
    ok: true,
    mensagem: plano === "vitalicio"
      ? `${email} liberado sem prazo.`
      : `${email} liberado até ${new Date(ate).toLocaleDateString("pt-BR")}.`,
  });
}
