import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Ship, Users, Award, Shield, CheckSquare, Wrench,
  MapPin, FileText, Plane, Anchor,
} from 'lucide-react';
import { getVesselBySlug, getCrewByVessel, DRAAK_PORTS_OF_CALL } from '@/data/seedData';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';

const IndividualVesselDashboard: React.FC = () => {
  const { vesselSlug } = useParams<{ vesselSlug: string }>();
  const navigate = useNavigate();
  const vessel = getVesselBySlug(vesselSlug || '');
  const crew = getCrewByVessel(vesselSlug || '');

  if (!vessel) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Ship className="w-16 h-16 text-[#94A3B8]/30 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white">Vessel not found</h2>
            <p className="text-[#94A3B8] mt-2">No vessel matches "{vesselSlug}"</p>
            <Button className="mt-4" onClick={() => navigate('/dashboard')}>Return to Dashboard</Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const crewCount = crew.length || vessel.approxCrew;
  const departments = [...new Set(crew.map(c => c.department))];
  const currentPort = vesselSlug === 'draak' ? DRAAK_PORTS_OF_CALL[0] : null;

  // Mock stats per vessel
  const stats = {
    complianceRate: vesselSlug === 'xiphias' ? 100 : 94 + Math.floor(Math.random() * 6),
    openIncidents: vesselSlug === 'xiphias' ? 0 : Math.floor(Math.random() * 4),
    overdueMainten: vesselSlug === 'xiphias' ? 0 : Math.floor(Math.random() * 5) + 1,
    expiringCerts: vesselSlug === 'xiphias' ? 0 : Math.floor(Math.random() * 3) + 1,
    completedChecklists: Math.floor(Math.random() * 20) + 10,
    pendingChecklists: Math.floor(Math.random() * 5),
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Vessel Header */}
        <PageHeader
          icon={<Ship className="w-5 h-5" />}
          title={vessel.name}
          description={
            <span className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="text-[#94A3B8] border-[#1A2740]">{vessel.type}</Badge>
              <span className="text-[#94A3B8] text-sm flex items-center gap-1">
                <Anchor className="w-3.5 h-3.5" /> {vessel.flag}
              </span>
              <Badge className="bg-[#22C55E] text-white">
                {currentPort ? 'In Port' : 'At Sea'}
              </Badge>
            </span>
          }
          actions={
            <>
              <Button variant="outline" className="gap-1 border-[#1A2740] text-[#94A3B8]"
                onClick={() => navigate(`/compliance?tab=ism`)}>
                <Shield className="w-4 h-4" /> Compliance
              </Button>
              <Button className="gap-1 bg-[#3B82F6]"
                onClick={() => navigate(`/compliance?tab=mlc`)}>
                <Users className="w-4 h-4" /> Crew List
              </Button>
            </>
          }
        />

        {/* Current Location */}
        {currentPort && (
          <Card className="bg-[#111D33] border-[#1A2740]">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-[#3B82F6]" />
                <span className="text-white font-medium">Currently at {currentPort.portName}, {currentPort.country}</span>
                <Badge className="bg-[#22C55E] text-white">Security Level {currentPort.securityLevel}</Badge>
                <span className="text-[#94A3B8] text-sm">
                  Arrived {new Date(currentPort.arrival).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Grid */}
        <StatGrid cols={6}>
          <StatCard label="Crew Onboard" value={crewCount} icon={<Users className="w-5 h-5 text-muted-foreground" />} />
          <StatCard label="Compliance" value={`${stats.complianceRate}%`} tone="success" icon={<Shield className="w-5 h-5 text-muted-foreground" />} />
          <StatCard label="Open Incidents" value={stats.openIncidents} tone="warning" icon={<Wrench className="w-5 h-5 text-muted-foreground" />} />
          <StatCard label="Overdue Maint." value={stats.overdueMainten} tone="danger" icon={<Wrench className="w-5 h-5 text-muted-foreground" />} />
          <StatCard label="Expiring Certs" value={stats.expiringCerts} tone="warning" icon={<Award className="w-5 h-5 text-muted-foreground" />} />
          <StatCard label="Checklists Done" value={stats.completedChecklists} icon={<CheckSquare className="w-5 h-5 text-muted-foreground" />} />
        </StatGrid>

        {/* Module Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Crew Summary */}
          <Card className="bg-[#111D33] border-[#1A2740]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-[#3B82F6]" /> Crew
              </CardTitle>
              <Button size="sm" variant="ghost" className="text-[#3B82F6]"
                onClick={() => navigate('/compliance?tab=mlc')}>View All</Button>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">{crewCount}</p>
              <p className="text-[#94A3B8] text-sm mt-1">{departments.length} departments</p>
              {departments.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {departments.map(d => (
                    <Badge key={d} variant="outline" className="text-[#94A3B8] border-[#1A2740] text-xs">{d}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Certificates */}
          <Card className="bg-[#111D33] border-[#1A2740]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Award className="w-4 h-4 text-[#F59E0B]" /> Certificates
              </CardTitle>
              <Button size="sm" variant="ghost" className="text-[#3B82F6]"
                onClick={() => navigate('/certificates')}>View All</Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#94A3B8] text-sm">Valid</span>
                  <span className="text-[#22C55E] font-bold">24</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8] text-sm">Expiring (90 days)</span>
                  <span className="text-[#F59E0B] font-bold">{stats.expiringCerts}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8] text-sm">Expired</span>
                  <span className="text-[#EF4444] font-bold">0</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Compliance */}
          <Card className="bg-[#111D33] border-[#1A2740]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#22C55E]" /> Compliance
              </CardTitle>
              <Button size="sm" variant="ghost" className="text-[#3B82F6]"
                onClick={() => navigate('/compliance')}>View All</Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#94A3B8] text-sm">DOC</span>
                  <Badge className="bg-[#22C55E] text-white">Valid</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8] text-sm">SMC</span>
                  <Badge className="bg-[#22C55E] text-white">Valid</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8] text-sm">ISSC</span>
                  <Badge className="bg-[#22C55E] text-white">Valid</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8] text-sm">MLC</span>
                  <Badge className="bg-[#22C55E] text-white">Valid</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Checklists */}
          <Card className="bg-[#111D33] border-[#1A2740]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-[#3B82F6]" /> Checklists
              </CardTitle>
              <Button size="sm" variant="ghost" className="text-[#3B82F6]"
                onClick={() => navigate('/checklists')}>View All</Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#94A3B8] text-sm">Completed (this week)</span>
                  <span className="text-[#22C55E] font-bold">{stats.completedChecklists}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8] text-sm">Pending</span>
                  <span className="text-[#F59E0B] font-bold">{stats.pendingChecklists}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8] text-sm">Overdue</span>
                  <span className="text-[#EF4444] font-bold">0</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Maintenance */}
          <Card className="bg-[#111D33] border-[#1A2740]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Wrench className="w-4 h-4 text-[#EF4444]" /> Maintenance
              </CardTitle>
              <Button size="sm" variant="ghost" className="text-[#3B82F6]"
                onClick={() => navigate('/maintenance')}>View All</Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#94A3B8] text-sm">Open Defects</span>
                  <span className="text-[#F59E0B] font-bold">{stats.overdueMainten + 3}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8] text-sm">Overdue Tasks</span>
                  <span className="text-[#EF4444] font-bold">{stats.overdueMainten}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8] text-sm">Scheduled</span>
                  <span className="text-white font-bold">12</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="bg-[#111D33] border-[#1A2740]">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start gap-2 border-[#1A2740] text-[#94A3B8] hover:text-white"
                  onClick={() => navigate('/compliance?tab=mlc')}>
                  <FileText className="w-4 h-4" /> Generate Crew List
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2 border-[#1A2740] text-[#94A3B8] hover:text-white"
                  onClick={() => navigate('/checklists')}>
                  <CheckSquare className="w-4 h-4" /> Start Checklist
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2 border-[#1A2740] text-[#94A3B8] hover:text-white"
                  onClick={() => navigate('/flights-travel')}>
                  <Plane className="w-4 h-4" /> Book Travel
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2 border-[#1A2740] text-[#94A3B8] hover:text-white"
                  onClick={() => navigate('/certificates')}>
                  <Award className="w-4 h-4" /> Upload Certificate
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Vessel Info */}
        <Card className="bg-[#111D33] border-[#1A2740]">
          <CardHeader>
            <CardTitle className="text-white text-base">Vessel Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-[#94A3B8]">Type</p>
                <p className="text-white font-medium">{vessel.type}</p>
              </div>
              <div>
                <p className="text-xs text-[#94A3B8]">Designation</p>
                <p className="text-white font-medium">{vessel.designation}</p>
              </div>
              <div>
                <p className="text-xs text-[#94A3B8]">Flag State</p>
                <p className="text-white font-medium">{vessel.flag}</p>
              </div>
              <div>
                <p className="text-xs text-[#94A3B8]">Approx Crew</p>
                <p className="text-white font-medium">{vessel.approxCrew}</p>
              </div>
              {vessel.notes && (
                <div className="col-span-2">
                  <p className="text-xs text-[#94A3B8]">Notes</p>
                  <p className="text-white font-medium">{vessel.notes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default IndividualVesselDashboard;
