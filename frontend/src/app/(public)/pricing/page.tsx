import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import PublicNavbar from '../_components/PublicNavbar';
import PricingCards from '../_components/PricingCards';
import Footer from '../_components/Footer';

export const metadata: Metadata = {
  title: 'Pricing — MateDesk',
  description: 'Simple, transparent pricing for MSPs of every size.',
};

const faqItems = [
  {
    q: 'Can I change my plan later?',
    a: 'Yes. You can upgrade or downgrade at any time. Changes take effect on your next billing cycle.',
  },
  {
    q: 'How do I get access?',
    a: 'Use the access option shown with the plans below. MateDesk may offer instant trials or approval-based early access depending on the current platform mode.',
  },
  {
    q: 'How does multi-tenant isolation work?',
    a: 'Each MSP tenant operates on its own isolated namespace with a dedicated subdomain. Your data is never shared with or visible to other MSPs on the platform — enforced at the database layer, not just the application layer.',
  },
  {
    q: 'What counts as an agent?',
    a: 'Any user with the ability to respond to or manage tickets (MSP Owner, Manager, or Agent role). Client end-users and contacts do not count toward your agent limit.',
  },
  {
    q: 'Do you offer annual billing?',
    a: 'Yes. Annual billing is available at a 20% discount. Contact us to set up an annual plan.',
  },
];

export default function PricingPage() {
  return (
    <>
      <PublicNavbar />

      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 pt-20 pb-4 text-center">
        <span className="text-xs font-semibold uppercase tracking-widest text-[#6366f1]">Pricing</span>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold text-[#f1f5f9]">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-[#64748b] text-base max-w-lg mx-auto leading-relaxed">
          No per-ticket fees. No hidden costs. A flat monthly rate for your whole MSP team.
        </p>

        <div className="mt-6 flex justify-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium"
            style={{
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.25)',
              color: '#a5b4fc',
            }}
          >
            <Check size={12} />
            Flexible access for MSPs of every size
          </div>
        </div>
      </div>

      {/* Pricing cards */}
      <div className="py-14">
        <PricingCards />
      </div>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <h2 className="text-xl font-bold text-[#f1f5f9] mb-8 text-center">
          Frequently Asked Questions
        </h2>
        <div
          className="rounded-[8px] overflow-hidden divide-y"
          style={{ border: '1px solid #1e2640', borderColor: '#1e2640' }}
        >
          {faqItems.map((item) => (
            <div key={item.q} className="px-6 py-5 bg-[#0a0d14]">
              <p className="text-sm font-medium text-[#f1f5f9] mb-2">{item.q}</p>
              <p className="text-xs text-[#64748b] leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </>
  );
}
