/* Testa a regra do envio automático para o Google Agenda.
 *
 * É a parte que escreve e APAGA coisa na agenda de alguém sem ninguém ter
 * clicado em nada, então os dois erros que importam são:
 *
 *   1. mandar de novo o que já está lá igual (a cada tecla digitada);
 *   2. apagar evento de um grupo que a pessoa não pediu para mandar.
 *
 * Roda contra _agenda.mjs, a cópia automática de corpoDoEvento,
 * marcaDoEvento, marcasDaLista e diferencaDaAgenda (do parte3.jsx),
 * refeita pelo extrair_agenda.py a cada build.
 *
 *   node testar-agenda.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const {
  corpoDoEvento, marcaDoEvento, marcasDaLista, diferencaDaAgenda,
  AUTO_PADRAO, LIMITE_AUTO,
} = await import('./_agenda.mjs');

const bloco = (id, cat, rotulo) => ({
  cat, id,
  summary: rotulo,
  description: `${cat} · vindo do painel (Cadência)`,
  start: { dateTime: '2026-03-02T08:00:00', timeZone: 'America/Sao_Paulo' },
  end: { dateTime: '2026-03-02T12:00:00', timeZone: 'America/Sao_Paulo' },
});

/* ── o "cat" é etiqueta nossa, não campo do Google ───────────────────── */
{
  const ev = bloco('aaa', 'rotina', 'Plantão');
  const corpo = corpoDoEvento(ev);
  if ('cat' in corpo) falha('o corpo enviado ao Google ainda leva o campo "cat"');
  else ok('o corpo enviado ao Google não leva a etiqueta interna');
  if (corpo.summary === 'Plantão' && corpo.id === 'aaa' && corpo.start.dateTime) {
    ok('o resto do evento chega inteiro ao Google');
  } else falha('tirar o "cat" levou junto campo que o Google precisa');
}

/* ── a marca muda quando o conteúdo muda, e só então ─────────────────── */
{
  const a = bloco('aaa', 'rotina', 'Plantão');
  const b = bloco('aaa', 'rotina', 'Plantão');
  if (marcaDoEvento(a) === marcaDoEvento(b)) ok('evento igual tem a mesma marca');
  else falha('dois eventos idênticos deram marcas diferentes');

  const c = bloco('aaa', 'rotina', 'Plantão noturno');
  if (marcaDoEvento(a) !== marcaDoEvento(c)) ok('mudar o título muda a marca');
  else falha('mudar o título não mudou a marca do evento');

  const d = bloco('aaa', 'rotina', 'Plantão');
  d.end = { dateTime: '2026-03-02T13:00:00', timeZone: 'America/Sao_Paulo' };
  if (marcaDoEvento(a) !== marcaDoEvento(d)) ok('mudar o horário muda a marca');
  else falha('mudar o horário não mudou a marca do evento');

  /* A etiqueta interna não entra na marca porque não entra no corpo: se
     entrasse, trocar só o nome do grupo reenviaria tudo à toa. */
  const e = { ...bloco('aaa', 'rotina', 'Plantão'), cat: 'revisoes' };
  if (marcaDoEvento(a) === marcaDoEvento(e)) ok('a etiqueta interna não pesa na marca');
  else falha('a etiqueta interna está entrando na marca do conteúdo');
}

/* ── nada mudou: nada sobe ───────────────────────────────────────────── */
{
  const lista = [bloco('aaa', 'rotina', 'Plantão'), bloco('bbb', 'rotina', 'Ambulatório')];
  const antes = marcasDaLista(lista);
  const { subir, apagar } = diferencaDaAgenda(lista, antes, AUTO_PADRAO);
  if (subir.length === 0 && apagar.length === 0) ok('agenda intocada não gera envio nenhum');
  else falha(`agenda intocada mandou ${subir.length} evento(s) e apagou ${apagar.length}`);
}

/* ── mudou um: sobe um ───────────────────────────────────────────────── */
{
  const antesLista = [bloco('aaa', 'rotina', 'Plantão'), bloco('bbb', 'rotina', 'Ambulatório')];
  const antes = marcasDaLista(antesLista);
  const depois = [bloco('aaa', 'rotina', 'Plantão na UPA'), bloco('bbb', 'rotina', 'Ambulatório')];
  const { subir, apagar } = diferencaDaAgenda(depois, antes, AUTO_PADRAO);
  if (subir.length === 1 && subir[0].id === 'aaa') ok('editar um bloco sobe só esse bloco');
  else falha(`editar um bloco subiu ${subir.length} evento(s)`);
  if (apagar.length === 0) ok('editar não apaga nada');
  else falha('editar um bloco pediu para apagar evento');
}

/* ── bloco novo (o que o assistente cria) sobe sozinho ───────────────── */
{
  const antes = marcasDaLista([bloco('aaa', 'rotina', 'Plantão')]);
  const depois = [bloco('aaa', 'rotina', 'Plantão'), bloco('ccc', 'rotina', 'Estudo dirigido')];
  const { subir, apagar } = diferencaDaAgenda(depois, antes, AUTO_PADRAO);
  if (subir.length === 1 && subir[0].id === 'ccc') ok('bloco criado depois sobe sozinho');
  else falha('o bloco novo não foi para a fila de envio');
  if (apagar.length === 0) ok('criar bloco não apaga nada');
  else falha('criar um bloco pediu para apagar evento');
}

/* ── apagar aqui apaga lá ────────────────────────────────────────────── */
{
  const antes = marcasDaLista([bloco('aaa', 'rotina', 'Plantão'), bloco('bbb', 'rotina', 'Ambulatório')]);
  const { subir, apagar } = diferencaDaAgenda([bloco('aaa', 'rotina', 'Plantão')], antes, AUTO_PADRAO);
  if (apagar.length === 1 && apagar[0] === 'bbb') ok('bloco excluído aqui some da agenda do Google');
  else falha(`excluir um bloco pediu para apagar ${apagar.length} evento(s)`);
  if (subir.length === 0) ok('excluir não reenvia o que ficou');
  else falha('excluir um bloco reenviou o que sobrou');
}

/* ── grupo desligado não é limpado ───────────────────────────────────── */
{
  /* Alguém que um dia mandou as revisões pelo botão e depois desmarcou:
     as revisões continuam na agenda do Google, e o automático NÃO pode
     varrer oito meses de revisões só porque elas saíram da lista atual. */
  const antes = {
    ...marcasDaLista([bloco('aaa', 'rotina', 'Plantão')]),
    rev1: 'revisoes:abc',
    rev2: 'revisoes:def',
    sim1: 'simulados:ghi',
  };
  const { apagar } = diferencaDaAgenda([bloco('aaa', 'rotina', 'Plantão')], antes, AUTO_PADRAO);
  if (apagar.length === 0) ok('grupo desligado não tem evento apagado da agenda');
  else falha(`grupo desligado teve ${apagar.length} evento(s) apagado(s): ${apagar.join(', ')}`);

  /* Com o grupo ligado, aí sim: revisão que saiu da lista tem de sumir. */
  const ligado = { ...AUTO_PADRAO, revisoes: true };
  const r = diferencaDaAgenda([bloco('aaa', 'rotina', 'Plantão')], antes, ligado);
  if (r.apagar.length === 2 && r.apagar.every((id) => id.startsWith('rev'))) {
    ok('com o grupo ligado, a revisão que saiu é apagada');
  } else falha(`com o grupo ligado, apagou ${r.apagar.join(', ') || 'nada'}`);
}

/* ── marca guardada sem grupo (formato antigo) não apaga nada ────────── */
{
  const antes = { velho: 'abc123' };
  const { apagar } = diferencaDaAgenda([], antes, AUTO_PADRAO);
  if (apagar.length === 0) ok('marca em formato desconhecido não apaga evento');
  else falha('marca em formato desconhecido mandou apagar evento');
}

/* ── o padrão manda só o que a pessoa edita no dia a dia ─────────────── */
{
  if (AUTO_PADRAO.rotina === true) ok('por padrão, rotina e compromissos sobem sozinhos');
  else falha('o padrão do envio automático deixou a rotina de fora');
  const extras = ['revisoes', 'simulados', 'prova'].filter((k) => AUTO_PADRAO[k]);
  if (extras.length === 0) ok('por padrão, os outros grupos ficam para o botão');
  else falha(`o padrão liga grupo que a pessoa não escolheu: ${extras.join(', ')}`);
}

/* ── o limite existe e é um número de gente, não de máquina ──────────── */
{
  if (LIMITE_AUTO > 0 && LIMITE_AUTO <= 2000) ok(`o envio silencioso para em ${LIMITE_AUTO} mudanças`);
  else falha(`o limite do envio silencioso está estranho: ${LIMITE_AUTO}`);
}

console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
