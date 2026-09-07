/* ═══════════════════════════════════════════════════════════════════
   20 · CENA DE FUNDO
   Campo de poeira estelar em profundidade, um chão em fuga e a rede
   neural girando, com pulsos de luz correndo pelas ligações. Tudo em
   canvas 2D, sem biblioteca: são poucos kilobytes e roda liso até em
   celular. Respeita quem pediu menos animação no sistema.
   ═══════════════════════════════════════════════════════════════════ */

/* Converte #RRGGBB em "r,g,b", para montar rgba() sem criar string de cor
   nova a cada ponto pintado. */
function rgbDe(hex, reserva) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return reserva;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function Cena({ cor1, cor2, chave, ativo = true }) {
  const ref = useRef(null);
  const raf = useRef(0);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !ativo) return undefined;
    const ctx = cv.getContext("2d");
    if (!ctx) return undefined;
    let parar = false;

    let reduzido = false;
    try {
      reduzido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) { /* noop */ }

    /* o canvas não entende var(--x): resolve para cor real antes de pintar */
    const resolver = (c) => {
      if (typeof c !== "string" || c.indexOf("var(") !== 0) return c;
      try {
        const v = getComputedStyle(document.documentElement)
          .getPropertyValue(c.slice(4, -1).trim()).trim();
        return v || "#35E4FF";
      } catch (e) { return "#35E4FF"; }
    };
    const C1 = rgbDe(resolver(cor1), "53,228,255");
    const C2 = rgbDe(resolver(cor2), "168,85,247");
    const claro = (() => {
      try { return document.documentElement.getAttribute("data-theme") === "light"; }
      catch (e) { return false; }
    })();
    /* no tema claro tudo isso vira quase invisível, senão o texto some */
    const F = claro ? 0.2 : 1;

    let L = 0, A = 0, escala = 1;
    const medir = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      L = cv.clientWidth; A = cv.clientHeight;
      cv.width = Math.max(1, Math.floor(L * dpr));
      cv.height = Math.max(1, Math.floor(A * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* menos partículas em tela pequena, para o celular não engasgar */
      escala = Math.min(1, Math.max(0.42, (L * A) / (1440 * 900)));
    };
    medir();
    window.addEventListener("resize", medir);

    /* ── rede neural: pontos espalhados por igual numa esfera ──────── */
    const N = Math.round(160 * Math.max(0.6, escala));
    const nos = [];
    const passo = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = passo * i;
      nos.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r });
    }

    /* vizinhos: calculados uma vez, já que giram juntos */
    const pares = [];
    const limite = 0.42;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = nos[i].x - nos[j].x, dy = nos[i].y - nos[j].y, dz = nos[i].z - nos[j].z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < limite) pares.push([i, j, 1 - d / limite]);
      }
    }

    /* pulsos de luz que correm por uma ligação e somem no fim */
    const pulsos = [];
    const novoPulso = () => {
      if (!pares.length) return;
      pulsos.push({ par: pares[(Math.random() * pares.length) | 0], t: 0, v: 0.006 + Math.random() * 0.012 });
    };

    /* ── poeira estelar em profundidade ───────────────────────────── */
    const QTD = Math.round(180 * escala);
    const poeira = Array.from({ length: QTD }, () => ({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z: Math.random(),                       // 0 é longe, 1 é perto
      b: 0.25 + Math.random() * 0.75,         // brilho
      f: 0.4 + Math.random() * 1.6,           // ritmo do piscar
    }));

    let mx = 0.5, my = 0.5, amx = 0.5, amy = 0.5;
    const mover = (e) => {
      const t = e.touches ? e.touches[0] : e;
      mx = t.clientX / Math.max(1, window.innerWidth);
      my = t.clientY / Math.max(1, window.innerHeight);
    };
    window.addEventListener("pointermove", mover, { passive: true });

    let anterior = 0;

    const pintar = (t) => {
      if (parar) return;
      const dt = anterior ? Math.min(64, t - anterior) : 16;
      anterior = t;

      ctx.clearRect(0, 0, L, A);
      amx += (mx - amx) * 0.045;
      amy += (my - amy) * 0.045;
      const px = (amx - 0.5), py = (amy - 0.5);

      /* ── chão em fuga, lá embaixo, dando a sensação de espaço ───── */
      const horizonte = A * 0.80;
      ctx.lineWidth = 1;
      for (let i = 1; i <= 11; i++) {
        const f = i / 11;
        const y = horizonte + (A - horizonte) * f * f;
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(L, y);
        ctx.strokeStyle = `rgba(${C2},${(0.02 + f * 0.07) * F})`;
        ctx.stroke();
      }
      const fuga = L * 0.5 + px * L * 0.10;
      for (let i = -9; i <= 9; i++) {
        ctx.beginPath();
        ctx.moveTo(fuga + i * (L * 0.02), horizonte);
        ctx.lineTo(fuga + i * (L * 0.30), A);
        ctx.strokeStyle = `rgba(${C2},${0.05 * F})`;
        ctx.stroke();
      }

      /* ── malha técnica, quase imperceptível ─────────────────────── */
      ctx.strokeStyle = `rgba(${C1},${0.05 * F})`;
      const celula = 118;
      ctx.beginPath();
      for (let x = (px * 22) % celula; x < L; x += celula) { ctx.moveTo(x, 0); ctx.lineTo(x, A); }
      for (let y = (py * 22) % celula; y < A; y += celula) { ctx.moveTo(0, y); ctx.lineTo(L, y); }
      ctx.stroke();

      /* miras nos cruzamentos, como marcação de projeto */
      ctx.strokeStyle = `rgba(${C1},${0.15 * F})`;
      ctx.beginPath();
      const braco = 4;
      for (let x = (px * 22) % celula; x < L; x += celula * 2) {
        for (let y = (py * 22) % celula; y < A; y += celula * 2) {
          ctx.moveTo(x - braco, y); ctx.lineTo(x + braco, y);
          ctx.moveTo(x, y - braco); ctx.lineTo(x, y + braco);
        }
      }
      ctx.stroke();

      /* ── poeira: os pontos vêm vindo na direção de quem olha ────── */
      const cxT = L / 2, cyT = A / 2;
      const cursorX = amx * L, cursorY = amy * A;
      for (const d of poeira) {
        if (!reduzido) {
          d.z += dt * 0.000045;
          if (d.z > 1) { d.z = 0; d.x = Math.random() * 2 - 1; d.y = Math.random() * 2 - 1; }
        }
        const prof = 0.25 + d.z * 1.5;
        const x = cxT + (d.x * L * 0.75 - px * 90 * prof) * prof;
        const y = cyT + (d.y * A * 0.75 - py * 70 * prof) * prof;
        if (x < -20 || x > L + 20 || y < -20 || y > A + 20) continue;
        const cintila = reduzido ? 1 : 0.65 + 0.35 * Math.sin(t * 0.0013 * d.f + d.b * 9);
        const a = d.b * cintila * (0.10 + d.z * 0.45) * F;
        const r = 0.5 + d.z * 1.7;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${d.z > 0.66 ? C2 : C1},${a})`;
        ctx.fill();

        /* perto do cursor a poeira se liga a ele, como um campo */
        const dx = x - cursorX, dy = y - cursorY;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < 24000) {
          ctx.beginPath();
          ctx.moveTo(cursorX, cursorY); ctx.lineTo(x, y);
          ctx.strokeStyle = `rgba(${C1},${(1 - dist2 / 24000) * 0.16 * F})`;
          ctx.stroke();
        }
      }

      /* ── rede neural ────────────────────────────────────────────── */
      const R = Math.min(L, A) * (L > 900 ? 0.34 : 0.42);
      const cx = L > 900 ? L * 0.74 : L * 0.5;
      const cy = A * 0.44;

      const ay = t * 0.00012 + px * 0.7;
      const ax = -0.32 + py * 0.35;
      const cosY = Math.cos(ay), sinY = Math.sin(ay);
      const cosX = Math.cos(ax), sinX = Math.sin(ax);

      const proj = nos.map((p) => {
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;
        const persp = 1.7 / (1.7 + z2);          // pontos de trás encolhem
        return { x: cx + x1 * R * persp, y: cy + y2 * R * persp, z: z2, p: persp };
      });

      for (const par of pares) {
        const a = proj[par[0]], b = proj[par[1]];
        const prof = (a.z + b.z) / 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(${prof < 0 ? C1 : C2},${Math.max(0.03, (0.30 - prof * 0.16) * par[2]) * F})`;
        ctx.lineWidth = prof < 0 ? 0.9 : 0.6;
        ctx.stroke();
      }
      ctx.lineWidth = 1;

      /* pulsos correndo pelas ligações */
      if (!reduzido && pulsos.length < 7 && Math.random() < 0.045) novoPulso();
      for (let i = pulsos.length - 1; i >= 0; i--) {
        const pu = pulsos[i];
        pu.t += pu.v * (dt / 16);
        if (pu.t >= 1) { pulsos.splice(i, 1); continue; }
        const a = proj[pu.par[0]], b = proj[pu.par[1]];
        const x = a.x + (b.x - a.x) * pu.t, y = a.y + (b.y - a.y) * pu.t;
        const forca = Math.sin(pu.t * Math.PI);
        ctx.beginPath();
        ctx.arc(x, y, 1.6 + forca * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${C1},${forca * 0.85 * F})`;
        ctx.shadowColor = `rgba(${C1},1)`;
        ctx.shadowBlur = 10 * forca;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      for (const q of proj) {
        const r = Math.max(0.6, q.p * 1.7);
        ctx.beginPath();
        ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${q.z < 0 ? C1 : C2},${Math.max(0.14, 0.78 - q.z * 0.4) * F})`;
        if (q.z < -0.5) { ctx.shadowColor = `rgba(${C1},1)`; ctx.shadowBlur = 9; }
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      raf.current = window.requestAnimationFrame(pintar);
    };

    if (reduzido) pintar(0);
    else raf.current = window.requestAnimationFrame(pintar);

    return () => {
      parar = true;
      window.cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", medir);
      window.removeEventListener("pointermove", mover);
    };
  }, [cor1, cor2, chave, ativo]);

  return (
    <canvas ref={ref} aria-hidden="true"
      style={{
        position: "fixed", inset: 0, width: "100%", height: "100%",
        pointerEvents: "none", zIndex: 0,
      }} />
  );
}

/* ═══════════════════════════════════════════════════════════════════
   21 · NÚMERO QUE CONTA ATÉ O VALOR
   ═══════════════════════════════════════════════════════════════════ */

function useContagem(alvo, dur = 850) {
  const [v, setV] = useState(alvo);
  const de = useRef(alvo);
  useEffect(() => {
    let reduzido = false;
    try {
      reduzido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) { /* noop */ }
    const inicio = de.current;
    if (reduzido || inicio === alvo) { de.current = alvo; setV(alvo); return undefined; }
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / dur);
      const suave = 1 - Math.pow(1 - p, 3);
      setV(inicio + (alvo - inicio) * suave);
      if (p >= 1) { window.clearInterval(id); de.current = alvo; }
    }, 32);
    return () => window.clearInterval(id);
  }, [alvo, dur]);
  return v;
}

/* ═══════════════════════════════════════════════════════════════════
   22 · MEDIDOR CIRCULAR
   ═══════════════════════════════════════════════════════════════════ */

function Medidor({ pct, cor, tamanho = 92, largura = 7, children, atraso = 0 }) {
  const [mostrar, setMostrar] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setMostrar(true), 60 + atraso);
    return () => window.clearTimeout(id);
  }, [atraso]);
  const r = tamanho / 2 - largura;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, (pct || 0) / 100));
  return (
    <div style={{ position: "relative", width: tamanho, height: tamanho, flexShrink: 0 }}>
      <svg width={tamanho} height={tamanho} style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="var(--card3)" strokeWidth={largura} />
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke={cor}
          strokeWidth={largura} strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={circ * (1 - (mostrar ? p : 0))}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)", filter: `drop-shadow(0 0 6px ${cor})` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   23 · RADAR DAS ÁREAS
   Um polígono por área, com o preenchimento proporcional ao que já foi
   estudado. Dá para enxergar o desequilíbrio de relance.
   ═══════════════════════════════════════════════════════════════════ */

function Radar({ dados, tamanho = 300 }) {
  const [entrou, setEntrou] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setEntrou(true), 120);
    return () => window.clearTimeout(id);
  }, []);
  const c = tamanho / 2;
  const raio = c - 46;
  const n = dados.length;
  const ponto = (i, f) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(a) * raio * f, c + Math.sin(a) * raio * f];
  };
  const caminho = dados
    .map((d, i) => ponto(i, entrou ? Math.max(0.04, d.pct / 100) : 0.04).join(","))
    .join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${tamanho} ${tamanho}`} style={{ display: "block", maxWidth: tamanho, margin: "0 auto" }}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} fill="none" stroke="var(--line)" strokeWidth="1"
          points={dados.map((_, i) => ponto(i, f).join(",")).join(" ")} />
      ))}
      {dados.map((_, i) => {
        const [x, y] = ponto(i, 1);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--line)" strokeWidth="1" />;
      })}
      <polygon points={caminho} fill="var(--neon)" fillOpacity="0.16" stroke="var(--neon)" strokeWidth="2"
        style={{ transition: "all 1.2s cubic-bezier(.2,.8,.2,1)", filter: "drop-shadow(0 0 8px var(--neon))" }} />
      {dados.map((d, i) => {
        const [x, y] = ponto(i, entrou ? Math.max(0.04, d.pct / 100) : 0.04);
        return <circle key={d.rotulo} cx={x} cy={y} r="4" fill={d.cor}
          style={{ transition: "all 1.2s cubic-bezier(.2,.8,.2,1)" }} />;
      })}
      {dados.map((d, i) => {
        const [x, y] = ponto(i, 1.2);
        return (
          <g key={`t${d.rotulo}`}>
            <text x={x} y={y - 4} textAnchor="middle" fill={d.cor}
              style={{ fontSize: 12, fontWeight: 700, fontFamily: F_UI }}>{d.rotulo}</text>
            <text x={x} y={y + 11} textAnchor="middle" fill="var(--faint)"
              style={{ fontSize: 11, fontFamily: F_MONO }}>{Math.round(d.pct)}%</text>
          </g>
        );
      })}
    </svg>
  );
}
