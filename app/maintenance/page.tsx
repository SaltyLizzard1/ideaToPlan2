export default function MaintenancePage() {
  return (
    <main
      className="flex flex-col items-center justify-center text-center"
      style={{
        background: "#0D1117",
        minHeight: "100svh",
        padding: "2rem",
        backgroundImage:
          "radial-gradient(circle, rgba(201,160,48,0.05) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 30%, rgba(197,152,28,0.09) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex flex-col items-center" style={{ maxWidth: "560px" }}>
        <img
          src="/logo.svg"
          alt="IdeaToPlan"
          style={{ width: "clamp(140px, 22vw, 200px)", height: "auto", marginBottom: "2.5rem" }}
        />

        <p
          className="font-sans uppercase tracking-widest text-xs mb-4"
          style={{ color: "#C9A030", letterSpacing: "0.24em" }}
        >
          Scheduled Maintenance
        </p>

        <h1
          className="font-serif font-bold mb-5"
          style={{
            color: "#F5F0E8",
            fontSize: "clamp(1.8rem, 4vw, 2.6rem)",
            lineHeight: 1.2,
          }}
        >
          We&apos;ll Be Right Back
        </h1>

        <p
          className="font-sans mb-8"
          style={{ color: "#9CA3AF", fontSize: "1.05rem", lineHeight: 1.75 }}
        >
          IdeaToPlan is undergoing a quick update. We&apos;ll be back shortly, usually within a
          few hours. Thank you for your patience.
        </p>

        <a
          href="mailto:ideatoplanincome@gmail.com"
          className="font-sans text-sm"
          style={{ color: "#C9A030" }}
        >
          ideatoplanincome@gmail.com
        </a>
      </div>
    </main>
  );
}
