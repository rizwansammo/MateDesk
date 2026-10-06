import type { Metadata } from 'next';
import PublicNavbar from './_components/PublicNavbar';
import HeroSection from './_components/HeroSection';
import FeatureSection from './_components/FeatureSection';
import PricingCards from './_components/PricingCards';
import Footer from './_components/Footer';
import StructuredData from './_components/StructuredData';

// `title` here is absolute, not run through the layout's "%s | MateDesk" template —
// otherwise the homepage would read "MateDesk … | MateDesk" in search results.
export const metadata: Metadata = {
  title: {
    absolute: 'MATEDESK · HelpDesk Ticketing System.',
  },
  description:
    'Multi-tenant helpdesk for managed service providers. Isolated client workspaces, '
    + 'email-to-ticket automation, SLA tracking, knowledge base and billing in one platform.',
  alternates: { canonical: '/' },
};

export default function LandingPage() {
  return (
    <>
      <StructuredData />
      <PublicNavbar />
      <HeroSection />
      <FeatureSection />
      <PricingCards />
      <Footer />
    </>
  );
}
