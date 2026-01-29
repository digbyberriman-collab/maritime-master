import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plane, FileText, ClipboardCheck, Home, 
  Calendar, Upload, Plus, ArrowRight, Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface DashboardStats {
  upcomingTravel: number;
  pendingDocuments: number;
  incompleteChecklists: number;
  quarantineBookings: number;
}

export default function CrewAdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const twoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [travelRes, docsRes, checklistRes, quarantineRes] = await Promise.all([
        supabase.from('crew_travel_records')
          .select('id', { count: 'exact' })
          .gte('departure_date', today)
          .lte('departure_date', twoWeeks)
          .in('status', ['planned', 'booked', 'confirmed']),
        supabase.from('crew_travel_documents')
          .select('id', { count: 'exact' })
          .eq('extraction_status', 'pending'),
        supabase.from('pre_departure_checklists')
          .select('id', { count: 'exact' })
          .eq('checklist_status', 'incomplete'),
        supabase.from('quarantine_bookings')
          .select('id', { count: 'exact' })
          .eq('status', 'confirmed')
      ]);

      setStats({
        upcomingTravel: travelRes.count || 0,
        pendingDocuments: docsRes.count || 0,
        incompleteChecklists: checklistRes.count || 0,
        quarantineBookings: quarantineRes.count || 0,
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const statCards = [
    { label: 'Upcoming Travel', value: stats?.upcomingTravel ?? 0, icon: Plane, color: 'text-blue-600 bg-blue-100', href: '/crew/admin/travel' },
    { label: 'Pending Documents', value: stats?.pendingDocuments ?? 0, icon: FileText, color: 'text-yellow-600 bg-yellow-100', href: '/crew/admin/documents' },
    { label: 'Incomplete Checklists', value: stats?.incompleteChecklists ?? 0, icon: ClipboardCheck, color: 'text-orange-600 bg-orange-100', href: '/crew/admin/pre-departure' },
    { label: 'Quarantine Bookings', value: stats?.quarantineBookings ?? 0, icon: Home, color: 'text-purple-600 bg-purple-100', href: '/crew/admin/quarantine/bookings' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Crew Admin</h1>
          <p className="text-muted-foreground">Travel, documents, and shoreside operations</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/crew/admin/documents/upload">
              <Upload className="w-4 h-4 mr-2" />
              Upload Documents
            </Link>
          </Button>
          <Button asChild>
            <Link to="/crew/admin/travel/new">
              <Plus className="w-4 h-4 mr-2" />
              New Travel Record
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Link key={stat.label} to={stat.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-3xl font-bold mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-lg ${stat.color}`}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UpcomingTravelCard />
        <PendingChecklistsCard />
      </div>
    </div>
  );
}

function UpcomingTravelCard() {
  const [travel, setTravel] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTravel();
  }, []);

  async function loadTravel() {
    try {
      const { data } = await supabase
        .from('crew_travel_records')
        .select(`*, crew_member:profiles(first_name, last_name)`)
        .gte('departure_date', new Date().toISOString().split('T')[0])
        .order('departure_date')
        .limit(5);
      setTravel(data || []);
    } catch (error) {
      console.error('Failed to load travel:', error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">Upcoming Travel</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/crew/admin/travel">
            View All <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : travel.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No upcoming travel</p>
        ) : (
          <div className="space-y-3">
            {travel.map((t) => (
              <Link
                key={t.id}
                to={`/crew/admin/travel/${t.id}`}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="font-medium">
                    {t.crew_member?.first_name} {t.crew_member?.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Plane className="w-3 h-3" />
                    {t.origin_airport_code || 'TBD'} → {t.destination_airport_code || 'TBD'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(t.departure_date), 'MMM d')}
                  </p>
                  <Badge variant="outline" className="text-xs capitalize">
                    {t.travel_type}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PendingChecklistsCard() {
  const [checklists, setChecklists] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadChecklists();
  }, []);

  async function loadChecklists() {
    try {
      const { data } = await supabase
        .from('pre_departure_checklists')
        .select(`*, crew_member:profiles(first_name, last_name), travel_record:crew_travel_records(departure_date)`)
        .eq('checklist_status', 'incomplete')
        .limit(5);
      setChecklists(data || []);
    } catch (error) {
      console.error('Failed to load checklists:', error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">Pending Pre-Departure</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/crew/admin/pre-departure">
            View All <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : checklists.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No pending checklists</p>
        ) : (
          <div className="space-y-3">
            {checklists.map((c) => (
              <Link
                key={c.id}
                to={`/crew/admin/pre-departure/${c.id}`}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="font-medium">
                    {c.crew_member?.first_name} {c.crew_member?.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Due: {c.travel_record?.departure_date ? format(new Date(c.travel_record.departure_date), 'MMM d, yyyy') : 'TBD'}
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  Incomplete
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
