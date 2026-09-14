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
  corpoDoEvento, marcaDoEvento, marcasDaLista, diferencaDaAgenda, depoisDaLigacao, estadoDaLigacao,
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

/* ── "não liguei ainda" não é "não dá para ligar" ────────────────────
   Este foi o defeito que deixou a conta impossível de ligar: as duas
   perguntas viviam na mesma variável. Quem nunca ligou recebe do servidor
   ligado:false — resposta certa para "já está ligada?" e que virava um
   "não" para "este site sabe ligar?". O botão sumia justamente para quem
   precisava dele, e sobrava o aviso de "falta ligar a conta" sem nada ao
   lado para clicar. */
{
  const nunca = estadoDaLigacao({ ligado: false, disponivel: true });
  if (nunca.servidorLiga === true) ok('quem nunca ligou continua podendo ligar');
  else falha('quem nunca ligou ficou sem o botão de ligar');
  if (nunca.permanente === false) ok('e a conta é dita como não ligada, que é a verdade');
  else falha('o estado da conta saiu ' + nunca.permanente);

  const ligada = estadoDaLigacao({ ligado: true, disponivel: true });
  if (ligada.servidorLiga && ligada.permanente === true) ok('conta ligada é reconhecida como ligada');
  else falha('conta ligada saiu ' + JSON.stringify(ligada));

  /* O único caso que realmente fecha a porta: o site não tem a credencial
     cadastrada, e aí oferecer o botão é prometer o que não existe. */
  const semCredencial = estadoDaLigacao({ disponivel: false, ligado: false });
  if (semCredencial.servidorLiga === false) ok('site sem a credencial para de oferecer o botão');
  else falha('site sem credencial continuou oferecendo');

  /* Resposta que não fala do assunto não pode apagar o que já se sabia. */
  const calada = estadoDaLigacao({ erro: 'deu ruim' });
  if (calada.permanente === null) ok('resposta que não fala da conta não mexe no que já se sabia');
  else falha('uma resposta muda mudou o estado da conta: ' + calada.permanente);
  if (calada.servidorLiga === true) ok('erro solto não é tratado como site sem credencial');
  else falha('um erro qualquer fechou a porta de ligar');
}

/* ── ligar a conta nunca pode terminar em nada ───────────────────────
   Esta regra existe por causa de um defeito que tirou o Google do ar para
   quem já usava: a conta que já autorizou o site alguma vez recebe do
   Google um código que não vira autorização permanente, o servidor
   explicava isso, e a página parava ali. Conectar com o token de uma hora
   é pior que a ligação permanente e é muito melhor que não conectar. */
{
  const ok1 = depoisDaLigacao({ acesso: 'abc123', expiraEm: 1 });
  if (ok1.permanente === true && ok1.token === 'abc123' && !ok1.tentarAntigo) {
    ok('ligação que deu certo devolve o token e marca a conta como ligada');
  } else falha('ligação boa saiu ' + JSON.stringify(ok1));

  /* O caso que quebrou. */
  const jaAutorizou = depoisDaLigacao({
    erro: 'O Google não devolveu a autorização permanente...', semAtualizacao: true,
  });
  if (jaAutorizou.tentarAntigo) ok('conta que já tinha autorizado antes ainda consegue conectar pelo caminho antigo');
  else falha('a conta que já autorizou ficou sem caminho nenhum');
  if (jaAutorizou.permanente === null) ok('esse caso não marca a conta como ligada nem como impossível');
  else falha('mexeu no estado da ligação sem motivo: ' + jaAutorizou.permanente);

  /* Quem decide se o site AINDA OFERECE a ligação é o estadoDaLigacao,
     logo acima; aqui a única pergunta é "e agora, como conecto?". */
  const semServidor = depoisDaLigacao({ erro: 'não configurado', disponivel: false });
  if (semServidor.tentarAntigo) ok('site sem a ligação permanente configurada ainda conecta pelo caminho antigo');
  else falha('sem servidor saiu ' + JSON.stringify(semServidor));
  if (estadoDaLigacao({ erro: 'não configurado', disponivel: false }).servidorLiga === false) {
    ok('e é o estadoDaLigacao que para de oferecer o botão nesse caso');
  } else falha('o site sem credencial continuou oferecendo o botão');

  const ligouSemToken = depoisDaLigacao({ ok: true, ligado: true });
  if (ligouSemToken.permanente === true && ligouSemToken.tentarAntigo) {
    ok('ligou mas não veio token: fica ligada e ainda assim conecta agora');
  } else falha('ligou sem token saiu ' + JSON.stringify(ligouSemToken));

  for (const ruim of [null, undefined, {}, { erro: 'qualquer coisa' }]) {
    if (!depoisDaLigacao(ruim).tentarAntigo) { falha('parou sem conectar em ' + JSON.stringify(ruim)); break; }
  }
  ok('resposta vazia, estranha ou com erro qualquer sempre sobra o caminho antigo');
}

console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
