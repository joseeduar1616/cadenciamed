/* Testa o Meu plano: o reajuste automático (parte41, via _plano.mjs) e a
 * leitura das linhas que a IA devolve (worker/api/plano-estudo.js).
 *
 * O que se confere: plano em dia não mexe; o que não foi feito vai para o
 * próximo dia com espaço e empurra o resto na ordem; o que foi adiantado
 * libera espaço; o ritmo real (gastou mais tempo) estica o plano; item
 * fixo não sai do lugar; dia de descanso do plano continua de descanso;
 * aula marcada no site e sessão de questões dão o item por feito; e as
 * datas em semana/dia viram calendário certo.
 *
 *   node testar-meu-plano.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const P = await import('./_plano.mjs');
const R = await import('../worker/api/plano-estudo.js');

const mais = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const SEG = '2026-11-09';   // uma segunda-feira

/* Duas semanas, segunda a sábado com uma aula de 60 min, domingo livre. */
const lidos = [];
for (let n = 0; n < 14; n += 1) {
  const d = mais(SEG, n);
  if (new Date(`${d}T12:00:00Z`).getUTCDay() === 0) continue;
  lidos.push({ data: d, tipo: 'aula', minutos: 60, aula: n === 0 ? 'cardio-ic' : '', fixo: false, titulo: `Aula ${n + 1}` });
}
lidos.push({ data: mais(SEG, 12), tipo: 'simulado', minutos: 240, aula: '', fixo: true, titulo: 'Simulado geral' });
const plano = P.planoDosItensLidos({ nome: 'Teste', itens: lidos }, SEG);
const achar = (p, t) => p.itens.find((i) => i.titulo === t);

{
  if (plano && plano.itens.length === 13 && plano.capacidade[SEG] === 60 && plano.capacidade[mais(SEG, 12)] === 300) ok('o plano importado guarda a capacidade de cada dia (o tempo que o próprio plano dava)');
  else falha('importação: ' + JSON.stringify(plano && plano.capacidade));
  const r = P.reajustarPlano(plano, {}, SEG);
  if (!r.mudou && r.resumo.diasDeAtraso === 0 && r.resumo.hoje.length === 1) ok('plano em dia: nada muda, e o resumo diz que está no prazo');
  else falha('em dia: ' + JSON.stringify(r.resumo));
}

/* Não fez a aula de segunda; hoje é terça. */
{
  const ter = mais(SEG, 1);
  const r = P.reajustarPlano(plano, {}, ter);
  const a1 = achar(r.plano, 'Aula 1'), a2 = achar(r.plano, 'Aula 2'), a3 = achar(r.plano, 'Aula 3');
  if (r.mudou && a1.data === ter && a2.data === mais(SEG, 2) && a3.data === mais(SEG, 3)) ok('não fez: a aula de segunda vai para hoje e empurra as seguintes, na ordem');
  else falha('atraso: ' + JSON.stringify([a1.data, a2.data, a3.data]));
  const domingo = mais(SEG, 6);
  if (!r.plano.itens.some((i) => i.data === domingo)) ok('o domingo, que era descanso no plano, continua livre');
  else falha('caiu item no domingo');
  if (achar(r.plano, 'Simulado geral').data === mais(SEG, 12)) ok('o simulado (item fixo) não sai da data');
  else falha('fixo mudou: ' + achar(r.plano, 'Simulado geral').data);
  if (r.resumo.diasDeAtraso > 0 && r.plano.historico.some((h) => /remarcad/.test(h.texto))) ok('o resumo diz quantos dias o plano atrasou, e o histórico registra o reajuste');
  else falha('resumo do atraso: ' + JSON.stringify(r.resumo) + JSON.stringify(r.plano.historico));
  const de2 = P.reajustarPlano(r.plano, {}, ter);
  if (!de2.mudou) ok('reajustar de novo, sem nada novo, não muda nada (dá o mesmo resultado nos dois aparelhos)');
  else falha('reajuste não é estável');

  /* E adiantou a Aula 5 ontem à noite: o espaço dela absorve o atraso. */
  const adiantou = P.atualizarItemPlano(plano, achar(plano, 'Aula 5').id, 'feito', { minutos: 60 }, SEG);
  const r2 = P.reajustarPlano(adiantou, {}, ter);
  if (achar(r2.plano, 'Aula 4').data === mais(SEG, 4) && achar(r2.plano, 'Aula 6').data === mais(SEG, 5)) ok('fez a mais (adiantou a Aula 5): o dia dela fica livre e o atraso some ali');
  else falha('adiantou: ' + JSON.stringify(r2.plano.itens.map((i) => [i.titulo, i.data])));
}

/* Gastou o dobro do tempo em três aulas: o ritmo entra na conta. */
{
  let p = plano;
  for (const t of ['Aula 1', 'Aula 2', 'Aula 3']) p = P.atualizarItemPlano(p, achar(p, t).id, 'feito', { minutos: 120 }, mais(SEG, 2));
  const r = P.reajustarPlano(p, {}, mais(SEG, 3));
  if (r.resumo.ritmo === 1.8 && r.resumo.diasDeAtraso > 0) ok('gastou mais tempo que o previsto: o ritmo (limitado a 180%) estica o plano');
  else falha('ritmo: ' + JSON.stringify(r.resumo));
  const um = P.atualizarItemPlano(plano, achar(plano, 'Aula 1').id, 'feito', { minutos: 300 }, SEG);
  if (P.reajustarPlano(um, {}, mais(SEG, 1)).resumo.ritmo === 1) ok('um dia ruim só não muda o ritmo (precisa de três itens com tempo)');
  else falha('ritmo com um item');
}

/* Folga diária absorve o atraso. */
{
  const comFolga = { ...plano, folga: 60 };
  const r = P.reajustarPlano(comFolga, {}, mais(SEG, 1));
  if (achar(r.plano, 'Aula 2').data === mais(SEG, 1) && r.resumo.diasDeAtraso === 0) ok('com folga de 60 min por dia, a aula atrasada cabe hoje junto da de hoje');
  else falha('folga: ' + JSON.stringify(r.plano.itens.slice(0, 4).map((i) => [i.titulo, i.data])));
}

/* Feito em parte: o que falta volta com o tempo que falta. */
{
  const p = P.atualizarItemPlano(plano, achar(plano, 'Aula 1').id, 'parcial', { restante: 20 }, SEG);
  const i = achar(p, 'Aula 1');
  if (i.situacao === 'parcial' && i.restante === 20) ok('feito em parte guarda quanto falta');
  else falha('parcial: ' + JSON.stringify(i));
  const r = P.reajustarPlano(p, {}, mais(SEG, 1));
  if (achar(r.plano, 'Aula 2').data === mais(SEG, 1) && achar(r.plano, 'Aula 1').data === mais(SEG, 1)) ok('os 20 minutos que faltam cabem hoje sem empurrar a aula de hoje');
  else falha('parcial reajuste: ' + JSON.stringify(r.plano.itens.slice(0, 3).map((x) => [x.titulo, x.data])));
}

/* O resto do site dá o item por feito. */
{
  const marks = { 'cardio-ic': { aula: true, date: SEG } };
  const sessions = [{ id: 's1', date: SEG, subjectId: 'cardio-ic', kind: 'Aula', minutes: 75 }];
  const r = P.reajustarPlano(plano, { marks, sessions }, mais(SEG, 1));
  const a1 = achar(r.plano, 'Aula 1');
  if (a1.situacao === 'feito' && a1.auto && a1.gastos === 75 && a1.feitoEm === SEG) ok('aula marcada no cronograma dá o item por feito, com o tempo das sessões dela');
  else falha('auto: ' + JSON.stringify(a1));
  const r2 = P.reajustarPlano(r.plano, { marks: {}, sessions }, mais(SEG, 1));
  if (achar(r2.plano, 'Aula 1').situacao === 'pendente') ok('desmarcou a aula: o item volta a pendente');
  else falha('desmarcar');
  const manual = P.atualizarItemPlano(plano, achar(plano, 'Aula 1').id, 'feito', { minutos: 50 }, SEG);
  const r3 = P.reajustarPlano(manual, { marks: {}, sessions: [] }, mais(SEG, 1));
  if (achar(r3.plano, 'Aula 1').situacao === 'feito') ok('o que a pessoa marcou à mão o site não desfaz');
  else falha('manual desfeito');
}
{
  const q = P.planoDosItensLidos({ itens: [
    { data: SEG, tipo: 'questoes', minutos: 60, aula: 'nefro-sodio', titulo: '40 questões de sódio' },
    { data: mais(SEG, 1), tipo: 'questoes', minutos: 60, aula: 'nefro-sodio', titulo: '40 questões de sódio, parte 2' },
  ] }, SEG);
  const sessions = [{ id: 'q1', date: SEG, subjectId: 'nefro-sodio', kind: 'Questões', minutes: 70, questions: 40 }];
  const r = P.reajustarPlano(q, { marks: {}, sessions }, mais(SEG, 1));
  const [i1, i2] = r.plano.itens;
  if (i1.situacao === 'feito' && i1.gastos === 70 && i2.situacao === 'pendente') ok('uma sessão de questões dá por feito um item de questões só (não os dois)');
  else falha('questões: ' + JSON.stringify(r.plano.itens));
}

/* A mentora acha o item pelo jeito que a pessoa fala. */
{
  const p = P.planoDosItensLidos({ itens: [
    { data: SEG, tipo: 'aula', minutos: 90, titulo: 'Cardiologia: insuficiência cardíaca' },
    { data: SEG, tipo: 'questoes', minutos: 60, titulo: '30 questões de nefrologia' },
  ] }, SEG);
  const i = P.acharItemDoPlano(p, 'a aula de insuficiencia cardiaca', SEG);
  if (i && /insuficiência/.test(i.titulo)) ok('acha o item pelo que a pessoa disse, sem acento e com palavras a mais');
  else falha('achar item');
  if (!P.acharItemDoPlano(p, 'ortopedia', SEG)) ok('e não inventa: assunto que não está no plano não acha nada');
  else falha('achou item inexistente');
  const txt = P.resumoDoPlanoParaIA(p, SEG);
  if (/HOJE NO PLANO: .*insuficiência cardíaca/.test(txt) && /0 de 2 itens feitos/.test(txt)) ok('o resumo para a mentora diz o que o plano pede hoje e quanto já foi feito');
  else falha('resumo para IA: ' + txt);
}

/* O que fica guardado na conta é conferido. */
{
  if (P.limparPlanoArquivo({ itens: [{ titulo: 'x', dataOriginal: 'ontem' }] }) === null) ok('item sem data válida não entra');
  else falha('limpar data');
  const l = P.limparPlanoArquivo({ itens: [{ titulo: 'Aula', dataOriginal: SEG, tipo: 'hackear', minutos: 99999, situacao: 'qualquer' }] });
  if (l.itens[0].tipo === 'outro' && l.itens[0].minutos === 720 && l.itens[0].situacao === 'pendente') ok('tipo, tempo e situação estranhos viram padrão seguro');
  else falha('limpar campos: ' + JSON.stringify(l.itens[0]));
}

/* ── a leitura das linhas da IA (servidor) ─────────────────────────── */
{
  const quarta = '2026-11-11';
  if (R.dataDoQuando('S1-1', quarta) === '2026-11-09' && R.dataDoQuando('S1-3', quarta) === quarta && R.dataDoQuando('S2-1', quarta) === '2026-11-16') ok('S<semana>-<dia>: a semana 1 é a que contém o começo do plano');
  else falha('semana: ' + [R.dataDoQuando('S1-1', quarta), R.dataDoQuando('S1-3', quarta), R.dataDoQuando('S2-1', quarta)]);
  if (R.dataDoQuando('D1', quarta) === quarta && R.dataDoQuando('D15', quarta) === '2026-11-25') ok('D<número>: dia 1 é o começo');
  else falha('dia numerado');
  if (R.dataDoQuando('2026-02-30', quarta) === '' && R.dataDoQuando('S1-1', '') === '') ok('data inexistente ou semana sem começo não viram data');
  else falha('datas inválidas');
  const texto = `PLANO | Plano de novembro | 2026-11-09 |
S1-1 | aula | 90 | cardio-ic | 0 | Insuficiência cardíaca
S1-1 | questoes | 0 | | 0 | 30 questões de IC
S1-2 | hackear | 45 | inventado | 0 | Nefro — sódio
S1-3 | simulado | 240 | | 1 | Simulado 1
linha quebrada sem campos
S1-4 | aula | 60 | | 0 | Pneumonia`;
  const l = R.lerLinhasDoPlano(texto, '', ['cardio-ic']);
  if (l.nome === 'Plano de novembro' && l.itens.length === 5 && l.ignoradas === 1) ok('lê o cabeçalho e uma linha por item, e conta a linha que não serviu');
  else falha('linhas: ' + JSON.stringify(l));
  const [a, b, c, d] = l.itens;
  if (a.data === '2026-11-09' && a.aula === 'cardio-ic' && a.minutos === 90 && b.minutos === 0) ok('datas do começo do arquivo, aula do currículo e tempo do plano (0 quando o plano não diz)');
  else falha('campos: ' + JSON.stringify([a, b]));
  if (c.tipo === 'outro' && c.aula === '' && !/—/.test(c.titulo)) ok('tipo desconhecido vira "outro", aula inventada é descartada, e sem travessão no título');
  else falha('conferência: ' + JSON.stringify(c));
  if (d.fixo === true && d.tipo === 'simulado') ok('simulado marcado como fixo');
  else falha('fixo: ' + JSON.stringify(d));
}

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
