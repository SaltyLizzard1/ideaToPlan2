

'use client';

import { useEffect, useRef, useState } from 'react';

const GOLD_DEEP = '#8B6914';
const GOLD_MID = '#C9A030';
const GOLD_BRIGHT = '#E8C84A';
const GOLD_LIGHT = '#F5E070';

// Final logo silhouette heights, short to tall, left to right.
const BAR_MAX = [30, 46, 62];
const BAR_MIN = 6;

// Progress never passes this on the timer alone. Only a real
// completion takes it to 100. A bar that fills to 100 while the
// request is still open is a lie, and users notice.
const CAP = 90;

const STAGES: Array<[string, string]> = [
  ['Reading your answers', 'This usually takes about a minute'],
  ['Checking what is trending right now', 'Pulling current market signals'],
  ['Matching against your skills', 'Weighing saturation and fit'],
  ['Writing your first steps', 'Almost there'],
];

const OVERRUN_NOTE = 'Still working. Longer than usual, but nothing is broken';

type Props = {
  /** Typical run time in ms. Stages are paced across this. */
  expectedMs?: number;
  /**
   * Set true when the real response arrives. The bars snap to the full
   * logo silhouette and progress completes. Leave undefined if the
   * parent simply unmounts on completion.
   */
  isComplete?: boolean;
  /** Optional override for the stage copy. */
  stages?: Array<[string, string]>;
};

export default function AssessmentLoader({
  expectedMs = 62000,
  isComplete = false,
  stages = STAGES,
}: Props) {
  const [pct, setPct] = useState(2);
  const [stageIndex, setStageIndex] = useState(0);
  const [overrun, setOverrun] = useState(false);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    if (isComplete) return;
    startRef.current = Date.now();
    const step = expectedMs / stages.length;

    const tick = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const next = Math.min(CAP, 2 + (elapsed / expectedMs) * (CAP - 2));
      setPct(next);
      setStageIndex(Math.min(stages.length - 1, Math.floor(elapsed / step)));
      if (next >= CAP) setOverrun(true);
    }, 900);

    return () => clearInterval(tick);
  }, [expectedMs, isComplete, stages.length]);

  const progress = isComplete ? 100 : pct;

  // Each bar rises through its own third of the run, then holds.
  const barHeight = (i: number) => {
    if (isComplete) return BAR_MAX[i];
    const lo = i * (100 / 3);
    const local = Math.max(0, Math.min(1, (progress - lo) / (100 / 3)));
    return Math.round(BAR_MIN + (BAR_MAX[i] - BAR_MIN) * local);
  };

  const heading = isComplete ? 'Your results are ready' : stages[stageIndex][0];
  const sub = isComplete ? '' : overrun ? OVERRUN_NOTE : stages[stageIndex][1];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={heading}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '26px',
        padding: '3rem 1.5rem',
      }}
    >
      <style>{`
        @keyframes qylBreathe {
          0%, 100% { opacity: 0.72; }
          50% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .qyl-bar { animation: none !important; opacity: 1 !important; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '64px' }}>
        {[GOLD_DEEP, GOLD_MID, GOLD_BRIGHT].map((color, i) => (
          <div
            key={i}
            className="qyl-bar"
            style={{
              width: '15px',
              borderRadius: '2px',
              background: color,
              height: `${barHeight(i)}px`,
              transition: 'height 0.9s cubic-bezier(0.4, 0, 0.2, 1)',
              animation: isComplete ? 'none' : `qylBreathe 1.9s ease-in-out ${i * 0.25}s infinite`,
              opacity: isComplete ? 1 : undefined,
            }}
          />
        ))}
      </div>

      <div style={{ textAlign: 'center', minHeight: '46px' }}>
        <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#2C3340' }}>
          {heading}
        </p>
        <p style={{ margin: '5px 0 0', fontSize: '13px', color: '#6b7280', minHeight: '18px' }}>
          {sub}
        </p>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: '340px',
          height: '6px',
          background: 'rgba(44, 51, 64, 0.12)',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            borderRadius: '3px',
            background: `linear-gradient(90deg, ${GOLD_DEEP} 0%, ${GOLD_MID} 45%, ${GOLD_LIGHT} 100%)`,
            transition: isComplete ? 'width 0.45s ease-out' : 'width 0.9s linear',
          }}
        />
      </div>
    </div>
  );
}
