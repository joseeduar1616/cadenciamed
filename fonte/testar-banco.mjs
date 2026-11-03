import { readFileSync } from 'node:fs';
/* Testa o banco de questões (/api/banco) sem Firebase e sem IA de verdade.
 *
 * O que se prova: o gabarito oficial colado do PDF da banca é lido nos
 * formatos que as bancas publicam; a classificação da IA só passa quando
 * confere com as especialidades do cronograma; quem não tem plano não lê
 * o banco; só o dono monta; pôr uma prova no banco grava uma questão por
 * documento, com o gabarito oficial mandando e a divergência marcada;
 * refazer não duplica; a busca filtra e pagina; tirar do banco apaga tudo.
 *
 *   node testar-banco.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const { generateKeyPairSync } = await import('node:crypto');
const CONTA = {
  client_email: 'teste@exemplo.iam.gserviceaccount.com',
  private_key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

/* ── o Firestore de mentira ─────────────────────────────────────────── */
const PREFIXO = 'projects/cadencia-7c1f1/databases/(default)/documents/';
let DOCS = {};                 // caminho → fields
let QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };
let pedidosIA = [];
let respostaIA = null;         // função (material) → texto
const resp = (c, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { 'Content-Type': 'application/json' } });
const valorDe = (v) => (v == null ? undefined : v.stringValue !== undefined ? v.stringValue : v.integerValue !== undefined ? Number(v.integerValue) : v.booleanValue !== undefined ? v.booleanValue : v.doubleValue);
const casa = (fields, filtro) => {
  if (!filtro) return true;
  if (filtro.compositeFilter) return filtro.compositeFilter.filters.every((x) => casa(fields, x));
  const ff = filtro.fieldFilter;
  return valorDe(fields[ff.field.fieldPath]) === valorDe(ff.value);
};

globalThis.fetch = async (url, op = {}) => {
  const u = String(url);
  const metodo = op.method || 'GET';
  if (u.includes('identitytoolkit')) return QUEM ? resp({ users: [QUEM] }) : resp({ error: {} }, 400);
  if (u.includes('oauth2.googleapis.com/token')) return resp({ access_token: 't' });
  if (u.includes('generativelanguage.googleapis.com')) {
    const corpo = JSON.parse(op.body);
    const texto = corpo.contents[corpo.contents.length - 1].parts[0].text;
    const material = JSON.parse(texto.replace(/^"""\n/, '').replace(/\n"""$/, ''));
    pedidosIA.push(material);
    return resp({ candidates: [{ content: { parts: [{ text: respostaIA(material) }] }, finishReason: 'STOP' }] });
  }
  if (u.endsWith(':runQuery')) {
    const q = JSON.parse(op.body).structuredQuery;
    const col = q.from[0].collectionId;
    let nomes = Object.keys(DOCS).filter((k) => k.startsWith(col + '/') && k.split('/').length === 2 && casa(DOCS[k], q.where)).sort();
    if (q.startAt) {
      const ref = q.startAt.values[0].referenceValue.replace(PREFIXO, '');
      nomes = nomes.filter((n) => (q.startAt.before ? n >= ref : n > ref));
    }
    nomes = nomes.slice(0, q.limit || 1000);
    return resp(nomes.length ? nomes.map((n) => ({ document: { name: PREFIXO + n, fields: DOCS[n] } })) : [{ readTime: 'x' }]);
  }
  if (u.endsWith(':commit')) {
    for (const w of JSON.parse(op.body).writes) {
      if (w.update) DOCS[w.update.name.replace(PREFIXO, '')] = w.update.fields;
      if (w.delete) delete DOCS[w.delete.replace(PREFIXO, '')];
    }
    return resp({ writeResults: [] });
  }
  const m = /\/documents\/([^?]+)(\?.*)?$/.exec(u);
  if (m) {
    const caminho = decodeURIComponent(m[1]);
    if (metodo === 'GET' && caminho.split('/').length % 2 === 1) {
      const docs = Object.keys(DOCS).filter((k) => k.startsWith(caminho + '/') && k.split('/').length === caminho.split('/').length + 1)
        .map((k) => ({ name: PREFIXO + k, fields: DOCS[k] }));
      return resp({ documents: docs });
    }
    if (metodo === 'GET') return DOCS[caminho] ? resp({ name: PREFIXO + caminho, fields: DOCS[caminho] }) : resp({}, 404);
    if (metodo === 'PATCH') { DOCS[caminho] = JSON.parse(op.body).fields; return resp({}); }
    if (metodo === 'DELETE') { delete DOCS[caminho]; return resp({}); }
  }
  throw new Error('chamada inesperada: ' + u);
};

const env = { FIREBASE_API_KEY: 'k', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA), GEMINI_API_KEY: 'g' };
const B = await import('../worker/api/banco.js');
const pedir = async (corpo) => {
  const r = await B.onRequest({ request: new Request('http://x/api/banco', { method: 'POST', body: JSON.stringify({ token: 'tk', ...corpo }) }), env });
  return { status: r.status, corpo: await r.json() };
};

/* ── 1. o gabarito oficial ───────────────────────────────────────────── */
{
  const g = B.lerGabarito('1-A 2 - c\n03) D\nQuestão 4: anulada\n5. E 6 X 7 – B');
  if (g[1] === 0 && g[2] === 2 && g[3] === 3 && g[4] === -2 && g[5] === 4 && g[6] === -2 && g[7] === 1) ok('gabarito "1-A 2 - c 03) D ... anulada ... X" lido nos formatos das bancas');
  else falha('gabarito misto: ' + JSON.stringify(g));
  const s = B.lerGabarito('A C B D E\nA');
  if (s[1] === 0 && s[2] === 2 && s[6] === 0 && Object.keys(s).length === 6) ok('só a sequência de letras vira 1, 2, 3...');
  else falha('sequência: ' + JSON.stringify(s));
  const tabela = B.lerGabarito('01 B 02 A 03 C 04 *');
  if (tabela[1] === 1 && tabela[4] === -2) ok('tabela "01 B 02 A ... 04 *" com asterisco de anulada');
  else falha('tabela: ' + JSON.stringify(tabela));
  if (Object.keys(B.lerGabarito('')).length === 0 && Object.keys(B.lerGabarito('sem gabarito aqui')).length === 0) ok('texto sem gabarito não inventa letra');
  else falha('inventou gabarito');
  const palavra = B.lerGabarito('1 Alternativa correta');
  if (palavra[1] === undefined) ok('palavra que começa com A não é lida como letra');
  else falha('palavra virou letra: ' + JSON.stringify(palavra));
}

/* ── 2. a classificação conferida ────────────────────────────────────── */
{
  const a = B.classificacaoValida({ area: 'cl', esp: 'cardiologia', tema: 'IC' }, 'x');
  if (a.area === 'CL' && a.esp === 'Cardiologia' && a.tema === 'IC') ok('área e especialidade casam com o cronograma, sem ligar para maiúscula');
  else falha('classificação boa: ' + JSON.stringify(a));
  const b = B.classificacaoValida({ area: 'CL', esp: 'Obstetrícia', tema: '' }, 'Pré-eclâmpsia');
  if (b.area === 'CL' && b.esp === '' && b.tema === 'Pré-eclâmpsia') ok('especialidade de outra área não passa, e o tema cai no assunto da questão');
  else falha('especialidade errada: ' + JSON.stringify(b));
  const c = B.classificacaoValida({ area: 'XX', esp: 'Cardiologia' }, '');
  if (c.area === '' && c.esp === '') ok('área inventada fica sem área');
  else falha('área inventada: ' + JSON.stringify(c));
  const { CURSO } = await import('./curriculo.js');
  const doCurso = {};
  for (const a of CURSO) { (doCurso[a.area] = doCurso[a.area] || []); if (!doCurso[a.area].includes(a.esp)) doCurso[a.area].push(a.esp); }
  if (JSON.stringify(Object.keys(doCurso).sort().map((k) => [k, doCurso[k]])) === JSON.stringify(Object.keys(B.ESPECIALIDADES).sort().map((k) => [k, B.ESPECIALIDADES[k]]))) ok('as especialidades do banco são exatamente as do cronograma (curriculo.js)');
  else falha('especialidades do banco divergem do cronograma: ' + JSON.stringify(B.ESPECIALIDADES));
}

/* ── 2b. questão autoral ─────────────────────────────────────────────── */
{
  const doc = (autoral) => ({ name: 'projects/x/databases/(default)/documents/banco/autoral-7', fields: {
    prova: { stringValue: 'autoral' }, instituicao: { stringValue: 'Cadência Med (autoral)' }, ano: { integerValue: '0' }, numero: { integerValue: '7' },
    area: { stringValue: 'PR' }, esp: { stringValue: 'SUS' }, tema: { stringValue: 'Princípios do SUS' },
    ...(autoral ? { autoral: { booleanValue: true } } : {}),
    q: { stringValue: JSON.stringify({ enunciado: 'e', alternativas: ['a', 'b', 'c', 'd', 'e'], comentarios: ['1', '2', '3', '4', '5'], certa: 3 }) },
  } });
  const q = B.questaoDoBanco(doc(true)), r = B.questaoDoBanco(doc(false));
  if (q && q.autoral === true && q.certa === 3 && q.oficial === -1 && r && r.autoral === false) ok('questão autoral vem marcada como autoral, com a resposta do comentário');
  else falha('autoral: ' + JSON.stringify([q, r]));
  const tela = readFileSync(new URL('./parte40.jsx', import.meta.url), 'utf8');
  if (/q\.autoral \? "Autoral Cadência Med"/.test(tela) && /Não saiu de prova de banca/.test(tela)) ok('a tela mostra a autoral como autoral, nunca como prova de banca');
  else falha('a tela não marca a questão autoral');
}

/* ── 3. filtros da busca ─────────────────────────────────────────────── */
{
  const f = B.filtrosDaBusca({ area: 'CL', esp: 'Cardiologia', tema: 'IC', instituicao: '  ENARE ', ano: '2024' });
  if (f.area === 'CL' && f.esp === 'Cardiologia' && f.tema === 'IC' && f.instituicao === 'ENARE' && f.ano === 2024) ok('filtros válidos passam limpos');
  else falha('filtros: ' + JSON.stringify(f));
  const g = B.filtrosDaBusca({ area: 'CL', esp: 'Obstetrícia', tema: 'x', ano: 1800 });
  if (g.esp === '' && g.tema === '' && g.ano === 0) ok('especialidade fora da área derruba o tema; ano absurdo vira "todos"');
  else falha('filtros ruins: ' + JSON.stringify(g));
  if (B.idValido('enare2024-37') && !B.idValido('../usuarios/x-1') && !B.idValido('ENARE-1')) ok('cursor/id só aceita "codigo-numero"');
  else falha('idValido');
}

/* ── 4. a prova publicada (como a aba Provas grava) ──────────────────── */
const questao = (n, certa, assunto, extra = {}) => ({
  numero: n, assunto, enunciado: `Paciente ${n}, quadro clássico de ${assunto}. Qual a conduta?${extra.img ? ' [[img:ecg1]]' : ''}`,
  alternativas: ['Alfa', 'Beta', 'Gama', 'Delta'], certa, comentarios: ['c0', 'c1', 'c2', 'c3'],
  fonte: 'Diretriz X', seguranca: 'alta', avisos: '',
});
const Q = [];
for (let n = 1; n <= 30; n += 1) Q.push(questao(n, n % 4, n <= 15 ? 'Insuficiência cardíaca' : 'Pré-eclâmpsia', { img: n === 2 }));
DOCS['provas/enare2024'] = { prova: { stringValue: 'ENARE 2024 objetiva' }, questoes: { integerValue: '30' }, pedacos: { integerValue: '2' } };
DOCS['provas/enare2024/questoes/0'] = { questoes: { arrayValue: { values: Q.slice(0, 20).map((q) => ({ stringValue: JSON.stringify(q) })) } } };
DOCS['provas/enare2024/questoes/1'] = { questoes: { arrayValue: { values: Q.slice(20).map((q) => ({ stringValue: JSON.stringify(q) })) } } };

respostaIA = (material) => JSON.stringify(material.map((m) => (/cardíaca/.test(m.assunto)
  ? { i: m.i, area: 'CL', esp: 'Cardiologia', tema: 'Insuficiência cardíaca' }
  : { i: m.i, area: 'GO', esp: 'Obstetrícia', tema: 'Pré-eclâmpsia' })));

/* ── 5. quem pode ────────────────────────────────────────────────────── */
{
  QUEM = null;
  let r = await pedir({ acao: 'filtros' });
  if (r.status === 403) ok('sem conta: recusa');
  else falha('sem conta: ' + JSON.stringify(r));
  QUEM = { email: 'ana@email.com', localId: 'uid-ana' };
  r = await pedir({ acao: 'buscar' });
  if (r.status === 403 && /plano completo/.test(r.corpo.erro)) ok('sem plano em dia: o banco não abre');
  else falha('sem plano: ' + JSON.stringify(r));
  DOCS['assinaturas/uid-ana'] = { plano: { stringValue: 'anual' }, validoAte: { doubleValue: Date.now() + 86400000 } };
  r = await pedir({ acao: 'indexar', codigo: 'enare2024', instituicao: 'ENARE', ano: 2024 });
  if (r.status === 403 && /Só o dono/.test(r.corpo.erro)) ok('com plano, lê, mas não monta o banco: só o dono');
  else falha('assinante indexando: ' + JSON.stringify(r));
  r = await pedir({ acao: 'fontes' });
  if (r.status === 403) ok('a lista de provas publicadas é só do dono');
  else falha('fontes para assinante: ' + JSON.stringify(r));
  QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };
}

/* ── 6. pôr a prova no banco, em lotes ───────────────────────────────── */
{
  let r = await pedir({ acao: 'indexar', codigo: 'enare2024', instituicao: '', ano: 2024 });
  if (r.status === 400 && /banca/.test(r.corpo.erro)) ok('sem a banca, não indexa');
  else falha('sem banca: ' + JSON.stringify(r));
  r = await pedir({ acao: 'indexar', codigo: 'enare2024', instituicao: 'ENARE', ano: 0 });
  if (r.status === 400 && /ano/.test(r.corpo.erro)) ok('sem o ano, não indexa');
  else falha('sem ano: ' + JSON.stringify(r));
  r = await pedir({ acao: 'indexar', codigo: '../x', instituicao: 'ENARE', ano: 2024 });
  if (r.status === 400) ok('código de prova com barra é recusado');
  else falha('código ruim: ' + JSON.stringify(r));

  r = await pedir({ acao: 'fontes' });
  const f0 = (r.corpo.provas || []).find((p) => p.codigo === 'enare2024');
  if (f0 && f0.questoes === 30 && f0.noBanco === false) ok('o dono vê a prova publicada, fora do banco');
  else falha('fontes: ' + JSON.stringify(r.corpo));

  /* gabarito oficial: 1-B (IA diz 1 % 4 = 1 = B, igual); 2-A (IA diz C: diverge); 3 anulada */
  const gabarito = '1-B 2-A 3-anulada';
  pedidosIA = [];
  r = await pedir({ acao: 'indexar', codigo: 'enare2024', instituicao: 'ENARE', ano: 2024, gabarito, inicio: 0 });
  if (r.status === 200 && r.corpo.fim === false && r.corpo.proximo === 25 && r.corpo.feitas === 25 && r.corpo.total === 30) ok('primeiro lote: 25 de 30, com o próximo início');
  else falha('lote 1: ' + JSON.stringify(r.corpo));
  if (pedidosIA.length === 1 && pedidosIA[0].length === 25 && !/\[\[img/.test(JSON.stringify(pedidosIA[0]))) ok('a IA recebe só o lote, sem o marcador de figura');
  else falha('pedido à IA: ' + pedidosIA.length);
  r = await pedir({ acao: 'indexar', codigo: 'enare2024', instituicao: 'ENARE', ano: 2024, gabarito, inicio: 25 });
  if (r.status === 200 && r.corpo.fim === true && r.corpo.resumo && r.corpo.resumo.total === 30) ok('último lote fecha com o resumo da prova');
  else falha('lote final: ' + JSON.stringify(r.corpo));
  const rs = r.corpo.resumo;
  if (rs.areas.CL === 15 && rs.areas.GO === 15 && rs.esps['CL|Cardiologia'] === 15 && rs.temas['GO|Obstetrícia|Pré-eclâmpsia'] === 15) ok('o resumo conta por área, especialidade e tema');
  else falha('resumo: ' + JSON.stringify(rs));
  if (rs.divergentes === 1 && rs.anuladas === 1) ok('o resumo conta divergentes do oficial e anuladas');
  else falha('divergentes/anuladas: ' + JSON.stringify(rs));

  const ids = Object.keys(DOCS).filter((k) => k.startsWith('banco/'));
  if (ids.length === 30 && DOCS['banco/enare2024-1'] && DOCS['banco/enare2024-30']) ok('uma questão por documento, com id "codigo-numero"');
  else falha('documentos: ' + ids.length);
  const d2 = DOCS['banco/enare2024-2'];
  if (d2.oficial.integerValue === '0' && d2.divergente.booleanValue === true && d2.figura.booleanValue === true) ok('questão 2: oficial A, comentário C, marcada como divergente e com figura');
  else falha('questão 2: ' + JSON.stringify(d2));

  /* refazer não duplica */
  r = await pedir({ acao: 'indexar', codigo: 'enare2024', instituicao: 'ENARE', ano: 2024, gabarito: '', inicio: 0 });
  await pedir({ acao: 'indexar', codigo: 'enare2024', instituicao: 'ENARE', ano: 2024, gabarito: '', inicio: 25 });
  const depois = Object.keys(DOCS).filter((k) => k.startsWith('banco/'));
  if (depois.length === 30 && !DOCS['banco/enare2024-2'].oficial && DOCS['banco/enare2024-2'].divergente.booleanValue === false) ok('refazer sem gabarito substitui as 30, sem duplicar, e tira a divergência');
  else falha('refazer: ' + depois.length + ' ' + JSON.stringify(DOCS['banco/enare2024-2']));
  /* volta o gabarito para os testes de busca */
  await pedir({ acao: 'indexar', codigo: 'enare2024', instituicao: 'ENARE', ano: 2024, gabarito, inicio: 0 });
  await pedir({ acao: 'indexar', codigo: 'enare2024', instituicao: 'ENARE', ano: 2024, gabarito, inicio: 25 });
}

/* ── 7. a IA fora do ar: indexa do mesmo jeito, sem especialidade ───── */
{
  const Q2 = [questao(1, 0, 'Bronquiolite'), questao(2, 1, 'Bronquiolite')];
  DOCS['provas/usp2023'] = { prova: { stringValue: 'USP 2023' }, questoes: { integerValue: '2' }, pedacos: { integerValue: '1' } };
  DOCS['provas/usp2023/questoes/0'] = { questoes: { arrayValue: { values: Q2.map((q) => ({ stringValue: JSON.stringify(q) })) } } };
  respostaIA = () => 'não consegui';
  const r = await pedir({ acao: 'indexar', codigo: 'usp2023', instituicao: 'USP-SP', ano: 2023, inicio: 0 });
  const d = DOCS['banco/usp2023-1'];
  if (r.status === 200 && r.corpo.fim && d && d.area.stringValue === '' && d.tema.stringValue === 'Bronquiolite') ok('IA sem resposta legível: a questão entra sem área, com o assunto como tema');
  else falha('IA fora: ' + JSON.stringify(r.corpo) + JSON.stringify(d));
}

/* ── 8. filtros e busca ──────────────────────────────────────────────── */
{
  QUEM = { email: 'ana@email.com', localId: 'uid-ana' };
  let r = await pedir({ acao: 'filtros' });
  const enare = (r.corpo.provas || []).find((p) => p.codigo === 'enare2024');
  if (r.status === 200 && enare && enare.instituicao === 'ENARE' && enare.ano === 2024 && enare.total === 30 && r.corpo.provas.length === 2) ok('assinante recebe as provas do banco com banca, ano e contagens');
  else falha('filtros: ' + JSON.stringify(r.corpo).slice(0, 300));

  r = await pedir({ acao: 'buscar', filtros: { area: 'CL' } });
  const q1 = r.corpo.questoes[0];
  if (r.status === 200 && r.corpo.questoes.length === 15 && r.corpo.fim === true && r.corpo.questoes.every((q) => q.area === 'CL')) ok('busca por área: só as 15 de clínica, numa página');
  else falha('busca CL: ' + JSON.stringify(r.corpo).slice(0, 200));
  if (q1 && q1.instituicao === 'ENARE' && q1.ano === 2024 && q1.alternativas.length === 4 && q1.comentarios.length === 4 && q1.fonte === 'Diretriz X') ok('cada questão vem com prova, ano, alternativas e o comentário de todas');
  else falha('questão: ' + JSON.stringify(q1));

  r = await pedir({ acao: 'buscar', filtros: {} });
  const pag1 = r.corpo;
  const r2 = await pedir({ acao: 'buscar', filtros: {}, cursor: pag1.cursor });
  const todas = [...pag1.questoes, ...r2.corpo.questoes].map((q) => q.id);
  if (pag1.questoes.length === 20 && pag1.fim === false && r2.corpo.questoes.length === 12 && r2.corpo.fim === true && new Set(todas).size === 32) ok('sem filtro: 20 por página, a segunda continua de onde parou, sem repetir');
  else falha('paginação: ' + pag1.questoes.length + ' ' + r2.corpo.questoes.length + ' ' + new Set(todas).size);

  r = await pedir({ acao: 'buscar', filtros: { instituicao: 'USP-SP', ano: 2023 } });
  if (r.corpo.questoes.length === 2 && r.corpo.questoes.every((q) => q.instituicao === 'USP-SP')) ok('busca por prova e ano');
  else falha('busca prova/ano: ' + r.corpo.questoes.length);

  r = await pedir({ acao: 'buscar', filtros: { area: 'GO', esp: 'Obstetrícia', tema: 'Pré-eclâmpsia', ano: 2024 } });
  if (r.corpo.questoes.length === 15) ok('busca por área + especialidade + tema + ano');
  else falha('busca combinada: ' + r.corpo.questoes.length);

  r = await pedir({ acao: 'buscar', filtros: { area: 'CL' } });
  const q2 = r.corpo.questoes.find((q) => q.id === 'enare2024-2');
  const q3 = r.corpo.questoes.find((q) => q.id === 'enare2024-3');
  const q1b = r.corpo.questoes.find((q) => q.id === 'enare2024-1');
  if (q2 && q2.certa === 0 && q2.certaIA === 2 && q2.divergente && q2.figura) ok('na divergente, a resposta que conta é a oficial (A), e a do comentário (C) vem junto');
  else falha('divergente: ' + JSON.stringify(q2));
  if (q3 && q3.anulada === true) ok('anulada vem marcada');
  else falha('anulada: ' + JSON.stringify(q3));
  if (q1b && q1b.oficial === 1 && q1b.certa === 1 && !q1b.divergente) ok('oficial igual ao comentário: sem divergência');
  else falha('questão 1: ' + JSON.stringify(q1b));

  r = await pedir({ acao: 'buscar', filtros: {}, cursor: '../../usuarios/uid-dono' });
  if (r.status === 200 && r.corpo.questoes.length === 20 && r.corpo.questoes[0].id === 'enare2024-1') ok('cursor estranho é ignorado (volta ao começo), nunca vira caminho');
  else falha('cursor estranho: ' + JSON.stringify(r.corpo).slice(0, 200));
  QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };
}

/* ── 9. tirar do banco ───────────────────────────────────────────────── */
{
  const r = await pedir({ acao: 'remover', codigo: 'usp2023' });
  const sobra = Object.keys(DOCS).filter((k) => k.startsWith('banco/usp2023') || k === 'banco_provas/usp2023');
  if (r.status === 200 && r.corpo.removidas === 2 && !sobra.length && DOCS['banco/enare2024-1']) ok('tirar uma prova apaga as questões dela e o resumo, e só dela');
  else falha('remover: ' + JSON.stringify(r.corpo) + ' sobra=' + sobra.join(','));
  const r2 = await pedir({ acao: 'filtros' });
  if (r2.corpo.provas.length === 1) ok('e os filtros deixam de mostrá-la na hora (cache limpo)');
  else falha('filtros depois de remover: ' + r2.corpo.provas.length);
  const r3 = await pedir({ acao: 'qualquer' });
  if (r3.status === 400) ok('ação desconhecida é recusada');
  else falha('ação desconhecida');
}

console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
