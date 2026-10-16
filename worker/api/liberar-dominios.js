/* Os endereços do site liberados para o login do Google · Cloudflare Worker
 *
 * O login com o Google abre uma janela do Firebase, e o Firebase só deixa
 * abrir a partir de endereço que esteja na lista "Domínios autorizados" do
 * projeto. Sem cadenciamed.com.br na lista, o botão respondia "Este
 * endereço não está liberado no Firebase". (Entrar com e-mail e senha não
 * passa por essa lista, por isso só o Google quebrava.)
 *
 * Aqui a conta de serviço confere a lista e acrescenta o que faltar. Só os
 * endereços fixos abaixo: a rota não recebe nada de quem chama, então não
 * dá para usar isto para liberar outro domínio. Roda também na batida de
 * hora em hora (worker/index.js), e assim a lista se conserta sozinha se
 * alguém tirar um endereço no console sem querer.
 */
import { json, contaDeServico, tokenDeAcesso, PROJETO } from "./_comum.js";

export const DOMINIOS_DO_SITE = [
  "cadenciamed.com.br",
  "www.cadenciamed.com.br",
  "cadenciamed.joseeduardo1616.workers.dev",
];
const CONFIG = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJETO}/config`;
const ESCOPO = "https://www.googleapis.com/auth/cloud-platform";

async function motivo(r) {
  const t = await r.text().catch(() => "");
  try { return ((JSON.parse(t).error || {}).message || t).slice(0, 300); } catch (e) { return t.slice(0, 300); }
}

export async function garantirDominios(env) {
  const conta = contaDeServico(env);
  if (!conta) return { ok: false, erro: "Falta a conta de serviço (FIREBASE_SERVICE_ACCOUNT)." };
  let token;
  try { token = await tokenDeAcesso(conta, ESCOPO); }
  catch (e) { return { ok: false, erro: "Não consegui autenticar a conta de serviço." }; }

  const r = await fetch(CONFIG, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return { ok: false, erro: `Não consegui ler a configuração do login (${r.status}).`, detalhe: await motivo(r) };
  const atual = await r.json().catch(() => ({}));
  const lista = Array.isArray(atual.authorizedDomains) ? atual.authorizedDomains : [];
  const faltam = DOMINIOS_DO_SITE.filter((d) => lista.indexOf(d) < 0);
  if (!faltam.length) return { ok: true, adicionados: [], dominios: lista };

  const novos = [...lista, ...faltam];
  const p = await fetch(`${CONFIG}?updateMask=authorizedDomains`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ authorizedDomains: novos }),
  });
  if (!p.ok) return { ok: false, erro: `Não consegui gravar os domínios (${p.status}).`, detalhe: await motivo(p) };
  return { ok: true, adicionados: faltam, dominios: novos };
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);
  const r = await garantirDominios(env);
  return json(r, r.ok ? 200 : 502);
}
