export default function PlanLoader({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-end justify-center gap-2 h-16 ${className}`} aria-hidden="true">
      <style>{`
        @keyframes i2pBarRise {
          0%, 100% { transform: scaleY(0.35); opacity: 0.7; }
          50% { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-4 rounded-t-sm origin-bottom"
          style={{
            height: `${2.2 + i * 0.7}rem`,
            background: 'linear-gradient(180deg, #F5E070 0%, #E8C84A 40%, #C9A030 75%, #8B6914 100%)',
            animation: `i2pBarRise 1.4s ease-in-out ${i * 0.18}s infinite`,
            boxShadow: '0 0 12px rgba(232,200,74,0.35)',
          }}
        />
      ))}
    </div>
  );
}
