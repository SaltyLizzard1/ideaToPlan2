'use client';

/*
  Living version of the IdeaToPlan logo mark: three gold bars that rise and
  fall like an equalizer. Pure CSS, staggered so the bars move asynchronously.
  Gold palette pulled from the tokens in globals.css (i2p-gold scale).
*/

const BAR_DELAYS_S = [0, 0.18, 0.36];

const BAR_STYLE: React.CSSProperties = {
  width: '8px',
  borderRadius: '9999px',
  background:
    'linear-gradient(180deg, var(--i2p-gold-bright) 0%, var(--i2p-gold) 55%, var(--i2p-gold-deep) 100%)',
};

export default function PlanLoader({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex items-end justify-center gap-1.5 ${className}`}
      style={{ height: '40px' }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes i2pBarRise {
          0%, 100% { height: 12px; opacity: 0.65; }
          50%      { height: 40px; opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .i2p-bar { animation: none !important; height: 28px !important; opacity: 1 !important; }
        }
      `}</style>
      {BAR_DELAYS_S.map((delay, i) => (
        <span
          key={i}
          className="i2p-bar"
          style={{
            ...BAR_STYLE,
            animation: `i2pBarRise 1.4s ease-in-out ${delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
