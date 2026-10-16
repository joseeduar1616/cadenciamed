/* Medição dos anúncios · Cadência Med
 *
 * Carregado pelo app (index.html) e pela página de anúncio (comecar.html).
 * Faz quatro coisas, e nenhuma delas trava o site se falhar:
 *
 * 1. Pixel da Meta. Sem ele, a Meta só sabe quem CLICOU no anúncio, nunca
 *    quem criou conta, e otimiza para clique. Com ele, a campanha pode
 *    buscar quem se cadastra. O id fica na constante abaixo: enquanto ela
 *    estiver vazia, nada é carregado de fora e o resto continua valendo.
 *
 * 2. Origem da visita. Os parâmetros utm_* do link do anúncio são guardados
 *    no aparelho na PRIMEIRA visita (localStorage "cadencia:origem"), para
 *    a conta nova poder dizer de qual anúncio veio, mesmo que a pessoa só
 *    crie a conta dias depois.
 *
 * 3. Chegada pelo botão do anúncio. A página do anúncio manda para "/#conta".
 *    O app desenha a seção da conta depois de carregar, então o navegador
 *    não consegue rolar até ela sozinho: aqui esperamos a seção aparecer e
 *    rolamos até ela.
 *
 * O app chama window.cadenciaCadastro("email" | "google") logo depois de
 * criar a conta (parte3.jsx). É isso que vira o evento CompleteRegistration.
 */
(function () {
  "use strict";

  /* Gerenciador de Eventos da Meta › Conjuntos de dados › o id numérico. */
  var PIXEL_ID = "";

  /* ── 1. Pixel ─────────────────────────────────────────────────────── */
  if (PIXEL_ID) {
    try {
      /* Trecho oficial da Meta, sem alteração de comportamento. */
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0";
        n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      window.fbq("init", PIXEL_ID);
      window.fbq("track", "PageView");
    } catch (e) { /* sem pixel, segue o site */ }
  }

  function evento(nome, dados) {
    try { if (window.fbq) window.fbq("track", nome, dados || {}); } catch (e) { /* noop */ }
  }
  window.cadenciaEvento = evento;

  /* ── 2. Origem ────────────────────────────────────────────────────── */
  var CHAVE = "cadencia:origem";
  try {
    var q = new URLSearchParams(window.location.search);
    var origem = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"].forEach(function (k) {
      var v = q.get(k);
      if (v) origem[k] = v.slice(0, 120);
    });
    if (Object.keys(origem).length && !window.localStorage.getItem(CHAVE)) {
      origem.em = new Date().toISOString();
      origem.pagina = window.location.pathname;
      window.localStorage.setItem(CHAVE, JSON.stringify(origem));
    }
  } catch (e) { /* aba anônima sem armazenamento: tudo bem */ }

  window.cadenciaOrigem = function () {
    try { return JSON.parse(window.localStorage.getItem(CHAVE) || "null"); } catch (e) { return null; }
  };

  /* Chamado pelo app quando uma conta NOVA nasce. Uma vez por aparelho e
     por método, para recarregar a página não contar cadastro duas vezes. */
  window.cadenciaCadastro = function (metodo) {
    try {
      var marca = "cadencia:cadastro-medido";
      if (window.localStorage.getItem(marca)) return;
      window.localStorage.setItem(marca, String(metodo || "email"));
    } catch (e) { /* sem armazenamento: mede mesmo assim */ }
    var o = window.cadenciaOrigem() || {};
    evento("CompleteRegistration", {
      content_name: "conta Cadência Med",
      status: String(metodo || "email"),
      utm_content: o.utm_content || "",
    });
  };

  /* ── 3. Navegador de dentro do Instagram ─────────────────────────────
     Quem clica no anúncio abre o site no navegador embutido do Instagram,
     e ali o Google RECUSA o login ("disallowed_useragent"): a pessoa toca
     em "Entrar com Google", vê um erro e desiste. Aqui avisamos, em cima do
     formulário, para criar a conta com e-mail (que funciona normalmente)
     ou abrir no navegador do celular. */
  var embutido = /Instagram|FBAN|FBAV|FB_IAB|FBIOS/i.test(navigator.userAgent || "");
  window.cadenciaEmbutido = embutido;
  if (embutido) {
    var tentativasAviso = 0;
    var avisar = setInterval(function () {
      tentativasAviso += 1;
      /* O aviso entra DENTRO do cartão do formulário: na seção inteira ele
         virava mais uma coluna da grade e espremia o resto. */
      var secao = document.getElementById("conta");
      var conta = secao && (secao.querySelector(".vidro")
        || (secao.querySelector("input") && secao.querySelector("input").parentElement));
      if (conta && !document.getElementById("aviso-embutido")) {
        clearInterval(avisar);
        var aviso = document.createElement("div");
        aviso.id = "aviso-embutido";
        aviso.setAttribute("role", "note");
        aviso.style.cssText = "margin:0 0 16px;padding:12px 14px;border-radius:14px;"
          + "background:#FDE68A;color:#120F24;font:600 15px/1.45 system-ui,sans-serif";
        aviso.textContent = "Você está no navegador do Instagram, onde o login com Google não funciona. "
          + "Crie a conta com e-mail e senha logo abaixo. Leva 20 segundos.";
        conta.insertBefore(aviso, conta.firstChild);
      } else if (tentativasAviso > 120) {
        clearInterval(avisar);
      }
    }, 250);
  }

  /* ── 4. Rolar até a conta ─────────────────────────────────────────── */
  if (window.location.hash === "#conta") {
    var tentativas = 0;
    var procurar = setInterval(function () {
      tentativas += 1;
      var alvo = document.getElementById("conta");
      if (alvo) {
        clearInterval(procurar);
        try { alvo.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { alvo.scrollIntoView(); }
      } else if (tentativas > 60) {
        clearInterval(procurar);
      }
    }, 150);
  }
})();
