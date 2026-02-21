import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  ClipboardCheck, FileText, Calendar, AlertTriangle, CheckCircle,
  Clock, ChevronRight, Loader2, Award, Bell, User, Ship, FileCheck
} from 'lucide-react';
import { useCrewTasks } from '@/modules/crew/hooks/useCrewTasks';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { format, differenceInDays, isBefore, addDays } from 'date-fns';

interface CrewTask {
  id: string;
  type: 'form' | 'task' | 'acknowledgement' | 'certificate';
  title: string;
  description?: string;
  dueDate?: string;
  status: 'pending' | 'overdue' | 'upcoming';
  priority: 'low' | 'medium' | 'high';
  link: string;
}

interface CertificateStatus {
  id: string;
  name: string;
  expiryDate: string;
  daysUntilExpiry: number;
  status: 'valid' | 'expiring' | 'expired';
}

export default function CrewDashboard() {
  const { user, profile } = useAuth();
  const { selectedVessel } = useVessel();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<CrewTask[]>([]);
  const [certificates, setCertificates] = useState<CertificateStatus[]>([]);
  const [pendingForms, setPendingForms] = useState(0);
  const [pendingAcks, setPendingAcks] = useState(0);
  
  // Load assigned crew tasks
  const { tasks: assignedTasks, loading: tasksLoading } = useCrewTasks({ 
    assignedToMe: true, 
    status: ['pending', 'in_progress'] 
  });

  useEffect(() => {
    if (user?.id) {
      loadCrewData();
    }
  }, [user?.id]);

  async function loadCrewData() {
    setLoading(true);
    try {
      // Load pending forms assigned to user
      const { data: formData } = await supabase
        .from('form_submissions')
        .select(`
          id, submission_number, due_date, status,
          template:form_templates(template_name, form_type)
        `)
        .eq('created_by', user?.id)
        .in('status', ['DRAFT', 'IN_PROGRESS'])
        .order('due_date', { ascending: true })
        .limit(5);

      // Load pending signatures
      const { data: sigData, count: sigCount } = await supabase
        .from('form_submissions')
        .select('id', { count: 'exact' })
        .eq('status', 'PENDING_SIGNATURE');

      // Load certificates
      const { data: certData } = await supabase
        .from('crew_certificates')
        .select('id, certificate_name, expiry_date, status')
        .eq('user_id', user?.id)
        .not('expiry_date', 'is', null)
        .order('expiry_date', { ascending: true })
        .limit(10);

      // Build tasks list
      const newTasks: CrewTask[] = [];
      const today = new Date();

      // Add forms as tasks
      formData?.forEach(form => {
        const dueDate = form.due_date ? new Date(form.due_date) : null;
        const isOverdue = dueDate && isBefore(dueDate, today);
        
        newTasks.push({
          id: form.id,
          type: 'form',
          title: form.template?.template_name || 'Form Submission',
          description: `Status: ${form.status}`,
          dueDate: form.due_date,
          status: isOverdue ? 'overdue' : 'pending',
          priority: isOverdue ? 'high' : 'medium',
          link: `/ism/forms/submission/${form.id}`,
        });
      });

      // Process certificates
      const certStatuses: CertificateStatus[] = [];
      certData?.forEach(cert => {
        if (!cert.expiry_date) return;
        const expiryDate = new Date(cert.expiry_date);
        const daysUntil = differenceInDays(expiryDate, today);
        
        let status: 'valid' | 'expiring' | 'expired' = 'valid';
        if (daysUntil < 0) status = 'expired';
        else if (daysUntil <= 90) status = 'expiring';

        certStatuses.push({
          id: cert.id,
          name: cert.certificate_name,
          expiryDate: cert.expiry_date,
          daysUntilExpiry: daysUntil,
          status,
        });

        // Add expiring certificates as tasks
        if (status === 'expired' || status === 'expiring') {
          newTasks.push({
            id: `cert-${cert.id}`,
            type: 'certificate',
            title: `Certificate Expiry: ${cert.certificate_name}`,
            description: daysUntil < 0 
              ? `Expired ${Math.abs(daysUntil)} days ago`
              : `Expires in ${daysUntil} days`,
            dueDate: cert.expiry_date,
            status: status === 'expired' ? 'overdue' : 'upcoming',
            priority: status === 'expired' ? 'high' : 'medium',
            link: '/crew/certificates',
          });
        }
      });

      setTasks(newTasks.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }));
      setCertificates(certStatuses);
      setPendingForms(formData?.length || 0);
      setPendingAcks(sigCount || 0);
    } catch (error) {
      console.error('Failed to load crew data:', error);
    } finally {
      setLoading(false);
    }
  }

  const taskCounts = useMemo(() => {
    const overdue = tasks.filter(t => t.status === 'overdue').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const upcoming = tasks.filter(t => t.status === 'upcoming').length;
    return { overdue, pending, upcoming, total: tasks.length };
  }, [tasks]);

  const certCounts = useMemo(() => {
    const expired = certificates.filter(c => c.status === 'expired').length;
    const expiring = certificates.filter(c => c.status === 'expiring').length;
    const valid = certificates.filter(c => c.status === 'valid').length;
    return { expired, expiring, valid, total: certificates.length };
  }, [certificates]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Dashboard</h1>
            <p className="text-muted-foreground">
              Welcome back, {profile?.first_name || 'Crew Member'}
              {selectedVessel && ` • ${selectedVessel.name}`}
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Pending Tasks"
            value={taskCounts.pending}
            icon={ClipboardCheck}
            color="text-blue-600 bg-blue-100"
            alert={taskCounts.overdue > 0}
          />
          <StatCard
            label="Overdue Items"
            value={taskCounts.overdue}
            icon={AlertTriangle}
            color="text-destructive bg-destructive/10"
          />
          <StatCard
            label="Pending Signatures"
            value={pendingAcks}
            icon={FileText}
            color="text-yellow-600 bg-yellow-100"
          />
          <StatCard
            label="Expiring Certs"
            value={certCounts.expiring + certCounts.expired}
            icon={Award}
            color="text-orange-600 bg-orange-100"
            alert={certCounts.expired > 0}
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tasks List */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4" />
                  My Tasks & Actions
                </CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/crew/tasks">
                    View All <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {tasks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-2 text-success" />
                    <p>All caught up! No pending tasks.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tasks.slice(0, 5).map((task) => (
                      <TaskItem key={task.id} task={task} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending Signatures */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Pending Signatures
                </CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/ism/forms/pending">
                    View All <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {pendingAcks === 0 ? (
                  <p className="text-center py-6 text-muted-foreground">
                    No forms awaiting your signature
                  </p>
                ) : (
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium">{pendingAcks} form(s) require your signature</p>
                      <p className="text-sm text-muted-foreground">
                        Review and sign pending forms
                      </p>
                    </div>
                    <Button asChild size="sm">
                      <Link to="/ism/forms/pending">Sign Now</Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Certificate Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  My Certificates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Valid</span>
                    <Badge variant="outline" className="bg-success/10 text-success">
                      {certCounts.valid}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Expiring Soon</span>
                    <Badge variant="outline" className="bg-warning/10 text-warning">
                      {certCounts.expiring}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Expired</span>
                    <Badge variant="outline" className="bg-destructive/10 text-destructive">
                      {certCounts.expired}
                    </Badge>
                  </div>
                  
                  {certificates.length > 0 && (
                    <>
                      <hr className="my-3" />
                      <div className="space-y-2">
                        {certificates
                          .filter(c => c.status !== 'valid')
                          .slice(0, 3)
                          .map((cert) => (
                            <div key={cert.id} className="flex items-center justify-between text-sm">
                              <span className="truncate">{cert.name}</span>
                              <span className={`text-xs ${
                                cert.status === 'expired' ? 'text-destructive' : 'text-warning'
                              }`}>
                                {cert.daysUntilExpiry < 0 
                                  ? `${Math.abs(cert.daysUntilExpiry)}d ago`
                                  : `${cert.daysUntilExpiry}d`
                                }
                              </span>
                            </div>
                          ))}
                      </div>
                    </>
                  )}
                  
                  <Button variant="outline" size="sm" className="w-full mt-2" asChild>
                    <Link to="/crew/certificates">View All Certificates</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Quick Links */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <Link to="/ism/forms/templates">
                    <FileText className="h-4 w-4 mr-2" />
                    Start New Form
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <Link to="/crew/hours-of-rest">
                    <Clock className="h-4 w-4 mr-2" />
                    Log Hours of Rest
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <Link to="/documents">
                    <FileText className="h-4 w-4 mr-2" />
                    View Documents
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatCard({ 
  label, 
  value, 
  icon: Icon, 
  color, 
  alert 
}: { 
  label: string; 
  value: number; 
  icon: React.ElementType; 
  color: string;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? 'border-destructive' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskItem({ task }: { task: CrewTask }) {
  const getTaskIcon = () => {
    switch (task.type) {
      case 'form': return <FileText className="h-4 w-4" />;
      case 'certificate': return <Award className="h-4 w-4" />;
      case 'acknowledgement': return <CheckCircle className="h-4 w-4" />;
      default: return <ClipboardCheck className="h-4 w-4" />;
    }
  };

  const getStatusColor = () => {
    switch (task.status) {
      case 'overdue': return 'bg-destructive/10 text-destructive border-destructive/30';
      case 'pending': return 'bg-warning/10 text-warning border-warning/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Link
      to={task.link}
      className={`flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors ${
        task.status === 'overdue' ? 'border-destructive/30' : ''
      }`}
    >
      <div className={`p-2 rounded-lg ${
        task.status === 'overdue' 
          ? 'bg-destructive/10 text-destructive' 
          : 'bg-muted text-muted-foreground'
      }`}>
        {getTaskIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{task.title}</p>
        {task.description && (
          <p className="text-xs text-muted-foreground truncate">{task.description}</p>
        )}
      </div>
      <div className="text-right">
        {task.dueDate && (
          <p className="text-xs text-muted-foreground">
            {format(new Date(task.dueDate), 'MMM d')}
          </p>
        )}
        <Badge variant="outline" className={`text-xs ${getStatusColor()}`}>
          {task.status}
        </Badge>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
