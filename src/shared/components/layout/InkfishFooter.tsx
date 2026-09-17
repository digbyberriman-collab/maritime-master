import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LifeBuoy, BookOpen, Mail } from 'lucide-react';
import inkfishLogo from '@/assets/inkfish-logo.png';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

type FooterDialog = 'privacy' | 'terms' | null;

const linkClass =
  'text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap';

const InkfishFooter: React.FC = () => {
  const [dialog, setDialog] = useState<FooterDialog>(null);

  return (
    <>
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
                <DropdownMenuItem onClick={() => setDialog('guides')}>
                  <BookOpen className="h-4 w-4 mr-2" />
                  How-to Guides
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="mailto:SOS@INK.FISH">
                    <Mail className="h-4 w-4 mr-2" />
                    Contact support (SOS@INK.FISH)
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <a href="mailto:SOS@INK.FISH" className={linkClass}>
              Support
            </a>
            <button type="button" onClick={() => setDialog('privacy')} className={linkClass}>
              Privacy Policy
            </button>
            <button type="button" onClick={() => setDialog('terms')} className={linkClass}>
              Terms of Service
            </button>
          </nav>
        </div>

        <div className="border-t border-border/50 px-4 lg:px-6 py-1.5">
          <p className="text-[11px] text-muted-foreground">
            © 2026 Inkfish. All rights reserved.
          </p>
        </div>
      </footer>

      {/* How-to Guides */}
      <Dialog open={dialog === 'guides'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>How-to Guides</DialogTitle>
            <DialogDescription>
              Quick walkthroughs for the most common tasks.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-5">
              {HOW_TO_GUIDES.map((guide) => (
                <div key={guide.title}>
                  <h3 className="text-sm font-semibold text-foreground">{guide.title}</h3>
                  <ol className="mt-1 list-decimal list-inside space-y-0.5 text-sm text-muted-foreground">
                    {guide.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Privacy Policy */}
      <Dialog open={dialog === 'privacy'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Privacy Policy</DialogTitle>
            <DialogDescription>Last updated: September 2026</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Inkfish processes personal data solely to provide maritime safety and crew
                management services to your company. Crew data is visible only to authorised
                users within your company, and sensitive fields (such as medical and payroll
                information) are redacted for users without the required permissions.
              </p>
              <p>
                Data is hosted securely with encryption in transit and at rest. Access is
                controlled by role-based permissions, and all changes to safety-critical
                records are recorded in an audit trail.
              </p>
              <p>
                Personal data is retained in line with your company's retention schedule.
                The Designated Person Ashore (DPA) can export or anonymise an individual's
                data on request, in line with GDPR.
              </p>
              <p>
                Questions about privacy? Contact us at{' '}
                <a href="mailto:SOS@INK.FISH" className="text-primary underline">
                  SOS@INK.FISH
                </a>
                .
              </p>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Terms of Service */}
      <Dialog open={dialog === 'terms'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Terms of Service</DialogTitle>
            <DialogDescription>Last updated: September 2026</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                By using Inkfish you agree to use the platform only for lawful maritime
                operations and in accordance with your company's safety management system.
              </p>
              <p>
                You are responsible for the accuracy of records you enter and for keeping
                your sign-in credentials confidential. Access levels are set by your
                company administrator.
              </p>
              <p>
                The platform is provided as a management aid; it does not replace statutory
                record-keeping requirements where original or certified documents are
                required by flag state or class.
              </p>
              <p>
                Questions about these terms? Contact us at{' '}
                <a href="mailto:SOS@INK.FISH" className="text-primary underline">
                  SOS@INK.FISH
                </a>
                .
              </p>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InkfishFooter;
