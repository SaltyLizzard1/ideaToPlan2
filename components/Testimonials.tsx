export default function Testimonials() {
  const testimonials = [
    {
      name: "Sarah K.",
      role: "Solopreneur, Digital Nomad",
      quote:
        "I went from idea overload to a clear business plan in under 72 hours. The assessment nailed my strengths perfectly, and the final plan is already helping me launch my online wellness coaching service.",
    },
    {
      name: "Michael R.",
      role: "E-2 Visa Applicant",
      quote:
        "Exactly what my immigration lawyer needed. Professional financial projections, job creation numbers, and everything structured for my E-2 application. Delivered fast at this introductory rate.",
    },
    {
      name: "Priya M.",
      role: "Side Hustle Founder",
      quote:
        "The skills assessment helped me realize my strength in content creation. Turning that into a full business plan for my niche Pinterest marketing service felt effortless. I now have something professional I'm proud to share with potential brand partners.",
    },
  ];

  return (
    <section className="py-16 px-6" style={{ background: "#0D1117" }}>
      <div className="max-w-5xl mx-auto">
        <p
          className="font-sans text-xs tracking-widest uppercase text-center mb-3"
          style={{ color: "#C9A030", letterSpacing: "0.22em" }}
        >
          Client Stories
        </p>
        <h2
          className="font-serif font-bold text-center mb-10"
          style={{ color: "#F5F0E8", fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)" }}
        >
          What Early Clients Are Saying
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="flex flex-col gap-4 rounded-2xl px-6 py-7"
              style={{
                background: "#111827",
                border: "1px solid #2A2410",
              }}
            >
              {/* Quote marks */}
              <span
                className="font-serif leading-none select-none"
                style={{ color: "#C9A030", fontSize: "3rem", lineHeight: 1 }}
                aria-hidden
              >
                &ldquo;
              </span>

              <p
                className="font-sans text-sm leading-relaxed flex-1"
                style={{ color: "#D1D5DB" }}
              >
                {t.quote}
              </p>

              <div style={{ borderTop: "1px solid #2A2410", paddingTop: "1rem" }}>
                <p
                  className="font-sans font-semibold text-sm"
                  style={{ color: "#F5F0E8" }}
                >
                  {t.name}
                </p>
                <p
                  className="font-sans text-xs mt-0.5"
                  style={{ color: "#C9A030" }}
                >
                  {t.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
