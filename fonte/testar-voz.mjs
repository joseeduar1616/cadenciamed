/* Testa o que a voz da mentoria diz, e qual voz ela escolhe.
 *
 * A síntese do aparelho lê ao pé da letra: "19:30" vira "dezenove dois
 * pontos trinta", "R$ 39" vira "erre cifrão", "ex.:" vira "ex". E a voz
 * padrão de muitos aparelhos é masculina ou robótica. Nada disso aparece
 * como erro: só soa estranho ao telefone. Aqui cada conversão e a escolha
 * da voz são conferidas sem navegador.
 *
 *   node testar-voz.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const { textoParaFalar, frasesParaFalar, escolherVoz } = await import('./_voz.mjs');

const fala = (nome, entrada, esperado) => {
  const r = textoParaFalar(entrada);
  if (r === esperado) ok(nome);
  else falha(`${nome}:\n      esperava "${esperado}"\n      veio     "${r}"`);
};
const contem = (nome, entrada, trecho) => {
  const r = textoParaFalar(entrada);
  if (r.includes(trecho)) ok(nome);
  else falha(`${nome}: "${r}" não contém "${trecho}"`);
};
const naoContem = (nome, entrada, trecho) => {
  const r = textoParaFalar(entrada);
  if (!r.includes(trecho)) ok(nome);
  else falha(`${nome}: "${r}" ainda contém "${trecho}"`);
};

/* ── markdown e símbolos ─────────────────────────────────────────────── */
fala('negrito, itálico e título somem', '## Plano\n**Hoje**: revisar _cardio_.', 'Plano. Hoje: revisar cardio.');
fala('lista vira frases', '- Questões de manhã\n- Flashcards à noite', 'Questões de manhã. Flashcards à noite.');
naoContem('asterisco não é lido', 'Vamos **começar**.', '*');
fala('emoji some', 'Boa! 🎉 Vamos lá.', 'Boa! Vamos lá.');
fala('link vira "o link"', 'Veja em https://cadenciamed.com.br/app hoje.', 'Veja em o link hoje.');
fala('bloco de opções não é lido', 'Prefere de manhã ou à noite? <opcoes>["manhã","noite"]</opcoes>', 'Prefere de manhã ou à noite?');
fala('bloco <ouvi> não é lido', '<ouvi>quero estudar à noite</ouvi>Combinado.', 'Combinado.');
fala('travessão vira pausa', 'Começa cedo — às sete — e termina às nove.', 'Começa cedo, às sete, e termina às nove.');
fala('parênteses viram pausa', 'Faça 20 questões (do tema de hoje) e pare.', 'Faça 20 questões, do tema de hoje, e pare.');
fala('barra entre palavras vira "ou"', 'Estude de manhã/tarde.', 'Estude de manhã ou tarde.');
fala('aspas somem', 'Marque como "feito" no app.', 'Marque como feito no app.');
fala('frase sem ponto final ganha um', 'Vamos começar', 'Vamos começar.');

/* ── horários, datas e números ───────────────────────────────────────── */
fala('hora cheia', 'Às 19:00 comece.', 'Às 19 horas comece.');
fala('hora e minutos', 'Das 19:30 às 21:15.', 'Das 19 e 30 às 21 e 15.');
fala('hora com h', 'Acorde às 7h e durma às 23h.', 'Acorde às 7 horas e durma às 23 horas.');
fala('hora com h e minutos', 'Estude 2h30 por dia.', 'Estude 2 e 30 por dia.');
fala('minutos', 'Blocos de 45 min com 10min de pausa.', 'Blocos de 45 minutos com 10 minutos de pausa.');
fala('data completa', 'A prova é em 10/03/2027.', 'A prova é em 10 de março de 2027.');
fala('data sem ano', 'Simulado dia 05/11.', 'Simulado dia 5 de novembro.');
fala('dinheiro', 'O plano custa R$ 39 por mês ou R$ 300 por ano.', 'O plano custa 39 reais por mês ou 300 reais por ano.');
fala('dinheiro com centavos', 'São R$ 39,90.', 'São 39 reais e 90 centavos.');
fala('porcentagem', 'Você acerta 58% em cirurgia.', 'Você acerta 58 por cento em cirurgia.');
fala('intervalo numérico', 'Faça 20-30 questões.', 'Faça 20 a 30 questões.');
fala('multiplicação', 'Revise 3x por semana.', 'Revise 3 vezes por semana.');

/* ── abreviações ─────────────────────────────────────────────────────── */
fala('ex.: vira por exemplo', 'Use recuperação ativa, ex.: folha em branco.', 'Use recuperação ativa, por exemplo: folha em branco.');
fala('etc. vira etcétera', 'Clínica, cirurgia, etc.', 'Clínica, cirurgia, etcétera');
fala('nº vira número', 'Questão nº 12.', 'Questão número 12.');
fala('dias da semana abreviados', 'Seg. e qua. à noite, sáb. de manhã.', 'segunda e quarta à noite, sábado de manhã.');
fala('p/ e c/ viram palavras', 'Estude p/ a prova c/ questões.', 'Estude para a prova com questões.');

/* ── frases ──────────────────────────────────────────────────────────── */
{
  const f = frasesParaFalar('Primeira frase. Segunda frase! Terceira?');
  if (f.length === 1 && f[0] === 'Primeira frase. Segunda frase! Terceira?') ok('frases curtas seguem juntas numa fala só');
  else falha('frases curtas: ' + JSON.stringify(f));
  const longa = frasesParaFalar(Array.from({ length: 12 }, (_, i) => `Esta é a frase número ${i + 1} e ela tem um tamanho razoável.`).join(' '));
  if (longa.length >= 3 && longa.every((x) => x.length <= 240)) ok('texto longo é cortado em pedaços de até 220 caracteres, nas pontas das frases');
  else falha('corte do texto longo: ' + JSON.stringify(longa.map((x) => x.length)));
  const pv = frasesParaFalar('Primeiro; depois; por fim.');
  if (pv.length === 1 && !/;/.test(pv[0]) === false || pv.length === 1) ok('ponto e vírgula fica na mesma fala, como pausa');
  else falha('ponto e vírgula: ' + JSON.stringify(pv));
}

/* ── qual voz ────────────────────────────────────────────────────────── */
const voz = (name, lang, extra = {}) => ({ name, lang, ...extra });
const escolhe = (nome, vozes, esperado) => {
  const r = escolherVoz(vozes);
  const n = r ? r.name : null;
  if (n === esperado) ok(nome);
  else falha(`${nome}: esperava "${esperado}", veio "${n}"`);
};

escolhe('Edge: Francisca (Natural) ganha de Antonio (Natural), que é masculina',
  [voz('Microsoft Antonio Online (Natural) - Portuguese (Brazil)', 'pt-BR'),
    voz('Microsoft Francisca Online (Natural) - Portuguese (Brazil)', 'pt-BR'),
    voz('Microsoft Daniel - Portuguese (Brazil)', 'pt-BR')],
  'Microsoft Francisca Online (Natural) - Portuguese (Brazil)');

escolhe('Chrome no Windows: Google (feminina) ganha de Daniel (masculina), que é a padrão',
  [voz('Microsoft Daniel - Portuguese (Brazil)', 'pt-BR', { default: true }),
    voz('Google português do Brasil', 'pt-BR')],
  'Google português do Brasil');

escolhe('iPhone: Luciana ganha de Felipe e das compactas',
  [voz('Felipe', 'pt-BR'), voz('Luciana (Compact)', 'pt-BR'), voz('Luciana', 'pt-BR'), voz('Joana', 'pt-PT')],
  'Luciana');

escolhe('voz natural com nome desconhecido ganha de masculina conhecida',
  [voz('Microsoft Antonio Online (Natural) - Portuguese (Brazil)', 'pt-BR'), voz('Nova Voz Neural', 'pt-BR')],
  'Nova Voz Neural');

escolhe('sem pt-BR: cai no português de Portugal antes de ficar muda',
  [voz('Google US English', 'en-US'), voz('Joana', 'pt-PT')], 'Joana');

escolhe('pt-BR sempre antes de pt-PT, mesmo que a de Portugal pareça melhor',
  [voz('Microsoft Raquel Online (Natural) - Portuguese (Portugal)', 'pt-PT'), voz('Português do Brasil', 'pt-BR')],
  'Português do Brasil');

escolhe('só uma voz masculina: ainda assim fala, em vez de ficar muda',
  [voz('Microsoft Daniel - Portuguese (Brazil)', 'pt-BR')], 'Microsoft Daniel - Portuguese (Brazil)');

if (escolherVoz([voz('Google US English', 'en-US')]) === null) ok('sem português nenhum: devolve nada, e a fala usa a voz padrão do aparelho');
else falha('sem português deveria devolver null');
if (escolherVoz([]) === null && escolherVoz(null) === null) ok('lista vazia ou ausente não quebra');
else falha('lista vazia quebrou');

console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
