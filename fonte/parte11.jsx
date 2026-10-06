/* ═══════════════════════════════════════════════════════════════════
   24 · ASSINATURA
   O plano fica em assinaturas/{uid}, uma coleção que o app só consegue
   LER. Quem escreve ali é a função de compra, no servidor, com uma conta
   de serviço. Assim ninguém se promove a assinante mexendo no navegador.
   ═══════════════════════════════════════════════════════════════════ */

/* O "de" é um preço cheio que fica riscado ao lado do que está sendo
   cobrado. Está vazio de propósito, e o motivo importa: riscar um valor
   que nunca foi cobrado de ninguém é propaganda enganosa — e, mesmo que
   não fosse, "de R$ 799 por R$ 250" em produto recém-lançado não passa a
   impressão de oferta, passa a de que o preço cheio foi inventado.
   Desconto de lançamento se faz com CUPOM, que já existe aqui: o preço de
   tabela continua sendo um só, e quem entra com cupom paga menos sem que o
   valor do produto seja desmentido na própria vitrine.

   Se algum dia houver preço antigo de verdade, basta devolver o "de" ao
   plano: a tela volta a riscar e a mostrar a tarja de promoção sozinha. */
const PROMO = "Promoção de lançamento";

/* O anual sai por menos de oito mensalidades — desconto grande de
   propósito, para empurrar a escolha para ele. A conta que justifica:
   descontada a taxa da Kiwify, um anual deixa R$ 270,54 de uma vez, e um
   mensal deixa R$ 33,00 por mês. O anual só perde para quem ficar mais de
   oito meses pagando mês a mês — e quem paga mês a mês cancela bem antes
   disso. Além do caixa adiantado, o anual paga a taxa fixa de transação
   uma vez por ano, contra doze do mensal. */
const PRECOS = {
  mensal: { rotulo: "Mensal", valor: "R$ 39", periodo: "por mês", chave: "mensal" },
  anual: {
    rotulo: "Anual", valor: "R$ 300", periodo: "por ano", chave: "anual",
    economia: "quatro meses de graça",
    /* A comparação que decide a escolha é esta, e não um preço riscado:
       quanto sai o mês pagando o ano inteiro, contra o plano mensal. */
    equivale: "R$ 25 por mês · contra R$ 39 no mensal",
  },
};

/* Garantia e suporte. Ficam aqui, junto do preço, porque é ao lado dele que
   os dois precisam aparecer — na tela de planos dentro do app e na página
   de entrada, que lê estas mesmas constantes. */
const GARANTIA_DIAS = 7;
/* A caixa de suporte, no domínio em que ela existe de verdade. Sem
   registro MX apontando para essa caixa, quem escrever recebe erro de
   entrega — e um endereço de suporte que devolve erro é pior do que não
   ter endereço nenhum, porque a pessoa acha que avisou. */
const EMAIL_SUPORTE = "suporte@cadenciamed.com";

/* O teste grátis. A conta nova tem o plano completo por 3 dias, sem
   cartão e sem cobrança: quem conta os dias é o servidor (fimDoTeste, em
   worker/api/_comum.js), a partir da criação da conta. Aqui é só o que a
   tela diz. */
const DIAS_TESTE = 3;
const PLANO_TESTE = "teste";

/* Quanto falta do teste, em palavras: "faltam 2 dias", "falta 1 dia",
   "faltam 5 h", "falta menos de 1 hora". */
function faltaDoTeste(ate, agora = Date.now()) {
  const ms = Number(ate) - agora;
  if (!(ms > 0)) return "acabou";
  if (ms < 3600000) return "falta menos de 1 hora";
  if (ms < 86400000) return `faltam ${Math.floor(ms / 3600000)} h`;
  const dias = Math.ceil(ms / 86400000);
  return dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`;
}
const diaDoFim = (ate) => {
  const d = new Date(Number(ate));
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/* Na hora de criar a conta: os 3 dias grátis e os preços, sem cobrar
   nada. A pessoa sabe desde o começo quanto custa continuar, e que não
   precisa de cartão para testar. */
function AvisoTesteGratis({ compacto }) {
  return (
    <div data-teste="aviso-teste-gratis" className="rounded-2xl px-4 py-4"
      style={{ background: soft("var(--ok)", 10), border: `1px solid ${soft("var(--ok)", 32)}` }}>
      <div className="flex items-center gap-2" style={{ color: T.ok, fontSize: 15, fontWeight: 700 }}>
        <Sparkles size={15} /> {DIAS_TESTE} dias grátis com todas as funções liberadas
      </div>
      <Mini style={{ marginTop: 6, lineHeight: 1.6 }}>
        Crie a conta e use todas as funções do site, sem exceção, por {DIAS_TESTE} dias:
        cartões, revisões, assistente, provas, agenda e o resto. Nada é cobrado agora e não
        pede cartão. Depois você decide se assina; se não assinar, a conta continua
        na versão gratuita, com tudo o que você anotou.
      </Mini>
      <div className={`mt-3 grid gap-2 ${compacto ? "grid-cols-1" : "grid-cols-2"}`}>
        {["mensal", "anual"].map((k) => {
          const p = PRECOS[k];
          return (
            <div key={k} className="rounded-xl px-3 py-2.5" style={{ background: T.card2, border: `1px solid ${T.line}` }}>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span style={{ fontSize: 13, color: T.dim, fontWeight: 600 }}>{p.rotulo}</span>
                <span>
                  <span style={{ fontFamily: F_MONO, fontSize: 17, fontWeight: 700, color: k === "anual" ? "var(--neon2)" : T.ink }}>{p.valor}</span>
                  <span style={{ fontSize: 12, color: T.faint }}> {p.periodo}</span>
                </span>
              </div>
              {p.equivale ? <Mini style={{ marginTop: 2, fontSize: 12 }}>{p.equivale}</Mini> : null}
            </div>
          );
        })}
      </div>
      <Mini style={{ marginTop: 8, fontSize: 12 }}>
        Você só paga se decidir assinar depois do teste.
      </Mini>
    </div>
  );
}

/* Links de checkout da Kiwify ou Hotmart. Trocar pelos seus. */
const CHECKOUT = (typeof window !== "undefined" && window.CADENCIA_CHECKOUT) || {
  mensal: "", anual: "",
};

const RECURSOS_PRO = {
  cartoes: "Seus próprios flashcards, com repetição espaçada",
  estudo: "Estudo interativo: seu material vira aula em slides, com perguntas que a IA corrige",
  revisoes: "A escada de revisão espaçada, com os prazos de cada aula",
  temas: "O cronograma por especialidade, com o radar das áreas",
  rotina: "Agenda da semana e do dia, com o Google Agenda junto",
  simulados: "Comparar acerto de simulado com quem estuda com você",
  amigos: "Salas com seus amigos e ranking de horas, questões e acerto",
  metas: "Simulados, provas resolvidas, hábitos e exportação da agenda",
  nuvem: "Seus dados sincronizados em todos os aparelhos",
  projecao: "Ritmo e projeção até a prova",
};
const ABAS_PRO = ["cartoes", "estudo", "revisoes", "temas", "rotina", "amigos", "metas", "simulados"];

/* Abas que só o administrador enxerga. O servidor faz a mesma checagem,
   então esconder aqui é conveniência, não é o que protege. */
const ABAS_DONO = ["assistente", "treino", "financeiro"];

/* Conta do dono: acesso completo sem precisar assinar. O servidor faz a
   mesma verificação, então isso não é um atalho que outra pessoa consiga
   usar mudando o navegador. */
const DONOS = ["joseeduardo1616@gmail.com"];
const ehDono = (u) => !!(u && u.email && DONOS.indexOf(String(u.email).toLowerCase()) >= 0);

const ROTA_PLANO = "/api/plano";

/* Qual é o plano de quem está logado.
 *
 * São duas fontes, e isso é de propósito.
 *
 * A leitura direta do Firestore é a que avisa na hora, sem precisar
 * perguntar de novo: assim que a assinatura é gravada, a tela muda. Mas ela
 * depende das regras publicadas liberarem a leitura do próprio documento.
 * Quando não liberam, o Firestore recusa calado — e o resultado era o cupom
 * ser aceito, a assinatura existir, e o site continuar mostrando a tela de
 * pagamento sem uma palavra de explicação.
 *
 * Por isso quem decide é o servidor, em /api/plano, que lê com a conta de
 * serviço e responde certo mesmo com as regras erradas. O Firestore fica
 * como aviso de que algo mudou: quando ele fala, o servidor é consultado
 * de novo.
 *
 * Nada disso é o que protege o conteúdo pago — cada rota confere o acesso
 * por conta própria. Aqui é só o que a tela mostra. */
/* A regra padrão de cada aba, igual à do servidor (RECURSOS, em
   worker/api/_comum.js). Vale só enquanto o servidor não respondeu, e para
   quem está sem conta: o site abre sem login, e a barra de abas precisa de
   alguma coisa para desenhar. Quem manda é sempre a resposta do servidor.
   As duas listas não podem divergir, e é isso que o testar-recursos.mjs
   confere a cada build. */
const RECURSOS_PADRAO = {
  assistente: "pro", cartoes: "pro", revisoes: "pro", provas: "pro",
  cronograma: "todos", rotina: "todos", amigos: "todos", metas: "todos",
  desempenho: "todos", simulados: "todos", progresso: "todos",
  estudo: "pro", treino: "dono", financeiro: "dono",
};

/* A reserva, aplicando as regras padrão ao que a tela já sabe.
 *
 * Ela precisa levar em conta quem paga. Devolvendo só os padrões, como
 * fazia antes, uma queda de rede na hora de conferir o plano tirava as
 * abas pagas de quem assina — a pessoa pagou, abriu o site com a internet
 * oscilando, e os Cartões sumiram da barra. */
function recursosLocais(pro, dono) {
  const saida = {};
  for (const [id, regra] of Object.entries(RECURSOS_PADRAO)) {
    saida[id] = !!dono || regra === "todos" || (regra === "pro" && !!pro);
  }
  return saida;
}

function useAssinatura(sdk, usuario) {
  const [plano, setPlano] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");
  /* Quem vê o quê. Vem do servidor junto do plano, e não de uma lista
     escrita aqui: esconder uma aba no navegador não fecha nada, e era só
     isso que existia antes. Enquanto não chega é null — a barra espera,
     em vez de desenhar tudo e tirar abas na cara da pessoa. */
  const [recursos, setRecursos] = useState(null);
  /* O teste grátis desta conta já acabou (e ela não assinou). */
  const [testeAcabou, setTesteAcabou] = useState(false);

  const refSdk = useRef(sdk);
  refSdk.current = sdk;
  const quem = usuario ? usuario.uid : "";
  const dono = ehDono(usuario);

  const perguntar = useCallback(async () => {
    const s = refSdk.current;
    if (!s || !quem) { setPlano(null); setRecursos(null); setTesteAcabou(false); setCarregando(false); return; }

    let token = "";
    try {
      if (s.auth && s.auth.currentUser) token = await s.auth.currentUser.getIdToken();
    } catch (e) { /* sem token o servidor recusa, e o aviso aparece abaixo */ }
    if (!token) { setCarregando(false); return; }

    const { dados, erro } = await chamarApi(ROTA_PLANO, { token }, "A conferência do plano");
    setCarregando(false);
    if (erro) {
      /* Não derruba o que já estava valendo: uma falha de rede não pode
         trancar quem já estava com o acesso aberto nesta sessão.
         E o dono não fica de fora do próprio site por causa de uma queda
         do servidor — o que ele perde nesse caso é só a regra gravada, e
         quem confere isso de verdade é cada rota, no servidor. */
      setAviso(erro);
      if (dono) setPlano({ tipo: "dono", ate: Infinity });
      return;
    }
    setAviso("");
    setPlano(dados && dados.pro
      ? { tipo: dados.plano || "mensal", ate: Number(dados.validoAte) || Infinity }
      : null);
    setTesteAcabou(!!(dados && !dados.pro && dados.plano === PLANO_TESTE));
    if (dados && dados.recursos) setRecursos(dados.recursos);
  }, [quem, dono]);

  useEffect(() => { setCarregando(true); perguntar(); }, [perguntar]);

  /* O Firestore só avisa que mudou; quem responde o que mudou é o servidor.
     Se a leitura for recusada pelas regras, o erro fica registrado em vez de
     virar silêncio — mas o plano continua vindo do servidor. */
  useEffect(() => {
    if (!sdk || !quem || dono) return undefined;
    const ref = sdk.F.doc(sdk.db, "assinaturas", quem);
    let primeira = true;
    return sdk.F.onSnapshot(ref, () => {
      if (primeira) { primeira = false; return; }
      perguntar();
    }, (e) => {
      setAviso(`O navegador não conseguiu ler sua assinatura direto do banco${
        e && e.code === "permission-denied"
          ? " (as regras do Firestore não liberam essa leitura)" : ""
      }. O plano continua sendo conferido no servidor.`);
    });
  }, [sdk, quem, dono, perguntar]);

  /* O teste vence com o site aberto: na hora do fim, pergunta de novo ao
     servidor, para as abas pagas fecharem sem precisar recarregar. */
  useEffect(() => {
    if (!plano || plano.tipo !== PLANO_TESTE || !Number.isFinite(plano.ate)) return undefined;
    const falta = plano.ate - Date.now();
    if (falta > 2147483000) return undefined;
    const t = window.setTimeout(perguntar, Math.max(1000, falta + 2000));
    return () => window.clearTimeout(t);
  }, [plano, perguntar]);

  return {
    pro: !!plano, plano, carregando, aviso, recursos, recarregar: perguntar,
    emTeste: !!(plano && plano.tipo === PLANO_TESTE), testeAcabou,
  };
}

function Cadeado({ tamanho = 15 }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/* Garantia e endereço de suporte, num bloco só.
 *
 * São duas informações que sempre aparecem juntas e sempre ao lado do preço
 * — na tela de planos dentro do app e na página de entrada. Escrever o texto
 * duas vezes é o jeito de um dia mudar o prazo num lugar e esquecer o outro. */
function Garantia({ className = "px-6 py-6" }) {
  return (
    <Card className={className} brilho="var(--ok)">
      <H size={18} color="var(--ok)" icon={<Check size={16} />}>
        Garantia de {GARANTIA_DIAS} dias
      </H>
      <Texto style={{ marginTop: 10 }}>
        Assine, use tudo e veja se serve para você. Se não gostar, escreva
        dentro de {GARANTIA_DIAS} dias e devolvemos <strong style={{ color: T.ink }}>100% do
        dinheiro</strong>, sem precisar explicar o motivo.
      </Texto>
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <Mini>Suporte e pedidos de estorno:</Mini>
        <a href={`mailto:${EMAIL_SUPORTE}`}
          style={{ fontFamily: F_MONO, fontSize: 13.5, color: "var(--neon)", textDecoration: "none", borderBottom: `1px solid ${soft("var(--neon)", 45)}` }}>
          {EMAIL_SUPORTE}
        </a>
      </div>
    </Card>
  );
}

function Precos({ compacto, onFechar, usuario, plano, aviso, testeAcabou }) {
  const abrir = (tipo) => {
    const url = CHECKOUT[tipo];
    if (!url) return;
    const sep = url.indexOf("?") >= 0 ? "&" : "?";
    const extra = usuario && usuario.email ? `${sep}email=${encodeURIComponent(usuario.email)}` : "";
    window.open(url + extra, "_blank", "noopener");
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Quando a conferência do plano falha, quem já pagou vê a tela de
          pagamento e não entende. Dizer o motivo é melhor do que deixar a
          pessoa achando que o cupom não valeu. */}
      {aviso ? (
        <div className="rounded-2xl px-4 py-3"
          style={{ background: soft("var(--warn)", 12), border: `1px solid ${soft("var(--warn)", 28)}` }}>
          <Mini style={{ color: T.warn, lineHeight: 1.7 }}>{aviso}</Mini>
        </div>
      ) : null}
      {!compacto ? (
        <div style={{ padding: "48px 0 40px", position: "relative" }}>
          <img src={MARCA} alt="" width="176" height="86" className="marca"
            style={{ display: "block", marginBottom: 22, width: 176, height: "auto" }} />
          <div style={{
            fontFamily: F_MONO, fontSize: 10, letterSpacing: "0.32em",
            textTransform: "uppercase", color: "var(--neon)", marginBottom: 18,
          }}>Preparação para residência médica</div>
          <h2 style={{
            fontFamily: F_UI, fontSize: "clamp(30px, 5.4vw, 58px)", fontWeight: 300,
            margin: 0, color: T.ink, lineHeight: 1.1, letterSpacing: "-0.02em", maxWidth: 760,
          }}>
            O cronograma inteiro,<br />
            <span style={{ fontWeight: 500 }}>organizado num lugar só</span>
          </h2>
          <p style={{ color: T.dim, fontSize: 16, lineHeight: 1.7, marginTop: 22, maxWidth: 470 }}>
            Todas as aulas e tópicos para marcar, revisão espaçada, flashcards
            seus, cronômetro e acompanhamento por especialidade.
          </p>
        </div>
      ) : null}

      {plano && plano.tipo === PLANO_TESTE ? (
        <div data-teste="planos-em-teste"><Card className="px-6 py-6" brilho="var(--ok)">
          <H size={18} color="var(--ok)" icon={<Sparkles size={16} />}>
            Teste grátis: {faltaDoTeste(plano.ate)}
          </H>
          <Texto style={{ marginTop: 10 }}>
            Todas as funções estão liberadas de graça até {diaDoFim(plano.ate)}. Nada foi
            cobrado. Para continuar com tudo depois disso, escolha um plano abaixo; se não
            escolher, a conta volta para a versão gratuita, sem perder o que você anotou.
          </Texto>
        </Card></div>
      ) : testeAcabou ? (
        <div data-teste="planos-teste-acabou"><Card className="px-6 py-6" brilho="var(--warn)">
          <H size={18} color="var(--warn)" icon={<Sparkles size={16} />}>Seu teste grátis acabou</H>
          <Texto style={{ marginTop: 10 }}>
            Os {DIAS_TESTE} dias com todas as funções liberadas terminaram. Seus dados continuam
            aqui, na versão gratuita. Para voltar a usar tudo, escolha um plano.
          </Texto>
        </Card></div>
      ) : null}

      {plano && plano.tipo === "dono" ? (
        <Card className="px-6 py-6" brilho="var(--ok)">
          <H size={18} color="var(--ok)" icon={<Check size={16} />}>Acesso completo</H>
          <Texto style={{ marginTop: 10 }}>
            Esta é a conta do dono do site, com todos os recursos liberados
            permanentemente e sem cobrança.
          </Texto>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {["mensal", "anual"].map((k) => {
          const p = PRECOS[k];
          const destaque = k === "anual";
          const atual = plano && plano.tipo === k;
          return (
            <Card key={k} className="px-6 py-7" brilho={destaque ? "var(--neon2)" : undefined} tilt
              style={destaque ? { borderColor: soft("var(--neon2)", 45) } : undefined}>
              {destaque ? (
                <div className="inline-flex rounded-full px-3 py-1" style={{ background: soft("var(--neon2)", 20), color: "var(--neon2)", fontSize: 12, fontWeight: 700 }}>
                  {p.economia}
                </div>
              ) : null}
              <div style={{ marginTop: destaque ? 14 : 0 }}>
                <Label>{p.rotulo}</Label>
                {p.de ? (
                  <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                    <span style={{ fontFamily: F_MONO, fontSize: 15, color: T.faint, textDecoration: "line-through" }}>{p.de}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: T.warn, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {PROMO}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-baseline gap-2" style={{ marginTop: 6 }}>
                  <Num size={38} weight={700} color={destaque ? "var(--neon2)" : T.ink}>{p.valor}</Num>
                  <Mini>{p.periodo}</Mini>
                </div>
                {p.equivale ? <Mini style={{ marginTop: 6 }}>{p.equivale}</Mini> : null}
                {destaque ? <Mini style={{ marginTop: 4 }}>válido até 31/12/2027</Mini> : null}
              </div>
              <div className="mt-5">
                {atual ? (
                  <div className="rounded-full px-4 py-3 text-center" style={{ background: soft("var(--ok)", 16), color: T.ok, fontSize: 14.5, fontWeight: 700 }}>
                    Seu plano atual
                  </div>
                ) : CHECKOUT[k] ? (
                  <Btn tone={destaque ? "primary" : "quiet"} className="w-full" onClick={() => abrir(k)}>
                    Assinar {p.rotulo.toLowerCase()} <ArrowUpRight size={16} />
                  </Btn>
                ) : (
                  /* Falta o link de pagamento. Quem visita não tem nada a ver
                     com isso e só precisa saber que ainda não dá para assinar;
                     o recado técnico é para o dono, que é quem resolve. */
                  <div className="rounded-full px-4 py-3 text-center" style={{ background: T.card2, color: T.faint, fontSize: 14 }}>
                    {ehDono(usuario) ? "falta colar o link em CADENCIA_CHECKOUT" : "em breve"}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Garantia />

      <Card className="px-6 py-6">
        <Label>O que entra no plano</Label>
        <div className="mt-4 flex flex-col gap-3">
          {Object.values(RECURSOS_PRO).map((r) => (
            <div key={r} className="flex items-start gap-3">
              <span className="flex items-center justify-center rounded-full" style={{ width: 22, height: 22, background: soft("var(--ok)", 18), color: T.ok, flexShrink: 0, marginTop: 1 }}>
                <Check size={13} strokeWidth={3} />
              </span>
              <span style={{ fontSize: 14.5, color: T.dim, lineHeight: 1.5 }}>{r}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
          <Label>Continua de graça, para sempre</Label>
          <Mini style={{ marginTop: 8, lineHeight: 1.7 }}>
            O cronograma completo com todas as aulas e tópicos para marcar, o cronômetro com pomodoro e tempo corrido, o registro de
            sessões com questões e acertos, e o backup do seu arquivo. Nada do que
            você já anotou é perdido ou bloqueado.
          </Mini>
        </div>
      </Card>

      {/* O aviso de compra casa pagamento com conta pelo e-mail. Pagar com
          outro endereço é o jeito mais fácil de comprar e ficar sem acesso, e
          o lembrete só serve na hora de clicar em assinar — por isso ele
          aparece também para quem já está logado, dizendo qual e-mail é. */}
      {!usuario ? (
        <Card className="px-6 py-5" flat>
          <Mini style={{ lineHeight: 1.7 }}>
            Crie sua conta em Configurações antes de assinar, e use o mesmo e-mail
            na hora do pagamento. É assim que a assinatura é reconhecida. Conta
            nova ganha {DIAS_TESTE} dias grátis com todas as funções liberadas, sem cartão.
          </Mini>
        </Card>
      ) : !plano || plano.tipo === PLANO_TESTE ? (
        <Card className="px-6 py-5" flat>
          <Mini style={{ lineHeight: 1.7 }}>
            Pague com <strong style={{ color: T.dim }}>{usuario.email}</strong>, o
            mesmo e-mail desta conta. É por ele que a assinatura é reconhecida:
            com outro endereço, o pagamento não chega até aqui.
          </Mini>
        </Card>
      ) : null}

      {onFechar ? (
        <div className="flex justify-center">
          <Btn tone="outline" size="sm" onClick={onFechar}>voltar</Btn>
        </div>
      ) : null}
    </div>
  );
}

/* Tela que aparece no lugar de uma aba paga */
function Bloqueado({ recurso, onVerPlanos }) {
  return (
    <Card className="px-6 sm:px-10 py-12 text-center" brilho="var(--neon2)">
      <div className="flex justify-center" style={{ color: "var(--neon2)" }}>
        <span className="flex items-center justify-center rounded-full"
          style={{ width: 56, height: 56, background: soft("var(--neon2)", 16) }}>
          <Cadeado tamanho={24} />
        </span>
      </div>
      <h2 style={{ fontFamily: F_SERIF, fontSize: 24, fontWeight: 400, margin: "18px 0 0", color: T.ink }}>
        Recurso do plano completo
      </h2>
      <p style={{ color: T.dim, fontSize: 15, lineHeight: 1.65, marginTop: 10, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
        {recurso}
      </p>
      <div className="mt-7 flex justify-center">
        <Btn tone="primary" onClick={onVerPlanos}>Ver planos <ArrowUpRight size={16} /></Btn>
      </div>
      <Mini style={{ marginTop: 18 }}>
        {PRECOS.mensal.valor} por mês ou {PRECOS.anual.valor} por ano
        {PRECOS.mensal.de ? ` · ${PROMO.toLowerCase()}` : ""}
      </Mini>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   27 · PAINEL DO DONO
   Só aparece para o e-mail cadastrado em DONOS. A liberação em si é
   feita no servidor, que confere o token antes de gravar. Aqui é só a
   tela: quem pede, o servidor decide.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_ACESSOS = "/api/acessos";

function PainelDono({ nuvem, notify }) {
  const [lista, setLista] = useState(null);
  const [email, setEmail] = useState("");
  const [plano, setPlano] = useState("anual");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const chamar = useCallback(async (corpo) => {
    setErro("");
    let token = "";
    try {
      if (nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
        token = await nuvem.sdk.auth.currentUser.getIdToken();
      }
    } catch (e) { /* segue sem token, o servidor recusa */ }
    /* Atenção ao 404: a própria função responde 404 quando não acha conta
       com aquele e-mail, e aí vem JSON com a explicação. Só é "não
       publicado" quando o corpo não é JSON. Tratar os dois casos juntos
       escondia justamente o recado que resolve o problema. */
    const { dados, erro: falha } = await chamarApi(
      ROTA_ACESSOS, { ...corpo, token }, "O painel de acessos");
    if (falha) { setErro(falha); return null; }
    return dados;
  }, [nuvem]);

  const carregar = useCallback(async () => {
    setOcupado(true);
    const j = await chamar({ acao: "listar" });
    if (j && j.lista) setLista(j.lista);
    setOcupado(false);
  }, [chamar]);

  useEffect(() => { carregar(); }, [carregar]);

  const liberar = async () => {
    if (!email.trim()) return setErro("Escreva o e-mail.");
    setOcupado(true);
    const j = await chamar({ acao: "liberar", email: email.trim(), plano });
    if (j && j.ok) { notify(j.mensagem); setEmail(""); await carregar(); }
    setOcupado(false);
  };

  const revogar = async (alvo) => {
    setOcupado(true);
    const j = await chamar({ acao: "revogar", email: alvo });
    if (j && j.ok) { notify(j.mensagem); await carregar(); }
    setOcupado(false);
  };

  const concederMentor = async () => {
    if (!email.trim()) return setErro("Escreva o e-mail.");
    setOcupado(true);
    const j = await chamar({ acao: "conceder-mentor", email: email.trim() });
    if (j && j.ok) { notify(j.mensagem); setEmail(""); }
    setOcupado(false);
  };

  return (
    <Card className="px-6 py-6" brilho="var(--warn)">
      <H size={18} color="var(--warn)" icon={<User size={16} />}>Acessos</H>
      <Texto style={{ marginTop: 10 }}>
        Libere o plano completo para quem você quiser. A pessoa precisa ter
        criado a conta no site antes, com o mesmo e-mail.
      </Texto>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2">
          <Field label="E-mail da pessoa">
            <TextInput type="email" value={email} placeholder="pessoa@email.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") liberar(); }} />
          </Field>
        </div>
        <Field label="Por quanto tempo">
          <Select value={plano} onChange={(e) => setPlano(e.target.value)}>
            <option value="mensal">Um mês</option>
            <option value="anual">Um ano (até o fim de 2027)</option>
            <option value="vitalicio">Sem prazo</option>
          </Select>
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <Btn tone="primary" onClick={liberar} disabled={ocupado}>
          {ocupado ? "Aguarde…" : "Liberar acesso"}
        </Btn>
        <Btn tone="outline" onClick={concederMentor} disabled={ocupado} title="Dá o papel de mentor para esse e-mail, sem mexer no plano dele">
          <GraduationCap size={15} /> Tornar mentor(a)
        </Btn>
        <Btn tone="outline" size="sm" onClick={carregar} disabled={ocupado}>
          <RefreshCw size={14} /> atualizar lista
        </Btn>
        {erro ? <span style={{ fontSize: 14, color: T.bad }}>{erro}</span> : null}
      </div>

      <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between">
          <Label>Quem tem acesso</Label>
          {lista ? <Mini>{lista.length}</Mini> : null}
        </div>

        {lista === null ? (
          <Mini style={{ marginTop: 12 }}>carregando…</Mini>
        ) : lista.length === 0 ? (
          <Mini style={{ marginTop: 12 }}>Ninguém liberado ainda.</Mini>
        ) : (
          <div className="mt-3 flex flex-col gap-1.5" style={{ maxHeight: 340, overflowY: "auto" }}>
            {lista.map((x) => {
              const ativo = x.validoAte > Date.now();
              const semPrazo = x.validoAte > Date.now() + 3650 * 86400000;
              return (
                <div key={x.uid} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: T.card2 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: 99, flexShrink: 0,
                    background: ativo ? T.ok : T.ghost,
                  }} />
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 14.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {x.email || x.uid}
                    </div>
                    <Mini style={{ marginTop: 1 }}>
                      {x.cortesia ? "cortesia" : "pagante"}
                      {x.plano ? ` · ${x.plano}` : ""}
                      {" · "}
                      {semPrazo ? "sem prazo" : ativo
                        ? `até ${brDate(toISO(new Date(x.validoAte)))}`
                        : "expirado"}
                    </Mini>
                  </div>
                  <Btn size="sm" tone="danger" onClick={() => revogar(x.email)} disabled={ocupado || !x.email}>
                    remover
                  </Btn>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
