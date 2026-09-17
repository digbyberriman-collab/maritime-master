import React, { useMemo, useState } from 'react';
import {
  LifeBuoy, Search, ChevronDown, Users, Ship, ShieldCheck, Award, FileText, Rocket,
  BookOpen, Mail,
} from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface GuideArticle {
  title: string;
  summary: string;
  steps: string[];
}

interface GuideCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  articles: GuideArticle[];
}

const GUIDE_CATEGORIES: GuideCategory[] = [
  {
    id: 'getting-started',
    name: 'Getting Started',
    description: 'Orientation and everyday basics.',
    icon: Rocket,
    articles: [
      {
        title: 'Find your way around',
        summary: 'Modules, the sidebar and quick actions explained.',
        steps: [
          'Use the module bar across the top (Fleet, Vessels, Shoreside, Health & Wellness, Yard, HRIS) to switch areas.',
          'The blue sidebar below shows the pages inside the active module — groups expand and collapse.',
          'Your account menu sits bottom-left: profile, settings, issue reporting and sign-out.',
          'The bell icon shows alerts; click one to jump straight to the record that needs attention.',
        ],
      },
      {
        title: 'Switch vessel scope',
        summary: 'Work across the fleet or a single vessel.',
        steps: [
          'Click the ship icon in the header to open the multi-vessel filter.',
          'Select one or more vessels; dashboards, lists and alerts update to match.',
          'Your selection is remembered as you move between pages.',
        ],
      },
    ],
  },
  {
    id: 'crew-hr',
    name: 'Crew & HR',
    description: 'Roster, rotations, leave and travel.',
    icon: Users,
    articles: [
      {
        title: 'Add a crew member',
        summary: 'Create a record and assign vessel and department.',
        steps: [
          'Open the HRIS module from the top bar and choose Crew List.',
          'Click "Add crew member" and fill in their details — only the name is required to start.',
          'Assign them to a vessel and department, then save.',
          'Use the record dialog later to add documents, contracts and emergency contacts.',
        ],
      },
      {
        title: 'Plan crew rotations',
        summary: 'Build rotation blocks and resolve conflicts.',
        steps: [
          'Open HRIS and choose Rotation Planner.',
          'Drag on a crew lane to create a rotation block; drag edges to resize.',
          'Use the filters to focus on a vessel or department, and zoom for the month view.',
          'Conflicts are flagged automatically — open the conflict panel to resolve them.',
        ],
      },
      {
        title: 'Manage leave requests',
        summary: 'Submit, approve and track leave balances.',
        steps: [
          'Crew submit leave from HRIS > Leave Requests.',
          'Approvers see pending requests and can approve or decline with a note.',
          'Balances follow the F + Q − L + Carryover formula and show on the Leave Planner.',
          'Click-and-drag on the planner paints leave days directly onto the calendar.',
        ],
      },
    ],
  },
  {
    id: 'vessel-operations',
    name: 'Vessel Operations',
    description: 'Logbooks, maintenance and drills.',
    icon: Ship,
    articles: [
      {
        title: 'Log an electronic logbook entry',
        summary: 'Record, sign off and finalise daily entries.',
        steps: [
          'Open the Vessel module and choose Logbooks.',
          'Pick the logbook (e.g. Deck Log) for the selected vessel.',
          'Click a day on the calendar to add an entry, then save it as a draft.',
          'A senior officer can then sign it off and finalise it — finalised entries are locked.',
        ],
      },
      {
        title: 'Use the engine room sheet',
        summary: 'Vessel-specific sheets with automatic calculations.',
        steps: [
          'With the vessel selected, open the Engine Log from Vessel > Logbooks.',
          'If the vessel has its own sheet (e.g. DAGON), the spreadsheet-style form opens automatically.',
          'Running hours, meter usage and remaining-on-board figures calculate as you type.',
          'Save as draft, then have the duty engineer and chief engineer sign off.',
        ],
      },
      {
        title: 'Raise a maintenance work order',
        summary: 'Planned maintenance and defects.',
        steps: [
          'Open the Vessel module and choose Maintenance.',
          'Pick a category and create a work order, or convert a reported defect.',
          'Recurring jobs generate automatically from the planned maintenance schedule.',
          'Priority defects (P1/P2) are surfaced on the vessel dashboard.',
        ],
      },
    ],
  },
  {
    id: 'safety-compliance',
    name: 'Safety & Compliance',
    description: 'Incidents, risk assessments and audits.',
    icon: ShieldCheck,
    articles: [
      {
        title: 'Record an incident or near miss',
        summary: 'Step-by-step reporting with attachments.',
        steps: [
          'Open the Vessel module and choose Incidents.',
          'Click "Report incident" and follow the step-by-step report.',
          'Attach photos or documents, then submit for review.',
          'Track corrective actions (CAPAs) from the incident record.',
        ],
      },
      {
        title: 'Complete a risk assessment',
        summary: 'The 5×5 matrix and work permits.',
        steps: [
          'Open Vessel > Risk Assessments and start a new assessment.',
          'Score likelihood and consequence — the 5×5 matrix calculates the risk rating (1–25).',
          'Link a work permit (Hot Work, Working Aloft) when the task requires one.',
          'Review and re-validate assessments on their due dates.',
        ],
      },
    ],
  },
  {
    id: 'certificates-training',
    name: 'Certificates & Training',
    description: 'Expiry alerts, renewals and familiarisation.',
    icon: Award,
    articles: [
      {
        title: 'Upload a crew or vessel certificate',
        summary: 'Attach scans and let alerts track expiry.',
        steps: [
          'Open HRIS > Crew List and open the crew member, or Vessel > Vessel Details.',
          'Go to the Certificates section and click "Add certificate".',
          'Choose the type, enter the expiry date and attach the scan (PDF or image).',
          'Expiry alerts are raised automatically at 90, 60, 30 and 7 days.',
        ],
      },
      {
        title: 'Assign familiarisation checklists',
        summary: 'Rank-specific onboarding templates.',
        steps: [
          'Open Training from the sidebar and choose Familiarisation.',
          'Select the crew member — the checklist template matches their rank.',
          'Tick items off together; progress saves automatically.',
          'Completed checklists are stored against the training record.',
        ],
      },
    ],
  },
  {
    id: 'reports-documents',
    name: 'Reports & Documents',
    description: 'PDF exports, forms and the document library.',
    icon: FileText,
    articles: [
      {
        title: 'Export reports to PDF',
        summary: 'Print-ready output from any list or planner.',
        steps: [
          'Most list pages have an Export or PDF button in the toolbar.',
          'Logbooks: open a logbook and click "Export PDF" to pick a date range.',
          'Crew List: use "Crew list PDF" for the official IMO FAL Form 5.',
          'Rotation Planner: use Export to PDF for a colour planner view.',
        ],
      },
      {
        title: 'Find a controlled document',
        summary: 'Search the SMS library and master index.',
        steps: [
          'Open Documents from the sidebar and use the search page for full-text search.',
          'The Master Document Index lists every controlled document with its version.',
          'Documents awaiting review appear in the Review Queue.',
          'Crew acknowledgments are tracked under Crew > Acknowledgments.',
        ],
      },
    ],
  },
];

const HowToGuidesPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GUIDE_CATEGORIES;
    return GUIDE_CATEGORIES.map((cat) => ({
      ...cat,
      articles: cat.articles.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.steps.some((s) => s.toLowerCase().includes(q)),
      ),
    })).filter((cat) => cat.articles.length > 0);
  }, [query]);

  const totalArticles = useMemo(
    () => filtered.reduce((n, c) => n + c.articles.length, 0),
    [filtered],
  );

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <LifeBuoy className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">How-to Guides</h1>
            <p className="text-sm text-muted-foreground">
              Step-by-step walkthroughs for common tasks.
            </p>
          </div>
        </div>

        <div className="relative mt-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guides…"
            className="pl-9"
          />
        </div>

        {totalArticles === 0 ? (
          <Card className="mt-6">
            <CardContent className="py-10 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                No guides match "{query}".
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 space-y-8">
            {filtered.map((cat) => {
              const Icon = cat.icon;
              return (
                <section key={cat.id}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <h2 className="text-base font-semibold text-foreground">{cat.name}</h2>
                    <span className="text-xs text-muted-foreground">— {cat.description}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {cat.articles.map((article) => {
                      const key = `${cat.id}:${article.title}`;
                      const open = openKey === key;
                      return (
                        <Card key={key} className="overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setOpenKey(open ? null : key)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                          >
                            <div>
                              <p className="text-sm font-medium text-foreground">{article.title}</p>
                              <p className="text-xs text-muted-foreground">{article.summary}</p>
                            </div>
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
                            />
                          </button>
                          {open && (
                            <CardContent className="border-t border-border pt-4">
                              <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
                                {article.steps.map((step, i) => (
                                  <li key={i}>{step}</li>
                                ))}
                              </ol>
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <Card className="mt-10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Still stuck?</CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href="mailto:SOS@INK.FISH"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Mail className="h-4 w-4" />
              Contact support at SOS@INK.FISH
            </a>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default HowToGuidesPage;
