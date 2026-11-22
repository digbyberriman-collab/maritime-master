import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Settings2 } from 'lucide-react';
import { useUsersWithAccess } from '../hooks/useUsersWithAccess';
import { PresetBadge } from '../components/PresetBadge';
import { ModulePermChip } from '../components/ModulePermChip';

const UsersAccessListPage: React.FC = () => {
  const { data: rows, isLoading } = useUsersWithAccess();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.firstName} ${r.lastName} ${r.position ?? ''} ${r.email}`.toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-6 space-y-4">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Users &amp; Access</h1>
            <p className="text-sm text-muted-foreground">Manage who can see and do what across the fleet.</p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or position…"
                className="w-full pl-8 sm:w-64"
              />
            </div>
          </div>
        </header>

        <Card className="divide-y">
          {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">No users match your search.</div>
          )}
          {filtered.map((r) => (
            // Below 768 px a row wraps (position, preset and chips under the name) instead of overflowing the page.
            <div key={r.userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-colors hover:bg-muted/30 md:flex-nowrap">
              <Checkbox aria-label={`Select ${r.firstName}`} />
              <div className="min-w-0 flex-1 md:min-w-[180px] md:flex-none">
                <div className="font-semibold text-sm text-foreground">
                  {r.firstName} {r.lastName}
                </div>
                <Badge variant="outline" className="rounded-sm text-[10px] px-1 py-0 bg-muted text-muted-foreground border-transparent">
                  {r.status}
                </Badge>
              </div>
              <div className="min-w-0 basis-full truncate pl-7 text-sm text-muted-foreground md:min-w-[160px] md:basis-auto md:pl-0">{r.position || '—'}</div>
              <div className="pl-7 md:min-w-[140px] md:pl-0">
                <PresetBadge preset={r.preset} />
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {r.chips.map((c) => (
                  <ModulePermChip key={c.label} label={c.label} level={c.level} />
                ))}
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to={`/users-access/${r.userId}`}>
                  <Settings2 className="w-3.5 h-3.5 mr-1" />
                  Edit
                </Link>
              </Button>
            </div>
          ))}
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default UsersAccessListPage;