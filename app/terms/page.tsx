import type { Metadata } from 'next';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Terms of Service | IdeaToPlan',
  description: 'Terms of service for IdeaToPlan.',
  alternates: { canonical: 'https://ideatoplan.to/terms' },
};

const EFFECTIVE_DATE = 'July 8, 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-serif text-2xl font-bold text-gray-900 mb-3">{title}</h2>
      <div className="text-gray-700 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <>
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-gray-900 mb-2">
            Terms of Service
          </h1>
          <p className="text-sm text-gray-500 mb-10">Effective date: {EFFECTIVE_DATE}</p>

          <Section title="1. The Service">
            <p>
              IdeaToPlan (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) provides an
              AI-assisted business planning service at ideatoplan.to. You submit details about your
              business idea and we deliver a written business plan document (PDF) within the stated
              timeframe. Plans are drafted using AI (Anthropic&apos;s Claude) and reviewed by a
              human before delivery.
            </p>
          </Section>

          <Section title="2. Not Professional Advice">
            <p>
              Business plans delivered by IdeaToPlan are informational documents only. They do not
              constitute legal, financial, accounting, tax, investment, or immigration advice, and
              they carry no guarantee of any particular business outcome. You are responsible for
              your own decisions. Consult licensed professionals before acting on anything
              significant.
            </p>
          </Section>

          <Section title="3. Accuracy of Information">
            <p>
              The quality of your plan depends on the accuracy and completeness of what you submit.
              You represent that all information provided is truthful and your own. IdeaToPlan is
              not liable for plans that are incomplete or inaccurate as a result of information you
              provided.
            </p>
          </Section>

          <Section title="4. Payment">
            <p>
              Payment is processed securely through Stripe. Prices are listed in US dollars at the
              time of purchase. From time to time we may run promotional offers, such as deferred
              payment or satisfaction-based billing. Any such offer is temporary, applies only to
              orders placed while the offer is active, and may be modified or withdrawn at any
              time. The terms shown at the time you place your order are the terms that apply to
              that order.
            </p>
            <p>
              We reserve the right to update pricing at any time. Price changes will not affect
              orders already in progress.
            </p>
          </Section>

          <Section title="5. Delivery and Revisions">
            <p>
              Standard plans are delivered within 72 hours of submission. Expedited plans
              (24-hour option, where available) are delivered within 24 hours. Delivery times are
              estimates and may vary based on order volume.
            </p>
            <p>
              If you are not satisfied with your plan, contact us at{' '}
              <a
                href="mailto:ideatoplanincome@gmail.com"
                className="underline underline-offset-2 text-[#8B6914] hover:opacity-70"
              >
                ideatoplanincome@gmail.com
              </a>{' '}
              and we will work with you to address the issue. Minor revisions are included at no
              extra cost.
            </p>
          </Section>

          <Section title="6. Refund Policy">
            <p>
              If your plan has not yet been delivered, you may cancel for a full refund of any
              amount paid. After delivery, if the plan does not match what you submitted or
              contains material errors on our part, contact us within 7 days of delivery and we
              will revise it at no cost. If we cannot resolve the issue through revision, we will
              issue a refund at our discretion.
            </p>
            <p>
              Refunds are not provided for dissatisfaction with business outcomes, for plans built
              on inaccurate information you supplied, or for expedited delivery fees once the
              expedited plan has been delivered. To request a refund, email{' '}
              <a
                href="mailto:ideatoplanincome@gmail.com"
                className="underline underline-offset-2 text-[#8B6914] hover:opacity-70"
              >
                ideatoplanincome@gmail.com
              </a>{' '}
              with your order details.
            </p>
          </Section>

          <Section title="7. Intellectual Property">
            <p>
              Upon delivery and payment, you own the content of your business plan for personal
              and commercial use. You may use, modify, and distribute your plan freely.
            </p>
            <p>
              The IdeaToPlan brand, website, software, and methodology remain our exclusive
              property. You may not reproduce or resell the IdeaToPlan service itself.
            </p>
          </Section>

          <Section title="8. Limitation of Liability">
            <p>
              To the maximum extent permitted by law, IdeaToPlan is not liable for indirect,
              incidental, consequential, or punitive damages arising from your use of this site,
              our content, or our services. Our total liability to you will not exceed the amount
              you paid us for the plan in question.
            </p>
          </Section>

          <Section title="9. Prohibited Use">
            <p>You agree not to use IdeaToPlan to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Submit false or misleading information for fraudulent purposes</li>
              <li>
                Generate plans intended to deceive investors, lenders, or government agencies
              </li>
              <li>Resell or redistribute our service or generated plans as your own service</li>
              <li>
                Attempt to reverse-engineer, scrape, or access our systems without authorization
              </li>
            </ul>
          </Section>

          <Section title="10. Changes to These Terms">
            <p>
              We may update these terms from time to time. Continued use of the site after changes
              are posted means you accept the updated terms. Material changes will be reflected in
              the effective date at the top of this page.
            </p>
          </Section>

          <Section title="11. Governing Law">
            <p>
              These terms are governed by the laws of the State of Florida, United States, without
              regard to conflict of law principles. Any dispute will first be addressed through
              good-faith negotiation. If unresolved within 30 days, disputes will be resolved in
              the state or federal courts located in Florida, and you consent to the jurisdiction
              of those courts.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              Questions about these terms? Email{' '}
              <a
                href="mailto:ideatoplanincome@gmail.com"
                className="underline underline-offset-2 text-[#8B6914] hover:opacity-70"
              >
                ideatoplanincome@gmail.com
              </a>
              .
            </p>
          </Section>
        </div>
      </main>
      <Footer />
    </>
  );
}
