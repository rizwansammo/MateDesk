import type { Metadata } from 'next';
import PublicNavbar from './_components/PublicNavbar';
import HeroSection from './_components/HeroSection';
import FeatureSection from './_components/FeatureSection';
import PricingCards from './_components/PricingCards';
import Footer from './_components/Footer';

export const metadata: Metadata = {
  title: 'MateDesk — The MSP Helpdesk Platform',
  description:
    'Multi-tenant helpdesk with email-to-ticket automation, client isolation, and full MSP workflow management.',
};

export default function LandingPage() {
  return (
    <>
      <PublicNavbar />
      <HeroSection />
      <FeatureSection />
      <PricingCards />
      <Footer />
    </>
  );
}
