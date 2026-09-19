import React from 'react';
import { Link } from 'react-router-dom';
import { LifeBuoy, BookOpen, Mail, Ticket } from 'lucide-react';
import inkfishLogo from '@/assets/inkfish-logo.png';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const linkClass =
  'text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

const InkfishFooter: React.FC = () => {
  return (
    <footer className="bg-background/50 border-t border-border">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 lg:px-6 py-2">
        <div className="flex items-center gap-2 select-none">
          <img
            src={inkfishLogo}
            alt="Inkfish"
            className="h-4 object-contain"
            draggable={false}
          />
          <span className="text-xs font-semibold text-foreground tracking-wide">
            INKFISH
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Maritime Management
          </span>
        </div>

        <nav className="flex items-center gap-4 lg:gap-6">
          <DropdownMenu>
            <DropdownMenuTrigger className={`${linkClass} flex items-center gap-1 outline-none`}>
              <LifeBuoy className="h-3.5 w-3.5" />
              Help
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuItem asChild>
                <Link to="/help/how-to-guides">
                  <BookOpen className="h-4 w-4 mr-2" />
                  How-to Guides
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="mailto:SOS@INK.FISH">
                  <Mail className="h-4 w-4 mr-2" />
                  Contact support (SOS@INK.FISH)
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger className={`${linkClass} flex items-center gap-1 outline-none`}>
              <Mail className="h-3.5 w-3.5" />
              Support
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuItem asChild>
                <Link to="/help/support">
                  <Ticket className="h-4 w-4 mr-2" />
                  Submit a ticket
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="mailto:SOS@INK.FISH">
                  <Mail className="h-4 w-4 mr-2" />
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

      <div className="border-t border-border/50 px-4 lg:px-6 py-1.5">
        <p className="text-[11px] text-muted-foreground">
          © 2026 Inkfish. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default InkfishFooter;
