/* ═══════════════════════════════════════════════════════════════════
   44 · ESTUDO INTERATIVO

   A pessoa joga um ou mais materiais (texto colado, PDF, Word, fotos,
   imagens coladas) e a IA monta uma aula em BLOCOS (5 em média), cada um
   com o tempo estimado. Cada bloco é uma sequência de slides interativos,
   com transição, as figuras do próprio material e formatos que prendem a
   atenção: conceito com a frase que fica, pontos revelados um a um,
   esquema animado, tabela comparativa, caso clínico para pensar, quiz
   rápido, a pegadinha de prova e o resumo. Em qualquer slide, "Não
   entendi" pede à IA para explicar de outro jeito, com uma analogia.

   No fim do bloco vem o CHECKPOINT: três perguntas respondidas por escrito
   (conceito ou caso clínico). A IA corrige, diz o que acertou e o que
   faltou, explica, e faz uma pergunta nova só sobre o que faltou. O bloco
   seguinte só abre quando as três estão consolidadas.

   Onde fica cada coisa:
   · data.estudos — o índice das aulas e o progresso de cada bloco (vai
     para a conta, é pequeno).
   · IndexedDB (cadencia-midia) — o material em texto, os slides gerados,
     o andamento do checkpoint e as figuras. É grande, e fica no aparelho.

   Ao terminar um bloco, o tempo vira uma sessão de estudo (entra nas
   horas do dia e no desempenho). No fim da aula, o que a pessoa errou
   pode virar flashcard com um toque.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_ESTUDO = "/api/estudo-ia";
const MAX_ESTUDOS = 30;
const MAX_MATERIAIS = 8;
const MAX_FIGURAS_ESTUDO = 40;
const MAX_TEXTO_ESTUDO = 90000;
const PASTA_ESTUDO = "Estudo interativo";

/* ── o índice, na conta ──────────────────────────────────────────────── */
function limparEstudos(v) {
  const lim = (x, n) => String(x == null ? "" : x).slice(0, n);
  return (Array.isArray(v) ? v : [])
    .filter((e) => e && typeof e === "object" && typeof e.id === "string" && e.id)
    .slice(0, MAX_ESTUDOS)
    .map((e) => ({
      id: lim(e.id, 40),
      titulo: lim(e.titulo, 120) || "Aula sem título",
      resumo: lim(e.resumo, 400),
      criadoEm: Number(e.criadoEm) || 0,
      abertoEm: Number(e.abertoEm) || 0,
      materiais: (Array.isArray(e.materiais) ? e.materiais : []).map((m) => lim(m, 80)).slice(0, MAX_MATERIAIS),
      blocos: (Array.isArray(e.blocos) ? e.blocos : []).slice(0, 9).map((b) => ({
        titulo: lim(b && b.titulo, 90),
        objetivo: lim(b && b.objetivo, 220),
        minutos: Math.max(1, Math.min(60, Math.round(Number(b && b.minutos) || 10))),
        topicos: (Array.isArray(b && b.topicos) ? b.topicos : []).map((t) => lim(t, 90)).slice(0, 8),
        figuras: (Array.isArray(b && b.figuras) ? b.figuras : []).filter((f) => /^F\d{1,3}$/.test(String(f))).slice(0, 10),
        feito: !!(b && b.feito),
        dePrimeira: Math.max(0, Math.min(3, Math.round(Number(b && b.dePrimeira) || 0))),
        segundos: Math.max(0, Math.round(Number(b && b.segundos) || 0)),
      })),
    }));
}

const blocoLiberado = (estudo, i) => i === 0 || !!(estudo.blocos[i - 1] && estudo.blocos[i - 1].feito);
const minutosDaAula = (estudo) => estudo.blocos.reduce((t, b) => t + b.minutos, 0);
const blocosFeitos = (estudo) => estudo.blocos.filter((b) => b.feito).length;

/* ── o conteúdo, no aparelho ─────────────────────────────────────────── *
 * Lido e gravado direto no banco, sem o cache das figuras (lerMidia): o
 * documento da aula muda a cada resposta, e o cache devolveria a versão
 * velha. As figuras não mudam nunca, então elas usam o cache. */
const chaveDoEstudo = (id) => `estudo:${id}`;
const chaveDaFigura = (id, fig) => `estudo:${id}:${fig}`;

async function lerDocEstudo(id) {
  try {
    const bd = await abrirBD();
    const v = await new Promise((ok, falha) => {
      const tx = bd.transaction(BD_LOJA, "readonly");
      const r = tx.objectStore(BD_LOJA).get(chaveDoEstudo(id));
      r.onsuccess = () => ok(r.result || null);
      r.onerror = () => falha(r.error);
    });
    bd.close();
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}

async function gravarDocEstudo(id, doc) {
  await guardarMidia(chaveDoEstudo(id), JSON.stringify(doc));
}

/* Toda mudança no documento da aula passa por esta fila: lê o que está
   gravado, muda e grava, uma de cada vez. Sem ela, o bloco seguinte que
   chegava da IA em segundo plano e o andamento do checkpoint gravavam ao
   mesmo tempo, cada um por cima da versão que tinha lido, e um apagava o
   outro: sumia o bloco já montado, ou a lista do que a pessoa errou. */
const filasDoEstudo = {};
function mudarDocEstudo(id, mudar) {
  const anterior = filasDoEstudo[id] || Promise.resolve();
  const proxima = anterior.catch(() => {}).then(async () => {
    const atual = await lerDocEstudo(id);
    if (!atual) return null;
    const novo = mudar(atual);
    if (novo && novo !== atual) await gravarDocEstudo(id, novo);
    return novo;
  });
  filasDoEstudo[id] = proxima;
  return proxima;
}

async function apagarDocEstudo(id, figuras) {
  try {
    const bd = await abrirBD();
    await new Promise((ok) => {
      const tx = bd.transaction(BD_LOJA, "readwrite");
      const loja = tx.objectStore(BD_LOJA);
      loja.delete(chaveDoEstudo(id));
      for (const f of figuras || []) loja.delete(chaveDaFigura(id, f));
      tx.oncomplete = () => ok(true);
      tx.onerror = () => ok(false);
    });
    bd.close();
  } catch (e) { /* o índice sai mesmo assim */ }
}

async function falarComEstudo(nuvem, corpo) {
  const token = await pegarTokenDaConta(nuvem);
  if (!token) return { erro: "Entre na sua conta para usar o estudo interativo." };
  const { dados, erro } = await chamarApi(ROTA_ESTUDO, { ...corpo, token }, "O estudo interativo");
  return erro ? { erro } : (dados || {});
}

/* ── ler os materiais ────────────────────────────────────────────────── */
function fotoParaFigura(arquivo) {
  return reduzirFoto(arquivo).then((f) => `data:${f.tipo};base64,${f.dados}`);
}

/* Um arquivo vira { nome, texto, figuras: [{ dados, pagina, contexto }] }.
   Foto do material entra duas vezes, e de propósito: o texto dela (lido
   pela IA) vira conteúdo da aula, e a própria foto vira figura dos slides. */
async function lerMaterial(arquivos, nuvem, aviso) {
  const fotos = arquivos.filter((f) => /^image\//i.test(f.type));
  if (fotos.length) {
    const textos = [];
    const figuras = [];
    for (let i = 0; i < fotos.length; i += MAX_FOTOS) {
      const lote = fotos.slice(i, i + MAX_FOTOS);
      const r = await lerFotosComIA(nuvem, lote, aviso);
      if (r.erro) throw new Error(r.erro);
      textos.push(String(r.texto || ""));
    }
    for (let i = 0; i < fotos.length && figuras.length < MAX_FIGURAS_ESTUDO; i++) {
      aviso(`guardando a foto ${i + 1} como figura`);
      figuras.push({ dados: await fotoParaFigura(fotos[i]), pagina: i + 1, contexto: `Foto ${i + 1} do material` });
    }
    const nome = fotos.length === 1 ? fotos[0].name : `${fotos.length} fotos`;
    return [{ nome, texto: textos.join("\n\n"), figuras }];
  }
  const saida = [];
  for (const f of arquivos) {
    let lido;
    if (/\.pdf$/i.test(f.name)) lido = await lerPdfComFiguras(f, aviso);
    else if (/\.docx$/i.test(f.name)) lido = await lerDocxComFiguras(f, aviso);
    else if (/\.pptx$/i.test(f.name)) lido = await lerPptxComFiguras(f, aviso);
    else lido = { texto: await lerArquivoParaTexto(f, aviso), figuras: [] };
    saida.push({ nome: f.name, texto: String(lido.texto || ""), figuras: (lido.figuras || []).map(({ dados, pagina, contexto }) => ({ dados, pagina, contexto })) });
  }
  return saida;
}

/* Os materiais num texto só, com as figuras renumeradas de F1 em diante. */
function juntarMateriais(materiais) {
  const figuras = [];
  const partes = materiais.map((m, i) => {
    for (const f of m.figuras || []) {
      if (figuras.length >= MAX_FIGURAS_ESTUDO) break;
      figuras.push({ ...f, id: `F${figuras.length + 1}`, material: m.nome });
    }
    return `=== Material ${i + 1}: ${m.nome} ===\n${String(m.texto || "").trim()}`;
  });
  return { texto: partes.join("\n\n").slice(0, MAX_TEXTO_ESTUDO), figuras };
}

/* ── a aba ───────────────────────────────────────────────────────────── */
function EstudoInterativo({ data, setData, nuvem, notify }) {
  const estudos = data.estudos || [];
  const [aberto, setAberto] = useState(null);       // id da aula
  const [bloco, setBloco] = useState(null);         // índice do bloco em estudo
  const [criando, setCriando] = useState(!estudos.length);
  const [cheia, setCheia] = useState(false);
  const estudo = estudos.find((e) => e.id === aberto) || null;

  const atualizar = useCallback((id, mudar) => {
    setData((p) => ({ ...p, estudos: (p.estudos || []).map((e) => (e.id === id ? mudar(e) : e)) }));
  }, [setData]);

  const abrir = (id) => {
    setAberto(id); setBloco(null); setCriando(false);
    atualizar(id, (e) => ({ ...e, abertoEm: Date.now() }));
  };

  const apagar = async (e) => {
    if (!window.confirm(`Apagar a aula "${e.titulo}"? O progresso e as figuras saem deste aparelho.`)) return;
    await apagarDocEstudo(e.id, e.blocos.flatMap((b) => b.figuras));
    setData((p) => ({ ...p, estudos: (p.estudos || []).filter((x) => x.id !== e.id) }));
    setAberto(null); setBloco(null);
    notify("Aula apagada.");
  };

  if (estudo && bloco !== null) {
    return (
      <EstudoDoBloco key={`${estudo.id}-${bloco}`} estudo={estudo} indice={bloco} nuvem={nuvem} notify={notify}
        setData={setData} atualizar={atualizar} cheia={cheia} setCheia={setCheia}
        onSair={() => { setCheia(false); setBloco(null); }}
        onProximo={() => setBloco(bloco + 1 < estudo.blocos.length ? bloco + 1 : null)} />
    );
  }
  if (estudo) {
    return <PainelDaAula estudo={estudo} onVoltar={() => setAberto(null)} onBloco={setBloco}
      onApagar={() => apagar(estudo)} setData={setData} notify={notify} />;
  }
  return (
    <div className="flex flex-col gap-5" data-teste="estudo-interativo">
      {criando || !estudos.length ? (
        <CriarEstudo nuvem={nuvem} notify={notify} setData={setData}
          onPronto={(id) => abrir(id)} onCancelar={estudos.length ? () => setCriando(false) : null} />
      ) : (
        <button type="button" onClick={() => setCriando(true)} data-teste="estudo-novo"
          className="btn-neon" style={{ alignSelf: "flex-start", padding: "11px 20px", borderRadius: 99, fontWeight: 700, fontSize: 15, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Plus size={16} /> Nova aula interativa
        </button>
      )}
      {estudos.length ? (
        <div className="flex flex-col gap-3">
          <Label>Suas aulas</Label>
          {[...estudos].sort((a, b) => (b.abertoEm || b.criadoEm) - (a.abertoEm || a.criadoEm)).map((e) => {
            const feitos = blocosFeitos(e);
            const pct = e.blocos.length ? Math.round((feitos / e.blocos.length) * 100) : 0;
            return (
              <button key={e.id} type="button" onClick={() => abrir(e.id)} data-teste="estudo-item"
                style={{ textAlign: "left", background: T.card, border: `1px solid ${T.line}`, borderRadius: 18, padding: "14px 16px", cursor: "pointer", color: T.ink }}>
                <div className="flex items-center gap-3">
                  <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: soft("var(--neon)", 14), color: "var(--neon)" }}>
                    {feitos === e.blocos.length && feitos ? <Trophy size={19} /> : <Presentation size={19} />}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{e.titulo}</div>
                    <div style={{ fontSize: 13, color: T.faint, marginTop: 2 }}>
                      {e.blocos.length} blocos · cerca de {fmtMin(minutosDaAula(e))} · {feitos === e.blocos.length && feitos ? "concluída" : `${feitos} de ${e.blocos.length} feitos`}
                    </div>
                  </div>
                  <ChevronRight size={18} style={{ color: T.faint }} />
                </div>
                <div style={{ height: 5, borderRadius: 99, background: T.card3, marginTop: 12, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "var(--neon)", borderRadius: 99, transition: "width .4s" }} />
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ── criar: juntar os materiais e pedir o plano ──────────────────────── */
function CriarEstudo({ nuvem, notify, setData, onPronto, onCancelar }) {
  const [materiais, setMateriais] = useState([]);   // [{ nome, texto, figuras }]
  const [colado, setColado] = useState("");
  const [imagensColadas, setImagensColadas] = useState([]);   // data URLs
  const [status, setStatus] = useState("");
  const ref = useRef(null);

  const adicionarArquivos = async (ev) => {
    const arquivos = [...(ev.target.files || [])];
    ev.target.value = "";
    if (!arquivos.length) return;
    if (materiais.length >= MAX_MATERIAIS) { notify(`Cabem até ${MAX_MATERIAIS} materiais por aula.`); return; }
    try {
      const fotos = arquivos.filter((f) => /^image\//i.test(f.type));
      const outros = arquivos.filter((f) => !/^image\//i.test(f.type));
      const lidos = [];
      if (fotos.length) lidos.push(...await lerMaterial(fotos, nuvem, setStatus));
      if (outros.length) lidos.push(...await lerMaterial(outros, nuvem, setStatus));
      const bons = lidos.filter((m) => m.texto.trim().length >= 80 || m.figuras.length);
      if (bons.length < lidos.length) notify("Um dos arquivos veio quase sem texto. Se for PDF escaneado, mande como foto.");
      setMateriais((l) => [...l, ...bons].slice(0, MAX_MATERIAIS));
    } catch (e) {
      notify((e && e.message) || "Não consegui ler esse arquivo.");
    } finally { setStatus(""); }
  };

  /* imagem colada no campo de texto (print de slide, figura copiada) */
  const aoColar = (ev) => {
    const itens = [...((ev.clipboardData && ev.clipboardData.items) || [])].filter((i) => /^image\//.test(i.type));
    if (!itens.length) return;
    ev.preventDefault();
    for (const it of itens) {
      const arq = it.getAsFile();
      if (!arq) continue;
      fotoParaFigura(arq).then((d) => setImagensColadas((l) => [...l, d].slice(0, 12))).catch(() => notify("Não consegui ler a imagem colada."));
    }
  };

  const montar = async () => {
    const lista = [...materiais];
    if (colado.trim() || imagensColadas.length) {
      lista.push({
        nome: "Texto colado",
        texto: colado.trim(),
        figuras: imagensColadas.map((d, i) => ({ dados: d, pagina: 0, contexto: `Imagem colada ${i + 1}` })),
      });
    }
    const { texto, figuras } = juntarMateriais(lista);
    if (texto.replace(/=== Material \d+:[^\n]*===/g, "").trim().length < 300) {
      notify("Ainda tem pouco conteúdo. Cole mais texto ou envie o arquivo do material.");
      return;
    }
    setStatus("a IA está lendo o material e dividindo em blocos…");
    try {
      const r = await falarComEstudo(nuvem, {
        acao: "plano", texto,
        figuras: figuras.map(({ id, material, pagina, contexto }) => ({ id, material, pagina, contexto })),
      });
      if (r.erro) { notify(r.erro); return; }
      const id = `e${uid()}`;
      setStatus("guardando as figuras…");
      for (const f of figuras) await guardarMidia(chaveDaFigura(id, f.id), f.dados);
      await gravarDocEstudo(id, {
        texto, plano: { titulo: r.titulo, resumo: r.resumo, blocos: r.blocos },
        figuras: figuras.map(({ id: fid, material, pagina, contexto }) => ({ id: fid, material, pagina, contexto })),
        conteudo: {}, progresso: {}, fracos: [],
      });
      const novo = limparEstudos([{
        id, titulo: r.titulo, resumo: r.resumo, criadoEm: Date.now(), abertoEm: Date.now(),
        materiais: lista.map((m) => m.nome), blocos: r.blocos,
      }])[0];
      setData((p) => ({ ...p, estudos: [novo, ...(p.estudos || [])].slice(0, MAX_ESTUDOS) }));
      notify(`Aula pronta: ${novo.blocos.length} blocos, cerca de ${fmtMin(minutosDaAula(novo))}.${r.cortado ? " O material era grande e foi lido até um ponto." : ""}`);
      setMateriais([]); setColado(""); setImagensColadas([]);
      onPronto(id);
    } catch (e) {
      notify((e && e.message) || "Não deu certo montar a aula.");
    } finally { setStatus(""); }
  };

  const totalFiguras = materiais.reduce((t, m) => t + m.figuras.length, 0) + imagensColadas.length;
  return (
    <Card className="px-5 sm:px-7 py-6">
      <div data-teste="estudo-criar">
        <div className="flex items-start gap-3">
          <span style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: soft("var(--neon)", 14), color: "var(--neon)" }}>
            <Presentation size={21} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: T.ink }}>Transforme seu material numa aula interativa</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.55, color: T.dim, marginTop: 4 }}>
              A IA divide em blocos com o tempo de cada um, monta slides com as imagens do próprio material e, no fim de cada bloco,
              faz três perguntas para você responder escrevendo. Só passa para o próximo bloco quando o conteúdo estiver consolidado.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 18 }}>
          <button type="button" disabled={!!status} onClick={() => ref.current && ref.current.click()}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 99, border: `1px solid ${T.line2}`, background: "transparent", color: T.ink, fontWeight: 600, fontSize: 14.5, cursor: status ? "default" : "pointer" }}>
            <Upload size={15} /> Enviar PDF, Word, PowerPoint, texto ou fotos
          </button>
          <input ref={ref} type="file" multiple accept={`${TIPOS_ARQUIVO},${TIPOS_FOTO}`} onChange={adicionarArquivos}
            style={{ display: "none" }} data-teste="estudo-arquivo" />
          <Mini>dá para juntar mais de um material na mesma aula</Mini>
        </div>

        {materiais.length ? (
          <div className="flex flex-col gap-2" style={{ marginTop: 14 }} data-teste="estudo-materiais">
            {materiais.map((m, i) => (
              <div key={i} className="flex items-center gap-3" style={{ padding: "9px 12px", borderRadius: 12, background: T.card2, border: `1px solid ${T.line}` }}>
                <FileText size={16} style={{ color: "var(--neon)", flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nome}</div>
                  <div style={{ fontSize: 12.5, color: T.faint }}>
                    {Math.round(m.texto.length / 1000)} mil caracteres{m.figuras.length ? ` · ${m.figuras.length} ${m.figuras.length === 1 ? "imagem" : "imagens"}` : ""}
                  </div>
                </div>
                <button type="button" aria-label={`Tirar ${m.nome}`} onClick={() => setMateriais((l) => l.filter((_, k) => k !== i))}
                  style={{ background: "none", border: "none", color: T.faint, cursor: "pointer", padding: 4 }}><X size={16} /></button>
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ marginTop: 14 }}>
          <Label>Ou cole o texto, e imagens também</Label>
          <textarea value={colado} onChange={(e) => setColado(e.target.value)} onPaste={aoColar} rows={6}
            data-teste="estudo-texto" placeholder="Cole aqui o resumo, a apostila, a transcrição da aula… Prints e figuras colados entram como imagens dos slides."
            style={{ ...inp, marginTop: 8, resize: "vertical", lineHeight: 1.5, fontSize: 15 }} />
          {imagensColadas.length ? (
            <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
              {imagensColadas.map((d, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={d} alt={`Imagem colada ${i + 1}`} style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 8, border: `1px solid ${T.line}` }} />
                  <button type="button" aria-label="Tirar imagem" onClick={() => setImagensColadas((l) => l.filter((_, k) => k !== i))}
                    style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 99, border: "none", background: T.ink, color: T.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={12} /></button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 18 }}>
          <button type="button" onClick={montar} disabled={!!status} data-teste="estudo-montar"
            className="btn-neon" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 99, fontWeight: 700, fontSize: 15, cursor: status ? "default" : "pointer", opacity: status ? 0.7 : 1 }}>
            <Sparkles size={16} /> {status ? "Montando…" : "Montar a aula"}
          </button>
          {onCancelar && !status ? <Btn size="sm" tone="outline" onClick={onCancelar}>Cancelar</Btn> : null}
          <Mini>{status || (totalFiguras ? `${totalFiguras} ${totalFiguras === 1 ? "imagem vai" : "imagens vão"} para os slides` : "PDF, Word e PowerPoint trazem as imagens junto")}</Mini>
        </div>
      </div>
    </Card>
  );
}

/* ── o painel da aula: os blocos ─────────────────────────────────────── */
function PainelDaAula({ estudo, onVoltar, onBloco, onApagar, setData, notify }) {
  const feitos = blocosFeitos(estudo);
  const total = minutosDaAula(estudo);
  const tudo = feitos === estudo.blocos.length && feitos > 0;
  const proximo = estudo.blocos.findIndex((b) => !b.feito);
  const [fracos, setFracos] = useState(0);
  useEffect(() => {
    let vivo = true;
    lerDocEstudo(estudo.id).then((d) => { if (vivo && d) setFracos((d.fracos || []).length); });
    return () => { vivo = false; };
  }, [estudo.id, feitos]);

  const criarCartoes = async () => {
    const doc = await lerDocEstudo(estudo.id);
    const lista = (doc && doc.fracos) || [];
    if (!lista.length) { notify("Você acertou tudo de primeira. Nada para virar cartão."); return; }
    const novos = lista.map((f) => novoCartao(f.enunciado, f.gabarito.join("\n"), null, estudo.titulo.slice(0, 40), PASTA_ESTUDO));
    setData((p) => ({ ...p, flash: [...novos, ...(p.flash || [])], pastas: registrarPasta(p.pastas, PASTA_ESTUDO) }));
    await mudarDocEstudo(estudo.id, (x) => ({ ...x, fracos: [] }));
    setFracos(0);
    notify(`${novos.length} ${novos.length === 1 ? "cartão" : "cartões"} na pasta "${PASTA_ESTUDO}", para revisar nos Cartões.`);
  };

  return (
    <div className="flex flex-col gap-5" data-teste="estudo-painel">
      <button type="button" onClick={onVoltar}
        style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 14.5, padding: 0 }}>
        <ChevronLeft size={16} /> Suas aulas
      </button>
      <Card className="px-5 sm:px-7 py-6">
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--neon)" }}>Aula interativa</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: T.ink, marginTop: 4, lineHeight: 1.2 }}>{estudo.titulo}</div>
        {estudo.resumo ? <div style={{ fontSize: 15, lineHeight: 1.55, color: T.dim, marginTop: 8 }}>{estudo.resumo}</div> : null}
        <div className="flex flex-wrap gap-2" style={{ marginTop: 14 }}>
          {[
            [<Timer size={14} key="t" />, `cerca de ${fmtMin(total)}`],
            [<Layers size={14} key="l" />, `${estudo.blocos.length} blocos`],
            [<Check size={14} key="c" />, `${feitos} ${feitos === 1 ? "feito" : "feitos"}`],
          ].map(([ic, t], i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, background: T.card2, border: `1px solid ${T.line}`, fontSize: 13.5, color: T.dim }}>{ic}{t}</span>
          ))}
        </div>
        {!tudo && proximo >= 0 ? (
          <button type="button" onClick={() => onBloco(proximo)} data-teste="estudo-continuar"
            className="btn-neon" style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 99, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
            <Play size={15} /> {feitos ? `Continuar: bloco ${proximo + 1}` : "Começar a aula"}
          </button>
        ) : null}
        {tudo ? (
          <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 14, background: soft("var(--ok)", 12), border: `1px solid ${soft("var(--ok)", 40)}`, color: T.ink }}>
            <div className="flex items-center gap-2" style={{ fontWeight: 700 }}><PartyPopper size={17} style={{ color: "var(--ok)" }} /> Aula concluída!</div>
            <div style={{ fontSize: 14, color: T.dim, marginTop: 4 }}>
              {estudo.blocos.reduce((t, b) => t + b.dePrimeira, 0)} de {estudo.blocos.length * 3} perguntas certas de primeira. Dá para rever qualquer bloco quando quiser.
            </div>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-col gap-3">
        {estudo.blocos.map((b, i) => {
          const livre = blocoLiberado(estudo, i);
          return (
            <button key={i} type="button" disabled={!livre} onClick={() => livre && onBloco(i)} data-teste="estudo-bloco"
              style={{
                textAlign: "left", background: T.card, borderRadius: 18, padding: "14px 16px", color: T.ink,
                border: `1px solid ${b.feito ? soft("var(--ok)", 45) : i === proximo ? soft("var(--neon)", 55) : T.line}`,
                cursor: livre ? "pointer" : "not-allowed", opacity: livre ? 1 : 0.6,
              }}>
              <div className="flex items-start gap-3">
                <span style={{
                  width: 34, height: 34, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 15,
                  background: b.feito ? "var(--ok)" : livre ? soft("var(--neon)", 16) : T.card3,
                  color: b.feito ? "#fff" : livre ? "var(--neon)" : T.faint,
                }}>{b.feito ? <Check size={16} /> : livre ? i + 1 : <Lock size={14} />}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{b.titulo}</span>
                    <span style={{ fontSize: 12.5, color: T.faint, display: "inline-flex", alignItems: "center", gap: 4 }}><Timer size={12} /> {b.minutos} min</span>
                    {b.figuras.length ? <span style={{ fontSize: 12.5, color: T.faint }}>· {b.figuras.length} {b.figuras.length === 1 ? "imagem" : "imagens"}</span> : null}
                  </div>
                  {b.objetivo ? <div style={{ fontSize: 14, lineHeight: 1.5, color: T.dim, marginTop: 3 }}>{b.objetivo}</div> : null}
                  {b.topicos.length ? (
                    <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
                      {b.topicos.map((t, k) => <span key={k} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 99, background: T.card2, color: T.faint, border: `1px solid ${T.line}` }}>{t}</span>)}
                    </div>
                  ) : null}
                  {b.feito ? <div style={{ fontSize: 12.5, color: "var(--ok)", marginTop: 8 }}>Consolidado · {b.dePrimeira} de 3 de primeira{b.segundos ? ` · ${fmtMin(Math.max(1, Math.round(b.segundos / 60)))}` : ""}</div> : null}
                  {!livre ? <div style={{ fontSize: 12.5, color: T.faint, marginTop: 8 }}>Abre quando o bloco anterior estiver consolidado.</div> : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {fracos ? (
          <Btn size="sm" tone="outline" onClick={criarCartoes}><Layers size={14} /> Criar flashcards do que errei</Btn>
        ) : null}
        <Btn size="sm" tone="danger" onClick={onApagar}><Trash2 size={14} /> Apagar aula</Btn>
        {estudo.materiais.length ? <Mini>de {estudo.materiais.join(", ")}</Mini> : null}
      </div>
    </div>
  );
}

/* ── estudar um bloco: os slides e o checkpoint ──────────────────────── */
/* As transições do estudo valem SEMPRE, mesmo com "reduzir movimento" do
   sistema (no Windows, "efeitos de animação" desligado): a regra geral do
   site desliga toda animação nesse caso, e a aula ficava sem transição
   nenhuma, que era justamente o que a pessoa pediu. A animação de cada
   peça vai numa variável (--anim) e esta regra, mais específica que a
   geral, aplica. A cópia do slide que está saindo não repete as entradas. */
const ESTILO_ESTUDO = `
@keyframes estudoEntraDir{from{opacity:0;transform:translateX(90px) scale(.95)}to{opacity:1;transform:none}}
@keyframes estudoEntraEsq{from{opacity:0;transform:translateX(-90px) scale(.95)}to{opacity:1;transform:none}}
@keyframes estudoSaiEsq{from{opacity:1;transform:none}to{opacity:0;transform:translateX(-90px) scale(.95)}}
@keyframes estudoSaiDir{from{opacity:1;transform:none}to{opacity:0;transform:translateX(90px) scale(.95)}}
@keyframes estudoSobe{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes estudoPulsa{0%{transform:scale(1)}50%{transform:scale(1.06)}100%{transform:scale(1)}}
[data-estudo-anima][style*="--anim"]{animation:var(--anim)!important}
[data-saindo] [data-estudo-anima][style*="--anim"]{animation:none!important}
`;

const anima = (nome, atraso = 0, dur = 0.42, vezes = 1) => ({ "--anim": `${nome} ${dur}s cubic-bezier(.2,.8,.2,1) ${atraso}s ${vezes} both` });
const DURACAO_TROCA = 450;

/* Na tela cheia o slide cresce junto com a tela, até 1,7 vez. */
function useEscalaDaTela(ligada) {
  const conta = () => (typeof window === "undefined" ? 1
    : Math.max(1, Math.min(1.7, Math.min(window.innerWidth / 1100, window.innerHeight / 680))));
  const [escala, setEscala] = useState(conta);
  useEffect(() => {
    if (!ligada) return undefined;
    const r = () => setEscala(conta());
    r();
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, [ligada]); // eslint-disable-line react-hooks/exhaustive-deps
  return ligada ? escala : 1;
}

function EstudoDoBloco({ estudo, indice, nuvem, notify, setData, atualizar, cheia, setCheia, onSair, onProximo }) {
  const b = estudo.blocos[indice];
  const [doc, setDoc] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [passo, setPasso] = useState(0);            // índice do slide; slides.length = checkpoint
  const [direcao, setDirecao] = useState(1);
  const [saindo, setSaindo] = useState(null);
  const escala = useEscalaDaTela(cheia);
  useEffect(() => {
    if (!saindo) return undefined;
    const t = window.setTimeout(() => setSaindo(null), DURACAO_TROCA);
    return () => window.clearTimeout(t);
  }, [saindo]);
  const [concluido, setConcluido] = useState(false);
  const segundos = useRef(0);
  /* o que já se fez em cada slide (pontos revelados, quiz respondido,
     resposta do caso vista, "não entendi"): sobrevive a entrar e sair da
     tela cheia e a voltar num slide já visto */
  const memoriaSlides = useRef({});
  const docRef = useRef(null);
  docRef.current = doc;

  /* guarda o andamento no aparelho (slide atual, checkpoint) */
  const salvar = useCallback(async (mudar) => {
    try {
      const novo = await mudarDocEstudo(estudo.id, mudar);
      if (novo) { docRef.current = novo; setDoc(novo); }
    } catch (e) { /* segue com o que está na tela */ }
  }, [estudo.id]);

  const gerar = useCallback(async (d, i) => {
    const bl = d.plano.blocos[i];
    const figs = (d.figuras || []).filter((f) => (bl.figuras || []).indexOf(f.id) >= 0);
    return falarComEstudo(nuvem, { acao: "bloco", texto: d.texto, plano: d.plano, indice: i, figuras: figs });
  }, [nuvem]);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    const d = await lerDocEstudo(estudo.id);
    if (!d) { setErro("O material desta aula não está neste aparelho. Ela foi montada em outro aparelho: monte de novo aqui para estudar."); setCarregando(false); return; }
    let conteudo = d.conteudo && d.conteudo[indice];
    let atual = d;
    if (!conteudo) {
      const r = await gerar(d, indice);
      if (r.erro) { setErro(r.erro); setCarregando(false); return; }
      conteudo = { slides: r.slides, perguntas: r.perguntas };
      const pronto = conteudo;
      atual = (await mudarDocEstudo(estudo.id, (x) => ({ ...x, conteudo: { ...(x.conteudo || {}), [indice]: pronto } })).catch(() => null))
        || { ...d, conteudo: { ...(d.conteudo || {}), [indice]: conteudo } };
    }
    const prog = (atual.progresso && atual.progresso[indice]) || {};
    segundos.current = Number(prog.segundos) || 0;
    /* bloco já consolidado reabre do começo: é revisão */
    setPasso(prog.feito ? 0 : Math.min(Number(prog.passo) || 0, conteudo.slides.length));
    setDoc(atual);
    setCarregando(false);
    /* o próximo bloco já vai sendo montado enquanto este é estudado: ao
       terminar, ele abre na hora */
    const prox = indice + 1;
    if (prox < atual.plano.blocos.length && !(atual.conteudo && atual.conteudo[prox])) {
      gerar(atual, prox).then((r2) => {
        if (r2.erro) return null;
        return mudarDocEstudo(estudo.id, (x) => (x.conteudo && x.conteudo[prox] ? x
          : { ...x, conteudo: { ...(x.conteudo || {}), [prox]: { slides: r2.slides, perguntas: r2.perguntas } } }));
      }).catch(() => {});
    }
  }, [estudo.id, indice, gerar]);

  useEffect(() => { carregar(); }, [carregar]);

  /* o tempo no bloco conta só com a aba à vista */
  useEffect(() => {
    if (carregando || concluido) return undefined;
    const t = window.setInterval(() => { if (!document.hidden) segundos.current += 1; }, 1000);
    return () => window.clearInterval(t);
  }, [carregando, concluido]);

  const conteudo = doc && doc.conteudo && doc.conteudo[indice];
  const slides = (conteudo && conteudo.slides) || [];
  const noCheckpoint = conteudo && passo >= slides.length;

  const irPara = useCallback((n) => {
    if (!conteudo) return;
    const alvo = Math.max(0, Math.min(slides.length, n));
    if (alvo === passo) return;
    /* o slide que sai: uma cópia parada dele desliza para fora enquanto o
       novo entra pelo outro lado */
    try {
      const el = document.querySelector('[data-teste="estudo-slide"]');
      if (el) {
        const r = el.getBoundingClientRect();
        setSaindo({ html: el.outerHTML.replace(/ data-teste="[^"]*"/g, ""), dir: alvo >= passo ? 1 : -1, altura: r.height, chave: Date.now() });
      }
    } catch (e) { /* sem a saída, fica só a entrada */ }
    setDirecao(alvo >= passo ? 1 : -1);
    setPasso(alvo);
    salvar((d) => ({ ...d, progresso: { ...(d.progresso || {}), [indice]: { ...((d.progresso || {})[indice] || {}), passo: alvo, segundos: segundos.current } } }));
  }, [conteudo, slides.length, passo, indice, salvar]);

  /* setas do teclado, fora de campo de texto */
  useEffect(() => {
    const h = (e) => {
      const el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight" && !noCheckpoint) document.dispatchEvent(new CustomEvent("estudo-avancar"));
      if (e.key === "ArrowLeft" && passo > 0) irPara(passo - 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [passo, noCheckpoint, irPara]);

  const concluir = async (dePrimeira, fracos) => {
    const seg = segundos.current;
    setConcluido(true);
    await salvar((d) => ({
      ...d,
      fracos: [...(d.fracos || []), ...fracos].slice(-60),
      progresso: { ...(d.progresso || {}), [indice]: { ...((d.progresso || {})[indice] || {}), passo: slides.length, segundos: seg, feito: true } },
    }));
    atualizar(estudo.id, (e) => ({
      ...e, blocos: e.blocos.map((x, k) => (k === indice ? { ...x, feito: true, dePrimeira, segundos: (x.feito ? x.segundos : 0) + seg } : x)),
    }));
    const minutos = Math.round(seg / 60);
    if (minutos >= 1 && !b.feito) {
      setData((p) => ({
        ...p,
        sessions: [{
          id: uid(), date: todayISO(), subjectId: null, area: null,
          topic: `${estudo.titulo}: ${b.titulo}`.slice(0, 120), kind: "Aula", minutes: minutos,
          questions: 3, correct: dePrimeira, notes: "estudo interativo", createdAt: Date.now(),
        }, ...(p.sessions || [])],
      }));
    }
  };

  /* Tela cheia: a aula ocupa a tela toda (por portal, no <body>, como o
     Foco), e o navegador entra em tela cheia de verdade quando deixa. No
     iPhone, que não tem a tela cheia do navegador, fica a da página. Sair
     da tela cheia do navegador (Esc) também sai daqui. */
  useEffect(() => {
    try {
      if (cheia && document.documentElement.requestFullscreen && !document.fullscreenElement) {
        const r = document.documentElement.requestFullscreen();
        if (r && r.catch) r.catch(() => {});
      } else if (!cheia && document.fullscreenElement && document.exitFullscreen) {
        const r = document.exitFullscreen();
        if (r && r.catch) r.catch(() => {});
      }
    } catch (e) { /* sem suporte: fica a tela cheia da página */ }
  }, [cheia]);
  useEffect(() => {
    if (!cheia) return undefined;
    const saiu = () => { if (!document.fullscreenElement) setCheia(false); };
    const esc = (e) => { if (e.key === "Escape") setCheia(false); };
    document.addEventListener("fullscreenchange", saiu);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("fullscreenchange", saiu); window.removeEventListener("keydown", esc); };
  }, [cheia, setCheia]);

  const ultimo = indice + 1 >= estudo.blocos.length;
  const corpo = (
    <div className="flex flex-col gap-4" data-teste="estudo-player"
      style={cheia ? { flex: 1, minHeight: 0, width: "100%", maxWidth: 1700, margin: "0 auto" } : undefined}>
      <style>{ESTILO_ESTUDO}</style>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onSair} aria-label="Voltar aos blocos"
          style={{ width: 38, height: 38, borderRadius: 99, flexShrink: 0, border: `1px solid ${T.line}`, background: T.card2, color: T.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, color: T.faint, fontWeight: 600 }}>Bloco {indice + 1} de {estudo.blocos.length} · {b.minutos} min</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.titulo}</div>
        </div>
        <button type="button" onClick={() => setCheia(!cheia)} data-teste="estudo-tela-cheia"
          aria-label={cheia ? "Sair da tela cheia" : "Tela cheia"} title={cheia ? "Sair da tela cheia" : "Tela cheia"}
          style={{ height: 38, borderRadius: 99, flexShrink: 0, padding: "0 14px", border: `1px solid ${T.line}`, background: T.card2, color: T.dim, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 600 }}>
          {cheia ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          <span className="hidden sm:inline">{cheia ? "Sair" : "Tela cheia"}</span>
        </button>
      </div>

      {/* a trilha: um traço por slide e o checkpoint no fim */}
      {conteudo ? (
        <div className="flex items-center gap-1" data-teste="estudo-trilha" aria-label={`Slide ${Math.min(passo + 1, slides.length)} de ${slides.length}`}>
          {slides.map((_, i) => (
            <button key={i} type="button" onClick={() => irPara(i)} aria-label={`Ir ao slide ${i + 1}`}
              style={{ flex: 1, height: 6, borderRadius: 99, border: "none", padding: 0, cursor: "pointer", background: i < passo ? "var(--neon)" : i === passo ? soft("var(--neon)", 60) : T.card3, transition: "background .3s" }} />
          ))}
          <span title="Checkpoint" style={{ width: 22, height: 22, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", background: noCheckpoint ? "var(--neon)" : T.card3, color: noCheckpoint ? "#fff" : T.faint, marginLeft: 4 }}>
            <PencilLine size={12} />
          </span>
        </div>
      ) : null}

      {carregando ? <MontandoBloco titulo={b.titulo} /> : null}
      {!carregando && erro ? (
        <Card className="px-5 py-6">
          <div style={{ color: T.ink, fontSize: 15, lineHeight: 1.5 }}>{erro}</div>
          <div style={{ marginTop: 12 }}><Btn size="sm" tone="outline" onClick={carregar}><RefreshCw size={14} /> Tentar de novo</Btn></div>
        </Card>
      ) : null}

      {!carregando && conteudo && !noCheckpoint ? (
        <div style={{ position: "relative", ...(cheia ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } : {}) }}>
          {saindo ? (
            <div key={saindo.chave} data-saindo="1" aria-hidden="true" data-estudo-anima="1"
              style={{ ...anima(saindo.dir >= 0 ? "estudoSaiEsq" : "estudoSaiDir", 0, DURACAO_TROCA / 1000), position: "absolute", top: 0, left: 0, right: 0, zIndex: 2, pointerEvents: "none", height: saindo.altura, overflow: "hidden" }}
              dangerouslySetInnerHTML={{ __html: saindo.html }} />
          ) : null}
          <SlideDoEstudo key={passo} slide={slides[passo]} estudoId={estudo.id} direcao={direcao} cheia={cheia} escala={escala}
            memoria={memoriaSlides.current[passo] || (memoriaSlides.current[passo] = {})}
            numero={passo + 1} total={slides.length} nuvem={nuvem} notify={notify}
            onVoltar={passo > 0 ? () => irPara(passo - 1) : null}
            onAvancar={() => irPara(passo + 1)} />
        </div>
      ) : null}

      {!carregando && conteudo && noCheckpoint ? (
        <Checkpoint estudo={estudo} indice={indice} perguntas={conteudo.perguntas} doc={doc} salvar={salvar}
          nuvem={nuvem} notify={notify} concluido={concluido || b.feito} ultimo={ultimo}
          onRever={() => irPara(0)} onConcluir={concluir} onProximo={onProximo} onSair={onSair} />
      ) : null}
    </div>
  );

  if (!cheia) return corpo;
  return createPortal((
    <div data-teste="estudo-cheia" className="fixed"
      style={{
        inset: 0, zIndex: 90, background: T.bg, overflowY: "auto", WebkitOverflowScrolling: "touch",
        display: "flex", flexDirection: "column",
        padding: "calc(2.2vh + env(safe-area-inset-top, 0px)) 3vw calc(2.2vh + env(safe-area-inset-bottom, 0px))",
      }}>
      {corpo}
    </div>
  ), document.body);
}

function MontandoBloco({ titulo }) {
  const frases = ["lendo o material deste bloco", "escolhendo as imagens", "montando os slides", "pensando num caso clínico", "escrevendo as perguntas do checkpoint"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % frases.length), 2200);
    return () => window.clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card className="px-6 py-10">
      <div className="flex flex-col items-center" style={{ textAlign: "center" }} data-teste="estudo-montando">
        <span data-estudo-anima="1" style={{ ...anima("estudoPulsa", 0, 1.6, "infinite"), width: 58, height: 58, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", background: soft("var(--neon)", 16), color: "var(--neon)" }}>
          <Sparkles size={26} />
        </span>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginTop: 16 }}>Preparando: {titulo}</div>
        <div key={i} data-estudo-anima="1" style={{ ...anima("estudoSobe"), fontSize: 14.5, color: T.dim, marginTop: 6 }}>A IA está {frases[i]}…</div>
      </div>
    </Card>
  );
}

/* A figura do material, lida do aparelho; um toque abre grande. */
function FiguraDoEstudo({ estudoId, id, legenda, alta }) {
  const [src, setSrc] = useState("");
  const [grande, setGrande] = useState(false);
  useEffect(() => {
    let vivo = true;
    lerMidia(chaveDaFigura(estudoId, id)).then((v) => { if (vivo && v && DADOS_FIGURA.test(v)) setSrc(v); });
    return () => { vivo = false; };
  }, [estudoId, id]);
  /* só a legenda que ensina; de onde a imagem saiu (arquivo, página) não
     interessa a quem estuda */
  const texto = legenda || "";
  if (!src) return <div style={{ height: alta ? 220 : 140, borderRadius: 14, background: T.card2, border: `1px dashed ${T.line2}` }} />;
  return (
    <figure style={{ margin: 0 }} data-teste="estudo-figura">
      <button type="button" onClick={() => setGrande(true)} aria-label="Ver a figura grande"
        style={{ display: "block", width: "100%", padding: 0, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden", cursor: "zoom-in", background: "#fff", position: "relative" }}>
        <img src={src} alt={texto || "Imagem da aula"} style={{ display: "block", width: "100%", maxHeight: alta ? 420 : 300, objectFit: "contain" }} />
        <span style={{ position: "absolute", right: 8, bottom: 8, width: 28, height: 28, borderRadius: 99, background: "rgba(0,0,0,.55)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><ZoomIn size={14} /></span>
      </button>
      {texto ? <figcaption style={{ fontSize: 13, color: T.faint, marginTop: 6, lineHeight: 1.45 }}>{texto}</figcaption> : null}
      {grande ? createPortal((
        <div role="dialog" aria-label="Figura" onClick={() => setGrande(false)}
          style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,.86)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}>
          <img src={src} alt={texto || "Imagem da aula"} style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 10, background: "#fff" }} />
        </div>
      ), document.body) : null}
    </figure>
  );
}

const ROTULO_SLIDE = {
  capa: "Começando", conceito: "Conceito", pontos: "O que importa", esquema: "Esquema", comparacao: "Compare",
  caso: "Caso clínico", quiz: "Teste rápido", pegadinha: "Pegadinha de prova", resumo: "Para levar",
};
const COR_SLIDE = {
  capa: "var(--neon)", conceito: "var(--neon)", pontos: "#2F86D6", esquema: "#8E6BE0", comparacao: "#0E9384",
  caso: "#E08A2E", quiz: "#2E9E5B", pegadinha: "#D04848", resumo: "var(--neon2)",
};

function SlideDoEstudo({ slide, estudoId, memoria, direcao, cheia, escala = 1, numero, total, nuvem, notify, onVoltar, onAvancar }) {
  const s = slide || {};
  const m = memoria || {};
  const cor = COR_SLIDE[s.tipo] || "var(--neon)";
  /* pontos aparecem um a um; quiz e caso pedem uma ação antes de seguir */
  const [mostrados, setMostrados] = useState(m.mostrados != null ? m.mostrados : s.tipo === "pontos" ? 1 : (s.pontos || []).length);
  const [escolha, setEscolha] = useState(m.escolha != null ? m.escolha : null);
  const [verCaso, setVerCaso] = useState(!!m.verCaso);
  const [palpite, setPalpite] = useState(m.palpite || "");
  const [ajuda, setAjuda] = useState(m.ajuda || null);
  const [pedindo, setPedindo] = useState(false);
  /* a entrada animada é só na primeira vez que o slide aparece */
  const [primeira] = useState(!m.visto);
  useEffect(() => {
    if (!memoria) return;
    Object.assign(memoria, { mostrados, escolha, verCaso, palpite, ajuda, visto: true });
  }, [memoria, mostrados, escolha, verCaso, palpite, ajuda]);
  const faltaPonto = s.tipo === "pontos" && mostrados < (s.pontos || []).length;
  const travado = (s.tipo === "quiz" && s.quiz && escolha === null) || (s.tipo === "caso" && s.caso && !verCaso);

  const avancar = useCallback(() => {
    if (faltaPonto) { setMostrados((n) => n + 1); return; }
    if (travado) return;
    onAvancar();
  }, [faltaPonto, travado, onAvancar]);

  useEffect(() => {
    const h = () => avancar();
    document.addEventListener("estudo-avancar", h);
    return () => document.removeEventListener("estudo-avancar", h);
  }, [avancar]);

  /* arrastar o dedo para o lado também passa o slide */
  const toque = useRef(null);
  const aoTocar = (e) => { toque.current = e.touches ? e.touches[0].clientX : null; };
  const aoSoltar = (e) => {
    if (toque.current === null) return;
    const x = (e.changedTouches ? e.changedTouches[0].clientX : toque.current) - toque.current;
    toque.current = null;
    if (x < -60) avancar();
    if (x > 60 && onVoltar) onVoltar();
  };

  const naoEntendi = async () => {
    setPedindo(true);
    const r = await falarComEstudo(nuvem, { acao: "simplificar", slide: s });
    setPedindo(false);
    if (r.erro) { notify(r.erro); return; }
    setAjuda(r);
  };

  const comFigura = !!s.figura;
  const visual = comFigura
    ? <FiguraDoEstudo estudoId={estudoId} id={s.figura} legenda={s.legenda} alta={s.tipo === "conceito" && !s.texto} />
    : null;

  return (
    <div onTouchStart={aoTocar} onTouchEnd={aoSoltar}
      style={cheia ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } : undefined}>
      <div data-estudo-anima="1" data-teste="estudo-slide" data-tipo={s.tipo}
        style={{
          ...(primeira || direcao < 0 ? anima(direcao >= 0 ? "estudoEntraDir" : "estudoEntraEsq", 0, DURACAO_TROCA / 1000) : {}),
          background: T.card, border: `1px solid ${T.line}`, borderRadius: 24, overflow: "hidden",
          boxShadow: "0 18px 40px -28px rgba(0,0,0,.45)",
          ...(cheia ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } : {}),
        }}>
        <div style={{ height: 5, background: cor, flexShrink: 0 }} />
        <div style={{
          padding: "22px 22px 20px",
          ...(cheia ? { flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", justifyContent: "center", padding: "2.5vh 2.6vw" } : {}),
        }}>
          <div style={cheia && escala > 1 ? { zoom: escala } : undefined}>
          <div className="flex items-center justify-between gap-3">
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: cor }}>{ROTULO_SLIDE[s.tipo] || "Slide"}</span>
            <span style={{ fontSize: 12.5, color: T.faint }}>{numero}/{total}</span>
          </div>

          {s.tipo === "capa" ? (
            <div style={{ textAlign: "center", padding: "18px 4px 8px" }}>
              {s.emoji ? <div data-estudo-anima="1" style={{ ...anima("estudoPulsa", 0.15, 0.9), fontSize: 64, lineHeight: 1 }}>{s.emoji}</div> : null}
              <div data-estudo-anima="1" style={{ ...anima("estudoSobe", 0.1), fontSize: 27, fontWeight: 800, color: T.ink, marginTop: 14, lineHeight: 1.2 }}>{s.titulo}</div>
              {s.texto ? <div data-estudo-anima="1" style={{ ...anima("estudoSobe", 0.22), fontSize: 17, lineHeight: 1.6, color: T.dim, marginTop: 12 }}>{s.texto}</div> : null}
              {visual ? <div style={{ marginTop: 16, textAlign: "left" }}>{visual}</div> : null}
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3" style={{ marginTop: 10 }}>
                {s.emoji && !comFigura ? <span style={{ fontSize: 34, lineHeight: 1 }}>{s.emoji}</span> : null}
                <div data-estudo-anima="1" style={{ ...anima("estudoSobe", 0.05), fontSize: 22, fontWeight: 800, color: T.ink, lineHeight: 1.25 }}>{s.titulo}</div>
              </div>
              <div className={comFigura && (s.tipo === "conceito" || s.tipo === "pontos" || s.tipo === "pegadinha") ? "grid sm:grid-cols-2 gap-5" : ""} style={{ marginTop: 14 }}>
                <div style={{ minWidth: 0 }}>
                  {s.texto ? <div data-estudo-anima="1" style={{ ...anima("estudoSobe", 0.12), fontSize: 16.5, lineHeight: 1.65, color: T.dim, whiteSpace: "pre-line" }}>{s.texto}</div> : null}

                  {s.tipo === "pontos" || s.tipo === "resumo" ? (
                    <ul style={{ listStyle: "none", padding: 0, margin: s.texto ? "14px 0 0" : 0, display: "flex", flexDirection: "column", gap: 10 }}>
                      {(s.pontos || []).slice(0, mostrados).map((p, i) => (
                        <li key={i} data-estudo-anima="1" style={{ ...anima("estudoSobe", 0), display: "flex", gap: 10, fontSize: 16, lineHeight: 1.55, color: T.ink }}>
                          <span style={{ width: 24, height: 24, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: soft(cor, 16), color: cor, fontSize: 12.5, fontWeight: 800, marginTop: 1 }}>{s.tipo === "resumo" ? <Check size={13} /> : i + 1}</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {s.esquema ? <EsquemaDoSlide esquema={s.esquema} cor={cor} /> : null}
                  {s.comparacao ? <TabelaDoSlide comparacao={s.comparacao} cor={cor} /> : null}

                  {s.caso ? (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ padding: "14px 16px", borderRadius: 14, background: soft(cor, 8), border: `1px solid ${soft(cor, 35)}`, fontSize: 16, lineHeight: 1.6, color: T.ink, whiteSpace: "pre-line" }}>{s.caso.historia}</div>
                      {s.caso.pergunta ? <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginTop: 12 }}>{s.caso.pergunta}</div> : null}
                      {!verCaso ? (
                        <>
                          <textarea value={palpite} onChange={(e) => setPalpite(e.target.value)} rows={2} placeholder="Pense e escreva seu palpite, se quiser…"
                            style={{ ...inp, marginTop: 10, fontSize: 15, resize: "vertical" }} />
                          <button type="button" onClick={() => setVerCaso(true)} data-teste="estudo-ver-caso"
                            style={{ marginTop: 10, padding: "9px 16px", borderRadius: 99, border: `1px solid ${cor}`, background: soft(cor, 12), color: T.ink, fontWeight: 700, cursor: "pointer" }}>
                            Ver a resposta
                          </button>
                        </>
                      ) : (
                        <div data-estudo-anima="1" style={{ ...anima("estudoSobe"), marginTop: 12, padding: "14px 16px", borderRadius: 14, background: soft("var(--ok)", 10), border: `1px solid ${soft("var(--ok)", 40)}`, fontSize: 15.5, lineHeight: 1.6, color: T.ink, whiteSpace: "pre-line" }}>
                          {palpite.trim() ? <div style={{ fontSize: 13, color: T.faint, marginBottom: 6 }}>Você pensou: {palpite.trim()}</div> : null}
                          {s.caso.resposta}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {s.quiz ? (
                    <div style={{ marginTop: 4 }}>
                      {s.quiz.pergunta ? <div style={{ fontSize: 16.5, fontWeight: 700, color: T.ink, lineHeight: 1.5 }}>{s.quiz.pergunta}</div> : null}
                      <div className="flex flex-col gap-2" style={{ marginTop: 12 }}>
                        {s.quiz.opcoes.map((o, i) => {
                          const certa = i === s.quiz.certa;
                          const marcada = escolha === i;
                          const fundo = escolha === null ? T.card2 : certa ? soft("var(--ok)", 16) : marcada ? soft("var(--bad)", 14) : T.card2;
                          const borda = escolha === null ? T.line : certa ? "var(--ok)" : marcada ? "var(--bad)" : T.line;
                          return (
                            <button key={i} type="button" disabled={escolha !== null} onClick={() => setEscolha(i)} data-teste="estudo-opcao"
                              style={{ textAlign: "left", padding: "11px 14px", borderRadius: 12, border: `1.5px solid ${borda}`, background: fundo, color: T.ink, fontSize: 15.5, cursor: escolha === null ? "pointer" : "default", display: "flex", gap: 10, alignItems: "center" }}>
                              <span style={{ width: 24, height: 24, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${borda}`, fontSize: 12.5, fontWeight: 700 }}>
                                {escolha !== null && certa ? <Check size={13} /> : escolha !== null && marcada ? <X size={13} /> : String.fromCharCode(65 + i)}
                              </span>
                              {o}
                            </button>
                          );
                        })}
                      </div>
                      {escolha !== null ? (
                        <div data-estudo-anima="1" style={{ ...anima("estudoSobe"), marginTop: 12, fontSize: 15, lineHeight: 1.55, color: T.dim }}>
                          <b style={{ color: escolha === s.quiz.certa ? "var(--ok)" : "var(--bad)" }}>{escolha === s.quiz.certa ? "Isso!" : "Quase."}</b> {s.quiz.explicacao}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {s.destaque ? (
                    <div data-estudo-anima="1" style={{ ...anima("estudoSobe", 0.25), marginTop: 16, padding: "12px 14px", borderRadius: 14, background: soft(cor, 10), borderLeft: `4px solid ${cor}`, fontSize: 15.5, fontWeight: 600, lineHeight: 1.5, color: T.ink }}>
                      <Lightbulb size={15} style={{ color: cor, verticalAlign: "-2px", marginRight: 6 }} />{s.destaque}
                    </div>
                  ) : null}
                </div>
                {visual && s.tipo !== "capa" ? <div style={{ minWidth: 0, marginTop: comFigura && (s.tipo === "conceito" || s.tipo === "pontos" || s.tipo === "pegadinha") ? 0 : 14 }}>{visual}</div> : null}
              </div>
            </>
          )}

          {ajuda ? (
            <div data-estudo-anima="1" data-teste="estudo-ajuda" style={{ ...anima("estudoSobe"), marginTop: 16, padding: "14px 16px", borderRadius: 14, background: soft("var(--neon)", 8), border: `1px solid ${soft("var(--neon)", 35)}` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--neon)", letterSpacing: ".06em", textTransform: "uppercase" }}>De outro jeito</div>
              <div style={{ fontSize: 15.5, lineHeight: 1.6, color: T.ink, marginTop: 6 }}>{ajuda.explicacao}</div>
              {ajuda.analogia ? <div style={{ fontSize: 15, lineHeight: 1.55, color: T.dim, marginTop: 8 }}><b>Pense assim:</b> {ajuda.analogia}</div> : null}
              {ajuda.lembrete ? <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginTop: 8 }}>{ajuda.lembrete}</div> : null}
            </div>
          ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 14, flexShrink: 0 }}>
        <button type="button" onClick={onVoltar || undefined} disabled={!onVoltar} aria-label="Slide anterior"
          style={{ width: 44, height: 44, borderRadius: 99, border: `1px solid ${T.line}`, background: T.card2, color: T.dim, cursor: onVoltar ? "pointer" : "default", opacity: onVoltar ? 1 : 0.4, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChevronLeft size={18} />
        </button>
        <button type="button" onClick={naoEntendi} disabled={pedindo || !!ajuda} data-teste="estudo-nao-entendi"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 99, border: `1px solid ${T.line}`, background: "transparent", color: T.dim, fontSize: 14, fontWeight: 600, cursor: pedindo || ajuda ? "default" : "pointer", opacity: ajuda ? 0.5 : 1 }}>
          <CircleHelp size={15} /> {pedindo ? "Explicando…" : "Não entendi"}
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={avancar} disabled={travado} data-teste="estudo-avancar"
          className="btn-neon" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 99, fontWeight: 700, fontSize: 15, cursor: travado ? "default" : "pointer", opacity: travado ? 0.5 : 1 }}>
          {faltaPonto ? "Próximo ponto" : travado ? (s.tipo === "quiz" ? "Responda para seguir" : "Veja a resposta") : numero === total ? "Ir para o checkpoint" : "Avançar"}
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* O esquema: passos que entram um depois do outro, ligados por setas. */
function EsquemaDoSlide({ esquema, cor }) {
  const passos = esquema.passos || [];
  if (esquema.forma === "piramide") {
    return (
      <div className="flex flex-col items-center gap-1.5" style={{ marginTop: 12 }}>
        {passos.map((p, i) => (
          <div key={i} data-estudo-anima="1" style={{ ...anima("estudoSobe", 0.08 * i), width: `${Math.round(40 + (60 * (i + 1)) / passos.length)}%`, padding: "9px 12px", borderRadius: 10, textAlign: "center", fontSize: 14.5, fontWeight: 600, color: T.ink, background: soft(cor, 8 + Math.round((22 * (i + 1)) / passos.length)), border: `1px solid ${soft(cor, 40)}` }}>{p}</div>
        ))}
      </div>
    );
  }
  const ciclo = esquema.forma === "ciclo";
  return (
    <div className="flex flex-col" style={{ marginTop: 12, gap: 4 }}>
      {passos.map((p, i) => (
        <React.Fragment key={i}>
          <div data-estudo-anima="1" style={{ ...anima("estudoSobe", 0.1 * i), display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: soft(cor, 9), border: `1px solid ${soft(cor, 35)}` }}>
            <span style={{ width: 26, height: 26, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: cor, color: "#fff", fontSize: 13, fontWeight: 800 }}>{i + 1}</span>
            <span style={{ fontSize: 15, lineHeight: 1.45, color: T.ink, fontWeight: 500 }}>{p}</span>
          </div>
          {i < passos.length - 1 || ciclo ? (
            <div data-estudo-anima="1" style={{ ...anima("estudoSobe", 0.1 * i + 0.05), textAlign: "center", color: cor, fontSize: 16, lineHeight: 1 }}>{i < passos.length - 1 ? "↓" : "↺ volta ao 1"}</div>
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}

function TabelaDoSlide({ comparacao, cor }) {
  return (
    <div style={{ marginTop: 12, overflowX: "auto", borderRadius: 14, border: `1px solid ${T.line}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5, color: T.ink }}>
        <thead>
          <tr>
            <th style={{ padding: "10px 12px", background: soft(cor, 12), textAlign: "left" }} />
            {comparacao.colunas.map((c, i) => <th key={i} style={{ padding: "10px 12px", background: soft(cor, 12), textAlign: "left", fontWeight: 800, color: cor }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {comparacao.linhas.map((l, i) => (
            <tr key={i} data-estudo-anima="1" style={{ ...anima("estudoSobe", 0.07 * i), borderTop: `1px solid ${T.line}` }}>
              <td style={{ padding: "10px 12px", fontWeight: 700, verticalAlign: "top" }}>{l.rotulo}</td>
              {l.valores.map((v, k) => <td key={k} style={{ padding: "10px 12px", lineHeight: 1.45, verticalAlign: "top", color: T.dim }}>{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── o checkpoint ───────────────────────────────────────────────────── *
 * Três perguntas, uma de cada vez. Para cada uma, guarda a pergunta da vez
 * (a original ou o reforço), as tentativas e se já foi consolidada. Fica
 * gravado no aparelho: sair no meio e voltar retoma de onde parou. */
const VEREDITO_UI = {
  certo: { rotulo: "Certo!", cor: "var(--ok)", emoji: "✅" },
  parcial: { rotulo: "Quase lá", cor: "var(--warn)", emoji: "🟡" },
  errado: { rotulo: "Ainda não", cor: "var(--bad)", emoji: "❌" },
};

function Checkpoint({ estudo, indice, perguntas, doc, salvar, nuvem, notify, concluido, ultimo, onRever, onConcluir, onProximo, onSair }) {
  const estadoSalvo = ((doc.progresso || {})[indice] || {}).checkpoint;
  const inicial = () => perguntas.map((p) => ({ original: p, atual: p, tentativas: [], ok: false }));
  const [estado, setEstado] = useState(() => (Array.isArray(estadoSalvo) && estadoSalvo.length === perguntas.length ? estadoSalvo : inicial()));
  const [resposta, setResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mostrarGabarito, setMostrarGabarito] = useState(false);
  const atual = estado.findIndex((q) => !q.ok);
  const q = atual >= 0 ? estado[atual] : null;
  const ultimaTentativa = q && q.tentativas.length ? q.tentativas[q.tentativas.length - 1] : null;
  const erradasSeguidas = q ? q.tentativas.filter((t) => t.veredito !== "certo").length : 0;

  const gravar = (novo) => {
    setEstado(novo);
    salvar((d) => ({ ...d, progresso: { ...(d.progresso || {}), [indice]: { ...((d.progresso || {})[indice] || {}), checkpoint: novo } } }));
  };

  const enviar = async () => {
    if (!q || resposta.trim().length < 2) { notify("Escreva a sua resposta antes de enviar."); return; }
    setEnviando(true);
    const r = await falarComEstudo(nuvem, {
      acao: "corrigir", tema: `${estudo.titulo}: ${estudo.blocos[indice].titulo}`,
      pergunta: q.atual, resposta: resposta.trim(),
      antes: q.tentativas.map((t) => ({ enunciado: t.enunciado, resposta: t.resposta, veredito: t.veredito })),
    });
    setEnviando(false);
    if (r.erro) { notify(r.erro); return; }
    const tentativa = { enunciado: q.atual.enunciado, resposta: resposta.trim(), veredito: r.veredito, acertou: r.acertou || [], faltou: r.faltou || [], explicacao: r.explicacao || "" };
    const certo = r.veredito === "certo";
    /* o reforço é a próxima pergunta da vez; sem reforço (a IA não mandou),
       a mesma pergunta volta, e a pessoa tenta de novo com a explicação */
    const proxima = certo ? q.atual : (r.reforco || q.atual);
    const novo = estado.map((x, i) => (i === atual ? { ...x, tentativas: [...x.tentativas, tentativa], atual: proxima, ok: certo } : x));
    setResposta(""); setMostrarGabarito(false);
    gravar(novo);
    if (novo.every((x) => x.ok)) {
      const dePrimeira = novo.filter((x) => x.tentativas[0] && x.tentativas[0].veredito === "certo").length;
      const fracos = novo.filter((x) => !(x.tentativas[0] && x.tentativas[0].veredito === "certo"))
        .map((x) => ({ enunciado: x.original.enunciado, gabarito: x.original.gabarito }));
      onConcluir(dePrimeira, fracos);
    }
  };

  if (atual < 0 || concluido) {
    const dePrimeira = estado.filter((x) => x.tentativas[0] && x.tentativas[0].veredito === "certo").length;
    return (
      <Card className="px-6 py-8">
        <div className="flex flex-col items-center" style={{ textAlign: "center" }} data-teste="estudo-bloco-feito">
          <div data-estudo-anima="1" style={{ ...anima("estudoPulsa", 0, 0.9), fontSize: 58, lineHeight: 1 }}>🎉</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, marginTop: 12 }}>Bloco consolidado!</div>
          <div style={{ fontSize: 15.5, color: T.dim, marginTop: 6, lineHeight: 1.55 }}>
            {dePrimeira === 3 ? "As três certas de primeira. Mandou bem." : `${dePrimeira} de 3 certas de primeira, e o resto você fixou no reforço.`}
            {ultimo ? " Era o último bloco: a aula está completa." : " O próximo bloco já está liberado."}
          </div>
          <div className="flex flex-wrap justify-center gap-3" style={{ marginTop: 18 }}>
            {!ultimo ? (
              <button type="button" onClick={onProximo} data-teste="estudo-proximo-bloco"
                className="btn-neon" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 99, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                Próximo bloco <ChevronRight size={16} />
              </button>
            ) : null}
            <Btn tone="outline" onClick={onSair}>Ver os blocos</Btn>
          </div>
        </div>
      </Card>
    );
  }

  const reforco = q.tentativas.length > 0;
  return (
    <div className="flex flex-col gap-4" data-teste="estudo-checkpoint">
      <Card className="px-5 sm:px-6 py-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--neon)" }}>
            Checkpoint · pergunta {atual + 1} de {estado.length}
          </span>
          <div className="flex gap-1.5">
            {estado.map((x, i) => (
              <span key={i} style={{ width: 22, height: 6, borderRadius: 99, background: x.ok ? "var(--ok)" : i === atual ? "var(--neon)" : T.card3 }} />
            ))}
          </div>
        </div>
        {!reforco ? (
          <div style={{ fontSize: 14, color: T.faint, marginTop: 8 }}>
            Responda escrevendo, com as suas palavras. A IA corrige e, se faltar algo, pergunta de novo só aquilo.
          </div>
        ) : null}

        {ultimaTentativa ? (
          <div data-estudo-anima="1" data-teste="estudo-correcao" style={{ ...anima("estudoSobe"), marginTop: 14, padding: "14px 16px", borderRadius: 14, background: soft(VEREDITO_UI[ultimaTentativa.veredito].cor, 9), border: `1px solid ${soft(VEREDITO_UI[ultimaTentativa.veredito].cor, 40)}` }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{VEREDITO_UI[ultimaTentativa.veredito].emoji} {VEREDITO_UI[ultimaTentativa.veredito].rotulo}</div>
            {ultimaTentativa.acertou.length ? (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: T.dim, fontSize: 14.5, lineHeight: 1.55 }}>
                {ultimaTentativa.acertou.map((a, i) => <li key={i}><span style={{ color: "var(--ok)", fontWeight: 700 }}>Acertou:</span> {a}</li>)}
              </ul>
            ) : null}
            {ultimaTentativa.faltou.length ? (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: T.dim, fontSize: 14.5, lineHeight: 1.55 }}>
                {ultimaTentativa.faltou.map((a, i) => <li key={i}><span style={{ color: "var(--bad)", fontWeight: 700 }}>Faltou:</span> {a}</li>)}
              </ul>
            ) : null}
            {ultimaTentativa.explicacao ? <div style={{ fontSize: 15, lineHeight: 1.6, color: T.ink, marginTop: 10 }}>{ultimaTentativa.explicacao}</div> : null}
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          {reforco ? <div style={{ fontSize: 13, fontWeight: 800, color: "var(--warn)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 6 }}>Vamos fixar o que faltou</div> : null}
          <div className="flex items-start gap-2">
            {q.atual.tipo === "caso" ? <Stethoscope size={18} style={{ color: "var(--neon)", flexShrink: 0, marginTop: 3 }} /> : <Brain size={18} style={{ color: "var(--neon)", flexShrink: 0, marginTop: 3 }} />}
            <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.5, color: T.ink, whiteSpace: "pre-line" }} data-teste="estudo-pergunta">{q.atual.enunciado}</div>
          </div>
          <textarea value={resposta} onChange={(e) => setResposta(e.target.value)} rows={5} disabled={enviando}
            data-teste="estudo-resposta" placeholder="Escreva sua resposta…"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(); }}
            style={{ ...inp, marginTop: 12, fontSize: 15.5, lineHeight: 1.55, resize: "vertical" }} />
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 12 }}>
            <button type="button" onClick={enviar} disabled={enviando} data-teste="estudo-enviar"
              className="btn-neon" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 99, fontWeight: 700, fontSize: 15, cursor: enviando ? "default" : "pointer", opacity: enviando ? 0.7 : 1 }}>
              <Send size={15} /> {enviando ? "Corrigindo…" : "Enviar resposta"}
            </button>
            <Btn size="sm" tone="outline" onClick={onRever}><RotateCcw size={14} /> Rever os slides</Btn>
            {erradasSeguidas >= 2 && !mostrarGabarito ? (
              <Btn size="sm" tone="outline" onClick={() => setMostrarGabarito(true)}><Lightbulb size={14} /> Mostrar o que a resposta precisa ter</Btn>
            ) : null}
          </div>
          {mostrarGabarito ? (
            <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, background: T.card2, border: `1px dashed ${T.line2}` }}>
              <div style={{ fontSize: 13, color: T.faint, marginBottom: 4 }}>Leia, feche e responda com as suas palavras:</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14.5, lineHeight: 1.55, color: T.ink }}>
                {q.atual.gabarito.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
