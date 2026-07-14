import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Sparkles } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import ResultsGate from '../../../components/ResultsGate';

const BASE_URL = 'https://ideatoplan.to';

interface Match {
  title: string;
  category: string;
  description: string;
  whyYou: string;
  saturation: 'Low' | 'Medium' | 'High';
  saturationNote: string;
  uniqueAngle: string;
  incomeRange: string;
  firstSteps: string[];
}


type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const canonicalUrl = `${BASE_URL}/results/${id}`;
  const title = 'My Business Matches | IdeaToPlan';
  const description = 'See the business ideas this assessment matched — then build yours into a real plan.';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'IdeaToPlan',
    },
    twitter: {
      card: 'summary_large_image',
    },
  };
}

export default async function ResultsPage({ params }: Props) {
  const { id } = await params;

  const { data, error } = await supabase
    .from('quiz_results')
    .select('matches')
    .eq('id', id)
    .eq('site', 'i2p')
    .single();

  if (error || !data) {
    notFound();
  }

  const matches = (data.matches ?? []) as Match[];
  const canonicalUrl = `${BASE_URL}/results/${id}`;

  return (
    <>
      <Header />

      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, var(--i2p-dark) 0%, #17140c 65%, #17140c 100%)',
          padding: '4rem 1.5rem 5rem',
        }}
      >
        <div
          className="pointer-events-none absolute"
          style={{
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '640px',
            height: '400px',
            background: 'radial-gradient(ellipse, rgba(232,200,74,0.16) 0%, transparent 70%)',
          }}
        />

        <div className="relative max-w-2xl mx-auto text-center">
          <p
            className="mb-5 font-bold uppercase"
            style={{ color: 'var(--i2p-gold)', fontSize: '0.78rem', letterSpacing: '0.15em' }}
          >
            YOUR ASSESSMENT · RESULTS
          </p>

          <div className="flex items-center justify-center gap-3 mb-3">
            <Sparkles className="w-6 h-6 flex-shrink-0" style={{ color: 'var(--i2p-gold-bright)' }} />
            <h1
              className="font-serif"
              style={{
                fontWeight: 700,
                fontSize: 'clamp(2.2rem, 5vw, 3.2rem)',
                color: 'var(--i2p-text-on-dark)',
                lineHeight: 1.15,
              }}
            >
              My Business Matches
            </h1>
          </div>

          <p className="mb-8 text-sm" style={{ color: 'var(--i2p-text-on-dark-body)' }}>
            Results from the IdeaToPlan assessment
          </p>
        </div>
      </div>

      <div style={{ background: 'var(--i2p-cream)', paddingBottom: '4rem' }}>
        <div className="max-w-2xl mx-auto px-4" style={{ marginTop: '-2.75rem' }}>

          <ResultsGate matches={matches} canonicalUrl={canonicalUrl} />

        </div>
      </div>

      <Footer />
    </>
  );
}
