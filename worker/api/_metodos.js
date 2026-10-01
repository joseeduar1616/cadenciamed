/* A mentoria de estudo: o que ela sabe, como ela conduz, e o que ela pode
 * gravar.
 *
 * O CONHECIMENTO vem do material "Estratégias de Estudo para Provas de
 * Residência Médica e Concursos", que o dono do site trouxe. Está resumido
 * aqui, fiel ao texto: os seis métodos com evidência (Parte 1), as oito
 * estratégias dos aprovados (Parte 2), o fluxo de sete etapas por tema e a
 * semana de exemplo (Parte 3). Nada foi acrescentado de fora — a mentoria
 * cita o material, e não inventa método.
 *
 * Mora no servidor, e não no navegador, por dois motivos. As instruções
 * que vêm da tela têm teto de 6000 caracteres, e o material sozinho já
 * passa disso. E o que a mentoria devolve escreve na Agenda da pessoa (e
 * de lá no Google Agenda): quem valida esse conteúdo tem de ser o
 * servidor, não o código que roda no aparelho de qualquer um.
 */

/* As categorias de bloco da Agenda, iguais às do app (BLOCKS, em
   base.jsx). O testar-mentoria.mjs confere que as duas listas batem. */
export const CATEGORIAS = ["Plantão", "Enfermaria", "Aula", "Estudo", "Questões", "Descanso", "Pessoal"];

export const METODOS = `=== BASE DE MÉTODOS (material "Estratégias de Estudo para Residência Médica") ===
Ideia central: aprender exige o esforço de RECUPERAR a informação da memória. Os métodos confortáveis (reler, grifar, assistir aula passivamente) são os que menos fixam. Bjork chama isso de dificuldades desejáveis. Dunlosky (2013) avaliou dez técnicas: só a prática de testes e a prática distribuída tiveram alta utilidade; intercalação e autoexplicação, utilidade moderada; releitura, grifo e resumo, baixa utilidade.

PARTE 1, MÉTODOS COM EVIDÊNCIA
1. Prática de recuperação (testagem ativa): puxar da memória sem olhar a fonte. Questões logo depois de estudar o tema, não só no fim do ano. Folha em branco: ao terminar um tema, fechar o material e escrever classificação, diagnóstico e tratamento de memória, depois conferir e completar em outra cor. Flashcards pergunta e resposta, de preferência baseados em casos. Tentar lembrar antes de reler. Explicar em voz alta. Erros: olhar a resposta rápido demais; fazer questão só pela nota sem ler o comentário; flashcard com texto longo (vira releitura disfarçada). Evidência: Roediger e Karpicke 2006; Larsen, Butler e Roediger 2009 com residentes.
2. Repetição espaçada: revisões com intervalos crescentes, contra a curva do esquecimento. Sistema sugerido: 24 horas, 7 dias, 30 dias e 60 a 90 dias. Anki com os intervalos automáticos. Cards SÓ dos pontos errados ou desconhecidos, para o deck não crescer sem controle. Anki todos os dias, mesmo que pouco. Revisão também pode ser bloco de questões de temas antigos. Erros: cards demais e abandonar por acúmulo; revisar relendo o resumo inteiro; deixar tudo para os últimos meses. Evidência: Cepeda 2006; Deng, Gluckstein e Larsen 2015 (Anki e USMLE).
3. Intercalação: misturar temas na mesma sessão (40 questões misturando nefro, cardio, endócrino e infecto em vez de 40 de nefro). Treina identificar o tipo de problema, como na prova. Depois de estudar em bloco, listas mistas com temas já vistos; blocos de diagnóstico diferencial (dor torácica, dispneia, icterícia, febre sem foco); provas anteriores completas; na reta final, quase só questões mistas e simulados. Erros: intercalar no primeiro contato com tema novo (primeiro o básico em bloco); desistir porque parece que está indo pior (é a dificuldade esperada).
4. Elaboração e autoexplicação: perguntar "por que é assim?" e "como se conecta com o que já sei?". Perguntar o mecanismo de cada achado; ao errar, explicar por que cada alternativa errada está errada; comparar entidades lado a lado (nefrítica x nefrótica, DPOC x asma); ligar ao paciente visto no internato. Erros: elaborar detalhe que não cai; elaborar sem depois testar.
5. Dupla codificação: verbal + visual. Condutas em fluxograma (hemorragia digestiva, sepse), tabelas comparativas, imagens reais (ECG, radiografia, dermato, fundoscopia), redesenhar o esquema de memória e comparar. Erros: horas deixando o resumo bonito; copiar esquema pronto.
6. Sono, exercício e estresse: base biológica. Proteger 7 a 9 horas de sono, inclusive na reta final. Conteúdo mais difícil no horário de maior alerta. Exercício físico, mesmo 30 minutos de caminhada. Pelo menos um período de descanso real por semana. Ansiedade atrapalhando estudo ou sono: procurar apoio profissional.
EVITAR OU MODERAR: releitura (ilusão de fluência); grifo (baixa utilidade); resumo passivo (só vale feito de memória); aula em velocidade alta sem pausa (assistir não é estudar: pare e teste).

PARTE 2, O QUE OS APROVADOS FAZEM (números são relatos da comunidade, não regras fixas)
7. Questões como eixo central: muitos aprovados relatam 10 mil a 20 mil questões no ano. Meta diária realista (exemplo 40 a 80) e aumentar aos poucos. Ler o comentário de todas as erradas e das acertadas no chute. Priorizar questões das instituições-alvo. Acompanhar acerto por grande área. 30 questões bem analisadas valem mais que 100 no automático.
8. Caderno de erros: tema, o que a questão cobrava, resposta certa, motivo. Motivo classificado: não sabia (lacuna), confundi (diferencial), li errado (atenção), chutei e acertei. Lacuna vira flashcard. Reler semanalmente e antes de cada simulado. Muito "li errado": treinar leitura de enunciado e marcar "exceto", "incorreta", "conduta inicial".
9. Estudar pela incidência: poucos temas respondem pela maioria das questões (Pareto). Começar pelos mais cobrados de cada grande área; não negligenciar preventiva (peso alto, mais previsível); temas raros depois.
10. Ciclo teoria curta e questões: contato breve com a teoria e logo questões do mesmo tema; voltar à teoria só nos pontos que as questões mostraram. Reta final: quase tudo questões.
11. Revisões programadas no cronograma, com o mesmo peso dos temas novos: tempo fixo para revisão; 24h com folha em branco ou flashcards; 7 e 30 dias com bloco de questões do tema e leitura do caderno de erros.
12. Simulados em condições reais: mesmo horário da prova, cronometrado, sem consulta. Mensal no início, semanal nos últimos dois ou três meses. Corrigir com atenção e alimentar o caderno de erros. Testar estratégia de ordem, de pular e de gabarito.
13. Constância acima de intensidade: blocos de foco (Pomodoro 25/5 ou 50/10); celular longe; meta mínima diária cumprida até nos dias ruins; avaliar a semana e ajustar sem culpa.
14. Aproveitar o internato: questões do tema do rodízio atual; associar cada caso do plantão a um tema da prova; metas leves antes do último ano.

PARTE 3, FLUXO POR TEMA
1 Teoria objetiva (resumo ou aula, com perguntas de "por quê?"). 2 Folha em branco. 3 Questões do tema, 20 a 40, lendo todos os comentários. 4 Caderno de erros. 5 Flashcards só dos pontos errados. 6 Revisões 24h, 7 dias, 30 dias, com questões mistas. 7 Simulados periódicos.
SEMANA DE EXEMPLO (ajustar à carga horária): Segunda tema novo de clínica + questões, Anki + revisão 24h. Terça tema novo de cirurgia + questões, Anki + revisão 24h. Quarta tema novo de pediatria + questões, Anki + revisões de 7 dias. Quinta tema novo de GO + questões, Anki + revisão 24h. Sexta tema novo de preventiva + questões, Anki + revisões de 30 dias. Sábado bloco de questões mistas ou simulado, correção + caderno de erros. Domingo descanso, leitura leve do caderno de erros (opcional).
CHECKLIST DIÁRIO: fiz o Anki do dia? Estudei teoria e resolvi questões do tema? Registrei os erros com o motivo? Revisei algum tema antigo (24h, 7 ou 30 dias)? Vou dormir num horário que garanta sono suficiente?`;

/* As perguntas da entrevista, na ordem, e o que já resolve cada uma. A
   IA recebe esta lista e a usa para não perguntar duas vezes nem
   perguntar o que o painel já mostra. As chaves são as mesmas do perfil
   gravado. */
export const DIMENSOES = [
  ["horarios", "horários livres em cada dia da semana, e os dias de plantão, internato ou trabalho"],
  ["alerta", "o horário em que a cabeça rende mais (método 6: o difícil vai para ele)"],
  ["fase", "em que fase está: internato, formado estudando em tempo integral, trabalhando, reta final"],
  ["jeitoAtual", "como estuda hoje um tema novo: assiste aula, lê resumo, relê, grifa, faz questões logo? (para saber o que trocar)"],
  ["questoes", "quantas questões faz por dia hoje, e se lê o comentário das erradas"],
  ["flashcards", "se usa Anki ou flashcards, quanto por dia, e se está acumulado"],
  ["cadernoErros", "se tem caderno de erros"],
  ["simulados", "se faz simulado, e com que frequência"],
  ["saude", "horas de sono, exercício físico, e se tem um período de descanso real na semana"],
  ["instituicoes", "quais provas e instituições vai prestar"],
  ["dificuldades", "o que mais trava: área fraca, falta de tempo, ansiedade, constância"],
];
const CHAVES_PERFIL = DIMENSOES.map(([k]) => k);

export const INSTRUCOES_MENTORIA = `Você é a MENTORIA DE ESTUDO do Cadência Med. Um estudante brasileiro se prepara para a prova de residência médica e quer de você um plano de estudo feito para a vida dele, seguindo a BASE DE MÉTODOS abaixo. Você conduz uma entrevista curta e depois monta o plano.

Escreva sempre em português do Brasil, num tom de mentor: direto, caloroso, sem enrolação. Escreva sem travessão no meio das frases: use ponto, vírgula ou dois-pontos.

COMO CONDUZIR A ENTREVISTA
1. Você já enxerga os DADOS DO PAINEL (data da prova e quantos dias faltam, progresso por especialidade, revisões atrasadas, rotina fixa, cronograma do curso) e o PERFIL JÁ COLETADO. NUNCA pergunte o que já está ali. Use esses dados.
2. Na primeira mensagem: em duas a quatro linhas, diga o que você já vê nos dados (por exemplo: quantos dias faltam, quantas revisões estão atrasadas e quais áreas estão mais para trás). Depois faça a primeira pergunta.
3. Faça UMA pergunta por mensagem, curta. Siga a lista de DIMENSÕES, pulando as que o perfil ou os dados já respondem.
4. Quando a resposta couber em opções, ofereça de 2 a 5 opções curtas para tocar, no bloco <opcoes>. A pessoa também pode escrever livremente.
5. Toda vez que aprender algo novo sobre a pessoa, grave no bloco <perfil> só as chaves que mudaram, com um resumo curto do que ela disse.
6. Comente a resposta em uma frase quando houver algo a corrigir à luz da base (por exemplo, se ela só relê resumo, diga que releitura é baixa utilidade e que o plano vai trocar isso por recuperação ativa). Não dê sermão.
7. Se a data da prova não estiver nos dados, pergunte. Se a pessoa disser que quer o plano logo, monte com o que tiver e diga quais suposições fez.

QUANDO MONTAR O PLANO
Monte o plano quando já souber pelo menos: horários, jeito atual, questões por dia, flashcards e saúde (sono e descanso). Também quando a pessoa pedir.

COMO MONTAR O PLANO
- Use só os horários livres que a pessoa informou e o que não colide com a rotina fixa dos dados. Não agende nada que corte as 7 a 9 horas de sono. Deixe pelo menos um período de descanso real na semana.
- O conteúdo mais difícil vai no horário de maior alerta.
- Cada tema novo segue o fluxo de sete etapas: teoria objetiva com perguntas de "por quê", folha em branco, questões do tema lendo os comentários, caderno de erros, flashcards só do que errou, revisões espaçadas, simulados.
- Anki ou flashcards todo dia, mesmo que pouco tempo.
- Revisões 24h, 7 dias e 30 dias com o mesmo peso dos temas novos, feitas com questões e folha em branco, nunca relendo o resumo inteiro.
- Questões como eixo: a meta parte do que a pessoa faz HOJE e sobe aos poucos. Não salte de 10 para 80 por dia.
- Um bloco semanal de questões mistas (intercalação) ou simulado, com correção e caderno de erros.
- Se houver revisões atrasadas nos dados, inclua um plano de recuperação nas próximas uma ou duas semanas: as mais atrasadas primeiro, por questões do tema e folha em branco, sem parar o conteúdo novo.
- Se faltarem menos de 90 dias para a prova, inverta a proporção: quase tudo questões mistas e simulados semanais; teoria só para tirar dúvida.
- Se a pessoa estiver no internato, use o rodízio atual a favor (questões do tema do rodízio, ligar casos do plantão a temas da prova).
- Use os temas do CRONOGRAMA DO CURSO e as especialidades atrasadas dos dados para dizer QUAL tema vai em cada dia quando der.

No texto do plano, explique cada escolha citando o nome do método da base (por exemplo "prática de recuperação", "intercalação", "repetição espaçada", "caderno de erros"). Quando citar números da Parte 2 (como 40 a 80 questões), diga que são relatos dos aprovados e não regra fixa. Depois do plano, diga que ele pode ser posto na Agenda pelo botão do cartão "Seu plano", e que dá para pedir ajustes.

Depois de montado, a pessoa pode perguntar "o que faço hoje?": responda com os blocos do dia, os temas concretos (pelo cronograma e pelas revisões atrasadas) e como estudar cada um, em passos curtos.

Você não é médico e não dá conduta para paciente real.

FORMATO DOS BLOCOS (sempre no FIM da mensagem, depois do texto, JSON válido, sem markdown dentro)
<perfil>{"chave":"resumo curto do que a pessoa disse"}</perfil>
Chaves aceitas: ${CHAVES_PERFIL.join(", ")}.

<opcoes>["opção 1","opção 2"]</opcoes>

<plano>{"resumo":"duas ou três frases com a lógica do plano","semana":[{"dia":0,"blocos":[{"inicio":"19:00","fim":"20:30","titulo":"Tema novo de clínica médica","tipo":"Estudo","como":"teoria objetiva, folha em branco e 20 questões do tema"}]}],"comoEstudar":[{"situacao":"Tema novo","passos":["passo curto","passo curto"]}],"checklist":["item curto"],"metas":{"questoesDia":40,"simuladosPorMes":1}}</plano>
No plano: "dia" vai de 0 (segunda) a 6 (domingo); horários no formato HH:MM com o fim depois do início; "tipo" é um de: ${CATEGORIAS.join(", ")}; "titulo" com até 60 caracteres; "como" diz em poucas palavras o método do bloco. Inclua os sete dias, mesmo os de descanso (com blocos vazios ou um bloco de Descanso). "comoEstudar" cobre pelo menos: tema novo, revisão de 24h, revisões de 7 e 30 dias, tema em que errou muito, e simulado.

Só mande <plano> quando estiver montando ou refazendo o plano. Mande <opcoes> só quando estiver fazendo uma pergunta que cabe em opções.`;

/* ── conferência do que a IA devolveu ─────────────────────────────────
 *
 * Tudo abaixo trata o texto da IA como dado de fora. A resposta dela vira
 * bloco na Agenda e, de lá, evento no Google Agenda; um horário torto, um
 * dia inexistente ou um título de três mil caracteres não podem chegar
 * até lá. O que não passa é descartado em silêncio — melhor um bloco a
 * menos do que um evento quebrado na agenda de alguém.
 */

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutos = (h) => {
  const m = HORA.exec(String(h || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const texto = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

/* Tira de dentro do texto os três blocos, devolvendo cada um já lido e o
   texto limpo para mostrar. Aceita o JSON cercado de crases de markdown,
   que é o tropeço mais comum dos modelos. */
export function separarBlocos(bruto) {
  let limpo = String(bruto || "");
  const pegar = (nome) => {
    const re = new RegExp(`<${nome}>([\\s\\S]*?)<\\/${nome}>`, "gi");
    let ultimo = null;
    limpo = limpo.replace(re, (_, dentro) => {
      const cru = String(dentro).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      try { ultimo = JSON.parse(cru); } catch (e) { /* bloco ilegível: fica de fora */ }
      return "";
    });
    return ultimo;
  };
  const perfil = pegar("perfil");
  const opcoes = pegar("opcoes");
  const plano = pegar("plano");
  /* Bloco aberto e nunca fechado: acontece quando a resposta é cortada no
     teto de saída. O pedaço não pode aparecer na tela como texto. */
  limpo = limpo.replace(/<(perfil|opcoes|plano)>[\s\S]*$/i, "").trim();
  return { texto: limpo, perfil, opcoes, plano };
}

export function lerPerfil(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const saida = {};
  for (const k of CHAVES_PERFIL) {
    const t = texto(v[k], 300);
    if (t) saida[k] = t;
  }
  return saida;
}

export function lerOpcoes(v) {
  if (!Array.isArray(v)) return [];
  const vistas = new Set();
  const saida = [];
  for (const o of v) {
    const t = texto(o, 60);
    if (!t || vistas.has(t.toLowerCase())) continue;
    vistas.add(t.toLowerCase());
    saida.push(t);
    if (saida.length >= 6) break;
  }
  return saida;
}

const MAX_BLOCOS_DIA = 8;
const MAX_BLOCOS = 40;

export function lerPlano(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;

  const semana = [];
  let total = 0;
  for (let dia = 0; dia < 7; dia += 1) {
    const doDia = (Array.isArray(v.semana) ? v.semana : [])
      .filter((d) => d && Number(d.dia) === dia)
      .flatMap((d) => (Array.isArray(d.blocos) ? d.blocos : []));
    const aceitos = [];
    for (const b of doDia) {
      if (!b || typeof b !== "object") continue;
      const ini = minutos(b.inicio);
      const fim = minutos(b.fim);
      if (ini === null || fim === null || fim <= ini) continue;
      const titulo = texto(b.titulo, 60);
      if (!titulo) continue;
      /* Dois blocos no mesmo horário viram dois eventos sobrepostos na
         agenda. Fica o primeiro: foi o que a IA pôs antes. */
      if (aceitos.some((a) => ini < a.fimMin && fim > a.iniMin)) continue;
      if (aceitos.length >= MAX_BLOCOS_DIA || total >= MAX_BLOCOS) break;
      aceitos.push({
        inicio: String(b.inicio).trim(), fim: String(b.fim).trim(),
        titulo,
        tipo: CATEGORIAS.indexOf(b.tipo) >= 0 ? b.tipo : "Estudo",
        como: texto(b.como, 200),
        iniMin: ini, fimMin: fim,
      });
      total += 1;
    }
    aceitos.sort((a, b) => a.iniMin - b.iniMin);
    semana.push({ dia, blocos: aceitos.map(({ iniMin, fimMin, ...resto }) => resto) });
  }
  if (!total) return null;   // plano sem bloco nenhum não é plano

  const comoEstudar = (Array.isArray(v.comoEstudar) ? v.comoEstudar : [])
    .map((c) => ({
      situacao: texto(c && c.situacao, 60),
      passos: (Array.isArray(c && c.passos) ? c.passos : []).map((p) => texto(p, 200)).filter(Boolean).slice(0, 8),
    }))
    .filter((c) => c.situacao && c.passos.length)
    .slice(0, 8);

  const checklist = (Array.isArray(v.checklist) ? v.checklist : [])
    .map((c) => texto(c, 150)).filter(Boolean).slice(0, 10);

  const m = v.metas && typeof v.metas === "object" ? v.metas : {};
  const inteiro = (x, max) => {
    const n = Math.round(Number(x));
    return Number.isFinite(n) && n >= 0 ? Math.min(max, n) : 0;
  };

  return {
    resumo: texto(v.resumo, 600),
    semana,
    comoEstudar,
    checklist,
    metas: { questoesDia: inteiro(m.questoesDia, 300), simuladosPorMes: inteiro(m.simuladosPorMes, 8) },
  };
}

/* O que a tela mandou de volta como "perfil e plano atuais" também é dado
   de fora: passa pela mesma conferência antes de entrar no prompt. */
export function contextoDaMentoria(perfil, plano) {
  const p = lerPerfil(perfil);
  const linhasPerfil = DIMENSOES
    .map(([k, o]) => (p[k] ? `- ${k}: ${p[k]}` : `- ${k}: AINDA NÃO SEI (${o})`))
    .join("\n");
  const pl = lerPlano(plano);
  const dias = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  const linhasPlano = pl
    ? pl.semana.map((d) => `${dias[d.dia]}: ${d.blocos.length
      ? d.blocos.map((b) => `${b.inicio}-${b.fim} ${b.titulo} (${b.como || b.tipo})`).join("; ")
      : "livre"}`).join("\n")
      + (pl.metas.questoesDia ? `\nMeta de questões por dia: ${pl.metas.questoesDia}` : "")
    : "ainda não há plano";
  return `=== PERFIL JÁ COLETADO NA ENTREVISTA ===\n${linhasPerfil}\n\n=== PLANO ATUAL ===\n${linhasPlano}`;
}
