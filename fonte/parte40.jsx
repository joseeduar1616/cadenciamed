/* ═══════════════════════════════════════════════════════════════════
   40 · BANCO DE QUESTÕES

   Questões de provas de residência com gabarito comentado, para treinar
   filtrando por área, especialidade, tema, prova e ano. O acervo mora no
   servidor (/api/banco) e cresce a partir das provas oficiais que o dono
   comenta e publica na aba Provas: aqui ele escolhe a prova, diz de que
   banca e ano é, cola o gabarito oficial, e as questões entram no banco
   classificadas por especialidade e tema.

   Três decisões que moldam esta tela.

   1. Tentar antes de ver. A questão aparece fechada: alternativas para
      tocar, e só depois o gabarito e o comentário de TODAS elas. Ver a
      resposta junto da pergunta é ler, não estudar.

   2. O gabarito da banca manda. Quando a prova entrou com o gabarito
      oficial, é ele que decide acerto e erro. Se o comentário da IA
      defende outra letra, a tela diz isso na cara, em vez de escolher em
      silêncio; questão anulada aparece como anulada.

   3. O que a pessoa respondeu fica na conta (data.banco.r), num formato
      curto, para filtrar "não respondidas" e "errei" e para o acerto por
      área. A questão errada vai para o caderno de erros com um toque.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_BANCO = "/api/banco";
const LETRAS_BANCO = ["A", "B", "C", "D", "E", "F"];
const SUGESTOES_BANCA = ["ENARE", "USP-SP", "USP-RP", "UNIFESP", "UNICAMP", "SUS-SP", "SES-DF", "PSU-MG", "AMRIGS", "HCPA", "UERJ", "UFRJ", "SURCE", "AMP-PR", "PSU-GO", "UFPR", "HIAE", "SCMSP"];

async function falarComBanco(nuvem, corpo) {
  let token = "";
  try {
    if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) token = await nuvem.sdk.auth.currentUser.getIdToken();
  } catch (e) { /* o servidor recusa sem token */ }
  const { dados, erro } = await chamarApi(ROTA_BANCO, { token, ...corpo }, "O banco de questões");
  return erro ? { erro } : (dados || { erro: "O banco de questões não respondeu." });
}

/* As contagens dos filtros, somando o resumo de cada prova que entrou no
   banco. Puro, para dar para conferir sem tela. */
function contagensDoBanco(provas, f) {
  const lista = (provas || []).filter((p) => (!f.instituicao || p.instituicao === f.instituicao) && (!f.ano || p.ano === f.ano));
  const areas = {}, esps = {}, temas = {};
  let total = 0;
  for (const p of lista) {
    for (const [a, n] of Object.entries(p.areas || {})) areas[a] = (areas[a] || 0) + n;
    for (const [k, n] of Object.entries(p.esps || {})) esps[k] = (esps[k] || 0) + n;
    for (const [k, n] of Object.entries(p.temas || {})) temas[k] = (temas[k] || 0) + n;
  }
  if (f.area && f.esp && f.tema) total = temas[`${f.area}|${f.esp}|${f.tema}`] || 0;
  else if (f.area && f.esp) total = esps[`${f.area}|${f.esp}`] || 0;
  else if (f.area) total = areas[f.area] || 0;
  else total = lista.reduce((s, p) => s + (p.total || 0), 0);
  return { areas, esps, temas, total };
}

/* Uma resposta guardada, lida: "C1CL" → { letra: "C", acertou: true, area: "CL" }. */
const lerResposta = (v) => (typeof v === "string" && v.length >= 4
  ? { letra: v[0], acertou: v[1] === "1", area: v.slice(2) } : null);

function acertoPorArea(r) {
  const por = {};
  for (const v of Object.values(r || {})) {
    const x = lerResposta(v);
    if (!x) continue;
    const a = x.area === "--" ? "" : x.area;
    if (!por[a]) por[a] = { feitas: 0, certas: 0 };
    por[a].feitas += 1;
    if (x.acertou) por[a].certas += 1;
  }
  return por;
}

/* O enunciado com o lugar da figura. As provas publicadas guardam só o
   texto; a imagem ficou no aparelho de quem comentou. Em vez de um
   marcador cru no meio da pergunta, um aviso no ponto da figura. */
function EnunciadoDoBanco({ texto }) {
  const partes = String(texto || "").split(/\[\[img:[^\]]*\]\]/);
  return (
    <div style={{ fontSize: 15.5, lineHeight: 1.7, color: T.ink, whiteSpace: "pre-wrap" }}>
      {partes.map((p, i) => (
        <span key={i}>
          {p}
          {i < partes.length - 1 ? (
            <span className="block my-2 rounded-xl px-3 py-2" style={{ fontSize: 13, color: T.warn, background: soft("var(--warn)", 10), border: `1px solid ${soft("var(--warn)", 35)}` }}>
              Esta questão tem uma figura (imagem, exame ou gráfico) que não veio junto. Confira na prova original.
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

const SEGURANCA_BANCO = {
  alta: { rotulo: "comentário com consenso firme", cor: "var(--ok)" },
  media: { rotulo: "comentário: confira antes de decorar", cor: "var(--warn)" },
  baixa: { rotulo: "comentário duvidoso: confira", cor: "var(--bad)" },
};

function QuestaoDoBanco({ q, resposta, aoResponder, aoProxima, aoCaderno, n, total, temProxima }) {
  const [escolhi, setEscolhi] = useState(resposta ? LETRAS_BANCO.indexOf(resposta.letra) : -1);
  useEffect(() => { setEscolhi(resposta ? LETRAS_BANCO.indexOf(resposta.letra) : -1); }, [q.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const respondida = escolhi >= 0;
  const seg = SEGURANCA_BANCO[q.seguranca] || SEGURANCA_BANCO.media;
  const certa = q.certa;
  const acertou = respondida && !q.anulada && escolhi === certa;

  const escolher = (i) => {
    if (respondida) return;
    setEscolhi(i);
    aoResponder(q, i);
  };

  return (
    <Card className="px-5 sm:px-6 py-6">
      <div className="flex items-center gap-2 flex-wrap" data-teste="banco-meta">
        <Mini style={{ fontFamily: F_MONO }}>{n} de {total}{temProxima ? "+" : ""}</Mini>
        <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 99, padding: "2px 10px", background: soft("var(--neon)", 14), color: T.ink }}>
          {q.autoral ? "Autoral Cadência Med" : `${q.instituicao} ${q.ano || ""}`}{q.numero ? ` · questão ${q.numero}` : ""}
        </span>
        {q.area ? <span style={{ fontSize: 12, fontWeight: 600, borderRadius: 99, padding: "2px 10px", background: soft(aColor(q.area), 16), color: aColor(q.area) }}>{aLabel(q.area)}</span> : null}
        {q.esp ? <span style={{ fontSize: 12, color: T.dim }}>{q.esp}</span> : null}
        {q.tema ? <span style={{ fontSize: 12, color: T.faint }}>· {q.tema}</span> : null}
      </div>

      <div className="mt-4"><EnunciadoDoBanco texto={q.enunciado} /></div>

      <div className="mt-4 flex flex-col gap-2">
        {q.alternativas.map((alt, i) => {
          const eCerta = respondida && !q.anulada && i === certa;
          const eMinha = respondida && i === escolhi;
          const cor = eCerta ? "var(--ok)" : eMinha ? "var(--bad)" : null;
          return (
            <div key={i}>
              <button type="button" onClick={() => escolher(i)} disabled={respondida}
                data-teste={`alternativa-${LETRAS_BANCO[i]}`}
                className="w-full text-left rounded-2xl px-4 py-3 flex gap-3 items-start"
                style={{
                  cursor: respondida ? "default" : "pointer", fontFamily: F_UI, fontSize: 15, lineHeight: 1.55, color: T.ink,
                  background: cor ? soft(cor, 12) : T.card2,
                  border: `1px solid ${cor ? soft(cor, 55) : T.line}`,
                }}>
                <span style={{ fontWeight: 800, color: cor || T.dim, minWidth: 18 }}>{LETRAS_BANCO[i]}</span>
                <span style={{ flex: 1 }}>{alt}</span>
                {eCerta ? <Check size={17} style={{ color: "var(--ok)", flexShrink: 0, marginTop: 2 }} /> : null}
                {eMinha && !eCerta ? <X size={17} style={{ color: "var(--bad)", flexShrink: 0, marginTop: 2 }} /> : null}
              </button>
              {respondida && q.comentarios[i] ? (
                <div className="mt-1.5 ml-8 mr-1" style={{ fontSize: 14, lineHeight: 1.65, color: T.dim }}>{q.comentarios[i]}</div>
              ) : null}
            </div>
          );
        })}
      </div>

      {respondida ? (
        <div className="mt-5 flex flex-col gap-2.5" data-teste="banco-gabarito">
          <div style={{ fontSize: 16, fontWeight: 800, color: q.anulada ? T.warn : acertou ? "var(--ok)" : "var(--bad)" }}>
            {q.anulada ? "Questão anulada pela banca." : acertou ? "Você acertou." : `Você marcou ${LETRAS_BANCO[escolhi]}. A resposta é ${LETRAS_BANCO[certa]}.`}
          </div>
          {q.autoral ? <Mini data-teste="banco-autoral">Questão autoral do Cadência Med, escrita com base nas diretrizes citadas abaixo. Não saiu de prova de banca.</Mini>
            : q.oficial >= 0 ? <Mini>Gabarito oficial da banca: {LETRAS_BANCO[q.oficial]}.</Mini> : <Mini>Sem gabarito oficial cadastrado: a resposta é a do comentário.</Mini>}
          {q.divergente ? (
            <div className="rounded-xl px-3.5 py-2.5" data-teste="banco-divergente" style={{ fontSize: 13.5, lineHeight: 1.6, color: T.ink, background: soft("var(--warn)", 12), border: `1px solid ${soft("var(--warn)", 40)}` }}>
              O gabarito oficial é {LETRAS_BANCO[q.oficial]}, mas o comentário abaixo de cada alternativa defende {LETRAS_BANCO[q.certaIA]}. Pode ser conduta que mudou depois da prova, ou erro do comentário: confira na fonte antes de decorar.
            </div>
          ) : null}
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ width: 8, height: 8, borderRadius: 99, background: seg.cor }} />
            <Mini>{seg.rotulo}{q.fonte ? ` · ${q.fonte}` : ""}</Mini>
          </div>
          {q.avisos ? <Mini style={{ color: T.warn, lineHeight: 1.6 }}>{q.avisos}</Mini> : null}
          <div className="mt-2 flex gap-2 flex-wrap">
            {!acertou && !q.anulada ? <Btn size="sm" tone="outline" onClick={() => aoCaderno(q, escolhi)}><NotebookPen size={14} /> Mandar para o caderno de erros</Btn> : null}
            <Btn size="sm" tone="primary" onClick={aoProxima}>Próxima <ChevronRight size={14} /></Btn>
          </div>
        </div>
      ) : (
        <div className="mt-4"><Btn size="sm" onClick={aoProxima}>Pular</Btn></div>
      )}
    </Card>
  );
}

/* ── o painel do dono: pôr provas publicadas no banco ─────────────────── */
function MontarBanco({ nuvem, notify, aoMudar }) {
  const [fontes, setFontes] = useState(null);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState("");
  const [form, setForm] = useState({ instituicao: "", ano: "", gabarito: "" });
  const [andamento, setAndamento] = useState(null);

  const carregar = useCallback(async () => {
    const j = await falarComBanco(nuvem, { acao: "fontes" });
    if (j.erro) { setErro(j.erro); setFontes([]); return; }
    setErro(""); setFontes(j.provas || []);
  }, [nuvem]);
  useEffect(() => { carregar(); }, [carregar]);

  const abrir = (p) => {
    setAberta(p.codigo);
    setForm({ instituicao: p.instituicao || "", ano: p.ano ? String(p.ano) : "", gabarito: "" });
    setErro("");
  };

  const indexar = async (p) => {
    setErro("");
    let inicio = 0;
    setAndamento({ codigo: p.codigo, feitas: 0, total: p.questoes });
    for (let volta = 0; volta < 40; volta += 1) {
      const j = await falarComBanco(nuvem, { acao: "indexar", codigo: p.codigo, instituicao: form.instituicao, ano: Number(form.ano), gabarito: form.gabarito, inicio });
      if (j.erro) { setErro(j.erro); setAndamento(null); return; }
      setAndamento({ codigo: p.codigo, feitas: j.feitas, total: j.total });
      if (j.fim) {
        notify(`${j.total} questões no banco${j.resumo && j.resumo.divergentes ? `, ${j.resumo.divergentes} com gabarito divergente do comentário` : ""}.`);
        break;
      }
      inicio = j.proximo;
    }
    setAndamento(null); setAberta("");
    await carregar(); aoMudar();
  };

  const remover = async (p) => {
    const j = await falarComBanco(nuvem, { acao: "remover", codigo: p.codigo });
    if (j.erro) { setErro(j.erro); return; }
    notify(`${j.removidas} questões tiradas do banco.`);
    await carregar(); aoMudar();
  };

  return (
    <div data-teste="banco-montar"><Card className="px-5 sm:px-6 py-6">
      <H size={17} color="var(--warn)" icon={<Upload size={15} />}>Montar o banco (só você vê)</H>
      <Texto style={{ marginTop: 8 }}>
        As questões vêm das provas que você comenta e publica na aba Provas, a partir do PDF oficial da banca.
        Aqui você escolhe a prova, diz de que banca e ano ela é e cola o gabarito oficial. A IA só marca área,
        especialidade e tema de cada questão; o texto e o comentário são os que você já conferiu.
      </Texto>
      {erro ? <Mini style={{ color: T.bad, marginTop: 10 }}>{erro}</Mini> : null}
      {fontes === null ? <Mini style={{ marginTop: 12 }}>carregando as provas publicadas…</Mini> : null}
      {fontes && !fontes.length && !erro ? <Mini style={{ marginTop: 12 }}>Nenhuma prova publicada ainda. Comente e publique uma na aba Provas.</Mini> : null}
      <div className="mt-4 flex flex-col gap-2.5">
        {(fontes || []).map((p) => (
          <div key={p.codigo} className="rounded-2xl px-4 py-3" style={{ background: T.card2, border: `1px solid ${T.line}` }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink }}>{p.prova || p.codigo}</div>
                <Mini>
                  código {p.codigo} · {p.questoes} questões
                  {p.noBanco ? ` · no banco como ${p.instituicao} ${p.ano}${p.divergentes ? ` · ${p.divergentes} divergentes do oficial` : ""}` : " · fora do banco"}
                </Mini>
              </div>
              <div className="flex gap-2">
                <Btn size="sm" tone={p.noBanco ? "outline" : "primary"} onClick={() => abrir(p)} disabled={!!andamento}>{p.noBanco ? "Refazer" : "Pôr no banco"}</Btn>
                {p.noBanco ? <Btn size="sm" onClick={() => remover(p)} disabled={!!andamento}><Trash2 size={13} /> Tirar</Btn> : null}
              </div>
            </div>
            {aberta === p.codigo ? (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Banca ou instituição">
                  <TextInput list="bancas-residencia" value={form.instituicao} placeholder="ex.: ENARE" onChange={(e) => setForm((f) => ({ ...f, instituicao: e.target.value }))} />
                </Field>
                <Field label="Ano da prova">
                  <TextInput inputMode="numeric" value={form.ano} placeholder="ex.: 2024" onChange={(e) => setForm((f) => ({ ...f, ano: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Gabarito oficial (cole do PDF da banca: 1-A 2-C ..., ou só as letras)">
                    <textarea value={form.gabarito} rows={3} onChange={(e) => setForm((f) => ({ ...f, gabarito: e.target.value }))}
                      style={{ width: "100%", borderRadius: 12, padding: 10, background: T.card, border: `1px solid ${T.line}`, color: T.ink, fontFamily: F_MONO, fontSize: 13 }} />
                  </Field>
                </div>
                <div className="sm:col-span-2 flex gap-2 items-center flex-wrap">
                  <Btn size="sm" tone="primary" onClick={() => indexar(p)} disabled={!!andamento || !form.instituicao.trim() || !/^\d{4}$/.test(form.ano)}>
                    {andamento && andamento.codigo === p.codigo ? `Classificando… ${andamento.feitas} de ${andamento.total}` : "Classificar e pôr no banco"}
                  </Btn>
                  <Btn size="sm" onClick={() => setAberta("")} disabled={!!andamento}>Cancelar</Btn>
                  {!form.gabarito.trim() ? <Mini>Sem o gabarito oficial, vale a resposta do comentário.</Mini> : null}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <datalist id="bancas-residencia">{SUGESTOES_BANCA.map((b) => <option key={b} value={b} />)}</datalist>
    </Card></div>
  );
}

/* ── a aba ───────────────────────────────────────────────────────────── */
const FILTRO_VAZIO = { area: "", esp: "", tema: "", instituicao: "", ano: 0, status: "todas" };

function BancoDeQuestoes({ data, setData, today, notify, nuvem, souDono }) {
  const [provas, setProvas] = useState(null);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(FILTRO_VAZIO);
  const [lista, setLista] = useState([]);
  const [pos, setPos] = useState(0);
  const [cursor, setCursor] = useState("");
  const [fim, setFim] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [treinando, setTreinando] = useState(false);
  const [sessao, setSessao] = useState({ feitas: 0, certas: 0 });
  const respostas = (data.banco && data.banco.r) || {};

  const carregarFiltros = useCallback(async () => {
    const j = await falarComBanco(nuvem, { acao: "filtros" });
    if (j.erro) { setErro(j.erro); setProvas([]); return; }
    setErro(""); setProvas(j.provas || []);
  }, [nuvem]);
  useEffect(() => { carregarFiltros(); }, [carregarFiltros]);

  const c = useMemo(() => contagensDoBanco(provas, f), [provas, f]);
  const bancas = useMemo(() => [...new Set((provas || []).map((p) => p.instituicao).filter(Boolean))].sort(), [provas]);
  const anos = useMemo(() => [...new Set((provas || []).filter((p) => !f.instituicao || p.instituicao === f.instituicao).map((p) => p.ano).filter(Boolean))].sort((a, b) => b - a), [provas, f.instituicao]);
  const espsDaArea = useMemo(() => Object.keys(c.esps).filter((k) => k.startsWith(`${f.area}|`)).map((k) => k.split("|")[1]).sort(), [c.esps, f.area]);
  const temasDaEsp = useMemo(() => Object.keys(c.temas).filter((k) => k.startsWith(`${f.area}|${f.esp}|`)).map((k) => k.split("|")[2]).sort(), [c.temas, f.area, f.esp]);
  const desempenho = useMemo(() => acertoPorArea(respostas), [respostas]);
  const totalBanco = (provas || []).reduce((s, p) => s + (p.total || 0), 0);

  const passaStatus = useCallback((q) => {
    const r = lerResposta(respostas[q.id]);
    if (f.status === "nao") return !r;
    if (f.status === "errei") return !!r && !r.acertou;
    return true;
  }, [respostas, f.status]);

  /* Busca páginas até ter questões que passem no filtro de status (que é
     local: o servidor não sabe o que esta pessoa respondeu). */
  const buscar = async (doZero) => {
    setBuscando(true); setErro("");
    let cur = doZero ? "" : cursor;
    let novas = [];
    let acabou = false;
    for (let volta = 0; volta < 15 && novas.length < 10; volta += 1) {
      const j = await falarComBanco(nuvem, { acao: "buscar", filtros: f, cursor: cur });
      if (j.erro) { setErro(j.erro); break; }
      novas = novas.concat((j.questoes || []).filter(passaStatus));
      cur = j.cursor; acabou = !!j.fim;
      if (acabou) break;
    }
    setCursor(cur); setFim(acabou);
    setLista((l) => (doZero ? novas : l.concat(novas)));
    if (doZero) { setPos(0); setSessao({ feitas: 0, certas: 0 }); }
    setBuscando(false);
    return novas.length;
  };

  const comecar = async () => { setTreinando(true); await buscar(true); };

  const responder = (q, i) => {
    const acertou = !q.anulada && i === q.certa;
    setSessao((s) => ({ feitas: s.feitas + 1, certas: s.certas + (acertou ? 1 : 0) }));
    setData((p) => {
      const r = { ...((p.banco && p.banco.r) || {}) };
      delete r[q.id];
      r[q.id] = `${LETRAS_BANCO[i]}${acertou ? 1 : 0}${q.area || "--"}`;
      return { ...p, banco: { ...(p.banco || {}), r } };
    });
  };

  const proxima = async () => {
    if (pos + 1 < lista.length) { setPos(pos + 1); return; }
    if (!fim) {
      const n = await buscar(false);
      if (n) { setPos(pos + 1); return; }
    }
    notify("Acabaram as questões deste filtro.");
    setTreinando(false);
  };

  const paraCaderno = (q, i) => {
    const ficha = limparErro({
      id: `b-${q.id}`.slice(0, 40), criado: today,
      tema: q.tema || q.esp || "Questão do banco",
      cobrava: String(q.enunciado || "").replace(/\[\[img:[^\]]*\]\]/g, "").slice(0, 300),
      marquei: `${LETRAS_BANCO[i]}) ${q.alternativas[i] || ""}`,
      certa: `${LETRAS_BANCO[q.certa]}) ${q.alternativas[q.certa] || ""}`,
      porque: q.comentarios[q.certa] || "",
      fonte: q.autoral ? "Banco Cadência Med (autoral)" : `${q.instituicao} ${q.ano}`,
      motivo: "lacuna",
    });
    if (!ficha) return;
    setData((p) => ({ ...p, erros: [ficha, ...(p.erros || []).filter((e) => e.id !== ficha.id)] }));
    notify("Foi para o caderno de erros.");
  };

  const mudar = (k, v) => setF((x) => {
    const n = { ...x, [k]: v };
    if (k === "area") { n.esp = ""; n.tema = ""; }
    if (k === "esp") n.tema = "";
    if (k === "instituicao") n.ano = 0;
    return n;
  });

  const selectEstilo = { width: "100%", minHeight: 42, borderRadius: 12, padding: "0 10px", background: T.card2, border: `1px solid ${T.line}`, color: T.ink, fontFamily: F_UI, fontSize: 14 };
  const q = lista[pos];

  return (
    <div className="flex flex-col gap-5" data-teste="banco">
      <Card className="px-5 sm:px-6 py-6">
        <H color="var(--a-CI)" icon={<ClipboardList size={16} />}>Banco de questões</H>
        <Texto style={{ marginTop: 8 }}>
          Questões de provas de residência com gabarito comentado, alternativa por alternativa.
          Filtre por área, especialidade, tema, prova e ano, tente responder e só então veja o comentário.
        </Texto>
        <div className="mt-3 flex gap-4 flex-wrap" data-teste="banco-resumo">
          <Mini>{provas === null ? "carregando…" : `${totalBanco} questões de ${(provas || []).length} provas no banco`}</Mini>
          <Mini>{Object.keys(respostas).length === 1 ? "1 respondida" : `${Object.keys(respostas).length} respondidas`} por você</Mini>
        </div>
        {erro ? <Mini style={{ color: T.bad, marginTop: 10 }}>{erro}</Mini> : null}

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Área">
            <select value={f.area} onChange={(e) => mudar("area", e.target.value)} style={selectEstilo} data-teste="filtro-area">
              <option value="">Todas as áreas</option>
              {AREA_IDS.map((a) => <option key={a} value={a}>{aLabel(a)} ({c.areas[a] || 0})</option>)}
            </select>
          </Field>
          <Field label="Especialidade">
            <select value={f.esp} onChange={(e) => mudar("esp", e.target.value)} style={selectEstilo} disabled={!f.area} data-teste="filtro-esp">
              <option value="">{f.area ? "Todas da área" : "Escolha a área antes"}</option>
              {espsDaArea.map((e) => <option key={e} value={e}>{e} ({c.esps[`${f.area}|${e}`] || 0})</option>)}
            </select>
          </Field>
          <Field label="Tema">
            <select value={f.tema} onChange={(e) => mudar("tema", e.target.value)} style={selectEstilo} disabled={!f.esp} data-teste="filtro-tema">
              <option value="">{f.esp ? "Todos da especialidade" : "Escolha a especialidade antes"}</option>
              {temasDaEsp.map((t) => <option key={t} value={t}>{t} ({c.temas[`${f.area}|${f.esp}|${t}`] || 0})</option>)}
            </select>
          </Field>
          <Field label="Prova">
            <select value={f.instituicao} onChange={(e) => mudar("instituicao", e.target.value)} style={selectEstilo} data-teste="filtro-prova">
              <option value="">Todas as provas</option>
              {bancas.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Ano">
            <select value={f.ano || ""} onChange={(e) => mudar("ano", Number(e.target.value) || 0)} style={selectEstilo} data-teste="filtro-ano">
              <option value="">Todos os anos</option>
              {anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Quais">
            <select value={f.status} onChange={(e) => mudar("status", e.target.value)} style={selectEstilo} data-teste="filtro-status">
              <option value="todas">Todas</option>
              <option value="nao">Só as que não respondi</option>
              <option value="errei">Só as que errei</option>
            </select>
          </Field>
        </div>
        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <Btn tone="primary" onClick={comecar} disabled={buscando || !c.total}>{buscando ? "Buscando…" : treinando ? "Recomeçar com estes filtros" : "Começar"}</Btn>
          <span data-teste="banco-contagem"><Mini>{c.total} questões neste filtro{f.status !== "todas" ? " (antes de tirar as respondidas)" : ""}</Mini></span>
        </div>
      </Card>

      {treinando && q ? (
        <QuestaoDoBanco q={q} resposta={lerResposta(respostas[q.id])} aoResponder={responder}
          aoProxima={proxima} aoCaderno={paraCaderno} n={pos + 1} total={lista.length} temProxima={!fim} />
      ) : null}
      {treinando && !q && !buscando ? (
        <Card className="px-6 py-6"><Mini>Nenhuma questão com esses filtros{f.status !== "todas" ? " que você ainda não tenha respondido" : ""}.</Mini></Card>
      ) : null}
      {treinando && sessao.feitas ? (
        <span data-teste="banco-sessao" className="px-1"><Mini>Nesta sessão: {sessao.certas} de {sessao.feitas} ({Math.round((sessao.certas / sessao.feitas) * 100)}%)</Mini></span>
      ) : null}

      {Object.keys(desempenho).length ? (
        <Card className="px-5 sm:px-6 py-5">
          <Label>Seu acerto no banco, por área</Label>
          <div className="mt-3 flex gap-2.5 flex-wrap">
            {AREA_IDS.filter((a) => desempenho[a]).map((a) => (
              <div key={a} className="rounded-2xl px-3.5 py-2.5" style={{ background: soft(aColor(a), 10), border: `1px solid ${soft(aColor(a), 35)}` }}>
                <div style={{ fontSize: 12, color: aColor(a), fontWeight: 700 }}>{aLabel(a)}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{Math.round((desempenho[a].certas / desempenho[a].feitas) * 100)}%</div>
                <Mini>{desempenho[a].certas} de {desempenho[a].feitas}</Mini>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {souDono ? <MontarBanco nuvem={nuvem} notify={notify} aoMudar={carregarFiltros} /> : null}
    </div>
  );
}
