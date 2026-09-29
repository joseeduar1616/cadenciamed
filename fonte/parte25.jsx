/* ═══════════════════════════════════════════════════════════════════
   32 · PLANO DO MÊS: METAS, ALIMENTAÇÃO E CONTROLE DIÁRIO

   A aba Treino cuidava só da academia. Isto põe ao lado dela o resto de
   um plano de emagrecimento de verdade, que é o que a planilha do dono
   trazia em cinco abas: as metas do mês, o cardápio, o controle diário
   e o resumo por semana.

   O plano ENTRA PELA PLANILHA, lida aqui no navegador. Não está escrito
   no código de propósito: peso, altura e cintura de alguém não podem ir
   no pacote público do site, que qualquer pessoa baixa. Lida do arquivo,
   a informação vai direto para os dados da conta, e só dela.

   A planilha é um .xlsx, que por dentro é um zip de XML. O fflate já
   está no pacote por causa do leitor de Anki, então ler a planilha não
   custa biblioteca nova nenhuma.

   A contagem de calorias tem três portas: a foto do prato, a descrição
   em texto (as duas pela IA, em /api/refeicao-ia) e a refeição do
   cardápio com um toque. A IA ESTIMA; a pessoa confere e corrige antes
   de salvar, porque uma foto não mostra o óleo da panela.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_REFEICAO_IA = "/api/refeicao-ia";

/* ── a lógica pura do plano do mês ─────────────────────────────────────
   Sem React e sem navegador: é o que o testar-plano-mes.mjs exercita,
   pela cópia que o extrair_plano_mes.py faz a cada build. */

/* Os dias da semana na ordem da planilha, segunda primeiro. */
const DIAS_PLANO = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

/* Quantas refeições anotadas ficam guardadas. Os dados de estudo moram
   num documento de 1 MiB na nuvem, e um diário alimentar sem teto o
   estouraria em um ano, travando a sincronização do cronograma junto.
   600 é uns quatro meses de cinco refeições por dia; o total de cada dia
   continua no diário, que é pequeno, então o histórico longo não some. */
const MAX_COMIDAS = 600;

/* Tira acento, emoji do começo e caixa: é assim que um rótulo da planilha
   é reconhecido, escrito "Proteína", "PROTEÍNA" ou "🍽️ Proteína". */
function normPlano(s) {
  return String(s == null ? "" : s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .toLowerCase().trim();
}

/* O texto sem o emoji da frente, com a caixa preservada. */
const semEnfeite = (s) => String(s == null ? "" : s).replace(/^[^\p{L}\p{N}]+/u, "").trim();

/* Os números escritos num texto, no jeito brasileiro: "2.200" é dois mil
   e duzentos, "7,5" é sete e meio, "1.95" é um vírgula noventa e cinco. */
function numerosDoTexto(s) {
  const achados = String(s == null ? "" : s).match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g) || [];
  return achados.map((n) => (/^\d{1,3}(?:\.\d{3})+/.test(n)
    ? Number(n.replace(/\./g, "").replace(",", "."))
    : Number(n.replace(",", "."))));
}

/* "2.200 a 2.300 kcal" → { min: 2200, max: 2300 }. "7 h ou mais" → só
   mínimo. Um número só vira mínimo e máximo iguais. */
function faixaDoTexto(s) {
  if (typeof s === "number" && Number.isFinite(s)) return { min: s, max: s };
  const n = numerosDoTexto(s);
  if (!n.length) return { min: 0, max: 0 };
  if (n.length === 1) {
    return /ou mais|no minimo|pelo menos|minimo/.test(normPlano(s)) ? { min: n[0], max: 0 } : { min: n[0], max: n[0] };
  }
  return { min: Math.min(n[0], n[1]), max: Math.max(n[0], n[1]) };
}

/* "2 min" → 120, "90 s" → 90, "1min30" → 90. Sem unidade, segundos. */
function descansoEmSegundos(s) {
  if (typeof s === "number" && Number.isFinite(s)) return Math.max(15, Math.min(600, Math.round(s)));
  const t = normPlano(s);
  const n = numerosDoTexto(t);
  if (!n.length) return 90;
  let seg = /min/.test(t) ? n[0] * 60 + (n[1] || 0) : n[0];
  seg = Math.round(seg);
  return Math.max(15, Math.min(600, seg));
}

/* O grupo muscular pelo nome do exercício, para o volume por grupo da aba
   Cargas contar o plano importado. A ordem importa: "tríceps na polia"
   tem de cair em Tríceps antes de "polia" sugerir costas. */
const GRUPO_POR_PALAVRA = [
  [/triceps|frances|mergulho/, "Tríceps"],
  [/rosca|biceps/, "Bíceps"],
  [/panturrilha|gemeos/, "Panturrilha"],
  [/prancha|abdominal|abdomen|crunch|core/, "Abdômen"],
  [/supino|crucifixo|peck|flexao de braco|peito/, "Peito"],
  [/desenvolvimento|elevacao lateral|elevacao frontal|ombro|militar/, "Ombro"],
  [/remada|puxada|pulldown|barra fixa|pull|serrote|costas/, "Costas"],
  [/terra romeno|stiff|flexora|posterior|good morning/, "Posterior"],
  [/gluteo|elevacao pelvica|hip thrust|abducao/, "Glúteo"],
  [/agachamento|leg press|extensora|afundo|passada|bulgaro|hack|perna|terra/, "Perna"],
  [/esteira|bike|bicicleta|eliptico|corrida|cardio|caminhada/, "Cardio"],
];
function grupoPeloNome(nome) {
  const t = normPlano(nome);
  for (const [re, g] of GRUPO_POR_PALAVRA) if (re.test(t)) return g;
  return "";
}

/* Número de série do Excel para "AAAA-MM-DD". O Excel conta dias desde
   30/12/1899 (o famoso bug do 29/02/1900 fica embutido nesse zero). */
function serialParaIso(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 20000 || v > 80000) return "";
  return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
}

/* Segunda = 0 … domingo = 6, que é a ordem da planilha. */
function diaDaSemanaPlano(iso) {
  const [a, m, d] = String(iso).split("-").map(Number);
  return (new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7;
}

function somarDiasPlano(iso, n) {
  const [a, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

function diasEntre(deIso, ateIso) {
  const p = (s) => { const [a, m, d] = String(s).split("-").map(Number); return Date.UTC(a, m - 1, d); };
  return Math.round((p(ateIso) - p(deIso)) / 86400000);
}

/* ── o .xlsx por dentro ────────────────────────────────────────────── */

const desfazerXml = (s) => String(s || "")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/* "AB12" → { col: "AB", linha: 12 } */
function refDaCelula(r) {
  const m = /^([A-Z]+)(\d+)$/.exec(String(r || ""));
  return m ? { col: m[1], linha: Number(m[2]) } : null;
}

/* Lê as folhas de um .xlsx: { "Nome da folha": { 1: { A: valor, … }, … } }.
 *
 * Expressão regular e não DOMParser de propósito: assim a mesma função roda
 * no teste, em Node, sem navegador. O XML de planilha é regular o bastante
 * para isso — é gerado por programa, não escrito à mão.
 *
 * Célula com fórmula vem com o último valor calculado quando o arquivo
 * guardou um; quando não guardou, fica null. Ninguém depende disso aqui:
 * o que se lê são os números digitados, e as contas são refeitas no app. */
function lerXlsx(bytes, abrirZip) {
  let zip;
  try { zip = abrirZip(bytes); } catch (e) { throw new Error("Esse arquivo não abriu como planilha do Excel, em .xlsx."); }
  const texto = (nome) => {
    const b = zip[nome];
    if (!b) return "";
    return typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8").decode(b) : Buffer.from(b).toString("utf8");
  };
  const livro = texto("xl/workbook.xml");
  if (!livro) throw new Error("Esse arquivo não é uma planilha do Excel, em .xlsx.");

  const compartilhadas = [];
  for (const m of texto("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const sem = m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, "");
    compartilhadas.push([...sem.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => desfazerXml(t[1])).join(""));
  }

  const alvos = {};
  for (const m of texto("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = (/\bId="([^"]+)"/.exec(m[1]) || [])[1];
    const alvo = (/\bTarget="([^"]+)"/.exec(m[1]) || [])[1];
    if (id && alvo) alvos[id] = alvo.replace(/^\/?xl\//, "").replace(/^\//, "");
  }

  const folhas = {};
  for (const m of livro.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const nome = desfazerXml((/\bname="([^"]*)"/.exec(m[1]) || [])[1] || "");
    const rid = (/\br:id="([^"]+)"/.exec(m[1]) || [])[1];
    const xml = texto("xl/" + (alvos[rid] || ""));
    if (!nome || !xml) continue;
    const grade = {};
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = refDaCelula((/\br="([^"]+)"/.exec(c[1]) || [])[1]);
      if (!ref) continue;
      const tipo = (/\bt="([^"]+)"/.exec(c[1]) || [])[1] || "n";
      const dentro = c[2] || "";
      const v = (/<v>([\s\S]*?)<\/v>/.exec(dentro) || [])[1];
      let valor = null;
      if (tipo === "s") valor = v == null ? null : (compartilhadas[Number(v)] ?? null);
      else if (tipo === "inlineStr") valor = [...dentro.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => desfazerXml(t[1])).join("");
      else if (tipo === "str") valor = v == null ? null : desfazerXml(v);
      else if (tipo === "b") valor = v === "1";
      else if (tipo === "e") valor = null;
      else valor = v == null || v === "" ? null : Number(v);
      if (valor === null || valor === "") continue;
      (grade[ref.linha] = grade[ref.linha] || {})[ref.col] = valor;
    }
    folhas[nome] = grade;
  }
  return folhas;
}

/* As linhas de uma folha em ordem, cada uma como lista de [coluna, valor]. */
function linhasDaFolha(grade) {
  return Object.keys(grade || {}).map(Number).sort((a, b) => a - b).map((n) => ({
    n,
    celulas: Object.entries(grade[n]).sort((a, b) => (a[0].length - b[0].length) || (a[0] < b[0] ? -1 : 1)),
    col: (c) => grade[n][c],
  }));
}

const textoDe = (v) => (v == null ? "" : String(v).trim());
const ehMarcador = (s) => /^[•·\-–*]\s*/.test(String(s || "").trim());
const semMarcador = (s) => String(s || "").trim().replace(/^[•·\-–*]\s*/, "").trim();

/* A folha cujo nome bate com alguma das palavras, sem acento e sem caixa. */
function acharFolha(folhas, ...palavras) {
  const nome = Object.keys(folhas).find((n) => palavras.some((p) => normPlano(n).includes(p)));
  return nome ? folhas[nome] : null;
}

/* Os itens com marcador (•) logo abaixo de um título. Para no primeiro
   que não for marcador: é assim que a planilha separa uma seção da outra. */
function marcadoresDepois(linhas, i) {
  const saida = [];
  for (let j = i + 1; j < linhas.length; j++) {
    const primeira = textoDe((linhas[j].celulas[0] || [])[1]);
    if (!ehMarcador(primeira)) break;
    saida.push(semMarcador(primeira).slice(0, 220));
  }
  return saida;
}

/* O primeiro número à direita de uma coluna, na mesma linha. */
function numeroADireita(linha, col) {
  for (const [c, v] of linha.celulas) {
    if (c.length < col.length || (c.length === col.length && c <= col)) continue;
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}
function textoADireita(linha, col) {
  for (const [c, v] of linha.celulas) {
    if (c.length < col.length || (c.length === col.length && c <= col)) continue;
    if (textoDe(v)) return v;
  }
  return null;
}

/* ── a planilha vira plano ─────────────────────────────────────────── */

/* Lê a planilha do plano do mês. Devolve só o que achou, e a lista do
 * que achou, para a tela mostrar antes de aplicar: importar às cegas
 * trocaria o cardápio de alguém por um vazio sem ninguém perceber.
 *
 * Tolerante de propósito: procura pelos rótulos ("Altura", "Treino A",
 * "Refeição"), não pela posição. Uma linha a mais no topo da planilha do
 * mês que vem não pode quebrar a importação. */
function planoDaPlanilha(folhas) {
  const achados = [];
  const meta = {};
  const lido = { meta, semana: [], plano: null, cardapio: null, diario: {}, medidas: [], achados };

  /* ── Início: dados, metas e regras ── */
  const inicio = acharFolha(folhas, "inicio", "resumo", "metas") || folhas[Object.keys(folhas)[0]];
  if (inicio) {
    const linhas = linhasDaFolha(inicio);
    const titulo = linhas.length ? semEnfeite(textoDe(linhas[0].celulas[0] && linhas[0].celulas[0][1])) : "";
    if (titulo) meta.titulo = titulo.slice(0, 80);
    for (let i = 0; i < linhas.length; i++) {
      const L = linhas[i];
      for (const [col, v] of L.celulas) {
        const t = normPlano(v);
        if (typeof v !== "string" || !t) continue;
        const periodo = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:a|ate|-)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(v));
        if (periodo && !meta.inicio) {
          const p2 = (x) => String(x).padStart(2, "0");
          const anoFim = periodo[6];
          meta.inicio = `${periodo[3] || anoFim}-${p2(periodo[2])}-${p2(periodo[1])}`;
          meta.fim = `${anoFim}-${p2(periodo[5])}-${p2(periodo[4])}`;
        }
        const num = () => numeroADireita(L, col);
        if (/^altura/.test(t)) meta.altura = num();
        else if (/^peso inicial/.test(t)) meta.pesoInicial = num();
        else if (/^cintura inicial/.test(t)) meta.cinturaInicial = num();
        else if (/^perda de peso/.test(t)) meta.perdaAlvo = num();
        else if (/^reducao de cintura/.test(t)) meta.cinturaAlvo = num();
        else if (/^idade/.test(t)) meta.idade = num();
        else if (/^calorias$/.test(t)) { const f = faixaDoTexto(textoADireita(L, col)); meta.kcalMin = f.min; meta.kcalMax = f.max; }
        else if (/^proteina$/.test(t)) { const f = faixaDoTexto(textoADireita(L, col)); meta.protMin = f.min; meta.protMax = f.max; }
        else if (/^passos$/.test(t)) { const f = faixaDoTexto(textoADireita(L, col)); meta.passosMin = f.min; meta.passosMax = f.max; }
        else if (/^sono$/.test(t)) { const f = faixaDoTexto(textoADireita(L, col)); meta.sonoMin = f.min; }
        else if (/^agua$/.test(t)) { const f = faixaDoTexto(textoADireita(L, col)); meta.aguaMin = f.min; meta.aguaMax = f.max; }
        else if (/^regras de ouro/.test(t)) meta.regras = marcadoresDepois(linhas, i);
        else if (col === "A" && !meta.nota && t.length > 40 && !ehMarcador(v) && /kg|cm/.test(t) && numeroADireita(L, col) === null) {
          meta.nota = semEnfeite(v).slice(0, 300);
        }
      }
    }
    /* O piso de calorias, quando uma das regras fala dele ("nada de ficar
       abaixo de 2.000 kcal"): vira aviso no diário alimentar. */
    for (const r of meta.regras || []) {
      const m = /abaixo de\s+([\d.]+)\s*kcal/i.exec(r);
      if (m) meta.kcalPiso = numerosDoTexto(m[1])[0];
    }
    const br = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
    if (meta.pesoInicial) achados.push(`metas do mês: ${br(meta.pesoInicial)} kg${meta.perdaAlvo ? ` → ${br(meta.pesoInicial - meta.perdaAlvo)} kg` : ""}`);
    if (meta.kcalMin) achados.push(`${meta.kcalMin} a ${meta.kcalMax || meta.kcalMin} kcal e ${meta.protMin || "?"} g de proteína por dia`);
    if ((meta.regras || []).length) achados.push(`${meta.regras.length} regras de ouro`);
  }

  /* ── Treino: a semana e as fichas ── */
  const folhaTreino = acharFolha(folhas, "treino");
  if (folhaTreino) {
    const linhas = linhasDaFolha(folhaTreino);
    const nomePlano = linhas.length ? semEnfeite(textoDe(linhas[0].celulas[0] && linhas[0].celulas[0][1])) : "";
    const plano = { nome: (nomePlano || "Plano do mês").slice(0, 50), aviso: "", regras: [], dias: [] };
    let bloco = null;
    let colunas = null;
    for (let i = 0; i < linhas.length; i++) {
      const L = linhas[i];
      const a = textoDe(L.col("A"));
      const na = normPlano(a);
      const diaIdx = DIAS_PLANO.findIndex((d) => normPlano(d) === na.replace(/-feira$/, ""));
      if (diaIdx >= 0 && textoDe(L.col("B"))) {
        lido.semana[diaIdx] = { atividade: textoDe(L.col("B")).slice(0, 40), descricao: textoDe(L.col("C")).slice(0, 160) };
        continue;
      }
      if (/^regras/.test(na)) { plano.regras = marcadoresDepois(linhas, i); bloco = null; continue; }
      if (/^treino\s+[a-z0-9]\b/.test(na) && !numeroADireita(L, "A")) {
        /* "TREINO A · Superior" → "Treino A · Superior" */
        const nome = a.replace(/^treino/i, "Treino").replace(/\s+/g, " ").trim().slice(0, 40);
        bloco = { nome, exercicios: [] };
        plano.dias.push(bloco);
        colunas = null;
        continue;
      }
      if (bloco && /^exercicio/.test(na)) {
        colunas = {};
        for (const [c, v] of L.celulas) {
          const t = normPlano(v);
          if (/^serie/.test(t)) colunas.series = c;
          else if (/^repet/.test(t)) colunas.reps = c;
          else if (/^descanso/.test(t)) colunas.descanso = c;
          else if (/^dica|^observ/.test(t)) colunas.dica = c;
        }
        continue;
      }
      if (bloco && colunas && a && colunas.series && Number(L.col(colunas.series)) > 0) {
        bloco.exercicios.push({
          nome: a.slice(0, 60),
          grupo: grupoPeloNome(a),
          series: Math.max(1, Math.min(10, Math.round(Number(L.col(colunas.series))))),
          reps: textoDe(colunas.reps ? L.col(colunas.reps) : "").slice(0, 12) || "8-12",
          descanso: descansoEmSegundos(colunas.descanso ? L.col(colunas.descanso) : ""),
          observacao: textoDe(colunas.dica ? L.col(colunas.dica) : "").slice(0, 160),
          video: "",
        });
      }
    }
    plano.dias = plano.dias.filter((d) => d.exercicios.length);
    if (plano.dias.length) {
      lido.plano = plano;
      achados.push(`${plano.dias.length} fichas de treino (${plano.dias.map((d) => d.nome).join(", ")})`);
    }
    const nSemana = lido.semana.filter(Boolean).length;
    if (nSemana) achados.push(`a semana de atividades (${nSemana} dias)`);
  }

  /* ── Alimentação: cardápio, substituições e dicas ── */
  const folhaComida = acharFolha(folhas, "aliment", "dieta", "cardapio");
  if (folhaComida) {
    const linhas = linhasDaFolha(folhaComida);
    const card = { nota: "", refeicoes: [], substituicoes: [], secoes: [], avisos: [] };
    let cols = null;
    let fase = "antes";
    let atual = null;
    let grupo = null;
    let secao = null;
    for (let i = 0; i < linhas.length; i++) {
      const L = linhas[i];
      const a = textoDe(L.col("A"));
      const na = normPlano(a);
      const soA = a && L.celulas.length === 1;
      if (fase === "antes") {
        const nomes = L.celulas.map(([, v]) => normPlano(v));
        if (nomes.some((t) => /^refeicao/.test(t)) && nomes.some((t) => /^alimento/.test(t))) {
          cols = {};
          for (const [c, v] of L.celulas) {
            const t = normPlano(v);
            if (/^refeicao/.test(t)) cols.refeicao = c;
            else if (/^horario/.test(t)) cols.horario = c;
            else if (/^alimento/.test(t)) cols.alimento = c;
            else if (/^quantidade/.test(t)) cols.quantidade = c;
            else if (/^kcal|^calorias/.test(t)) cols.kcal = c;
            else if (/^proteina/.test(t)) cols.proteina = c;
            else if (/^carbo/.test(t)) cols.carbo = c;
            else if (/^gordura/.test(t)) cols.gordura = c;
          }
          fase = "cardapio";
        } else if (i > 0 && soA && na.length > 40 && !card.nota) {
          card.nota = semEnfeite(a).slice(0, 300);
        }
        continue;
      }
      if (fase === "cardapio") {
        if (/^total/.test(na)) { fase = "depois"; continue; }
        if (/^subtotal/.test(na)) continue;
        const alimento = textoDe(L.col(cols.alimento));
        if (!alimento) continue;
        const n = (c) => { const v = Number(c ? L.col(c) : NaN); return Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : 0; };
        const refeicao = textoDe(cols.refeicao ? L.col(cols.refeicao) : "");
        if (refeicao || !atual) {
          atual = { nome: (refeicao || "Refeição").slice(0, 40), horario: textoDe(cols.horario ? L.col(cols.horario) : "").slice(0, 10), itens: [] };
          card.refeicoes.push(atual);
        }
        atual.itens.push({
          alimento: alimento.slice(0, 80),
          quantidade: textoDe(cols.quantidade ? L.col(cols.quantidade) : "").slice(0, 40),
          kcal: n(cols.kcal), proteina: n(cols.proteina), carbo: n(cols.carbo), gordura: n(cols.gordura),
        });
        continue;
      }
      /* depois do total: avisos soltos, substituições e seções de dicas */
      if (/substituic/.test(na)) { fase = "subst"; grupo = null; continue; }
      if (fase === "subst" && a && textoDe(L.col("C"))) {
        grupo = { grupo: a.slice(0, 30), referencia: textoDe(L.col("B")).slice(0, 80), opcoes: [semMarcador(L.col("C")).slice(0, 80)] };
        card.substituicoes.push(grupo);
        continue;
      }
      if (fase === "subst" && !a && grupo && textoDe(L.col("C"))) {
        grupo.opcoes.push(semMarcador(L.col("C")).slice(0, 80));
        continue;
      }
      if (soA && ehMarcador(a)) {
        if (secao) secao.itens.push(semMarcador(a).slice(0, 220));
        continue;
      }
      if (soA && na.length <= 50 && !ehMarcador(a)) {
        /* título de seção: "🏥 No refeitório do hospital" */
        const itens = marcadoresDepois(linhas, i);
        if (itens.length) {
          secao = { titulo: semEnfeite(a).slice(0, 60), itens: [] };
          card.secoes.push(secao);
          fase = "secao";
          continue;
        }
      }
      if (soA && na.length > 50) card.avisos.push(semEnfeite(a).slice(0, 300));
    }
    if (card.refeicoes.length) {
      lido.cardapio = card;
      const total = card.refeicoes.reduce((s, r) => s + r.itens.reduce((x, it) => x + it.kcal, 0), 0);
      achados.push(`cardápio com ${card.refeicoes.length} refeições (${Math.round(total)} kcal no dia)`);
    }
    if (card.substituicoes.length) achados.push(`${card.substituicoes.length} grupos de substituição`);
  }

  /* ── Controle diário: o que já estiver preenchido ── */
  const folhaDiario = acharFolha(folhas, "controle", "diario");
  if (folhaDiario) {
    const linhas = linhasDaFolha(folhaDiario);
    let cols = null;
    const datas = [];
    for (const L of linhas) {
      if (!cols) {
        const nomes = L.celulas.map(([, v]) => normPlano(v));
        if (nomes.some((t) => t === "data") && nomes.some((t) => /^peso/.test(t))) {
          cols = {};
          for (const [c, v] of L.celulas) {
            const t = normPlano(v);
            if (t === "data") cols.data = c;
            else if (/^treino feito/.test(t)) cols.treino = c;
            else if (/^peso/.test(t)) cols.peso = c;
            else if (/^cintura/.test(t)) cols.cintura = c;
            else if (/^passos/.test(t)) cols.passos = c;
            else if (/^proteina/.test(t)) cols.proteina = c;
            else if (/^sono/.test(t)) cols.sono = c;
            else if (/alcool|refri/.test(t)) cols.semAlcool = c;
            else if (/^agua/.test(t)) cols.agua = c;
            else if (/^observ/.test(t)) cols.obs = c;
          }
        }
        continue;
      }
      const iso = serialParaIso(L.col(cols.data));
      if (!iso) { if (datas.length) break; continue; }
      datas.push(iso);
      const simNao = (c) => {
        const t = normPlano(c ? L.col(c) : "");
        return t === "sim" || t === "s" || t === "true" ? true : t === "nao" || t === "n" || t === "false" ? false : null;
      };
      const num = (c) => { const v = Number(c ? L.col(c) : NaN); return Number.isFinite(v) && v > 0 ? v : 0; };
      const dia = {};
      const treinou = simNao(cols.treino);
      if (treinou !== null) dia.treino = treinou ? "sim" : "nao";
      if (num(cols.passos)) dia.passos = Math.round(num(cols.passos));
      if (num(cols.sono)) dia.sono = num(cols.sono);
      if (num(cols.agua)) dia.agua = Math.round(num(cols.agua) * (num(cols.agua) < 20 ? 1000 : 1));
      const prot = simNao(cols.proteina);
      if (prot !== null) dia.proteinaOk = prot;
      const limpo = simNao(cols.semAlcool);
      if (limpo !== null) dia.semAlcool = limpo;
      const obs = textoDe(cols.obs ? L.col(cols.obs) : "");
      if (obs) dia.obs = obs.slice(0, 200);
      if (Object.keys(dia).length) lido.diario[iso] = dia;
      const m = {};
      if (num(cols.peso)) m.peso = num(cols.peso);
      if (num(cols.cintura)) m.cintura = num(cols.cintura);
      if (Object.keys(m).length) lido.medidas.push({ data: iso, ...m });
    }
    if (!meta.inicio && datas.length) { meta.inicio = datas[0]; meta.fim = datas[datas.length - 1]; }
    const preenchidos = Object.keys(lido.diario).length + lido.medidas.length;
    if (preenchidos) achados.push(`${preenchidos} anotações do controle diário`);
  }

  if (meta.inicio) achados.unshift(`período de ${meta.inicio.split("-").reverse().join("/")} a ${meta.fim.split("-").reverse().join("/")}`);
  return lido;
}

/* Junta o que a planilha trouxe ao que a conta já tem.
 *
 * Substitui metas, semana e cardápio (são o plano do mês, e o do mês
 * passado deixa de valer). O plano de treino com o MESMO NOME é trocado
 * mantendo os ids dos exercícios que continuam: as séries já registradas
 * apontam para eles. Diário e medidas SOMAM, e o que a pessoa anotou no
 * app ganha do que veio vazio da planilha. */
function aplicarPlanilha(treino, lido, novoId) {
  const t = { ...(treino || {}) };
  if (lido.meta && Object.keys(lido.meta).length) t.meta = { ...(t.meta || {}), ...lido.meta };
  if (lido.cardapio) {
    t.cardapio = {
      ...lido.cardapio,
      refeicoes: lido.cardapio.refeicoes.map((r) => ({ id: novoId(), ...r, itens: r.itens.map((it) => ({ id: novoId(), ...it })) })),
    };
  }
  if (lido.plano) {
    const planos = [...(t.planos || [])];
    const antigo = planos.find((p) => normPlano(p.nome) === normPlano(lido.plano.nome));
    const idsPorNome = new Map();
    if (antigo) for (const d of antigo.dias || []) for (const e of d.exercicios || []) idsPorNome.set(normPlano(e.nome), e.id);
    const diasAntigos = new Map((antigo ? antigo.dias : []).map((d) => [normPlano(d.nome), d.id]));
    const plano = {
      ...lido.plano,
      id: antigo ? antigo.id : novoId(),
      criadoEm: antigo ? antigo.criadoEm : Date.now(),
      dias: lido.plano.dias.map((d) => ({
        ...d,
        id: diasAntigos.get(normPlano(d.nome)) || novoId(),
        exercicios: d.exercicios.map((e) => ({ ...e, id: idsPorNome.get(normPlano(e.nome)) || novoId() })),
      })),
    };
    t.planos = antigo ? planos.map((p) => (p.id === antigo.id ? plano : p)) : [plano, ...planos];
    t.planoAtivo = plano.id;
  }
  if (lido.semana && lido.semana.some(Boolean)) {
    const plano = (t.planos || []).find((p) => p.id === t.planoAtivo);
    t.semana = DIAS_PLANO.map((_, i) => {
      const s = lido.semana[i] || { atividade: "", descricao: "" };
      /* "Treino A" na semana aponta para a ficha "Treino A · Superior" */
      const ficha = plano && s.atividade
        ? (plano.dias || []).find((d) => normPlano(d.nome).startsWith(normPlano(s.atividade)))
        : null;
      return { atividade: s.atividade, descricao: s.descricao, diaPlanoId: ficha ? ficha.id : "" };
    });
  }
  const diario = { ...(t.diario || {}) };
  for (const [iso, dia] of Object.entries(lido.diario || {})) diario[iso] = { ...dia, ...(diario[iso] || {}) };
  t.diario = diario;
  const medidas = [...(t.medidas || [])];
  for (const m of lido.medidas || []) {
    const i = medidas.findIndex((x) => x.data === m.data);
    if (i < 0) medidas.push({ id: novoId(), ...m });
    else medidas[i] = { ...m, ...medidas[i] };
  }
  t.medidas = medidas;
  return t;
}

/* ── as contas do mês ──────────────────────────────────────────────── */

/* O que está marcado para um dia: "Treino A", "Tênis", "Descanso". */
function atividadeDoDia(semana, iso) {
  const s = (semana || [])[diaDaSemanaPlano(iso)];
  return s && s.atividade ? s : null;
}

/* Soma as refeições anotadas num dia. */
function totaisDoDia(comidas, iso) {
  const t = { kcal: 0, proteina: 0, carbo: 0, gordura: 0, n: 0 };
  for (const c of comidas || []) {
    if (c.data !== iso) continue;
    t.kcal += Number(c.kcal) || 0;
    t.proteina += Number(c.proteina) || 0;
    t.carbo += Number(c.carbo) || 0;
    t.gordura += Number(c.gordura) || 0;
    t.n += 1;
  }
  for (const k of ["kcal", "proteina", "carbo", "gordura"]) t[k] = Math.round(t[k]);
  return t;
}

/* A frase da planilha, com o piso de segurança por cima dela. */
function statusCalorias(kcal, meta) {
  const m = meta || {};
  if (!kcal) return { tom: "neutro", texto: "nada anotado ainda" };
  if (m.kcalMin && kcal < m.kcalMin) {
    const falta = m.kcalMin - kcal;
    return { tom: "baixo", texto: `abaixo da meta: faltam ${falta} kcal para o mínimo` };
  }
  if (m.kcalMax && kcal > m.kcalMax) {
    return { tom: "alto", texto: `acima da meta em ${kcal - m.kcalMax} kcal: reduza carboidrato ou gordura` };
  }
  if (m.kcalMin || m.kcalMax) return { tom: "ok", texto: "dentro da meta" };
  return { tom: "neutro", texto: `${kcal} kcal` };
}

function statusProteina(g, meta) {
  const min = (meta && meta.protMin) || 0;
  if (!min) return { tom: "neutro", texto: `${g} g` };
  if (g >= min) return { tom: "ok", texto: "meta batida" };
  return { tom: g ? "baixo" : "neutro", texto: `faltam ${min - g} g` };
}

/* Proteína do dia bateu? Pelas refeições anotadas, quando há; senão pelo
   "sim" marcado no controle diário, que é o jeito da planilha. */
function proteinaOkNoDia(iso, comidas, diario, meta) {
  const t = totaisDoDia(comidas, iso);
  if (t.n && meta && meta.protMin) return t.proteina >= meta.protMin;
  const d = (diario || {})[iso];
  return d && typeof d.proteinaOk === "boolean" ? d.proteinaOk : null;
}

/* Treinou no dia? Um treino salvo na aba conta sozinho; tênis e caminhada
   entram pelo "sim" do controle diário. */
function treinoFeitoNoDia(iso, diario, sessoes) {
  const d = (diario || {})[iso];
  if (d && d.treino === "nao") return false;
  if (d && d.treino === "sim") return true;
  return (sessoes || []).some((s) => s.data === iso);
}

/* As semanas do mês do jeito da planilha: a primeira vai do dia 1 até o
   primeiro domingo, e dali em diante de segunda a domingo. */
function semanasDoPlano(inicio, fim) {
  if (!inicio || !fim || fim < inicio) return [];
  const saida = [];
  let de = inicio;
  while (de <= fim && saida.length < 60) {
    const ate0 = somarDiasPlano(de, 6 - diaDaSemanaPlano(de));
    const ate = ate0 > fim ? fim : ate0;
    saida.push({ n: saida.length + 1, de, ate });
    de = somarDiasPlano(ate, 1);
  }
  return saida;
}

const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const umaCasa = (v) => (v == null ? null : Math.round(v * 10) / 10);

/* O resumo por semana da planilha, calculado a partir do que foi anotado. */
function resumoSemanal(treino) {
  const t = treino || {};
  const meta = t.meta || {};
  const semanas = semanasDoPlano(meta.inicio, meta.fim);
  const medidas = t.medidas || [];
  let anterior = Number(meta.pesoInicial) || null;
  return semanas.map((s) => {
    const dentro = (iso) => iso >= s.de && iso <= s.ate;
    const pesos = medidas.filter((m) => dentro(m.data) && m.peso > 0).map((m) => m.peso);
    const cinturas = medidas.filter((m) => dentro(m.data) && m.cintura > 0).map((m) => m.cintura);
    const dias = [];
    for (let d = s.de; d <= s.ate; d = somarDiasPlano(d, 1)) dias.push(d);
    const passos = dias.map((d) => Number(((t.diario || {})[d] || {}).passos) || 0).filter((x) => x > 0);
    const kcals = dias.map((d) => totaisDoDia(t.comidas, d)).filter((x) => x.n).map((x) => x.kcal);
    const pesoMedio = umaCasa(media(pesos));
    const linha = {
      ...s,
      pesoMedio,
      variacao: pesoMedio != null && anterior != null ? umaCasa(pesoMedio - anterior) : null,
      cintura: umaCasa(media(cinturas)),
      treinos: dias.filter((d) => treinoFeitoNoDia(d, t.diario, t.sessoes)).length,
      treinosPrevistos: dias.filter((d) => /treino/i.test(((atividadeDoDia(t.semana, d)) || {}).atividade || "")).length,
      passosMedios: passos.length ? Math.round(media(passos)) : null,
      diasProteina: dias.filter((d) => proteinaOkNoDia(d, t.comidas, t.diario, meta) === true).length,
      kcalMedia: kcals.length ? Math.round(media(kcals)) : null,
    };
    if (pesoMedio != null) anterior = pesoMedio;
    return linha;
  });
}

/* Onde a pessoa está em relação à meta do mês. */
function progressoDaMeta(meta, medidas) {
  const m = meta || {};
  const ordenadas = [...(medidas || [])].sort((a, b) => (a.data < b.data ? -1 : 1));
  const ultimoPeso = [...ordenadas].reverse().find((x) => x.peso > 0);
  const ultimaCintura = [...ordenadas].reverse().find((x) => x.cintura > 0);
  const peso = ultimoPeso ? ultimoPeso.peso : (Number(m.pesoInicial) || null);
  const cintura = ultimaCintura ? ultimaCintura.cintura : (Number(m.cinturaInicial) || null);
  const alturaM = Number(m.altura) > 3 ? Number(m.altura) / 100 : Number(m.altura) || 0;
  const perdido = m.pesoInicial && ultimoPeso ? umaCasa(m.pesoInicial - ultimoPeso.peso) : null;
  const cinturaPerdida = m.cinturaInicial && ultimaCintura ? umaCasa(m.cinturaInicial - ultimaCintura.cintura) : null;
  return {
    peso,
    pesoData: ultimoPeso ? ultimoPeso.data : "",
    pesoAlvo: m.pesoInicial && m.perdaAlvo ? umaCasa(m.pesoInicial - m.perdaAlvo) : null,
    perdido,
    pct: perdido != null && m.perdaAlvo ? Math.max(0, Math.min(1, perdido / m.perdaAlvo)) : null,
    cintura,
    cinturaAlvo: m.cinturaInicial && m.cinturaAlvo ? umaCasa(m.cinturaInicial - m.cinturaAlvo) : null,
    cinturaPerdida,
    pctCintura: cinturaPerdida != null && m.cinturaAlvo ? Math.max(0, Math.min(1, cinturaPerdida / m.cinturaAlvo)) : null,
    imc: peso && alturaM ? umaCasa(peso / (alturaM * alturaM)) : null,
    rca: cintura && alturaM ? Math.round((cintura / (alturaM * 100)) * 100) / 100 : null,
  };
}

/* Para onde o peso está indo, pela reta dos últimos 14 dias.
 *
 * Reta de mínimos quadrados e não "último menos primeiro": o peso de um
 * dia oscila meio quilo com água e sal, e comparar dois dias soltos faz
 * a projeção pular de "vou bater a meta" para "não vou" de um dia para o
 * outro. Exige 4 pesagens espalhadas por pelo menos 5 dias. */
function projecaoDePeso(meta, medidas, hojeIso) {
  const m = meta || {};
  const corte = somarDiasPlano(hojeIso, -14);
  const pontos = (medidas || [])
    .filter((x) => x.peso > 0 && x.data >= corte && x.data <= hojeIso)
    .map((x) => ({ x: diasEntre(hojeIso, x.data), y: x.peso }));
  if (pontos.length < 4) return null;
  const xs = pontos.map((p) => p.x);
  if (Math.max(...xs) - Math.min(...xs) < 5) return null;
  const mx = media(xs);
  const my = media(pontos.map((p) => p.y));
  let num = 0;
  let den = 0;
  for (const p of pontos) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  if (!den) return null;
  const porDia = num / den;
  const hoje = my - porDia * mx;
  const saida = { porSemana: umaCasa(porDia * 7), pesoHoje: umaCasa(hoje) };
  if (m.fim && m.fim >= hojeIso) saida.noFim = umaCasa(hoje + porDia * diasEntre(hojeIso, m.fim));
  const alvo = m.pesoInicial && m.perdaAlvo ? m.pesoInicial - m.perdaAlvo : null;
  if (alvo != null && porDia < 0 && hoje > alvo) {
    saida.diasAteAlvo = Math.ceil((alvo - hoje) / porDia);
    saida.dataAlvo = somarDiasPlano(hojeIso, saida.diasAteAlvo);
  }
  /* Mais de 1% do peso por semana, sustentado, costuma levar músculo
     junto. A própria planilha avisa: não comer abaixo do piso. */
  saida.rapidoDemais = porDia * 7 < -(hoje * 0.012);
  return saida;
}

/* A linha reta do peso inicial ao alvo, dia a dia: o gráfico desenha o
   peso real por cima dela. */
function caminhoIdeal(meta) {
  const m = meta || {};
  if (!m.inicio || !m.fim || !m.pesoInicial || !m.perdaAlvo) return [];
  const total = diasEntre(m.inicio, m.fim);
  if (total <= 0) return [];
  const saida = [];
  for (let i = 0; i <= total; i++) {
    saida.push({ data: somarDiasPlano(m.inicio, i), peso: umaCasa(m.pesoInicial - (m.perdaAlvo * i) / total) });
  }
  return saida;
}

/* Taxa metabólica basal pela fórmula de Mifflin-St Jeor, que é a que
   melhor acerta em adulto com sobrepeso. Só com idade e sexo informados:
   sem eles, qualquer número seria chute com cara de conta. */
function gastoEstimado(meta, peso) {
  const m = meta || {};
  const p = Number(peso) || Number(m.pesoInicial);
  const alturaCm = Number(m.altura) > 3 ? Number(m.altura) : Number(m.altura) * 100;
  const idade = Number(m.idade);
  if (!(p > 0) || !(alturaCm > 0) || !(idade > 0) || (m.sexo !== "m" && m.sexo !== "f")) return null;
  const tmb = 10 * p + 6.25 * alturaCm - 5 * idade + (m.sexo === "m" ? 5 : -161);
  /* 1,55: treino 4 vezes na semana mais 13 mil passos. */
  const fator = Number(m.fatorAtividade) > 1 ? Number(m.fatorAtividade) : 1.55;
  return { tmb: Math.round(tmb), gasto: Math.round(tmb * fator), fator };
}

/* Dias seguidos, terminando hoje ou ontem, com um sim marcado no campo. */
function diasSeguidos(diario, hojeIso, campo) {
  let d = hojeIso;
  if (!((diario || {})[d] || {})[campo]) d = somarDiasPlano(d, -1);
  let n = 0;
  while (((diario || {})[d] || {})[campo] === true && n < 400) { n += 1; d = somarDiasPlano(d, -1); }
  return n;
}

/* O "Registro de Cargas" da planilha: a última série de cada exercício da
   ficha, semana a semana, e quanto a carga subiu desde a primeira. */
function tabelaDeCargas(plano, sessoes, semanas) {
  const linhas = [];
  for (const d of (plano && plano.dias) || []) {
    for (const e of d.exercicios || []) {
      const nome = normPlano(e.nome);
      const porSemana = semanas.map((s) => {
        const doPeriodo = (sessoes || [])
          .filter((x) => x.data >= s.de && x.data <= s.ate)
          .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (a.inicio || 0) - (b.inicio || 0)));
        let ultima = null;
        for (const x of doPeriodo) for (const sr of x.series || []) if (normPlano(sr.exNome) === nome) ultima = sr;
        return ultima ? { peso: ultima.peso, reps: ultima.reps } : null;
      });
      const pesos = porSemana.filter(Boolean).map((x) => x.peso);
      linhas.push({
        ficha: d.nome, nome: e.nome, porSemana,
        ganho: pesos.length >= 2 ? umaCasa(Math.max(...pesos) - pesos[0]) : null,
      });
    }
  }
  return linhas;
}

/* O que a IA devolveu, conferido de novo aqui: a rota já limpa, mas uma
   refeição de 40 mil kcal gravada por engano estragaria a média do mês. */
function limparAnalise(j) {
  const itens = (Array.isArray(j && j.itens) ? j.itens : []).slice(0, 15).map((it) => {
    const n = (v, max) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? Math.min(max, Math.round(x * 10) / 10) : 0; };
    return {
      nome: textoDe(it && it.nome).slice(0, 60),
      quantidade: textoDe(it && it.quantidade).slice(0, 40),
      kcal: Math.round(n(it && it.kcal, 3000)),
      proteina: n(it && it.proteina, 300),
      carbo: n(it && it.carbo, 500),
      gordura: n(it && it.gordura, 300),
    };
  }).filter((it) => it.nome);
  return {
    itens,
    confianca: ["alta", "media", "baixa"].indexOf(j && j.confianca) >= 0 ? j.confianca : "media",
    observacao: textoDe(j && j.observacao).slice(0, 300),
  };
}

function somarItens(itens) {
  const t = { kcal: 0, proteina: 0, carbo: 0, gordura: 0 };
  for (const it of itens || []) for (const k of Object.keys(t)) t[k] += Number(it[k]) || 0;
  t.kcal = Math.round(t.kcal);
  for (const k of ["proteina", "carbo", "gordura"]) t[k] = Math.round(t[k] * 10) / 10;
  return t;
}

/* Guarda a refeição nova e corta as mais antigas além do teto. */
function guardarComida(comidas, nova) {
  return [nova, ...(comidas || [])]
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : (b.em || 0) - (a.em || 0)))
    .slice(0, MAX_COMIDAS);
}

/* ── telas do plano do mês ──────────────────────────────────────────── */

/* O token da conta, para as rotas de IA. Sem conta, a rota recusa. */
async function tokenDaConta(nuvem) {
  try {
    if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
      return await nuvem.sdk.auth.currentUser.getIdToken();
    }
  } catch (e) { /* sem conta */ }
  return "";
}

const COR_PLANO = "var(--a-GO)";
const COR_COMIDA = "var(--warn)";
const tomCor = (tom) => (tom === "ok" ? T.ok : tom === "alto" ? T.bad : tom === "baixo" ? T.warn : T.faint);
const fmtNum = (v, casas = 0) => (v == null || !Number.isFinite(Number(v)) ? "—"
  : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas }));
const fmtData = (iso) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "—");

/* Um número grande com rótulo e uma linha de apoio. */
function Painelzinho({ rotulo, valor, apoio, cor }) {
  return (
    <div className="rounded-2xl px-4 py-3" style={{ background: T.card2, minWidth: 0 }}>
      <Label style={{ fontSize: 11 }}>{rotulo}</Label>
      <div style={{ marginTop: 4 }}><Num size={24} color={cor || T.ink}>{valor}</Num></div>
      {apoio ? <Mini style={{ marginTop: 2 }}>{apoio}</Mini> : null}
    </div>
  );
}

/* ── importar a planilha ─────────────────────────────────────────────── */

function ImportarPlanilha({ treino, gravar, notify, compacto }) {
  const [lido, setLido] = useState(null);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const ref = useRef(null);

  const abrir = async (arquivo) => {
    setErro(""); setLido(null);
    if (!arquivo) return;
    if (!/\.xlsx$/i.test(arquivo.name)) {
      setErro("Mande a planilha em .xlsx (no Excel ou no Google Planilhas: Arquivo › Baixar › .xlsx).");
      return;
    }
    try {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const r = planoDaPlanilha(lerXlsx(bytes, unzipSync));
      if (!r.achados.length) { setErro("Abri a planilha, mas não achei metas, treino nem cardápio nela."); return; }
      setNome(arquivo.name);
      setLido(r);
    } catch (e) {
      setErro((e && e.message) || "Não consegui ler essa planilha.");
    }
  };

  const aplicar = () => {
    gravar((t) => aplicarPlanilha(t, lido, uid));
    notify("Plano do mês importado.");
    setLido(null);
  };

  const jaTem = !!(treino.meta && treino.meta.inicio);
  return (
    <Card className="px-6 py-6">
      <H color={COR_PLANO} icon={<FileSpreadsheet size={16} />}>
        {jaTem ? "Importar outra planilha" : "Importar o plano do mês"}
      </H>
      {!compacto || !jaTem ? (
        <Texto style={{ marginTop: 10 }}>
          Mande a planilha do plano, em .xlsx, e o site lê as metas, as fichas de treino,
          a semana, o cardápio, as substituições e o que já estiver preenchido no
          controle diário. Ela é lida aqui no aparelho e vai só para a sua conta.
        </Texto>
      ) : null}
      <input ref={ref} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        style={{ display: "none" }} onChange={(e) => { abrir(e.target.files && e.target.files[0]); e.target.value = ""; }} />
      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <Btn tone={jaTem ? "quiet" : "primary"} onClick={() => ref.current && ref.current.click()}>
          <Upload size={15} /> escolher a planilha
        </Btn>
      </div>
      {erro ? <Label style={{ marginTop: 12, color: T.bad, textTransform: "none", letterSpacing: 0 }}>{erro}</Label> : null}
      {lido ? (
        <div className="mt-5 rounded-2xl px-4 py-4" style={{ background: T.card2 }}>
          <Mini>em {nome}:</Mini>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: T.dim, fontSize: 14.5, lineHeight: 1.7 }}>
            {lido.achados.map((a) => <li key={a}>{a}</li>)}
          </ul>
          <Mini style={{ marginTop: 10, lineHeight: 1.6 }}>
            Metas, semana e cardápio atuais são trocados pelos da planilha. Um plano de treino
            com o mesmo nome é atualizado sem perder as séries já registradas. O que você já
            anotou no controle diário fica como está.
          </Mini>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn tone="primary" onClick={aplicar}><Check size={15} /> importar</Btn>
            <Btn tone="outline" onClick={() => setLido(null)}>cancelar</Btn>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/* ── metas do mês, na mão ────────────────────────────────────────────── */

/* A unidade vai à parte, e não escrita dentro do rótulo: "Altura (m)"
   no texto parece chamada de função para o testar-definidos.mjs. */
const CAMPOS_META = [
  ["titulo", "Nome do plano", "texto"], ["inicio", "Começa em", "data"], ["fim", "Termina em", "data"],
  ["altura", "Altura", "num", "m"], ["pesoInicial", "Peso inicial", "num", "kg"], ["cinturaInicial", "Cintura inicial", "num", "cm"],
  ["perdaAlvo", "Perder no período", "num", "kg"], ["cinturaAlvo", "Reduzir de cintura", "num", "cm"],
  ["kcalMin", "Calorias mín.", "num"], ["kcalMax", "Calorias máx.", "num"], ["kcalPiso", "Nunca abaixo de", "num", "kcal"],
  ["protMin", "Proteína mín.", "num", "g"], ["passosMin", "Passos por dia", "num"], ["sonoMin", "Sono mín.", "num", "h"],
  ["aguaMin", "Água mín.", "num", "L"], ["idade", "Idade", "num"],
];
const emUnidade = (u) => (u ? ` (${u})` : "");

function EditarMetas({ treino, gravar, notify, aoFechar }) {
  const m = treino.meta || {};
  const [f, setF] = useState(() => {
    const x = {};
    for (const [k, , tipo] of CAMPOS_META) x[k] = m[k] == null ? "" : tipo === "num" ? comVirgula(m[k]) : String(m[k]);
    x.sexo = m.sexo || "";
    return x;
  });
  const [semana, setSemana] = useState(() => DIAS_PLANO.map((_, i) => ({ ...((treino.semana || [])[i] || { atividade: "", descricao: "" }) })));
  const salvar = () => {
    const nova = { ...m };
    for (const [k, , tipo] of CAMPOS_META) {
      const v = String(f[k] || "").trim();
      if (tipo === "num") {
        const n = numerosDoTexto(v)[0];
        if (v && Number.isFinite(n) && n >= 0) nova[k] = n; else delete nova[k];
      } else if (v) nova[k] = v.slice(0, 80); else delete nova[k];
    }
    nova.sexo = f.sexo === "m" || f.sexo === "f" ? f.sexo : "";
    if (nova.inicio && nova.fim && nova.fim < nova.inicio) { notify("O fim vem antes do começo."); return; }
    gravar((t) => {
      const plano = (t.planos || []).find((p) => p.id === t.planoAtivo) || (t.planos || [])[0];
      return {
        ...t,
        meta: nova,
        semana: semana.map((s) => {
          const ficha = plano && s.atividade ? (plano.dias || []).find((d) => normPlano(d.nome).startsWith(normPlano(s.atividade))) : null;
          return { atividade: String(s.atividade || "").slice(0, 40), descricao: String(s.descricao || "").slice(0, 160), diaPlanoId: ficha ? ficha.id : "" };
        }),
      };
    });
    notify("Metas salvas.");
    if (aoFechar) aoFechar();
  };
  return (
    <Card className="px-6 py-6">
      <H color={COR_PLANO} icon={<Target size={16} />}>Metas do plano</H>
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CAMPOS_META.map(([k, rotulo, tipo, unidade]) => (
          <div key={k} className={k === "titulo" ? "col-span-2 sm:col-span-2" : ""}>
            <Label style={{ fontSize: 11 }}>{rotulo}{emUnidade(unidade)}</Label>
            <TextInput style={{ marginTop: 4 }} type={tipo === "data" ? "date" : "text"}
              inputMode={tipo === "num" ? "decimal" : undefined} value={f[k]}
              onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
          </div>
        ))}
        <div>
          <Label style={{ fontSize: 11 }}>Sexo</Label>
          <select value={f.sexo} onChange={(e) => setF((x) => ({ ...x, sexo: e.target.value }))} style={{ ...inp, marginTop: 4 }}>
            <option value="">não informar</option>
            <option value="m">masculino</option>
            <option value="f">feminino</option>
          </select>
        </div>
      </div>
      <Mini style={{ marginTop: 8 }}>idade e sexo servem só para estimar o seu gasto diário</Mini>

      <Label style={{ marginTop: 22 }}>A semana</Label>
      <div className="mt-3 flex flex-col gap-2">
        {DIAS_PLANO.map((d, i) => (
          <div key={d} className="grid grid-cols-3 gap-2 items-center">
            <Mini>{d}</Mini>
            <TextInput value={semana[i].atividade || ""} placeholder="Treino A, Tênis, Descanso"
              onChange={(e) => setSemana((s) => s.map((x, j) => (j === i ? { ...x, atividade: e.target.value } : x)))} />
            <TextInput value={semana[i].descricao || ""} placeholder="o que fazer"
              onChange={(e) => setSemana((s) => s.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))} />
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Btn tone="primary" onClick={salvar}><Check size={15} /> salvar</Btn>
        {aoFechar ? <Btn tone="outline" onClick={aoFechar}>fechar</Btn> : null}
      </div>
    </Card>
  );
}

/* ── o controle do dia ───────────────────────────────────────────────── */

function SimNao({ valor, aoMudar, rotulo }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span style={{ fontSize: 14.5, color: T.dim }}>{rotulo}</span>
      <div className="flex gap-1.5">
        {[[true, "sim"], [false, "não"]].map(([v, r]) => (
          <button key={r} type="button" className="toque" onClick={() => aoMudar(valor === v ? null : v)}
            style={{
              border: `1px solid ${valor === v ? (v ? T.ok : T.bad) : T.line}`, borderRadius: 999,
              background: valor === v ? soft(v ? "var(--ok)" : "var(--bad)", 16) : "transparent",
              color: valor === v ? (v ? T.ok : T.bad) : T.faint, padding: "5px 13px",
              fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: F_UI,
            }}>{r}</button>
        ))}
      </div>
    </div>
  );
}

function ControleDoDia({ treino, gravar, notify, dia }) {
  const meta = treino.meta || {};
  const registro = (treino.diario || {})[dia] || {};
  const medida = (treino.medidas || []).find((m) => m.data === dia) || {};
  const segunda = diaDaSemanaPlano(dia) === 0;
  const [f, setF] = useState({ peso: "", cintura: "", passos: "", sono: "", obs: "" });
  useEffect(() => {
    setF({
      peso: comVirgula(medida.peso || ""), cintura: comVirgula(medida.cintura || ""),
      passos: registro.passos ? String(registro.passos) : "", sono: comVirgula(registro.sono || ""),
      obs: registro.obs || "",
    });
  }, [dia]);   // eslint-disable-line react-hooks/exhaustive-deps

  const mexerDia = (fn) => gravar((t) => {
    const d = { ...(t.diario || {}) };
    const novo = fn({ ...(d[dia] || {}) });
    for (const k of Object.keys(novo)) if (novo[k] === null || novo[k] === "" || novo[k] === undefined) delete novo[k];
    if (Object.keys(novo).length) d[dia] = novo; else delete d[dia];
    return { ...t, diario: d };
  });

  const salvar = () => {
    const n = (v) => { const x = numerosDoTexto(v)[0]; return Number.isFinite(x) && x > 0 ? x : 0; };
    const peso = n(f.peso);
    const cintura = n(f.cintura);
    if (peso && (peso < 30 || peso > 400)) { notify("Esse peso não parece certo."); return; }
    gravar((t) => {
      const medidas = [...(t.medidas || [])];
      const i = medidas.findIndex((m) => m.data === dia);
      const junto = { ...(i >= 0 ? medidas[i] : { id: uid(), data: dia }) };
      if (peso) junto.peso = peso; else delete junto.peso;
      if (cintura) junto.cintura = cintura; else delete junto.cintura;
      const temAlgo = MEDIDAS_CORPO.some(([k]) => junto[k] > 0);
      if (i >= 0) { if (temAlgo) medidas[i] = junto; else medidas.splice(i, 1); } else if (temAlgo) medidas.push(junto);
      const d = { ...(t.diario || {}) };
      const reg = { ...(d[dia] || {}) };
      const passos = Math.round(n(f.passos));
      if (passos) reg.passos = passos; else delete reg.passos;
      if (n(f.sono)) reg.sono = n(f.sono); else delete reg.sono;
      if (f.obs.trim()) reg.obs = f.obs.trim().slice(0, 200); else delete reg.obs;
      if (Object.keys(reg).length) d[dia] = reg; else delete d[dia];
      return { ...t, medidas, diario: d };
    });
    notify("Dia anotado.");
  };

  const agua = Number(registro.agua) || 0;
  const aguaMeta = (Number(meta.aguaMin) || 3) * 1000;
  const protAuto = totaisDoDia(treino.comidas, dia).n > 0 && meta.protMin;
  const protOk = proteinaOkNoDia(dia, treino.comidas, treino.diario, meta);

  return (
    <Card className="px-6 py-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <H color="var(--a-CI)" icon={<ListChecks size={16} />}>Controle do dia</H>
        <Mini>{brDate(dia)}</Mini>
      </div>

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <Label style={{ fontSize: 11 }}>Peso{emUnidade("kg")}</Label>
          <TextInput style={{ marginTop: 4 }} inputMode="decimal" value={f.peso} placeholder="ao acordar"
            onChange={(e) => setF((x) => ({ ...x, peso: e.target.value }))} />
        </div>
        <div>
          <Label style={{ fontSize: 11 }}>Cintura{emUnidade("cm")}</Label>
          <TextInput style={{ marginTop: 4 }} inputMode="decimal" value={f.cintura}
            placeholder={segunda ? "hoje é dia" : "às segundas"}
            onChange={(e) => setF((x) => ({ ...x, cintura: e.target.value }))} />
        </div>
        <div>
          <Label style={{ fontSize: 11 }}>Passos</Label>
          <TextInput style={{ marginTop: 4 }} inputMode="numeric" value={f.passos}
            placeholder={meta.passosMin ? `meta ${fmtNum(meta.passosMin)}` : ""}
            onChange={(e) => setF((x) => ({ ...x, passos: e.target.value.replace(/\D/g, "") }))} />
        </div>
        <div>
          <Label style={{ fontSize: 11 }}>Sono{emUnidade("h")}</Label>
          <TextInput style={{ marginTop: 4 }} inputMode="decimal" value={f.sono}
            placeholder={meta.sonoMin ? `meta ${meta.sonoMin} h` : ""}
            onChange={(e) => setF((x) => ({ ...x, sono: e.target.value }))} />
        </div>
      </div>
      <div className="mt-3">
        <Label style={{ fontSize: 11 }}>Observações</Label>
        <TextInput style={{ marginTop: 4 }} value={f.obs} placeholder="como foi o dia"
          onChange={(e) => setF((x) => ({ ...x, obs: e.target.value }))} />
      </div>
      <div className="mt-4"><Btn tone="primary" size="sm" onClick={salvar}><Check size={14} /> anotar</Btn></div>

      <div className="mt-6 flex flex-col gap-3" style={{ borderTop: `1px solid ${T.line}`, paddingTop: 18 }}>
        <SimNao rotulo="Treino feito?" valor={registro.treino === "sim" ? true : registro.treino === "nao" ? false : treinoFeitoNoDia(dia, {}, treino.sessoes) ? true : null}
          aoMudar={(v) => mexerDia((r) => ({ ...r, treino: v === null ? null : v ? "sim" : "nao" }))} />
        <SimNao rotulo="Sem álcool e sem refri?" valor={typeof registro.semAlcool === "boolean" ? registro.semAlcool : null}
          aoMudar={(v) => mexerDia((r) => ({ ...r, semAlcool: v }))} />
        {protAuto ? (
          <div className="flex items-center justify-between gap-3">
            <span style={{ fontSize: 14.5, color: T.dim }}>Proteína ≥ {meta.protMin} g?</span>
            <Mini style={{ color: protOk ? T.ok : T.warn }}>{protOk ? "sim, pelas refeições" : "ainda não, pelas refeições"}</Mini>
          </div>
        ) : (
          <SimNao rotulo={`Proteína${meta.protMin ? ` ≥ ${meta.protMin} g` : ""}?`}
            valor={typeof registro.proteinaOk === "boolean" ? registro.proteinaOk : null}
            aoMudar={(v) => mexerDia((r) => ({ ...r, proteinaOk: v }))} />
        )}
      </div>

      <div className="mt-6" style={{ borderTop: `1px solid ${T.line}`, paddingTop: 18 }}>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2" style={{ fontSize: 14.5, color: T.dim }}>
            <Droplets size={15} color="var(--neon)" /> Água
          </span>
          <Mini style={{ fontFamily: F_MONO }}>{fmtNum(agua / 1000, 2)} de {fmtNum(aguaMeta / 1000, 1)} L</Mini>
        </div>
        <div className="mt-2"><Track pct={(agua / aguaMeta) * 100} color="var(--neon)" /></div>
        <div className="mt-3 flex gap-2 flex-wrap">
          {[250, 500].map((ml) => (
            <Btn key={ml} size="sm" onClick={() => mexerDia((r) => ({ ...r, agua: Math.min(12000, (Number(r.agua) || 0) + ml) }))}>
              +{ml} ml
            </Btn>
          ))}
          <Btn size="sm" tone="outline" disabled={!agua}
            onClick={() => mexerDia((r) => ({ ...r, agua: Math.max(0, (Number(r.agua) || 0) - 250) || null }))}>−250</Btn>
        </div>
      </div>
    </Card>
  );
}

/* ── o dia de hoje, no topo da aba ───────────────────────────────────── */

function HojeDoPlano({ treino, gravar, notify, today, irPara }) {
  const meta = treino.meta || {};
  const temPlano = !!(meta.inicio || (treino.semana || []).some((s) => s && s.atividade));
  if (!temPlano) return null;
  const atv = atividadeDoDia(treino.semana, today);
  const plano = (treino.planos || []).find((p) => p.id === treino.planoAtivo) || (treino.planos || [])[0];
  const ficha = atv && atv.diaPlanoId && plano ? (plano.dias || []).find((d) => d.id === atv.diaPlanoId) : null;
  const feito = treinoFeitoNoDia(today, treino.diario, treino.sessoes);
  const hoje = totaisDoDia(treino.comidas, today);
  const sc = statusCalorias(hoje.kcal, meta);
  const sp = statusProteina(hoje.proteina, meta);

  let quando = "";
  if (meta.inicio && meta.fim) {
    if (today < meta.inicio) quando = `o plano começa em ${diasEntre(today, meta.inicio)} dia${diasEntre(today, meta.inicio) === 1 ? "" : "s"}`;
    else if (today > meta.fim) quando = "o período do plano terminou";
    else {
      const n = diasEntre(meta.inicio, today) + 1;
      const total = diasEntre(meta.inicio, meta.fim) + 1;
      quando = `dia ${n} de ${total} · faltam ${total - n}`;
    }
  }

  const comecar = () => {
    if (!ficha || treino.emCurso) return;
    gravar((t) => ({
      ...t,
      emCurso: { id: uid(), data: today, planoId: plano.id, diaId: ficha.id, nome: ficha.nome, inicio: Date.now(), series: [] },
    }));
  };

  return (
    <Card className="px-6 py-6" brilho={COR_PLANO}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <H color={COR_PLANO} icon={<CalendarDays size={16} />}>{DIAS_PLANO[diaDaSemanaPlano(today)]}</H>
        {quando ? <Mini>{quando}</Mini> : null}
      </div>
      {atv ? (
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 19, fontWeight: 700 }}>{atv.atividade}</span>
            {feito ? <Mini style={{ color: T.ok }}>feito</Mini> : null}
          </div>
          {atv.descricao ? <Texto style={{ marginTop: 4 }}>{atv.descricao}</Texto> : null}
          {ficha && !feito && !treino.emCurso ? (
            <div className="mt-4"><Btn tone="primary" onClick={comecar}><Dumbbell size={15} /> começar {ficha.nome}</Btn></div>
          ) : null}
        </div>
      ) : <Mini style={{ marginTop: 10 }}>nada marcado para hoje na semana do plano</Mini>}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" className="toque rounded-2xl px-4 py-3 text-left" onClick={() => irPara("comida")}
          style={{ background: T.card2, border: "none", cursor: "pointer", color: T.ink }}>
          <Label style={{ fontSize: 11 }}>Calorias</Label>
          <div style={{ marginTop: 4 }}><Num size={22}>{fmtNum(hoje.kcal)}</Num></div>
          <Mini style={{ color: tomCor(sc.tom) }}>{sc.texto}</Mini>
        </button>
        <button type="button" className="toque rounded-2xl px-4 py-3 text-left" onClick={() => irPara("comida")}
          style={{ background: T.card2, border: "none", cursor: "pointer", color: T.ink }}>
          <Label style={{ fontSize: 11 }}>Proteína</Label>
          <div style={{ marginTop: 4 }}><Num size={22}>{fmtNum(hoje.proteina)} g</Num></div>
          <Mini style={{ color: tomCor(sp.tom) }}>{sp.texto}</Mini>
        </button>
      </div>
    </Card>
  );
}

/* ── o painel do mês ─────────────────────────────────────────────────── */

function PainelDoMes({ treino, gravar, notify, today }) {
  const meta = treino.meta || {};
  const [editando, setEditando] = useState(false);
  const prog = useMemo(() => progressoDaMeta(meta, treino.medidas), [meta, treino.medidas]);
  const proj = useMemo(() => projecaoDePeso(meta, treino.medidas, today), [meta, treino.medidas, today]);
  const semanas = useMemo(() => resumoSemanal(treino), [treino]);
  const gasto = gastoEstimado(meta, prog.peso);
  const semAlcool = diasSeguidos(treino.diario, today, "semAlcool");

  const grafico = useMemo(() => {
    const ideal = caminhoIdeal(meta);
    const reais = new Map((treino.medidas || []).filter((m) => m.peso > 0).map((m) => [m.data, m.peso]));
    const base = ideal.length ? ideal : [...reais.keys()].sort().map((d) => ({ data: d, peso: null }));
    return base.map((x) => ({ dia: fmtData(x.data), ideal: x.peso, real: reais.has(x.data) ? reais.get(x.data) : null }));
  }, [meta, treino.medidas]);

  if (editando) return <EditarMetas {...{ treino, gravar, notify }} aoFechar={() => setEditando(false)} />;

  if (!meta.inicio && !meta.pesoInicial) {
    return (
      <div className="flex flex-col gap-5">
        <ImportarPlanilha {...{ treino, gravar, notify }} />
        <Card className="px-6 py-6">
          <Blank icon={<Target size={22} />} title="Sem plano do mês"
            hint="Importe a planilha acima, ou escreva as metas na mão." />
          <div className="mt-2 flex justify-center">
            <Btn onClick={() => setEditando(true)}><Plus size={14} /> escrever as metas</Btn>
          </div>
        </Card>
      </div>
    );
  }

  const tovCor = (v) => (v == null ? T.faint : v < 0 ? T.ok : v > 0 ? T.bad : T.dim);
  const deficit = gasto && meta.kcalMax ? gasto.gasto - Math.round(((meta.kcalMin || meta.kcalMax) + meta.kcalMax) / 2) : null;

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-6" brilho={COR_PLANO}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <H color={COR_PLANO} icon={<Flame size={16} />}>{meta.titulo || "Plano do mês"}</H>
            {meta.inicio ? <Mini style={{ marginTop: 8 }}>{brDate(meta.inicio)} a {brDate(meta.fim)}</Mini> : null}
          </div>
          <Btn size="sm" tone="outline" onClick={() => setEditando(true)}><Settings2 size={13} /> ajustar</Btn>
        </div>
        {meta.nota ? <Texto style={{ marginTop: 12 }}>{meta.nota}</Texto> : null}

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Painelzinho rotulo="Peso agora" valor={prog.peso ? `${fmtNum(prog.peso, 1)} kg` : "—"}
            apoio={prog.pesoAlvo ? `alvo ${fmtNum(prog.pesoAlvo, 1)} kg` : prog.pesoData ? brDate(prog.pesoData) : ""} />
          <Painelzinho rotulo="Perdido" valor={prog.perdido == null ? "—" : `${fmtNum(prog.perdido, 1)} kg`}
            cor={prog.perdido > 0 ? T.ok : T.ink} apoio={meta.perdaAlvo ? `de ${fmtNum(meta.perdaAlvo, 1)} kg` : ""} />
          <Painelzinho rotulo="Cintura" valor={prog.cintura ? `${fmtNum(prog.cintura, 1)} cm` : "—"}
            apoio={prog.cinturaAlvo ? `alvo ${fmtNum(prog.cinturaAlvo, 1)} cm` : ""} />
          <Painelzinho rotulo="IMC · cintura/altura" valor={prog.imc ? fmtNum(prog.imc, 1) : "—"}
            apoio={prog.rca ? `RCA ${fmtNum(prog.rca, 2)}${prog.rca < 0.5 ? " · faixa boa" : " · meta abaixo de 0,50"}` : ""} />
        </div>

        {prog.pct != null ? (
          <div className="mt-5">
            <div className="flex justify-between"><Mini>meta de peso</Mini><Mini>{Math.round(prog.pct * 100)}%</Mini></div>
            <div className="mt-1.5"><Track pct={prog.pct * 100} color={COR_PLANO} height={8} /></div>
          </div>
        ) : null}
        {prog.pctCintura != null ? (
          <div className="mt-3">
            <div className="flex justify-between"><Mini>meta de cintura</Mini><Mini>{Math.round(prog.pctCintura * 100)}%</Mini></div>
            <div className="mt-1.5"><Track pct={prog.pctCintura * 100} color="var(--a-CI)" height={8} /></div>
          </div>
        ) : null}

        {proj ? (
          <div className="mt-5 rounded-2xl px-4 py-3" style={{ background: T.card2 }}>
            <Texto>
              No ritmo das últimas duas semanas, de {proj.porSemana > 0 ? "+" : ""}{fmtNum(proj.porSemana, 1)} kg por semana
              {proj.noFim != null ? `, você chega ao fim do plano com uns ${fmtNum(proj.noFim, 1)} kg` : ""}
              {proj.dataAlvo ? ` e bate o peso alvo por volta de ${brDate(proj.dataAlvo)}` : ""}.
            </Texto>
            {proj.rapidoDemais ? (
              <Mini style={{ marginTop: 6, color: T.warn, lineHeight: 1.6 }}>
                Está caindo mais de 1% do peso por semana. Na primeira semana é água; depois disso,
                confira se as calorias não estão abaixo do mínimo, para não perder músculo.
              </Mini>
            ) : null}
          </div>
        ) : (
          <Mini style={{ marginTop: 14 }}>a projeção aparece com 4 pesagens em pelo menos 5 dias</Mini>
        )}
      </Card>

      {grafico.length >= 2 ? (
        <Card className="px-6 py-6">
          <H size={18} color={COR_PLANO} icon={<Scale size={16} />}>Peso contra o plano</H>
          <Mini style={{ marginTop: 6 }}>a linha tracejada é o caminho reto até o alvo</Mini>
          <div className="mt-4" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={grafico} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 5" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fill: "var(--ghost)", fontSize: 10, fontFamily: F_MONO }} axisLine={false} tickLine={false} minTickGap={18} />
                <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill: "var(--ghost)", fontSize: 10, fontFamily: F_MONO }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={dicaGrafico} formatter={(v, k) => [`${v} kg`, k === "real" ? "pesado" : "plano"]} />
                <Line type="linear" dataKey="ideal" stroke="var(--ghost)" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="real" stroke={COR_PLANO} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}

      {semanas.length ? (
        <Card className="px-6 py-6">
          <H size={18} color="var(--a-CI)" icon={<BarChart3 size={16} />}>Resumo por semana</H>
          <Mini style={{ marginTop: 6 }}>variação da semana 1 contra o peso inicial; as outras, contra a semana anterior</Mini>
          <div className="mt-4 overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 620 }}>
              <thead>
                <tr style={{ color: T.faint, textAlign: "left" }}>
                  {["Semana", "Peso médio", "Variação", "Cintura", "Treinos", "Passos", "Proteína ok", "kcal média"].map((h) => (
                    <th key={h} style={{ padding: "6px 8px", fontWeight: 600, fontSize: 11.5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {semanas.map((s) => {
                  const atual = today >= s.de && today <= s.ate;
                  return (
                    <tr key={s.n} style={{ borderTop: `1px solid ${T.line}`, background: atual ? soft("var(--a-GO)", 8) : "transparent" }}>
                      <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 600 }}>Semana {s.n}</div>
                        <Mini>{fmtData(s.de)} a {fmtData(s.ate)}</Mini>
                      </td>
                      <td style={{ padding: "8px", fontFamily: F_MONO }}>{s.pesoMedio == null ? "—" : fmtNum(s.pesoMedio, 1)}</td>
                      <td style={{ padding: "8px", fontFamily: F_MONO, color: tovCor(s.variacao) }}>
                        {s.variacao == null ? "—" : `${s.variacao > 0 ? "+" : ""}${fmtNum(s.variacao, 1)}`}
                      </td>
                      <td style={{ padding: "8px", fontFamily: F_MONO }}>{s.cintura == null ? "—" : fmtNum(s.cintura, 1)}</td>
                      <td style={{ padding: "8px", fontFamily: F_MONO }}>{s.treinos}{s.treinosPrevistos ? ` / ${s.treinosPrevistos}` : ""}</td>
                      <td style={{ padding: "8px", fontFamily: F_MONO }}>{s.passosMedios == null ? "—" : fmtNum(s.passosMedios)}</td>
                      <td style={{ padding: "8px", fontFamily: F_MONO }}>{s.diasProteina}</td>
                      <td style={{ padding: "8px", fontFamily: F_MONO }}>{s.kcalMedia == null ? "—" : fmtNum(s.kcalMedia)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="px-6 py-6">
          <H size={18} color="var(--ok)" icon={<Target size={16} />}>Metas de cada dia</H>
          <div className="mt-4 flex flex-col gap-2.5">
            {[
              [<Flame key="i" size={15} />, "Calorias", meta.kcalMin ? `${fmtNum(meta.kcalMin)} a ${fmtNum(meta.kcalMax || meta.kcalMin)} kcal` : ""],
              [<Beef key="i" size={15} />, "Proteína", meta.protMin ? `${fmtNum(meta.protMin)}${meta.protMax ? ` a ${fmtNum(meta.protMax)}` : ""} g` : ""],
              [<Footprints key="i" size={15} />, "Passos", meta.passosMin ? `${fmtNum(meta.passosMin)}${meta.passosMax ? ` a ${fmtNum(meta.passosMax)}` : ""}` : ""],
              [<BedDouble key="i" size={15} />, "Sono", meta.sonoMin ? `${fmtNum(meta.sonoMin, 1)} h ou mais` : ""],
              [<Droplets key="i" size={15} />, "Água", meta.aguaMin ? `${fmtNum(meta.aguaMin, 1)}${meta.aguaMax ? ` a ${fmtNum(meta.aguaMax, 1)}` : ""} L` : ""],
            ].filter((x) => x[2]).map(([icone, nome, valor]) => (
              <div key={nome} className="flex items-center gap-3">
                <span style={{ color: T.faint, display: "inline-flex" }}>{icone}</span>
                <span className="flex-1" style={{ fontSize: 14.5, color: T.dim }}>{nome}</span>
                <span style={{ fontSize: 14.5, fontWeight: 600, fontFamily: F_MONO }}>{valor}</span>
              </div>
            ))}
          </div>
          {gasto ? (
            <Mini style={{ marginTop: 14, lineHeight: 1.6 }}>
              Seu gasto estimado é de {fmtNum(gasto.gasto)} kcal por dia (basal {fmtNum(gasto.tmb)} × {fmtNum(gasto.fator, 2)}).
              {deficit > 0 ? ` Comendo dentro da meta, o déficit fica em uns ${fmtNum(deficit)} kcal por dia, perto de ${fmtNum((deficit * 7) / 7700, 1)} kg de gordura por semana.` : ""}
            </Mini>
          ) : (
            <Mini style={{ marginTop: 14 }}>informe idade e sexo em “ajustar” para ver o gasto estimado</Mini>
          )}
          <div className="mt-4 flex gap-3 flex-wrap">
            <Mini style={{ color: semAlcool ? T.ok : T.faint }}>
              {semAlcool ? `${semAlcool} dia${semAlcool === 1 ? "" : "s"} seguido${semAlcool === 1 ? "" : "s"} sem álcool e refri` : "marque “sem álcool e refri” no controle do dia"}
            </Mini>
          </div>
        </Card>

        {(meta.regras || []).length ? (
          <Card className="px-6 py-6">
            <H size={18} color="var(--warn)" icon={<Flag size={16} />}>Regras de ouro</H>
            <ul style={{ margin: "14px 0 0", paddingLeft: 18, color: T.dim, fontSize: 14.5, lineHeight: 1.75 }}>
              {meta.regras.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </Card>
        ) : null}
      </div>

      {(treino.semana || []).some((s) => s && s.atividade) ? (
        <Card className="px-6 py-6">
          <H size={18} color="var(--a-PE)" icon={<CalendarDays size={16} />}>A semana</H>
          <div className="mt-4 flex flex-col gap-2">
            {DIAS_PLANO.map((d, i) => {
              const s = (treino.semana || [])[i] || {};
              const hoje = diaDaSemanaPlano(today) === i;
              return (
                <div key={d} className="rounded-2xl px-4 py-3 flex items-start gap-3"
                  style={{ background: hoje ? soft("var(--a-PE)", 12) : T.card2, border: `1px solid ${hoje ? soft("var(--a-PE)", 40) : "transparent"}` }}>
                  <span style={{ width: 70, flexShrink: 0, fontSize: 13.5, color: T.faint, fontWeight: 600 }}>{d}</span>
                  <span className="flex-1 min-w-0">
                    <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{s.atividade || "—"}</span>
                    {s.descricao ? <Mini style={{ marginTop: 2 }}>{s.descricao}</Mini> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <ImportarPlanilha {...{ treino, gravar, notify }} compacto />
    </div>
  );
}

/* ── alimentação ─────────────────────────────────────────────────────── */

const LADO_FOTO_PRATO = 1024;
const QUALIDADE_FOTO_PRATO = 0.72;
const MAX_FOTOS_PRATO = 3;

/* Maior que a foto do mural de treino: aqui a IA precisa distinguir arroz
   de purê e contar os pedaços de frango. Menor que a do cronograma, que
   precisa de letra miúda. */
function reduzirFotoDoPrato(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const fator = Math.min(1, LADO_FOTO_PRATO / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * fator));
      c.height = Math.max(1, Math.round(img.height * fator));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", QUALIDADE_FOTO_PRATO));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não consegui abrir essa foto. Se for do iPhone, mande como JPEG."));
    };
    img.src = url;
  });
}

/* A refeição que faz sentido agora, pelo horário do cardápio: às 13h o
   padrão é o almoço, e não o café da manhã. */
function refeicaoDaHora(refeicoes, agora) {
  const min = agora.getHours() * 60 + agora.getMinutes();
  let escolhida = "";
  for (const r of refeicoes || []) {
    const m = /(\d{1,2})\s*h\s*(\d{2})?/i.exec(r.horario || "");
    if (!m) continue;
    const quando = Number(m[1]) * 60 + Number(m[2] || 0);
    if (quando - 45 <= min) escolhida = r.nome;
  }
  return escolhida || ((refeicoes || [])[0] || {}).nome || "Refeição";
}

const FONTE_COMIDA = { foto: "pela foto", texto: "pela descrição", cardapio: "do cardápio", manual: "na mão" };

/* A estimativa da IA, para conferir antes de salvar. */
/* Os campos guardam o que foi digitado, e o número só sai na hora de
   somar: convertendo a cada tecla, "2," virava 2 e a vírgula sumia antes
   de dar para escrever o 5. */
const decimalDigitado = (v) => { const n = numerosDoTexto(v)[0]; return Number.isFinite(n) && n >= 0 ? n : 0; };
const comVirgula = (v) => (v == null || v === "" ? "" : String(v).replace(".", ","));

function ConferirRefeicao({ analise, aoSalvar, aoDescartar }) {
  const [itens, setItens] = useState(() => analise.itens.map((it) => ({
    ...it, kcal: comVirgula(it.kcal), proteina: comVirgula(it.proteina), carbo: comVirgula(it.carbo), gordura: comVirgula(it.gordura),
  })));
  const [fator, setFator] = useState(1);
  const numeros = itens.map((it) => ({
    ...it, kcal: decimalDigitado(it.kcal), proteina: decimalDigitado(it.proteina),
    carbo: decimalDigitado(it.carbo), gordura: decimalDigitado(it.gordura),
  }));
  const total = somarItens(numeros.map((it) => ({
    kcal: it.kcal * fator, proteina: it.proteina * fator, carbo: it.carbo * fator, gordura: it.gordura * fator,
  })));
  const mudar = (i, k, v) => setItens((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: String(v).replace(/[^\d.,]/g, "").slice(0, 8) } : x)));
  return (
    <div className="mt-5 rounded-2xl px-4 py-4" style={{ background: T.card2 }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Label>Confira antes de salvar</Label>
        <Mini style={{ color: analise.confianca === "baixa" ? T.warn : T.faint }}>
          confiança {analise.confianca === "media" ? "média" : analise.confianca}
        </Mini>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {itens.map((it, i) => (
          <div key={i} className="rounded-xl px-3 py-2.5" style={{ background: T.card3 }}>
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0" style={{ fontSize: 14.5, fontWeight: 600 }}>{it.nome}</span>
              <button type="button" aria-label="Tirar este item" className="toque"
                onClick={() => setItens((xs) => xs.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer" }}><X size={13} /></button>
            </div>
            {it.quantidade ? <Mini>{it.quantidade}</Mini> : null}
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[["kcal", "kcal"], ["proteina", "prot. g"], ["carbo", "carb. g"], ["gordura", "gord. g"]].map(([k, r]) => (
                <label key={k} style={{ fontSize: 11.5, color: T.faint }}>
                  {r}
                  <input value={it[k]} inputMode="decimal" aria-label={`${r} de ${it.nome}`}
                    onChange={(e) => mudar(i, k, e.target.value)}
                    style={{ ...inp, padding: "7px 10px", fontSize: 14, marginTop: 3 }} />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <Mini>porção:</Mini>
        {[[0.5, "metade"], [1, "igual"], [1.5, "1,5×"], [2, "dobro"]].map(([v, r]) => (
          <Btn key={v} size="sm" tone={fator === v ? "primary" : "quiet"} onClick={() => setFator(v)}>{r}</Btn>
        ))}
      </div>
      {analise.observacao ? <Mini style={{ marginTop: 10, lineHeight: 1.6 }}>{analise.observacao}</Mini> : null}
      <div className="mt-4 flex items-baseline gap-3 flex-wrap">
        <Num size={26}>{fmtNum(total.kcal)} kcal</Num>
        <Mini>{fmtNum(total.proteina, 1)} g proteína · {fmtNum(total.carbo, 1)} g carbo · {fmtNum(total.gordura, 1)} g gordura</Mini>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Btn tone="primary" disabled={!itens.length} onClick={() => aoSalvar(numeros.map((it) => ({
          ...it,
          kcal: Math.round(it.kcal * fator), proteina: umaCasa(it.proteina * fator),
          carbo: umaCasa(it.carbo * fator), gordura: umaCasa(it.gordura * fator),
        })), total)}><Check size={15} /> salvar a refeição</Btn>
        <Btn tone="outline" onClick={aoDescartar}>descartar</Btn>
      </div>
    </div>
  );
}

function AnotarRefeicao({ treino, gravar, notify, nuvem, dia }) {
  const refeicoes = (treino.cardapio && treino.cardapio.refeicoes) || [];
  const opcoes = [...refeicoes.map((r) => r.nome), "Lanche extra", "Outra"];
  const [refeicao, setRefeicao] = useState(() => refeicaoDaHora(refeicoes, new Date()));
  const [modo, setModo] = useState("foto");
  const [fotos, setFotos] = useState([]);
  const [descricao, setDescricao] = useState("");
  const [manual, setManual] = useState({ kcal: "", proteina: "", carbo: "", gordura: "" });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [analise, setAnalise] = useState(null);
  const ref = useRef(null);

  const limpar = () => { setFotos([]); setDescricao(""); setAnalise(null); setErro(""); setManual({ kcal: "", proteina: "", carbo: "", gordura: "" }); };

  const salvar = (itens, total, fonte, extra) => {
    const nova = {
      id: uid(), data: dia, refeicao: String(refeicao).slice(0, 40),
      descricao: String((extra && extra.descricao) || descricao || itens.map((i) => i.nome).join(", ")).slice(0, 200),
      itens: itens.slice(0, 15).map((i) => ({
        nome: String(i.nome || "").slice(0, 60), quantidade: String(i.quantidade || "").slice(0, 40),
        kcal: Math.round(Number(i.kcal) || 0), proteina: umaCasa(Number(i.proteina) || 0),
        carbo: umaCasa(Number(i.carbo) || 0), gordura: umaCasa(Number(i.gordura) || 0),
      })),
      kcal: Math.round(total.kcal), proteina: umaCasa(total.proteina), carbo: umaCasa(total.carbo), gordura: umaCasa(total.gordura),
      fonte, confianca: (extra && extra.confianca) || "", em: Date.now(),
    };
    gravar((t) => ({ ...t, comidas: guardarComida(t.comidas, nova) }));
    notify(`${nova.refeicao}: ${fmtNum(nova.kcal)} kcal anotadas.`);
    limpar();
  };

  const escolherFotos = async (lista) => {
    setErro("");
    const arquivos = [...(lista || [])].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (!arquivos.length) return;
    try {
      const novas = [];
      for (const a of arquivos.slice(0, MAX_FOTOS_PRATO - fotos.length)) novas.push(await reduzirFotoDoPrato(a));
      setFotos((f) => [...f, ...novas].slice(0, MAX_FOTOS_PRATO));
    } catch (e) { setErro(e.message); }
  };

  const perguntarIA = async () => {
    setErro(""); setAnalise(null);
    const token = await tokenDaConta(nuvem);
    if (!token) { setErro("Entre na sua conta para a IA calcular as calorias."); return; }
    setOcupado(true);
    const { dados, erro: falhou } = await chamarApi(ROTA_REFEICAO_IA, {
      token, refeicao, descricao: descricao.trim(),
      imagens: modo === "foto" ? fotos.map((d) => ({ tipo: "image/jpeg", dados: d.split(",")[1] })) : [],
    }, "O contador de calorias");
    setOcupado(false);
    if (falhou) { setErro(falhou); return; }
    if (!dados || dados.erro) { setErro((dados && dados.erro) || "Não consegui calcular."); return; }
    const a = limparAnalise(dados);
    if (!a.itens.length) { setErro("A IA não reconheceu comida nenhuma. Tente descrever o prato."); return; }
    setAnalise(a);
  };

  const salvarManual = () => {
    const n = (v) => { const x = numerosDoTexto(v)[0]; return Number.isFinite(x) && x >= 0 ? x : 0; };
    const total = { kcal: n(manual.kcal), proteina: n(manual.proteina), carbo: n(manual.carbo), gordura: n(manual.gordura) };
    if (!total.kcal) { setErro("Escreva pelo menos as calorias."); return; }
    if (total.kcal > 5000) { setErro("Mais de 5.000 kcal numa refeição? Confira o número."); return; }
    salvar([{ nome: descricao.trim() || refeicao, quantidade: "", ...total }], total, "manual", { descricao: descricao.trim() || refeicao });
  };

  const MODOS = [["foto", "Foto", Camera], ["texto", "Descrever", FileText], ["cardapio", "Do cardápio", ListChecks], ["manual", "Na mão", Calculator]];

  return (
    <Card className="px-6 py-6">
      <H color={COR_COMIDA} icon={<Utensils size={16} />}>Anotar refeição</H>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label style={{ fontSize: 11 }}>Refeição</Label>
          <select value={refeicao} onChange={(e) => setRefeicao(e.target.value)} style={{ ...inp, marginTop: 4 }}>
            {(opcoes.indexOf(refeicao) >= 0 ? opcoes : [refeicao, ...opcoes]).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4 flex gap-2 flex-wrap">
        {MODOS.map(([id, rotulo, Icone]) => (
          <Btn key={id} size="sm" tone={modo === id ? "primary" : "quiet"} onClick={() => { setModo(id); setAnalise(null); setErro(""); }}>
            <Icone size={13} /> {rotulo}
          </Btn>
        ))}
      </div>

      {modo === "foto" ? (
        <div className="mt-4">
          <input ref={ref} type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }}
            onChange={(e) => { escolherFotos(e.target.files); e.target.value = ""; }} />
          <div className="flex gap-2 flex-wrap items-center">
            {fotos.map((f, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={f} alt={`Foto ${i + 1} do prato`} style={{ width: 92, height: 92, objectFit: "cover", borderRadius: 14, display: "block" }} />
                <button type="button" aria-label="Tirar a foto" onClick={() => setFotos((xs) => xs.filter((_, j) => j !== i))}
                  style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 999, border: "none", background: "rgba(0,0,0,.6)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X size={12} />
                </button>
              </div>
            ))}
            {fotos.length < MAX_FOTOS_PRATO ? (
              <button type="button" className="toque" onClick={() => ref.current && ref.current.click()}
                style={{ width: 92, height: 92, borderRadius: 14, border: `1px dashed ${T.line2}`, background: T.card2, color: T.dim, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 12, fontFamily: F_UI }}>
                <Camera size={20} /> {fotos.length ? "mais uma" : "foto do prato"}
              </button>
            ) : null}
          </div>
          <Area style={{ marginTop: 12, minHeight: 64 }} value={descricao}
            placeholder="Opcional: o que a foto não mostra, como frango 180 g, arroz integral, 1 col. de azeite"
            onChange={(e) => setDescricao(e.target.value)} />
          <div className="mt-3">
            <Btn tone="primary" disabled={ocupado || !fotos.length} onClick={perguntarIA}>
              <Sparkles size={15} /> {ocupado ? "Calculando…" : "Calcular com IA"}
            </Btn>
          </div>
        </div>
      ) : null}

      {modo === "texto" ? (
        <div className="mt-4">
          <Area style={{ minHeight: 84 }} value={descricao}
            placeholder="Ex.: 3 ovos mexidos, 2 fatias de pão integral e um mamão"
            onChange={(e) => setDescricao(e.target.value)} />
          <div className="mt-3">
            <Btn tone="primary" disabled={ocupado || descricao.trim().length < 3} onClick={perguntarIA}>
              <Sparkles size={15} /> {ocupado ? "Calculando…" : "Calcular com IA"}
            </Btn>
          </div>
        </div>
      ) : null}

      {modo === "cardapio" ? (
        refeicoes.length ? (
          <div className="mt-4 flex flex-col gap-2">
            {refeicoes.map((r) => {
              const t = somarItens(r.itens);
              return (
                <div key={r.id || r.nome} className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: T.card2 }}>
                  <span className="flex-1 min-w-0">
                    <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{r.nome}{r.horario ? ` · ${r.horario}` : ""}</span>
                    <Mini style={{ marginTop: 2 }}>{fmtNum(t.kcal)} kcal · {fmtNum(t.proteina)} g proteína</Mini>
                  </span>
                  <Btn size="sm" onClick={() => {
                    setRefeicao(r.nome);
                    salvar(r.itens.map((i) => ({ nome: i.alimento, quantidade: i.quantidade, kcal: i.kcal, proteina: i.proteina, carbo: i.carbo || 0, gordura: i.gordura || 0 })),
                      t, "cardapio", { descricao: `${r.nome} do cardápio` });
                  }}><Plus size={13} /> anotar</Btn>
                </div>
              );
            })}
            <Mini>anota a refeição como está no plano; se comeu diferente, use a foto ou a descrição</Mini>
          </div>
        ) : <Mini style={{ marginTop: 14 }}>importe a planilha para ter o cardápio aqui</Mini>
      ) : null}

      {modo === "manual" ? (
        <div className="mt-4">
          <TextInput value={descricao} placeholder="o que comeu" onChange={(e) => setDescricao(e.target.value)} />
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[["kcal", "kcal"], ["proteina", "proteína g"], ["carbo", "carbo g"], ["gordura", "gordura g"]].map(([k, r]) => (
              <TextInput key={k} inputMode="decimal" placeholder={r} aria-label={r} value={manual[k]}
                onChange={(e) => setManual((m) => ({ ...m, [k]: e.target.value }))} />
            ))}
          </div>
          <div className="mt-3"><Btn tone="primary" onClick={salvarManual}><Check size={15} /> salvar</Btn></div>
        </div>
      ) : null}

      {erro ? <Label style={{ marginTop: 12, color: T.bad, textTransform: "none", letterSpacing: 0 }}>{erro}</Label> : null}
      {analise ? (
        <ConferirRefeicao analise={analise} aoDescartar={() => setAnalise(null)}
          aoSalvar={(itens, total) => salvar(itens, total, modo === "foto" ? "foto" : "texto", { confianca: analise.confianca })} />
      ) : null}
    </Card>
  );
}

function CardapioDoPlano({ cardapio, meta }) {
  const [aberto, setAberto] = useState(false);
  const refeicoes = cardapio.refeicoes || [];
  const total = somarItens(refeicoes.flatMap((r) => r.itens));
  const sc = statusCalorias(total.kcal, meta);
  const sp = statusProteina(Math.round(total.proteina), meta);
  return (
    <Card className="px-6 py-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <H size={18} color={COR_COMIDA} icon={<Salad size={16} />}>Cardápio do plano</H>
        <Btn size="sm" tone="outline" onClick={() => setAberto((v) => !v)}>{aberto ? "recolher" : "ver tudo"}</Btn>
      </div>
      <Mini style={{ marginTop: 8 }}>
        {fmtNum(total.kcal)} kcal · {fmtNum(total.proteina)} g proteína no dia ·{" "}
        <span style={{ color: tomCor(sc.tom) }}>{sc.texto}</span> · <span style={{ color: tomCor(sp.tom) }}>proteína: {sp.texto}</span>
      </Mini>
      {aberto ? (
        <>
          {cardapio.nota ? <Mini style={{ marginTop: 10, lineHeight: 1.6 }}>{cardapio.nota}</Mini> : null}
          <div className="mt-4 flex flex-col gap-3">
            {refeicoes.map((r) => {
              const t = somarItens(r.itens);
              return (
                <div key={r.id || r.nome} className="rounded-2xl px-4 py-3" style={{ background: T.card2 }}>
                  <div className="flex items-center justify-between gap-3">
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{r.nome}</span>
                    <Mini style={{ fontFamily: F_MONO }}>{r.horario}</Mini>
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    {r.itens.map((it) => (
                      <div key={it.id || it.alimento} className="flex items-baseline gap-2">
                        <span className="flex-1 min-w-0" style={{ fontSize: 14, color: T.dim }}>
                          {it.alimento}{it.quantidade ? <span style={{ color: T.faint }}> · {it.quantidade}</span> : null}
                        </span>
                        <span style={{ fontSize: 13, fontFamily: F_MONO, color: T.faint, whiteSpace: "nowrap" }}>{fmtNum(it.kcal)} kcal · {fmtNum(it.proteina)} g</span>
                      </div>
                    ))}
                  </div>
                  <Mini style={{ marginTop: 6, textAlign: "right" }}>{fmtNum(t.kcal)} kcal · {fmtNum(t.proteina)} g proteína</Mini>
                </div>
              );
            })}
          </div>
          {(cardapio.avisos || []).map((a) => (
            <div key={a} className="mt-4 rounded-2xl px-4 py-3" style={{ background: soft("var(--warn)", 12), border: `1px solid ${soft("var(--warn)", 30)}` }}>
              <Mini style={{ color: T.warn, lineHeight: 1.6 }}>{a}</Mini>
            </div>
          ))}
          {(cardapio.substituicoes || []).length ? (
            <>
              <Label style={{ marginTop: 22 }}>Substituições equivalentes</Label>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cardapio.substituicoes.map((s) => (
                  <div key={s.grupo} className="rounded-2xl px-4 py-3" style={{ background: T.card2 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700 }}>{s.grupo}</span>
                    {s.referencia ? <Mini>{s.referencia}</Mini> : null}
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: T.dim, fontSize: 13.5, lineHeight: 1.65 }}>
                      {s.opcoes.map((o) => <li key={o}>{o}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {(cardapio.secoes || []).map((s) => (
            <div key={s.titulo}>
              <Label style={{ marginTop: 22 }}>{s.titulo}</Label>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: T.dim, fontSize: 14, lineHeight: 1.7 }}>
                {s.itens.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </div>
          ))}
        </>
      ) : null}
    </Card>
  );
}

function Alimentacao({ treino, gravar, notify, today, nuvem }) {
  const meta = treino.meta || {};
  const [dia, setDia] = useState(today);
  const doDia = (treino.comidas || []).filter((c) => c.data === dia).sort((a, b) => (a.em || 0) - (b.em || 0));
  const tot = totaisDoDia(treino.comidas, dia);
  const sc = statusCalorias(tot.kcal, meta);
  const sp = statusProteina(tot.proteina, meta);
  const teto = meta.kcalMax || meta.kcalMin || 2500;
  const abaixoDoPiso = meta.kcalPiso && tot.n && dia < today && tot.kcal < meta.kcalPiso;

  const historico = useMemo(() => {
    const saida = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(today, -i);
      const t = totaisDoDia(treino.comidas, d);
      saida.push({ dia: brDate(d).slice(0, 5), kcal: t.n ? t.kcal : null, proteina: t.n ? t.proteina : null });
    }
    return saida;
  }, [treino.comidas, today]);
  const temHistorico = historico.filter((x) => x.kcal != null).length >= 2;

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-6" brilho={COR_COMIDA}>
        <div className="flex items-center justify-between gap-3">
          <Btn size="sm" tone="quiet" title="Dia anterior" onClick={() => setDia((d) => addDays(d, -1))}><ChevronLeft size={15} /></Btn>
          <div className="text-center">
            <Label>{dia === today ? "Hoje" : DIAS_PLANO[diaDaSemanaPlano(dia)]}</Label>
            <Mini>{brDate(dia)}</Mini>
          </div>
          <Btn size="sm" tone="quiet" title="Dia seguinte" disabled={dia >= today} onClick={() => setDia((d) => addDays(d, 1))}><ChevronRight size={15} /></Btn>
        </div>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Label>Calorias</Label>
              <Mini>{meta.kcalMin ? `meta ${fmtNum(meta.kcalMin)} a ${fmtNum(meta.kcalMax || meta.kcalMin)}` : ""}</Mini>
            </div>
            <div style={{ marginTop: 4 }}><Num size={32} color={tomCor(sc.tom) === T.faint ? T.ink : tomCor(sc.tom)}>{fmtNum(tot.kcal)}</Num></div>
            <div className="mt-2"><Track pct={(tot.kcal / teto) * 100} color={tomCor(sc.tom) === T.faint ? COR_COMIDA : tomCor(sc.tom)} height={8} /></div>
            <Mini style={{ marginTop: 6, color: tomCor(sc.tom) }}>{sc.texto}</Mini>
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Label>Proteína</Label>
              <Mini>{meta.protMin ? `meta ${fmtNum(meta.protMin)} g` : ""}</Mini>
            </div>
            <div style={{ marginTop: 4 }}><Num size={32} color={sp.tom === "ok" ? T.ok : T.ink}>{fmtNum(tot.proteina)} g</Num></div>
            <div className="mt-2"><Track pct={meta.protMin ? (tot.proteina / meta.protMin) * 100 : 0} color={sp.tom === "ok" ? "var(--ok)" : "var(--a-CI)"} height={8} /></div>
            <Mini style={{ marginTop: 6, color: tomCor(sp.tom) }}>{sp.texto}</Mini>
          </div>
        </div>
        <Mini style={{ marginTop: 12 }}>{fmtNum(tot.carbo)} g carboidrato · {fmtNum(tot.gordura)} g gordura · {tot.n} refeiç{tot.n === 1 ? "ão" : "ões"}</Mini>
        {abaixoDoPiso ? (
          <div className="mt-4 rounded-2xl px-4 py-3" style={{ background: soft("var(--warn)", 12), border: `1px solid ${soft("var(--warn)", 30)}` }}>
            <Mini style={{ color: T.warn, lineHeight: 1.6 }}>
              Ficou abaixo de {fmtNum(meta.kcalPiso)} kcal. Comer pouco demais perde músculo e dá rebote: volte ao cardápio na próxima refeição.
            </Mini>
          </div>
        ) : null}
      </Card>

      <AnotarRefeicao key={dia} {...{ treino, gravar, notify, nuvem, dia }} />

      <Card className="px-6 py-6">
        <H size={18} color={COR_COMIDA} icon={<ListChecks size={16} />}>O que foi anotado</H>
        {doDia.length === 0 ? (
          <Mini style={{ marginTop: 12 }}>nada neste dia ainda</Mini>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {doDia.map((c) => (
              <div key={c.id} className="rounded-2xl px-4 py-3" style={{ background: T.card2 }}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0" style={{ fontSize: 15, fontWeight: 700 }}>{c.refeicao}</span>
                  <span style={{ fontFamily: F_MONO, fontSize: 14, fontWeight: 600 }}>{fmtNum(c.kcal)} kcal</span>
                  <button type="button" aria-label="Apagar refeição" className="toque"
                    onClick={() => { gravar((t) => ({ ...t, comidas: (t.comidas || []).filter((x) => x.id !== c.id) })); notify("Refeição apagada."); }}
                    style={{ background: "none", border: "none", color: T.ghost, cursor: "pointer" }}><Trash2 size={13} /></button>
                </div>
                <Mini style={{ marginTop: 3, lineHeight: 1.55 }}>{c.descricao}</Mini>
                <Mini style={{ marginTop: 3 }}>
                  {fmtNum(c.proteina, 1)} g proteína · {fmtNum(c.carbo, 1)} g carbo · {fmtNum(c.gordura, 1)} g gordura · {FONTE_COMIDA[c.fonte] || ""}
                </Mini>
              </div>
            ))}
          </div>
        )}
      </Card>

      {temHistorico ? (
        <Card className="px-6 py-6">
          <H size={18} color={COR_COMIDA} icon={<BarChart3 size={16} />}>Últimos 14 dias</H>
          <div className="mt-4" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={historico} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 5" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fill: "var(--ghost)", fontSize: 10, fontFamily: F_MONO }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--ghost)", fontSize: 10, fontFamily: F_MONO }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={dicaGrafico} formatter={(v) => [`${v} kcal`, "calorias"]} cursor={{ fill: "var(--card2)" }} />
                {meta.kcalMin ? <ReferenceLine y={meta.kcalMin} stroke="var(--ok)" strokeDasharray="4 4" /> : null}
                {meta.kcalMax ? <ReferenceLine y={meta.kcalMax} stroke="var(--bad)" strokeDasharray="4 4" /> : null}
                <Bar dataKey="kcal" fill={COR_COMIDA} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Mini style={{ marginTop: 8 }}>linhas: mínimo e máximo da meta</Mini>
        </Card>
      ) : null}

      {treino.cardapio && (treino.cardapio.refeicoes || []).length ? <CardapioDoPlano cardapio={treino.cardapio} meta={meta} /> : null}
    </div>
  );
}

/* ── o registro de cargas do mês ─────────────────────────────────────── */

function RegistroDoMes({ treino }) {
  const meta = treino.meta || {};
  const plano = (treino.planos || []).find((p) => p.id === treino.planoAtivo) || (treino.planos || [])[0];
  const semanas = useMemo(() => semanasDoPlano(meta.inicio, meta.fim), [meta.inicio, meta.fim]);
  const linhas = useMemo(() => tabelaDeCargas(plano, treino.sessoes, semanas), [plano, treino.sessoes, semanas]);
  if (!semanas.length || !linhas.length) return null;
  return (
    <Card className="px-6 py-6">
      <H size={18} color="var(--a-CI)" icon={<ListChecks size={16} />}>Registro de cargas do mês</H>
      <Mini style={{ marginTop: 6 }}>a última série de cada exercício, semana a semana, pelos treinos registrados</Mini>
      <div className="mt-4 overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 180 + semanas.length * 86 }}>
          <thead>
            <tr style={{ color: T.faint, textAlign: "left" }}>
              <th style={{ padding: "6px 8px", fontSize: 11.5, fontWeight: 600 }}>Exercício</th>
              {semanas.map((s) => (
                <th key={s.n} style={{ padding: "6px 8px", fontSize: 11.5, fontWeight: 600 }}>S{s.n}<br /><span style={{ fontWeight: 500 }}>{fmtData(s.de)}</span></th>
              ))}
              <th style={{ padding: "6px 8px", fontSize: 11.5, fontWeight: 600 }}>Ganho</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.ficha + l.nome} style={{ borderTop: `1px solid ${T.line}` }}>
                <td style={{ padding: "8px" }}>
                  <div style={{ fontWeight: 600 }}>{l.nome}</div>
                  <Mini>{l.ficha}</Mini>
                </td>
                {l.porSemana.map((x, i) => (
                  <td key={i} style={{ padding: "8px", fontFamily: F_MONO, color: x ? T.ink : T.ghost }}>
                    {x ? `${fmtNum(x.peso, 1)}×${x.reps}` : "—"}
                  </td>
                ))}
                <td style={{ padding: "8px", fontFamily: F_MONO, color: l.ganho > 0 ? T.ok : T.faint }}>
                  {l.ganho == null ? "—" : `${l.ganho > 0 ? "+" : ""}${fmtNum(l.ganho, 1)} kg`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
