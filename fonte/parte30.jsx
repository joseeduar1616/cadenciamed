/* ═══════════════════════════════════════════════════════════════════
   40 · FOLHA EM BRANCO, DENTRO DA ANOTAÇÃO

   O primeiro passo do ciclo "teoria curta e questões" que a mentoria
   recomenda: ler o conteúdo, FECHAR o material e escrever de memória os
   pontos principais; depois conferir e completar em outra cor (método 1
   do material, prática de recuperação).

   Como fica na anotação de cada aula:
   1. A pessoa joga o conteúdo na anotação (cola, grava a aula, ou importa
      um PDF, Word ou foto — que a IA já organiza em caixas).
   2. No fim da anotação, "Montar a folha em branco": a IA divide o tema em
      caixas (fisiopatologia, sintomas, sinais clínicos, diagnóstico,
      tratamento...), cada uma com a pergunta e um gabarito escondido.
   3. A pessoa escreve em cada caixa. Enquanto escreve, a anotação some da
      tela (folha em branco é sem consulta).
   4. "Conferir": a IA diz ponto a ponto o que ela lembrou, lembrou pela
      metade ou esqueceu, e o que escreveu de ERRADO. O que faltou aparece em
      outra cor, embaixo do que ela escreveu.
   5. O que faltou pode virar flashcard; a folha pode ser refeita nas
      revisões (24h, 7 e 30 dias), e cada vez fica registrada a porcentagem.

   O HTML que entra na anotação é montado AQUI, com todo texto escapado: o
   conteúdo veio de um arquivo de fora e de uma IA.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_FOLHA = "/api/folha-ia";
const MAX_FOLHAS = 40;
const MAX_ESCRITO_FOLHA = 4000;

/* A cor de cada caixa pelo assunto dela: a mesma em todo lugar, para o
   olho achar "tratamento" sem ler o título. */
function corDaCaixa(titulo) {
  const t = String(titulo || "").toLowerCase();
  if (/fisiopat|etiolog|mecanism/.test(t)) return "#8E6BE0";
  if (/sintom|sinai|quadro|exame f/.test(t)) return "#E08A2E";
  if (/diagn[oó]stico diferencial|diferencia/.test(t)) return "#C2549B";
  if (/diagn|exame|crit[eé]r|achado/.test(t)) return "#2F86D6";
  if (/tratament|conduta|terap/.test(t)) return "#2E9E5B";
  if (/complica|progn/.test(t)) return "#D04848";
  if (/prova|cai/.test(t)) return "#C9A227";
  return "#5B8DB8";
}

/* ── o que é guardado na conta ─────────────────────────────────────── */
function limparFolha(f) {
  if (!f || typeof f !== "object" || !Array.isArray(f.caixas)) return null;
  const t = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  const caixas = f.caixas.slice(0, 12).map((c) => {
    const pontos = (Array.isArray(c && c.pontos) ? c.pontos : []).slice(0, 16)
      .map((p) => ({ texto: t(p && p.texto, 260), complemento: !!(p && p.complemento) }))
      .filter((p) => p.texto);
    const conf = c && c.conf && Array.isArray(c.conf.status) ? {
      status: c.conf.status.slice(0, pontos.length).map((s) => (["lembrou", "parcial", "faltou"].indexOf(s) >= 0 ? s : "faltou")),
      erros: (Array.isArray(c.conf.erros) ? c.conf.erros : []).slice(0, 8)
        .map((e) => ({ trecho: t(e && e.trecho, 200), correcao: t(e && e.correcao, 260) })).filter((e) => e.trecho),
      comentario: t(c.conf.comentario, 300),
      em: Number(c.conf.em) || 0,
    } : null;
    return { titulo: t(c && c.titulo, 60), pergunta: t(c && c.pergunta, 160), pontos, escrito: t(c && c.escrito, MAX_ESCRITO_FOLHA), conf };
  }).filter((c) => c.titulo && c.pontos.length);
  if (!caixas.length) return null;
  return {
    titulo: t(f.titulo, 120),
    em: Number(f.em) || 0,
    caixas,
    hist: (Array.isArray(f.hist) ? f.hist : []).slice(-12)
      .map((h) => ({ em: Number(h && h.em) || 0, pct: Math.max(0, Math.min(100, Math.round(Number(h && h.pct) || 0))) }))
      .filter((h) => h.em),
  };
}
function limparFolhas(v) {
  const o = v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const pares = Object.entries(o)
    .map(([k, f]) => [String(k).slice(0, 60), limparFolha(f)])
    .filter(([, f]) => f)
    .sort((a, b) => b[1].em - a[1].em)
    .slice(0, MAX_FOLHAS);
  return Object.fromEntries(pares);
}

/* Quanto da folha a pessoa lembrou, nas caixas já conferidas. */
function placarDaFolha(folha) {
  let pontos = 0, total = 0;
  for (const c of (folha && folha.caixas) || []) {
    if (!c.conf) continue;
    for (const s of c.conf.status) { total += 1; pontos += s === "lembrou" ? 1 : s === "parcial" ? 0.5 : 0; }
  }
  return total ? Math.round((pontos / total) * 100) : null;
}

/* ── o HTML que vai para a anotação ────────────────────────────────── */
const estiloCaixaNota = (cor) => `border-left:4px solid ${cor};background:${cor}14;padding:10px 14px;margin:12px 0;border-radius:0 8px 8px 0`;

/* Só imagem que esta própria página recortou ou leu do arquivo, em
   base64: nada de endereço de fora nem outro tipo de conteúdo no src. */
const DADOS_FIGURA = /^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/;

function htmlDaFigura(f, legenda) {
  if (!f || !DADOS_FIGURA.test(f.dados || "")) return "";
  const e = escaparHtml;
  const leg = legenda || f.contexto || (f.pagina ? `Figura da página ${f.pagina}` : "Figura do material");
  return `<p style="margin:10px 0 2px"><img src="${f.dados}" alt="${e(leg)}" style="max-width:100%;border-radius:10px"></p>`
    + `<p style="margin:0 0 8px;font-size:13px;opacity:.85"><i>${e(leg)}</i></p>`;
}

/* As caixas na anotação. "figuras" é o que veio do arquivo ({ F1: {dados,
   pagina, contexto} }): cada uma vai na caixa que a IA escolheu, com a
   legenda dela; a que não coube em caixa nenhuma vai numa caixa final, em
   vez de se perder. */
function htmlDasCaixas(folha, origem, figuras) {
  const e = escaparHtml;
  const figs = figuras || {};
  const legendas = folha.legendas || {};
  const usadas = new Set();
  const partes = [`<h2>${e(folha.titulo || "Pontos principais")}</h2>`];
  if (origem) partes.push(`<p><i>${e(origem)}</i></p>`);
  for (const c of folha.caixas) {
    const cor = corDaCaixa(c.titulo);
    const itens = c.pontos.map((p) => `<li>${e(p.texto)}${p.complemento ? ' <i style="opacity:.75">(complemento da IA, confira)</i>' : ""}</li>`).join("");
    const imagens = (c.figuras || []).filter((id) => figs[id] && !usadas.has(id))
      .map((id) => { usadas.add(id); return htmlDaFigura(figs[id], legendas[id]); }).join("");
    partes.push(`<div data-caixa="1" style="${estiloCaixaNota(cor)}"><h3 style="color:${cor};margin:0 0 6px">${e(c.titulo)}</h3><ul>${itens}</ul>${imagens}</div>`);
  }
  const sobras = Object.keys(figs).filter((id) => !usadas.has(id));
  if (sobras.length) {
    const cor = "#5B8DB8";
    partes.push(`<div data-caixa="1" style="${estiloCaixaNota(cor)}"><h3 style="color:${cor};margin:0 0 6px">Figuras do material</h3>${sobras.map((id) => htmlDaFigura(figs[id], legendas[id])).join("")}</div>`);
  }
  return partes.join("");
}

/* ── ler o arquivo COM as figuras ──────────────────────────────────────
 *
 * O texto sozinho perdia o que mais ensina num material de medicina: o
 * ECG, a radiografia, o fluxograma. Do PDF, cada figura embutida é
 * recortada da página (o mesmo recorte dos flashcards, parte12) junto com o
 * texto que está em volta dela — a legenda, ou o parágrafo vizinho —, que
 * é o que a IA usa para decidir em que caixa ela entra. Do Word, as
 * imagens já vêm dentro do arquivo. As imagens não saem do aparelho: só o
 * texto em volta vai para a IA. */
const MAX_FIGURAS_IMPORT = 20;

async function figurasComContexto(pdfjsLib, page, conteudo, numero) {
  const vp1 = page.getViewport({ scale: 1 });
  const escala = Math.min(3, Math.max(1, 1900 / Math.max(vp1.width, vp1.height)));
  const viewport = page.getViewport({ scale: escala });
  const area = viewport.width * viewport.height;
  /* nem enfeite pequeno, nem a página inteira (fundo de slide, página
     escaneada) */
  const caixas = (await retangulosDeImagem(pdfjsLib, page, viewport))
    .filter((c) => c.w * c.h >= area * 0.012 && c.w * c.h <= area * 0.85 && c.w >= 60 * escala && c.h >= 45 * escala)
    .filter((c, i, todas) => todas.findIndex((d) => Math.abs(d.x - c.x) < 4 && Math.abs(d.y - c.y) < 4 && Math.abs(d.w - c.w) < 4) === i);
  if (!caixas.length) return [];

  const tela = document.createElement("canvas");
  tela.width = Math.ceil(viewport.width);
  tela.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: tela.getContext("2d"), viewport }).promise;

  const linhas = (conteudo.items || [])
    .filter((it) => it.str && it.str.trim() && it.transform)
    .map((it) => {
      const [x, y] = aplicarMatriz(viewport.transform, it.transform[4], it.transform[5]);
      return { x, y, t: it.str };
    });
  const textoPagina = linhas.map((l) => l.t).join(" ").replace(/\s+/g, " ");
  const legendaDaPagina = (textoPagina.match(/(Figura|Fig\.|Imagem|Tabela|Quadro|Gr[aá]fico)\s*\d+[^.]{0,160}/i) || [""])[0];

  return caixas.map((c) => {
    const sx = Math.max(0, c.x), sy = Math.max(0, c.y);
    const sw = Math.max(1, Math.min(tela.width - sx, c.w)), sh = Math.max(1, Math.min(tela.height - sy, c.h));
    const fator = Math.min(1, 1400 / Math.max(sw, sh));
    const alvo = document.createElement("canvas");
    alvo.width = Math.max(1, Math.round(sw * fator));
    alvo.height = Math.max(1, Math.round(sh * fator));
    alvo.getContext("2d").drawImage(tela, sx, sy, sw, sh, 0, 0, alvo.width, alvo.height);
    /* o texto logo abaixo (legenda) ou logo acima (título) da figura */
    const perto = linhas
      .filter((l) => l.x >= c.x - 40 * escala && l.x <= c.x + c.w + 40 * escala
        && ((l.y > c.y + c.h && l.y < c.y + c.h + 70 * escala) || (l.y < c.y && l.y > c.y - 40 * escala)))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((l) => l.t).join(" ").replace(/\s+/g, " ").trim();
    return {
      dados: alvo.toDataURL("image/jpeg", 0.85),
      pagina: numero,
      contexto: (perto || legendaDaPagina || textoPagina.slice(0, 160)).slice(0, 220),
      marca: `${Math.round(c.w / 8)}x${Math.round(c.h / 8)}`,
    };
  });
}

async function lerPdfComFiguras(arquivo, aviso) {
  aviso("carregando o leitor de PDF");
  const pdfjsLib = await carregarPdfJs();
  aviso("abrindo o arquivo");
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  const total = Math.min(doc.numPages, LIMITE_PAGINAS_PDF);
  const blocos = [];
  const achadas = [];
  for (let n = 1; n <= total; n++) {
    aviso(`lendo página ${n} de ${total}`);
    const page = await doc.getPage(n);
    const conteudo = await page.getTextContent();
    const texto = conteudo.items.map((it) => it.str || "").join(" ").replace(/\s+/g, " ").trim();
    if (texto) blocos.push(`--- página ${n} ---\n${texto}`);
    if (achadas.length < MAX_FIGURAS_IMPORT * 2) {
      try { achadas.push(...await figurasComContexto(pdfjsLib, page, conteudo, n)); }
      catch (e) { /* essa página segue só com o texto */ }
    }
  }
  /* a mesma figura em três páginas ou mais é logotipo ou cabeçalho */
  const vezes = {};
  for (const f of achadas) vezes[f.marca] = (vezes[f.marca] || 0) + 1;
  const figuras = achadas.filter((f) => vezes[f.marca] < 3).slice(0, MAX_FIGURAS_IMPORT)
    .map((f, i) => ({ id: `F${i + 1}`, dados: f.dados, pagina: f.pagina, contexto: f.contexto }));
  return { texto: blocos.join("\n\n"), figuras };
}

async function lerDocxComFiguras(arquivo, aviso) {
  aviso("carregando o leitor de Word");
  const mammoth = await carregarMammoth();
  aviso("lendo o arquivo");
  const r = await mammoth.convertToHtml({ arrayBuffer: await arquivo.arrayBuffer() });
  const doc = new DOMParser().parseFromString(String(r.value || ""), "text/html");
  const blocos = [...doc.body.children];
  const figuras = [];
  blocos.forEach((b, i) => {
    for (const img of b.querySelectorAll("img")) {
      const src = img.getAttribute("src") || "";
      if (!DADOS_FIGURA.test(src) || src.length > 4 * 1024 * 1024 || figuras.length >= MAX_FIGURAS_IMPORT) continue;
      const vizinho = [b, blocos[i + 1], blocos[i - 1]].map((x) => (x ? x.textContent.trim() : "")).find((t) => t) || "";
      figuras.push({ id: `F${figuras.length + 1}`, dados: src, pagina: 0, contexto: (img.getAttribute("alt") || vizinho).slice(0, 220) });
    }
  });
  const texto = blocos.map((b) => b.textContent.trim()).filter(Boolean).join("\n");
  return { texto, figuras };
}

/* PowerPoint: o texto de cada slide (e as notas do apresentador, que é
   onde muito professor escreve a explicação), na ordem da apresentação, e
   as imagens de cada slide com o texto do próprio slide em volta. Tudo no
   navegador: o arquivo não sai do aparelho. Imagem que se repete em três
   slides ou mais é logotipo ou fundo do modelo, e fica de fora. */
const TIPO_IMG_PPTX = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

function textoDoXmlPptx(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.getElementsByTagNameNS("*", "p")]
    .map((p) => [...p.getElementsByTagNameNS("*", "t")].map((t) => t.textContent).join(""))
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function relacoesPptx(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.getElementsByTagNameNS("*", "Relationship")].map((r) => ({
    id: r.getAttribute("Id"), tipo: r.getAttribute("Type") || "", alvo: r.getAttribute("Target") || "",
  }));
}

/* "../media/image3.png" visto de "ppt/slides/" vira "ppt/media/image3.png" */
function caminhoPptx(base, alvo) {
  if (/^\//.test(alvo)) return alvo.slice(1);
  const partes = base.split("/").slice(0, -1);
  for (const pedaco of alvo.split("/")) {
    if (pedaco === "..") partes.pop();
    else if (pedaco && pedaco !== ".") partes.push(pedaco);
  }
  return partes.join("/");
}

function imagemReduzida(blob) {
  return new Promise((ok) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const fator = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * fator));
      c.height = Math.max(1, Math.round(img.height * fator));
      const g = c.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      ok({ dados: c.toDataURL("image/jpeg", 0.85), largura: img.width, altura: img.height });
    };
    img.onerror = () => { URL.revokeObjectURL(url); ok(null); };
    img.src = url;
  });
}

async function lerPptxComFiguras(arquivo, aviso, opcoes) {
  const semFiguras = !!(opcoes && opcoes.semFiguras);
  aviso("carregando o leitor de PowerPoint");
  const JSZip = await carregarJsZip();
  aviso("abrindo a apresentação");
  let zip;
  try { zip = await JSZip.loadAsync(await arquivo.arrayBuffer()); }
  catch (e) { throw new Error(`Não consegui abrir ${arquivo.name}. Confira se é um .pptx do PowerPoint.`); }
  const ler = (k) => (zip.file(k) ? zip.file(k).async("string") : Promise.resolve(""));

  /* a ordem é a da apresentação (presentation.xml), não a do nome do
     arquivo: slide10 vem depois de slide9, e slide movido muda de lugar */
  let slides = [];
  try {
    const relsPres = relacoesPptx(await ler("ppt/_rels/presentation.xml.rels"));
    const pres = new DOMParser().parseFromString(await ler("ppt/presentation.xml"), "application/xml");
    slides = [...pres.getElementsByTagNameNS("*", "sldId")]
      .map((el) => el.getAttribute("r:id") || el.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"))
      .map((id) => relsPres.find((r) => r.id === id))
      .filter(Boolean)
      .map((r) => caminhoPptx("ppt/presentation.xml", r.alvo));
  } catch (e) { slides = []; }
  if (!slides.length) {
    slides = Object.keys(zip.files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  }
  if (!slides.length) throw new Error(`${arquivo.name} não tem slides que eu consiga ler.`);

  const blocos = [];
  const achadas = [];
  for (let n = 0; n < slides.length; n++) {
    aviso(`lendo o slide ${n + 1} de ${slides.length}`);
    const caminho = slides[n];
    const linhas = textoDoXmlPptx(await ler(caminho));
    const nomeRels = caminho.replace(/([^/]+)$/, "_rels/$1.rels");
    const rels = relacoesPptx(await ler(nomeRels));
    const notasRel = rels.find((r) => /\/notesSlide$/.test(r.tipo));
    let notas = [];
    if (notasRel) {
      notas = textoDoXmlPptx(await ler(caminhoPptx(caminho, notasRel.alvo)))
        .filter((t) => !/^\d+$/.test(t));   // o número da página que o modelo põe nas notas
    }
    if (linhas.length || notas.length) {
      blocos.push(`--- slide ${n + 1} ---\n${linhas.join("\n")}${notas.length ? `\nNotas do apresentador: ${notas.join(" ")}` : ""}`);
    }
    if (semFiguras) continue;
    for (const r of rels.filter((x) => /\/image$/.test(x.tipo))) {
      const alvo = caminhoPptx(caminho, r.alvo);
      const ext = (alvo.match(/\.([a-z0-9]+)$/i) || [])[1];
      const tipo = TIPO_IMG_PPTX[String(ext || "").toLowerCase()];
      const arq = zip.file(alvo);
      if (!tipo || !arq) continue;   // EMF, WMF, SVG: o navegador não desenha
      achadas.push({ alvo, tipo, pagina: n + 1, contexto: (linhas[0] ? `${linhas[0]}. ${linhas.slice(1).join(" ")}` : `Slide ${n + 1}`).slice(0, 220) });
    }
  }

  let figuras = [];
  if (!semFiguras && achadas.length) {
    const vezes = {};
    for (const f of achadas) vezes[f.alvo] = (vezes[f.alvo] || 0) + 1;
    const vistas = new Set();
    for (const f of achadas) {
      if (figuras.length >= MAX_FIGURAS_IMPORT) break;
      if (vezes[f.alvo] >= 3 || vistas.has(f.alvo)) continue;
      vistas.add(f.alvo);
      aviso(`guardando a imagem ${figuras.length + 1}`);
      const blob = new Blob([await zip.file(f.alvo).async("uint8array")], { type: f.tipo });
      const img = await imagemReduzida(blob);
      /* ícone e marcador pequenos não ensinam nada */
      if (!img || img.largura * img.altura < 120 * 90) continue;
      figuras.push({ id: `F${figuras.length + 1}`, dados: img.dados, pagina: f.pagina, contexto: f.contexto });
    }
  }
  return { texto: blocos.join("\n\n"), figuras };
}

/* A folha feita, levada para a anotação: o que a pessoa escreveu na cor
   normal, e o que faltou na outra cor — o "completar em outra cor" do
   método. */
function htmlDaFolhaFeita(folha, quando) {
  const e = escaparHtml;
  const partes = [`<h2>Folha em branco · ${e(quando)}</h2>`];
  const pct = placarDaFolha(folha);
  if (pct !== null) partes.push(`<p><i>Lembrei ${pct}% dos pontos.</i></p>`);
  for (const c of folha.caixas) {
    const cor = corDaCaixa(c.titulo);
    const escrito = c.escrito ? `<p>${e(c.escrito).replace(/\n/g, "<br>")}</p>` : "<p><i>(em branco)</i></p>";
    const faltas = c.conf
      ? c.pontos.map((p, i) => [p, c.conf.status[i]]).filter(([, s]) => s !== "lembrou")
        .map(([p, s]) => `<li style="color:#C2410C">${s === "parcial" ? "(incompleto) " : ""}${e(p.texto)}</li>`).join("")
      : "";
    const erros = c.conf && c.conf.erros.length
      ? `<p style="color:#B91C1C"><b>Corrigir:</b> ${c.conf.erros.map((x) => `${e(x.trecho)} → ${e(x.correcao)}`).join("; ")}</p>` : "";
    partes.push(`<div data-caixa="1" style="${estiloCaixaNota(cor)}"><h3 style="color:${cor};margin:0 0 6px">${e(c.titulo)}</h3>${escrito}${faltas ? `<p style="color:#C2410C;margin:8px 0 2px"><b>O que faltou</b></p><ul>${faltas}</ul>` : ""}${erros}</div>`);
  }
  return partes.join("");
}

async function falarComFolha(nuvem, corpo) {
  /* sem conta, o servidor recusa com a mensagem certa */
  const token = await pegarTokenDaConta(nuvem);
  const { dados, erro } = await chamarApi(ROTA_FOLHA, { ...corpo, token }, "A folha em branco");
  return erro ? { erro } : (dados || {});
}

/* ── importar um arquivo para a anotação ───────────────────────────────
 *
 * PDF, Word, texto ou foto: vira texto (no aparelho, ou pela IA que lê
 * foto), a IA organiza nas mesmas caixas, e o resultado entra no fim da
 * anotação. Se ainda não houver folha em branco, a mesma estrutura já vira
 * a folha — o conteúdo que acabou de entrar é o que vai ser estudado. */
function ImportarParaAnotacao({ subjectId, titulo, nuvem, notify, inserirNaAnotacao, folha, setData }) {
  const ref = useRef(null);
  const [status, setStatus] = useState("");
  const escolher = async (ev) => {
    const arquivos = [...(ev.target.files || [])];
    ev.target.value = "";
    if (!arquivos.length) return;
    try {
      let texto = "";
      let figuras = [];
      const fotos = arquivos.filter((f) => /^image\//i.test(f.type));
      if (fotos.length) {
        const r = await lerFotosComIA(nuvem, fotos.slice(0, MAX_FOTOS), setStatus);
        if (r.erro) { notify(r.erro); return; }
        texto = String(r.texto || "");
      } else if (/\.pdf$/i.test(arquivos[0].name)) {
        ({ texto, figuras } = await lerPdfComFiguras(arquivos[0], setStatus));
      } else if (/\.docx$/i.test(arquivos[0].name)) {
        ({ texto, figuras } = await lerDocxComFiguras(arquivos[0], setStatus));
      } else if (/\.pptx$/i.test(arquivos[0].name)) {
        ({ texto, figuras } = await lerPptxComFiguras(arquivos[0], setStatus));
      } else {
        texto = await lerArquivoParaTexto(arquivos[0], setStatus);
      }
      if (String(texto).trim().length < 200) { notify("Quase não achei texto nesse arquivo. Se for um PDF escaneado, mande como foto."); return; }
      setStatus("a IA está organizando nas caixas…");
      const r = await falarComFolha(nuvem, {
        acao: "caixas", texto, tema: titulo,
        figuras: figuras.map(({ id, pagina, contexto }) => ({ id, pagina, contexto })),
      });
      if (r.erro) { notify(r.erro); return; }
      const nome = fotos.length ? `${fotos.length} foto${fotos.length === 1 ? "" : "s"}` : arquivos[0].name;
      const porId = Object.fromEntries(figuras.map((f) => [f.id, f]));
      inserirNaAnotacao(htmlDasCaixas(r, `Organizado de ${nome}.`, porId));
      const temEscrito = folha && folha.caixas.some((c) => c.escrito || c.conf);
      if (!temEscrito) {
        setData((p) => ({ ...p, folhas: { ...(p.folhas || {}), [subjectId]: limparFolha({ titulo: r.titulo, caixas: r.caixas, em: Date.now(), hist: (folha && folha.hist) || [] }) } }));
      }
      notify(`${r.caixas.length} caixas${figuras.length ? ` e ${figuras.length} figura${figuras.length === 1 ? "" : "s"}` : ""} entraram no fim da anotação.${temEscrito ? "" : " A folha em branco já está pronta lá embaixo."}${r.cortado ? " O arquivo era grande e foi lido até um ponto." : ""}`);
    } catch (e) {
      notify((e && e.message) || "Não consegui ler esse arquivo.");
    } finally { setStatus(""); }
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Btn size="sm" tone="outline" disabled={!!status} onClick={() => ref.current && ref.current.click()}>
        <Upload size={14} /> {status ? "Importando…" : "Importar PDF, Word, PowerPoint ou foto"}
      </Btn>
      <input ref={ref} type="file" multiple accept={`${TIPOS_ARQUIVO},${TIPOS_FOTO}`} onChange={escolher}
        style={{ display: "none" }} data-teste="importar-anotacao" />
      <Mini>{status || "a IA organiza em caixas: fisiopatologia, quadro clínico, diagnóstico, tratamento…"}</Mini>
    </div>
  );
}

/* ── a folha em si ─────────────────────────────────────────────────── */
function FolhaEmBranco({ subjectId, titulo, area, folha, setData, nuvem, notify, pastas,
  lerTextoDaAnotacao, inserirNaAnotacao, aoEscrever }) {
  const [ocupado, setOcupado] = useState("");          // "" | "montar" | índice da caixa | "todas"
  const [rascunho, setRascunho] = useState({});        // índice → texto, enquanto digita
  const tempo = useRef({});

  const gravar = (mudar) => setData((p) => {
    const atual = (p.folhas || {})[subjectId];
    if (!atual) return p;
    const nova = limparFolha(mudar(atual));
    return { ...p, folhas: { ...(p.folhas || {}), [subjectId]: nova } };
  });

  const montar = async () => {
    const texto = lerTextoDaAnotacao();
    if (texto.trim().length < 200) { notify("Jogue o conteúdo da aula na anotação primeiro (colar, gravar ou importar)."); return; }
    setOcupado("montar");
    const r = await falarComFolha(nuvem, { acao: "caixas", texto, tema: titulo });
    setOcupado("");
    if (r.erro) { notify(r.erro); return; }
    setData((p) => ({
      ...p,
      folhas: { ...(p.folhas || {}), [subjectId]: limparFolha({ titulo: r.titulo, caixas: r.caixas, em: Date.now(), hist: (folha && folha.hist) || [] }) },
    }));
    setRascunho({});
    notify(`Folha montada com ${r.caixas.length} caixas. Agora escreva de memória, sem olhar a anotação.`);
  };

  const escrever = (i, v) => {
    setRascunho((r) => ({ ...r, [i]: v }));
    if (aoEscrever) aoEscrever();
    window.clearTimeout(tempo.current[i]);
    tempo.current[i] = window.setTimeout(() => {
      gravar((f) => ({ ...f, caixas: f.caixas.map((c, k) => (k === i ? { ...c, escrito: v } : c)) }));
    }, 700);
  };
  const escritoDe = (i) => (rascunho[i] !== undefined ? rascunho[i] : (folha.caixas[i] && folha.caixas[i].escrito) || "");

  const conferirUma = async (i) => {
    const c = folha.caixas[i];
    const escrito = escritoDe(i).trim();
    if (!escrito) { notify("Escreva o que você lembra antes de conferir."); return false; }
    const r = await falarComFolha(nuvem, { acao: "conferir", caixa: c, escrito, tema: titulo });
    if (r.erro) { notify(r.erro); return false; }
    gravar((f) => ({
      ...f,
      caixas: f.caixas.map((x, k) => (k === i ? { ...x, escrito, conf: { status: r.status, erros: r.erros, comentario: r.comentario, em: Date.now() } } : x)),
    }));
    return true;
  };
  const conferir = async (i) => { setOcupado(i); await conferirUma(i); setOcupado(""); };
  const conferirTodas = async () => {
    setOcupado("todas");
    for (let i = 0; i < folha.caixas.length; i += 1) {
      if (folha.caixas[i].conf || !escritoDe(i).trim()) continue;
      if (!(await conferirUma(i))) break;
    }
    setOcupado("");
  };

  /* Ao conferir a última caixa, o placar entra no histórico — é o que
     mostra, na próxima revisão, se a folha está ficando mais cheia. */
  const pct = folha ? placarDaFolha(folha) : null;
  const todas = folha && folha.caixas.every((c) => c.conf);
  const registrado = useRef(false);
  useEffect(() => {
    if (!folha || !todas || pct === null) { registrado.current = false; return; }
    if (registrado.current) return;
    const ultimo = folha.hist[folha.hist.length - 1];
    const maisNova = Math.max(...folha.caixas.map((c) => (c.conf ? c.conf.em : 0)));
    if (ultimo && ultimo.em >= maisNova) { registrado.current = true; return; }
    registrado.current = true;
    gravar((f) => ({ ...f, hist: [...(f.hist || []), { em: Date.now(), pct }] }));
  }, [todas, pct]); // eslint-disable-line react-hooks/exhaustive-deps

  const refazer = () => {
    setRascunho({});
    gravar((f) => ({ ...f, caixas: f.caixas.map((c) => ({ ...c, escrito: "", conf: null })) }));
    notify("Folha limpa. Feche a anotação de novo e escreva do zero.");
  };
  const apagar = () => {
    setRascunho({});
    setData((p) => { const fs = { ...(p.folhas || {}) }; delete fs[subjectId]; return { ...p, folhas: fs }; });
  };
  const levarParaAnotacao = () => {
    inserirNaAnotacao(htmlDaFolhaFeita(folha, brDate(todayISO())));
    notify("A folha, com o que faltou em outra cor, entrou no fim da anotação.");
  };
  const faltasEmCartoes = async () => {
    const linhas = [];
    for (const c of folha.caixas) {
      if (!c.conf) continue;
      c.pontos.forEach((p, i) => { if (c.conf.status[i] !== "lembrou") linhas.push(`${c.titulo}: ${p.texto}`); });
      for (const e of c.conf.erros) linhas.push(`${c.titulo}: ${e.correcao}`);
    }
    if (!linhas.length) { notify("Nada faltou. Não há o que virar cartão."); return; }
    setOcupado("cartoes");
    const { dados, erro } = await gerarFlashcardsComIA({ texto: `${titulo}\n\n${linhas.join("\n")}`, baralho: titulo, cobrirTudo: true, nuvem });
    setOcupado("");
    if (erro) { notify(erro); return; }
    const cartoes = (dados && dados.cartoes) || [];
    if (!cartoes.length) { notify("A IA não conseguiu montar cartões do que faltou."); return; }
    const pasta = pastaDaArea(pastas, area) || PASTA_SOLTA;
    const novos = cartoes.map((c) => novoCartao(c.frente, c.verso, subjectId, titulo, pasta));
    setData((p) => ({ ...p, flash: [...novos, ...(p.flash || [])], pastas: registrarPasta(p.pastas, pasta) }));
    notify(`${novos.length} cartões do que faltou, na pasta "${pasta}".`);
  };

  if (!folha) {
    return (
      <div className="rounded-2xl px-4 py-4" data-teste="folha-em-branco"
        style={{ background: soft("var(--warn)", 7), border: `1px dashed ${soft("var(--warn)", 45)}` }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>Folha em branco</div>
        <Mini style={{ marginTop: 6, lineHeight: 1.6 }}>
          Leu o conteúdo? A IA monta as caixas do tema (fisiopatologia, sintomas, sinais clínicos,
          diagnóstico, tratamento...) com os pontos que você precisa saber, escondidos. Você escreve
          de memória, sem olhar a anotação, e depois confere: o que faltou aparece em outra cor.
        </Mini>
        <div className="mt-3">
          <Btn size="sm" tone="primary" disabled={ocupado === "montar"} onClick={montar}>
            <NotebookPen size={14} /> {ocupado === "montar" ? "Montando as caixas…" : "Montar a folha em branco"}
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-teste="folha-em-branco">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>Folha em branco{folha.titulo ? ` · ${folha.titulo}` : ""}</div>
          <Mini style={{ marginTop: 3 }}>
            escreva de memória em cada caixa; depois confira
            {folha.hist.length ? ` · da última vez: ${folha.hist[folha.hist.length - 1].pct}%` : ""}
          </Mini>
        </div>
        {pct !== null ? (
          <div style={{ textAlign: "right" }}>
            <Num size={20} weight={700} color={pct >= 80 ? "var(--ok)" : pct >= 50 ? "var(--warn)" : "var(--bad)"}>{pct}%</Num>
            <Mini>lembrado no que já conferiu</Mini>
          </div>
        ) : null}
      </div>

      {folha.caixas.map((c, i) => {
        const cor = corDaCaixa(c.titulo);
        const escrito = escritoDe(i);
        return (
          <div key={i} className="rounded-xl px-4 py-3" data-teste="caixa-folha"
            style={{ borderLeft: `4px solid ${cor}`, background: soft(cor, 7) }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span style={{ fontSize: 15, fontWeight: 700, color: cor }}>{c.titulo}</span>
              <Mini>{c.pontos.length} ponto{c.pontos.length === 1 ? "" : "s"}</Mini>
            </div>
            {c.pergunta ? <Mini style={{ marginTop: 3, lineHeight: 1.5 }}>{c.pergunta}</Mini> : null}
            <Area value={escrito} onChange={(e) => escrever(i, e.target.value.slice(0, MAX_ESCRITO_FOLHA))}
              onFocus={aoEscrever} placeholder="Escreva aqui o que você lembra, sem consultar."
              style={{ marginTop: 8, minHeight: 90 }} aria-label={`Escreva: ${c.titulo}`} />
            {!c.conf ? (
              <div className="mt-2">
                <Btn size="sm" disabled={ocupado !== "" || !escrito.trim()} onClick={() => conferir(i)}>
                  <Check size={13} /> {ocupado === i ? "Conferindo…" : "Conferir"}
                </Btn>
              </div>
            ) : (
              <div className="mt-3" data-teste="conferencia">
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                  {c.pontos.map((p, k) => {
                    const s = c.conf.status[k];
                    const corS = s === "lembrou" ? T.ok : s === "parcial" ? "var(--warn)" : "#E2683C";
                    return (
                      <li key={k} className="flex items-start gap-2" style={{ marginTop: 5, fontSize: 14, lineHeight: 1.5 }}>
                        <span style={{ color: corS, fontWeight: 800, width: 16, flexShrink: 0 }} aria-label={s}>
                          {s === "lembrou" ? "✓" : s === "parcial" ? "◐" : "✗"}
                        </span>
                        <span style={{ color: s === "lembrou" ? T.dim : corS }}>
                          {p.texto}{p.complemento ? <i style={{ opacity: 0.75 }}> (complemento da IA)</i> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {c.conf.erros.length ? (
                  <div className="mt-2 rounded-lg px-3 py-2" style={{ background: soft("var(--bad)", 10), border: `1px solid ${soft("var(--bad)", 30)}` }}>
                    <Mini style={{ fontWeight: 700, color: T.bad }}>Você escreveu errado</Mini>
                    {c.conf.erros.map((x, k) => (
                      <div key={k} style={{ fontSize: 13.5, marginTop: 4, color: T.ink, lineHeight: 1.5 }}>
                        <s style={{ color: T.dim }}>{x.trecho}</s> → <b>{x.correcao}</b>
                      </div>
                    ))}
                  </div>
                ) : null}
                {c.conf.comentario ? <Mini style={{ marginTop: 8, lineHeight: 1.6 }}>{c.conf.comentario}</Mini> : null}
                <div className="mt-2">
                  <Btn size="sm" tone="outline" onClick={() => {
                    setRascunho((r) => ({ ...r, [i]: "" }));
                    gravar((f) => ({ ...f, caixas: f.caixas.map((x, k) => (k === i ? { ...x, escrito: "", conf: null } : x)) }));
                  }}>refazer esta caixa</Btn>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex gap-2 flex-wrap">
        {!todas ? (
          <Btn size="sm" tone="primary" disabled={ocupado !== ""} onClick={conferirTodas}>
            <Check size={13} /> {ocupado === "todas" ? "Conferindo…" : "Conferir todas as escritas"}
          </Btn>
        ) : null}
        {folha.caixas.some((c) => c.conf) ? (
          <>
            <Btn size="sm" onClick={levarParaAnotacao}><NotebookPen size={13} /> Levar para a anotação</Btn>
            <Btn size="sm" disabled={ocupado !== ""} onClick={faltasEmCartoes}>
              <Layers size={13} /> {ocupado === "cartoes" ? "Gerando…" : "O que faltou vira cartão"}
            </Btn>
          </>
        ) : null}
        <Btn size="sm" tone="outline" onClick={refazer}>refazer a folha</Btn>
        <Btn size="sm" tone="outline" disabled={ocupado !== ""} onClick={montar}>{ocupado === "montar" ? "Montando…" : "montar de novo"}</Btn>
        <Btn size="sm" tone="outline" onClick={apagar}><Trash2 size={13} /> apagar</Btn>
      </div>
      <Mini style={{ lineHeight: 1.6 }}>
        Refaça a folha nas revisões de 24 horas, 7 e 30 dias: o número de cima mostra se ela está ficando mais cheia.
      </Mini>
    </div>
  );
}
