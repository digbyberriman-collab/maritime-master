import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Anchor, Wrench, Bell, Radio, Droplets, Trash2, Wind, Users, ChevronRight,
} from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface LogbookEntry {
  label: string;
  path: string;
  description: string;
  icon: React.ElementType;
  statutory: boolean;
}

const LOGBOOKS: LogbookEntry[] = [
  {
    label: 'Deck Log',
    path: '/vessel/logbooks/deck-log',
    description: 'Daily navigational record: watches, position, course, weather and events.',
    icon: Anchor,
    statutory: true,
  },
  {
    label: 'Engine Log',
    path: '/vessel/logbooks/engine-log',
    description: 'Machinery running hours, fuel and lube consumption, tank soundings.',
    icon: Wrench,
    statutory: true,
  },
  {
    label: 'Bell Book',
    path: '/vessel/logbooks/bell-book',
    description: 'Manoeuvring record of engine and helm orders during pilotage and berthing.',
    icon: Bell,
    statutory: false,
  },
  {
    label: 'Radio Log',
    path: '/vessel/logbooks/radio-log',
    description: 'GMDSS communications, distress traffic and equipment tests.',
    icon: Radio,
    statutory: true,
  },
  {
    label: 'Oil Record Book',
    path: '/vessel/logbooks/oil-record-book',
    description: 'MARPOL Annex I transfers, bunkering, sludge and bilge water disposal.',
    icon: Droplets,
    statutory: true,
  },
  {
    label: 'Garbage Record Book',
    path: '/vessel/logbooks/garbage-record-book',
    description: 'MARPOL Annex V waste categories, landings and incineration.',
    icon: Trash2,
    statutory: true,
  },
  {
    label: 'Ballast Water Record',
    path: '/vessel/logbooks/ballast-water-record',
    description: 'Ballast uptake, exchange and discharge under the BWM Convention.',
    icon: Wind,
    statutory: true,
  },
  {
    label: 'Visitor & Guest Log',
    path: '/vessel/logbooks/visitor-log',
    description: 'ISPS record of visitors, contractors and guests boarding the vessel.',
    icon: Users,
    statutory: false,
  },
];

const LogbookList: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = React.useState('');

  const filtered = LOGBOOKS.filter((book) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return book.label.toLowerCase().includes(q) || book.description.toLowerCase().includes(q);
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 p-1">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Electronic Logbooks</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Statutory and operational logbooks kept for this vessel. Select a logbook to view or add entries.
            </p>
          </div>
          <div className="w-full md:w-72">
            <Input
              placeholder="Search logbooks..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search logbooks"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((book) => {
            const Icon = book.icon;
            return (
              <Card
                key={book.path}
                role="button"
                tabIndex={0}
                onClick={() => navigate(book.path)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(book.path);
                  }
                }}
                className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </span>
                      <CardTitle className="text-base">{book.label}</CardTitle>
                    </div>
                    <ChevronRight className="mt-2 h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CardDescription>{book.description}</CardDescription>
                  <Badge variant={book.statutory ? 'default' : 'secondary'}>
                    {book.statutory ? 'Statutory' : 'Operational'}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">No logbooks match “{query}”.</p>
        )}
      </div>
    </DashboardLayout>
  );
};

export default LogbookList;
