import React from 'react';
import { Construction, ArrowLeft, MessageSquare } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface PlaceholderPageProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  features?: string[];
  /** A real, tenant-facing date for this leaf. Never an internal phase name; no default. */
  expectedRelease?: string;
  showBackButton?: boolean;
  /** Where "Tell us what you need" leads; defaults to Support with the subject filled in. */
  supportHref?: string;
}

/** Support, with the ticket subject seeded from the planned page's title. */
const placeholderSupportHref = (title: string): string =>
  `/help/support?subject=${encodeURIComponent(`Request: ${title}`)}`;

/**
 * Coming Soon page for planned nav leaves (D-06; gap/10 W3). Brings its own
 * h1 (the shell's heading contract), on tokens in both themes, and offers a
 * "Tell us what you need" link to Support next to "Go back".
 */
export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({
  title,
  description = 'This feature is currently under development.',
  icon,
  features = [],
  expectedRelease,
  showBackButton = true,
  supportHref,
}) => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md text-center">
        <div
          className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-signal-muted text-primary ring-1 ring-inset ring-primary/20 [&_svg]:size-7"
          aria-hidden="true"
        >
          {icon || <Construction />}
        </div>

        <p className="type-eyebrow text-muted-foreground">Coming soon</p>
        <h1 className="mt-1.5 type-display text-foreground">{title}</h1>
        <p className="mt-2 type-body text-muted-foreground">{description}</p>

        {features.length > 0 && (
          <Card className="mt-6 text-left">
            <CardContent className="p-4">
              <h2 className="type-subtitle text-foreground">Planned features</h2>
              <ul className="mt-3 space-y-2 type-body text-muted-foreground">
                {features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {expectedRelease && (
          <p className="mt-6 type-body-sm text-muted-foreground">
            Expected: <span className="font-medium text-foreground">{expectedRelease}</span>
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {showBackButton && (
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft aria-hidden="true" />
              Go back
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to={supportHref ?? placeholderSupportHref(title)}>
              <MessageSquare aria-hidden="true" />
              Tell us what you need
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PlaceholderPage;
