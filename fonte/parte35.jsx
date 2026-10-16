/* ═══════════════════════════════════════════════════════════════════
   45 · O QUE FOI ESTUDADO NO ANKI CONTA AQUI

   Quem revisa no Anki ou no AnkiDroid queria que aquele tempo contasse no
   site: nas horas do dia, no desempenho e no ranking da sala em Amigos. O
   Anki não tem porta aberta para outro site ler, então o caminho é o
   arquivo: a pessoa exporta a coleção (com o histórico de revisões) e
   importa aqui.

   O histórico está na tabela revlog: uma linha por resposta, com o
   instante (o id, em milissegundos) e o tempo gasto nela. Aqui as linhas
   viram, por dia, quantos cartões e quanto tempo, e cada dia vira UMA
   sessão de "Flashcards" com id fixo (anki-AAAA-MM-DD). Importar de novo
   atualiza o dia em vez de somar outra vez: dá para importar toda semana
   sem duplicar nada.

   O AnkiDroid e o Anki novos exportam a coleção compactada com zstd
   (collection.anki21b), que o navegador não abre sozinho: o fzstd (8 KB,
   publicado junto do site) descompacta.
   ═══════════════════════════════════════════════════════════════════ */

const FZSTD_LOCAL = "/fzstd.min.js";
const DIAS_HISTORICO_ANKI = 365;
const TETO_RESPOSTA_ANKI = 5 * 60 * 1000;   // resposta "esquecida" aberta não vira hora de estudo

let fzstdPromessa = null;
function carregarZstd() {
  if (fzstdPromessa) return fzstdPromessa;
  fzstdPromessa = (async () => {
    if (!window.fzstd) {
      try { await baixarScript(FZSTD_LOCAL); }
      catch (e) { fzstdPromessa = null; throw new Error("Não consegui carregar o descompactador do Anki. Confira sua conexão."); }
    }
    if (!window.fzstd) { fzstdPromessa = null; throw new Error("O descompactador do Anki não iniciou."); }
    return window.fzstd;
  })();
  return fzstdPromessa;
}

/* O banco de dentro do arquivo do Anki, já descompactado se precisar.
   No formato novo, collection.anki2 também vem dentro, mas é só um aviso
   "atualize o Anki": quem tem os dados é o anki21b. */
async function bancoDoAnki(zip, aviso) {
  const nomes = Object.keys(zip);
  const novo = nomes.find((n) => /(^|\/)collection\.anki21b$/.test(n));
  if (novo) {
    aviso("descompactando a coleção");
    const z = await carregarZstd();
    try { return { bytes: z.decompress(zip[novo]), formatoNovo: true }; }
    catch (e) { throw new Error("Não consegui descompactar a coleção do Anki."); }
  }
  const antigo = nomes.find((n) => n === "collection.anki21") || nomes.find((n) => n === "collection.anki2")
    || nomes.find((n) => /collection\.anki2\d?$/.test(n));
  return antigo ? { bytes: zip[antigo], formatoNovo: false } : null;
}

/* As revisões, somadas por dia (data local, a de quem estudou). Fica de
   fora o que não é resposta: reagendamento manual (type 4) e as linhas sem
   botão (ease 0). */
function revisoesPorDia(db, desdeMs) {
  const dias = {};
  let total = 0;
  const st = db.prepare("SELECT id, time, type, ease FROM revlog WHERE id >= ?");
  try {
    st.bind([desdeMs]);
    while (st.step()) {
      const [id, tempo, tipo, botao] = st.get();
      if (Number(tipo) === 4 || Number(botao) === 0) continue;
      const dia = toISO(new Date(Number(id)));
      const d = dias[dia] || (dias[dia] = { cartoes: 0, ms: 0 });
      d.cartoes += 1;
      d.ms += Math.max(0, Math.min(TETO_RESPOSTA_ANKI, Number(tempo) || 0));
      total += 1;
    }
  } finally { st.free(); }
  return { dias, total };
}

async function lerHistoricoAnki(arquivo, aviso) {
  aviso("abrindo o arquivo");
  let zip;
  try { zip = unzipSync(new Uint8Array(await arquivo.arrayBuffer())); }
  catch (e) { throw new Error("Esse arquivo não parece uma exportação do Anki (.colpkg ou .apkg)."); }
  const banco = await bancoDoAnki(zip, aviso);
  if (!banco) throw new Error("Não achei a coleção dentro do arquivo.");
  aviso("carregando o leitor de banco");
  const SQL = await carregarSQL();
  const db = new SQL.Database(banco.bytes);
  try {
    aviso("lendo o histórico de revisões");
    const desde = Date.now() - DIAS_HISTORICO_ANKI * 86400000;
    let r;
    try { r = revisoesPorDia(db, desde); }
    catch (e) { throw new Error("Essa coleção não tem o histórico de revisões. Exporte de novo marcando “incluir agendamento”."); }
    return r;
  } finally { db.close(); }
}

/* Cada dia vira (ou atualiza) a sessão anki-DIA. Nunca diminui: se o dia
   já tinha mais tempo contado (de um arquivo mais completo), fica o maior. */
function aplicarHistoricoAnki(sessions, dias) {
  const lista = [...(sessions || [])];
  const porId = new Map(lista.map((s, i) => [s && s.id, i]));
  let novos = 0, atualizados = 0, minutos = 0, cartoes = 0;
  for (const [dia, d] of Object.entries(dias)) {
    const min = Math.round(d.ms / 60000);
    if (min < 1) continue;
    const id = `anki-${dia}`;
    const sessao = {
      id, date: dia, subjectId: null, area: null,
      topic: `Anki: ${d.cartoes} ${d.cartoes === 1 ? "cartão" : "cartões"}`,
      kind: "Flashcards", minutes: min, questions: 0, correct: 0,
      notes: "anki", createdAt: new Date(`${dia}T12:00:00`).getTime() || Date.now(),
    };
    if (porId.has(id)) {
      const i = porId.get(id);
      const antes = lista[i] || {};
      if (min > (Number(antes.minutes) || 0)) { lista[i] = { ...antes, ...sessao }; atualizados += 1; }
      else continue;
    } else {
      lista.push(sessao);
      novos += 1;
    }
    minutos += min;
    cartoes += d.cartoes;
  }
  /* a lista segue da sessão mais nova para a mais velha */
  lista.sort((a, b) => String((b && b.date) || "").localeCompare(String((a && a.date) || "")) || ((b && b.createdAt) || 0) - ((a && a.createdAt) || 0));
  return { sessions: lista, novos, atualizados, minutos, cartoes };
}

function ImportarHistoricoAnki({ sessions, setData, notify }) {
  const ref = useRef(null);
  const [status, setStatus] = useState("");
  const [resultado, setResultado] = useState("");
  const escolher = async (ev) => {
    const arquivo = (ev.target.files || [])[0];
    ev.target.value = "";
    if (!arquivo) return;
    setResultado("");
    try {
      const { dias, total } = await lerHistoricoAnki(arquivo, setStatus);
      if (!total) { setResultado("O arquivo não tem revisões do último ano. Exporte a coleção marcando “incluir agendamento”."); return; }
      /* a conta para a mensagem sai das sessões de agora; a gravação refaz a
         mesma conta sobre o estado mais novo, para não perder nada que
         tenha mudado no meio */
      const r = aplicarHistoricoAnki(sessions, dias);
      setData((p) => ({ ...p, sessions: aplicarHistoricoAnki(p.sessions, dias).sessions }));
      const texto = r.novos || r.atualizados
        ? `Pronto: ${r.cartoes} cartões e ${fmtMin(r.minutos)} de Anki entraram nas suas horas. ${r.novos} ${r.novos === 1 ? "dia novo" : "dias novos"}${r.atualizados ? ` e ${r.atualizados} ${r.atualizados === 1 ? "atualizado" : "atualizados"}` : ""}.`
        : "Nada novo: esses dias já estavam contados.";
      setResultado(texto);
      notify(texto);
    } catch (e) {
      setResultado((e && e.message) || "Não consegui ler esse arquivo.");
    } finally { setStatus(""); }
  };
  return (
    <div data-teste="anki-historico" style={{ marginTop: 16, padding: "14px 16px", borderRadius: 16, background: soft("var(--neon)", 7), border: `1px solid ${soft("var(--neon)", 30)}` }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Contar o que estudei no Anki</div>
      <Mini style={{ marginTop: 6, lineHeight: 1.65 }}>
        O tempo que você revisou no Anki ou no AnkiDroid entra nas suas horas do dia, no desempenho e no ranking da sala em Amigos.
        No AnkiDroid: menu ⋮, Exportar, escolha “Coleção” e marque “incluir agendamento”. No Anki do computador: Arquivo, Exportar,
        “Pacote de coleção do Anki”. Depois mande o arquivo aqui. Dá para importar de novo sempre que quiser: o que já foi contado não duplica.
      </Mini>
      <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 12 }}>
        <button type="button" disabled={!!status} onClick={() => ref.current && ref.current.click()} data-teste="anki-historico-botao"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 99, border: `1px solid ${T.line2}`, background: T.card, color: T.ink, fontWeight: 600, fontSize: 14.5, cursor: status ? "default" : "pointer" }}>
          <Upload size={15} /> {status ? "Lendo…" : "Importar o que estudei no Anki"}
        </button>
        <input ref={ref} type="file" accept=".colpkg,.apkg" onChange={escolher} style={{ display: "none" }} data-teste="anki-historico-arquivo" />
        {status ? <Mini>{status}…</Mini> : null}
      </div>
      {resultado ? <div data-teste="anki-historico-resultado" style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5, color: T.ink }}>{resultado}</div> : null}
    </div>
  );
}
