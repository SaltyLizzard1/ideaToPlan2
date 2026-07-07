"use client";

import { useState, useRef } from "react";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Quiz from "@/components/Quiz";
import IdeaToPlan from "@/components/IdeaToPlan";
import Testimonials from "@/components/Testimonials";
import Footer from "@/components/Footer";

export default function Home() {
  const [prefillIdea, setPrefillIdea] = useState<string | undefined>();
  const ideaToPlanRef = useRef<HTMLDivElement>(null);

  function handleMatchSelected(idea: string) {
    setPrefillIdea(idea);
    setTimeout(() => {
      ideaToPlanRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  return (
    <main>
      <Hero />
      <div id="how-it-works" style={{ scrollMarginTop: "64px" }}><HowItWorks /></div>

      <section id="quiz" className="py-12 px-4" style={{ background: "#F9FAFB", scrollMarginTop: "64px" }}>
        <div className="max-w-3xl mx-auto text-center mb-8">
          <p
            className="text-xs font-sans tracking-[0.2em] uppercase mb-2"
            style={{ color: "#C9A030" }}
          >
            Skills Assessment
          </p>
          <h2
            className="font-serif text-4xl sm:text-5xl font-bold mb-3"
            style={{ color: "#0D1117" }}
          >
            What Are You Built to Build?
          </h2>
          <p className="font-sans text-gray-500 text-lg">
            Answer five quick questions and discover 7 business ideas matched to your
            unique skills, values, and lifestyle.
          </p>
        </div>
        <Quiz onMatchSelected={handleMatchSelected} />
      </section>

      <Testimonials />

      <div id="pricing" ref={ideaToPlanRef} style={{ scrollMarginTop: "64px" }}>
        <IdeaToPlan prefillIdea={prefillIdea} />
      </div>

      <Footer />
    </main>
  );
}
