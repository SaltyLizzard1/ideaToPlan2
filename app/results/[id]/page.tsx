import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Sparkles } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { mergeMatches } from '../../../lib/quiz';
import Footer from '../../../components/Footer';
import ResultsGate from '../../../components/ResultsGate';

const BASE_URL = 'https://ideatoplan.to';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const canonicalUrl = `${BASE_URL}/results/${id}`;
  const title = 'My Business Matches | IdeaToPlan';
  const description = 'See the business ideas this assessment matched, then build yours into a real plan.';

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'IdeaToPlan',
      images: [{ url: '/og-ideatoplan-dark.png', width: 1200, height: 630, alt: 'IdeaToPlan: Shape your future. Start today.' }],
    },
    twitter: {
      card: 'summary_large_image',
      images: ['/og-ideatoplan-dark.png'],
    },
  };
}

export default async function ResultsPage({ params }: Props) {
  const { id } = await params;

  const { data, error } = await supabase
    .from('quiz_results')
    .select('matches, details')
    .eq('id', id)
    .eq('site', 'i2p')
    .single();

  if (error || !data) {
    notFound();
  }

  // Old rows hold a full match in every entry and no details, new rows hold
  // ranking stubs plus whatever details have been written so far.
  const matches = mergeMatches(data.matches, data.details);
  if (matches.length === 0) {
    notFound();
  }
  const canonicalUrl = `${BASE_URL}/results/${id}`;

  return (
    <>
      <div
        className="relative overflow-hidden section-y"
        style={{
          background: 'linear-gradient(180deg, var(--i2p-dark) 0%, #17140c 65%, #17140c 100%)',
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

        <div className="page-container relative">
          <div className="measure text-center">
          <p
            className="mb-xl font-bold uppercase"
            style={{ color: 'var(--i2p-gold)', fontSize: '0.78rem', letterSpacing: '0.15em' }}
          >
            YOUR ASSESSMENT · RESULTS
          </p>

          <div className="flex items-center justify-center gap-md mb-md">
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

          <p className="text-sm" style={{ color: 'var(--i2p-text-on-dark-body)' }}>
            Results from the IdeaToPlan assessment
          </p>
          </div>
        </div>
      </div>

      <div className="pb-section" style={{ background: 'var(--i2p-cream)' }}>
        <div className="page-container relative z-10" style={{ marginTop: '-2.75rem' }}>
          <div className="measure">
            <ResultsGate matches={matches} canonicalUrl={canonicalUrl} resultId={id} />
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
