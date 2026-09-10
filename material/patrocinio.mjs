/* O PDF de parceria com criadores.
 *
 * É um material de proposta: apresenta o produto com números que saem do
 * próprio código (aulas, tópicos, áreas, abas) e propõe as condições da
 * parceria. Nenhum número de audiência, venda ou conversão aparece aqui,
 * porque esses eu não tenho: os campos que dependem de negociação estão
 * reunidos em CONDICOES, logo abaixo, para serem trocados num lugar só.
 */
import {
  COR, esc, cabeca, rodape, tela, fone, passo, numero, marcaBase64,
} from './comum.mjs';

const MARCA = marcaBase64();
const AULAS = 90;
const TOPICOS = 213;
const SUPORTE = 'suporte@cadenciamed.com';
const SITE = 'cadenciamed.com.br';

/* ── o que muda de acordo com o combinado ─────────────────────────────
 * Troque aqui e o PDF inteiro acompanha. */
export const CONDICOES = {
  comissao: '30%',
  comissaoTexto: 'De cada assinatura vendida com o seu cupom, em toda renovação enquanto a pessoa continuar assinando',
  testeAudiencia: '7 dias',
  acessoCriador: 'Acesso anual liberado',
  pagamento: 'pela plataforma de pagamento, junto com o repasse do mês',
};

const rod = (n) => rodape('Cadência Med · plano de parceria', `${n}`);

const molde = (conteudo, n) => `<section class="pg">
  <div class="fundo"><div class="malha"></div><div class="aura aura-a"></div>
    <div class="aura aura-b"></div><div class="aura aura-c"></div>
    <div class="base-luz"></div><div class="fio-topo"></div></div>
  <div class="corpo">${conteudo}</div>
  ${rod(n)}
</section>`;

const painel = (cor, rotulo, titulo, texto) => `
  <div class="vidro" style="--brilho:${cor};padding:6mm">
    <div class="conteudo">
      <div class="rotulo" style="color:${cor}">${esc(rotulo)}</div>
      <div style="font-size:11pt;font-weight:700;color:${COR.tinta};margin-top:3mm;line-height:1.3">${titulo}</div>
      <div class="mini" style="margin-top:3mm;line-height:1.65;color:${COR.meio}">${texto}</div>
    </div>
  </div>`;

/* ── 1 · capa ─────────────────────────────────────────────────────── */
function capa() {
  return `<section class="pg">
  <div class="fundo"><div class="malha"></div><div class="aura aura-a"></div>
    <div class="aura aura-b"></div><div class="aura aura-c"></div>
    <div class="base-luz"></div><div class="fio-topo"></div></div>

  <div style="position:absolute;right:-24mm;top:52%;transform:translateY(-50%);z-index:1">
    <div style="position:relative;width:140mm;height:140mm">
      <div class="anel" style="inset:0"></div>
      <div class="anel" style="inset:14mm;border-color:${COR.neon}3a"></div>
      <div class="anel" style="inset:28mm;border-color:${COR.neon2}55"></div>
      <div class="esfera" style="position:absolute;inset:40mm"></div>
    </div>
  </div>
  <div style="position:absolute;right:14mm;bottom:20mm;z-index:1;
    transform:perspective(1500px) rotateY(-16deg) rotateX(5deg)">
    ${tela('entrada.png', { largura: '128mm', pe: false, gira: '' })}
  </div>

  <div class="corpo" style="justify-content:center">
    <img src="${MARCA}" style="height:13mm;width:auto;filter:drop-shadow(0 0 5mm ${COR.neon2}aa)">
    <div class="olho" style="margin-top:8mm">Proposta para criadores de conteúdo</div>
    <h1 class="tit" style="margin-top:6mm;max-width:150mm">
      Plano de<br><span class="cor">parceria</span>
    </h1>
    <p class="txt" style="margin-top:7mm;max-width:100mm">
      A Cadência Med é um painel de estudos para quem se prepara para a residência
      médica. Este material explica o que ela faz, para quem serve e como funciona
      a parceria com quem tem audiência na área.
    </p>
    <div class="mini" style="margin-top:12mm;font-family:'JetBrains Mono',monospace;
      letter-spacing:.16em;text-transform:uppercase">${esc(SITE)}</div>
  </div>
  ${rodape(SUPORTE, SITE)}
</section>`;
}

/* ── 2 · o que é ──────────────────────────────────────────────────── */
function oQueE() {
  return molde(`
    ${cabeca(MARCA, '01 · O produto')}
    <div style="display:flex;gap:9mm;flex:1;align-items:center">
      <div style="width:106mm;flex-shrink:0">
        <h2 class="tit">Um painel só,<br>no lugar de seis abas</h2>
        <p class="txt" style="margin-top:4.5mm">
          Quem estuda para residência hoje usa uma planilha para o cronograma, um
          caderno para a revisão, o Anki para os cartões, um cronômetro no celular e
          um grupo no WhatsApp para não desanimar. A Cadência junta isso num painel
          que sabe o que você já fez.
        </p>
        <div style="margin-top:6.5mm;display:flex;flex-direction:column;gap:4.2mm">
          ${passo(1, 'O cronograma vem pronto', `${AULAS} aulas e ${TOPICOS} tópicos divididos nas cinco áreas da prova, prontos para marcar no primeiro acesso.`)}
          ${passo(2, 'A revisão volta sozinha', 'Cada aula marcada entra numa escada espaçada, e o que vence aparece no dia.')}
          ${passo(3, 'Serve também no ciclo clínico', 'Dá para trocar o conteúdo pelo estágio da faculdade, ou usar os dois ao mesmo tempo.')}
          ${passo(4, 'Roda no computador e no celular', 'Mesma conta, mesmos dados, e instala na tela inicial como aplicativo.')}
        </div>
      </div>
      <div style="flex:1;min-width:0;padding-top:2mm">${tela('hoje.png', { gira: 'gira-r' })}</div>
    </div>`, 2);
}

/* ── 3 · números do produto ───────────────────────────────────────── */
function numeros() {
  const cartao = (v, r, cor) => `
    <div class="vidro" style="--brilho:${cor};padding:6mm 5mm;text-align:center">
      <div class="conteudo">
        <div class="numero" style="font-size:26pt;color:${cor}">${esc(v)}</div>
        <div class="rotulo" style="margin-top:2.5mm">${esc(r)}</div>
      </div>
    </div>`;
  return molde(`
    ${cabeca(MARCA, '02 · O que está dentro')}
    <div class="miolo">
    <h2 class="tit">O tamanho da<br>ferramenta</h2>
    <div class="grade g4" style="margin-top:7mm">
      ${cartao(String(AULAS), 'aulas principais', COR.neon)}
      ${cartao(String(TOPICOS), 'tópicos marcáveis', COR.neon2)}
      ${cartao('5', 'áreas da prova', COR.ok)}
      ${cartao('34', 'especialidades', COR.aviso)}
    </div>
    <div class="grade g3" style="margin-top:6mm">
      ${painel(COR.neon, 'estudo', 'Cronograma, revisão e cartões',
    `Marcação por aula e por tópico, escada de revisão com prazos que você escolhe,
     flashcards próprios, importação do Anki e montagem de cartões a partir de um PDF.`)}
      ${painel(COR.neon2, 'rotina', 'Foco, agenda e metas',
    `Cronômetro pomodoro que registra a sessão sozinho, semana com plantão e
     enfermaria, Google Agenda ao lado, simulados, provas resolvidas e hábitos.`)}
      ${painel(COR.ok, 'companhia', 'Amigos, mentor e IA',
    `Salas com ranking de horas e acerto, acompanhamento de mentor e um assistente
     que enxerga o progresso real antes de responder.`)}
    </div>
    <div class="grade g3" style="margin-top:5mm">
      <div style="grid-column:span 3">
        ${painel(COR.aviso, 'o que continua de graça', 'A porta de entrada é aberta',
    `O cronograma completo com as ${AULAS} aulas e ${TOPICOS} tópicos, o cronômetro
     com pomodoro, o registro de sessões com questões e acertos e o backup do
     arquivo continuam gratuitos, para sempre. O plano paga o resto.`)}
      </div>
    </div>
    </div>`, 3);
}

/* ── 4 · para quem serve ──────────────────────────────────────────── */
function publico() {
  const bloco = (cor, titulo, texto) => `
    <div class="vidro" style="--brilho:${cor};padding:6mm">
      <div class="conteudo">
        <div style="font-size:11.5pt;font-weight:800;color:${cor};text-transform:uppercase;
          letter-spacing:.05em">${esc(titulo)}</div>
        <div class="mini" style="margin-top:3.5mm;line-height:1.7;color:${COR.meio}">${texto}</div>
      </div>
    </div>`;
  return molde(`
    ${cabeca(MARCA, '03 · Público')}
    <div style="display:flex;gap:9mm;flex:1;align-items:center">
      <div style="width:112mm;flex-shrink:0">
        <h2 class="tit">Para quem<br>a ferramenta serve</h2>
        <p class="txt" style="margin-top:4.5mm">
          Se a sua audiência é de medicina, provavelmente ela está em uma destas
          três situações. As três usam o mesmo painel, com o conteúdo trocado.
        </p>
        <div style="margin-top:6mm;display:flex;flex-direction:column;gap:5mm">
          ${bloco(COR.neon2, 'Quem está no cursinho', `Segue um cronograma pesado e precisa de um lugar
            que diga o que revisar hoje sem depender da memória. É o público que mais
            sente falta de revisão espaçada organizada.`)}
          ${bloco(COR.neon, 'Quem está no internato', `Tem plantão, enfermaria e ambulatório ocupando o dia.
            Precisa encaixar estudo nas horas que sobram, e é para isso que existe a
            rotina com blocos e o aviso do que está vencendo.`)}
          ${bloco(COR.ok, 'Quem está no ciclo clínico', `Ainda não está estudando para a prova, mas já quer
            organizar o conteúdo da faculdade. Troca o cronograma pelo do estágio, ou
            usa os dois ao mesmo tempo, e chega no cursinho com o histórico pronto.`)}
        </div>
      </div>
      <div style="flex:1;min-width:0;padding-top:2mm">${tela('cronograma.png')}</div>
    </div>`, 4);
}

/* ── 5 · preço ────────────────────────────────────────────────────── */
function preco() {
  const cartao = (nome, de, por, periodo, cor, extra) => `
    <div class="vidro" style="--brilho:${cor};padding:8mm 7mm">
      <div class="conteudo">
        <div class="rotulo">${esc(nome)}</div>
        <div style="display:flex;align-items:center;gap:3mm;margin-top:4mm">
          <span class="numero" style="font-size:13pt;color:${COR.fantasma};text-decoration:line-through">${esc(de)}</span>
          <span class="mini">preço normal</span>
        </div>
        <div style="display:flex;align-items:baseline;gap:2.5mm;margin-top:2mm">
          <span class="numero" style="font-size:15pt;color:${cor}">R$</span>
          <span class="numero" style="font-size:38pt;color:${cor}">${esc(por)}</span>
          <span class="mini">${esc(periodo)}</span>
        </div>
        <div class="mini" style="margin-top:3mm">${esc(extra)}</div>
      </div>
    </div>`;
  return molde(`
    ${cabeca(MARCA, '04 · Preço',
    `<span class="selo" style="background:${COR.aviso}22;border:.3mm solid ${COR.aviso}55;color:${COR.aviso}">promoção de lançamento</span>`)}
    <div class="miolo">
    <h2 class="tit">O que a sua<br>audiência paga</h2>
    <p class="txt larga" style="margin-top:4.5mm">
      Os dois planos estão em preço de lançamento, e quem assina agora mantém o valor
      enquanto a assinatura ficar ativa. É o argumento mais forte para uma divulgação
      feita agora, e não daqui a seis meses.
    </p>
    <div class="grade g2" style="margin-top:7mm">
      ${cartao('Mensal', 'R$ 99', '30', 'por mês', COR.neon, 'sem fidelidade, cancela quando quiser')}
      ${cartao('Anual', 'R$ 799', '250', 'por ano', COR.neon2, 'sai por R$ 20,83 por mês')}
    </div>
    <div class="grade g2" style="margin-top:6mm">
      ${painel(COR.ok, 'garantia de 7 dias', 'Risco zero para quem compra pela sua indicação',
    `Se a pessoa não gostar, escreve dentro de sete dias e recebe <strong>100% do
     dinheiro de volta</strong>, sem precisar explicar o motivo. É o que você pode
     falar com tranquilidade no vídeo.`)}
      ${painel(COR.neon, 'sem barreira de entrada', 'Dá para testar antes de pagar',
    `O cronograma completo, o cronômetro e o registro de sessões são gratuitos.
     Quem clicar no seu link consegue usar o painel de verdade antes de decidir.`)}
    </div>
    </div>`, 5);
}

/* ── 6 · a parceria ───────────────────────────────────────────────── */
function parceria() {
  return molde(`
    ${cabeca(MARCA, '05 · A parceria')}
    <div style="display:flex;gap:9mm;flex:1;align-items:center">
      <div style="width:120mm;flex-shrink:0">
        <h2 class="tit">Como funciona<br>a nossa parte</h2>
        <p class="txt" style="margin-top:4.5mm;max-width:118mm">
          Sem contrato de exclusividade e sem pauta obrigatória. Você recebe um cupom
          seu, mostra a ferramenta do jeito que fizer sentido para o seu canal, e ganha
          por assinatura vendida.
        </p>
        <div class="grade g2" style="margin-top:6mm">
          ${painel(COR.neon2, 'comissão', `${CONDICOES.comissao} por assinatura`,
    `${esc(CONDICOES.comissaoTexto)}. O pagamento sai ${esc(CONDICOES.pagamento)}.`)}
          ${painel(COR.neon, 'cupom próprio', 'Um código com o seu nome',
    `Rastreável: dá para saber quantas contas vieram por ele. E ele pode liberar
     <strong>${esc(CONDICOES.testeAudiencia)} de plano completo</strong> para a sua
     audiência testar tudo antes de pagar.`)}
          ${painel(COR.ok, 'seu acesso', 'Você usa de graça',
    `${esc(CONDICOES.acessoCriador)} na sua conta, para você falar da ferramenta
     usando a ferramenta. Ninguém indica bem o que não usou.`)}
          ${painel(COR.aviso, 'material pronto', 'Arte e roteiro se você quiser',
    `Capturas em alta resolução, ícone, cores da marca e uma lista dos pontos que mais
     convertem. Usar é opcional: o texto é seu.`)}
        </div>
      </div>
      <div style="flex:1;min-width:0;display:flex;justify-content:center;padding-top:6mm;
        transform:perspective(1500px) rotateY(-12deg)">
        ${fone('celular-hoje.png', '58mm')}
      </div>
    </div>`, 6);
}

/* ── 7 · formatos ─────────────────────────────────────────────────── */
function formatos() {
  const item = (n, cor, titulo, texto) => `
    <div style="display:flex;gap:4mm;align-items:flex-start">
      <div style="flex-shrink:0;width:9mm;height:9mm;border-radius:2.4mm;display:flex;
        align-items:center;justify-content:center;background:${cor}22;border:.3mm solid ${cor}55;
        font-family:'JetBrains Mono',monospace;font-size:8pt;font-weight:700;color:${cor}">${esc(n)}</div>
      <div>
        <div style="font-size:10pt;font-weight:700;color:${COR.tinta};margin-bottom:1.5mm">${esc(titulo)}</div>
        <div class="mini" style="line-height:1.6;color:${COR.meio}">${texto}</div>
      </div>
    </div>`;
  return molde(`
    ${cabeca(MARCA, '06 · Conteúdo')}
    <div class="miolo">
    <h2 class="tit">O que costuma<br>funcionar</h2>
    <p class="txt larga" style="margin-top:4.5mm">
      Sugestões, não exigências. O que mais engaja no nosso caso é mostrar a tela
      resolvendo um problema que a audiência tem hoje, e não uma lista de recursos.
    </p>
    <div class="grade g2" style="margin-top:7mm;gap:6mm">
      ${item('01', COR.neon, 'Stories mostrando a sua semana', 'Abra a aba Rotina com o seu plantão de verdade e mostre onde sobra tempo. Funciona porque é o problema real de quem está no internato.')}
      ${item('02', COR.neon2, 'Reels do "o que estudar hoje"', 'A tela Hoje com as revisões vencendo responde em cinco segundos. É a demonstração mais curta que existe da ferramenta.')}
      ${item('03', COR.ok, 'Vídeo de organização de estudo', 'Encaixe o painel dentro de um vídeo que você já faria sobre método. A ferramenta aparece como meio, não como assunto.')}
      ${item('04', COR.aviso, 'Post do ciclo clínico', 'Mostrar que dá para usar antes do cursinho abre um público que ainda não se vê como concurseiro.')}
      ${item('05', COR.CL, 'Sala de amigos com a audiência', 'Crie uma sala e chame quem te acompanha. O ranking dá motivo para voltar no dia seguinte.')}
      ${item('06', COR.GO, 'Cupom de teste no fim', 'Sete dias liberados tiram o atrito da decisão e deixam o resultado da campanha muito mais fácil de medir.')}
    </div>
    </div>`, 7);
}

/* ── 8 · como começar e contato ───────────────────────────────────── */
function comecar() {
  return `<section class="pg">
  <div class="fundo"><div class="malha"></div><div class="aura aura-a"></div>
    <div class="aura aura-b"></div><div class="aura aura-c"></div>
    <div class="base-luz"></div><div class="fio-topo"></div></div>

  <div style="position:absolute;right:-30mm;bottom:-30mm;z-index:1">
    <div style="position:relative;width:120mm;height:120mm">
      <div class="anel" style="inset:0"></div>
      <div class="anel" style="inset:18mm;border-color:${COR.neon}44"></div>
      <div class="esfera" style="position:absolute;inset:34mm"></div>
    </div>
  </div>

  <div class="corpo">
    ${cabeca(MARCA, '07 · Começar')}
    <div style="display:flex;gap:10mm;flex:1;align-items:center">
      <div style="width:118mm;flex-shrink:0">
        <h2 class="tit">Quatro passos<br>e está no ar</h2>
        <div style="margin-top:7mm;display:flex;flex-direction:column;gap:5mm">
          ${passo(1, 'Escreva para a gente', `Manda um e-mail para <strong>${esc(SUPORTE)}</strong> com o seu perfil e onde você publica.`)}
          ${passo(2, 'Recebe o acesso e o cupom', `${esc(CONDICOES.acessoCriador)} na sua conta e um código com o seu nome, no mesmo dia.`)}
          ${passo(3, 'Use a ferramenta por uns dias', 'Sem pressa e sem roteiro. Quando você tiver opinião de verdade, a divulgação sai sozinha.')}
          ${passo(4, 'Publique do seu jeito', 'A gente acompanha quantas contas vieram pelo seu cupom e faz o repasse combinado.')}
        </div>
        <div class="vidro" style="--brilho:${COR.ok};padding:5mm;margin-top:7mm">
          <div class="conteudo mini" style="line-height:1.7;color:${COR.meio}">
            As condições desta proposta valem para o período de lançamento e podem ser
            ajustadas conversando. Se o seu formato for diferente do que está aqui,
            escreva assim mesmo.
          </div>
        </div>
      </div>

      <div style="flex:1;min-width:0;display:flex;flex-direction:column;
        justify-content:center;gap:6mm;padding-top:4mm">
        <img src="${MARCA}" style="height:14mm;width:auto;filter:drop-shadow(0 0 6mm ${COR.neon2})">
        <div>
          <div class="rotulo" style="color:${COR.neon}">contato</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:13pt;color:${COR.tinta};margin-top:3mm">
            ${esc(SUPORTE)}
          </div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:11pt;color:${COR.meio};margin-top:2mm">
            ${esc(SITE)}
          </div>
        </div>
        <div style="display:flex;gap:9mm;margin-top:2mm">
          ${numero(CONDICOES.comissao, 'de comissão', COR.neon2, '18pt')}
          ${numero(CONDICOES.testeAudiencia.replace(' dias', 'd'), 'de teste', COR.neon, '18pt')}
          ${numero('7d', 'de garantia', COR.ok, '18pt')}
        </div>
      </div>
    </div>
  </div>
  ${rod(8)}
</section>`;
}

export function patrocinio() {
  return [capa(), oQueE(), numeros(), publico(), preco(), parceria(), formatos(), comecar()];
}
