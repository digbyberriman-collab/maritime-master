/**
 * The Inkfish ownership footer under every shell page (gap/10 IA18, DS24;
 * spec §1, §9): quiet caption-size ink (12 px), unaffected by client
 * branding, with Help and Support menus and the legal links. Copy is
 * unchanged; the tenant tagline joins it with C14 (DECISIONS S1).
 *
 * Ink: `muted-foreground` (Drift-400 on Abyss, Slate-600 on Daylight) rather
 * than the raw Drift-500, which is 3.3:1 on the Daylight page; see the
 * step's proposed decision. Every link and menu trigger has a 44 px hit area
 * on a coarse pointer (D-35) and the one focus ring.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { LifeBuoy, BookOpen, Mail, Ticket } from 'lucide-react';
import inkfishLogo from '@/assets/inkfish-logo.png';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';

const linkClass = cn(
  'type-caption inline-flex items-center gap-1 whitespace-nowrap rounded-sm text-muted-foreground',
  'transition-colors duration-quick ease-tide hover:text-foreground motion-reduce:transition-none',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'data-[state=open]:text-foreground [@media(pointer:coarse)]:min-h-11',
);

const ICON = 'h-3.5 w-3.5';
const MENU_ICON = 'mr-2 h-4 w-4';

const InkfishFooter: React.FC = () => (
  // Shell chrome: a printout carries the page only (DS23, D-36).
  <footer data-testid={SHELL_TEST_IDS.footer} className="border-t border-border print:hidden">
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-3 py-1.5 lg:px-4">
      <div className="flex select-none items-center gap-2">
        <img src={inkfishLogo} alt="Inkfish" className="h-4 object-contain" draggable={false} />
        <span className="type-caption font-semibold tracking-wide text-muted-foreground">INKFISH</span>
        <span className="type-caption hidden text-muted-foreground sm:inline">Maritime Management</span>
      </div>

      <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-4 lg:gap-x-6">
        <DropdownMenu>
          <DropdownMenuTrigger className={linkClass}>
            <LifeBuoy className={ICON} strokeWidth={1.75} aria-hidden="true" />
            Help
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            <DropdownMenuItem asChild>
              <Link to="/help/how-to-guides">
                <BookOpen className={MENU_ICON} strokeWidth={1.75} aria-hidden="true" />
                How-to Guides
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="mailto:SOS@INK.FISH">
                <Mail className={MENU_ICON} strokeWidth={1.75} aria-hidden="true" />
                Contact support (SOS@INK.FISH)
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className={linkClass}>
            <Mail className={ICON} strokeWidth={1.75} aria-hidden="true" />
            Support
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            <DropdownMenuItem asChild>
              <Link to="/help/support">
                <Ticket className={MENU_ICON} strokeWidth={1.75} aria-hidden="true" />
                Submit a ticket
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="mailto:SOS@INK.FISH">
                <Mail className={MENU_ICON} strokeWidth={1.75} aria-hidden="true" />
                Contact support (SOS@INK.FISH)
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Link to="/legal/privacy-policy" className={linkClass}>
          Privacy Policy
        </Link>
        <Link to="/legal/terms-of-service" className={linkClass}>
          Terms of Service
        </Link>
      </nav>
    </div>

    <div className="border-t border-border/50 px-3 py-1.5 lg:px-4">
      <p className="type-caption text-muted-foreground">© 2026 Inkfish. All rights reserved.</p>
    </div>
  </footer>
);

export default InkfishFooter;
