/* O PDF de tutorial: uma página por função do site.
 *
 * Cada página segue o mesmo esqueleto (rótulo, título, texto, passos de um
 * lado e a captura com relevo do outro), de propósito: quem folheia aprende
 * onde procurar a informação e para de ler o layout a cada virada.
 */
import {
  COR, esc, cabeca, rodape, tela, fone, passo, numero, marcaBase64, marcaAltura, tituloGradiente,
} from './comum.mjs';

const MARCA = marcaBase64();
const AULAS = 90;
const TOPICOS = 213;
const SUPORTE = 'suporte@cadenciamed.com';

const rod = (n) => rodape('Cadência Med · guia de uso', `${n}`);

/* ── capa ─────────────────────────────────────────────────────────── */
function capa() {
  return `<section class="pg">
  <div class="fundo">
    <div class="malha"></div>
    <div class="aura aura-a"></div>
    <div class="aura aura-b"></div>
    <div class="aura aura-c"></div>
    <div class="base-luz"></div>
    <div class="fio-topo"></div>
  </div>

  <div style="position:absolute;right:-18mm;top:50%;transform:translateY(-50%);z-index:1">
    <div style="position:relative;width:126mm;height:126mm">
      <div class="anel" style="inset:0"></div>
      <div class="anel" style="inset:16mm;border-color:${COR.neon}44"></div>
      <div class="esfera" style="position:absolute;inset:30mm"></div>
      <img src="${MARCA}" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
        width:54mm">
    </div>
  </div>

  <div class="corpo" style="justify-content:center">
    <img src="${MARCA}" style="${marcaAltura(13)}">
    <div class="olho" style="margin-top:8mm">Guia de uso · versão 1</div>
    <h1 class="tit" style="margin-top:6mm;max-width:170mm">
      Tudo o que a<br>${tituloGradiente('Cadência Med')} faz
    </h1>
    <p class="txt" style="margin-top:7mm;max-width:112mm">
      Um passeio por cada aba do painel, na ordem em que você vai usar.
      Do primeiro acesso ao dia da prova: o que cada tela resolve, onde ficam
      os botões e o que acontece depois de clicar.
    </p>
    <div style="display:flex;gap:12mm;margin-top:12mm">
      ${numero(String(AULAS), 'aulas prontas', COR.neon)}
      ${numero(String(TOPICOS), 'tópicos', COR.neon2)}
      ${numero('13', 'abas', COR.ok)}
    </div>
  </div>
  ${rodape(SUPORTE, 'cadenciamed.com.br')}
</section>`;
}

/* ── sumário ──────────────────────────────────────────────────────── */
function sumario(itens) {
  const meio = Math.ceil(itens.length / 2);
  return `<section class="pg">
  <div class="fundo"><div class="malha"></div><div class="aura aura-a"></div>
    <div class="aura aura-b"></div><div class="aura aura-c"></div>
    <div class="base-luz"></div><div class="fio-topo"></div></div>
  <div class="corpo">
    ${cabeca(MARCA, 'O que tem aqui dentro')}
    <div class="miolo">
      <h2 class="tit" style="margin-bottom:7mm">Cada aba,<br>uma página</h2>
      <div class="grade g2" style="gap:9mm">
        <div>${itens.slice(0, meio).map((it, i) => linha(it, i)).join('')}</div>
        <div>${itens.slice(meio).map((it, i) => linha(it, i + meio)).join('')}</div>
      </div>
    </div>
  </div>
  ${rod(2)}
</section>`;
}
function linha(it, i) {
  return `<div style="display:flex;align-items:baseline;gap:3.5mm;padding:2.5mm 0;
    border-bottom:.2mm solid ${COR.linha}">
    <span class="numero" style="font-size:8.5pt;color:${COR.neon};width:7mm">${String(i + 3).padStart(2, '0')}</span>
    <span style="font-size:9.4pt;font-weight:700;color:${COR.tinta};width:32mm;flex-shrink:0">${esc(it[0])}</span>
    <span style="font-size:8.2pt;color:${COR.meio};flex:1;line-height:1.45">${esc(it[1])}</span>
  </div>`;
}

/* ── página de função ─────────────────────────────────────────────── */
function funcao({ n, olho, titulo, texto, passos, moldura, selo, pagina: p, extra }) {
  return `<section class="pg">
  <div class="fundo"><div class="malha"></div><div class="aura aura-a"></div>
    <div class="aura aura-b"></div><div class="aura aura-c"></div>
    <div class="base-luz"></div><div class="fio-topo"></div></div>
  <div class="corpo">
    ${cabeca(MARCA, `${String(n).padStart(2, '0')} · ${olho}`, selo || '')}
    <div style="display:flex;gap:9mm;flex:1;min-height:0;align-items:center">
      <div style="width:104mm;flex-shrink:0">
        <h2 class="tit">${titulo}</h2>
        <p class="txt" style="margin-top:4.5mm">${texto}</p>
        <div style="margin-top:6.5mm;display:flex;flex-direction:column;gap:4.2mm">
          ${passos.map((x, i) => passo(i + 1, x[0], x[1])).join('')}
        </div>
        ${extra || ''}
      </div>
      <div style="flex:1;min-width:0;padding-top:2mm">
        ${tela(moldura)}
      </div>
    </div>
  </div>
  ${rod(p)}
</section>`;
}

/* ── as funções, na ordem do uso ──────────────────────────────────── */
const FUNCOES = [
  {
    olho: 'Primeiro acesso', titulo: 'Criar conta<br>e entrar',
    resumo: 'conta, cupom e o que é de graça',
    texto: `A conta é o que guarda o seu estudo e leva de um aparelho para o outro.
      Criar leva menos de um minuto, e o cronograma com as ${AULAS} aulas e ${TOPICOS} tópicos,
      o cronômetro e o registro das sessões são <strong>de graça, para sempre</strong>.`,
    passos: [
      ['Abra o site e clique em Criar minha conta', 'No topo da página fica o atalho para quem já tem conta.'],
      ['Escreva nome, e-mail e senha', 'Use o mesmo e-mail que você vai usar na hora de assinar.'],
      ['Recebeu um cupom? Escreva no campo', 'Ele libera o plano completo assim que a conta é criada.'],
      ['Pronto: já dá para marcar a primeira aula', 'Nada precisa ser configurado antes.'],
    ],
    moldura: 'entrada-conta-e',
  },
  {
    olho: 'Cronograma', titulo: 'Residência,<br>clínico, ou os dois',
    resumo: 'escolha o conteúdo que o painel segue',
    selo: `<span class="selo" style="background:${COR.aviso}22;border:.3mm solid ${COR.aviso}55;color:${COR.aviso}">novo</span>`,
    texto: `Tudo no painel sai daqui: as matérias que aparecem, as revisões que vencem,
      o radar por área e o que o assistente enxerga. <strong>Escolha uma vez e pode trocar
      quando quiser</strong>, sem perder o que já marcou.`,
    passos: [
      ['Residência', `O cronograma que já vem pronto, com as ${AULAS} aulas divididas nas cinco áreas da prova.`],
      ['Ciclo clínico', 'Envie o conteúdo do estágio que você está cursando. Ele entra no lugar das aulas da residência nas áreas enviadas.'],
      ['Os dois juntos', 'As aulas da residência continuam e as do ciclo clínico entram junto. Nenhuma das listas se perde.'],
      ['A IA organiza o material', 'Cole o texto ou mande o PDF: ela separa em aulas, classifica nas cinco áreas e você confere antes de valer.'],
    ],
    moldura: 'cronograma-d',
  },
  {
    olho: 'Hoje', titulo: 'O painel<br>do seu dia',
    resumo: 'metas, ritmo, agenda e o que registrar',
    texto: `A primeira tela depois de entrar. Ela responde três perguntas de uma vez:
      quanto você já fez hoje, o que está vencendo e se o seu ritmo fecha o cronograma
      antes da prova.`,
    passos: [
      ['Os quatro anéis do topo', 'Minutos de hoje, da semana, questões e dias seguidos sem falhar, cada um contra a sua meta.'],
      ['Ritmo e projeção', 'Quantas aulas por semana você está fazendo e quantas precisaria fazer para fechar a tempo.'],
      ['Sua agenda de hoje', 'Os blocos da rotina que caem neste dia, com o que está acontecendo agora em destaque.'],
      ['Registrar sessão', 'Lance o que acabou de estudar: tempo, questões e acertos entram nas estatísticas na hora.'],
    ],
    moldura: 'hoje-e',
  },
  {
    olho: 'Foco', titulo: 'O cronômetro<br>que vira dado',
    resumo: 'pomodoro, tempo corrido e sessão registrada',
    texto: `Pomodoro com ciclos configuráveis ou tempo corrido, do seu jeito. Ao parar,
      a sessão já sai registrada com a matéria escolhida, e o tempo entra no seu ritmo
      e na projeção até a prova.`,
    passos: [
      ['Escolha a matéria antes de começar', 'O tempo fica preso àquela aula, e depois aparece no histórico dela.'],
      ['Pomodoro ou tempo corrido', 'Foco, pausa curta, pausa longa e quantos ciclos até a pausa longa: tudo ajustável.'],
      ['Quatro estilos de relógio', 'Anel, dígitos, barra ou minimalista, com as cores de foco e de pausa que você escolher.'],
      ['Parou, virou estatística', 'Sem digitar nada duas vezes: o que o cronômetro contou já conta no painel.'],
    ],
    moldura: 'foco-d',
  },
  {
    olho: 'Matérias', titulo: 'Marcar aula,<br>tópico e anotação',
    resumo: 'o cronograma inteiro, aula por aula',
    texto: `A lista completa do que você tem para estudar, agrupada por área e
      especialidade. Cada aula tem os tópicos dentro dela, o seu desempenho e um
      espaço de anotação com texto formatado e imagem.`,
    passos: [
      ['Marque a aula quando terminar', 'É a marcação que dispara a escada de revisão daquela aula.'],
      ['Marque os tópicos separados', `São ${TOPICOS} no total, para você saber exatamente o que já viu dentro de cada aula.`],
      ['Classifique o seu desempenho', 'Acima de 80%, entre 61 e 79% ou abaixo de 60%: é isso que pinta o radar em Temas.'],
      ['Anote dentro da aula', 'Negrito, cor, marca-texto, imagem colada e exportação em PDF ou para o Drive.'],
    ],
    moldura: 'materias-e',
  },
  {
    olho: 'Revisões', titulo: 'A revisão volta<br>na hora certa',
    resumo: 'a escada espaçada, sem depender da memória',
    texto: `Toda aula marcada entra numa escada de revisão. O que vence aparece em Hoje,
      no dia, e você não precisa lembrar de nada. Se a escada padrão não é a sua,
      escreva os prazos que você usa.`,
    passos: [
      ['Cada aula ganha uma escada', 'Os degraus contam a partir do dia em que você marcou a aula.'],
      ['O que venceu sobe para o topo', 'A lista é ordenada pelo atraso, então a primeira linha é sempre a mais urgente.'],
      ['Marque o degrau ao revisar', 'Um toque e ele fica verde. Marcou sem querer? Desmarcar volta atrás.'],
      ['Troque o esquema quando quiser', 'Padrão, enxuto ou os dias que você escrever, de um a oito degraus.'],
    ],
    moldura: 'revisoes-d',
  },
  {
    olho: 'Cartões', titulo: 'Flashcards com<br>repetição espaçada',
    resumo: 'seus cartões, do Anki ou de um PDF',
    texto: `Faça os seus, traga um baralho do Anki ou monte os cartões a partir de um
      PDF ou de um Word. Cada resposta decide quando aquele cartão volta, e a fila do
      dia aparece no menu.`,
    passos: [
      ['Organize em pastas e baralhos', 'Uma pasta por área, um baralho por especialidade, do jeito que fizer sentido para você.'],
      ['Monte com IA a partir de um arquivo', 'Mande o PDF da aula e receba os cartões prontos para revisar antes de aceitar.'],
      ['Importe o que você já tem', 'Arquivo .apkg do Anki, com as imagens que vierem junto.'],
      ['Responda e o prazo se ajusta', 'Errei, difícil, bom ou fácil: o intervalo cresce ou encolhe conforme a sua resposta.'],
    ],
    moldura: 'cartoes-e',
  },
  {
    olho: 'Temas', titulo: 'O radar das<br>suas cinco áreas',
    resumo: 'onde você está bem e onde está atrasado',
    texto: `A visão de cima do seu estudo. Cada especialidade mostra quanto já foi feito,
      quanto tempo você investiu e quantas aulas ficaram com desempenho baixo, para a
      próxima escolha não ser no chute.`,
    passos: [
      ['Uma barra por especialidade', 'Feitas contra o total, na cor da área a que ela pertence.'],
      ['O tempo que cada uma levou', 'Somado das sessões que você registrou naquelas aulas.'],
      ['As aulas fracas em destaque', 'As que você classificou abaixo de 60% aparecem contadas, para virarem prioridade.'],
      ['Marque direto daqui', 'Dá para atualizar a aula sem sair da visão geral.'],
    ],
    moldura: 'temas-d',
  },
  {
    olho: 'Rotina', titulo: 'A semana que<br>você realmente tem',
    resumo: 'plantão, enfermaria, aula e estudo no mesmo mapa',
    texto: `Monte a sua semana com os blocos que se repetem e os compromissos com data.
      É o que faz o painel saber quando você tem tempo livre, e é o que o assistente lê
      antes de sugerir qualquer coisa.`,
    passos: [
      ['Blocos que se repetem toda semana', 'Plantão, enfermaria, aula, estudo, questões, descanso ou pessoal, cada um com a sua cor.'],
      ['Compromissos com data', 'Prova, simulado, viagem: entram só naquele dia, sem sujar a semana toda.'],
      ['Marque como cumprido', 'O bloco fica riscado no dia, e o histórico guarda cada data separadamente.'],
      ['Google Agenda ao lado', 'Sincronize a agenda para os blocos aparecerem no seu calendário de sempre.'],
    ],
    moldura: 'rotina-e',
  },
  {
    olho: 'Amigos', titulo: 'Estudar junto<br>rende mais',
    resumo: 'salas, ranking e quem está estudando agora',
    texto: `Combine um nome e uma senha com quem estuda com você e abram uma sala.
      Horas, questões e acerto de todo mundo no mesmo ranking, e quem está estudando
      naquele momento aparece aceso.`,
    passos: [
      ['Crie ou entre numa sala', 'Só precisa do nome e da senha combinados. Nada de convite por e-mail.'],
      ['O ranking sai do que já foi registrado', 'Ninguém precisa lançar nada duas vezes: são as suas sessões de sempre.'],
      ['Quem está online aparece', 'Um pontinho aceso ao lado do nome de quem está estudando agora.'],
      ['Prefere ficar fora do ranking?', 'Dá para continuar na sala com os seus números escondidos.'],
    ],
    moldura: 'amigos-d',
  },
  {
    olho: 'Metas', titulo: 'Simulados, provas<br>e hábitos',
    resumo: 'o acompanhamento de médio prazo',
    texto: `Onde ficam as coisas que não são do dia: as janelas de simulado, as provas
      antigas que você resolveu e os hábitos que sustentam o resto. É o lugar de olhar
      uma vez por semana.`,
    passos: [
      ['Janelas de simulado', 'As datas ficam marcadas, e você registra o resultado de cada uma.'],
      ['Provas resolvidas', 'Instituição, data, questões e acertos: o histórico mostra a curva ao longo dos meses.'],
      ['Hábitos do dia', 'Três por padrão, e você troca por quantos quiser. O calendário mostra a sequência.'],
      ['Exportar a agenda', 'Leve a sua rotina para outro calendário quando precisar.'],
    ],
    moldura: 'metas-e',
  },
  {
    olho: 'Progresso', titulo: 'A curva do<br>seu semestre',
    resumo: 'gráficos, aparência e backup',
    texto: `Os gráficos de tempo e de questões ao longo das semanas, o total acumulado e
      a conta. É também onde ficam a aparência do painel e o backup do seu arquivo.`,
    passos: [
      ['Tempo e questões por semana', 'Duas curvas simples, que mostram constância melhor do que qualquer número solto.'],
      ['Escolha a cara do painel', 'Seis pares de cor prontos, cor própria, cinco fontes e três tamanhos de texto.'],
      ['Baixe o seu backup', 'Um arquivo com tudo, que volta inteiro em qualquer aparelho.'],
      ['Conta e sincronização', 'Entrar, sair e ver quando foi o último envio para a nuvem.'],
    ],
    moldura: 'progresso-d',
  },
  {
    olho: 'Assistente', titulo: 'Uma IA que<br>já sabe onde você parou',
    resumo: 'perguntas com o seu progresso na mão',
    texto: `Diferente de um chat comum, ele enxerga o seu progresso, as revisões
      atrasadas e a sua rotina antes de responder. E o que você contar por escrito ele
      registra no painel.`,
    passos: [
      ['Pergunte o que estudar hoje', 'A resposta sai das revisões vencidas, das áreas fracas e do tempo livre da semana.'],
      ['Conte o que acabou de fazer', '"Fiz 30 questões de pré-eclâmpsia, acertei 27" vira uma sessão registrada.'],
      ['Peça para agendar', 'Ele adiciona blocos na rotina e pendências na sua lista.'],
      ['Faz parte do plano completo', 'A chave da IA fica no servidor e nunca passa pelo seu navegador.'],
    ],
    moldura: 'assistente-e',
  },
];

/* ── página do celular ────────────────────────────────────────────── */
function celular(p) {
  return `<section class="pg">
  <div class="fundo"><div class="malha"></div><div class="aura aura-a"></div>
    <div class="aura aura-b"></div><div class="aura aura-c"></div>
    <div class="base-luz"></div><div class="fio-topo"></div></div>
  <div class="corpo">
    ${cabeca(MARCA, '15 · No celular')}
    <div style="display:flex;gap:10mm;flex:1;align-items:center">
      <div style="width:104mm;flex-shrink:0">
        <h2 class="tit">O mesmo painel<br>no bolso</h2>
        <p class="txt" style="margin-top:4.5mm">
          Não existe aplicativo para baixar na loja: o site já é o aplicativo.
          Abra no navegador do celular e instale na tela inicial, e ele passa a
          abrir em tela cheia, com ícone próprio.
        </p>
        <div style="margin-top:6.5mm;display:flex;flex-direction:column;gap:4.2mm">
          ${passo(1, 'No iPhone', 'Safari, botão de compartilhar, "Adicionar à Tela de Início".')}
          ${passo(2, 'No Android', 'Chrome, menu de três pontos, "Instalar aplicativo".')}
          ${passo(3, 'Tudo sincronizado', 'O que você marca no computador aparece no celular, e o contrário também.')}
          ${passo(4, 'Funciona sem internet', 'O painel abre e guarda o que você fizer; a sincronização acontece quando a rede volta.')}
        </div>
      </div>
      <div style="flex:1;display:flex;justify-content:center;align-items:center">
        ${fone('celular-hoje', '54mm')}
        <div style="margin:14mm 0 0 -8mm">${fone('celular-cronograma', '54mm')}</div>
        <div style="margin:-10mm 0 0 -8mm">${fone('celular-cartoes', '54mm')}</div>
      </div>
    </div>
  </div>
  ${rod(p)}
</section>`;
}

/* ── página final: plano, garantia e suporte ──────────────────────── */
function fim(p) {
  const cartao = (nome, de, por, periodo, cor, destaque) => `
    <div class="vidro" style="--brilho:${cor};padding:7mm 6mm;${destaque ? `border-color:${cor}66` : ''}">
      <div class="conteudo">
        <div class="rotulo">${esc(nome)}</div>
        <div style="display:flex;align-items:center;gap:2.5mm;margin-top:3mm">
          <span class="numero" style="font-size:11pt;color:${COR.fantasma};text-decoration:line-through">${esc(de)}</span>
          <span class="mini">preço normal</span>
        </div>
        <div style="display:flex;align-items:baseline;gap:2mm;margin-top:1.5mm">
          <span class="numero" style="font-size:13pt;color:${cor}">R$</span>
          <span class="numero" style="font-size:30pt;color:${cor}">${esc(por)}</span>
          <span class="mini">${esc(periodo)}</span>
        </div>
        <div class="mini" style="margin-top:2.5mm">se assinar agora</div>
      </div>
    </div>`;

  return `<section class="pg">
  <div class="fundo"><div class="malha"></div><div class="aura aura-a"></div>
    <div class="aura aura-b"></div><div class="aura aura-c"></div>
    <div class="base-luz"></div><div class="fio-topo"></div></div>
  <div class="corpo">
    ${cabeca(MARCA, '16 · Plano e suporte',
    `<span class="selo" style="background:${COR.aviso}22;border:.3mm solid ${COR.aviso}55;color:${COR.aviso}">promoção de lançamento</span>`)}
    <div style="display:flex;gap:9mm;flex:1;align-items:center">
      <div style="width:120mm;flex-shrink:0">
        <h2 class="tit">O que é de graça<br>e o que é do plano</h2>
        <div class="grade g2" style="margin-top:6mm;gap:6mm">
          <div class="vidro" style="--brilho:${COR.ok};padding:6mm">
            <div class="conteudo">
              <div class="rotulo" style="color:${COR.ok}">de graça, para sempre</div>
              <div class="mini" style="margin-top:3mm;line-height:1.7;color:${COR.meio}">
                O cronograma com as ${AULAS} aulas e ${TOPICOS} tópicos para marcar,
                o cronômetro com pomodoro, o registro das sessões com questões e
                acertos, e o backup do seu arquivo.
              </div>
            </div>
          </div>
          <div class="vidro" style="--brilho:${COR.neon2};padding:6mm">
            <div class="conteudo">
              <div class="rotulo" style="color:${COR.neon2}">no plano completo</div>
              <div class="mini" style="margin-top:3mm;line-height:1.7;color:${COR.meio}">
                Flashcards, escada de revisão, radar por especialidade, rotina com
                Google Agenda, salas de amigos, metas, assistente de IA e
                sincronização entre aparelhos.
              </div>
            </div>
          </div>
        </div>
        <div class="grade g2" style="margin-top:6mm;gap:6mm">
          ${cartao('Mensal', 'R$ 99', '30', 'por mês', COR.neon, false)}
          ${cartao('Anual', 'R$ 799', '250', 'por ano', COR.neon2, true)}
        </div>
      </div>

      <div style="flex:1;min-width:0;padding-top:2mm;display:flex;flex-direction:column;gap:6mm">
        <div class="vidro" style="--brilho:${COR.ok};padding:7mm 6mm">
          <div class="conteudo">
            <div style="display:flex;align-items:center;gap:3mm">
              <span style="width:9mm;height:9mm;border-radius:2.4mm;display:flex;align-items:center;
                justify-content:center;background:${COR.ok}22;color:${COR.ok};font-size:12pt">&#10003;</span>
              <div style="font-size:12pt;font-weight:800;color:${COR.ok};text-transform:uppercase;
                letter-spacing:.06em">Garantia de 7 dias</div>
            </div>
            <div class="mini" style="margin-top:4mm;line-height:1.7;color:${COR.meio}">
              Assine, use tudo e veja se serve para você. Se não gostar, escreva
              dentro de 7 dias e devolvemos <strong>100% do dinheiro</strong>, sem
              precisar explicar o motivo.
            </div>
          </div>
        </div>

        <div class="vidro" style="--brilho:${COR.neon};padding:7mm 6mm;flex:1">
          <div class="conteudo">
            <div class="rotulo" style="color:${COR.neon}">falar com a gente</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:12pt;
              color:${COR.tinta};margin-top:4mm">${esc(SUPORTE)}</div>
            <div class="mini" style="margin-top:4mm;line-height:1.7">
              Dúvida de uso, problema para entrar, pedido de estorno ou sugestão do
              que falta no painel. Responde uma pessoa, não um robô.
            </div>
            <div style="margin-top:7mm;padding-top:5mm;border-top:.2mm solid ${COR.linha}">
              <div class="mini" style="line-height:1.7">
                Recebeu um cupom de um criador que você acompanha? Escreva o código
                no campo <strong>cupom</strong> ao criar a conta e o plano completo
                abre na hora.
              </div>
            </div>
          </div>
        </div>

        <img src="${MARCA}" style="${marcaAltura(10)};align-self:flex-start">
      </div>
    </div>
  </div>
  ${rod(p)}
</section>`;
}

export function tutorial(fontes) {
  const paginas = [capa(), sumario(FUNCOES.map((f) => [f.olho, f.resumo]))];
  FUNCOES.forEach((f, i) => paginas.push(funcao({ ...f, n: i + 1, pagina: i + 3 })));
  paginas.push(celular(FUNCOES.length + 3));
  paginas.push(fim(FUNCOES.length + 4));
  return paginas;
}
