import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ClipboardCheck, Check, X, AlertTriangle, FileText, 
  Plane, Heart, Shield, Upload, Send, ArrowLeft, 
  Calendar, User, MapPin, Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/shared/hooks/use-toast';
import { format } from 'date-fns';
import type { LucideIcon } from 'lucide-react';

interface ChecklistItem {
  id: string;
  category: string;
  label: string;
  field: string;
  status: 'complete' | 'incomplete' | 'na' | 'warning';
  documentRequired: boolean;
}

export default function PreDepartureDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [checklist, setChecklist] = useState<any>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadChecklist();
  }, [id]);

  async function loadChecklist() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('pre_departure_checklists')
        .select(`
          *,
          crew_member:profiles(first_name, last_name, email),
          travel_record:crew_travel_records(
            departure_date, arrival_date, 
            origin_city, origin_airport_code, 
            destination_city, destination_airport_code,
            travel_type, status
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      
      setChecklist(data);
      buildChecklistItems(data);
    } catch (error) {
      console.error('Failed to load checklist:', error);
      toast({
        title: 'Error',
        description: 'Failed to load checklist',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  function buildChecklistItems(data: any) {
    const checklistItems: ChecklistItem[] = [
      { 
        id: '1', category: 'Health', label: 'Medical Fit to Travel', 
        field: 'medical_fit_to_travel', 
        status: data.medical_fit_to_travel ? 'complete' : 'incomplete', 
        documentRequired: true 
      },
      { 
        id: '2', category: 'Health', label: 'Vaccinations Up to Date', 
        field: 'vaccination_status', 
        status: data.vaccination_status === 'up_to_date' ? 'complete' : 
                data.vaccination_status === 'exempt' ? 'na' : 'incomplete', 
        documentRequired: true 
      },
      { 
        id: '3', category: 'Health', label: 'COVID Test', 
        field: 'covid_test_result', 
        status: !data.covid_test_required ? 'na' : 
                data.covid_test_result === 'negative' ? 'complete' : 'incomplete', 
        documentRequired: data.covid_test_required 
      },
      { 
        id: '4', category: 'Documents', label: 'Passport Valid (6+ months)', 
        field: 'passport_valid', 
        status: data.passport_valid && data.passport_expiry_ok ? 'complete' : 'incomplete', 
        documentRequired: false 
      },
      { 
        id: '5', category: 'Documents', label: 'Visa Obtained', 
        field: 'visa_obtained', 
        status: !data.visa_required ? 'na' : data.visa_obtained ? 'complete' : 'warning', 
        documentRequired: data.visa_required 
      },
      { 
        id: '6', category: 'Documents', label: "Seaman's Book Valid", 
        field: 'seamans_book_valid', 
        status: data.seamans_book_valid ? 'complete' : 'incomplete', 
        documentRequired: false 
      },
      { 
        id: '7', category: 'Documents', label: 'Certificates Valid', 
        field: 'certificates_valid', 
        status: data.certificates_valid ? 'complete' : 'incomplete', 
        documentRequired: false 
      },
      { 
        id: '8', category: 'Travel', label: 'Flight Ticket Received', 
        field: 'flight_ticket_received', 
        status: data.flight_ticket_received ? 'complete' : 'incomplete', 
        documentRequired: true 
      },
      { 
        id: '9', category: 'Travel', label: 'Itinerary Sent', 
        field: 'itinerary_sent', 
        status: data.itinerary_sent ? 'complete' : 'incomplete', 
        documentRequired: false 
      },
      { 
        id: '10', category: 'Travel', label: 'Travel Insurance Valid', 
        field: 'travel_insurance_valid', 
        status: data.travel_insurance_valid ? 'complete' : 'incomplete', 
        documentRequired: true 
      },
      { 
        id: '11', category: 'Briefing', label: 'Joining Instructions Sent', 
        field: 'joining_instructions_sent', 
        status: data.joining_instructions_sent ? 'complete' : 'incomplete', 
        documentRequired: false 
      },
      { 
        id: '12', category: 'Briefing', label: 'Instructions Acknowledged', 
        field: 'joining_instructions_acknowledged', 
        status: data.joining_instructions_acknowledged ? 'complete' : 'incomplete', 
        documentRequired: false 
      },
      { 
        id: '13', category: 'Briefing', label: 'Emergency Contacts Confirmed', 
        field: 'emergency_contacts_confirmed', 
        status: data.emergency_contacts_confirmed ? 'complete' : 'incomplete', 
        documentRequired: false 
      },
    ];
    setItems(checklistItems);
  }

  async function toggleItem(item: ChecklistItem) {
    const newValue = item.status !== 'complete';
    setIsSaving(true);
    
    try {
      const { error } = await supabase
        .from('pre_departure_checklists')
        .update({ 
          [item.field]: newValue, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', id);

      if (error) throw error;
      await loadChecklist();
    } catch (error) {
      console.error('Failed to update item:', error);
      toast({
        title: 'Error',
        description: 'Failed to update checklist',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function approveChecklist() {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('pre_departure_checklists')
        .update({ 
          checklist_status: 'approved',
          approved_by: profile?.user_id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString() 
        })
        .eq('id', id);

      if (error) throw error;
      
      toast({
        title: 'Success',
        description: 'Checklist approved for travel',
      });
      
      await loadChecklist();
    } catch (error) {
      console.error('Failed to approve:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve checklist',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  const categories = [...new Set(items.map(i => i.category))];
  const completedCount = items.filter(i => i.status === 'complete' || i.status === 'na').length;
  const completionPct = Math.round((completedCount / items.length) * 100);

  const categoryIcons: Record<string, LucideIcon> = { 
    'Health': Heart, 
    'Documents': FileText, 
    'Travel': Plane, 
    'Briefing': Send 
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Checklist not found</p>
        <Button asChild className="mt-4">
          <Link to="/crew/admin/pre-departure">Back to Checklists</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardCheck className="w-6 h-6" />
              Pre-Departure Checklist
            </h1>
            <Badge className={`
              ${checklist.checklist_status === 'approved' ? 'bg-green-100 text-green-700' : 
                checklist.checklist_status === 'issues_found' ? 'bg-red-100 text-red-700' : 
                'bg-yellow-100 text-yellow-700'}
            `}>
              {checklist.checklist_status.replace('_', ' ')}
            </Badge>
          </div>
          <p className="text-muted-foreground flex items-center gap-2">
            <User className="w-4 h-4" />
            {checklist.crew_member?.first_name} {checklist.crew_member?.last_name}
          </p>
        </div>
        
        {checklist.travel_record && (
          <div className="text-right">
            <p className="text-sm font-medium flex items-center gap-1 justify-end">
              <Calendar className="w-4 h-4" />
              {format(new Date(checklist.travel_record.departure_date), 'MMM d, yyyy')}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1 justify-end">
              <MapPin className="w-3 h-3" />
              {checklist.travel_record.origin_airport_code || 'TBD'} → {checklist.travel_record.destination_airport_code || 'TBD'}
            </p>
          </div>
        )}
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-sm text-muted-foreground">
              {completedCount} of {items.length} complete
            </span>
          </div>
          <Progress 
            value={completionPct} 
            className={`h-3 ${completionPct >= 75 ? '[&>div]:bg-green-500' : '[&>div]:bg-yellow-500'}`}
          />
        </CardContent>
      </Card>

      {/* Checklist Items */}
      <div className="grid gap-6">
        {categories.map(category => {
          const categoryItems = items.filter(i => i.category === category);
          const Icon = categoryIcons[category] || Shield;
          
          return (
            <Card key={category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {category}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {categoryItems.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleItem(item)}
                        disabled={isSaving || item.status === 'na'}
                        className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors ${
                          item.status === 'complete' ? 'bg-green-500 border-green-500 text-white' :
                          item.status === 'na' ? 'bg-gray-300 border-gray-300 text-white text-xs' :
                          item.status === 'warning' ? 'bg-yellow-100 border-yellow-500 text-yellow-600' :
                          'border-muted-foreground/50 hover:border-primary'
                        }`}
                      >
                        {item.status === 'complete' && <Check className="w-4 h-4" />}
                        {item.status === 'na' && <span className="text-[10px]">N/A</span>}
                        {item.status === 'warning' && <AlertTriangle className="w-4 h-4" />}
                      </button>
                      <span className={item.status === 'complete' ? 'text-foreground' : 'text-muted-foreground'}>
                        {item.label}
                      </span>
                    </div>
                    {item.documentRequired && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/crew/admin/documents/upload?checklist=${id}`}>
                          <Upload className="w-4 h-4 mr-1" />
                          Upload
                        </Link>
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button variant="outline">
          <Send className="w-4 h-4 mr-2" />
          Send Reminder
        </Button>
        <Button 
          onClick={approveChecklist}
          disabled={completionPct < 75 || isSaving || checklist.checklist_status === 'approved'}
        >
          {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Check className="w-4 h-4 mr-2" />
          Approve for Travel
        </Button>
      </div>
    </div>
  );
}
