import s from "./RocketArt.module.css";

/**
 * The house art: a rocket climbing through a star field, drawn in SVG and
 * animated in CSS. No third-party imagery, nothing to license, nothing to
 * download. The red matches the logo; everything else takes theme tokens so
 * it holds up in light and dark.
 *
 * `compact` drops the stars' count and the puffs for a small placement.
 * Reduced-motion users get a still frame.
 */
const STARS = [
  [6, 12, 1.4, 0],
  [18, 70, 1.1, 1.2],
  [27, 28, 0.9, 0.5],
  [41, 86, 1.3, 2.1],
  [52, 9, 1.0, 0.8],
  [63, 54, 1.5, 1.7],
  [74, 22, 0.9, 0.3],
  [83, 78, 1.2, 1.4],
  [91, 40, 1.0, 2.4],
  [35, 60, 0.8, 1.9],
  [58, 92, 0.9, 0.2],
  [12, 45, 1.2, 2.8],
];

export default function RocketArt({ className, compact = false, label = "A rocket climbing through stars" }) {
  const stars = compact ? STARS.slice(0, 7) : STARS;
  return (
    <div className={`${s.frame} ${compact ? s.compact : ""} ${className || ""}`} role="img" aria-label={label}>
      <svg className={s.sky} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {stars.map(([x, y, r, delay], i) => (
          <circle key={i} className={s.star} cx={x} cy={y} r={r} style={{ animationDelay: `${delay}s` }} />
        ))}
        {!compact &&
          [14, 46, 79].map((x, i) => (
            <line
              key={x}
              className={s.streak}
              x1={x}
              y1="0"
              x2={x}
              y2="0"
              style={{ animationDelay: `${i * 1.3}s` }}
            />
          ))}
      </svg>

      <svg className={s.rocket} viewBox="0 0 120 200" aria-hidden="true">
        {/* exhaust */}
        <g className={s.flame}>
          <path d="M44 150 Q60 200 76 150 Q60 165 44 150Z" className={s.flameOuter} />
          <path d="M50 150 Q60 182 70 150 Q60 160 50 150Z" className={s.flameInner} />
        </g>
        {!compact && (
          <g className={s.puffs}>
            <circle cx="60" cy="176" r="7" style={{ animationDelay: "0s" }} />
            <circle cx="50" cy="184" r="5" style={{ animationDelay: ".6s" }} />
            <circle cx="70" cy="188" r="6" style={{ animationDelay: "1.2s" }} />
          </g>
        )}
        {/* fins */}
        <path d="M40 112 L18 148 L40 140Z" className={s.red} />
        <path d="M80 112 L102 148 L80 140Z" className={s.red} />
        <path d="M56 130 L56 156 L64 156 L64 130Z" className={s.red} />
        {/* body */}
        <path d="M60 10 C36 36 34 70 40 150 L80 150 C86 70 84 36 60 10Z" className={s.body} />
        {/* nose */}
        <path d="M60 10 C48 22 43 34 41 48 L79 48 C77 34 72 22 60 10Z" className={s.red} />
        {/* porthole */}
        <circle cx="60" cy="78" r="13" className={s.ring} />
        <circle cx="60" cy="78" r="9" className={s.glass} />
        <circle cx="56" cy="74" r="3" className={s.glint} />
        {/* seam */}
        <path d="M43 118 L77 118" className={s.seam} />
      </svg>
    </div>
  );
}
