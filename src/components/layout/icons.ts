import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, CalendarDays, GraduationCap, ClipboardList, BookOpen, Sparkles,
  Megaphone, LifeBuoy, Users, Building2, CalendarClock, Gauge, BarChart3, Settings,
  FileText, ScrollText, Boxes, UserCog, DoorOpen, Target, CheckSquare, Upload,
  ShieldCheck, Bell, History,
} from 'lucide-react';

/**
 * Icon registry.
 *
 * Navigation is defined with STRING icon keys rather than component references,
 * because navigation data crosses the server/client boundary and React cannot
 * serialise a function. Both server and client resolve the key through this map.
 */
export const NAV_ICONS = {
  dashboard: LayoutDashboard,
  calendar: CalendarDays,
  calendarClock: CalendarClock,
  graduation: GraduationCap,
  clipboard: ClipboardList,
  book: BookOpen,
  sparkles: Sparkles,
  megaphone: Megaphone,
  lifebuoy: LifeBuoy,
  users: Users,
  building: Building2,
  gauge: Gauge,
  chart: BarChart3,
  settings: Settings,
  file: FileText,
  scroll: ScrollText,
  boxes: Boxes,
  userCog: UserCog,
  door: DoorOpen,
  target: Target,
  check: CheckSquare,
  upload: Upload,
  shield: ShieldCheck,
  bell: Bell,
  history: History,
} satisfies Record<string, LucideIcon>;

export type NavIconKey = keyof typeof NAV_ICONS;

export function navIcon(key: NavIconKey): LucideIcon {
  return NAV_ICONS[key];
}
