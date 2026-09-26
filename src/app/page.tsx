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
import { demoSignInEnabled } from '@/lib/demo';

// Rendered per request so the "Try the demo" link follows DEMO_TENANT_ENABLED at runtime.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'CampusOS — Your campus. One place.',
  description:
    'Notices, attendance, grievances and opportunities in one place for students — working alongside the ERP your college already has, instead of WhatsApp groups and scattered portals.',
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
        <AudienceSplit demo={demoSignInEnabled()} />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
