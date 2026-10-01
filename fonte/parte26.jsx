/* ═══════════════════════════════════════════════════════════════════
   36 · MENTORIA DE ESTUDO

   Um modo do Assistente. A IA entrevista a pessoa sobre o jeito dela de
   estudar, e monta um plano: a semana, como estudar cada coisa, o
   checklist do dia. O conhecimento vem do material "Estratégias de
   Estudo para Residência Médica" — os seis métodos com evidência, as oito
   estratégias dos aprovados e o fluxo de sete etapas por tema — e mora no
   servidor (worker/api/_metodos.js), junto das instruções de como
   conduzir a entrevista.

   Três decisões que moldam esta tela.

   1. A entrevista NÃO depende da conversa. A rota só enxerga as últimas
      catorze mensagens, e uma entrevista com plano e ajustes passa disso;
      as primeiras respostas sumiriam e a mentoria perguntaria tudo de
      novo. Então cada coisa que a pessoa conta vira um campo do PERFIL,
      guardado na conta, e o perfil vai inteiro em toda chamada. A conversa
      é só o caminho; o que fica é o perfil e o plano.

   2. Ela não pergunta o que o painel já sabe. Data da prova, revisões
      atrasadas, progresso por especialidade, rotina fixa e o cronograma do
      curso vão junto, e a primeira mensagem dela já diz o que viu.

   3. Pôr o plano na Agenda é uma decisão da pessoa, com confirmação. Os
      blocos vão para a rotina e, se o Google Agenda estiver ligado, viram
      eventos que se repetem toda semana na agenda dela. Os blocos que ela
      mesma criou nunca são mexidos: os da mentoria levam uma marca de
      origem, e reaplicar um plano novo troca só esses.
   ═══════════════════════════════════════════════════════════════════ */

/* O que a entrevista quer saber, com o nome que aparece na tela. As
   chaves são as mesmas do servidor (DIMENSOES, em _metodos.js), e o
   testar-mentoria.mjs confere que as duas listas batem. */
const DIMENSOES_MENTORIA = [
  ["horarios", "Horários livres", "rotina"],
  ["compromissos", "Plantões e trabalho", "rotina"],
  ["sono", "Sono", "rotina"],
  ["alerta", "Horário de pico", "rotina"],
  ["brechas", "Brechas no dia", "rotina"],
  ["horasSemana", "Horas por semana", "rotina"],
  ["fase", "Fase", "momento"],
  ["instituicoes", "Provas-alvo", "momento"],
  ["historico", "Provas anteriores", "momento"],
  ["curso", "Cursinho", "momento"],
  ["jeitoAtual", "Jeito de estudar", "estudo"],
  ["materiais", "Materiais", "estudo"],
  ["foco", "Foco", "estudo"],
  ["questoes", "Questões", "pratica"],
  ["desempenho", "Desempenho", "pratica"],
  ["revisao", "Revisão", "pratica"],
  ["flashcards", "Flashcards", "pratica"],
  ["cadernoErros", "Caderno de erros", "pratica"],
  ["simulados", "Simulados", "pratica"],
  ["saude", "Corpo e descanso", "vida"],
  ["emocional", "Cabeça", "vida"],
  ["dificuldades", "O que trava", "vida"],
];
const SECOES_MENTORIA = [
  ["rotina", "Rotina e tempo"],
  ["momento", "Momento e objetivo"],
  ["estudo", "Como estuda hoje"],
  ["pratica", "Questões e revisão"],
  ["vida", "Corpo e cabeça"],
];

const DIAS_MENTORIA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

/* ── a conversa da entrevista, só neste aparelho ──────────────────────── */
const CHAVE_CONVERSA_MENTORIA = "cadencia:v3:mentoria-conversa";
const MAX_MSGS_MENTORIA = 40;

function lerConversaMentoria() {
  try {
    const v = JSON.parse(window.localStorage.getItem(CHAVE_CONVERSA_MENTORIA) || "[]");
    return Array.isArray(v)
      ? v.filter((m) => m && typeof m.texto === "string").slice(-MAX_MSGS_MENTORIA)
      : [];
  } catch (e) { return []; }
}
function guardarConversaMentoria(msgs) {
  try {
    window.localStorage.setItem(CHAVE_CONVERSA_MENTORIA,
      JSON.stringify(msgs.slice(-MAX_MSGS_MENTORIA).map((m) => ({ ...m, texto: m.texto.slice(0, 6000) }))));
  } catch (e) { /* sem espaço no aparelho: a conversa só não fica guardada */ }
}

const minutosDe = (h) => {
  const m = /^(\d{2}):(\d{2})$/.exec(String(h || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/* Segunda é 0, como na Agenda; o getDay do JavaScript começa no domingo. */
const diaDaSemana = (iso) => (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;

/* ── pôr o plano na Agenda ────────────────────────────────────────────
 *
 * Calculado ANTES de gravar, e não dentro do setData: a tela de
 * confirmação precisa mostrar o número exato do que vai acontecer — e é
 * melhor a pessoa ler "3 blocos ficaram de fora porque batem com o seu
 * plantão" antes de confirmar do que descobrir depois.
 */
function blocosParaAgenda(plano, routine) {
  const minhas = (routine || []).filter((b) => b && b.origem !== "mentoria");
  const novos = [];
  const colidiram = [];
  for (const d of (plano && plano.semana) || []) {
    for (const b of d.blocos || []) {
      const ini = minutosDe(b.inicio);
      const fim = minutosDe(b.fim);
      if (ini === null || fim === null || fim <= ini) continue;
      /* Um bloco da mentoria por cima de um bloco que a pessoa criou — um
         plantão, uma aula — fica de fora. A mentoria recebe a rotina e é
         instruída a desviar dela, mas quem garante é esta conta. */
      const bate = minhas.find((x) => Number(x.day) === d.dia
        && minutosDe(x.start) !== null && minutosDe(x.start) < fim && minutosDe(x.end) > ini);
      if (bate) { colidiram.push(`${DIAS_MENTORIA[d.dia]} ${b.inicio} (bate com "${bate.label}")`); continue; }
      novos.push({
        id: uid(), day: d.dia, label: b.titulo, type: b.tipo, start: b.inicio, end: b.fim,
        origem: "mentoria",
      });
    }
  }
  const diasDeEstudo = ((plano && plano.semana) || [])
    .filter((d) => (d.blocos || []).some((b) => b.tipo !== "Descanso" && b.tipo !== "Pessoal")).length;
  return { minhas, novos, colidiram, diasDeEstudo };
}

/* ── o cartão do plano ──────────────────────────────────────────────── */

function PlanoDaMentoria({ data, setData, today, notify, ocupado, perguntar }) {
  const m = data.mentoria || {};
  const plano = m.plano;
  const [confirmando, setConfirmando] = useState(false);
  const [ajustarMeta, setAjustarMeta] = useState(true);
  const [abertoComo, setAbertoComo] = useState(-1);
  if (!plano) return null;

  const hoje = diaDaSemana(today);
  const deHoje = (plano.semana[hoje] && plano.semana[hoje].blocos) || [];
  const feitos = (m.feitos && m.feitos[today]) || [];
  const daMentoriaNaAgenda = (data.routine || []).filter((b) => b && b.origem === "mentoria").length;
  const remarcadosHoje = (data.agenda || [])
    .filter((b) => b && b.origem === "pendente" && b.date === today)
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  const previa = blocosParaAgenda(plano, data.routine);
  const metaSemanal = plano.metas.questoesDia * Math.max(1, previa.diasDeEstudo);

  const marcar = (i) => setData((p) => {
    const mm = p.mentoria || {};
    const ja = (mm.feitos && mm.feitos[today]) || [];
    const novo = ja.indexOf(i) >= 0 ? ja.filter((x) => x !== i) : [...ja, i];
    return { ...p, mentoria: { ...mm, feitos: { ...(mm.feitos || {}), [today]: novo } } };
  });

  const aplicar = () => {
    const { minhas, novos, colidiram } = blocosParaAgenda(plano, data.routine);
    setData((p) => ({
      ...p,
      routine: [...minhas, ...novos],
      goals: ajustarMeta && plano.metas.questoesDia
        ? { ...p.goals, questions: metaSemanal }
        : p.goals,
      mentoria: { ...(p.mentoria || {}), aplicadoEm: Date.now() },
    }));
    setConfirmando(false);
    notify(colidiram.length
      ? `${novos.length} blocos foram para a Agenda. ${colidiram.length} ficaram de fora porque batiam com blocos seus.`
      : `${novos.length} blocos foram para a Agenda.`);
  };

  /* Os remarcados da mentoria (parte27) saem junto: um bloco "remarcado
     de segunda" de um plano que não está mais na Agenda não é de ninguém. */
  const tirar = () => {
    setData((p) => ({
      ...p,
      routine: (p.routine || []).filter((b) => !b || b.origem !== "mentoria"),
      agenda: (p.agenda || []).filter((b) => !b || !(b.origem === "pendente" && b.fonte === "mentoria")),
      rolagem: {
        ...(p.rolagem || {}),
        semLugar: ((p.rolagem && p.rolagem.semLugar) || []).filter((x) => x.fonte !== "mentoria"),
      },
      mentoria: { ...(p.mentoria || {}), aplicadoEm: 0 },
    }));
    notify("Os blocos da mentoria saíram da Agenda. Os seus continuam lá.");
  };

  const Bloco = ({ b, destaque }) => (
    <div className="flex items-start gap-3 rounded-xl px-3.5 py-2.5"
      style={{ background: destaque ? soft(BLOCKS[b.tipo] || "var(--warn)", 12) : T.card2 }}>
      <span style={{
        width: 8, height: 8, borderRadius: 99, marginTop: 7, flexShrink: 0,
        background: BLOCKS[b.tipo] || "var(--warn)",
      }} />
      <span className="flex-1 min-w-0">
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: T.ink }}>
          <span style={{ fontFamily: F_MONO, fontSize: 13, color: T.dim, marginRight: 8 }}>
            {b.inicio}–{b.fim}
          </span>
          {b.titulo}
        </span>
        {b.como ? <Mini style={{ marginTop: 3, lineHeight: 1.55 }}>{b.como}</Mini> : null}
      </span>
    </div>
  );

  return (
    <Card className="px-6 py-6" brilho="var(--ok)">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <H color="var(--ok)" icon={<ListChecks size={16} />}>Seu plano</H>
        {m.planoEm ? <Mini>montado em {brDate(new Date(m.planoEm).toISOString().slice(0, 10))}</Mini> : null}
      </div>
      {plano.resumo ? <Texto style={{ marginTop: 10 }}>{plano.resumo}</Texto> : null}

      {/* ── hoje, primeiro: é a pergunta de todo dia ─────────────────── */}
      <div className="mt-5">
        <Label style={{ color: T.ok }}>Hoje, {DIAS_MENTORIA[hoje].toLowerCase()}</Label>
        <div className="mt-2 flex flex-col gap-2">
          {deHoje.length
            ? deHoje.map((b, i) => <Bloco key={i} b={b} destaque />)
            : <Mini>Nada no plano para hoje. Se for o dia de descanso, aproveite: ele faz parte do método.</Mini>}
        </div>
        {remarcadosHoje.length ? (
          <div className="mt-3" data-teste="remarcados-hoje">
            <Mini style={{ fontWeight: 700, color: T.warn, marginBottom: 6 }}>Remarcados para hoje (ficaram para trás)</Mini>
            <div className="flex flex-col gap-1.5">
              {remarcadosHoje.map((b) => (
                <Bloco key={b.id} b={{
                  inicio: b.start, fim: b.end, titulo: b.label, tipo: b.type,
                  como: `era de ${brDate(b.de)}${Number(b.vezes) > 1 ? `, remarcado ${b.vezes} vezes` : ""}. Marque como cumprido na Agenda.`,
                }} />
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-3">
          <Btn size="sm" disabled={ocupado} onClick={() => perguntar("O que eu faço hoje? Diga os temas concretos e como estudar cada um.")}>
            O que eu faço hoje, em detalhe?
          </Btn>
        </div>
      </div>

      {/* ── checklist do dia, do material ───────────────────────────── */}
      {plano.checklist.length ? (
        <div className="mt-6">
          <Label>Checklist de hoje</Label>
          <div className="mt-2 flex flex-col gap-1.5">
            {plano.checklist.map((c, i) => {
              const on = feitos.indexOf(i) >= 0;
              return (
                <label key={i} className="flex items-start gap-3 rounded-xl px-3.5 py-2.5 toque-larg"
                  style={{ background: T.card2, cursor: "pointer" }}>
                  <input type="checkbox" checked={on} onChange={() => marcar(i)} style={{ marginTop: 3, flexShrink: 0 }} />
                  <span style={{ fontSize: 14.5, color: on ? T.faint : T.ink, textDecoration: on ? "line-through" : "none" }}>{c}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── a semana inteira ─────────────────────────────────────────── */}
      <div className="mt-6">
        <Label>A semana</Label>
        <div className="mt-2 flex flex-col gap-3">
          {plano.semana.map((d) => (
            <div key={d.dia}>
              <Mini style={{ fontWeight: 700, color: d.dia === hoje ? T.ok : T.dim, marginBottom: 6 }}>
                {DIAS_MENTORIA[d.dia]}{d.dia === hoje ? " · hoje" : ""}
              </Mini>
              <div className="flex flex-col gap-1.5">
                {d.blocos.length
                  ? d.blocos.map((b, i) => <Bloco key={i} b={b} />)
                  : <Mini style={{ paddingLeft: 4 }}>livre</Mini>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── como estudar cada coisa ──────────────────────────────────── */}
      {plano.comoEstudar.length ? (
        <div className="mt-6">
          <Label>Como estudar cada coisa</Label>
          <div className="mt-2 flex flex-col gap-2">
            {plano.comoEstudar.map((c, i) => (
              <div key={i} className="rounded-xl" style={{ background: T.card2 }}>
                <button type="button" onClick={() => setAbertoComo(abertoComo === i ? -1 : i)}
                  className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left"
                  aria-expanded={abertoComo === i}
                  style={{ background: "none", border: "none", cursor: "pointer", color: T.ink, fontFamily: F_UI }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600 }}>{c.situacao}</span>
                  <ChevronDown size={16} style={{
                    color: T.ghost, flexShrink: 0,
                    transform: abertoComo === i ? "rotate(180deg)" : "none", transition: "transform .2s",
                  }} />
                </button>
                {abertoComo === i ? (
                  <ol style={{ margin: 0, padding: "0 16px 14px 34px", color: T.dim, fontSize: 14, lineHeight: 1.65 }}>
                    {c.passos.map((p, j) => <li key={j} style={{ marginTop: j ? 4 : 0 }}>{p}</li>)}
                  </ol>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {plano.metas.questoesDia || plano.metas.simuladosPorMes ? (
        <div className="mt-6 flex gap-6 flex-wrap">
          {plano.metas.questoesDia ? (
            <div><Num size={22} weight={700} color="var(--a-CI)">{plano.metas.questoesDia}</Num><Mini style={{ marginTop: 3 }}>questões por dia</Mini></div>
          ) : null}
          {plano.metas.simuladosPorMes ? (
            <div><Num size={22} weight={700} color="var(--a-CI)">{plano.metas.simuladosPorMes}</Num><Mini style={{ marginTop: 3 }}>simulado{plano.metas.simuladosPorMes === 1 ? "" : "s"} por mês</Mini></div>
          ) : null}
        </div>
      ) : null}

      {/* ── pôr na Agenda, com confirmação ───────────────────────────── */}
      <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${T.line}` }}>
        {!confirmando ? (
          <div className="flex gap-2 flex-wrap items-center">
            <Btn size="sm" tone="primary" onClick={() => setConfirmando(true)} disabled={ocupado}>
              <CalendarDays size={14} /> {daMentoriaNaAgenda ? "Atualizar na Agenda" : "Pôr na minha Agenda"}
            </Btn>
            <Btn size="sm" disabled={ocupado}
              onClick={() => perguntar("Refaça o meu plano com base no que você já sabe de mim.")}>
              Refazer o plano
            </Btn>
            {daMentoriaNaAgenda ? (
              <Btn size="sm" tone="outline" onClick={tirar}>tirar da Agenda</Btn>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl px-4 py-4" style={{ background: soft("var(--neon)", 10), border: `1px solid ${soft("var(--neon)", 30)}` }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>
              {previa.novos.length} bloco{previa.novos.length === 1 ? "" : "s"} vão para a sua Agenda, repetindo toda semana.
            </div>
            <Mini style={{ marginTop: 8, lineHeight: 1.65 }}>
              Os blocos que você mesmo criou não são mexidos.
              {daMentoriaNaAgenda ? ` Os ${daMentoriaNaAgenda} blocos que a mentoria tinha posto antes são trocados por estes.` : ""}
              {" "}Se o Google Agenda estiver ligado, eles aparecem lá também.
            </Mini>
            {previa.colidiram.length ? (
              <Mini style={{ marginTop: 8, lineHeight: 1.65, color: T.warn }}>
                Ficam de fora {previa.colidiram.length}, porque batem com blocos seus: {previa.colidiram.join("; ")}.
              </Mini>
            ) : null}
            {plano.metas.questoesDia ? (
              <label className="mt-3 flex items-start gap-3" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={ajustarMeta} onChange={(e) => setAjustarMeta(e.target.checked)}
                  style={{ marginTop: 3, flexShrink: 0 }} />
                <Mini style={{ lineHeight: 1.6, color: T.ink }}>
                  Também ajustar a meta de questões da semana para {metaSemanal}
                  {" "}({plano.metas.questoesDia} por dia em {Math.max(1, previa.diasDeEstudo)} dias de estudo)
                </Mini>
              </label>
            ) : null}
            <div className="mt-4 flex gap-2 flex-wrap">
              <Btn size="sm" tone="primary" onClick={aplicar} disabled={!previa.novos.length}>Confirmar</Btn>
              <Btn size="sm" tone="outline" onClick={() => setConfirmando(false)}>cancelar</Btn>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ── a chamada de voz ─────────────────────────────────────────────────
 *
 * Uma ligação com a mentoria: ela fala, a pessoa responde falando, e o
 * ciclo segue sozinho até alguém encerrar. Tudo o que é dito entra na
 * mesma conversa escrita, então dá para alternar entre falar e digitar.
 *
 * OUVIR. O reconhecimento de fala do próprio navegador (Chrome, Edge,
 * Android, Safari): rápido, de graça, e mostra a legenda enquanto a pessoa
 * fala. Onde ele não existe (Firefox) ou falha por rede, a fala é gravada
 * e vai em áudio para o servidor, que a manda ao Gemini junto com o pedido
 * — uma ida só, que ouve e responde (ver _metodos.js, INSTRUCOES_AUDIO).
 *
 * FALAR. A síntese de voz do aparelho, em pt-BR, frase por frase: o Chrome
 * corta em silêncio uma fala longa depois de uns quinze segundos, e frase
 * curta não chega lá. Antes de falar o texto perde o markdown — asterisco
 * lido em voz alta é ruído.
 *
 * O microfone fica DESLIGADO enquanto a mentoria fala, senão ela ouviria a
 * si mesma. Para interromper, um toque.
 */
const reconhecedorDeFala = () => (typeof window !== "undefined"
  && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;

function textoParaFalar(md) {
  return String(md || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split(/\n+/)
    .map((l) => l
      .replace(/^\s{0,3}#{1,6}\s*/, "")
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
      .replace(/[*_`~>|]/g, "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
      .trim())
    .filter(Boolean)
    .map((l) => (/[.!?:;]$/.test(l) ? l : `${l}.`))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function frasesParaFalar(t) {
  const partes = String(t || "").match(/[^.!?]+[.!?]*\s*/g) || [];
  const saida = [];
  let atual = "";
  for (const p of partes) {
    if (atual && (atual + p).length > 220) { saida.push(atual.trim()); atual = p; } else atual += p;
  }
  if (atual.trim()) saida.push(atual.trim());
  return saida;
}

function vozBrasileira() {
  const ss = typeof window !== "undefined" && window.speechSynthesis;
  const vozes = (ss && ss.getVoices && ss.getVoices()) || [];
  const br = vozes.filter((v) => /^pt[-_]BR/i.test(v.lang));
  const pt = br.length ? br : vozes.filter((v) => /^pt/i.test(v.lang));
  for (const re of [/natural|neural|online/i, /google/i, /luciana|francisca|thalita|maria/i]) {
    const v = pt.find((x) => re.test(x.name));
    if (v) return v;
  }
  return pt[0] || null;
}

/* Fala o texto e chama aoFim quando acabar. Devolve como cancelar. Cada
   frase tem um prazo de segurança: em alguns aparelhos o "terminou" da
   síntese simplesmente não chega, e a ligação ficaria muda para sempre. */
function falarEmVoz(texto, aoFim) {
  const ss = window.speechSynthesis;
  const frases = frasesParaFalar(textoParaFalar(texto));
  if (!ss || typeof window.SpeechSynthesisUtterance !== "function" || !frases.length) {
    if (aoFim) aoFim();
    return () => {};
  }
  try { ss.cancel(); } catch (e) { /* segue */ }
  const voz = vozBrasileira();
  let cancelado = false;
  let i = 0;
  let prazo = null;
  const guardadas = [];   // sem referência, o Chrome às vezes descarta a fala no meio
  const proxima = () => {
    window.clearTimeout(prazo);
    if (cancelado) return;
    if (i >= frases.length) { if (aoFim) aoFim(); return; }
    const frase = frases[i++];
    const u = new window.SpeechSynthesisUtterance(frase);
    u.lang = "pt-BR";
    if (voz) u.voice = voz;
    u.rate = 1.05;
    u.onend = proxima;
    u.onerror = proxima;
    guardadas.push(u);
    prazo = window.setTimeout(proxima, Math.max(5000, frase.length * 110));
    ss.speak(u);
  };
  proxima();
  return () => { cancelado = true; window.clearTimeout(prazo); try { ss.cancel(); } catch (e) { /* segue */ } };
}

/* No iPhone a voz só sai se a PRIMEIRA fala começar dentro de um toque.
   A primeira resposta da mentoria chega depois de uma ida à rede, fora do
   toque, e ficaria muda. Uma fala vazia no próprio toque destrava o resto. */
function destravarVoz() {
  try {
    const ss = window.speechSynthesis;
    if (!ss || typeof window.SpeechSynthesisUtterance !== "function") return;
    const u = new window.SpeechSynthesisUtterance(" ");
    u.volume = 0;
    ss.speak(u);
  } catch (e) { /* segue: no resto dos navegadores não faz falta */ }
}

function blobEmBase64(blob) {
  return new Promise((ok, falhou) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result || "").split(",")[1] || "");
    r.onerror = () => falhou(r.error);
    r.readAsDataURL(blob);
  });
}

const ROTULO_ESTADO_VOZ = {
  iniciando: "Ligando…",
  ouvindo: "Ouvindo. Pode falar",
  pensando: "Pensando…",
  falando: "Falando…",
  pausado: "Em pausa",
};

function ChamadaDeVoz({ perguntar, temConversa, opcoes, aoEncerrar }) {
  const [estado, setEstado] = useState("iniciando");
  const [legenda, setLegenda] = useState("");
  const [resposta, setResposta] = useState("");
  const [aviso, setAviso] = useState("");
  const aberta = useRef(true);
  const estadoRef = useRef("iniciando");
  const pararFala = useRef(() => {});
  const escuta = useRef(null);        // { parar(), enviarJa() }
  const vazias = useRef(0);
  const usarGravacao = useRef(!reconhecedorDeFala());
  const microfone = useRef(null);
  const trava = useRef(null);
  const perguntarRef = useRef(perguntar);
  perguntarRef.current = perguntar;

  const mudar = (e) => { estadoRef.current = e; setEstado(e); };

  const pararEscuta = () => {
    const e = escuta.current;
    escuta.current = null;
    if (e) e.parar();
  };

  /* ── responder ───────────────────────────────────────────────────── */
  const enviar = async (texto, audio) => {
    pararEscuta();
    if (!aberta.current) return;
    setLegenda(texto || "");
    mudar("pensando");
    const j = await perguntarRef.current(texto, { voz: true, audio });
    if (!aberta.current) return;
    if (!j) { mudar("pausado"); setAviso("A mentoria não respondeu. Toque em Falar para tentar de novo."); return; }
    setLegenda("");
    setResposta(j.texto || "");
    mudar("falando");
    pararFala.current = falarEmVoz(j.texto || "", () => { if (aberta.current && estadoRef.current === "falando") ouvir(); });
  };

  const semFala = () => {
    if (!aberta.current || estadoRef.current !== "ouvindo") return;
    vazias.current += 1;
    if (vazias.current < 3) { ouvir(); return; }
    pararEscuta();
    mudar("pausado");
    setAviso("Não ouvi nada. Toque em Falar quando quiser responder.");
  };

  /* ── ouvir: reconhecimento do navegador ─────────────────────────── */
  const ouvirNoNavegador = () => {
    const R = reconhecedorDeFala();
    const rec = new R();
    rec.lang = "pt-BR";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    /* No Android o modo contínuo repete o que já foi dito a cada pedaço;
       lá cada fala é uma sessão, e o próprio aparelho decide o fim. */
    rec.continuous = !/Android/i.test(navigator.userAgent || "");
    let texto = "";
    let fim = false;
    let silencio = null;
    const concluir = () => {
      if (fim) return;
      fim = true;
      window.clearTimeout(silencio);
      try { rec.stop(); } catch (e) { /* já parou */ }
      const t = texto.trim();
      if (t) { vazias.current = 0; enviar(t); } else semFala();
    };
    rec.onresult = (ev) => {
      let t = "";
      for (let i = 0; i < ev.results.length; i += 1) t += ev.results[i][0].transcript;
      texto = t;
      setLegenda(t);
      window.clearTimeout(silencio);
      silencio = window.setTimeout(concluir, 1800);
    };
    rec.onerror = (ev) => {
      const e = ev && ev.error;
      if (e === "no-speech" || e === "aborted") return;
      fim = true;
      window.clearTimeout(silencio);
      if (e === "not-allowed" || e === "service-not-allowed") {
        mudar("pausado");
        setAviso("O navegador não liberou o microfone. Permita o microfone para este site e toque em Falar.");
      } else {
        /* "network" e afins: o reconhecimento do navegador depende de um
           serviço de fora. Sem ele, segue gravando e mandando o áudio. */
        usarGravacao.current = true;
        if (aberta.current) ouvirGravando();
      }
    };
    rec.onend = () => { if (!fim) concluir(); };
    escuta.current = {
      parar: () => { fim = true; window.clearTimeout(silencio); try { rec.abort(); } catch (e) { /* segue */ } },
      enviarJa: concluir,
    };
    try { rec.start(); } catch (e) { usarGravacao.current = true; ouvirGravando(); }
  };

  /* ── ouvir: gravando, para quem não tem reconhecimento ──────────── */
  const ouvirGravando = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof window.MediaRecorder !== "function") {
      mudar("pausado");
      setAviso("Este navegador não consegue ouvir pelo microfone. Use o Chrome, o Edge ou o Safari, ou responda escrevendo.");
      return;
    }
    try {
      if (!microfone.current) microfone.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      mudar("pausado");
      setAviso("O navegador não liberou o microfone. Permita o microfone para este site e toque em Falar.");
      return;
    }
    if (!aberta.current || estadoRef.current !== "ouvindo") return;
    const tipos = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
    const tipo = tipos.find((t) => window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(t)) || "";
    let mr;
    try {
      mr = new window.MediaRecorder(microfone.current, tipo ? { mimeType: tipo, audioBitsPerSecond: 24000 } : undefined);
    } catch (e) {
      mr = new window.MediaRecorder(microfone.current);
    }
    const partes = [];
    let descartar = false;
    let teto = null;
    let ouvido = null;
    mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) partes.push(ev.data); };
    mr.onstop = async () => {
      window.clearTimeout(teto);
      if (ouvido) ouvido();
      if (descartar || !aberta.current) return;
      const blob = new Blob(partes, { type: (mr.mimeType || tipo || "audio/webm").split(";")[0] });
      if (blob.size < 1200) { semFala(); return; }
      vazias.current = 0;
      try {
        enviar(null, { tipo: blob.type, dados: await blobEmBase64(blob) });
      } catch (e) { semFala(); }
    };
    mr.start();
    /* Uma resposta, não um discurso: dois minutos no máximo. */
    teto = window.setTimeout(() => { try { mr.stop(); } catch (e) { /* segue */ } }, 120000);
    setLegenda("");
    ouvido = detectarFimDaFala(microfone.current, () => { try { mr.stop(); } catch (e) { /* segue */ } });
    escuta.current = {
      parar: () => { descartar = true; try { mr.stop(); } catch (e) { /* segue */ } },
      enviarJa: () => { try { mr.stop(); } catch (e) { /* segue */ } },
    };
  };

  function ouvir() {
    if (!aberta.current) return;
    setAviso("");
    mudar("ouvindo");
    if (usarGravacao.current) ouvirGravando(); else ouvirNoNavegador();
  }

  /* ── a ligação ───────────────────────────────────────────────────── */
  useEffect(() => {
    aberta.current = true;
    (async () => {
      try {
        if (navigator.wakeLock && document.visibilityState === "visible") trava.current = await navigator.wakeLock.request("screen");
      } catch (e) { /* sem trava de tela: segue */ }
    })();
    enviar(temConversa
      ? "Voltei, agora por chamada de voz. Vamos continuar de onde paramos."
      : "Quero começar a mentoria por chamada de voz.");
    return () => {
      aberta.current = false;
      pararFala.current();
      pararEscuta();
      if (microfone.current) microfone.current.getTracks().forEach((t) => t.stop());
      try { if (trava.current) trava.current.release(); } catch (e) { /* segue */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const interromper = () => { pararFala.current(); vazias.current = 0; ouvir(); };
  const pausar = () => { pararEscuta(); mudar("pausado"); setAviso(""); };
  const falarAgora = () => { vazias.current = 0; ouvir(); };
  const tocarOpcao = (o) => { pararFala.current(); enviar(o); };

  const cor = estado === "ouvindo" ? "var(--ok)" : estado === "falando" ? "var(--neon2)" : estado === "pensando" ? "var(--neon)" : T.faint;

  return (
    <div className="px-5 sm:px-6 py-6 flex flex-col items-center text-center" data-teste="chamada-voz"
      style={{ borderTop: `1px solid ${T.line}`, background: soft("var(--neon2)", 6) }}>
      <div aria-hidden="true" className={estado === "ouvindo" || estado === "falando" ? "pulsar-voz" : ""}
        style={{
          width: 84, height: 84, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center",
          background: soft(cor, 18), border: `2px solid ${soft(cor, 60)}`, color: cor,
          boxShadow: estado === "ouvindo" || estado === "falando" ? `0 0 28px ${soft(cor, 45)}` : "none",
          transition: "all .3s",
        }}>
        {estado === "ouvindo" ? <Mic size={30} /> : estado === "pausado" ? <MicOff size={30} /> : <AudioLines size={30} />}
      </div>
      <div role="status" aria-live="polite" className="mt-3" style={{ fontSize: 16, fontWeight: 700, color: T.ink }} data-teste="estado-voz">
        {ROTULO_ESTADO_VOZ[estado]}
      </div>
      {estado === "ouvindo" && usarGravacao.current ? (
        <Mini style={{ marginTop: 4 }}>gravando: toque em "Terminei de falar" quando acabar</Mini>
      ) : null}
      <div className="mt-3" style={{ minHeight: 44, maxWidth: 520, fontSize: 14.5, lineHeight: 1.6, color: legenda ? T.ink : T.dim }}>
        {legenda ? `“${legenda}”` : estado === "falando" ? textoParaFalar(resposta).slice(0, 320) : ""}
      </div>
      {aviso ? <Mini style={{ marginTop: 6, color: T.warn, maxWidth: 460, lineHeight: 1.6 }}>{aviso}</Mini> : null}

      {opcoes.length && (estado === "ouvindo" || estado === "falando" || estado === "pausado") ? (
        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          {opcoes.map((o) => (
            <button key={o} type="button" onClick={() => tocarOpcao(o)}
              className="rounded-full px-4 py-2 toque-larg"
              style={{
                background: soft("var(--neon2)", 14), border: `1px solid ${soft("var(--neon2)", 35)}`,
                color: T.ink, fontSize: 14, cursor: "pointer", fontFamily: F_UI,
              }}>{o}</button>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2 justify-center">
        {estado === "falando" ? <Btn size="sm" onClick={interromper}><Mic size={14} /> Interromper e falar</Btn> : null}
        {estado === "ouvindo" ? (
          <>
            <Btn size="sm" tone="primary" onClick={() => escuta.current && escuta.current.enviarJa()}>Terminei de falar</Btn>
            <Btn size="sm" onClick={pausar}><MicOff size={14} /> Pausar</Btn>
          </>
        ) : null}
        {estado === "pausado" ? <Btn size="sm" tone="primary" onClick={falarAgora}><Mic size={14} /> Falar</Btn> : null}
        <button type="button" onClick={aoEncerrar} className="toque-larg rounded-full px-4 inline-flex items-center gap-2"
          style={{
            minHeight: 36, background: soft("var(--bad)", 12), border: `1px solid ${soft("var(--bad)", 45)}`,
            color: T.bad, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: F_UI,
          }}>
          <PhoneOff size={14} /> Encerrar
        </button>
      </div>
    </div>
  );
}

/* Na gravação, percebe que a pessoa parou de falar: algum som acima do
   ruído e depois 1,6 s de quase silêncio. Sem suporte a áudio do
   navegador, devolve nada e quem encerra é o botão "Terminei de falar". */
function detectarFimDaFala(stream, aoFim) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || !stream || !stream.getAudioTracks || !stream.getAudioTracks().length) return null;
    const ctx = new Ctx();
    /* criado fora de um toque, nasce suspenso no iPhone e não mede nada */
    if (ctx.state === "suspended" && ctx.resume) ctx.resume().catch(() => {});
    const fonte = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    fonte.connect(an);
    const buf = new Uint8Array(an.fftSize);
    let falou = false;
    let quietoDesde = 0;
    const t = window.setInterval(() => {
      an.getByteTimeDomainData(buf);
      let soma = 0;
      for (let i = 0; i < buf.length; i += 1) { const v = (buf[i] - 128) / 128; soma += v * v; }
      const nivel = Math.sqrt(soma / buf.length);
      const agora = Date.now();
      if (nivel > 0.04) { falou = true; quietoDesde = 0; } else if (falou) {
        if (!quietoDesde) quietoDesde = agora;
        else if (agora - quietoDesde > 1600) { parar(); aoFim(); }
      }
    }, 120);
    function parar() { window.clearInterval(t); try { ctx.close(); } catch (e) { /* segue */ } }
    return parar;
  } catch (e) { return null; }
}

/* ── a mentoria ─────────────────────────────────────────────────────── */

function Mentoria({ data, setData, subjects, ladder, today, totals, minWeek, qWeek, notify, nuvem }) {
  const ativo = useAtivo();
  const [msgs, setMsgs] = useState(lerConversaMentoria);
  const [opcoes, setOpcoes] = useState([]);
  const [txt, setTxt] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [emChamada, setEmChamada] = useState(false);
  const caixa = useRef(null);
  const ocupadoRef = useRef(false);
  const m = data.mentoria || {};
  const perfil = m.perfil || {};
  const sabidas = DIMENSOES_MENTORIA.filter(([k]) => perfil[k]).length;
  const podeChamar = typeof window !== "undefined" && !!window.speechSynthesis
    && (!!reconhecedorDeFala() || (typeof window.MediaRecorder === "function" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)));

  useEffect(() => { guardarConversaMentoria(msgs); }, [msgs]);

  /* Mesma regra da conversa comum: rola a caixa, não a página, e só se a
     pessoa já estava no fim — quem subiu para reler fica onde está. */
  useEffect(() => {
    const c = caixa.current;
    if (!c) return;
    if (c.scrollHeight - c.scrollTop - c.clientHeight > 160) return;
    c.scrollTop = c.scrollHeight;
  }, [msgs, ocupado]);

  /* Devolve a resposta (ou null), porque a chamada de voz precisa dela
     para falar. "extra" leva { voz } e, quando o navegador não transcreve,
     { audio }: aí a fala vai gravada e o texto dela volta no "ouvi". */
  const perguntar = useCallback(async (pergunta, extra = {}) => {
    const p = String(pergunta || "").trim() || (extra.audio ? "🎤 …" : "");
    if (!p || ocupadoRef.current) return null;
    setErro(""); setTxt(""); setOpcoes([]);
    const ateAqui = [...msgs, { papel: "user", texto: p }];
    setMsgs(ateAqui);
    ocupadoRef.current = true;
    setOcupado(true);
    try {
      let token = "";
      try {
        if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
          token = await nuvem.sdk.auth.currentUser.getIdToken();
        }
      } catch (e) { /* segue: o servidor recusa sem token */ }
      const { dados: j, erro: falha } = await chamarApi(ROTA_IA, {
        token,
        modo: "mentoria",
        contexto: [
          resumoParaIA({ subjects, ladder, data, today, totals, minWeek, qWeek, totalBonus: ativo.totalBonus }),
          pendentesParaIA(data, today),
        ].filter(Boolean).join("\n\n"),
        voz: !!extra.voz,
        ...(extra.audio ? { audio: extra.audio } : {}),
        perfil: m.perfil || {},
        plano: m.plano || null,
        mensagens: ateAqui.slice(-14).map((x) => ({
          role: x.papel === "user" ? "user" : "assistant", content: x.texto,
        })),
      }, "A mentoria");
      if (falha) { setErro(falha); if (extra.audio) setMsgs(msgs); return null; }
      if (!j || typeof j.texto !== "string") { setErro("A mentoria não respondeu. Tente de novo em instantes."); return null; }

      const resposta = { papel: "claude", texto: j.texto || "Anotei.", cortado: !!j.cortado };
      const falou = extra.audio
        ? [...msgs, { papel: "user", texto: (j.ouvi || "").trim() || "(não deu para entender o áudio)" }]
        : ateAqui;
      setMsgs([...falou, resposta]);
      setOpcoes(Array.isArray(j.opcoes) ? j.opcoes : []);

      const novoPerfil = j.perfil && typeof j.perfil === "object" ? j.perfil : {};
      if (Object.keys(novoPerfil).length || j.plano) {
        setData((pp) => {
          const mm = pp.mentoria || {};
          return {
            ...pp,
            mentoria: {
              ...mm,
              perfil: { ...(mm.perfil || {}), ...novoPerfil },
              ...(j.plano ? { plano: j.plano, planoEm: Date.now() } : {}),
            },
          };
        });
      }
      if (j.plano) notify("Plano montado. Ele está no cartão Seu plano, logo abaixo.");
      return j;
    } catch (e) {
      setErro("Não consegui falar com a mentoria. Verifique a conexão.");
      return null;
    } finally { ocupadoRef.current = false; setOcupado(false); }
  }, [msgs, ocupado, nuvem, subjects, ladder, data, today, totals, minWeek, qWeek, ativo.totalBonus, m.perfil, m.plano, setData, notify]);

  /* Recomeçar apaga o que a mentoria sabe e o plano, mas NÃO tira nada
     da Agenda: isso é decisão separada, no botão do plano. */
  const recomecar = () => {
    setMsgs([]); setOpcoes([]); setErro("");
    setData((pp) => ({ ...pp, mentoria: { ...(pp.mentoria || {}), perfil: {}, plano: null, planoEm: 0, feitos: {} } }));
  };

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-6 py-6" brilho="var(--neon2)">
        <H color="var(--neon2)" icon={<Compass size={16} />}>Mentoria de estudo</H>
        <Texto style={{ marginTop: 10 }}>
          Ela faz perguntas sobre o seu jeito de estudar e monta o seu plano: o que fazer em
          cada dia e como estudar cada coisa. Segue os métodos com mais evidência para prova
          de residência, como prática de recuperação, repetição espaçada, intercalação e
          caderno de erros. Ela já enxerga a sua prova, o que está atrasado e a sua rotina,
          então não pergunta o que o painel já sabe.
        </Texto>

        {/* O que a entrevista já descobriu: mostra o andamento e deixa a
            pessoa ver, com as palavras dela, o que a mentoria guardou. */}
        <div className="mt-5">
          <Label>O que ela já sabe de você · {sabidas} de {DIMENSOES_MENTORIA.length}</Label>
          {SECOES_MENTORIA.map(([sec, nomeSec]) => {
            const itens = DIMENSOES_MENTORIA.filter((d) => d[2] === sec);
            const ja = itens.filter(([k]) => perfil[k]).length;
            return (
          <div key={sec} className="mt-3">
          <Mini style={{ fontWeight: 700, color: ja === itens.length ? T.ok : T.dim, marginBottom: 5 }}>
            {nomeSec} · {ja}/{itens.length}
          </Mini>
          <div className="flex flex-wrap gap-1.5">
            {itens.map(([k, rotulo]) => (
              <span key={k} title={perfil[k] || "ainda não sabe"}
                style={{
                  fontSize: 12.5, fontWeight: 600, borderRadius: 99, padding: "4px 10px",
                  background: perfil[k] ? soft("var(--ok)", 16) : T.card2,
                  color: perfil[k] ? T.ok : T.faint,
                  border: `1px solid ${perfil[k] ? soft("var(--ok)", 35) : T.line}`,
                }}>
                {perfil[k] ? "✓ " : ""}{rotulo}
              </span>
            ))}
          </div>
          </div>
            );
          })}
        </div>
      </Card>

      <PlanoDaMentoria data={data} setData={setData} today={today} notify={notify}
        ocupado={ocupado} perguntar={perguntar} />

      <Card className="flex flex-col" style={{ minHeight: 380 }}>
        <div className="px-5 sm:px-6 pt-4 pb-3 flex items-center justify-between gap-2 flex-wrap"
          style={{ borderBottom: `1px solid ${T.line}` }}>
          <Mini>{msgs.length ? "a entrevista fica guardada neste aparelho" : "a entrevista leva uns dez minutos, escrevendo ou por voz"}</Mini>
          <div className="flex gap-2 flex-wrap">
            {!emChamada ? (
              <Btn size="sm" tone="primary" disabled={ocupado || !podeChamar} onClick={() => { destravarVoz(); setEmChamada(true); }}
                title={podeChamar ? "Conversar com a mentoria falando" : "Este navegador não tem microfone ou voz"}>
                <Phone size={14} /> Chamada de voz
              </Btn>
            ) : null}
            {(msgs.length || sabidas || m.plano) && !emChamada ? (
              <Btn size="sm" tone="outline" onClick={recomecar} disabled={ocupado}>recomeçar do zero</Btn>
            ) : null}
          </div>
        </div>

        <div ref={caixa} className="flex-1 px-5 sm:px-6 py-5 flex flex-col gap-4"
          style={{ maxHeight: 520, overflowY: "auto", overscrollBehavior: "contain" }}>
          {msgs.length === 0 ? (
            <div className="flex flex-col items-center text-center py-8 px-4">
              <div style={{ color: "var(--neon2)", opacity: 0.7 }}><Compass size={26} /></div>
              <div className="mt-4" style={{ fontFamily: F_SERIF, fontSize: 19, color: T.dim }}>
                {sabidas || m.plano ? "Continuar de onde parou" : "Vamos montar o seu plano"}
              </div>
              <div className="mt-1.5" style={{ fontSize: 14, color: T.faint, maxWidth: 360, lineHeight: 1.55 }}>
                Uma pergunta por vez. Dá para responder tocando nas opções ou escrevendo do seu jeito.
              </div>
              <div className="mt-6">
                <Btn tone="primary" disabled={ocupado}
                  onClick={() => perguntar(sabidas || m.plano
                    ? "Vamos continuar a mentoria de onde paramos."
                    : "Quero começar a mentoria.")}>
                  {sabidas || m.plano ? "Continuar a mentoria" : "Começar a mentoria"}
                </Btn>
              </div>
              {podeChamar && !emChamada ? (
                <button type="button" onClick={() => { destravarVoz(); setEmChamada(true); }} disabled={ocupado}
                  className="mt-3 toque-larg"
                  style={{ background: "none", border: "none", color: "var(--neon2)", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: F_UI }}>
                  ou começar por chamada de voz
                </button>
              ) : null}
            </div>
          ) : msgs.map((x, i) => (
            <div key={i} className="flex" style={{ justifyContent: x.papel === "user" ? "flex-end" : "flex-start" }}>
              <div className="rounded-2xl px-4 py-3" style={{
                maxWidth: "86%",
                background: x.papel === "user" ? soft("var(--neon2)", 20) : T.card2,
                border: `1px solid ${x.papel === "user" ? "transparent" : T.line}`,
                fontSize: 14.5, lineHeight: 1.65, color: T.ink,
                whiteSpace: x.papel === "user" ? "pre-wrap" : "normal",
              }}>
                {x.papel === "user" ? x.texto : <Markdown texto={x.texto} />}
                {x.cortado ? (
                  <Mini style={{ marginTop: 10, color: T.warn, display: "block" }}>
                    A resposta bateu no limite e parou aqui. Peça para ela continuar.
                  </Mini>
                ) : null}
              </div>
            </div>
          ))}
          {ocupado ? <Mini style={{ paddingLeft: 4 }}>pensando…</Mini> : null}
        </div>

        {emChamada ? (
          <ChamadaDeVoz perguntar={perguntar} temConversa={msgs.length > 0} opcoes={opcoes}
            aoEncerrar={() => setEmChamada(false)} />
        ) : null}

        {/* Opções de toque: no celular, responder tocando é o que faz a
            entrevista durar cinco minutos em vez de quinze. */}
        {opcoes.length && !ocupado && !emChamada ? (
          <div className="px-5 sm:px-6 pb-3 flex flex-wrap gap-2">
            {opcoes.map((o) => (
              <button key={o} type="button" onClick={() => perguntar(o)}
                className="rounded-full px-4 py-2 toque-larg"
                style={{
                  background: soft("var(--neon2)", 14), border: `1px solid ${soft("var(--neon2)", 35)}`,
                  color: T.ink, fontSize: 14, cursor: "pointer", fontFamily: F_UI,
                }}>{o}</button>
            ))}
          </div>
        ) : null}

        {erro ? <Label style={{ margin: "0 24px 12px", color: T.bad, textTransform: "none", letterSpacing: 0 }}>{erro}</Label> : null}

        <div className="px-5 sm:px-6 pb-5 pt-1 flex gap-2 items-end" style={{ display: emChamada ? "none" : undefined }}>
          <Area value={txt} placeholder={msgs.length ? "Responda do seu jeito" : "Ou escreva para começar"}
            style={{ minHeight: 48, flex: 1 }}
            onChange={(e) => setTxt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); perguntar(txt); } }} />
          <Btn tone="primary" disabled={ocupado || !txt.trim()} onClick={() => perguntar(txt)} title="Enviar">
            <Send size={15} />
          </Btn>
        </div>
      </Card>
    </div>
  );
}
