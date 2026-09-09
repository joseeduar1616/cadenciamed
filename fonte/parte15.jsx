/* ═══════════════════════════════════════════════════════════════════
   29 · CRONOGRAMA DO NOTION (MEDPlanner)

   Quem já organiza o ano num MEDPlanner do Notion não deveria ter de
   marcar tudo de novo aqui. Esta parte liga a conta do Notion, lê o
   planner e traz para o app o que já foi feito: a aula, as questões, os
   cartões, o desempenho e quais revisões foram cumpridas.

   A ligação em si é feita no servidor, em /api/notion: a troca do código
   pelo token exige o segredo da integração, que não pode morar dentro da
   página. O token de leitura do Notion de cada pessoa fica guardado lá e
   nunca chega até aqui.

   O encaixe entre o planner e as aulas do site é feito por comparação de
   texto, e não por adivinhação: o que casa com folga entra sozinho, e o
   que ficou na dúvida aparece na tela para a pessoa conferir antes. Um
   encaixe errado escreveria por cima do progresso de alguém.
   ═══════════════════════════════════════════════════════════════════ */

const ROTA_NOTION = "/api/notion";

/* De MEDCURSO para as siglas de área do app. */
const AREA_NOTION = {
  "CLINICA": "CL", "CIRURGIA": "CI", "GO": "GO",
  "PEDIATRIA": "PE", "PREVENTIVA": "PR",
};

/* Palavras que não ajudam a distinguir uma aula da outra. Contá-las faria
   "Doenças Clínicas do Intestino" e "Doenças Cirúrgicas do Intestino"
   parecerem quase a mesma aula. */
const VAZIAS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "as", "os",
  "em", "no", "na", "ao", "aos", "com", "por", "para", "i", "ii", "iii", "iv"]);

function palavras(s) {
  const limpo = String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return limpo ? limpo.split(" ").filter((p) => p && !VAZIAS.has(p)) : [];
}

const chaveTexto = (s) => palavras(s).join(" ");

/* Quanto duas listas de palavras se cobrem, de 0 a 1.
 *
 * Divide pela lista menor de propósito: o planner escreve "Pancreatite
 * Aguda e Crônica Câncer de Pâncreas" e o site "Pancreatite Aguda e
 * Crônica; Câncer de Pâncreas" — mesma aula, tamanhos diferentes. */
function parecenca(a, b) {
  if (!a.length || !b.length) return 0;
  const seta = new Set(a);
  let juntas = 0;
  for (const p of new Set(b)) if (seta.has(p)) juntas += 1;
  return juntas / Math.min(new Set(a).size, new Set(b).size);
}

/* Acima disto o encaixe entra sozinho; entre os dois, vai para conferência;
   abaixo do menor, a linha fica de fora. */
const CERTO = 0.8;
const TALVEZ = 0.45;

/* Casa cada linha do planner com uma aula do site.
 *
 * Uma aula só é usada uma vez: sem isso, duas semanas parecidas do planner
 * escreveriam as duas em cima da mesma aula, e a segunda apagaria a
 * primeira. */
function casar(linhas, aulas) {
  const usadas = new Set();
  const chaves = aulas.map((s) => ({ aula: s, pal: palavras(s.title), exata: chaveTexto(s.title) }));

  /* Duas passadas: primeiro os títulos idênticos, depois os parecidos. Sem
     isso um título parecido poderia tomar a aula de um que era igual. */
  const saida = linhas.map((l) => ({ linha: l, aula: null, nota: 0 }));

  for (const item of saida) {
    const exata = chaveTexto(item.linha.tema);
    if (!exata) continue;
    const achou = chaves.find((c) => c.exata === exata && !usadas.has(c.aula.id));
    if (achou) { item.aula = achou.aula; item.nota = 1; usadas.add(achou.aula.id); }
  }

  for (const item of saida) {
    if (item.aula) continue;
    const pal = palavras(item.linha.tema);
    if (!pal.length) continue;
    const areas = (item.linha.areas || []).map((a) => AREA_NOTION[
      String(a || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    ]).filter(Boolean);

    let melhor = null;
    let nota = 0;
    for (const c of chaves) {
      if (usadas.has(c.aula.id)) continue;
      let n = parecenca(pal, c.pal);
      /* A área é desempate, não regra: quem edita o planner às vezes deixa
         a área em branco, e exigi-la jogaria fora encaixes bons. */
      if (areas.length && areas.indexOf(c.aula.area) < 0) n *= 0.75;
      if (n > nota) { nota = n; melhor = c; }
    }
    if (melhor && nota >= TALVEZ) {
      item.aula = melhor.aula; item.nota = nota; usadas.add(melhor.aula.id);
    }
  }

  return saida;
}

async function falarComNotion(nuvem, corpo) {
  let token = "";
  try {
    if (nuvem && nuvem.sdk && nuvem.sdk.auth && nuvem.sdk.auth.currentUser) {
      token = await nuvem.sdk.auth.currentUser.getIdToken();
    }
  } catch (e) { /* segue sem token, o servidor recusa */ }
  if (!token) return { erro: "Entre na sua conta para ligar o Notion." };
  const { dados, erro } = await chamarApi(ROTA_NOTION, { ...corpo, token }, "O Notion");
  return erro ? { erro } : dados;
}

/* O endereço para onde o Notion devolve quem autorizou. Precisa ser o mesmo
   cadastrado na integração, e é ele que o app reconhece na volta. */
const CAMINHO_NOTION = "/notion";

/* Estamos voltando da autorização?
 *
 * Confere o caminho, e não só o "code": um endereço com code pode vir de
 * outra coisa, e consumir esse código aqui o gastaria à toa. */
function voltandoDoNotion() {
  try {
    const u = new URL(window.location.href);
    return u.pathname.replace(/\/+$/, "") === CAMINHO_NOTION && !!u.searchParams.get("code");
  } catch (e) { return false; }
}

/* O código que o Notion devolve chega na barra de endereço, na volta da
   autorização. Ler e limpar logo: um código de autorização no endereço
   fica no histórico do navegador e vaza em qualquer captura de tela. */
function pegarCodigoDaUrl() {
  if (!voltandoDoNotion()) return "";
  try {
    const u = new URL(window.location.href);
    const codigo = u.searchParams.get("code");
    if (!codigo) return "";
    u.searchParams.delete("code");
    u.searchParams.delete("state");
    /* Volta para a raiz: deixar o endereço em /notion faria um F5 parecer
       uma nova autorização, agora sem código nenhum. */
    window.history.replaceState({}, "", "/" + u.search + u.hash);
    return codigo;
  } catch (e) { return ""; }
}

/* O que a importação vai escrever, montado antes de escrever nada.
 *
 * Separado da gravação de propósito: assim a tela mostra o que vai
 * acontecer, e a pessoa decide. */
function planoDeImportacao(pares, marks) {
  const certos = [];
  const duvidas = [];
  const sobraram = [];

  for (const p of pares) {
    if (!p.aula) { sobraram.push(p); continue; }
    if (p.nota >= CERTO) certos.push(p); else duvidas.push(p);
  }

  const mudanca = (p) => {
    const m = marks[p.aula.id] || {};
    const novo = {};
    if (p.linha.aula && !m.aula) novo.aula = true;
    if (p.linha.qtsPos && !m.qts) novo.qts = true;
    if (p.linha.cards && !m.cards) novo.cards = true;
    if (p.linha.perf && !m.perf) novo.perf = p.linha.perf;
    if (p.linha.data && !m.date) novo.date = p.linha.data;
    return novo;
  };

  return {
    certos: certos.map((p) => ({ ...p, novo: mudanca(p) })),
    duvidas: duvidas.map((p) => ({ ...p, novo: mudanca(p) })),
    sobraram,
  };
}

function LinhaPlanner({ p, onTrocar, aulas }) {
  const nada = p.novo && Object.keys(p.novo).length === 0;
  return (
    <div className="flex items-start gap-3 rounded-2xl px-4 py-3"
      style={{ background: T.card2, border: `1px solid ${T.line}` }}>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>{p.linha.tema || "(sem tema)"}</div>
        <Mini style={{ marginTop: 2 }}>
          {p.linha.semana}
          {p.linha.data ? ` · ${p.linha.data}` : ""}
          {p.linha.revisoes.length ? ` · ${p.linha.revisoes.length} revisão(ões) marcada(s)` : ""}
        </Mini>
        {p.aula ? (
          onTrocar ? (
            <select value={p.aula.id} className="mt-2 w-full rounded-xl px-3 py-2"
              style={{ background: T.card, border: `1px solid ${T.line}`, color: T.ink, fontSize: 13.5 }}
              onChange={(e) => onTrocar(p, e.target.value)}>
              <option value="">não importar esta linha</option>
              {aulas.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          ) : (
            <Mini style={{ marginTop: 3, color: T.dim }}>→ {p.aula.title}</Mini>
          )
        ) : <Mini style={{ marginTop: 3 }}>sem aula parecida no cronograma do site</Mini>}
      </div>
      {nada ? <Mini style={{ flexShrink: 0 }}>já em dia</Mini> : null}
    </div>
  );
}

function Notion({ nuvem, subjects, data, setData, notify }) {
  const [estado, setEstado] = useState(null);
  const [bancos, setBancos] = useState(null);
  const [banco, setBanco] = useState("");
  const [pares, setPares] = useState(null);
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState("");

  const refNuvem = useRef(nuvem);
  refNuvem.current = nuvem;
  const quem = nuvem && nuvem.usuario ? nuvem.usuario.uid : "";

  const verEstado = useCallback(async () => {
    if (!quem) { setEstado(null); return; }
    const j = await falarComNotion(refNuvem.current, { acao: "estado" });
    if (j.erro) { setErro(j.erro); return; }
    setEstado(j);
    setBanco(j.banco || "");
  }, [quem]);

  useEffect(() => { verEstado(); }, [verEstado]);

  /* Volta da autorização: o código está no endereço. */
  const jaTrocou = useRef(false);
  useEffect(() => {
    if (!quem || jaTrocou.current) return;
    const codigo = pegarCodigoDaUrl();
    if (!codigo) return;
    jaTrocou.current = true;
    (async () => {
      setOcupado("ligando");
      const j = await falarComNotion(refNuvem.current, { acao: "conectar", codigo });
      setOcupado("");
      if (j.erro) { setErro(j.erro); return; }
      notify(`Notion de "${j.oficina}" ligado à sua conta.`);
      verEstado();
    })();
  }, [quem, verEstado, notify]);

  const ligar = async () => {
    setOcupado("indo"); setErro("");
    const j = await falarComNotion(refNuvem.current, { acao: "inicio" });
    setOcupado("");
    if (j.erro) { setErro(j.erro); return; }
    window.location.href = j.endereco;
  };

  const desligar = async () => {
    setOcupado("desligando");
    const j = await falarComNotion(refNuvem.current, { acao: "desligar" });
    setOcupado("");
    if (j.erro) { setErro(j.erro); return; }
    notify(j.mensagem || "Notion desligado.");
    setBancos(null); setPares(null);
    verEstado();
  };

  const listarBancos = async () => {
    setOcupado("lendo"); setErro("");
    const j = await falarComNotion(refNuvem.current, { acao: "bancos" });
    setOcupado("");
    if (j.erro) { setErro(j.erro); return; }
    setBancos(j.bancos || []);
    if (!banco && j.bancos && j.bancos.length === 1) setBanco(j.bancos[0].id);
  };

  const ler = async () => {
    setOcupado("lendo"); setErro(""); setPares(null);
    const j = await falarComNotion(refNuvem.current, { acao: "cronograma", ...(banco ? { banco } : {}) });
    setOcupado("");
    if (j.erro) { setErro(j.erro); return; }
    const linhas = (j.linhas || []).filter((l) => l && l.tema);
    if (!linhas.length) { setErro("Esse cronograma não tem nenhuma linha com tema preenchido."); return; }
    setPares(casar(linhas, subjects));
  };

  const plano = useMemo(
    () => (pares ? planoDeImportacao(pares, data.marks) : null),
    [pares, data.marks]);

  const trocar = (alvo, id) => {
    setPares((atuais) => atuais.map((p) => (p === alvo
      ? { ...p, aula: id ? subjects.find((s) => s.id === id) || null : null, nota: id ? 1 : 0 }
      : p)));
  };

  /* Escreve o que foi conferido.
   *
   * Só acrescenta: o que já está marcado aqui continua como está, e a data
   * de quem já tem data não é trocada. Quem lançou horas no app e depois
   * importa o planner não pode perder o que registrou. */
  const aplicar = (lista) => {
    const escolhidos = lista.filter((p) => p.aula);
    if (!escolhidos.length) { notify("Nada para importar."); return; }

    setData((p) => {
      const marks = { ...p.marks };
      const reviews = { ...p.reviews };
      for (const item of escolhidos) {
        const id = item.aula.id;
        const antes = marks[id] || {};
        marks[id] = {
          ...antes,
          aula: antes.aula || !!item.linha.aula,
          qts: antes.qts || !!item.linha.qtsPos,
          cards: antes.cards || !!item.linha.cards,
          perf: antes.perf || item.linha.perf || 0,
          date: antes.date || item.linha.data || null,
        };
        if (item.linha.revisoes.length) {
          const rec = { ...(reviews[id] || {}) };
          const feitas = { ...(rec.done || {}) };
          const desfeitas = { ...(rec.undone || {}) };
          for (const d of item.linha.revisoes) {
            /* A data de quando a revisão foi feita não existe no planner,
               que só tem a caixa marcada. Fica a data da aula, que é o mais
               próximo da verdade que dá para saber daqui. */
            feitas[String(d)] = item.linha.data || todayISO();
            delete desfeitas[String(d)];
          }
          rec.done = feitas;
          rec.undone = desfeitas;
          if (!rec.anchor) rec.anchor = item.linha.data || todayISO();
          reviews[id] = rec;
        }
      }
      return { ...p, marks, reviews };
    });

    notify(`${escolhidos.length} ${escolhidos.length === 1 ? "aula importada" : "aulas importadas"} do Notion.`);
    setPares(null);
  };

  if (!quem) {
    return (
      <Card className="px-6 py-6">
        <H color="var(--neon2)" icon={<BookMarked size={16} />}>Cronograma do Notion</H>
        <Texto style={{ marginTop: 10 }}>
          Entre na sua conta em Progresso para ligar o seu MEDPlanner do Notion.
        </Texto>
      </Card>
    );
  }

  return (
    <Card className="px-6 py-6" brilho="var(--neon2)">
      <H color="var(--neon2)" icon={<BookMarked size={16} />}>Cronograma do Notion</H>
      <Texto style={{ marginTop: 10 }}>
        Se você organiza o ano num MEDPlanner do Notion, dá para trazer de lá o
        que já foi feito: a aula, as questões, os cartões, o desempenho e as
        revisões marcadas. Nada é escrito por cima — a importação só acrescenta
        o que ainda não está marcado aqui.
      </Texto>

      {estado && !estado.configurado ? (
        <div className="mt-4 rounded-2xl px-4 py-3"
          style={{ background: soft("var(--warn)", 12), border: `1px solid ${soft("var(--warn)", 28)}` }}>
          <Mini style={{ color: T.warn, lineHeight: 1.7 }}>
            A ligação com o Notion ainda não foi cadastrada neste site. Falta criar
            a integração no Notion e guardar NOTION_CLIENT_ID e NOTION_CLIENT_SECRET
            nas variáveis do Worker.
          </Mini>
        </div>
      ) : null}

      <div className="mt-5 flex items-center gap-3 flex-wrap">
        {estado && estado.ligado ? (
          <>
            <span className="inline-flex items-center gap-2 rounded-full px-4 py-2"
              style={{ background: soft("var(--ok)", 14), color: T.ok, fontSize: 13.5, fontWeight: 700 }}>
              <Check size={14} /> {estado.oficina || "Notion"} ligado
            </span>
            <Btn size="sm" tone="outline" onClick={listarBancos} disabled={!!ocupado}>
              escolher o cronograma
            </Btn>
            <Btn size="sm" tone="primary" onClick={ler} disabled={!!ocupado}>
              {ocupado === "lendo" ? "lendo…" : "ler o MEDPlanner"}
            </Btn>
            <Btn size="sm" tone="danger" onClick={desligar} disabled={!!ocupado}>desligar</Btn>
          </>
        ) : (
          <Btn tone="primary" onClick={ligar} disabled={!!ocupado || (estado && !estado.configurado)}>
            {ocupado === "indo" ? "abrindo o Notion…" : ocupado === "ligando" ? "ligando…" : "Entrar com o Notion"}
          </Btn>
        )}
        {erro ? <span style={{ fontSize: 14, color: T.bad }}>{erro}</span> : null}
      </div>

      {bancos ? (
        <div className="mt-4">
          <Field label="Qual cronograma">
            <select value={banco} className="w-full rounded-xl px-3 py-2.5"
              style={{ background: T.card2, border: `1px solid ${T.line}`, color: T.ink, fontSize: 14 }}
              onChange={(e) => setBanco(e.target.value)}>
              <option value="">escolha…</option>
              {bancos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </Field>
          {bancos.length === 0 ? (
            <Mini style={{ marginTop: 8, lineHeight: 1.7 }}>
              Nenhum cronograma apareceu. No Notion, abra o seu MEDPlanner, clique
              nos três pontinhos e compartilhe a página com o Cadência Med.
            </Mini>
          ) : null}
        </div>
      ) : null}

      {plano ? (
        <div className="mt-6 pt-5 flex flex-col gap-4" style={{ borderTop: `1px solid ${T.line}` }}>
          <div>
            <Label>encaixe certo · {plano.certos.length}</Label>
            <Mini style={{ marginTop: 4 }}>
              O tema do planner é o mesmo da aula aqui. Estas entram direto.
            </Mini>
            {plano.certos.length ? (
              <div className="mt-3 flex flex-col gap-2" style={{ maxHeight: 260, overflowY: "auto" }}>
                {plano.certos.map((p, i) => <LinhaPlanner key={`c${i}`} p={p} />)}
              </div>
            ) : null}
          </div>

          {plano.duvidas.length ? (
            <div>
              <Label>confira antes · {plano.duvidas.length}</Label>
              <Mini style={{ marginTop: 4 }}>
                O tema é parecido, mas não igual. Confirme a aula ou tire a linha
                da importação — um encaixe errado marcaria a aula errada.
              </Mini>
              <div className="mt-3 flex flex-col gap-2" style={{ maxHeight: 320, overflowY: "auto" }}>
                {plano.duvidas.map((p, i) => (
                  <LinhaPlanner key={`d${i}`} p={p} aulas={subjects} onTrocar={trocar} />
                ))}
              </div>
            </div>
          ) : null}

          {plano.sobraram.length ? (
            <div>
              <Label>ficaram de fora · {plano.sobraram.length}</Label>
              <Mini style={{ marginTop: 4, lineHeight: 1.7 }}>
                {plano.sobraram.slice(0, 8).map((p) => p.linha.tema).join(" · ")}
                {plano.sobraram.length > 8 ? " …" : ""}
              </Mini>
            </div>
          ) : null}

          <div className="flex items-center gap-3 flex-wrap">
            <Btn tone="primary" onClick={() => aplicar(plano.certos)}>
              importar os {plano.certos.length} certos
            </Btn>
            {plano.duvidas.length ? (
              <Btn tone="outline" onClick={() => aplicar([...plano.certos, ...plano.duvidas])}>
                importar tudo que está marcado ({plano.certos.length + plano.duvidas.filter((p) => p.aula).length})
              </Btn>
            ) : null}
            <Btn tone="ghost" onClick={() => setPares(null)}>cancelar</Btn>
          </div>
        </div>
      ) : null}

      <Mini style={{ marginTop: 16, lineHeight: 1.7 }}>
        O site só lê o Notion, nunca escreve nele. A ligação pode ser desfeita
        aqui a qualquer momento, e pelo próprio Notion, em Configurações →
        Conexões.
      </Mini>
    </Card>
  );
}
