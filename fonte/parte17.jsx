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

/* As 4 pastas grandes que já existem na aba Cartões, uma por área do
   currículo — GO e Preventiva dividem a mesma, como já é feito lá. Os
   flashcards gerados a partir de uma anotação caem direto numa destas, sem
   perguntar: a área da aula já diz qual é, sem ambiguidade nenhuma. */
const PASTA_POR_AREA_NOTA = { CI: "CIRURGIA", CL: "CLINICA MÉDICA", PE: "PEDIATRIA", GO: "GO E PREVENTIVA", PR: "GO E PREVENTIVA" };

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

function AnotacaoMateria({ subjectId, area, titulo, anotacao, salvarAnotacao, notify, setData, nuvem }) {
  const [aberto, setAberto] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [corAberta, setCorAberta] = useState(false);
  const [grifoAberto, setGrifoAberto] = useState(false);
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
      const jaTem = img.getAttribute("data-nome");
      const src = img.getAttribute("src") || "";
      if (!jaTem && src.startsWith("data:")) {
        const nome = `nota-${uid()}`;
        try { await guardarMidia(nome, src); img.setAttribute("data-nome", nome); }
        catch (e) { /* não deu para guardar agora; tenta de novo no próximo salvamento */ }
      }
    }
    const clone = raiz.cloneNode(true);
    clone.querySelectorAll("img").forEach((img) => img.removeAttribute("src"));
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
    setCorAberta(false); setGrifoAberto(false);
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
    /* Uma anotação só com imagem, sem texto nenhum, ainda é uma anotação de
       verdade — sem o "ou <img" aqui, ela reaparecia como "sem anotação". */
    const temTexto = !!(anotacao && anotacao.html
      && (anotacao.html.replace(/<[^>]+>/g, "").trim() || /<img[\s/]/i.test(anotacao.html)));
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

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Label>Anotação</Label>
        <div className="flex items-center gap-2">
          {sujo ? <Mini>salvando…</Mini> : null}
          <Btn size="sm" tone="outline" onClick={() => setAberto(false)}>fechar</Btn>
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
        <BotaoFerramenta icon={<Palette size={15} />} title="Cor da letra" ativo={corAberta}
          onClick={() => { setCorAberta((v) => !v); setGrifoAberto(false); }} />
        <BotaoFerramenta icon={<Highlighter size={15} />} title="Grifar" ativo={grifoAberto}
          onClick={() => { setGrifoAberto((v) => !v); setCorAberta(false); }} />
        <span style={{ width: 1, height: 20, background: T.line, margin: "0 2px" }} />
        <BotaoFerramenta icon={<ImagePlus size={15} />} title="Inserir imagem"
          onClick={() => arquivoRef.current && arquivoRef.current.click()} />
        <input ref={arquivoRef} type="file" accept="image/*" onChange={inserirImagem} style={{ display: "none" }} />

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
        style={{
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
    </div>
  );
}
