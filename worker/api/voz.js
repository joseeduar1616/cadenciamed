/* Assistente por voz · rota /api/voz
 *
 * A conversa em tempo real é entre o navegador e o Gemini Live, direto,
 * por WebSocket: passar o áudio por aqui dobraria a latência e ocuparia o
 * Worker o tempo inteiro da ligação. O que esta rota faz é o que o
 * navegador NÃO pode fazer sozinho: usar a chave.
 *
 * A chave do Gemini nunca sai do servidor. O navegador recebe um TOKEN
 * EFÊMERO (auth_tokens, v1alpha): vale para uma sessão só, precisa ser
 * usado em dois minutos, expira em meia hora, e vem trancado (fieldMask)
 * com o modelo, a voz, o idioma e a instrução de sistema. Quem tiver o
 * token não consegue mudar a persona, pedir outro modelo nem usar a cota
 * para outra coisa.
 *
 * Quem pode: quem está logado e tem plano em dia (ou o dono), como nas
 * outras rotas de IA, e cada sessão gasta pontos do teto diário
 * (_limites.js). Sem GEMINI_API_KEY a rota diz que não está configurada,
 * e o botão da assistente se esconde.
 *
 * O modelo: a Live API muda de nome com frequência (preview, versão por
 * data). Em vez de fixar um nome que um dia some, a rota lista os modelos
 * da chave e escolhe o melhor que aceita bidiGenerateContent com áudio
 * nativo. GEMINI_LIVE_MODELO nas variáveis do Worker força um nome; a
 * escolha fica guardada em memória por uma hora.
 */
import { json, quemPede, corpoJson, ehDono } from "./_comum.js";
import { podeUsar } from "./_ia.js";
import { instrucaoDaAssistente, VOZ_PADRAO } from "./_site.js";

const BASE = "https://generativelanguage.googleapis.com";
const WS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

/* Vozes femininas da Live API, na ordem de preferência. A pessoa escolheu
   a Zephyr; se um modelo não a tiver, a lista segue. */
export const VOZES_FEMININAS = ["Zephyr", "Leda", "Kore", "Aoede"];

/* Nomes conhecidos, do mais novo para o mais velho, usados só como
   desempate quando a lista da chave trouxer vários candidatos. */
const PREFERIDOS = [
  "native-audio",
  "live",
];

/* Qual modelo usar, dado o que a chave enxerga. Puro: testado sem rede.
   Critério: aceita bidiGenerateContent; áudio nativo antes dos outros;
   versão mais alta antes; data mais nova antes; "preview" e "exp" por
   último dentro da mesma família. */
export function escolherModeloAoVivo(modelos, forcado) {
  const lista = (Array.isArray(modelos) ? modelos : [])
    .map((m) => ({
      nome: String((m && m.name) || "").replace(/^models\//, ""),
      metodos: (m && m.supportedGenerationMethods) || [],
    }))
    .filter((m) => m.nome && m.metodos.indexOf("bidiGenerateContent") >= 0);
  if (forcado) {
    const f = String(forcado).replace(/^models\//, "");
    if (!lista.length || lista.some((m) => m.nome === f)) return f;
  }
  if (!lista.length) return "";
  const nota = (n) => {
    let p = 0;
    if (/native-audio/.test(n)) p += 1000;
    else if (/live/.test(n)) p += 500;
    const v = /(\d+)\.(\d+)/.exec(n);
    if (v) p += Number(v[1]) * 100 + Number(v[2]) * 10;
    const data = /(\d{2})-(\d{4})$/.exec(n);
    if (data) p += (Number(data[2]) - 2024) * 12 + Number(data[1]);
    if (/tts/.test(n)) p -= 2000;         // só fala, não conversa
    if (/exp/.test(n)) p -= 3;
    if (/preview/.test(n)) p -= 1;
    return p;
  };
  return lista.slice().sort((a, b) => nota(b.nome) - nota(a.nome))[0].nome;
}

let cacheModelos = { em: 0, nome: "" };

async function modeloAoVivo(env) {
  if (env.GEMINI_LIVE_MODELO && !/[^a-z0-9.\-]/i.test(env.GEMINI_LIVE_MODELO)) {
    return String(env.GEMINI_LIVE_MODELO).replace(/^models\//, "");
  }
  if (cacheModelos.nome && Date.now() - cacheModelos.em < 3600000) return cacheModelos.nome;
  let lista = [];
  try {
    const r = await fetch(`${BASE}/v1beta/models?pageSize=200`, { headers: { "x-goog-api-key": env.GEMINI_API_KEY } });
    if (r.ok) lista = ((await r.json()) || {}).models || [];
  } catch (e) { /* sem lista: tenta os nomes conhecidos abaixo */ }
  const nome = escolherModeloAoVivo(lista, "") || "gemini-2.5-flash-native-audio-preview-09-2025";
  cacheModelos = { em: Date.now(), nome };
  return nome;
}

const rfc3339 = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/* A configuração da sessão, trancada no token. O navegador só manda o
   nome do modelo no setup; o resto vem daqui. */
export function configuracaoDaSessao({ modelo, voz, instrucao }) {
  const nativo = /native-audio/.test(modelo);
  const setup = {
    model: `models/${modelo}`,
    generationConfig: {
      responseModalities: ["AUDIO"],
      temperature: 0.8,
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } },
        languageCode: "pt-BR",
      },
      /* Só nos modelos de áudio nativo: a entonação acompanha o tom de
         quem fala (afeto). Nos outros o campo é recusado. */
      ...(nativo ? { enableAffectiveDialog: true } : {}),
    },
    systemInstruction: { parts: [{ text: instrucao }] },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
      automaticActivityDetection: {
        /* Detecção de fala do próprio Gemini: é o que permite interromper
           a assistente falando por cima. Sensibilidade padrão no início e
           um pouco mais paciente no fim, para não cortar quem pensa
           falando. */
        disabled: false,
        startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
        endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
        prefixPaddingMs: 40,
        silenceDurationMs: 700,
      },
    },
    /* Conversa longa não estoura a janela: o começo vai sendo resumido. */
    contextWindowCompression: { slidingWindow: {} },
  };
  const fieldMask = [
    "model",
    "generationConfig.responseModalities", "generationConfig.temperature", "generationConfig.speechConfig",
    ...(nativo ? ["generationConfig.enableAffectiveDialog"] : []),
    "systemInstruction", "inputAudioTranscription", "outputAudioTranscription",
    "realtimeInputConfig", "contextWindowCompression",
  ].join(",");
  return { setup, fieldMask };
}

async function criarToken(env, setup, fieldMask) {
  const agora = Date.now();
  const r = await fetch(`${BASE}/v1alpha/auth_tokens`, {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      uses: 1,
      expireTime: rfc3339(agora + 30 * 60000),
      newSessionExpireTime: rfc3339(agora + 2 * 60000),
      bidiGenerateContentSetup: setup,
      fieldMask,
    }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.name) {
    const motivo = (j && j.error && j.error.message) || `HTTP ${r.status}`;
    return { erro: motivo, status: r.status };
  }
  return { nome: j.name };
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);
  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);

  if (!env.GEMINI_API_KEY) {
    return json({ erro: "A assistente por voz não está configurada neste site.", indisponivel: true }, 503);
  }

  const pessoa = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pessoa) return json({ erro: "Entre na sua conta para falar com a assistente." }, 403);

  const acao = String(corpo.acao || "sessao");

  /* Diagnóstico do dono: quais modelos ao vivo a chave enxerga hoje. */
  if (acao === "modelos") {
    if (!ehDono(pessoa.email)) return json({ erro: "Só o dono." }, 403);
    const r = await fetch(`${BASE}/v1beta/models?pageSize=200`, { headers: { "x-goog-api-key": env.GEMINI_API_KEY } });
    const j = await r.json().catch(() => null);
    const todos = ((j || {}).models || []).filter((m) => (m.supportedGenerationMethods || []).indexOf("bidiGenerateContent") >= 0)
      .map((m) => String(m.name || "").replace(/^models\//, ""));
    return json({ ok: true, aoVivo: todos, escolhido: escolherModeloAoVivo((j || {}).models || [], env.GEMINI_LIVE_MODELO) });
  }

  if (acao !== "sessao") return json({ erro: "Ação desconhecida." }, 400);

  /* Plano em dia (ou dono) e o teto diário: uma sessão vale os pontos de
     "voz" em _limites.js. */
  const pode = await podeUsar(pessoa, env, "voz");
  if (!pode.ok) return json({ erro: pode.erro }, 403);

  const modelo = await modeloAoVivo(env);
  const voz = VOZES_FEMININAS.indexOf(env.GEMINI_LIVE_VOZ) >= 0 ? env.GEMINI_LIVE_VOZ : VOZ_PADRAO;
  const instrucao = instrucaoDaAssistente(corpo.contexto || {});
  const { setup, fieldMask } = configuracaoDaSessao({ modelo, voz, instrucao });

  const t = await criarToken(env, setup, fieldMask);
  if (t.erro) {
    console.error("voz: token recusado", t.status, t.erro);
    const motivo = t.status === 400 || t.status === 404
      ? "O Gemini recusou a configuração da sessão de voz. O dono do site precisa conferir o modelo (GEMINI_LIVE_MODELO)."
      : t.status === 429
        ? "A assistente por voz está no limite de uso agora. Tente de novo em um minuto."
        : "Não consegui abrir a sessão de voz. Tente de novo em instantes.";
    return json({ erro: motivo }, 502);
  }

  return json({
    ok: true,
    url: `${WS}?access_token=${encodeURIComponent(t.nome)}`,
    /* O que o navegador manda na primeira mensagem. Só o modelo: o resto
       está trancado no token. */
    setup: { model: `models/${modelo}` },
    modelo,
    voz,
    validoPor: 120,
    entrada: { taxa: 16000, mime: "audio/pcm;rate=16000" },
    saida: { taxa: 24000 },
  });
}
