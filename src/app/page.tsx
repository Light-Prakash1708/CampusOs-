import { cn } from '@/lib/utils';
import { LandingNav } from '@/components/landing/LandingNav';
import { HeroSection } from '@/components/landing/HeroSection';
import { Fragmentation } from '@/components/landing/Fragmentation';
import { ProductModules } from '@/components/landing/ProductModules';
import { AttendanceShowcase } from '@/components/landing/AttendanceShowcase';
import { EventsShowcase } from '@/components/landing/EventsShowcase';
import { PersonalDashboard } from '@/components/landing/PersonalDashboard';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { AudienceSplit } from '@/components/landing/AudienceSplit';
import { FinalCTA, LandingFooter } from '@/components/landing/FinalCTA';
import s from '@/components/landing/landing.module.css';

export const metadata = {
  title: 'CampusOS — Your campus. One place.',
  description:
    'Classes, attendance, notices, events, library and opportunities in one place for students — instead of WhatsApp groups, spreadsheets and five different portals.',
};

/**
 * Public landing page. Static marketing content only: every number and name
 * in the product previews is sample data, and nothing here reads a session or
 * the database.
 */
export default function LandingPage() {
  return (
    <div className={cn(s.root, 'min-h-screen')}>
      <LandingNav />
      <main id="main">
        <HeroSection />
        <Fragmentation />
        <ProductModules />
        <AttendanceShowcase />
        <EventsShowcase />
        <PersonalDashboard />
        <HowItWorks />
        <AudienceSplit />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
