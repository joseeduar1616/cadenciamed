/* ═══════════════════════════════════════════════════════════════════
   31 · ANOTAÇÕES POR MATÉRIA
   Um editor de texto rico por aula, guardado em data.anotacoes[id]. Usa
   contentEditable com document.execCommand: obsoleto na especificação, mas
   ainda funciona em todo navegador atual, e evita trazer uma biblioteca de
   editor inteira só para negrito, itálico, sublinhado, alinhamento, cor e
   grifo — o que foi pedido aqui é bem mais simples que um Word completo.

   As imagens não moram no HTML guardado: ficam no mesmo IndexedDB dos
   cartões e do Anki (guardarMidia/lerMidia, parte13.jsx), e o HTML salvo
   guarda só um data-nome apontando para elas. Sem isso, cada imagem colada
   ficaria em base64 dentro de data.anotacoes, e isso sincroniza com a nuvem
   e passa pelo localStorage — algumas fotos de caderno já eram capazes de
   estourar os dois.
   ═══════════════════════════════════════════════════════════════════ */

const CORES_TEXTO_NOTA = ["#1a1a1a", "#B23B3B", "#2E7D32", "#1565C0", "#6A1B9A", "#E65100", "#FFFFFF"];
const CORES_GRIFO_NOTA = ["#FFF59D", "#A5D6A7", "#90CAF9", "#F48FB1", "#FFCC80"];

/* Tamanho de fonte do trecho selecionado. document.execCommand("fontSize")
   só aceita os 7 tamanhos históricos do HTML (1 a 7), então o truque de
   sempre é pedir o maior (7) e depois trocar cada <font size="7"> criado
   pelo px exato que a pessoa escolheu — aplicarTamanhoFonte, abaixo. */
const TAMANHOS_FONTE_NOTA = [
  { id: "pq", nome: "Pequena", px: 12 },
  { id: "normal", nome: "Normal", px: 14.5 },
  { id: "grande", nome: "Grande", px: 18 },
  { id: "enorme", nome: "Enorme", px: 24 },
];

/* As 4 pastas grandes que já existem na aba Cartões, uma por área do
   currículo — GO e Preventiva dividem a mesma, como já é feito lá. Os
   flashcards gerados a partir de uma anotação caem direto numa destas, sem
   perguntar: a área da aula já diz qual é, sem ambiguidade nenhuma. */
const PASTA_POR_AREA_NOTA = { CI: "CIRURGIA", CL: "CLINICA MÉDICA", PE: "PEDIATRIA", GO: "GO E PREVENTIVA", PR: "GO E PREVENTIVA" };

/* Uma anotação só com imagem, sem texto nenhum, ainda é uma anotação de
   verdade — sem o "ou <img" aqui, ela reaparecia como "sem anotação". Usada
   tanto pelo botão de abrir (aqui embaixo) quanto pelo indicador na linha
   fechada da matéria (SubjectRow, parte6.jsx). */
function temAnotacao(anotacao) {
  return !!(anotacao && anotacao.html
    && (anotacao.html.replace(/<[^>]+>/g, "").trim() || /<img[\s/]/i.test(anotacao.html)));
}

/* ── exportar em Word e em PDF ──────────────────────────────────────────
 *
 * Word: nenhuma biblioteca. Um .doc de verdade (OOXML) é um zip de XML, e
 * não vale a complicação para uma anotação. Em vez disso, HTML com os
 * namespaces do Word (xmlns:w) e extensão .doc — o Word abre pelo
 * conteúdo, não pela extensão, e preserva negrito, cor, alinhamento etc.,
 * porque é HTML de verdade com estilo inline. Truque antigo e ainda válido.
 *
 * PDF: aqui sim entra biblioteca (jsPDF + html2canvas, via CDN, carregadas
 * só quando a pessoa pede). Sem elas, um PDF de verdade exigiria escrever
 * o layout de texto rico (negrito, cor, grifo, alinhamento, imagem) à mão
 * com a API de desenho do jsPDF — muito código para algo que a própria
 * biblioteca já resolve tirando uma "foto" do HTML formatado.
 */
const JSPDF_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const HTML2CANVAS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";

let jsPdfPromessa = null;
function carregarJsPdf() {
  if (jsPdfPromessa) return jsPdfPromessa;
  jsPdfPromessa = (async () => {
    if (!window.jspdf) {
      try { await baixarScript(JSPDF_CDN); }
      catch (e) { throw new Error("Não consegui carregar o gerador de PDF. Confira sua conexão."); }
    }
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("O gerador de PDF não iniciou.");
    return window.jspdf.jsPDF;
  })();
  return jsPdfPromessa;
}

let html2canvasPromessa = null;
function carregarHtml2Canvas() {
  if (html2canvasPromessa) return html2canvasPromessa;
  html2canvasPromessa = (async () => {
    if (!window.html2canvas) {
      try { await baixarScript(HTML2CANVAS_CDN); }
      catch (e) { throw new Error("Não consegui carregar o desenhador de PDF. Confira sua conexão."); }
    }
    if (!window.html2canvas) throw new Error("O desenhador de PDF não iniciou.");
    return window.html2canvas;
  })();
  return html2canvasPromessa;
}

function escaparHtml(s) {
  const d = document.createElement("div");
  d.textContent = String(s || "");
  return d.innerHTML;
}

function notaParaWordBlob(tituloAula, htmlCorpo) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escaparHtml(tituloAula)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt;color:#1a1a1a}</style></head>
<body><h2>${escaparHtml(tituloAula)}</h2>${htmlCorpo}</body></html>`;
  return new Blob([html], { type: "application/msword" });
}

async function notaParaPdfBlob(tituloAula, htmlCorpo) {
  const JsPDF = await carregarJsPdf();
  const html2canvas = await carregarHtml2Canvas();
  const container = document.createElement("div");
  /* Nada de "left:-9999px": um elemento em coordenada negativa nunca chega
     a ser pintado em lugar nenhum (a página começa em 0,0; não dá para
     rolar para antes disso), e o html2canvas só consegue capturar o que
     foi de fato pintado — o resultado era sempre um PDF em branco. Fica
     dentro da área visível (0,0), na frente de tudo por um instante (por
     isso o z-index gigante), o que é um preço bem menor que o PDF nunca
     sair certo. */
  container.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;width:700px;padding:0;background:#fff;color:#111;"
    + "font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;pointer-events:none;";
  container.innerHTML = `<h2 style="margin:0 0 14px">${escaparHtml(tituloAula)}</h2>${htmlCorpo}`;
  document.body.appendChild(container);
  try {
    const doc = new JsPDF({ unit: "pt", format: "a4" });
    await new Promise((resolve, reject) => {
      try {
        doc.html(container, {
          callback: () => resolve(),
          html2canvas: { scale: 1.6, backgroundColor: "#ffffff", useCORS: true, windowWidth: 700 },
          x: 30, y: 30, width: 535, windowWidth: 700,
        });
      } catch (e) { reject(e); }
    });
    return doc.output("blob");
  } finally {
    document.body.removeChild(container);
  }
}

function baixarBlob(nome, blob) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) { return false; }
}

/* Tira script, iframe e atributos de evento (onerror, onclick...) de HTML
   colado de fora. A nota é só do próprio dono e nunca é mostrada para outra
   pessoa (nem o mentor a alcança — ver worker/api/mentor.js), mas colar um
   trecho de uma página maliciosa não pode virar código rodando na conta de
   quem colou. */
function limparHtmlColado(html) {
  const div = document.createElement("div");
  div.innerHTML = String(html || "");
  for (const tag of ["script", "style", "iframe", "object", "embed", "link", "meta"]) {
    div.querySelectorAll(tag).forEach((el) => el.remove());
  }
  div.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const nome = attr.name.toLowerCase();
      if (nome.startsWith("on")) { el.removeAttribute(attr.name); continue; }
      if ((nome === "href" || nome === "src") && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return div.innerHTML;
}

function BotaoFerramenta({ icon, ativo, title, onClick }) {
  return (
    <button type="button" title={title} aria-label={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className="flex items-center justify-center rounded-lg"
      style={{
        width: 30, height: 30, cursor: "pointer",
        background: ativo ? soft("var(--neon)", 20) : "transparent",
        border: `1px solid ${ativo ? soft("var(--neon)", 40) : "transparent"}`,
        color: ativo ? "var(--neon)" : T.dim,
      }}>
      {icon}
    </button>
  );
}

function TiraDeCores({ cores, onEscolher, comBranco }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {cores.map((c) => (
        <button key={c} type="button" title={c} aria-label={c}
          onMouseDown={(e) => { e.preventDefault(); onEscolher(c); }}
          className="rounded-full"
          style={{
            width: 22, height: 22, background: c, cursor: "pointer",
            border: c.toUpperCase() === "#FFFFFF" || comBranco ? `1px solid ${T.line}` : "none",
          }} />
      ))}
    </div>
  );
}

/* Escolher a pasta do Drive: navega por pastas (a "raiz" aqui é sempre "Meu
   Drive", nunca o Drive inteiro — drive.file só alcança o que este app criou
   ou que a pessoa escolheu através dele), pode criar uma pasta nova, e
   envia a exportação (Word ou PDF) para onde a pessoa escolher. Sem
   createPortal o modal fica preso dentro da .rise que anima a troca de
   aba, que vira um "containing block" para position:fixed — o mesmo motivo
   pelo qual o estudo de cartões em tela cheia usa portal (parte12.jsx). */
function ModalDrive({ tituloAula, gerarBlob, sugestaoNome, notify, onFechar }) {
  const drive = useGoogleDrive();
  const [caminho, setCaminho] = useState([{ id: "root", nome: "Meu Drive" }]);
  const [pastas, setPastas] = useState(null);
  const [novaPasta, setNovaPasta] = useState("");
  const [formato, setFormato] = useState("pdf");
  const [enviando, setEnviando] = useState(false);
  const pastaAtual = caminho[caminho.length - 1];

  const carregar = async (id) => setPastas(await drive.listarPastas(id));

  useEffect(() => {
    if (drive.conectado) carregar(pastaAtual.id);
  }, [drive.conectado]);

  const conectar = async () => { if (await drive.conectar()) carregar(pastaAtual.id); };
  const entrar = (p) => { const novo = [...caminho, { id: p.id, nome: p.name }]; setCaminho(novo); carregar(p.id); };
  const voltarPara = (i) => { const novo = caminho.slice(0, i + 1); setCaminho(novo); carregar(novo[novo.length - 1].id); };
  const criar = async () => {
    const nome = novaPasta.trim();
    if (!nome) return;
    const p = await drive.criarPasta(nome, pastaAtual.id);
    if (p) { setNovaPasta(""); carregar(pastaAtual.id); }
  };

  const enviar = async () => {
    setEnviando(true);
    const blob = await gerarBlob(formato);
    if (!blob) { setEnviando(false); notify("Não consegui preparar o arquivo para enviar."); return; }
    const nome = `${sugestaoNome}.${formato === "pdf" ? "pdf" : "doc"}`;
    const mime = formato === "pdf" ? "application/pdf" : "application/msword";
    /* enviarArquivo devolve { ok, erro } sempre (nunca lança), então o
       resultado aqui é sempre o que de fato aconteceu — não o estado
       "erro" de um render antigo, que já ficou parado sem mostrar nada
       quando o envio falhava. */
    const r = await drive.enviarArquivo(nome, mime, blob, pastaAtual.id);
    setEnviando(false);
    if (r && r.ok) { notify(`Enviado para "${pastaAtual.nome}" no seu Google Drive.`); onFechar(); }
    else notify((r && r.erro) || "Não consegui enviar para o Drive.");
  };

  return createPortal((
    <div className="fixed flex items-center justify-center px-4"
      style={{ inset: 0, zIndex: 75, background: soft("var(--bg)", 82), backdropFilter: "blur(6px)" }}
      onClick={onFechar}>
      <Card className="px-6 py-6 w-full" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <H color="var(--neon2)" icon={<FolderInput size={16} />}>Enviar para o Drive</H>
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="flex items-center justify-center rounded-full" style={{ width: 28, height: 28, color: T.faint, background: "none", border: "none", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>

        {!drive.disponivel ? (
          <Texto style={{ marginTop: 12 }}>O login do Google não está configurado neste site.</Texto>
        ) : !drive.conectado ? (
          <div className="mt-4">
            <Texto>Escolha uma pasta no seu Google Drive para guardar "{tituloAula}".</Texto>
            <Btn tone="primary" className="mt-4" disabled={drive.ocupado} onClick={conectar}>
              {drive.ocupado ? "Conectando…" : "Conectar ao Google Drive"}
            </Btn>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-1 flex-wrap" style={{ fontSize: 13 }}>
              {caminho.map((p, i) => (
                <span key={p.id} className="flex items-center gap-1">
                  {i > 0 ? <ChevronRight size={12} style={{ color: T.faint }} /> : null}
                  <button type="button" onClick={() => voltarPara(i)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: i === caminho.length - 1 ? T.ink : T.dim, fontWeight: i === caminho.length - 1 ? 700 : 500 }}>
                    {p.nome}
                  </button>
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-1" style={{ maxHeight: 220, overflowY: "auto" }}>
              {pastas === null ? <Mini>carregando…</Mini> : pastas.length === 0 ? <Mini>nenhuma subpasta aqui</Mini> : pastas.map((p) => (
                <button key={p.id} type="button" onClick={() => entrar(p)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2"
                  style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <Folder size={15} style={{ color: T.faint, flexShrink: 0 }} />
                  <span style={{ fontSize: 13.5, color: T.ink }}>{p.name}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <TextInput value={novaPasta} placeholder="nova pasta aqui dentro"
                onChange={(e) => setNovaPasta(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") criar(); }}
                style={{ padding: "6px 10px", fontSize: 13 }} />
              <Btn size="sm" tone="outline" onClick={criar}><FolderPlus size={14} /></Btn>
            </div>

            <div className="flex items-center gap-2 pt-2" style={{ borderTop: `1px solid ${T.line}` }}>
              {[["pdf", "PDF"], ["doc", "Word"]].map(([id, lb]) => (
                <button key={id} type="button" onClick={() => setFormato(id)}
                  className="rounded-full px-3.5 py-1.5"
                  style={{
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    background: formato === id ? soft("var(--neon2)", 20) : T.card2,
                    color: formato === id ? "var(--neon2)" : T.dim,
                    border: `1px solid ${formato === id ? soft("var(--neon2)", 40) : T.line}`,
                  }}>{lb}</button>
              ))}
            </div>

            <Btn tone="primary" disabled={enviando} onClick={enviar}>
              {enviando ? "Enviando…" : `Enviar aqui: "${pastaAtual.nome}"`}
            </Btn>
          </div>
        )}
        {drive.erro ? <Label style={{ marginTop: 12, color: T.bad, textTransform: "none", letterSpacing: 0, fontSize: 14 }}>{drive.erro}</Label> : null}
      </Card>
    </div>
  ), document.body);
}

function AnotacaoMateria({ subjectId, area, titulo, anotacao, salvarAnotacao, notify, setData, nuvem }) {
  const [aberto, setAberto] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [corAberta, setCorAberta] = useState(false);
  const [grifoAberto, setGrifoAberto] = useState(false);
  const [tamanhoAberto, setTamanhoAberto] = useState(false);
  const [cheia, setCheia] = useState(false);
  const [gerando, setGerando] = useState(false);
  const editorRef = useRef(null);
  const salvarRef = useRef(null);
  const arquivoRef = useRef(null);

  /* Manda o texto puro da anotação (sem marcação, as imagens não ajudam a
     IA a escrever pergunta e resposta) para a mesma rota que já monta
     flashcard a partir de PDF/Word — mesmas regras de estilo (negrito no
     que decide a resposta, achado→diagnóstico, "se a prova disser"...),
     então gerar a partir de uma anotação não precisa de instrução própria. */
  const gerarFlashcards = async () => {
    const texto = (editorRef.current && editorRef.current.innerText || "").trim();
    if (!texto) { notify("Escreva alguma coisa na anotação antes de gerar cartões."); return; }
    setGerando(true);
    const { dados, erro: falha } = await gerarFlashcardsComIA({ texto, baralho: titulo, cobrirTudo: false, nuvem });
    setGerando(false);
    if (falha) { notify(falha); return; }
    if (!dados || !Array.isArray(dados.cartoes) || dados.cartoes.length === 0) {
      notify("A IA não conseguiu montar cartões a partir dessa anotação.");
      return;
    }
    const pasta = PASTA_POR_AREA_NOTA[area] || PASTA_SOLTA;
    const novos = dados.cartoes.map((c) => novoCartao(c.frente, c.verso, subjectId, titulo, pasta));
    setData((p) => ({ ...p, flash: [...novos, ...(p.flash || [])], pastas: registrarPasta(p.pastas, pasta) }));
    notify(`${novos.length} cartõe${novos.length === 1 ? "" : "s"} gerado${novos.length === 1 ? "" : "s"} em "${pasta}".`
      + (dados.cortado ? " O texto era grande e foi cortado antes do fim." : ""));
  };

  const [baixando, setBaixando] = useState("");    // "" | "doc" | "pdf"
  const [modalDrive, setModalDrive] = useState(false);
  const nomeArquivo = (titulo || "anotacao").trim().slice(0, 60).replace(/[\\/:*?"<>|]+/g, "-") || "anotacao";

  const conteudoAtual = () => (editorRef.current ? editorRef.current.innerHTML : "");

  const baixarDoc = () => {
    if (!conteudoAtual().trim()) { notify("Escreva alguma coisa antes de baixar."); return; }
    baixarBlob(`${nomeArquivo}.doc`, notaParaWordBlob(titulo, conteudoAtual()));
  };

  const baixarPdf = async () => {
    if (!conteudoAtual().trim()) { notify("Escreva alguma coisa antes de baixar."); return; }
    setBaixando("pdf");
    try {
      const blob = await notaParaPdfBlob(titulo, conteudoAtual());
      baixarBlob(`${nomeArquivo}.pdf`, blob);
    } catch (e) { notify((e && e.message) || "Não consegui gerar o PDF."); }
    finally { setBaixando(""); }
  };

  const gerarParaDrive = async (formato) => {
    const html = conteudoAtual();
    if (!html.trim()) return null;
    try { return formato === "pdf" ? await notaParaPdfBlob(titulo, html) : notaParaWordBlob(titulo, html); }
    catch (e) { return null; }
  };

  useEffect(() => {
    if (!aberto) return undefined;
    let vivo = true;
    (async () => {
      const raiz = editorRef.current;
      if (!raiz) return;
      raiz.innerHTML = (anotacao && anotacao.html) || "";
      const imgs = [...raiz.querySelectorAll("img[data-nome]")];
      for (const img of imgs) {
        try {
          const uri = await lerMidia(img.getAttribute("data-nome"));
          if (vivo && uri) img.src = uri;
        } catch (e) { /* essa imagem sumiu do IndexedDB, segue sem ela */ }
      }
      if (vivo) setPronto(true);
    })();
    return () => { vivo = false; if (salvarRef.current) window.clearTimeout(salvarRef.current); };
  }, [aberto]);

  const prepararParaSalvar = async () => {
    const raiz = editorRef.current;
    if (!raiz) return "";
    const imgs = [...raiz.querySelectorAll("img")];
    for (const img of imgs) {
      if (img.getAttribute("data-nome")) continue;   // já guardada antes
      let src = img.getAttribute("src") || "";
      /* Colar um documento (Word, Google Docs, uma página) costuma trazer
         a imagem por um endereço http(s) ou blob:, não em base64 — tenta
         trazer para dentro do IndexedDB do mesmo jeito que uma imagem
         escolhida por upload, para não depender do site de origem
         continuar no ar (e blob: nem sobrevive a um recarregar da
         página). Falhando (CORS bloqueado, por exemplo), segue com o
         endereço original abaixo, em vez de simplesmente apagar. */
      if (/^(https?:|blob:)/i.test(src)) {
        try {
          const resp = await fetch(src);
          const blob = await resp.blob();
          src = await new Promise((resolve, reject) => {
            const rd = new FileReader();
            rd.onload = () => resolve(String(rd.result || ""));
            rd.onerror = () => reject(new Error("leitura falhou"));
            rd.readAsDataURL(blob);
          });
        } catch (e) { /* fica com o endereço original, guardado abaixo */ }
      }
      if (src.startsWith("data:")) {
        const nome = `nota-${uid()}`;
        try { await guardarMidia(nome, src); img.setAttribute("data-nome", nome); }
        catch (e) { /* não deu para guardar agora; tenta de novo no próximo salvamento */ }
      } else if (src !== img.getAttribute("src")) {
        img.setAttribute("src", src);
      }
    }
    const clone = raiz.cloneNode(true);
    /* só tira o src de quem tem data-nome — é a única garantia de que a
       imagem volta ao reabrir (lerMidia, no efeito acima). Uma imagem que
       não virou data-nome (endereço externo que não deu para trazer para
       cá) mantém o src: apagar o dela também jogaria a imagem fora à toa. */
    clone.querySelectorAll("img[data-nome]").forEach((img) => img.removeAttribute("src"));
    return clone.innerHTML;
  };

  const aoMudar = () => {
    setSujo(true);
    if (salvarRef.current) window.clearTimeout(salvarRef.current);
    salvarRef.current = window.setTimeout(async () => {
      const html = await prepararParaSalvar();
      salvarAnotacao(subjectId, html);
      setSujo(false);
    }, 1200);
  };

  const cmd = (nome, valor) => {
    if (editorRef.current) editorRef.current.focus();
    document.execCommand(nome, false, valor);
    setCorAberta(false); setGrifoAberto(false); setTamanhoAberto(false);
    aoMudar();
  };

  /* document.execCommand("fontSize") só aceita os 7 tamanhos históricos do
     HTML (1 a 7, cada um um <font size="N">), sem controle de px — o
     truque de sempre é pedir sempre o maior (7, o único improvável de já
     estar em uso no texto) e depois trocar cada <font size="7"> criado
     pelo tamanho exato escolhido, como span com font-size em px. */
  const aplicarTamanho = (px) => {
    if (editorRef.current) editorRef.current.focus();
    document.execCommand("fontSize", false, "7");
    const raiz = editorRef.current;
    if (raiz) {
      raiz.querySelectorAll('font[size="7"]').forEach((el) => {
        el.removeAttribute("size");
        el.style.fontSize = `${px}px`;
      });
    }
    setCorAberta(false); setGrifoAberto(false); setTamanhoAberto(false);
    aoMudar();
  };

  const aoColar = (e) => {
    const html = e.clipboardData && e.clipboardData.getData("text/html");
    if (!html) return;   // sem HTML: deixa colar como texto puro, do jeito padrão
    e.preventDefault();
    document.execCommand("insertHTML", false, limparHtmlColado(html));
    aoMudar();
  };

  const inserirImagem = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\//.test(f.type)) { notify("Escolha um arquivo de imagem."); return; }
    if (f.size > 5 * 1024 * 1024) { notify("Imagem grande demais (máx. 5 MB)."); return; }
    const dataUri = await new Promise((resolve, reject) => {
      const rd = new FileReader();
      rd.onload = () => resolve(String(rd.result || ""));
      rd.onerror = () => reject(new Error("leitura falhou"));
      rd.readAsDataURL(f);
    }).catch(() => null);
    if (!dataUri) { notify("Não consegui ler essa imagem."); return; }
    if (editorRef.current) editorRef.current.focus();
    document.execCommand("insertImage", false, dataUri);
    if (editorRef.current) {
      editorRef.current.querySelectorAll("img:not([style])").forEach((img) => {
        img.style.maxWidth = "100%"; img.style.borderRadius = "10px"; img.style.margin = "8px 0";
      });
    }
    aoMudar();
  };

  if (!aberto) {
    const temTexto = temAnotacao(anotacao);
    return (
      <button type="button" onClick={() => setAberto(true)}
        className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 w-full"
        style={{ background: T.card2, border: `1px solid ${T.line}`, cursor: "pointer", textAlign: "left" }}>
        <NotebookPen size={15} style={{ color: temTexto ? "var(--neon)" : T.faint, flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, color: temTexto ? T.ink : T.dim, flex: 1 }}>
          {temTexto ? "Ver ou editar anotação" : "Escrever ou colar uma anotação"}
        </span>
      </button>
    );
  }

  const corpo = (
    <div className="flex flex-col gap-2.5" style={cheia ? { height: "100%" } : undefined}>
      <div className="flex items-center justify-between">
        <Label>Anotação</Label>
        <div className="flex items-center gap-2">
          {sujo ? <Mini>salvando…</Mini> : null}
          <BotaoFerramenta icon={cheia ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            title={cheia ? "Sair da tela cheia" : "Tela cheia"} onClick={() => setCheia((v) => !v)} />
          <Btn size="sm" tone="outline" onClick={() => (cheia ? setCheia(false) : setAberto(false))}>fechar</Btn>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap rounded-xl px-2 py-1.5" style={{ background: T.card2, border: `1px solid ${T.line}`, position: "relative" }}>
        <BotaoFerramenta icon={<Bold size={15} />} title="Negrito" onClick={() => cmd("bold")} />
        <BotaoFerramenta icon={<Italic size={15} />} title="Itálico" onClick={() => cmd("italic")} />
        <BotaoFerramenta icon={<Underline size={15} />} title="Sublinhado" onClick={() => cmd("underline")} />
        <span style={{ width: 1, height: 20, background: T.line, margin: "0 2px" }} />
        <BotaoFerramenta icon={<AlignLeft size={15} />} title="Alinhar à esquerda" onClick={() => cmd("justifyLeft")} />
        <BotaoFerramenta icon={<AlignCenter size={15} />} title="Centralizar" onClick={() => cmd("justifyCenter")} />
        <BotaoFerramenta icon={<AlignRight size={15} />} title="Alinhar à direita" onClick={() => cmd("justifyRight")} />
        <BotaoFerramenta icon={<AlignJustify size={15} />} title="Justificar" onClick={() => cmd("justifyFull")} />
        <span style={{ width: 1, height: 20, background: T.line, margin: "0 2px" }} />
        <BotaoFerramenta icon={<ALargeSmall size={15} />} title="Tamanho da fonte" ativo={tamanhoAberto}
          onClick={() => { setTamanhoAberto((v) => !v); setCorAberta(false); setGrifoAberto(false); }} />
        <BotaoFerramenta icon={<Palette size={15} />} title="Cor da letra" ativo={corAberta}
          onClick={() => { setCorAberta((v) => !v); setGrifoAberto(false); setTamanhoAberto(false); }} />
        <BotaoFerramenta icon={<Highlighter size={15} />} title="Grifar" ativo={grifoAberto}
          onClick={() => { setGrifoAberto((v) => !v); setCorAberta(false); setTamanhoAberto(false); }} />
        <span style={{ width: 1, height: 20, background: T.line, margin: "0 2px" }} />
        <BotaoFerramenta icon={<ImagePlus size={15} />} title="Inserir imagem"
          onClick={() => arquivoRef.current && arquivoRef.current.click()} />
        <input ref={arquivoRef} type="file" accept="image/*" onChange={inserirImagem} style={{ display: "none" }} />

        {tamanhoAberto ? (
          <div className="mt-2 w-full pt-2 flex items-center gap-1.5 flex-wrap" style={{ borderTop: `1px solid ${T.line}` }}>
            {TAMANHOS_FONTE_NOTA.map((t) => (
              <button key={t.id} type="button" onMouseDown={(e) => { e.preventDefault(); aplicarTamanho(t.px); }}
                className="rounded-lg px-2.5 py-1" style={{ background: T.card3, border: `1px solid ${T.line}`, color: T.ink, cursor: "pointer", fontSize: 13 }}>
                <span style={{ fontSize: Math.min(t.px, 18) }}>{t.nome}</span>
              </button>
            ))}
          </div>
        ) : null}
        {corAberta ? (
          <div className="mt-2 w-full pt-2" style={{ borderTop: `1px solid ${T.line}` }}>
            <TiraDeCores cores={CORES_TEXTO_NOTA} comBranco onEscolher={(c) => cmd("foreColor", c)} />
          </div>
        ) : null}
        {grifoAberto ? (
          <div className="mt-2 w-full pt-2" style={{ borderTop: `1px solid ${T.line}` }}>
            <TiraDeCores cores={CORES_GRIFO_NOTA} onEscolher={(c) => cmd("hiliteColor", c)} />
          </div>
        ) : null}
      </div>

      <div ref={editorRef} contentEditable suppressContentEditableWarning
        onInput={aoMudar} onPaste={aoColar}
        className="rounded-xl px-4 py-3"
        style={cheia ? {
          flex: 1, minHeight: 0, overflowY: "auto", fontSize: 14.5, lineHeight: 1.6,
          color: T.ink, background: T.bg, border: `1px solid ${T.line}`, outline: "none",
        } : {
          minHeight: 140, maxHeight: 420, overflowY: "auto", fontSize: 14.5, lineHeight: 1.6,
          color: T.ink, background: T.bg, border: `1px solid ${T.line}`, outline: "none",
        }} />
      {!pronto ? <Mini>carregando…</Mini> : null}

      <div className="flex items-center gap-2 flex-wrap">
        <Btn size="sm" tone="outline" disabled={gerando} onClick={gerarFlashcards}>
          <Sparkles size={14} /> {gerando ? "Gerando…" : "Gerar flashcards com IA"}
        </Btn>
        <Mini>vão para a pasta "{PASTA_POR_AREA_NOTA[area] || PASTA_SOLTA}", em Cartões</Mini>
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-2" style={{ borderTop: `1px solid ${T.line}` }}>
        <Btn size="sm" tone="outline" onClick={baixarDoc}>
          <FileDown size={14} /> Baixar em Word
        </Btn>
        <Btn size="sm" tone="outline" disabled={baixando === "pdf"} onClick={baixarPdf}>
          <FileDown size={14} /> {baixando === "pdf" ? "Gerando…" : "Baixar em PDF"}
        </Btn>
        <Btn size="sm" tone="outline" onClick={() => setModalDrive(true)}>
          <FolderInput size={14} /> Enviar para o Drive
        </Btn>
      </div>

      {modalDrive ? (
        <ModalDrive tituloAula={titulo} sugestaoNome={nomeArquivo} gerarBlob={gerarParaDrive}
          notify={notify} onFechar={() => setModalDrive(false)} />
      ) : null}
    </div>
  );

  /* Igual ao ModalDrive, logo acima: sem createPortal a tela cheia fica
     presa dentro da .rise que anima a troca de aba (containing block para
     position:fixed) — mesmo motivo do estudo de cartões em tela cheia,
     parte12.jsx. */
  if (cheia) {
    return createPortal((
      <div className="fixed flex flex-col px-4 sm:px-8 py-6" style={{ inset: 0, zIndex: 80, background: T.bg }}>
        {corpo}
      </div>
    ), document.body);
  }
  return corpo;
}
