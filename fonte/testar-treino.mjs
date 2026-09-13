/* Testa as contas da aba Treino.
 *
 * São elas que dizem para a pessoa se ela está evoluindo ou empacada, e
 * quanto peso pôr na barra. Errar aqui não quebra tela nenhuma: só faz o
 * app mentir com confiança, que é pior.
 *
 * Roda contra _treino.mjs, a cópia automática das funções puras do
 * parte19.jsx, refeita pelo extrair_treino.py a cada build.
 *
 *   node testar-treino.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const {
  um1RM, melhorSerie, progressaoDoExercicio, exerciciosRegistrados,
  volumePorGrupo, gruposEsquecidos, acharPlatos, anilhasPara,
  aquecimentoPara, ultimaCarga, BARRA_PADRAO, GRUPOS_MUSCULO,
} = await import('./_treino.mjs');

const serie = (exNome, grupo, peso, reps) => ({ id: Math.random().toString(36).slice(2), exNome, grupo, peso, reps });
const sessao = (data, series) => ({ id: data, data, series });

/* ── 1RM estimado ────────────────────────────────────────────────────── */
{
  /* Epley: 100 × (1 + 1/30) não é 100, mas a diferença some no
     arredondamento de uma casa — o que importa é a ordem entre séries. */
  if (um1RM(100, 1) === 103.3) ok('1RM de 100 kg × 1 sai pela fórmula, sem arredondar para 100');
  else falha('1RM de 100 kg × 1 deu ' + um1RM(100, 1));

  if (um1RM(90, 8) > um1RM(100, 1)) ok('90 kg × 8 vale mais que 100 kg × 1, como na vida real');
  else falha('a fórmula disse que 100 kg × 1 é melhor que 90 kg × 8');

  if (um1RM(80, 20) === null) ok('série muito longa não vira 1RM inventado');
  else falha('aceitou estimar 1RM de uma série de 20 repetições');

  for (const [p, r] of [[0, 5], [-10, 5], [100, 0], ['', 5], [100, null]]) {
    if (um1RM(p, r) !== null) { falha(`aceitou peso ${p} e reps ${r}`); break; }
  }
  ok('peso ou repetição sem sentido devolve nada, em vez de NaN');
}

/* ── melhor série do dia ─────────────────────────────────────────────── */
{
  const m = melhorSerie([serie('Supino', 'Peito', 60, 12), serie('Supino', 'Peito', 90, 8), serie('Supino', 'Peito', 100, 1)]);
  if (m && m.peso === 90) ok('a melhor série do dia é a de maior 1RM, não a mais pesada');
  else falha('a melhor série do dia saiu ' + JSON.stringify(m));

  if (melhorSerie([]) === null) ok('dia sem série nenhuma não inventa melhor série');
  else falha('dia vazio devolveu uma série');
}

/* ── progressão e lista de exercícios ────────────────────────────────── */
{
  const sessoes = [
    sessao('2026-01-05', [serie('Supino reto', 'Peito', 60, 10), serie('Remada', 'Costas', 50, 10)]),
    sessao('2026-01-12', [serie('supino reto', 'Peito', 65, 10)]),
    sessao('2026-01-19', [serie('Supino reto', 'Peito', 70, 10)]),
  ];
  const linha = progressaoDoExercicio(sessoes, 'Supino reto');
  if (linha.length === 3 && linha[0].data === '2026-01-05' && linha[2].peso === 70) {
    ok('a progressão sai em ordem de data e junta o mesmo exercício escrito em maiúscula e minúscula');
  } else falha('a progressão saiu ' + JSON.stringify(linha));

  const nomes = exerciciosRegistrados(sessoes);
  if (nomes.length === 2 && nomes[0] === 'Supino reto') {
    ok('a lista de exercícios não repete e começa pelo mais recente');
  } else falha('a lista de exercícios saiu ' + JSON.stringify(nomes));

  const u = ultimaCarga(sessoes, 'Supino reto');
  if (u && u.peso === 70) ok('a última carga é a do dia mais recente');
  else falha('a última carga saiu ' + JSON.stringify(u));

  if (ultimaCarga(sessoes, 'Agachamento') === null) ok('exercício nunca feito não tem última carga');
  else falha('inventou última carga para exercício nunca feito');
}

/* ── volume por grupo ────────────────────────────────────────────────── */
{
  const sessoes = [
    sessao('2026-02-02', [serie('Supino', 'Peito', 60, 10), serie('Supino', 'Peito', 60, 10)]),
    sessao('2026-02-04', [serie('Agachamento', 'Perna', 100, 5)]),
    sessao('2026-01-01', [serie('Rosca', 'Bíceps', 20, 10)]),
  ];
  const v = volumePorGrupo(sessoes, '2026-02-01', '2026-02-07');
  if (v.length === 2) ok('o volume só conta o que caiu dentro do período');
  else falha('o volume pegou ' + v.length + ' grupos em vez de 2');

  const peito = v.find((x) => x.grupo === 'Peito');
  if (peito && peito.kg === 1200 && peito.series === 2) ok('o volume do peito é séries × reps × peso');
  else falha('o volume do peito saiu ' + JSON.stringify(peito));

  if (v[0].grupo === 'Peito') ok('o grupo de maior volume vem primeiro');
  else falha('a ordem do volume saiu errada: ' + v.map((x) => x.grupo).join(', '));

  /* Peso do corpo: série feita, volume zero. Some da conta de kg, mas não
     pode sumir da contagem de séries — senão flexão viraria "não treinei". */
  const semPeso = volumePorGrupo([sessao('2026-02-03', [serie('Flexão', 'Peito', 0, 15)])], null, null);
  if (semPeso[0] && semPeso[0].series === 1 && semPeso[0].kg === 0) {
    ok('série com peso do corpo conta como série feita, com volume zero');
  } else falha('série sem peso saiu ' + JSON.stringify(semPeso));

  const semGrupo = volumePorGrupo([sessao('2026-02-03', [serie('Coisa', '', 10, 10)])], null, null);
  if (semGrupo[0] && semGrupo[0].grupo === 'Sem grupo') ok('exercício sem grupo não some da conta');
  else falha('exercício sem grupo sumiu do volume');
}

/* ── grupos esquecidos ───────────────────────────────────────────────── */
{
  const plano = { dias: [{ exercicios: [{ grupo: 'Peito' }, { grupo: 'Perna' }, { grupo: '' }] }] };
  const faltando = gruposEsquecidos(plano, [{ grupo: 'Peito', kg: 100, series: 3 }]);
  if (faltando.length === 1 && faltando[0] === 'Perna') ok('o grupo do plano que não treinou na semana é apontado');
  else falha('os grupos esquecidos saíram ' + JSON.stringify(faltando));

  if (gruposEsquecidos(null, []).length === 0) ok('sem plano nenhum, ninguém é acusado de esquecer grupo');
  else falha('sem plano, apontou grupo esquecido');
}

/* ── platô ───────────────────────────────────────────────────────────── */
{
  const hoje = '2026-03-01';
  /* Subiu até 15/01 e desde então não passou disso. */
  const empacado = [
    sessao('2026-01-05', [serie('Supino', 'Peito', 60, 10)]),
    sessao('2026-01-15', [serie('Supino', 'Peito', 70, 10)]),
    sessao('2026-02-15', [serie('Supino', 'Peito', 70, 10)]),
    sessao('2026-02-25', [serie('Supino', 'Peito', 65, 10)]),
  ];
  const p = acharPlatos(empacado, hoje);
  if (p.length === 1 && p[0].nome === 'Supino') ok('exercício parado há três semanas é apontado como platô');
  else falha('o platô saiu ' + JSON.stringify(p));

  const subindo = [
    sessao('2026-01-05', [serie('Supino', 'Peito', 60, 10)]),
    sessao('2026-01-15', [serie('Supino', 'Peito', 70, 10)]),
    sessao('2026-02-25', [serie('Supino', 'Peito', 80, 10)]),
  ];
  if (acharPlatos(subindo, hoje).length === 0) ok('quem está subindo carga não é chamado de empacado');
  else falha('acusou platô em exercício que subiu carga');

  /* Duas semanas de histórico não dizem nada sobre platô: é gente que
     acabou de começar, e avisar isso seria desanimar por nada. */
  const comecando = [
    sessao('2026-02-20', [serie('Supino', 'Peito', 60, 10)]),
    sessao('2026-02-23', [serie('Supino', 'Peito', 60, 10)]),
    sessao('2026-02-26', [serie('Supino', 'Peito', 60, 10)]),
  ];
  if (acharPlatos(comecando, hoje).length === 0) ok('quem começou agora não recebe aviso de platô');
  else falha('acusou platô em quem tem duas semanas de treino');
}

/* ── anilhas ─────────────────────────────────────────────────────────── */
{
  const r = anilhasPara(100);
  if (r.possivel && r.real === 100 && r.porLado.join('+') === '20+20') {
    ok('100 kg = barra de 20 mais 20+20 de cada lado');
  } else falha('a montagem de 100 kg saiu ' + JSON.stringify(r));

  const so = anilhasPara(BARRA_PADRAO);
  if (so.possivel && so.porLado.length === 0) ok('a barra sozinha é montagem válida, sem anilha nenhuma');
  else falha('a barra sozinha saiu ' + JSON.stringify(so));

  /* 63 kg não fecha com as anilhas comuns. O certo é dizer qual peso dá
     para montar, e não devolver 63 como se desse. */
  const quebrado = anilhasPara(63);
  if (!quebrado.possivel && quebrado.real < 63) ok('peso que não fecha avisa, e diz o que dá para montar');
  else falha('63 kg saiu como se fechasse: ' + JSON.stringify(quebrado));

  const leve = anilhasPara(10);
  if (!leve.possivel) ok('peso abaixo da barra não vira montagem impossível de anilha negativa');
  else falha('aceitou montar menos que o peso da barra');
}

/* ── aquecimento ─────────────────────────────────────────────────────── */
{
  const a = aquecimentoPara(100);
  if (a.length === 3 && a[0].peso === 50 && a[2].peso === 85) ok('o aquecimento sobe em 50, 70 e 85 por cento');
  else falha('o aquecimento de 100 kg saiu ' + JSON.stringify(a));

  if (a.every((x, i) => i === 0 || x.peso > a[i - 1].peso)) ok('o aquecimento nunca repete nem desce de peso');
  else falha('o aquecimento repetiu ou desceu de peso');

  const perto = aquecimentoPara(25);
  if (perto.every((x) => x.peso >= BARRA_PADRAO)) ok('nenhuma série de aquecimento pesa menos que a barra');
  else falha('o aquecimento pediu menos que o peso da barra: ' + JSON.stringify(perto));

  if (aquecimentoPara(0).length === 0) ok('sem carga informada, não há aquecimento a sugerir');
  else falha('inventou aquecimento sem carga');
}

/* ── os grupos são os mesmos que o servidor aceita ───────────────────── */
{
  const doServidor = ['Peito', 'Costas', 'Ombro', 'Bíceps', 'Tríceps', 'Perna',
    'Posterior', 'Glúteo', 'Panturrilha', 'Abdômen', 'Cardio'];
  if (GRUPOS_MUSCULO.join(',') === doServidor.join(',')) {
    ok('os grupos musculares da tela são exatamente os que o servidor aceita');
  } else {
    falha('os grupos da tela saíram do combinado com o servidor: ' + GRUPOS_MUSCULO.join(', '));
  }
}

console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
