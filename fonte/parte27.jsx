/* ═══════════════════════════════════════════════════════════════════
   37 · O QUE NÃO FOI CUMPRIDO VAI PARA A FRENTE

   Um bloco de estudo que passou sem ser marcado como cumprido não some:
   vira um bloco "remarcado" no próximo horário livre, a partir de hoje.
   Se passar de novo sem marca, anda de novo, e conta quantas vezes já
   andou — é esse número que a mentoria usa para perguntar o que está
   atrapalhando, em vez de só empurrar para sempre.

   Quatro decisões.

   1. Só depois que o dia ACABA. Um bloco das 19h ainda pode ser marcado
      às 23h; remarcar às 21h seria tirar da pessoa a chance de dizer que
      fez.

   2. O que rola, por padrão, é só o que a mentoria pôs na Agenda (e só
      Estudo, Questões e Aula: plantão perdido não se "remarca"). A pessoa
      pode estender para todos os blocos de estudo dela, ou desligar.

   3. O horário novo respeita a vida dela: só entre o começo e o fim dos
      blocos de estudo que ela já tem (07h às 22h30 se não houver nenhum),
      nunca por cima de outro bloco, com dez minutos de respiro, e nunca
      num dia de descanso (três horas ou mais de Descanso na rotina). Se
      não couber inteiro em sete dias, cabe encurtado (mínimo 30 min); se
      nem assim, fica numa lista "sem horário" na Agenda, à vista.

   4. É uma função pura, chamada ao abrir o site e a cada cinco minutos.
      Devolve o MESMO objeto quando não há nada a fazer — senão cada
      chamada gravaria a conta de novo. E o id do remarcado é tirado do
      bloco e da data de origem: rodar duas vezes não duplica nada.
   ═══════════════════════════════════════════════════════════════════ */

const TIPOS_QUE_ROLAM = ["Estudo", "Questões", "Aula"];
const JANELA_PADRAO = [7 * 60, 22 * 60 + 30];
const RESPIRO = 10;
const MIN_ENCURTADO = 30;
const MAX_SEM_LUGAR = 30;

const fim5 = (m) => Math.ceil(m / 5) * 5;

/* Este bloco rola, no modo escolhido? */
function blocoRola(b, modo) {
  if (!b || modo === "nao") return false;
  if (TIPOS_QUE_ROLAM.indexOf(b.type) < 0) return false;
  if (b.origem === "mentoria") return true;
  return modo === "estudo" && !b.gid && b.origem !== "pendente";
}

/* De que horas a que horas a pessoa estuda, tirado dos blocos de estudo
   que ela já tem. É a melhor pista de quando ela está livre e acordada. */
function janelaDeEstudo(routine) {
  const est = (routine || []).filter((b) => b && TIPOS_QUE_ROLAM.indexOf(b.type) >= 0);
  if (!est.length) return JANELA_PADRAO;
  const ini = Math.min(...est.map((b) => toMin(b.start)));
  const fim = Math.max(...est.map((b) => toMin(b.end)));
  return [Math.max(6 * 60, Math.min(ini, JANELA_PADRAO[0])), Math.min(23 * 60 + 30, Math.max(fim, JANELA_PADRAO[1]))];
}

const diaSemanaISO = (iso) => (fromISO(iso).getDay() + 6) % 7;

function diaDeDescanso(routine, w) {
  const min = (routine || [])
    .filter((b) => b && Number(b.day) === w && b.type === "Descanso")
    .reduce((a, b) => a + Math.max(0, toMin(b.end) - toMin(b.start)), 0);
  return min >= 180;
}

/* O que já ocupa um dia: a rotina daquele dia da semana, os blocos com
   data, e o que esta mesma rodada já remarcou. */
function ocupadoNoDia(d, iso, ignorarId) {
  const w = diaSemanaISO(iso);
  return [
    ...(d.routine || []).filter((b) => b && Number(b.day) === w),
    ...(d.agenda || []).filter((b) => b && b.date === iso && b.id !== ignorarId),
  ].map((b) => [toMin(b.start), toMin(b.end)]).sort((a, b) => a[0] - b[0]);
}

/* O primeiro horário, de hoje em diante, em que cabem `dur` minutos. Sem
   lugar para o bloco inteiro, aceita o maior pedaço de pelo menos 30. */
function acharHorario(d, dur, hoje, agoraMin, ignorarId) {
  const janela = janelaDeEstudo(d.routine);
  const dias = Array.from({ length: 7 }, (_, i) => addDays(hoje, i))
    .filter((iso) => !diaDeDescanso(d.routine, diaSemanaISO(iso)));

  const livres = (iso) => {
    const ocup = ocupadoNoDia(d, iso, ignorarId);
    const desde = iso === hoje ? Math.max(janela[0], fim5(agoraMin + 15)) : janela[0];
    const candidatos = [desde, ...ocup.map(([, f]) => fim5(f + RESPIRO))]
      .filter((c) => c >= desde && c < janela[1])
      .sort((a, b) => a - b);
    return candidatos.map((c) => {
      /* até onde dá para ir a partir de c sem encostar em ninguém */
      if (ocup.some(([i, f]) => c < f + RESPIRO && c >= i - RESPIRO)) return [c, 0];
      const prox = ocup.filter(([i]) => i >= c).map(([i]) => i - RESPIRO);
      const teto = Math.min(janela[1], ...(prox.length ? prox : [janela[1]]));
      return [c, Math.max(0, teto - c)];
    });
  };

  for (const iso of dias) {
    const achou = livres(iso).find(([, cabe]) => cabe >= dur);
    if (achou) return { date: iso, ini: achou[0], dur };
  }
  for (const iso of dias) {
    const maior = livres(iso).reduce((m, x) => (x[1] > m[1] ? x : m), [0, 0]);
    if (maior[1] >= MIN_ENCURTADO) return { date: iso, ini: maior[0], dur: maior[1], encurtado: true };
  }
  return null;
}

/* ── a rodada ──────────────────────────────────────────────────────── */
function rolarPendentes(d, hoje, agoraMin) {
  const r = d.rolagem || { modo: "mentoria", ate: "" };
  const ontem = addDays(hoje, -1);
  const feitos = d.blocos || {};
  const modo = r.modo || "mentoria";

  /* Quais dias já passaram e ainda não foram conferidos. Na primeira vez
     (ou depois de muito tempo fora), no máximo a última semana. */
  let desde = r.ate ? addDays(r.ate, 1) : ontem;
  if (desde < addDays(hoje, -7)) desde = addDays(hoje, -7);
  const aplicadoEm = d.mentoria && d.mentoria.aplicadoEm ? toISO(new Date(d.mentoria.aplicadoEm)) : "";

  const aMover = [];      // { item, original? }
  if (modo !== "nao") {
    for (let iso = desde; iso <= ontem; iso = addDays(iso, 1)) {
      const w = diaSemanaISO(iso);
      for (const b of d.routine || []) {
        if (!b || Number(b.day) !== w || !blocoRola(b, modo) || feitos[`${b.id}|${iso}`]) continue;
        /* bloco da mentoria de um dia antes de o plano ir para a Agenda
           não era tarefa de ninguém ainda */
        if (b.origem === "mentoria" && aplicadoEm && iso < aplicadoEm) continue;
        const id = `p-${b.id}-${iso}`;
        if ((d.agenda || []).some((x) => x && x.id === id)) continue;
        if (((r.semLugar) || []).some((x) => x && x.id === id)) continue;
        aMover.push({
          id, label: b.label, type: b.type, minutos: toMin(b.end) - toMin(b.start),
          fonte: b.origem === "mentoria" ? "mentoria" : "meu", de: iso, vezes: 1, desde: iso,
        });
      }
      for (const b of d.agenda || []) {
        if (!b || b.date !== iso || !blocoRola(b, modo) || feitos[`${b.id}|${iso}`]) continue;
        aMover.push({
          id: b.id, label: b.label, type: b.type, minutos: toMin(b.end) - toMin(b.start),
          fonte: b.origem === "mentoria" ? "mentoria" : "meu", de: iso, vezes: 1, desde: iso, jaExiste: true,
        });
      }
    }
    /* os remarcados que passaram de novo sem marca andam de novo */
    for (const b of d.agenda || []) {
      if (!b || b.origem !== "pendente" || b.date >= hoje || feitos[`${b.id}|${b.date}`]) continue;
      aMover.push({
        id: b.id, label: b.label, type: b.type, minutos: Number(b.minutos) || (toMin(b.end) - toMin(b.start)),
        fonte: b.fonte || "meu", de: b.de || b.date, vezes: (Number(b.vezes) || 1) + 1, desde: b.date, jaExiste: true,
      });
    }
    /* e os que estavam sem horário tentam de novo */
    for (const x of r.semLugar || []) aMover.push({ ...x, semLugarAntes: true });
  }

  if (!aMover.length && r.ate >= ontem) return d;

  aMover.sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0));
  let agenda = (d.agenda || []).slice();
  const semLugar = [];
  for (const it of aMover) {
    const base = { ...d, agenda };
    const lugar = acharHorario(base, Math.max(15, it.minutos), hoje, agoraMin, it.jaExiste ? it.id : null);
    const { jaExiste, semLugarAntes, desde: _d, ...limpo } = it;
    if (!lugar) {
      if (jaExiste) agenda = agenda.filter((x) => x.id !== it.id);
      semLugar.push(limpo);
      continue;
    }
    const novo = {
      ...limpo, origem: "pendente",
      date: lugar.date, start: doMin(lugar.ini), end: doMin(lugar.ini + lugar.dur),
      ...(lugar.encurtado ? { encurtado: true } : {}),
    };
    agenda = jaExiste ? agenda.map((x) => (x.id === it.id ? { ...x, ...novo } : x)) : [...agenda, novo];
  }

  const rolagem = { ...r, modo, ate: r.ate > ontem ? r.ate : ontem, semLugar: semLugar.slice(0, MAX_SEM_LUGAR) };
  /* A lista "sem horário" é tentada de novo a cada rodada. Se continuou
     tudo sem lugar, o resultado é igual ao de antes, e devolver um objeto
     novo faria o app redesenhar à toa a cada cinco minutos. */
  if (JSON.stringify(agenda) === JSON.stringify(d.agenda || [])
    && JSON.stringify(rolagem) === JSON.stringify({ ...r, semLugar: r.semLugar || [] })) return d;
  return { ...d, agenda, rolagem };
}

/* O que ficou para trás, em texto, para a mentoria. */
function pendentesParaIA(d, hoje) {
  const rem = (d.agenda || []).filter((b) => b && b.origem === "pendente" && b.date >= hoje);
  const sem = (d.rolagem && d.rolagem.semLugar) || [];
  if (!rem.length && !sem.length) return "";
  const linhas = rem
    .sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1))
    .map((b) => `- ${brDate(b.date)} ${b.start}-${b.end}: ${b.label} (era de ${brDate(b.de)}; remarcado ${b.vezes || 1}x)`);
  for (const x of sem) linhas.push(`- SEM HORÁRIO: ${x.label}, ${x.minutos} min (era de ${brDate(x.de)}; ${x.vezes || 1}x)`);
  return `=== TAREFAS QUE FICARAM PARA TRÁS (não marcadas como cumpridas; o site já remarcou) ===\n${linhas.join("\n")}`;
}

/* ── o quadro na Agenda ────────────────────────────────────────────── */
function QuadroPendentes({ data, setData, today, notify }) {
  const r = data.rolagem || { modo: "mentoria" };
  const daqui = (data.agenda || []).filter((b) => b && b.origem === "pendente" && b.date >= today
    && !(data.blocos || {})[`${b.id}|${b.date}`]);
  const sem = r.semLugar || [];
  const temMentoria = (data.routine || []).some((b) => b && b.origem === "mentoria");

  const trocar = (modo) => setData((p) => ({
    ...p,
    /* trocar o modo conta daqui para a frente: ligar "todos os blocos de
       estudo" não pode despejar de uma vez a semana passada inteira */
    rolagem: { ...(p.rolagem || {}), modo, ate: addDays(todayISO(), -1) },
  }));
  const descartar = (id) => setData((p) => ({
    ...p,
    rolagem: { ...(p.rolagem || {}), semLugar: ((p.rolagem && p.rolagem.semLugar) || []).filter((x) => x.id !== id) },
  }));

  return (
    <Card className="px-5 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <H size={17} color="var(--warn)" icon={<RotateCcw size={15} />}>O que não foi cumprido</H>
        {daqui.length ? <Mini>{daqui.length} remarcado{daqui.length === 1 ? "" : "s"} nos próximos dias</Mini> : null}
      </div>
      <Mini style={{ marginTop: 8, lineHeight: 1.6 }}>
        Bloco de estudo que o dia terminar sem marca de cumprido vai sozinho para o próximo
        horário livre, sem passar por cima de nada e sem usar seu dia de descanso.
      </Mini>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="O que remarcar">
        {[["mentoria", "Só os da mentoria"], ["estudo", "Todos os de estudo"], ["nao", "Não remarcar"]].map(([id, lb]) => (
          <button key={id} type="button" role="radio" aria-checked={r.modo === id} onClick={() => trocar(id)}
            data-teste={`rolagem-${id}`}
            className="toque-larg rounded-full px-4 py-2"
            style={{
              background: r.modo === id ? soft("var(--warn)", 18) : "transparent",
              border: `1px solid ${r.modo === id ? "transparent" : T.line}`,
              color: r.modo === id ? T.warn : T.dim,
              fontSize: 13.5, fontWeight: r.modo === id ? 700 : 500, cursor: "pointer",
            }}>{lb}</button>
        ))}
      </div>
      {r.modo === "mentoria" && !temMentoria ? (
        <Mini style={{ marginTop: 8 }}>Ainda não há blocos da mentoria na Agenda. Monte o plano em Assistente → Mentoria de estudo.</Mini>
      ) : null}
      {sem.length ? (
        <div className="mt-4">
          <Label style={{ color: T.warn }}>Sem horário livre nos próximos 7 dias</Label>
          <div className="mt-2 flex flex-col gap-1.5">
            {sem.map((x) => (
              <div key={x.id} className="flex items-center gap-3 rounded-xl px-3.5 py-2.5" style={{ background: T.card2 }}>
                <span className="flex-1 min-w-0" style={{ fontSize: 14, color: T.ink }}>
                  {x.label} <span style={{ color: T.faint }}>· {fmtMin(x.minutos)} · era de {brDate(x.de)}</span>
                </span>
                <Btn size="sm" tone="outline" onClick={() => { descartar(x.id); notify("Tirado da lista."); }}>deixar para lá</Btn>
              </div>
            ))}
          </div>
          <Mini style={{ marginTop: 8, lineHeight: 1.6 }}>
            Abra um espaço na semana e eles entram sozinhos, ou peça para a mentoria ajustar o plano.
          </Mini>
        </div>
      ) : null}
    </Card>
  );
}
