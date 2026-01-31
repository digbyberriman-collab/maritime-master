import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  Award, Search, Filter, AlertCircle, CheckCircle, Clock,
  Users, Ship, Calendar, Download, Loader2, ChevronRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, differenceInDays, addDays } from 'date-fns';

interface CrewCertificate {
  id: string;
  certificate_type: string;
  certificate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: string;
  crew_member: {
    id: string;
    first_name: string;
    last_name: string;
    rank: string | null;
  } | null;
  vessel: {
    id: string;
    name: string;
  } | null;
}

interface ComplianceStats {
  total: number;
  valid: number;
  expiringSoon: number;
  expired: number;
}

const statusColors: Record<string, string> = {
  valid: 'bg-green-100 text-green-700',
  expiring: 'bg-yellow-100 text-yellow-700',
  expired: 'bg-red-100 text-red-700',
};

export default function CrewCertificatesOverview() {
  const [certificates, setCertificates] = useState<CrewCertificate[]>([]);
  const [vessels, setVessels] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [vesselFilter, setVesselFilter] = useState('all');
  const [stats, setStats] = useState<ComplianceStats>({ total: 0, valid: 0, expiringSoon: 0, expired: 0 });

  useEffect(() => {
    loadData();
  }, [statusFilter, vesselFilter]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [certsRes, vesselsRes] = await Promise.all([
        supabase
          .from('crew_certificates')
          .select(`
            *,
            crew_member:profiles(id, first_name, last_name, rank),
            vessel:vessels(id, name)
          `)
          .order('expiry_date', { ascending: true }),
        supabase
          .from('vessels')
          .select('id, name')
          .eq('status', 'active')
          .order('name'),
      ]);

      if (certsRes.error) throw certsRes.error;
      if (vesselsRes.error) throw vesselsRes.error;

      const certs = (certsRes.data || []) as CrewCertificate[];
      setVessels(vesselsRes.data || []);

      // Calculate stats
      const now = new Date();
      const thirtyDaysFromNow = addDays(now, 30);
      
      const newStats: ComplianceStats = {
        total: certs.length,
        valid: 0,
        expiringSoon: 0,
        expired: 0,
      };

      certs.forEach(cert => {
        if (!cert.expiry_date) {
          newStats.valid++;
        } else {
          const expiry = new Date(cert.expiry_date);
          if (expiry < now) {
            newStats.expired++;
          } else if (expiry < thirtyDaysFromNow) {
            newStats.expiringSoon++;
          } else {
            newStats.valid++;
          }
        }
      });

      setStats(newStats);
      setCertificates(certs);
    } catch (error) {
      console.error('Failed to load data:', error);
      setCertificates([]);
    } finally {
      setIsLoading(false);
    }
  }

  function getCertificateStatus(cert: CrewCertificate): string {
    if (!cert.expiry_date) return 'valid';
    const now = new Date();
    const expiry = new Date(cert.expiry_date);
    const thirtyDaysFromNow = addDays(now, 30);
    
    if (expiry < now) return 'expired';
    if (expiry < thirtyDaysFromNow) return 'expiring';
    return 'valid';
  }

  const filteredCertificates = certificates.filter(cert => {
    // Status filter
    if (statusFilter !== 'all') {
      const certStatus = getCertificateStatus(cert);
      if (statusFilter === 'expiring' && certStatus !== 'expiring') return false;
      if (statusFilter === 'expired' && certStatus !== 'expired') return false;
      if (statusFilter === 'valid' && certStatus !== 'valid') return false;
    }
    
    // Vessel filter
    if (vesselFilter !== 'all' && cert.vessel?.id !== vesselFilter) return false;
    
    // Search
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        cert.crew_member?.first_name?.toLowerCase().includes(searchLower) ||
        cert.crew_member?.last_name?.toLowerCase().includes(searchLower) ||
        cert.certificate_type?.toLowerCase().includes(searchLower) ||
        cert.certificate_number?.toLowerCase().includes(searchLower)
      );
    }
    
    return true;
  });

  const complianceRate = stats.total > 0 
    ? Math.round((stats.valid / stats.total) * 100) 
    : 100;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Award className="w-6 h-6" />
              Crew Certificates Overview
            </h1>
            <p className="text-muted-foreground">Fleet-wide crew certification compliance</p>
          </div>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>

        {/* Compliance Overview */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Fleet Compliance Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="text-4xl font-bold">{complianceRate}%</div>
                <div className="flex-1">
                  <Progress value={complianceRate} className="h-3" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.valid}</p>
                  <p className="text-sm text-muted-foreground">Valid</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.expiringSoon}</p>
                  <p className="text-sm text-muted-foreground">Expiring Soon</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.expired}</p>
                  <p className="text-sm text-muted-foreground">Expired</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, certificate type, or number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="valid">Valid</SelectItem>
                  <SelectItem value="expiring">Expiring Soon</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
              <Select value={vesselFilter} onValueChange={setVesselFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Ship className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Vessel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vessels</SelectItem>
                  {vessels.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Certificates List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredCertificates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Award className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No certificates found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredCertificates.map((cert) => {
              const status = getCertificateStatus(cert);
              const daysUntilExpiry = cert.expiry_date 
                ? differenceInDays(new Date(cert.expiry_date), new Date())
                : null;
              
              return (
                <Card key={cert.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${
                        status === 'valid' ? 'bg-green-100' :
                        status === 'expiring' ? 'bg-yellow-100' : 'bg-red-100'
                      }`}>
                        <Award className={`w-6 h-6 ${
                          status === 'valid' ? 'text-green-600' :
                          status === 'expiring' ? 'text-yellow-600' : 'text-red-600'
                        }`} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">
                            {cert.crew_member?.first_name} {cert.crew_member?.last_name}
                          </p>
                          {cert.crew_member?.rank && (
                            <span className="text-sm text-muted-foreground">
                              ({cert.crew_member.rank})
                            </span>
                          )}
                          <Badge className={statusColors[status]}>
                            {status === 'valid' ? 'Valid' : 
                             status === 'expiring' ? 'Expiring Soon' : 'Expired'}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {cert.certificate_type}
                          </span>
                          {cert.certificate_number && (
                            <>
                              <span>•</span>
                              <span>#{cert.certificate_number}</span>
                            </>
                          )}
                          {cert.vessel && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Ship className="w-3 h-3" />
                                {cert.vessel.name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex-shrink-0 text-right">
                        {cert.expiry_date && (
                          <>
                            <p className="font-medium flex items-center gap-1 justify-end">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(cert.expiry_date), 'MMM d, yyyy')}
                            </p>
                            <p className={`text-sm ${
                              status === 'expired' ? 'text-red-600' :
                              status === 'expiring' ? 'text-yellow-600' : 'text-muted-foreground'
                            }`}>
                              {daysUntilExpiry !== null && (
                                daysUntilExpiry < 0 
                                  ? `${Math.abs(daysUntilExpiry)} days overdue`
                                  : `${daysUntilExpiry} days remaining`
                              )}
                            </p>
                          </>
                        )}
                      </div>
                      
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
