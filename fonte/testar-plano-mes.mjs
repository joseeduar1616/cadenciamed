/* Testa a lógica do plano do mês: a leitura da planilha e as contas.
 *
 * A planilha é montada aqui mesmo, com números inventados, no mesmo
 * formato da que o dono usa (Início, Treino, Alimentação, Controle
 * Diário). Nada de dado real de ninguém no repositório.
 *
 * O que mais importa: a planilha do mês que vem vai ter uma linha a mais
 * aqui e ali. A leitura é por rótulo, e o teste 3 cobra exatamente isso.
 *
 * Roda contra _plano_mes.mjs, a cópia que o extrair_plano_mes.py faz do
 * parte25.jsx a cada build.
 *
 *   node testar-plano-mes.mjs
 */
import { unzipSync } from 'fflate';
import { xlsx, FOLHAS } from './planilha-de-teste.mjs';

const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const P = await import('./_plano_mes.mjs');

/* ── 1. o .xlsx por dentro ───────────────────────────────────────────── */
{
  const f = P.lerXlsx(xlsx(FOLHAS), unzipSync);
  if (igual(Object.keys(f), ['Início', 'Treino', 'Alimentação', 'Controle Diário'])) ok('xlsx: as quatro folhas, com nome acentuado');
  else falha('xlsx: folhas ' + JSON.stringify(Object.keys(f)));
  if (f['Início'][4].C === 1.8 && f['Início'][4].E === 'Calorias') ok('xlsx: número e texto compartilhado nas células certas');
  else falha('xlsx: célula errada ' + JSON.stringify(f['Início'][4]));
  if (/sem pressa & sem rebote/.test(f['Início'][12].A)) ok('xlsx: &amp; do XML vira & de volta');
  else falha('xlsx: entidade não desfeita: ' + f['Início'][12].A);
  if (f['Início'][7].C === undefined) ok('xlsx: fórmula sem valor guardado fica vazia, sem inventar número');
  else falha('xlsx: fórmula virou ' + f['Início'][7].C);
  const g = P.lerXlsx(xlsx(FOLHAS, { inline: true }), unzipSync);
  if (g['Treino'][3].B === 'Treino A') ok('xlsx: texto inline (sem tabela compartilhada) também é lido');
  else falha('xlsx: inline ' + JSON.stringify(g['Treino'][3]));
  let recusou = false;
  try { P.lerXlsx(new Uint8Array([1, 2, 3]), unzipSync); } catch (e) { recusou = /planilha/.test(e.message); }
  if (recusou) ok('xlsx: arquivo que não é planilha vira erro explicado');
  else falha('xlsx: lixo passou calado');
}

/* ── 2. a planilha vira plano ────────────────────────────────────────── */
const lido = P.planoDaPlanilha(P.lerXlsx(xlsx(FOLHAS), unzipSync));
{
  const m = lido.meta;
  if (m.titulo === 'Plano Novembro · Modo firme') ok('metas: o título sem o emoji');
  else falha('metas: título ' + m.titulo);
  if (m.inicio === '2025-11-01' && m.fim === '2025-11-30') ok('metas: o período sai da linha "01/11 a 30/11/2025"');
  else falha('metas: período ' + m.inicio + ' ' + m.fim);
  if (m.altura === 1.8 && m.pesoInicial === 90 && m.cinturaInicial === 95 && m.perdaAlvo === 4 && m.cinturaAlvo === 5) ok('metas: altura, peso, cintura e alvos');
  else falha('metas: dados ' + JSON.stringify(m));
  if (m.kcalMin === 1900 && m.kcalMax === 2000) ok('metas: "1.900 a 2.000 kcal" vira 1900 e 2000, não 1,9');
  else falha('metas: calorias ' + m.kcalMin + ' ' + m.kcalMax);
  if (m.protMin === 150 && m.passosMin === 10000 && m.passosMax === 12000 && m.sonoMin === 8 && !m.sonoMax && m.aguaMin === 2 && m.aguaMax === 3) ok('metas: proteína, passos, sono ("ou mais") e água');
  else falha('metas: diárias ' + JSON.stringify(m));
  if (igual(m.regras, ['Proteína em todas as refeições.', 'Nada de ficar abaixo de 1.700 kcal.'])) ok('metas: as regras de ouro, sem o marcador');
  else falha('metas: regras ' + JSON.stringify(m.regras));
  if (m.kcalPiso === 1700) ok('metas: o piso de calorias sai da regra que fala dele');
  else falha('metas: piso ' + m.kcalPiso);
  if (/Modo firme/.test(m.nota || '')) ok('metas: a nota do modo do mês');
  else falha('metas: nota ' + m.nota);

  if (lido.semana.length === 7 && lido.semana[2].atividade === 'Natação' && lido.semana[6].atividade === 'Descanso') ok('semana: os sete dias, segunda primeiro');
  else falha('semana: ' + JSON.stringify(lido.semana));

  const pl = lido.plano;
  if (pl && pl.nome === 'Treino · Novembro 2025' && pl.dias.length === 2 && pl.dias[0].nome === 'Treino A · Empurrar') ok('treino: as duas fichas com o nome certo');
  else falha('treino: ' + JSON.stringify(pl && pl.dias.map((d) => d.nome)));
  const [sup, tri] = pl.dias[0].exercicios;
  const [aga, sti] = pl.dias[1].exercicios;
  if (sup.series === 4 && sup.reps === '8 a 10' && sup.descanso === 120 && sup.observacao === 'Escápula presa') ok('treino: série, repetição, "2 min" de descanso e a dica');
  else falha('treino: supino ' + JSON.stringify(sup));
  if (aga.descanso === 90 && sti.descanso === 90) ok('treino: "1min30" e "90 s" viram 90 segundos');
  else falha('treino: descansos ' + aga.descanso + ' ' + sti.descanso);
  if (sup.grupo === 'Peito' && tri.grupo === 'Tríceps' && aga.grupo === 'Perna' && sti.grupo === 'Posterior') ok('treino: o grupo muscular sai do nome (tríceps na polia não vira costas)');
  else falha('treino: grupos ' + [sup, tri, aga, sti].map((e) => e.grupo).join(','));
  if (pl.regras.length === 2) ok('treino: as regras da ficha');
  else falha('treino: regras ' + JSON.stringify(pl.regras));

  const c = lido.cardapio;
  if (c && c.refeicoes.length === 2 && c.refeicoes[0].nome === 'Café da manhã' && c.refeicoes[1].horario === '12h30') ok('cardápio: as refeições com horário');
  else falha('cardápio: ' + JSON.stringify(c && c.refeicoes.map((r) => r.nome)));
  const itens = c.refeicoes.flatMap((r) => r.itens.map((i) => i.alimento));
  if (igual(itens, ['Ovos', 'Pão', 'Frango', 'Arroz'])) ok('cardápio: subtotal, total e "meta de calorias" não viram alimento');
  else falha('cardápio: itens ' + JSON.stringify(itens));
  if (c.refeicoes[0].itens[1].proteina === 3.5) ok('cardápio: proteína com casa decimal');
  else falha('cardápio: proteína ' + c.refeicoes[0].itens[1].proteina);
  if (/calibrar/.test(c.nota) && c.avisos.length === 1 && /Semana 1/.test(c.avisos[0])) ok('cardápio: a nota do topo e o aviso da semana 1');
  else falha('cardápio: nota/avisos ' + JSON.stringify([c.nota, c.avisos]));
  if (c.substituicoes.length === 2 && igual(c.substituicoes[0].opcoes, ['130 g de patinho', '2 latas de atum']) && c.substituicoes[1].referencia === 'no lugar de 100 g de arroz') ok('cardápio: as substituições por grupo');
  else falha('cardápio: substituições ' + JSON.stringify(c.substituicoes));
  if (c.secoes.length === 1 && c.secoes[0].titulo === 'Na rua' && c.secoes[0].itens.length === 2) ok('cardápio: a seção de dicas com o título sem emoji');
  else falha('cardápio: seções ' + JSON.stringify(c.secoes));

  const d1 = lido.diario['2025-11-01'];
  if (d1 && d1.treino === 'sim' && d1.passos === 11200 && d1.sono === 7.5 && d1.semAlcool === true && d1.proteinaOk === true && d1.obs === 'bom dia') ok('controle: o dia preenchido entra inteiro');
  else falha('controle: dia 1 ' + JSON.stringify(d1));
  if (!lido.diario['2025-11-02']) ok('controle: dia em branco não vira anotação vazia');
  else falha('controle: dia vazio virou ' + JSON.stringify(lido.diario['2025-11-02']));
  if (lido.diario['2025-11-03'].treino === 'nao' && lido.diario['2025-11-03'].proteinaOk === false) ok('controle: "Não" vira não, e não sumiço');
  else falha('controle: dia 3 ' + JSON.stringify(lido.diario['2025-11-03']));
  if (igual(lido.medidas, [{ data: '2025-11-01', peso: 89.6 }, { data: '2025-11-03', peso: 89.1, cintura: 94 }])) ok('controle: peso e cintura vão para as medidas do corpo');
  else falha('controle: medidas ' + JSON.stringify(lido.medidas));
  if (!Object.keys(lido.diario).some((k) => k > '2025-11-03')) ok('controle: o resumo semanal da folha não é lido como dia');
  else falha('controle: leu o resumo como dia');
}

/* ── 3. a planilha do mês que vem, com linhas a mais ─────────────────── */
{
  const mexida = JSON.parse(JSON.stringify(FOLHAS));
  mexida['Início'].splice(2, 0, [], ['uma linha nova qualquer'], []);
  mexida['Treino'].splice(1, 0, ['Musculação 4x por semana.']);
  mexida['Alimentação'].splice(2, 0, []);
  const r = P.planoDaPlanilha(P.lerXlsx(xlsx(mexida), unzipSync));
  if (r.meta.pesoInicial === 90 && r.meta.kcalMin === 1900 && r.plano.dias.length === 2 && r.cardapio.refeicoes.length === 2) ok('linhas a mais no meio não quebram a leitura: ela é por rótulo');
  else falha('linhas a mais: ' + JSON.stringify(r.achados));
  const vazia = P.planoDaPlanilha(P.lerXlsx(xlsx({ Plan1: [['nada aqui'], [1, 2, 3]] }), unzipSync));
  if (vazia.achados.length === 0 && !vazia.plano && !vazia.cardapio) ok('planilha que não é de plano: nada achado, nada inventado');
  else falha('planilha qualquer: ' + JSON.stringify(vazia.achados));
}

/* ── 4. aplicar sem perder o que já existe ───────────────────────────── */
{
  let n = 0;
  const novoId = () => 'n' + (++n);
  const t1 = P.aplicarPlanilha({ planos: [], medidas: [], diario: {} }, lido, novoId);
  const plano = t1.planos[0];
  if (t1.planoAtivo === plano.id && t1.semana[0].diaPlanoId === plano.dias[0].id && t1.semana[1].diaPlanoId === plano.dias[1].id && t1.semana[2].diaPlanoId === '') ok('aplicar: "Treino A" da semana aponta para a ficha "Treino A · Empurrar"');
  else falha('aplicar: semana ' + JSON.stringify(t1.semana));
  const supId = plano.dias[0].exercicios[0].id;
  const comHistorico = {
    ...t1,
    sessoes: [{ id: 's', data: '2025-11-03', series: [{ exId: supId, exNome: 'Supino inclinado', peso: 60, reps: 8 }] }],
    diario: { ...t1.diario, '2025-11-01': { ...t1.diario['2025-11-01'], passos: 9999 } },
    medidas: t1.medidas.map((m) => (m.data === '2025-11-01' ? { ...m, peso: 89.9 } : m)),
  };
  const t2 = P.aplicarPlanilha(comHistorico, lido, novoId);
  if (t2.planos.length === 1 && t2.planos[0].id === plano.id && t2.planos[0].dias[0].exercicios[0].id === supId) ok('aplicar de novo: mesmo plano, mesmos ids — as séries registradas continuam apontando para ele');
  else falha('aplicar de novo: duplicou ou trocou ids ' + JSON.stringify(t2.planos.map((p) => p.id)));
  if (t2.sessoes.length === 1) ok('aplicar de novo: os treinos registrados ficam');
  else falha('aplicar de novo: sumiram treinos');
  if (t2.diario['2025-11-01'].passos === 9999 && t2.medidas.find((m) => m.data === '2025-11-01').peso === 89.9) ok('aplicar de novo: o que foi anotado no app ganha da planilha');
  else falha('aplicar de novo: a planilha passou por cima do app');
  if (t2.medidas.length === 2) ok('aplicar de novo: medidas não duplicam');
  else falha('aplicar de novo: medidas ' + t2.medidas.length);
  const outro = P.aplicarPlanilha({ planos: [{ id: 'velho', nome: 'Meu treino', dias: [] }] }, lido, novoId);
  if (outro.planos.length === 2 && outro.planos.some((p) => p.id === 'velho')) ok('aplicar: plano com outro nome não é apagado');
  else falha('aplicar: apagou o plano antigo');
}

/* ── 4b. o plano que a IA leu de um PDF ─────────────────────────────── */
{
  const r = P.planoDoJson({
    meta: {
      titulo: 'Plano Dezembro', inicio: '2025-12-01', fim: '2025-12-31', pesoInicial: '88,5 kg', perdaAlvo: 3,
      kcalMin: '1.900', kcalMax: 2000, protMin: 150, altura: 9999, sonoMin: '7 h',
      regras: ['• Nada de ficar abaixo de 1.600 kcal.', '', 42],
    },
    semana: [{ atividade: 'Treino A', descricao: 'Superior' }, { atividade: '' }, null, { atividade: 'Treino B' }],
    plano: {
      nome: 'Treino · Dezembro',
      dias: [
        { nome: 'Treino A', exercicios: [
          { nome: 'Supino reto', grupo: 'Peitoral', series: 40, reps: '8 a 10', descanso: '2 min', observacao: 'devagar' },
          { nome: '', series: 3 },
          { nome: 'Rosca martelo', grupo: 'Bíceps', series: '3', reps: 12, descanso: 3600 },
        ] },
        { nome: 'Vazio', exercicios: [] },
      ],
    },
    cardapio: {
      refeicoes: [
        { nome: 'Almoço', horario: '12h', itens: [{ alimento: 'Frango', quantidade: '150 g', kcal: '240', proteina: 45 }, { alimento: '', kcal: 10 }] },
        { nome: 'Fantasma', itens: [] },
      ],
      substituicoes: [{ grupo: 'Proteínas', referencia: 'no lugar do frango', opcoes: ['• atum', ''] }, { grupo: 'Vazio', opcoes: [] }],
      secoes: [{ titulo: 'Na rua', itens: ['• Peça grelhado.'] }],
      avisos: ['Semana 1 com menos arroz.'],
    },
    diario: { '2025-12-01': { treino: 'sim' } },
  });
  const m = r.meta;
  if (m.pesoInicial === 88.5 && m.kcalMin === 1900 && m.kcalMax === 2000 && m.sonoMin === 7) ok('PDF: número escrito como texto ("88,5 kg", "1.900") vira número');
  else falha('PDF: números ' + JSON.stringify(m));
  if (m.altura === undefined) ok('PDF: altura de 9999 é descartada, não vira meta');
  else falha('PDF: aceitou altura ' + m.altura);
  if (JSON.stringify(m.regras) === JSON.stringify(['Nada de ficar abaixo de 1.600 kcal.', '42']) && m.kcalPiso === 1600) ok('PDF: regras sem marcador, vazias fora, e o piso de calorias tirado delas');
  else falha('PDF: regras ' + JSON.stringify(m.regras) + ' piso ' + m.kcalPiso);
  if (r.semana[0].atividade === 'Treino A' && r.semana[1] === undefined && r.semana[3].atividade === 'Treino B' && r.semana.length === 7) ok('PDF: a semana com os dias vazios em branco');
  else falha('PDF: semana ' + JSON.stringify(r.semana));
  const [sup, rosca] = r.plano.dias[0].exercicios;
  if (r.plano.dias.length === 1 && r.plano.dias[0].exercicios.length === 2) ok('PDF: ficha vazia e exercício sem nome ficam de fora');
  else falha('PDF: fichas ' + JSON.stringify(r.plano.dias));
  if (sup.series === 10 && sup.descanso === 120 && sup.grupo === 'Peito' && rosca.series === 3 && rosca.descanso === 600 && rosca.reps === '12' && rosca.grupo === 'Bíceps') ok('PDF: 40 séries viram 10, "2 min" vira 120 s, uma hora vira 10 min, grupo inventado sai do nome');
  else falha('PDF: exercícios ' + JSON.stringify([sup, rosca]));
  const c = r.cardapio;
  if (c.refeicoes.length === 1 && c.refeicoes[0].itens.length === 1 && c.refeicoes[0].itens[0].kcal === 240) ok('PDF: refeição sem item e item sem alimento ficam de fora; "240" vira 240');
  else falha('PDF: cardápio ' + JSON.stringify(c.refeicoes));
  if (c.substituicoes.length === 1 && JSON.stringify(c.substituicoes[0].opcoes) === '["atum"]' && c.secoes[0].itens[0] === 'Peça grelhado.' && c.avisos.length === 1) ok('PDF: substituições, seções e avisos limpos');
  else falha('PDF: listas ' + JSON.stringify(c));
  if (JSON.stringify(r.diario) === '{}' && r.medidas.length === 0) ok('PDF: a IA não escreve no controle diário nem nas medidas');
  else falha('PDF: diário veio da IA ' + JSON.stringify(r.diario));
  if (r.achados.some((x) => /1 fichas de treino/.test(x)) && r.achados.some((x) => /período de 01\/12\/2025/.test(x))) ok('PDF: o resumo do que foi achado, igual ao da planilha');
  else falha('PDF: achados ' + JSON.stringify(r.achados));
  const vazio = P.planoDoJson({ meta: { inicio: '31/12/2025', fim: 'amanhã' } });
  if (!vazio.meta.inicio && vazio.achados.length === 0 && !vazio.plano && !vazio.cardapio) ok('PDF: data fora do formato e nada mais: nada é aplicado');
  else falha('PDF: vazio ' + JSON.stringify(vazio));
  const zoado = P.planoDoJson('não é objeto');
  if (zoado.achados.length === 0) ok('PDF: resposta que não é objeto não quebra');
  else falha('PDF: lixo virou plano');
}

/* ── 4c. que arquivo é este ──────────────────────────────────────────── */
{
  const b = (s) => Array.from(s, (ch) => ch.charCodeAt(0));
  if (P.tipoDoArquivo(b('PK\x03\x04'), 'plano') === 'xlsx' && P.tipoDoArquivo(b('%PDF-1.7'), 'plano.xlsx') === 'pdf') ok('arquivo: reconhecido pelo conteúdo, não pelo nome');
  else falha('arquivo: PK/PDF');
  if (P.tipoDoArquivo([0xd0, 0xcf, 0x11], 'a.xls') === 'xls' && P.tipoDoArquivo(b('ola'), 'plano.txt') === 'texto' && P.tipoDoArquivo(b('GIF89'), 'foto.gif') === '') ok('arquivo: Excel antigo, texto, e o resto recusado');
  else falha('arquivo: outros tipos');
}

/* ── 5. números em português ─────────────────────────────────────────── */
{
  if (igual(P.numerosDoTexto('1.95 m, 2.200 kcal, 7,5 h, 13.000 passos'), [1.95, 2200, 7.5, 13000])) ok('números: 1.95, 2.200, 7,5 e 13.000 lidos do jeito brasileiro');
  else falha('números: ' + JSON.stringify(P.numerosDoTexto('1.95 m, 2.200 kcal, 7,5 h, 13.000 passos')));
  if (igual(P.faixaDoTexto('3 a 4 litros'), { min: 3, max: 4 }) && igual(P.faixaDoTexto('2000'), { min: 2000, max: 2000 })) ok('faixa: "3 a 4" e número solto');
  else falha('faixa');
  if (P.descansoEmSegundos('45 s') === 45 && P.descansoEmSegundos('') === 90 && P.descansoEmSegundos(3600) === 600 && P.descansoEmSegundos('5 s') === 15) ok('descanso: vazio vira 90 s, e nada fora de 15 s a 10 min');
  else falha('descanso: limites');
  if (P.serialParaIso(45658) === '2025-01-01' && P.serialParaIso('abc') === '' && P.serialParaIso(12) === '') ok('data do Excel: 45658 é 01/01/2025, e lixo não vira data');
  else falha('data do Excel: ' + P.serialParaIso(45658));
}

/* ── 6. as contas do mês ─────────────────────────────────────────────── */
const meta = { inicio: '2026-10-01', fim: '2026-10-31', pesoInicial: 100, perdaAlvo: 6, cinturaInicial: 110, cinturaAlvo: 6, altura: 1.9, kcalMin: 2200, kcalMax: 2300, protMin: 190 };
{
  const s = P.semanasDoPlano(meta.inicio, meta.fim);
  if (s.length === 5 && igual(s[0], { n: 1, de: '2026-10-01', ate: '2026-10-04' }) && igual(s[4], { n: 5, de: '2026-10-26', ate: '2026-10-31' })) ok('semanas: a primeira vai até o domingo, a última para no dia 31');
  else falha('semanas: ' + JSON.stringify(s));
  if (P.semanasDoPlano('2026-10-31', '2026-10-01').length === 0) ok('semanas: fim antes do começo não trava');
  else falha('semanas: período invertido');

  const comidas = [
    { data: '2026-10-05', kcal: 800, proteina: 70, carbo: 60, gordura: 20 },
    { data: '2026-10-05', kcal: 1450, proteina: 125, carbo: 100, gordura: 40 },
    { data: '2026-10-06', kcal: 900, proteina: 50 },
  ];
  const t = P.totaisDoDia(comidas, '2026-10-05');
  if (t.kcal === 2250 && t.proteina === 195 && t.n === 2) ok('dia: soma só as refeições do dia');
  else falha('dia: ' + JSON.stringify(t));
  if (P.statusCalorias(2250, meta).tom === 'ok' && P.statusCalorias(900, meta).tom === 'baixo' && /1300/.test(P.statusCalorias(900, meta).texto) && P.statusCalorias(2600, meta).tom === 'alto') ok('calorias: dentro, abaixo (quanto falta) e acima');
  else falha('calorias: status');
  if (P.statusProteina(195, meta).tom === 'ok' && P.statusProteina(150, meta).texto === 'faltam 40 g') ok('proteína: batida, ou quanto falta');
  else falha('proteína: status');
  if (P.proteinaOkNoDia('2026-10-06', comidas, { '2026-10-06': { proteinaOk: true } }, meta) === false) ok('proteína: refeição anotada manda mais que o "sim" marcado');
  else falha('proteína: o sim venceu as refeições');
  if (P.proteinaOkNoDia('2026-10-07', comidas, { '2026-10-07': { proteinaOk: true } }, meta) === true) ok('proteína: sem refeição anotada, vale o sim do controle');
  else falha('proteína: ignorou o controle');

  const treino = {
    meta,
    semana: [{ atividade: 'Treino A' }, { atividade: 'Treino B' }, { atividade: 'Tênis' }, { atividade: 'Treino A' }, { atividade: 'Treino B' }, { atividade: 'Tênis' }, { atividade: 'Descanso' }],
    medidas: [
      { data: '2026-10-01', peso: 99.6 }, { data: '2026-10-03', peso: 99.0 },
      { data: '2026-10-05', peso: 98.4, cintura: 108 }, { data: '2026-10-08', peso: 98.2 },
      { data: '2026-10-20', peso: 97.3 },
    ],
    diario: { '2026-10-07': { treino: 'sim', passos: 12000 }, '2026-10-06': { passos: 14000 } },
    sessoes: [{ data: '2026-10-05', series: [] }, { data: '2026-10-06', series: [] }],
    comidas,
  };
  const r = P.resumoSemanal(treino);
  if (r[0].pesoMedio === 99.3 && r[0].variacao === -0.7) ok('resumo: semana 1 contra o peso inicial');
  else falha('resumo: semana 1 ' + JSON.stringify(r[0]));
  if (r[1].pesoMedio === 98.3 && r[1].variacao === -1 && r[1].cintura === 108) ok('resumo: semana 2 contra a semana 1');
  else falha('resumo: semana 2 ' + JSON.stringify(r[1]));
  if (r[1].treinos === 3 && r[1].treinosPrevistos === 4) ok('resumo: treino salvo e tênis marcado contam; o previsto sai da semana');
  else falha('resumo: treinos ' + r[1].treinos + '/' + r[1].treinosPrevistos);
  if (r[1].passosMedios === 13000 && r[1].kcalMedia === 1575 && r[1].diasProteina === 1) ok('resumo: passos médios, kcal média e dias de proteína');
  else falha('resumo: médias ' + JSON.stringify(r[1]));
  if (r[2].pesoMedio === null && r[2].variacao === null) ok('resumo: semana sem pesagem fica em branco, sem zero inventado');
  else falha('resumo: semana vazia ' + JSON.stringify(r[2]));
  if (r[3].variacao === -1) ok('resumo: depois de uma semana sem pesagem, compara com a última semana pesada');
  else falha('resumo: semana 4 depois da vazia ' + JSON.stringify(r[3]));

  const p = P.progressoDaMeta(meta, treino.medidas);
  if (p.peso === 97.3 && p.perdido === 2.7 && Math.abs(p.pct - 0.45) < 0.001 && p.pesoAlvo === 94) ok('meta: último peso, perdido e porcentagem');
  else falha('meta: ' + JSON.stringify(p));
  if (p.imc === 27 && p.rca === 0.57 && p.cinturaPerdida === 2) ok('meta: IMC, cintura/altura e cintura perdida');
  else falha('meta: imc/rca ' + JSON.stringify(p));
  if (P.progressoDaMeta(meta, [{ data: '2026-10-02', peso: 90 }]).pct === 1) ok('meta: passar do alvo trava em 100%');
  else falha('meta: passou de 100%');
}

/* ── 7. projeção ─────────────────────────────────────────────────────── */
{
  const hoje = '2026-10-15';
  const medidas = [];
  for (let i = 0; i < 14; i++) {
    /* -0,1 kg por dia com meio quilo de ruído alternado */
    const d = new Date(Date.UTC(2026, 9, 2 + i)).toISOString().slice(0, 10);
    medidas.push({ data: d, peso: 100 - 0.1 * i + (i % 2 ? 0.25 : -0.25) });
  }
  const pr = P.projecaoDePeso(meta, medidas, hoje);
  if (pr && Math.abs(pr.porSemana + 0.7) <= 0.15) ok('projeção: a reta atravessa o sobe e desce da água (~-0,7 kg/semana)');
  else falha('projeção: ' + JSON.stringify(pr));
  if (pr && pr.noFim < pr.pesoHoje && pr.dataAlvo > hoje) ok('projeção: peso no fim do plano e data do alvo');
  else falha('projeção: fim/alvo ' + JSON.stringify(pr));
  if (P.projecaoDePeso(meta, medidas.slice(0, 3), hoje) === null) ok('projeção: com menos de 4 pesagens, não chuta');
  else falha('projeção: chutou com 3 pesagens');
  const rapido = medidas.map((m, i) => ({ ...m, peso: 100 - 0.3 * i }));
  if (P.projecaoDePeso(meta, rapido, hoje).rapidoDemais) ok('projeção: 2 kg por semana acende o aviso de perda rápida demais');
  else falha('projeção: não avisou perda rápida');
  const caminho = P.caminhoIdeal(meta);
  if (caminho.length === 31 && caminho[0].peso === 100 && caminho[30].peso === 94) ok('caminho: reta do peso inicial ao alvo, dia a dia');
  else falha('caminho: ' + caminho.length);
}

/* ── 8. cargas, gasto, sequência e a resposta da IA ──────────────────── */
{
  const plano = { dias: [{ nome: 'Treino A', exercicios: [{ nome: 'Supino reto' }, { nome: 'Remada' }] }] };
  const sessoes = [
    { data: '2026-10-01', inicio: 1, series: [{ exNome: 'Supino reto', peso: 60, reps: 8 }, { exNome: 'supino reto', peso: 62.5, reps: 6 }] },
    { data: '2026-10-08', inicio: 1, series: [{ exNome: 'Supino reto', peso: 65, reps: 7 }] },
  ];
  const tab = P.tabelaDeCargas(plano, sessoes, P.semanasDoPlano(meta.inicio, meta.fim));
  if (igual(tab[0].porSemana[0], { peso: 62.5, reps: 6 }) && igual(tab[0].porSemana[1], { peso: 65, reps: 7 }) && tab[0].ganho === 2.5) ok('cargas: a última série de cada semana, e o ganho desde a primeira');
  else falha('cargas: ' + JSON.stringify(tab[0]));
  if (tab[1].ganho === null && tab[1].porSemana.every((x) => x === null)) ok('cargas: exercício nunca feito fica em branco');
  else falha('cargas: vazio ' + JSON.stringify(tab[1]));

  const g = P.gastoEstimado({ altura: 1.8, idade: 30, sexo: 'm' }, 90);
  if (g && g.tmb === 1880 && g.gasto === 2914) ok('gasto: Mifflin-St Jeor (90 kg, 1,80 m, 30 anos) = 1880 basal');
  else falha('gasto: ' + JSON.stringify(g));
  if (P.gastoEstimado({ altura: 1.8, idade: 30 }, 90) === null) ok('gasto: sem sexo informado, não estima');
  else falha('gasto: estimou sem sexo');

  const diario = { '2026-10-13': { semAlcool: true }, '2026-10-14': { semAlcool: true }, '2026-10-12': { semAlcool: false }, '2026-10-11': { semAlcool: true } };
  if (P.diasSeguidos(diario, '2026-10-15', 'semAlcool') === 2) ok('sequência: hoje sem marcar ainda não zera, e um "não" corta');
  else falha('sequência: ' + P.diasSeguidos(diario, '2026-10-15', 'semAlcool'));

  const a = P.limparAnalise({ itens: [{ nome: 'Arroz', kcal: 40000, proteina: -3 }, { kcal: 100 }, { nome: 'Feijão', kcal: '75', proteina: '5' }], confianca: 'total' });
  if (a.itens.length === 2 && a.itens[0].kcal === 3000 && a.itens[0].proteina === 0 && a.itens[1].kcal === 75 && a.confianca === 'media') ok('IA: kcal absurda travada, item sem nome fora, confiança inválida vira média');
  else falha('IA: ' + JSON.stringify(a));
  if (igual(P.somarItens([{ kcal: 100.4, proteina: 10.25 }, { kcal: 50, proteina: 5 }]), { kcal: 150, proteina: 15.3, carbo: 0, gordura: 0 })) ok('IA: soma dos itens arredondada');
  else falha('IA: soma ' + JSON.stringify(P.somarItens([{ kcal: 100.4, proteina: 10.25 }, { kcal: 50, proteina: 5 }])));

  let comidas = [];
  for (let i = 0; i < P.MAX_COMIDAS + 20; i++) comidas = P.guardarComida(comidas, { id: 'c' + i, data: '2026-10-01', em: i });
  if (comidas.length === P.MAX_COMIDAS && comidas[0].id === 'c' + (P.MAX_COMIDAS + 19)) ok('diário alimentar: teto respeitado, cortando as mais antigas');
  else falha('diário alimentar: ' + comidas.length);
}

console.log(passos.join('\n'));
if (erros.length) {
  console.log(`\n${erros.length} PROBLEMA(S):\n${erros.join('\n')}`);
  process.exit(1);
}
console.log('\nnenhum erro');
