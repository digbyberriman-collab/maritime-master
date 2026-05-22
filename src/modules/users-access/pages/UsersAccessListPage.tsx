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
import { PageHeader } from '@/shared/components/common/PageHeader';

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
        <PageHeader
          title="Users & Access"
          description="Manage who can see and do what across the fleet."
          actions={
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or position…"
                className="pl-8 w-64"
              />
            </div>
          }
        />

        <Card className="divide-y">
          {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">No users match your search.</div>
          )}
          {filtered.map((r) => (
            <div key={r.userId} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors">
              <Checkbox aria-label={`Select ${r.firstName}`} />
              <div className="min-w-[180px]">
                <div className="font-semibold text-sm text-foreground">
                  {r.firstName} {r.lastName}
                </div>
                <Badge variant="outline" className="rounded-sm text-[10px] px-1 py-0 bg-muted text-muted-foreground border-transparent">
                  {r.status}
                </Badge>
              </div>
              <div className="min-w-[160px] text-sm text-muted-foreground truncate">{r.position || '—'}</div>
              <div className="min-w-[140px]">
                <PresetBadge preset={r.preset} />
              </div>
              <div className="flex flex-wrap gap-1 flex-1">
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