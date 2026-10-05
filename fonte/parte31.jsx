/* ═══════════════════════════════════════════════════════════════════
   41 · FINANCEIRO (só do dono)

   O controle das finanças pessoais do dono do site. A aba só aparece
   para a conta do dono (regra "dono" em RECURSOS, no servidor e em
   parte11), e a IA dela (/api/financas-ia) recusa qualquer outra conta.

   Três jeitos de alimentar, todos levando ao mesmo lugar:
   · o último extrato (PDF, CSV, OFX ou fotos): a IA separa os gastos
     fixos, as rendas e os gastos avulsos, e o dono confere antes de
     salvar;
   · a conversa: o dono vai contando quanto recebe, cada gasto e quanto
     quer juntar por mês, e a IA registra (com desfazer);
   · à mão, nas listas.

   O resumo do mês é conta feita aqui, e não pela IA: renda menos fixos,
   menos os gastos do mês, menos a meta de economia.
   ═══════════════════════════════════════════════════════════════════ */

const CATEGORIAS_FIN = [
  "Moradia", "Contas da casa", "Mercado", "Alimentação fora", "Transporte", "Saúde",
  "Educação", "Assinaturas", "Lazer", "Compras", "Cartão de crédito", "Dívidas e empréstimos",
  "Investimentos", "Impostos e taxas", "Transferências", "Outros",
];
const TIPOS_EXTRATO = ".pdf,.csv,.ofx,.qfx,.txt,image/png,image/jpeg,image/webp";
const MAX_FOTOS_EXTRATO = 4;

const idFin = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const chaveDoNome = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/* Valor em reais como a pessoa digita: "1.500", "1.500,50", "120,90",
   "6500.50" e "R$ 80". Com vírgula, o ponto é de milhar; sem vírgula, o
   ponto só é de milhar quando vem seguido de três dígitos ("1.500"). */
const valorFin = (v) => {
  let n;
  if (typeof v === "number") n = v;
  else {
    let s = String(v == null ? "" : v).replace(/[R$\s]/g, "");
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    n = Number(s);
  }
  return Number.isFinite(n) && n > 0 ? Math.min(10000000, Math.round(n * 100) / 100) : 0;
};
const catFin = (c) => (CATEGORIAS_FIN.indexOf(String(c || "")) >= 0 ? String(c) : "Outros");
const dataFin = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) ? String(d) : "");
const diaFin = (d) => { const n = Math.round(Number(d)); return n >= 1 && n <= 31 ? n : 0; };

function reais(v) {
  const n = Number(v) || 0;
  try { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  catch (e) { return `R$ ${n.toFixed(2).replace(".", ",")}`; }
}

/* O que vem do armazenamento (ou da nuvem) passa por aqui antes de valer. */
function limparFinancas(f) {
  const o = f && typeof f === "object" ? f : {};
  const txt = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
  const lista = (a, max, fn) => (Array.isArray(a) ? a : []).map(fn).filter(Boolean).slice(0, max);
  const ue = o.ultimoExtrato && typeof o.ultimoExtrato === "object" ? o.ultimoExtrato : null;
  return {
    rendas: lista(o.rendas, 30, (r) => (r && txt(r.descricao, 60) && valorFin(r.valor)
      ? { id: txt(r.id, 40) || idFin(), descricao: txt(r.descricao, 60), valor: valorFin(r.valor) } : null)),
    fixos: lista(o.fixos, 80, (r) => (r && txt(r.descricao, 60) && valorFin(r.valor)
      ? { id: txt(r.id, 40) || idFin(), descricao: txt(r.descricao, 60), valor: valorFin(r.valor), dia: diaFin(r.dia), categoria: catFin(r.categoria) } : null)),
    gastos: lista(o.gastos, 3000, (r) => (r && txt(r.descricao, 80) && valorFin(r.valor) && dataFin(r.data)
      ? { id: txt(r.id, 40) || idFin(), descricao: txt(r.descricao, 80), valor: valorFin(r.valor), data: dataFin(r.data), categoria: catFin(r.categoria) } : null)),
    meta: valorFin(o.meta),
    conversa: lista(o.conversa, 60, (m) => (m && (m.papel === "eu" || m.papel === "ia") && txt(m.texto, 2000)
      ? { papel: m.papel, texto: txt(m.texto, 2000), em: Number(m.em) || 0, feitos: lista(m.feitos, 12, (x) => (typeof x === "string" ? x.slice(0, 120) : null)) } : null)),
    ultimoExtrato: ue && txt(ue.nome, 80)
      ? { nome: txt(ue.nome, 80), em: Number(ue.em) || 0, inicio: dataFin(ue.inicio), fim: dataFin(ue.fim) } : null,
  };
}

/* As ações da IA (ou do extrato) aplicadas ao financeiro. Renda e fixo
   com o mesmo nome substituem o antigo em vez de duplicar. Devolve o
   financeiro novo e uma frase curta por mudança, para a tela mostrar. */
function aplicarAcoesFin(fin, acoes) {
  const novo = { ...fin, rendas: [...fin.rendas], fixos: [...fin.fixos], gastos: [...fin.gastos] };
  const feitos = [];
  for (const a of Array.isArray(acoes) ? acoes : []) {
    if (!a || !a.tipo) continue;
    if (a.tipo === "meta") {
      novo.meta = valorFin(a.valor);
      feitos.push(novo.meta ? `Meta de economia: ${reais(novo.meta)} por mês` : "Meta de economia zerada");
    } else if (a.tipo === "remover") {
      const achado = [...novo.rendas, ...novo.fixos, ...novo.gastos].find((x) => x.id === a.id);
      if (!achado) continue;
      novo.rendas = novo.rendas.filter((x) => x.id !== a.id);
      novo.fixos = novo.fixos.filter((x) => x.id !== a.id);
      novo.gastos = novo.gastos.filter((x) => x.id !== a.id);
      feitos.push(`Removido: ${achado.descricao}`);
    } else if (a.tipo === "renda" && valorFin(a.valor) && a.descricao) {
      const k = chaveDoNome(a.descricao);
      novo.rendas = novo.rendas.filter((x) => chaveDoNome(x.descricao) !== k);
      novo.rendas.push({ id: idFin(), descricao: String(a.descricao).slice(0, 60), valor: valorFin(a.valor) });
      feitos.push(`Renda: ${a.descricao} ${reais(valorFin(a.valor))}`);
    } else if (a.tipo === "fixo" && valorFin(a.valor) && a.descricao) {
      const k = chaveDoNome(a.descricao);
      novo.fixos = novo.fixos.filter((x) => chaveDoNome(x.descricao) !== k);
      novo.fixos.push({ id: idFin(), descricao: String(a.descricao).slice(0, 60), valor: valorFin(a.valor), dia: diaFin(a.dia), categoria: catFin(a.categoria) });
      feitos.push(`Fixo: ${a.descricao} ${reais(valorFin(a.valor))}${diaFin(a.dia) ? ` (dia ${diaFin(a.dia)})` : ""}`);
    } else if (a.tipo === "gasto" && valorFin(a.valor) && a.descricao && dataFin(a.data)) {
      novo.gastos.push({ id: idFin(), descricao: String(a.descricao).slice(0, 80), valor: valorFin(a.valor), data: a.data, categoria: catFin(a.categoria) });
      feitos.push(`Gasto: ${a.descricao} ${reais(valorFin(a.valor))}`);
    }
  }
  return { fin: novo, feitos };
}

const soma = (l) => Math.round(l.reduce((t, x) => t + (Number(x.valor) || 0), 0) * 100) / 100;

function resumoDoMes(fin, mes) {
  const doMes = fin.gastos.filter((g) => g.data.slice(0, 7) === mes);
  const renda = soma(fin.rendas);
  const fixos = soma(fin.fixos);
  const variaveis = soma(doMes);
  const meta = fin.meta || 0;
  const porCategoria = {};
  for (const x of [...fin.fixos, ...doMes]) porCategoria[x.categoria] = (porCategoria[x.categoria] || 0) + x.valor;
  return {
    renda, fixos, variaveis, meta, doMes,
    sobra: Math.round((renda - fixos - variaveis - meta) * 100) / 100,
    /* O que dá para gastar sem mexer na meta. */
    podeGastar: Math.round((renda - fixos - meta) * 100) / 100,
    porCategoria: Object.entries(porCategoria).map(([c, v]) => [c, Math.round(v * 100) / 100]).sort((a, b) => b[1] - a[1]),
  };
}

/* A situação, em texto, para a IA da conversa: com o id de cada item,
   para ela poder remover ou corrigir. */
function situacaoParaIA(fin, mes) {
  const r = resumoDoMes(fin, mes);
  const linhas = [];
  linhas.push(`Mês em foco: ${mes}`);
  linhas.push("Rendas mensais:" + (fin.rendas.length ? "" : " nenhuma ainda"));
  fin.rendas.forEach((x) => linhas.push(`  [${x.id}] ${x.descricao}: ${x.valor}`));
  linhas.push("Gastos fixos:" + (fin.fixos.length ? "" : " nenhum ainda"));
  fin.fixos.forEach((x) => linhas.push(`  [${x.id}] ${x.descricao}: ${x.valor}${x.dia ? ` (dia ${x.dia})` : ""} · ${x.categoria}`));
  linhas.push(`Meta de economia por mês: ${fin.meta || 0}`);
  linhas.push(`Gastos avulsos do mês (${r.doMes.length}):`);
  r.doMes.slice(-80).forEach((x) => linhas.push(`  [${x.id}] ${x.data} ${x.descricao}: ${x.valor} · ${x.categoria}`));
  linhas.push(`Totais: renda ${r.renda}, fixos ${r.fixos}, gastos do mês ${r.variaveis}, meta ${r.meta}, sobra ${r.sobra}`);
  return linhas.join("\n");
}

async function falarComFinancas(nuvem, corpo) {
  const token = await pegarTokenDaConta(nuvem);
  if (!token) return { erro: "Entre na sua conta para usar o financeiro." };
  const { dados, erro } = await chamarApi("/api/financas-ia", { token, ...corpo }, "O financeiro");
  if (erro) return { erro };
  return dados && dados.erro ? { erro: dados.erro } : (dados || {});
}

const nomeDoMes = (mes) => {
  const [a, m] = mes.split("-").map(Number);
  const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${nomes[(m || 1) - 1]} de ${a}`;
};
const mudarMes = (mes, d) => {
  const [a, m] = mes.split("-").map(Number);
  const t = new Date(a, m - 1 + d, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
};

function Financeiro({ data, setData, notify, nuvem, today }) {
  const fin = useMemo(() => limparFinancas(data.financas), [data.financas]);
  const [mes, setMes] = useState(String(today || "").slice(0, 7) || new Date().toISOString().slice(0, 7));
  const r = useMemo(() => resumoDoMes(fin, mes), [fin, mes]);
  const gravar = useCallback((fn) => setData((p) => ({ ...p, financas: fn(limparFinancas(p.financas)) })), [setData]);

  return (
    <div className="flex flex-col gap-5" data-teste="financeiro">
      <ResumoFin r={r} mes={mes} setMes={setMes} />
      <ConversaFin fin={fin} gravar={gravar} nuvem={nuvem} mes={mes} today={today} notify={notify} />
      <ExtratoFin fin={fin} gravar={gravar} nuvem={nuvem} notify={notify} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ListaRendas fin={fin} gravar={gravar} />
        <MetaFin fin={fin} gravar={gravar} />
      </div>
      <ListaFixos fin={fin} gravar={gravar} />
      <GastosDoMes fin={fin} gravar={gravar} mes={mes} r={r} today={today} />
    </div>
  );
}

function ResumoFin({ r, mes, setMes }) {
  const usado = r.fixos + r.variaveis;
  const disponivel = Math.max(0, r.renda - r.meta);
  const fracao = disponivel > 0 ? Math.min(1, usado / disponivel) : 0;
  const cor = r.sobra < 0 ? "var(--bad)" : fracao > 0.85 ? "var(--warn)" : "var(--ok)";
  const maior = r.porCategoria.length ? r.porCategoria[0][1] : 0;
  return (
    <Card className="px-6 py-6" brilho="var(--ok)">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <H color="var(--ok)" icon={<Wallet size={16} />}>O mês</H>
        <div className="flex items-center gap-2">
          <Btn size="sm" tone="outline" onClick={() => setMes(mudarMes(mes, -1))} title="Mês anterior"><ChevronLeft size={14} /></Btn>
          <span data-teste="mes-financeiro" style={{ fontSize: 14, color: T.dim, minWidth: 140, textAlign: "center" }}>{nomeDoMes(mes)}</span>
          <Btn size="sm" tone="outline" onClick={() => setMes(mudarMes(mes, 1))} title="Próximo mês"><ChevronRight size={14} /></Btn>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 lg:grid-cols-5 gap-4" data-teste="resumo-financeiro">
        {[
          ["Renda", r.renda, T.ink],
          ["Fixos", r.fixos, T.ink],
          ["Gastos do mês", r.variaveis, T.ink],
          ["Meta de economia", r.meta, "var(--neon2)"],
          ["Sobra", r.sobra, cor],
        ].map(([rot, v, c]) => (
          <div key={rot}>
            <Num size={21} weight={700} color={c}>{reais(v)}</Num>
            <Label style={{ marginTop: 5 }}>{rot}</Label>
          </div>
        ))}
      </div>
      <div className="mt-5">
        <div style={{ height: 8, borderRadius: 99, background: T.card3, overflow: "hidden" }}>
          <div style={{ width: `${fracao * 100}%`, height: "100%", background: cor }} />
        </div>
        <Mini style={{ marginTop: 8, lineHeight: 1.6 }}>
          {r.renda
            ? `Gastou ${reais(usado)} de ${reais(disponivel)} que dá para gastar sem mexer na meta.${r.sobra < 0 ? " Passou do limite: a meta deste mês está comprometida." : ""}`
            : "Conte quanto recebe (na conversa ou em Renda) para o resumo fechar a conta."}
        </Mini>
      </div>
      {r.porCategoria.length ? (
        <div className="mt-5 pt-5 flex flex-col gap-2" style={{ borderTop: `1px solid ${T.line}` }}>
          <Label>Por categoria (fixos + gastos do mês)</Label>
          {r.porCategoria.slice(0, 8).map(([c, v]) => (
            <div key={c} className="flex items-center gap-3">
              <span style={{ width: "min(150px, 34%)", fontSize: 13.5, color: T.dim, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 99, background: T.card3, overflow: "hidden" }}>
                <div style={{ width: `${maior ? (v / maior) * 100 : 0}%`, height: "100%", background: "var(--neon)" }} />
              </div>
              <span style={{ fontFamily: F_MONO, fontSize: 13, color: T.ink, minWidth: 88, textAlign: "right" }}>{reais(v)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/* ── a conversa ──────────────────────────────────────────────────────── */
function ConversaFin({ fin, gravar, nuvem, mes, today, notify }) {
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [ouvindo, setOuvindo] = useState(false);
  const desfazer = useRef(null);
  const [podeDesfazer, setPodeDesfazer] = useState(false);
  const fim = useRef(null);
  const Reconhecedor = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

  useEffect(() => { if (fim.current) fim.current.scrollTop = fim.current.scrollHeight; }, [fin.conversa.length]);

  const mandar = async () => {
    const t = texto.trim();
    if (!t || ocupado) return;
    setErro(""); setOcupado(true);
    const minha = { papel: "eu", texto: t, em: Date.now(), feitos: [] };
    const historico = [...fin.conversa, minha];
    gravar((f) => ({ ...f, conversa: [...f.conversa, minha].slice(-60) }));
    setTexto("");
    const r = await falarComFinancas(nuvem, {
      acao: "conversa", hoje: today, situacao: situacaoParaIA(fin, mes),
      mensagens: historico.map((m) => ({ papel: m.papel, texto: m.texto })),
    });
    setOcupado(false);
    if (r.erro) { setErro(r.erro); return; }
    gravar((f) => {
      const { fin: novo, feitos } = aplicarAcoesFin(f, r.acoes || []);
      if (feitos.length) { desfazer.current = f; setPodeDesfazer(true); }
      const dela = { papel: "ia", texto: r.resposta || "Registrado.", em: Date.now(), feitos };
      return { ...novo, conversa: [...novo.conversa, dela].slice(-60) };
    });
  };

  const voltar = () => {
    const antes = desfazer.current;
    if (!antes) return;
    gravar((f) => ({ ...antes, conversa: [...f.conversa, { papel: "ia", texto: "Desfiz o último registro.", em: Date.now(), feitos: [] }].slice(-60) }));
    desfazer.current = null; setPodeDesfazer(false);
    notify("Último registro desfeito.");
  };

  const ditar = () => {
    if (!Reconhecedor || ouvindo) return;
    const rec = new Reconhecedor();
    rec.lang = "pt-BR"; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const dito = Array.from(e.results).map((x) => x[0].transcript).join(" ").trim();
      if (dito) setTexto((p) => (p ? `${p} ${dito}` : dito));
    };
    rec.onend = () => setOuvindo(false);
    rec.onerror = () => setOuvindo(false);
    setOuvindo(true);
    try { rec.start(); } catch (e) { setOuvindo(false); }
  };

  return (
    <Card className="px-6 py-6" brilho="var(--neon)">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <H color="var(--neon)" icon={<Sparkles size={16} />}>Converse com a IA</H>
        <div className="flex gap-2">
          {podeDesfazer ? <Btn size="sm" tone="outline" onClick={voltar}><RotateCcw size={13} /> desfazer o último</Btn> : null}
          {fin.conversa.length ? (
            <Btn size="sm" tone="outline" onClick={() => { gravar((f) => ({ ...f, conversa: [] })); desfazer.current = null; setPodeDesfazer(false); }}>limpar conversa</Btn>
          ) : null}
        </div>
      </div>
      <Mini style={{ marginTop: 8, lineHeight: 1.6 }}>
        Conte do seu jeito: "recebo 6.500 de salário", "gastei 120 no mercado hoje", "aluguel de 1.800 todo dia 5",
        "quero juntar 1.500 por mês", "onde dá para cortar?". A IA registra e diz quanto sobra.
      </Mini>
      <div ref={fim} className="mt-4 flex flex-col gap-3" data-teste="conversa-financeiro"
        style={{ maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
        {fin.conversa.map((m, i) => (
          <div key={i} className={`flex ${m.papel === "eu" ? "justify-end" : "justify-start"}`}>
            <div className="rounded-2xl px-4 py-3" style={{
              maxWidth: "85%", fontSize: 14.5, lineHeight: 1.55, whiteSpace: "pre-wrap",
              background: m.papel === "eu" ? soft("var(--neon)", 16) : T.card2,
              border: `1px solid ${m.papel === "eu" ? soft("var(--neon)", 30) : T.line}`, color: T.ink,
            }}>
              {m.texto}
              {m.feitos && m.feitos.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.feitos.map((x, j) => (
                    <span key={j} className="rounded-full px-2.5 py-1" style={{ fontSize: 12, background: soft("var(--ok)", 14), color: T.ok }}>
                      <Check size={11} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />{x}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {ocupado ? <Mini>pensando…</Mini> : null}
      </div>
      {erro ? <Mini style={{ marginTop: 10, color: T.bad }}>{erro}</Mini> : null}
      <div className="mt-4 flex gap-2 items-end">
        <textarea value={texto} rows={2} placeholder="Escreva (ou dite) o que quer registrar"
          data-teste="campo-financeiro"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); mandar(); } }}
          style={{ ...inp, flex: 1, resize: "vertical", minHeight: 48 }} />
        {Reconhecedor ? (
          <Btn tone="outline" onClick={ditar} title={ouvindo ? "Ouvindo…" : "Ditar"} disabled={ouvindo}><Mic size={16} /></Btn>
        ) : null}
        <Btn tone="primary" onClick={mandar} disabled={ocupado || !texto.trim()} title="Mandar"><Send size={16} /></Btn>
      </div>
    </Card>
  );
}

/* ── o extrato ───────────────────────────────────────────────────────── */
function ExtratoFin({ fin, gravar, nuvem, notify }) {
  const [estado, setEstado] = useState("");
  const [erro, setErro] = useState("");
  const [lido, setLido] = useState(null);       // { nome, fixos, rendas, avulsos, periodo, observacao }
  const [marcados, setMarcados] = useState({});
  const [lancarAvulsos, setLancarAvulsos] = useState(true);
  const campo = useRef(null);

  const abrir = async (arquivos) => {
    const lista = Array.from(arquivos || []);
    if (!lista.length) return;
    setErro(""); setLido(null);
    try {
      const fotos = lista.filter((a) => /^image\//i.test(a.type));
      const corpo = { acao: "extrato" };
      if (fotos.length) {
        if (fotos.length > MAX_FOTOS_EXTRATO) throw new Error(`Mande até ${MAX_FOTOS_EXTRATO} fotos de cada vez.`);
        corpo.imagens = [];
        for (let i = 0; i < fotos.length; i++) {
          setEstado(`preparando a foto ${i + 1} de ${fotos.length}`);
          corpo.imagens.push(await reduzirFoto(fotos[i]));
        }
      } else {
        const a = lista[0];
        corpo.texto = /\.pdf$/i.test(a.name) ? await lerPdfSoTexto(a, setEstado) : await a.text();
      }
      setEstado("a IA está lendo o extrato…");
      const r = await falarComFinancas(nuvem, corpo);
      setEstado("");
      if (r.erro) { setErro(r.erro); return; }
      const nomesFixos = (r.fixos || []).map((f) => chaveDoNome(f.descricao));
      const avulsos = (r.movimentos || []).filter((m) => m.tipo === "saida" && m.data
        && !nomesFixos.some((k) => k && chaveDoNome(m.descricao).includes(k)));
      const novo = { nome: lista.length > 1 ? `${lista.length} fotos` : lista[0].name, fixos: r.fixos || [], rendas: r.rendas || [], avulsos, periodo: r.periodo || {}, observacao: r.observacao || "" };
      const m = {};
      novo.fixos.forEach((_, i) => { m[`f${i}`] = true; });
      novo.rendas.forEach((_, i) => { m[`r${i}`] = true; });
      setMarcados(m);
      setLido(novo);
    } catch (e) {
      setEstado("");
      setErro((e && e.message) || "Não consegui ler esse arquivo.");
    }
  };

  const salvar = () => {
    if (!lido) return;
    const acoes = [
      ...lido.fixos.filter((_, i) => marcados[`f${i}`]).map((f) => ({ tipo: "fixo", ...f })),
      ...lido.rendas.filter((_, i) => marcados[`r${i}`]).map((x) => ({ tipo: "renda", ...x })),
    ];
    gravar((f) => {
      const { fin: novo } = aplicarAcoesFin(f, acoes);
      let gastos = novo.gastos;
      if (lancarAvulsos) {
        const ja = new Set(gastos.map((g) => `${g.data}|${g.valor}|${chaveDoNome(g.descricao)}`));
        const vindos = lido.avulsos
          .filter((m) => !ja.has(`${m.data}|${m.valor}|${chaveDoNome(m.descricao)}`))
          .map((m) => ({ id: idFin(), descricao: m.descricao, valor: m.valor, data: m.data, categoria: catFin(m.categoria) }));
        gastos = [...gastos, ...vindos];
      }
      return { ...novo, gastos, ultimoExtrato: { nome: lido.nome, em: Date.now(), inicio: lido.periodo.inicio || "", fim: lido.periodo.fim || "" } };
    });
    notify("Extrato salvo no financeiro.");
    setLido(null);
  };

  const caixa = (k, rotulo, valor, extra) => (
    <label key={k} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: T.card2, cursor: "pointer" }}>
      <input type="checkbox" checked={!!marcados[k]} onChange={(e) => setMarcados((p) => ({ ...p, [k]: e.target.checked }))} />
      <span style={{ flex: 1, fontSize: 14, color: T.ink }}>{rotulo}{extra ? <span style={{ color: T.faint, fontSize: 12.5 }}> · {extra}</span> : null}</span>
      <span style={{ fontFamily: F_MONO, fontSize: 13.5, color: T.ink }}>{reais(valor)}</span>
    </label>
  );

  return (
    <Card className="px-6 py-6">
      <H color="var(--a-GO)" icon={<Receipt size={16} />}>Último extrato</H>
      <Mini style={{ marginTop: 8, lineHeight: 1.6 }}>
        Mande o extrato do banco (PDF, CSV ou OFX) ou até {MAX_FOTOS_EXTRATO} fotos dele. A IA separa os gastos
        fixos, as rendas e os gastos avulsos; você confere antes de salvar.
        {fin.ultimoExtrato ? ` Último lido: ${fin.ultimoExtrato.nome}${fin.ultimoExtrato.inicio ? ` (${fin.ultimoExtrato.inicio.split("-").reverse().join("/")} a ${(fin.ultimoExtrato.fim || "").split("-").reverse().join("/")})` : ""}.` : ""}
      </Mini>
      <input ref={campo} type="file" accept={TIPOS_EXTRATO} multiple data-teste="importar-extrato" style={{ display: "none" }}
        onChange={(e) => { abrir(e.target.files); e.target.value = ""; }} />
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <Btn tone="primary" onClick={() => campo.current && campo.current.click()} disabled={!!estado}><Upload size={15} /> Mandar extrato</Btn>
        {estado ? <Mini>{estado}</Mini> : null}
      </div>
      {erro ? <Mini style={{ marginTop: 10, color: T.bad }}>{erro}</Mini> : null}

      {lido ? (
        <div className="mt-5 pt-5 flex flex-col gap-4" data-teste="revisao-extrato" style={{ borderTop: `1px solid ${T.line}` }}>
          {lido.observacao ? <Mini style={{ lineHeight: 1.6, color: T.dim }}>{lido.observacao}</Mini> : null}
          {lido.fixos.length ? (
            <div className="flex flex-col gap-2">
              <Label>Gastos fixos encontrados ({lido.fixos.length})</Label>
              {lido.fixos.map((f, i) => caixa(`f${i}`, f.descricao, f.valor, [f.dia ? `dia ${f.dia}` : "", f.categoria].filter(Boolean).join(" · ")))}
            </div>
          ) : <Mini>Nenhum gasto fixo apareceu nesse extrato.</Mini>}
          {lido.rendas.length ? (
            <div className="flex flex-col gap-2">
              <Label>Rendas encontradas ({lido.rendas.length})</Label>
              {lido.rendas.map((x, i) => caixa(`r${i}`, x.descricao, x.valor))}
            </div>
          ) : null}
          {lido.avulsos.length ? (
            <label className="flex items-center gap-3" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={lancarAvulsos} onChange={(e) => setLancarAvulsos(e.target.checked)} />
              <span style={{ fontSize: 14, color: T.dim }}>
                {lido.avulsos.length === 1
                  ? `Lançar também o gasto avulso do extrato (${reais(soma(lido.avulsos))}), no mês dele`
                  : `Lançar também os ${lido.avulsos.length} gastos avulsos do extrato (${reais(soma(lido.avulsos))}), cada um no mês dele`}
              </span>
            </label>
          ) : null}
          <div className="flex gap-2 flex-wrap">
            <Btn tone="primary" onClick={salvar}><Check size={15} /> Salvar no financeiro</Btn>
            <Btn tone="outline" onClick={() => setLido(null)}>descartar</Btn>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/* ── as listas, à mão ────────────────────────────────────────────────── */
function LinhaFin({ esquerda, detalhe, valor, onRemover }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: T.card2 }}>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 14, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{esquerda}</div>
        {detalhe ? <Mini style={{ marginTop: 2 }}>{detalhe}</Mini> : null}
      </div>
      <span style={{ fontFamily: F_MONO, fontSize: 13.5, color: T.ink }}>{reais(valor)}</span>
      <button type="button" onClick={onRemover} aria-label={`Remover ${esquerda}`}
        style={{ background: "none", border: "none", color: T.faint, cursor: "pointer", padding: 4 }}><X size={15} /></button>
    </div>
  );
}

const selectFin = { ...inp, appearance: "auto" };

function ListaRendas({ fin, gravar }) {
  const [d, setD] = useState(""); const [v, setV] = useState("");
  const add = () => {
    if (!d.trim() || !valorFin(v)) return;
    gravar((f) => aplicarAcoesFin(f, [{ tipo: "renda", descricao: d.trim(), valor: valorFin(v) }]).fin);
    setD(""); setV("");
  };
  return (
    <Card className="px-6 py-6">
      <H size={17} color="var(--ok)" icon={<TrendingUp size={15} />}>Renda por mês · {reais(soma(fin.rendas))}</H>
      <div className="mt-4 flex flex-col gap-2">
        {fin.rendas.map((x) => <LinhaFin key={x.id} esquerda={x.descricao} valor={x.valor}
          onRemover={() => gravar((f) => ({ ...f, rendas: f.rendas.filter((y) => y.id !== x.id) }))} />)}
      </div>
      <div className="mt-4 flex gap-2 flex-wrap">
        <TextInput value={d} placeholder="Ex.: Salário" onChange={(e) => setD(e.target.value)} style={{ flex: 2, minWidth: 140 }} />
        <TextInput value={v} placeholder="Valor" inputMode="decimal" onChange={(e) => setV(e.target.value)} style={{ flex: 1, minWidth: 90 }}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <Btn onClick={add}><Plus size={15} /></Btn>
      </div>
    </Card>
  );
}

function MetaFin({ fin, gravar }) {
  const [v, setV] = useState(fin.meta ? String(fin.meta).replace(".", ",") : "");
  useEffect(() => { setV(fin.meta ? String(fin.meta).replace(".", ",") : ""); }, [fin.meta]);
  const salvar = () => gravar((f) => ({ ...f, meta: valorFin(v) }));
  return (
    <Card className="px-6 py-6">
      <H size={17} color="var(--neon2)" icon={<PiggyBank size={15} />}>Quanto juntar por mês</H>
      <Mini style={{ marginTop: 8, lineHeight: 1.6 }}>
        A meta sai da conta antes de dizer quanto dá para gastar.
      </Mini>
      <div className="mt-4 flex gap-2">
        <TextInput value={v} placeholder="Ex.: 1.500" inputMode="decimal" data-teste="meta-financeiro"
          onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") salvar(); }} style={{ flex: 1 }} />
        <Btn onClick={salvar}>Salvar</Btn>
      </div>
    </Card>
  );
}

function ListaFixos({ fin, gravar }) {
  const [d, setD] = useState(""); const [v, setV] = useState(""); const [dia, setDia] = useState(""); const [c, setC] = useState("Moradia");
  const add = () => {
    if (!d.trim() || !valorFin(v)) return;
    gravar((f) => aplicarAcoesFin(f, [{ tipo: "fixo", descricao: d.trim(), valor: valorFin(v), dia: Number(dia) || 0, categoria: c }]).fin);
    setD(""); setV(""); setDia("");
  };
  const ordem = [...fin.fixos].sort((a, b) => (a.dia || 99) - (b.dia || 99));
  return (
    <Card className="px-6 py-6">
      <H size={17} color="var(--warn)" icon={<CalendarClock size={15} />}>Gastos fixos · {reais(soma(fin.fixos))} por mês</H>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-2">
        {ordem.map((x) => <LinhaFin key={x.id} esquerda={x.descricao}
          detalhe={[x.dia ? `dia ${x.dia}` : "", x.categoria].filter(Boolean).join(" · ")} valor={x.valor}
          onRemover={() => gravar((f) => ({ ...f, fixos: f.fixos.filter((y) => y.id !== x.id) }))} />)}
      </div>
      <div className="mt-4 flex gap-2 flex-wrap">
        <TextInput value={d} placeholder="Ex.: Aluguel" onChange={(e) => setD(e.target.value)} style={{ flex: 2, minWidth: 140 }} />
        <TextInput value={v} placeholder="Valor" inputMode="decimal" onChange={(e) => setV(e.target.value)} style={{ flex: 1, minWidth: 90 }} />
        <TextInput value={dia} placeholder="Dia" inputMode="numeric" onChange={(e) => setDia(e.target.value)} style={{ width: 70 }} />
        <select value={c} onChange={(e) => setC(e.target.value)} style={{ ...selectFin, flex: 1, minWidth: 140 }}>
          {CATEGORIAS_FIN.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <Btn onClick={add}><Plus size={15} /></Btn>
      </div>
    </Card>
  );
}

function GastosDoMes({ fin, gravar, mes, r, today }) {
  const [d, setD] = useState(""); const [v, setV] = useState(""); const [c, setC] = useState("Mercado");
  const [dia, setDia] = useState("");
  const padrao = String(today || "").slice(0, 7) === mes ? today : `${mes}-01`;
  const add = () => {
    if (!d.trim() || !valorFin(v)) return;
    gravar((f) => aplicarAcoesFin(f, [{ tipo: "gasto", descricao: d.trim(), valor: valorFin(v), data: dataFin(dia) || padrao, categoria: c }]).fin);
    setD(""); setV(""); setDia("");
  };
  const ordem = [...r.doMes].sort((a, b) => (a.data < b.data ? 1 : -1));
  return (
    <Card className="px-6 py-6">
      <H size={17} color="var(--a-PE)" icon={<Receipt size={15} />}>Gastos de {nomeDoMes(mes)} · {reais(r.variaveis)}</H>
      <div className="mt-4 flex flex-col gap-2" data-teste="gastos-do-mes">
        {ordem.length ? ordem.map((x) => <LinhaFin key={x.id} esquerda={x.descricao}
          detalhe={`${x.data.split("-").reverse().join("/")} · ${x.categoria}`} valor={x.valor}
          onRemover={() => gravar((f) => ({ ...f, gastos: f.gastos.filter((y) => y.id !== x.id) }))} />)
          : <Mini>Nenhum gasto avulso neste mês.</Mini>}
      </div>
      <div className="mt-4 flex gap-2 flex-wrap">
        <TextInput value={d} placeholder="Ex.: Mercado" onChange={(e) => setD(e.target.value)} style={{ flex: 2, minWidth: 140 }} />
        <TextInput value={v} placeholder="Valor" inputMode="decimal" onChange={(e) => setV(e.target.value)} style={{ flex: 1, minWidth: 90 }} />
        <TextInput type="date" value={dia || padrao} onChange={(e) => setDia(e.target.value)} style={{ width: 160 }} />
        <select value={c} onChange={(e) => setC(e.target.value)} style={{ ...selectFin, flex: 1, minWidth: 140 }}>
          {CATEGORIAS_FIN.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <Btn onClick={add}><Plus size={15} /></Btn>
      </div>
    </Card>
  );
}
