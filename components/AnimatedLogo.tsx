import { useId } from "react";

export default function AnimatedLogo({
  className,
  showTagline = true,
  iconOnly = false,
  animate = true,
}: {
  className?: string;
  showTagline?: boolean;
  iconOnly?: boolean;
  animate?: boolean;
}) {
  const rawId = useId();
  // Sanitize to valid CSS identifier characters
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, "");
  const moverClass = `sm-${uid}`;
  const shineClass = `ss-${uid}`;
  const filterId = `sg-${uid}`;

  const viewBox = iconOnly
    ? "62 86 250 330"
    : showTagline
    ? "65 75 840 380"
    : "65 75 840 330";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      className={className}
      role="img"
      aria-label="IdeaToPlan: Shape your future. Start today."
    >
      <defs>
        <filter id={filterId} x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="outer" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="inner" />
          <feMerge>
            <feMergeNode in="outer" />
            <feMergeNode in="inner" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g id="icon">
        <rect x="80" y="300" width="52" height="100" fill="#6B4C08" rx="4" />
        <rect x="152" y="240" width="52" height="160" fill="#C9A030" rx="4" />
        <rect x="224" y="180" width="52" height="220" fill="#F5D020" rx="4" />

        {/* Outer group = position (the hops). Inner group = scale/shine. */}
        <g className={moverClass} filter={`url(#${filterId})`}>
          <g className={shineClass}>
            <polygon points="0,-36 3,-4 0,36 -3,-4" fill="#F5E070" />
            <polygon points="-36,0 -4,3 36,0 -4,-3" fill="#F5E070" />
            <g transform="rotate(45)">
              <polygon points="0,-22 2,-3 0,22 -2,-3" fill="#FFF8B0" />
              <polygon points="-22,0 -3,2 22,0 -3,-2" fill="#FFF8B0" />
            </g>
            <circle cx="0" cy="0" r="4" fill="#FFFFFF" />
          </g>
        </g>
      </g>

      {!iconOnly && (
        <g id="wordmark">
          <text y="400" fontFamily="Georgia, 'Times New Roman', serif" textAnchor="start">
            <tspan x="315" fontSize="68" fontWeight="700" fill="#8B6914">Idea</tspan>
            <tspan fontSize="96" fontWeight="400" fill="#C9A030" dx="10">To</tspan>
            <tspan fontSize="132" fontWeight="700" fill="#F5D020" dx="6">Plan</tspan>
          </text>
          {showTagline && (
            <line x1="315" y1="416" x2="875" y2="416" stroke="#C9A030" strokeWidth="1.5" />
          )}
        </g>
      )}

      {!iconOnly && showTagline && (
        <g id="tagline">
          <text
            x="317"
            y="436"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="22"
            fontStyle="italic"
            fill="#8B6914"
            letterSpacing="3"
          >
            Shape your future. Start today.
          </text>
        </g>
      )}

      <style>{`
        .${moverClass} {
          ${animate
            ? `animation: hop-${uid} 2.6s forwards;`
            : `animation: none; transform: translate(250px, 140px);`}
        }
        ${animate ? `
          @keyframes hop-${uid} {
            0%   { transform: translate(106px, 262px); animation-timing-function: ease-in-out; }
            12%  { transform: translate(106px, 262px); animation-timing-function: ease-out; }
            24%  { transform: translate(142px, 190px); animation-timing-function: ease-in; }
            36%  { transform: translate(178px, 202px); animation-timing-function: ease-out; }
            48%  { transform: translate(214px, 130px); animation-timing-function: ease-in; }
            58%  { transform: translate(250px, 140px); }
            100% { transform: translate(250px, 140px); }
          }
        ` : ""}

        .${shineClass} {
          transform-box: fill-box;
          transform-origin: center;
          ${animate
            ? `animation: flare-${uid} 2.6s forwards;`
            : `animation: none; transform: scale(1); opacity: 1; filter: brightness(1);`}
        }
        ${animate ? `
          @keyframes flare-${uid} {
            0%, 58% { transform: scale(0.55); opacity: 0.85; filter: brightness(1); }
            70%     { transform: scale(1.5) rotate(25deg); opacity: 1; filter: brightness(1.9); }
            82%     { transform: scale(0.92) rotate(0deg); filter: brightness(1.1); }
            100%    { transform: scale(1); opacity: 1; filter: brightness(1); }
          }
        ` : ""}

        @media (prefers-reduced-motion: reduce) {
          .${moverClass} { animation: none; transform: translate(250px, 140px); }
          .${shineClass} { animation: none; transform: scale(1); opacity: 1; }
        }
      `}</style>
    </svg>
  );
}
