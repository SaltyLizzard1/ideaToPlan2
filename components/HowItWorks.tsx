export default function HowItWorks() {
  const steps = [
    {
      icon: (
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a7 7 0 0 1 7 7c0 3.5-2.5 6-4 7.5V18a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1.5C7.5 15 5 12.5 5 9a7 7 0 0 1 7-7z" />
          <path d="M9 21h6M10 17h4" />
        </svg>
      ),
      step: "01",
      title: "Take the Free Skills Assessment",
      description:
        "Answer five quick sections about your hard skills, soft skills, work style, values, and time availability. Takes about 5 minutes.",
    },
    {
      icon: (
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
          <path d="M11 8v6M8 11h6" />
        </svg>
      ),
      step: "02",
      title: "Receive 7 Personalized Matches",
      description:
        "Our AI analyzes your profile and returns seven business ideas matched to your unique combination of skills, values, and lifestyle — with income ranges and first steps.",
    },
    {
      icon: (
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
      ),
      step: "03",
      title: "Build Your Business Plan",
      description:
        "Love your top match? Submit it to IdeaToPlan and we'll deliver a done-for-you professional business plan — ready for investors, lenders, or your own roadmap.",
    },
  ];

  return (
    <section className="py-14 px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p
            className="text-xs font-sans tracking-[0.2em] uppercase mb-3"
            style={{ color: "#C9A030" }}
          >
            How It Works
          </p>
          <h2
            className="font-serif text-4xl sm:text-5xl font-bold"
            style={{ color: "#0D1117" }}
          >
            From Idea to Income in Three Steps
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((s, i) => (
            <div
              key={i}
              className="flex flex-col items-start p-8 rounded-2xl border relative"
              style={{ borderColor: "#F0E8CC", background: "#FEFCF5" }}
            >
              <span
                className="absolute top-6 right-6 font-serif text-5xl font-bold leading-none select-none"
                style={{ color: "#F0E8CC" }}
              >
                {s.step}
              </span>
              <div
                className="mb-5 p-3 rounded-xl"
                style={{ background: "#FBF6E4", color: "#8B6914" }}
              >
                {s.icon}
              </div>
              <h3
                className="font-serif text-xl font-semibold mb-3"
                style={{ color: "#0D1117" }}
              >
                {s.title}
              </h3>
              <p className="font-sans text-sm leading-relaxed" style={{ color: "#4B5563" }}>
                {s.description}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <button
            onClick={() =>
              document.getElementById("assessment")?.scrollIntoView({ behavior: "smooth" })
            }
            className="cta-shimmer gold-border inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-sans font-semibold text-sm cursor-pointer"
            style={{ color: "#2D1A00" }}
          >
            Start the Assessment
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
