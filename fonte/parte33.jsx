/* ═══════════════════════════════════════════════════════════════════
   43 · O VISUAL NOVO: AVISO PARA QUEM JÁ USAVA E ESCOLHA NA INSCRIÇÃO

   Quem já tinha dados guardados continua no neon de antes (a migração está
   em normalize, parte2: dado sem tema.versaoVisual é de antes do visual
   limpo). Na primeira vez que essa pessoa abre o site depois da mudança,
   aparece um cartão no topo avisando que existe um visual novo, com as
   opções para testar ali mesmo, vendo o site mudar na hora. Ela decide e
   o cartão some (tema.avisoVisual volta a falso).

   Quem cria a conta agora escolhe o visual no próprio formulário de
   inscrição. O padrão para conta nova é o limpo.
   ═══════════════════════════════════════════════════════════════════ */

const OPCOES_VISUAL = [
  { id: "limpo", nome: "Limpo", desc: "Fundo liso, sem brilho, com o roxo da marca. O visual novo." },
  { id: "neon", nome: "Neon", desc: "O visual de sempre, com partículas, brilho e cores vivas." },
];

/* Uma miniatura desenhada com CSS: dá para ver a diferença sem precisar
   trocar o site inteiro. */
function MiniaturaVisual({ visual, escuro }) {
  const neon = visual === "neon";
  const fundo = neon
    ? "radial-gradient(120% 90% at 20% 10%, rgba(168,85,247,.55), transparent 60%), radial-gradient(90% 80% at 90% 90%, rgba(236,72,153,.45), transparent 60%), #0B0714"
    : escuro ? "#0E0D13" : "#F5F4F8";
  const cartao = neon ? "rgba(255,255,255,.08)" : escuro ? "#1B1924" : "#FFFFFF";
  const borda = neon ? "rgba(216,180,254,.45)" : escuro ? "rgba(255,255,255,.1)" : "#E6E3EC";
  const linha = neon ? "rgba(255,255,255,.55)" : escuro ? "rgba(255,255,255,.35)" : "#CFCADB";
  return (
    <div aria-hidden="true" style={{
      height: 74, borderRadius: 12, background: fundo, padding: 10, overflow: "hidden",
      display: "flex", flexDirection: "column", gap: 6, border: `1px solid ${borda}`,
    }}>
      <div style={{ width: 46, height: 6, borderRadius: 99, background: neon ? "linear-gradient(90deg,#C084FC,#F472B6)" : "#7C3AED", boxShadow: neon ? "0 0 10px rgba(192,132,252,.9)" : "none" }} />
      <div style={{ flex: 1, borderRadius: 8, background: cartao, border: `1px solid ${borda}`, padding: 7, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ width: "70%", height: 4, borderRadius: 99, background: linha }} />
        <div style={{ width: "45%", height: 4, borderRadius: 99, background: linha }} />
      </div>
    </div>
  );
}

/* As escolhas de aparência num bloco só: visual, fundo claro ou escuro e,
   no limpo escuro, o tom. Usado no aviso e na inscrição. */
function EscolhaVisual({ tema, theme, mudarTema, mudarFundo, compacto }) {
  const visual = (tema && tema.visual) === "neon" ? "neon" : "limpo";
  const escuroTom = (tema && tema.escuro) === "azul" ? "azul" : "preto";
  const pilula = (on, txt, fazer, teste) => (
    <button key={txt} type="button" onClick={fazer} data-teste={teste}
      aria-pressed={on ? "true" : "false"}
      style={{
        padding: "7px 14px", borderRadius: 99, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
        background: on ? "color-mix(in srgb, var(--neon) 14%, transparent)" : "transparent",
        border: `1px solid ${on ? "color-mix(in srgb, var(--neon) 55%, transparent)" : T.line}`,
        color: on ? T.ink : T.dim,
      }}>{txt}</button>
  );
  return (
    <div data-teste="escolha-visual-rapida" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {OPCOES_VISUAL.map((o) => {
          const on = visual === o.id;
          return (
            <button key={o.id} type="button" onClick={() => mudarTema({ visual: o.id })}
              data-teste={`visual-${o.id}`} aria-pressed={on ? "true" : "false"}
              style={{
                textAlign: "left", borderRadius: 16, padding: 8, cursor: "pointer", color: T.ink,
                background: on ? "color-mix(in srgb, var(--neon) 10%, transparent)" : "transparent",
                border: `${on ? 2 : 1}px solid ${on ? "var(--neon)" : T.line}`,
              }}>
              <MiniaturaVisual visual={o.id} escuro={theme === "dark"} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 14.5, fontWeight: 700 }}>
                {on ? <Check size={14} style={{ color: "var(--neon)" }} /> : null}{o.nome}
              </div>
              {compacto ? null : <div style={{ fontSize: 12.5, lineHeight: 1.45, color: T.faint, marginTop: 2 }}>{o.desc}</div>}
            </button>
          );
        })}
      </div>
      {mudarFundo ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: T.faint, marginRight: 2 }}>Fundo</span>
          {pilula(theme === "dark", "Escuro", () => mudarFundo("dark"), "fundo-escuro")}
          {pilula(theme !== "dark", "Claro", () => mudarFundo("light"), "fundo-claro")}
        </div>
      ) : null}
      {mudarFundo && visual === "limpo" && theme === "dark" ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: T.faint, marginRight: 2 }}>Tom</span>
          {pilula(escuroTom === "preto", "Preto", () => mudarTema({ escuro: "preto" }), "tom-preto")}
          {pilula(escuroTom === "azul", "Azul-noite", () => mudarTema({ escuro: "azul" }), "tom-azul")}
        </div>
      ) : null}
    </div>
  );
}

/* O cartão do topo, para quem já usava o site. Não bloqueia nada: dá para
   seguir estudando e decidir depois, mas ele fica ali até a escolha. */
function AvisoVisualNovo({ data, setData }) {
  const mudarTema = (m) => setData((p) => ({ ...p, tema: { ...p.tema, ...m } }));
  const mudarFundo = (t) => setData((p) => ({ ...p, theme: t }));
  const decidir = () => setData((p) => ({ ...p, tema: { ...p.tema, avisoVisual: false } }));
  return (
    <section data-teste="aviso-visual-novo" aria-label="Visual novo"
      style={{
        borderRadius: 20, padding: "18px 18px 16px", background: T.card,
        border: "1px solid color-mix(in srgb, var(--neon) 45%, transparent)",
        boxShadow: "0 10px 30px -18px color-mix(in srgb, var(--neon) 70%, transparent)",
      }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "color-mix(in srgb, var(--neon) 16%, transparent)", color: "var(--neon)",
        }}><Sparkles size={18} /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>Novidade: o site ganhou um visual novo</div>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: T.dim, marginTop: 3 }}>
            Você continua no neon de sempre. Quer experimentar? Toque nas opções abaixo e o site muda na hora.
            Teste à vontade e fique com o que preferir.
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <EscolhaVisual tema={data.tema} theme={data.theme} mudarTema={mudarTema} mudarFundo={mudarFundo} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 14 }}>
        <button type="button" className="btn-neon" onClick={decidir} data-teste="aviso-visual-ficar"
          style={{ padding: "9px 18px", borderRadius: 99, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Ficar com este visual
        </button>
        <span style={{ fontSize: 12.5, color: T.faint }}>Dá para trocar quando quiser em Configurações, Aparência.</span>
      </div>
    </section>
  );
}
