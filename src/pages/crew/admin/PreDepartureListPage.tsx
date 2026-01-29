import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  ClipboardCheck, Search, Filter, ChevronRight, 
  Loader2, Calendar, User, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';

interface PreDepartureChecklist {
  id: string;
  checklist_status: string;
  medical_fit_to_travel: boolean;
  vaccination_status: string;
  passport_valid: boolean;
  visa_required: boolean;
  visa_obtained: boolean;
  flight_ticket_received: boolean;
  joining_instructions_sent: boolean;
  crew_member: {
    first_name: string;
    last_name: string;
  };
  travel_record: {
    departure_date: string;
    destination_city: string;
    destination_country: string;
    travel_type: string;
  } | null;
}

const statusColors: Record<string, string> = {
  incomplete: 'bg-yellow-100 text-yellow-700',
  pending_review: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  issues_found: 'bg-red-100 text-red-700',
};

export default function PreDepartureListPage() {
  const [checklists, setChecklists] = useState<PreDepartureChecklist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadChecklists();
  }, [statusFilter]);

  async function loadChecklists() {
    setIsLoading(true);
    try {
      let query = supabase
        .from('pre_departure_checklists')
        .select(`
          *,
          crew_member:profiles(first_name, last_name),
          travel_record:crew_travel_records(departure_date, destination_city, destination_country, travel_type)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('checklist_status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setChecklists(data || []);
    } catch (error) {
      console.error('Failed to load checklists:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function calculateProgress(checklist: PreDepartureChecklist): number {
    const items = [
      checklist.medical_fit_to_travel,
      checklist.vaccination_status === 'up_to_date' || checklist.vaccination_status === 'exempt',
      checklist.passport_valid,
      !checklist.visa_required || checklist.visa_obtained,
      checklist.flight_ticket_received,
      checklist.joining_instructions_sent,
    ];
    return Math.round((items.filter(Boolean).length / items.length) * 100);
  }

  const filteredChecklists = checklists.filter(c => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      c.crew_member?.first_name?.toLowerCase().includes(searchLower) ||
      c.crew_member?.last_name?.toLowerCase().includes(searchLower) ||
      c.travel_record?.destination_city?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6" />
          Pre-Departure Checklists
        </h1>
        <p className="text-muted-foreground">Track crew readiness for travel</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or destination..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="incomplete">Incomplete</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="issues_found">Issues Found</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Checklists */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredChecklists.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No checklists found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredChecklists.map((checklist) => {
            const progress = calculateProgress(checklist);
            
            return (
              <Link key={checklist.id} to={`/crew/admin/pre-departure/${checklist.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                        progress === 100 ? 'bg-green-100' : progress >= 50 ? 'bg-yellow-100' : 'bg-red-100'
                      }`}>
                        {progress === 100 ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600" />
                        ) : (
                          <span className="text-sm font-bold">{progress}%</span>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium flex items-center gap-1">
                            <User className="w-4 h-4" />
                            {checklist.crew_member?.first_name} {checklist.crew_member?.last_name}
                          </p>
                          <Badge className={`text-xs ${statusColors[checklist.checklist_status]}`}>
                            {checklist.checklist_status.replace('_', ' ')}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {checklist.travel_record && (
                            <>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(checklist.travel_record.departure_date), 'MMM d, yyyy')}
                              </span>
                              <span>
                                → {checklist.travel_record.destination_city || checklist.travel_record.destination_country}
                              </span>
                            </>
                          )}
                        </div>
                        
                        <Progress value={progress} className="h-2 mt-2" />
                      </div>
                      
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {checklist.visa_required && !checklist.visa_obtained && (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Visa Missing
                          </Badge>
                        )}
                        {!checklist.flight_ticket_received && (
                          <Badge variant="secondary" className="text-xs">
                            No Ticket
                          </Badge>
                        )}
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
