// ============= Shared layout for legal pages (Privacy Policy, Terms of Service) =============
import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, Mail } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

interface LegalPageProps {
  title: string;
  subtitle: string;
  intro: string;
  sections: LegalSection[];
  contactNote: string;
}

const LegalPage: React.FC<LegalPageProps> = ({
  title,
  subtitle,
  intro,
  sections,
  contactNote,
}) => {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to app
        </Link>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <Card className="mt-6">
          <CardContent className="pt-5">
            <p className="text-sm text-foreground">{intro}</p>
          </CardContent>
        </Card>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-base font-semibold text-foreground">{section.heading}</h2>
              <div className="mt-2 space-y-2">
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="text-sm text-muted-foreground">
                    {p}
                  </p>
                ))}
              </div>
              {section.bullets && (
                <ul className="mt-2 list-disc list-inside space-y-1.5 text-sm text-muted-foreground">
                  {section.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <Card className="mt-10">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">{contactNote}</p>
            <a
              href="mailto:SOS@INK.FISH"
              className="mt-2 inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Mail className="h-4 w-4" />
              SOS@INK.FISH
            </a>
          </CardContent>
        </Card>

        <p className="mt-8 text-[11px] text-muted-foreground">
          © 2026 Inkfish. All rights reserved.
        </p>
      </div>
    </DashboardLayout>
  );
};

export default LegalPage;
