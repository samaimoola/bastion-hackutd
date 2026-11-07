// Original procedural city artwork: layered SVG silhouettes with lit windows and haze.
type Layer = { fill: string; base: number; minH: number; maxH: number; minW: number; maxW: number; windows: number; seed: number };

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

function buildLayer(l: Layer, width: number) {
  const r = rng(l.seed);
  const blocks: { x: number; w: number; h: number; spire: boolean }[] = [];
  let x = -20;
  while (x < width + 20) {
    const w = l.minW + r() * (l.maxW - l.minW);
    const h = l.minH + r() * (l.maxH - l.minH);
    blocks.push({ x, w, h, spire: r() > 0.86 });
    x += w + r() * 6;
  }
  const lights: { x: number; y: number; warm: boolean }[] = [];
  for (const b of blocks) {
    for (let wy = l.base - b.h + 10; wy < l.base - 6; wy += 9) {
      for (let wx = b.x + 5; wx < b.x + b.w - 5; wx += 7) {
        if (r() < l.windows) lights.push({ x: wx, y: wy, warm: r() > 0.3 });
      }
    }
  }
  return { blocks, lights };
}

export function CitySkyline({ variant = "shell", className = "" }: { variant?: "shell" | "hero"; className?: string }) {
  const W = 1600;
  const H = variant === "hero" ? 700 : 420;
  const k = variant === "hero" ? 1 : 0.7;
  const layers: (Layer & { cls: string; lightOpacity: number })[] = [
    { fill: "", cls: "fill-building-far", base: H, minH: 120 * k, maxH: 300 * k, minW: 30, maxW: 70, windows: 0.04, seed: 7, lightOpacity: 0.35 },
    { fill: "", cls: "fill-building-mid", base: H, minH: 80 * k, maxH: 220 * k, minW: 40, maxW: 100, windows: 0.06, seed: 23, lightOpacity: 0.55 },
    { fill: "", cls: "fill-building-near", base: H, minH: 40 * k, maxH: 140 * k, minW: 60, maxW: 140, windows: variant === "hero" ? 0.05 : 0.025, seed: 51, lightOpacity: 0.75 },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`haze-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--haze)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--haze)" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      {variant === "hero" && (
        <g className="fill-window" opacity="0.5">
          {Array.from({ length: 60 }).map((_, i) => {
            const r = rng(i + 3);
            return <circle key={i} cx={r() * W} cy={r() * H * 0.45} r={r() * 1.1 + 0.3} />;
          })}
        </g>
      )}
      {layers.map((l, i) => {
        const { blocks, lights } = buildLayer(l, W);
        return (
          <g key={i}>
            <g className={l.cls}>
              {blocks.map((b, j) => (
                <g key={j}>
                  <rect x={b.x} y={l.base - b.h} width={b.w} height={b.h} />
                  {b.spire && <rect x={b.x + b.w / 2 - 1.5} y={l.base - b.h - 30} width={3} height={30} />}
                </g>
              ))}
            </g>
            <g opacity={l.lightOpacity}>
              {lights.map((p, j) => (
                <rect key={j} x={p.x} y={p.y} width={2.5} height={3.5} className={p.warm ? "fill-window" : "fill-window-cool"} />
              ))}
            </g>
            {i < 2 && <rect x="0" y={H * 0.35} width={W} height={H * 0.65} fill={`url(#haze-${variant})`} />}
          </g>
        );
      })}
    </svg>
  );
}

export function BastionEmblem({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M16 2 L28 7 V16 C28 23 22.5 28 16 30 C9.5 28 4 23 4 16 V7 Z" className="fill-primary/10 stroke-primary" strokeWidth="1.5" />
      <path d="M10 22 V14 H12.5 V11 H15 V14 H17 V11 H19.5 V14 H22 V22 Z" className="fill-primary" />
      <rect x="14.5" y="17.5" width="3" height="4.5" rx="1.5" className="fill-background" />
    </svg>
  );
}
