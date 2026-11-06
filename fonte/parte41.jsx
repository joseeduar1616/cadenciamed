/* ═══════════════════════════════════════════════════════════════════
   41 · MEU PLANO (plano pronto, lido do arquivo e reajustado sozinho)

   A pessoa já tem um plano de estudo (do cursinho, de um mentor, dela
   mesma) em PDF, Word, planilha ou foto. Ela manda o arquivo, a IA copia
   o plano para itens com dia, tipo e tempo (/api/plano-estudo), e daí em
   diante o site cuida do plano sozinho:

   - O que ela faz no resto do site conta: aula marcada no cronograma dá
     por feito o item daquela aula; sessão de questões da matéria dá por
     feito o item de questões. A mentora por voz também marca, quando a
     pessoa conta o que fez.
   - Não conseguiu fazer: o item não some nem fica vencido para sempre;
     ele vai para o próximo dia com espaço.
   - Gastou mais tempo que o plano previa: o ritmo dela (tempo real sobre
     tempo previsto) entra na conta, e cada dia passa a caber menos.
   - Fez a mais (adiantou itens): o dia que eles ocupariam fica livre e o
     que estava atrasado entra ali.

   Três decisões que moldam isto.

   1. O reajuste é conta, não IA. Roda a cada mudança, no aparelho, de
      graça e na hora, e dá sempre o mesmo resultado nos dois aparelhos
      (é o que deixa a sincronização juntar sem briga). A IA entra só para
      ler o arquivo, e a mentora explica o plano quando perguntam.
   2. O plano dela manda. Cada dia aguenta o tempo que o próprio plano
      dava para ele (mais a folga que ela escolher); dia de descanso do
      plano continua de descanso; nada é puxado para antes da data que o
      plano marcou; item fixo (simulado, prova) não sai do lugar.
   3. A ordem do plano se mantém: um item atrasado empurra os seguintes,
      em vez de o site embaralhar a sequência que alguém pensou.

   O que é puro fica entre "── o plano, sem tela" e "── a tela": o
   extrair_plano.py copia para _plano.mjs e o testar-plano.mjs confere.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_PLANO_ESTUDO = "/api/plano-estudo";

/* ── o plano, sem tela ─────────────────────────────────────────────── */

const TIPOS_ITEM_PLANO = ["aula", "questoes", "revisao", "flashcards", "simulado", "leitura", "outro"];
const ROTULO_TIPO_PLANO = {
  aula: "Aula", questoes: "Questões", revisao: "Revisão", flashcards: "Flashcards",
  simulado: "Simulado", leitura: "Leitura", outro: "Outro",
};
/* Quando o arquivo não dá o tempo, vale isto, e a tela mostra "tempo
   estimado" para a pessoa saber que não veio do plano. */
const MINUTOS_PADRAO_PLANO = { aula: 90, questoes: 60, revisao: 30, flashcards: 20, simulado: 240, leitura: 60, outro: 60 };
const MAX_ITENS_PLANO_ARQUIVO = 700;
const RITMO_MIN = 0.6;
const RITMO_MAX = 1.8;

const isoValido = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const somarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diasEntrePlano = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
const diaDaSemanaMeuPlano = (iso) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;

function minutosDoItemPlano(it) {
  const m = Number(it && it.minutos) || 0;
  return m > 0 ? m : (MINUTOS_PADRAO_PLANO[it && it.tipo] || 60);
}

/* O que pode ser guardado na conta: campos conferidos, teto de itens. */
function limparPlanoArquivo(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const txt = (x, n) => String(x == null ? "" : x).replace(/\s+/g, " ").trim().slice(0, n);
  const itens = (Array.isArray(v.itens) ? v.itens : []).slice(0, MAX_ITENS_PLANO_ARQUIVO)
    .filter((i) => i && typeof i === "object" && isoValido(i.dataOriginal) && txt(i.titulo, 90))
    .map((i, n) => ({
      id: txt(i.id, 40) || `p${n}`,
      ordem: Number.isFinite(Number(i.ordem)) ? Number(i.ordem) : n,
      dataOriginal: i.dataOriginal,
      data: isoValido(i.data) ? i.data : i.dataOriginal,
      titulo: txt(i.titulo, 90),
      tipo: TIPOS_ITEM_PLANO.indexOf(i.tipo) >= 0 ? i.tipo : "outro",
      minutos: Math.max(0, Math.min(720, Math.round(Number(i.minutos) || 0))),
      aula: txt(i.aula, 80),
      fixo: !!i.fixo,
      situacao: ["pendente", "feito", "parcial"].indexOf(i.situacao) >= 0 ? i.situacao : "pendente",
      ...(isoValido(i.feitoEm) ? { feitoEm: i.feitoEm } : {}),
      ...(Number(i.gastos) > 0 ? { gastos: Math.min(1440, Math.round(Number(i.gastos))) } : {}),
      ...(Number(i.restante) > 0 ? { restante: Math.min(720, Math.round(Number(i.restante))) } : {}),
      ...(i.auto ? { auto: true } : {}),
      ...(Array.isArray(i.sessoes) && i.sessoes.length ? { sessoes: i.sessoes.slice(0, 5).map((s) => txt(s, 40)) } : {}),
    }));
  if (!itens.length) return null;
  const capacidade = {};
  for (const [k, m] of Object.entries((v.capacidade && typeof v.capacidade === "object") ? v.capacidade : {})) {
    if (isoValido(k) && Number(m) > 0) capacidade[k] = Math.min(1440, Math.round(Number(m)));
  }
  return {
    nome: txt(v.nome, 60),
    importadoEm: isoValido(v.importadoEm) ? v.importadoEm : itens[0].dataOriginal,
    folga: Math.max(0, Math.min(240, Math.round(Number(v.folga) || 0))),
    ritmo: Math.max(RITMO_MIN, Math.min(RITMO_MAX, Number(v.ritmo) || 1)),
    capacidade,
    itens,
    historico: (Array.isArray(v.historico) ? v.historico : []).slice(-20)
      .filter((h) => h && isoValido(h.em) && txt(h.texto, 240)).map((h) => ({ em: h.em, texto: txt(h.texto, 240) })),
  };
}

/* O plano que acabou de chegar da IA vira o plano guardado. A capacidade
   de cada dia é o tempo que o próprio plano dava para ele. */
function planoDosItensLidos(lido, hoje) {
  const itens = (lido.itens || []).slice(0, MAX_ITENS_PLANO_ARQUIVO).map((i, n) => ({
    id: `p${n}-${String(i.data).replace(/-/g, "")}`,
    ordem: n,
    dataOriginal: i.data,
    data: i.data,
    titulo: i.titulo,
    tipo: TIPOS_ITEM_PLANO.indexOf(i.tipo) >= 0 ? i.tipo : "outro",
    minutos: Math.max(0, Math.round(Number(i.minutos) || 0)),
    aula: i.aula || "",
    fixo: !!i.fixo,
    situacao: "pendente",
  }));
  const capacidade = {};
  for (const i of itens) capacidade[i.dataOriginal] = (capacidade[i.dataOriginal] || 0) + minutosDoItemPlano(i);
  return limparPlanoArquivo({
    nome: lido.nome || "", importadoEm: hoje, folga: 0, ritmo: 1, capacidade, itens,
    historico: [{ em: hoje, texto: `Plano importado com ${itens.length} itens.` }],
  });
}

/* O que o resto do site já diz que foi feito. Só mexe em item que nunca
   foi marcado à mão; o que a pessoa marcou manda. */
function marcarPeloPainel(itens, { marks, sessions }, hoje) {
  const usadas = new Set();
  for (const i of itens) for (const s of (i.sessoes || [])) usadas.add(s);
  const doAssunto = new Map();
  for (const s of (sessions || [])) {
    if (!s || !s.subjectId || !isoValido(s.date)) continue;
    if (!doAssunto.has(s.subjectId)) doAssunto.set(s.subjectId, []);
    doAssunto.get(s.subjectId).push(s);
  }
  return itens.map((i) => {
    if (!i.aula) return i;
    const m = (marks || {})[i.aula];
    if (i.tipo === "aula") {
      if (i.situacao === "pendente" && m && m.aula) {
        const gastos = (doAssunto.get(i.aula) || []).filter((s) => ["Aula", "Apostila"].indexOf(s.kind) >= 0)
          .reduce((a, s) => a + (Number(s.minutes) || 0), 0);
        return { ...i, situacao: "feito", feitoEm: isoValido(m.date) && m.date <= hoje ? m.date : hoje, auto: true, ...(gastos > 0 ? { gastos } : {}) };
      }
      /* Desmarcou a aula: o item que o painel tinha dado por feito volta. */
      if (i.auto && i.situacao === "feito" && !(m && m.aula)) {
        const { feitoEm, gastos, auto, ...resto } = i;
        return { ...resto, situacao: "pendente" };
      }
      return i;
    }
    if (i.tipo === "questoes" && i.situacao === "pendente") {
      const desde = somarDias(i.dataOriginal < i.data ? i.dataOriginal : i.data, -3);
      const s = (doAssunto.get(i.aula) || [])
        .filter((x) => Number(x.questions) > 0 && x.date >= desde && x.date <= hoje && !usadas.has(String(x.id)))
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      if (s) {
        usadas.add(String(s.id));
        return { ...i, situacao: "feito", feitoEm: s.date, auto: true, sessoes: [String(s.id)], ...(Number(s.minutes) > 0 ? { gastos: Number(s.minutes) } : {}) };
      }
    }
    return i;
  });
}

/* Tempo real sobre tempo previsto, nos itens feitos com tempo informado.
   Precisa de três para valer: um dia ruim não muda o plano inteiro. */
function ritmoDoPlano(itens) {
  const feitos = itens.filter((i) => i.situacao === "feito" && Number(i.gastos) > 0);
  if (feitos.length < 3) return 1;
  const previsto = feitos.reduce((a, i) => a + minutosDoItemPlano(i), 0);
  const real = feitos.reduce((a, i) => a + Number(i.gastos), 0);
  const r = real / Math.max(1, previsto);
  return Math.round(Math.max(RITMO_MIN, Math.min(RITMO_MAX, r)) * 100) / 100;
}

/* O reajuste. Devolve o plano novo (ou o mesmo objeto, se nada mudou) e um
   resumo para a tela e para a mentora. */
function reajustarPlano(plano, painel, hoje) {
  if (!plano || !Array.isArray(plano.itens) || !plano.itens.length || !isoValido(hoje)) {
    return { plano, mudou: false, resumo: null };
  }
  let itens = marcarPeloPainel(plano.itens.map((i) => ({ ...i })), painel || {}, hoje);
  const ritmo = ritmoDoPlano(itens);

  /* Quanto cada dia aguenta: o que o plano dava para ele. Depois do fim do
     plano, a média daquele dia da semana dentro do plano (para o que
     transbordar ter onde cair sem inventar dia de descanso). */
  const capacidade = { ...(plano.capacidade || {}) };
  if (!Object.keys(capacidade).length) for (const i of itens) capacidade[i.dataOriginal] = (capacidade[i.dataOriginal] || 0) + minutosDoItemPlano(i);
  const fimOriginal = itens.reduce((a, i) => (i.dataOriginal > a ? i.dataOriginal : a), itens[0].dataOriginal);
  const inicioOriginal = itens.reduce((a, i) => (i.dataOriginal < a ? i.dataOriginal : a), itens[0].dataOriginal);
  const porDiaSemana = [0, 0, 0, 0, 0, 0, 0], diasNaSemana = [0, 0, 0, 0, 0, 0, 0];
  for (let d = inicioOriginal, n = 0; d <= fimOriginal && n < 800; d = somarDias(d, 1), n += 1) {
    const w = diaDaSemanaMeuPlano(d);
    porDiaSemana[w] += capacidade[d] || 0;
    diasNaSemana[w] += 1;
  }
  const mediaGeral = Math.max(30, Math.round(Object.values(capacidade).reduce((a, x) => a + x, 0) / Math.max(1, Object.keys(capacidade).length)));
  const folga = Math.max(0, Number(plano.folga) || 0);
  const capDe = (d) => {
    let c;
    if (d <= fimOriginal) c = capacidade[d] || 0;
    else {
      const w = diaDaSemanaMeuPlano(d);
      c = diasNaSemana[w] ? Math.round(porDiaSemana[w] / diasNaSemana[w]) : 0;
      if (!porDiaSemana.some((x) => x > 0)) c = mediaGeral;
    }
    return c > 0 ? c + folga : 0;
  };

  const usado = {};
  const usar = (d, m) => { usado[d] = (usado[d] || 0) + m; };
  for (const i of itens) {
    if (i.situacao === "feito" && i.feitoEm === hoje) usar(hoje, Number(i.gastos) || minutosDoItemPlano(i));
  }
  for (const i of itens) {
    if (i.fixo && i.situacao !== "feito") { i.data = i.dataOriginal; if (i.data >= hoje) usar(i.data, minutosDoItemPlano(i)); }
  }

  const fila = itens.filter((i) => !i.fixo && i.situacao !== "feito")
    .sort((a, b) => (a.dataOriginal.localeCompare(b.dataOriginal)) || (a.ordem - b.ordem));
  let anterior = hoje;
  for (const i of fila) {
    const base = i.situacao === "parcial" && Number(i.restante) > 0 ? Number(i.restante) : minutosDoItemPlano(i);
    const est = Math.max(5, Math.round(base * ritmo));
    let d = [hoje, i.dataOriginal, anterior].sort().pop();
    for (let n = 0; n < 900; n += 1, d = somarDias(d, 1)) {
      const cap = capDe(d);
      if (!cap) continue;
      const livre = cap - (usado[d] || 0);
      /* Cabe, ou passa do dia em no máximo meia hora: o resto de uma aula
         feita em parte não empurra o dia inteiro para a frente. */
      if (!usado[d] || livre >= est * 0.85 || est - livre <= 30) break;
    }
    i.data = d;
    usar(d, est);
    anterior = d;
  }

  for (const i of itens) if (i.situacao === "feito") i.data = i.feitoEm || i.data;

  const fimPrevisto = itens.reduce((a, i) => (i.data > a ? i.data : a), fimOriginal);
  const pendentes = itens.filter((i) => i.situacao !== "feito");
  const resumo = {
    total: itens.length,
    feitos: itens.length - pendentes.length,
    ritmo,
    fimOriginal,
    fimPrevisto,
    diasDeAtraso: Math.max(0, diasEntrePlano(fimOriginal, fimPrevisto)),
    atrasados: pendentes.filter((i) => i.dataOriginal < hoje).length,
    adiados: pendentes.filter((i) => i.data > i.dataOriginal).length,
    hoje: itens.filter((i) => i.data === hoje).sort((a, b) => a.ordem - b.ordem),
    minutosHoje: itens.filter((i) => i.data === hoje && i.situacao !== "feito")
      .reduce((a, i) => a + Math.round((i.situacao === "parcial" && i.restante ? i.restante : minutosDoItemPlano(i)) * ritmo), 0),
  };

  const antes = JSON.stringify(plano.itens.map((i) => [i.id, i.data, i.situacao, i.gastos || 0, i.auto || 0]));
  const depois = JSON.stringify(itens.map((i) => [i.id, i.data, i.situacao, i.gastos || 0, i.auto || 0]));
  if (antes === depois && Number(plano.ritmo || 1) === ritmo) return { plano, mudou: false, resumo };

  /* Uma linha no histórico por dia, dizendo o que mudou de verdade. */
  const remarcados = itens.filter((i, n) => i.situacao !== "feito" && plano.itens[n] && plano.itens[n].data !== i.data).length;
  const autoFeitos = itens.filter((i, n) => i.auto && i.situacao === "feito" && plano.itens[n] && plano.itens[n].situacao !== "feito").length;
  const partes = [];
  if (autoFeitos) partes.push(`${autoFeitos} ${autoFeitos === 1 ? "item dado por feito" : "itens dados por feitos"} pelo que você marcou no site`);
  if (remarcados) partes.push(`${remarcados} ${remarcados === 1 ? "item remarcado" : "itens remarcados"}`);
  if (ritmo !== Number(plano.ritmo || 1)) partes.push(`seu ritmo agora é ${Math.round(ritmo * 100)}% do tempo previsto`);
  partes.push(resumo.diasDeAtraso ? `o plano termina em ${fimPrevisto.split("-").reverse().join("/")}, ${resumo.diasDeAtraso} ${resumo.diasDeAtraso === 1 ? "dia" : "dias"} depois do previsto` : "o plano segue no prazo");
  let historico = (plano.historico || []).slice();
  if (autoFeitos || remarcados || ritmo !== Number(plano.ritmo || 1)) {
    const texto = partes.join("; ") + ".";
    if (historico.length && historico[historico.length - 1].em === hoje) historico[historico.length - 1] = { em: hoje, texto };
    else historico.push({ em: hoje, texto });
    historico = historico.slice(-20);
  }
  return { plano: { ...plano, itens, ritmo, historico }, mudou: true, resumo };
}

/* Achar o item do plano pelo jeito que a pessoa falou (a mentora por voz
   manda o título como ouviu). Prefere o de hoje, depois o mais próximo. */
function acharItemDoPlano(plano, titulo, hoje) {
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const alvo = norm(titulo);
  if (!plano || !alvo.length) return null;
  let melhor = null, nota = 0;
  for (const i of plano.itens || []) {
    const p = norm(i.titulo);
    const comuns = alvo.filter((w) => p.indexOf(w) >= 0).length;
    if (!comuns) continue;
    let n = comuns / Math.max(alvo.length, 1);
    if (i.data === hoje) n += 0.3;
    if (i.situacao !== "feito") n += 0.2;
    n -= Math.min(0.2, Math.abs(diasEntrePlano(hoje, i.data)) / 100);
    if (n > nota) { nota = n; melhor = i; }
  }
  return nota >= 0.45 ? melhor : null;
}

/* Marcar um item: feito (com o tempo que levou), feito em parte (com o
   quanto falta) ou de volta a pendente. */
function atualizarItemPlano(plano, id, situacao, { minutos, restante } = {}, hoje) {
  if (!plano) return plano;
  const itens = plano.itens.map((i) => {
    if (i.id !== id) return i;
    const { feitoEm, gastos, restante: r0, auto, sessoes, ...base } = i;
    if (situacao === "feito") return { ...base, situacao: "feito", feitoEm: hoje, ...(Number(minutos) > 0 ? { gastos: Math.round(Number(minutos)) } : {}) };
    if (situacao === "parcial") {
      const falta = Number(restante) > 0 ? Math.round(Number(restante)) : Math.max(5, Math.round(minutosDoItemPlano(i) / 2));
      return { ...base, situacao: "parcial", restante: falta, ...(Number(minutos) > 0 ? { gastos: Math.round(Number(minutos)) } : {}) };
    }
    return { ...base, situacao: "pendente" };
  });
  return { ...plano, itens };
}

/* Para a mentora e o Assistente: o plano em poucas linhas. */
function resumoDoPlanoParaIA(plano, hoje) {
  if (!plano) return "";
  const r = reajustarPlano(plano, {}, hoje).resumo;
  if (!r) return "";
  const hojeTxt = r.hoje.length
    ? r.hoje.map((i) => `${i.situacao === "feito" ? "[feito] " : i.situacao === "parcial" ? "[em parte] " : ""}${i.titulo} (${ROTULO_TIPO_PLANO[i.tipo]}, ${minutosDoItemPlano(i)} min)`).join("; ")
    : "nada marcado para hoje";
  const proximos = (plano.itens || []).filter((i) => i.situacao !== "feito" && i.data > hoje)
    .sort((a, b) => a.data.localeCompare(b.data) || a.ordem - b.ordem).slice(0, 8)
    .map((i) => `${i.data.split("-").reverse().slice(0, 2).join("/")} ${i.titulo}`).join("; ");
  return `PLANO DE ESTUDO DA PESSOA${plano.nome ? ` (${plano.nome})` : ""}: ${r.feitos} de ${r.total} itens feitos; ritmo ${Math.round(r.ritmo * 100)}% do tempo previsto; ${r.atrasados} itens que ficaram para trás já foram remarcados; termina em ${r.fimPrevisto.split("-").reverse().join("/")}${r.diasDeAtraso ? ` (${r.diasDeAtraso} dias depois do previsto, ${r.fimOriginal.split("-").reverse().join("/")})` : " (no prazo)"}.
HOJE NO PLANO: ${hojeTxt}.
PRÓXIMOS: ${proximos || "nada pendente"}.`;
}

/* ── a tela ──────────────────────────────────────────────────────────── */

/* Fica na raiz do app: o plano se reajusta com qualquer aba aberta,
   quando muda o dia, quando uma aula é marcada, quando entra uma sessão. */
function usePlanoAutomatico(data, setData, today) {
  const plano = data.planoArquivo;
  useEffect(() => {
    if (!plano) return;
    const r = reajustarPlano(plano, { marks: data.marks, sessions: data.sessions }, today);
    if (!r.mudou) return;
    setData((p) => {
      if (!p.planoArquivo) return p;
      const de = reajustarPlano(p.planoArquivo, { marks: p.marks, sessions: p.sessions }, today);
      return de.mudou ? { ...p, planoArquivo: de.plano } : p;
    });
  }, [plano, data.marks, data.sessions, today, setData]);
}

/* Arquivo do plano virando texto: os mesmos leitores do resto do app, mais
   a planilha (cada linha vira uma linha de texto, com as colunas
   separadas por " | "). */
async function textoDoArquivoDoPlano(arquivo, nuvem, aviso) {
  const nome = String(arquivo.name || "");
  if (/\.xlsx$/i.test(nome)) {
    aviso("lendo a planilha");
    const folhas = lerXlsx(new Uint8Array(await arquivo.arrayBuffer()), unzipSync);
    const partes = [];
    for (const [nomeFolha, linhas] of Object.entries(folhas || {})) {
      partes.push(`# ${nomeFolha}`);
      for (const n of Object.keys(linhas).map(Number).sort((a, b) => a - b)) {
        const l = linhas[n];
        const cels = Object.keys(l).sort((a, b) => (a.length - b.length) || a.localeCompare(b)).map((c) => String(l[c] == null ? "" : l[c]).trim());
        if (cels.some(Boolean)) partes.push(cels.join(" | "));
      }
    }
    return { texto: partes.join("\n") };
  }
  if (/\.xls$/i.test(nome)) return { erro: "Planilha .xls antiga: salve como .xlsx e mande de novo." };
  if (/\.csv$/i.test(nome) || /\.tsv$/i.test(nome)) { aviso("lendo o arquivo"); return { texto: await arquivo.text() }; }
  if (/\.pptx$/i.test(nome)) return { texto: (await lerPptxComFiguras(arquivo, aviso, { semFiguras: true })).texto };
  return textoDeAnexo(arquivo, nuvem, aviso);
}

const CORES_TIPO_PLANO = {
  aula: "var(--a-CL)", questoes: "var(--a-CI)", revisao: "var(--ok)", flashcards: "var(--neon)",
  simulado: "var(--warn)", leitura: "var(--a-GO)", outro: "var(--dim)",
};

function ItemDoPlano({ i, hoje, ritmo, aoMudar }) {
  const [tempo, setTempo] = useState("");
  const [abrir, setAbrir] = useState(false);
  const feito = i.situacao === "feito";
  const est = Math.round((i.situacao === "parcial" && i.restante ? i.restante : minutosDoItemPlano(i)) * (ritmo || 1));
  return (
    <div className="rounded-2xl px-3.5 py-3" data-teste="item-plano"
      style={{ background: feito ? soft("var(--ok)", 9) : T.card2, border: `1px solid ${feito ? soft("var(--ok)", 35) : T.line}` }}>
      <div className="flex items-start gap-3">
        <button type="button" aria-label={feito ? "Desmarcar" : "Marcar como feito"}
          onClick={() => aoMudar(i, feito ? "pendente" : "feito", {})}
          className="rounded-lg flex items-center justify-center"
          style={{ width: 26, height: 26, flexShrink: 0, marginTop: 1, cursor: "pointer", border: `1.5px solid ${feito ? "var(--ok)" : T.line}`, background: feito ? "var(--ok)" : "transparent", color: "#fff" }}>
          {feito ? <Check size={15} /> : null}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 650, color: T.ink, textDecoration: feito ? "line-through" : "none", opacity: feito ? 0.75 : 1 }}>{i.titulo}</div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 99, padding: "1px 8px", background: soft(CORES_TIPO_PLANO[i.tipo], 16), color: CORES_TIPO_PLANO[i.tipo] }}>{ROTULO_TIPO_PLANO[i.tipo]}</span>
            <Mini>{feito ? (i.gastos ? `feito em ${fmtMin(i.gastos)}` : "feito") : `${fmtMin(est)}${i.minutos ? "" : " estimado"}`}</Mini>
            {i.situacao === "parcial" ? <Mini style={{ color: T.warn }}>em parte, faltam {fmtMin(i.restante || 0)}</Mini> : null}
            {!feito && i.data > i.dataOriginal ? <Mini style={{ color: T.warn }}>era {brDate(i.dataOriginal)}</Mini> : null}
            {i.fixo ? <Mini>data fixa</Mini> : null}
            {i.auto && feito ? <Mini>marcado pelo site</Mini> : null}
          </div>
          {abrir && !feito ? (
            <div className="mt-2.5 flex items-end gap-2 flex-wrap">
              <Field label="Quanto tempo levou (min)">
                <TextInput type="number" min="0" value={tempo} onChange={(e) => setTempo(e.target.value)} style={{ width: 120 }} />
              </Field>
              <Btn size="sm" tone="primary" onClick={() => { aoMudar(i, "feito", { minutos: Number(tempo) || 0 }); setAbrir(false); }}>Fiz tudo</Btn>
              <Btn size="sm" tone="outline" onClick={() => { aoMudar(i, "parcial", { minutos: Number(tempo) || 0 }); setAbrir(false); }}>Fiz uma parte</Btn>
            </div>
          ) : null}
        </div>
        {!feito ? (
          <button type="button" onClick={() => setAbrir((v) => !v)} aria-label="Contar como foi"
            style={{ cursor: "pointer", color: T.dim, background: "transparent", border: 0, padding: 4 }}>
            <Clock size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* O cartão do dia, em Hoje: o que o plano pede hoje, com o toque de feito. */
function PlanoDeHoje({ data, setData, today, onAbrir }) {
  const plano = data.planoArquivo;
  const r = useMemo(() => (plano ? reajustarPlano(plano, {}, today).resumo : null), [plano, today]);
  if (!plano || !r) return null;
  const mudar = (i, situacao, extra) => setData((p) => ({ ...p, planoArquivo: atualizarItemPlano(p.planoArquivo, i.id, situacao, extra, today) }));
  return (
    <Card className="px-5 sm:px-6 py-5" >
      <div data-teste="plano-de-hoje">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <H size={17} color="var(--neon)" icon={<ListTodo size={15} />}>Seu plano hoje</H>
          <Btn size="sm" tone="quiet" onClick={onAbrir}>ver o plano</Btn>
        </div>
        <Mini style={{ marginTop: 6 }}>
          {r.hoje.length ? `${r.hoje.filter((i) => i.situacao === "feito").length} de ${r.hoje.length} feitos · ${fmtMin(r.minutosHoje)} pela frente` : "O plano não tem nada para hoje."}
          {r.diasDeAtraso ? ` · termina ${r.diasDeAtraso} ${r.diasDeAtraso === 1 ? "dia" : "dias"} depois do previsto` : ""}
        </Mini>
        <div className="mt-3 flex flex-col gap-2">
          {r.hoje.slice(0, 6).map((i) => <ItemDoPlano key={i.id} i={i} hoje={today} ritmo={r.ritmo} aoMudar={mudar} />)}
        </div>
      </div>
    </Card>
  );
}

function MeuPlano({ data, setData, today, notify, nuvem, abrirAssistente }) {
  const plano = data.planoArquivo;
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [erro, setErro] = useState("");
  const [inicio, setInicio] = useState(today);
  const [colar, setColar] = useState("");
  const [verTudo, setVerTudo] = useState(false);
  const arquivoRef = useRef(null);

  const r = useMemo(() => (plano ? reajustarPlano(plano, {}, today).resumo : null), [plano, today]);
  const mudar = (i, situacao, extra) => setData((p) => ({ ...p, planoArquivo: atualizarItemPlano(p.planoArquivo, i.id, situacao, extra, today) }));

  const curriculo = useMemo(() => {
    const lista = montarCurriculo(data.cronogramaProprio).lista || [];
    return lista.slice(0, 400).map((s) => ({ id: s.id, t: `${s.esp ? `${s.esp}: ` : ""}${s.title || s.titulo || ""}` }));
  }, [data.cronogramaProprio]);

  const ler = async (texto) => {
    setErro("");
    if (String(texto || "").trim().length < 20) { setErro("O arquivo veio sem texto para ler."); return; }
    setProgresso("a IA está lendo o seu plano");
    const token = await pegarTokenDaConta(nuvem);
    const { dados, erro: falha } = await chamarApi(ROTA_PLANO_ESTUDO, { token, texto, inicio, hoje: today, curriculo }, "A leitura do plano");
    setProgresso("");
    if (falha || !dados || !dados.ok) { setErro(falha || "Não consegui ler o plano."); return; }
    if (plano && !window.confirm("Trocar o plano atual por este? O que estava marcado no plano atual se perde (o resto do site não muda).")) return;
    const novo = planoDosItensLidos(dados, today);
    if (!novo) { setErro("Não consegui montar o plano com o que a IA leu."); return; }
    setData((p) => ({ ...p, planoArquivo: novo }));
    setColar("");
    notify(`Plano importado: ${novo.itens.length} itens.${dados.ignoradas ? ` ${dados.ignoradas} linhas ficaram de fora.` : ""}${dados.cortadoEntrada || dados.cortadoSaida ? " O arquivo era grande e parte ficou de fora." : ""}`);
  };

  const escolherArquivo = async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    setOcupado(true);
    try {
      const t = await textoDoArquivoDoPlano(f, nuvem, setProgresso);
      if (t.erro) setErro(t.erro);
      else await ler(t.texto);
    } catch (e) {
      setErro((e && e.message) || "Não consegui ler o arquivo.");
    }
    setProgresso("");
    setOcupado(false);
  };

  const dias = useMemo(() => {
    if (!plano) return [];
    const m = new Map();
    for (const i of plano.itens) {
      if (!verTudo && i.data < today && i.situacao === "feito") continue;
      if (!m.has(i.data)) m.set(i.data, []);
      m.get(i.data).push(i);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, verTudo ? 400 : 21);
  }, [plano, today, verTudo]);

  return (
    <div className="flex flex-col gap-5" data-teste="meu-plano">
      <Card className="px-5 sm:px-6 py-6">
        <H color="var(--neon)" icon={<ListTodo size={16} />}>Meu plano</H>
        <Texto style={{ marginTop: 8 }}>
          Mande o plano de estudo que você já tem (PDF, Word, planilha, foto ou texto colado). A IA copia o plano para
          dias e itens, e daí em diante o site reajusta sozinho: o que você não fez vai para o próximo dia com espaço,
          o que demorou mais entra no seu ritmo, e o que você adiantou libera espaço para o que ficou para trás.
        </Texto>

        {plano && r ? (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3" data-teste="plano-resumo">
            <Estatistica titulo="feitos" valor={`${r.feitos}/${r.total}`} />
            <Estatistica titulo="seu ritmo" valor={`${Math.round(r.ritmo * 100)}%`} dica="tempo real sobre o previsto" />
            <Estatistica titulo="remarcados" valor={String(r.adiados)} />
            <Estatistica titulo="termina em" valor={brDate(r.fimPrevisto)} dica={r.diasDeAtraso ? `${r.diasDeAtraso} ${r.diasDeAtraso === 1 ? "dia" : "dias"} depois do previsto` : "no prazo"} />
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="O plano começa em (para planos com semanas ou dias numerados)">
              <TextInput type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </Field>
            {plano ? (
              <Field label="Folga por dia, para absorver atraso (min)">
                <TextInput type="number" min="0" max="240" value={plano.folga || 0}
                  onChange={(e) => { const v = Math.max(0, Math.min(240, Number(e.target.value) || 0)); setData((p) => ({ ...p, planoArquivo: { ...p.planoArquivo, folga: v } })); }} />
              </Field>
            ) : null}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Btn size="sm" tone="primary" disabled={ocupado || !!progresso} onClick={() => arquivoRef.current && arquivoRef.current.click()}>
              <Upload size={14} /> {plano ? "trocar o plano por outro arquivo" : "mandar o arquivo do plano"}
            </Btn>
            <input ref={arquivoRef} type="file" accept=".pdf,.docx,.pptx,.xlsx,.csv,.tsv,.txt,.md,image/png,image/jpeg,image/webp" onChange={escolherArquivo} style={{ display: "none" }} data-teste="plano-arquivo" />
            {plano && abrirAssistente ? <Btn size="sm" tone="outline" onClick={abrirAssistente}><Sparkles size={14} /> conversar com a mentora sobre o plano</Btn> : null}
            {plano ? (
              <Btn size="sm" tone="danger" onClick={() => { if (window.confirm("Tirar o plano? O resto do site não muda.")) setData((p) => ({ ...p, planoArquivo: null })); }}>tirar o plano</Btn>
            ) : null}
          </div>
          <details>
            <summary style={{ cursor: "pointer", fontSize: 13.5, color: T.dim }}>ou colar o plano em texto</summary>
            <div className="mt-2 flex flex-col gap-2">
              <Area value={colar} onChange={(e) => setColar(e.target.value)} placeholder={"Exemplo:\nSemana 1\nSegunda: Cardiologia, aula de 2h e 30 questões\nTerça: Nefrologia, aula de 1h30"} />
              <div><Btn size="sm" tone="outline" disabled={ocupado || !!progresso || colar.trim().length < 20} onClick={async () => { setOcupado(true); await ler(colar); setOcupado(false); }}>ler o plano colado</Btn></div>
            </div>
          </details>
          {progresso ? <Mini style={{ color: "var(--neon)" }}>{progresso}…</Mini> : null}
          {erro ? <Mini style={{ color: T.bad }}>{erro}</Mini> : null}
        </div>
      </Card>

      {plano ? (
        <Card className="px-5 sm:px-6 py-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <H size={17} color="var(--a-PE)" icon={<CalendarDays size={15} />}>{plano.nome || "O plano, dia a dia"}</H>
            <Btn size="sm" tone="quiet" onClick={() => setVerTudo((v) => !v)}>{verTudo ? "só os próximos dias" : "ver o plano inteiro"}</Btn>
          </div>
          <div className="mt-4 flex flex-col gap-5">
            {dias.map(([dia, itens]) => (
              <div key={dia}>
                <Label style={{ color: dia === today ? "var(--neon)" : dia < today ? T.warn : T.dim }}>
                  {dia === today ? "hoje · " : ""}{DIAS_SEMANA_LONGO[new Date(`${dia}T12:00:00`).getDay()]}, {brDate(dia)}
                </Label>
                <div className="mt-2 flex flex-col gap-2">
                  {itens.sort((a, b) => a.ordem - b.ordem).map((i) => <ItemDoPlano key={i.id} i={i} hoje={today} ritmo={r ? r.ritmo : 1} aoMudar={mudar} />)}
                </div>
              </div>
            ))}
            {!dias.length ? <Mini>Nada pendente no plano. Tudo feito.</Mini> : null}
          </div>
        </Card>
      ) : null}

      {plano && (plano.historico || []).length ? (
        <Card className="px-5 sm:px-6 py-5">
          <H size={16} color="var(--dim)" icon={<RefreshCw size={14} />}>O que o site já reajustou</H>
          <div className="mt-3 flex flex-col gap-1.5">
            {plano.historico.slice().reverse().map((h, n) => <Mini key={n}><b>{brDate(h.em)}</b> · {h.texto}</Mini>)}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Estatistica({ titulo, valor, dica }) {
  return (
    <div className="rounded-2xl px-3.5 py-3" style={{ background: T.card2, border: `1px solid ${T.line}` }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: T.ink, fontFamily: F_MONO }}>{valor}</div>
      <Mini>{titulo}</Mini>
      {dica ? <Mini style={{ fontSize: 11.5 }}>{dica}</Mini> : null}
    </div>
  );
}
