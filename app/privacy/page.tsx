import type { Metadata } from 'next';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Privacy Policy | IdeaToPlan',
  description: 'How IdeaToPlan collects, uses, and protects your information.',
  alternates: { canonical: 'https://ideatoplan.to/privacy' },
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

function Processor({ name, role, href }: { name: string; role: string; href: string }) {
  return (
    <p>
      <span className="font-semibold text-gray-900">{name}</span>: {role}{' '}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 text-[#8B6914] hover:opacity-70"
      >
        Privacy policy
      </a>
    </p>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-gray-900 mb-2">
            Privacy Policy
          </h1>
          <p className="text-sm text-gray-500 mb-10">Effective date: {EFFECTIVE_DATE}</p>

          <Section title="1. What We Collect">
            <p>We collect information you choose to share when using ideatoplan.to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="font-semibold text-gray-900">Contact information</span>: your
                full name and email address
              </li>
              <li>
                <span className="font-semibold text-gray-900">Business idea details</span>:
                description, target audience, problem statement, industry, location, revenue model,
                differentiation, and startup budget
              </li>
              <li>
                <span className="font-semibold text-gray-900">Plan-specific details</span>:
                founder background, funding ask, use of funds, current traction, exit vision, and
                loan details where applicable
              </li>
              <li>
                <span className="font-semibold text-gray-900">Skills assessment answers</span>:
                your responses to the five-question assessment
              </li>
              <li>
                <span className="font-semibold text-gray-900">Email list opt-in</span>: your
                address if you subscribe for updates
              </li>
            </ul>
            <p>We do not collect or store payment card numbers. Payments are handled by Stripe.</p>
          </Section>

          <Section title="2. How We Use Your Information">
            <p>
              We use your information to deliver what you asked for: generating your assessment results,
              building and delivering your business plan, and communicating with you about your
              order. If you subscribed to updates, we send you emails you can unsubscribe from at
              any time. We do not sell your personal information to anyone.
            </p>
            <p>
              Assessment responses and business idea submissions are processed with the help of AI
              language models to generate your results and plans. A human reviews every business
              plan before delivery.
            </p>
          </Section>

          <Section title="3. Third-Party Processors">
            <p>These services process data on our behalf to run IdeaToPlan:</p>
            <Processor
              name="Vercel"
              role="Hosts the website and API routes. Receives all inbound request data."
              href="https://vercel.com/legal/privacy-policy"
            />
            <Processor
              name="n8n"
              role="Workflow automation that routes your form submission through the plan generation pipeline."
              href="https://n8n.io/legal/privacy"
            />
            <Processor
              name="Google Workspace"
              role="Stores submitted plan requests and handles team email communication."
              href="https://workspace.google.com/terms/privacy.html"
            />
            <Processor
              name="Anthropic (Claude)"
              role="AI model used to draft your business plan from your submitted details."
              href="https://www.anthropic.com/privacy"
            />
            <Processor
              name="Brave Search"
              role="Used on Growth and higher tiers to research competitors mentioned in your plan."
              href="https://search.brave.com/help/privacy-policy"
            />
            <Processor
              name="Stripe"
              role="Processes payments securely. We never see your full card number."
              href="https://stripe.com/privacy"
            />
            <Processor
              name="Kit (formerly ConvertKit)"
              role="Email marketing platform used to manage subscriptions and deliver updates."
              href="https://kit.com/privacy"
            />
            <Processor
              name="Supabase"
              role="Database infrastructure used for storing service data."
              href="https://supabase.com/privacy"
            />
          </Section>

          <Section title="4. Cookies and Analytics">
            <p>
              IdeaToPlan does not run advertising cookies, tracking pixels, or third-party
              analytics scripts. Vercel may set a session cookie for routing purposes. We do not
              run Google Analytics or similar services at this time.
            </p>
          </Section>

          <Section title="5. Data Retention">
            <p>
              We keep your information only as long as needed to provide the service, typically
              no longer than 12 months after your last interaction. Email subscribers are kept
              until they unsubscribe.
            </p>
          </Section>

          <Section title="6. Your Rights">
            <p>
              You can ask us to access, correct, or delete your personal data at any time. Email{' '}
              <a
                href="mailto:ideatoplanincome@gmail.com"
                className="underline underline-offset-2 text-[#8B6914] hover:opacity-70"
              >
                ideatoplanincome@gmail.com
              </a>{' '}
              and we will respond within 30 days. We may retain limited data where required to
              meet legal obligations or resolve disputes.
            </p>
          </Section>

          <Section title="7. Contact">
            <p>
              Questions about this policy? Reach us at{' '}
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
