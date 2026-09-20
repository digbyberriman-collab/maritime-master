import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Award,
  AlertTriangle,
  XCircle,
  Clock,
  Ship,
  Users,
  Building2,
  Flag,
  Upload,
  ScanLine,
  Edit2,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { useCertificates } from '@/modules/certificates/hooks/useCertificates';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { daysUntilExpiry } from '@/modules/certificates/constants';
import { format } from 'date-fns';
import VesselCertificatesTab from '@/modules/certificates/components/VesselCertificatesTab';
import CrewCertificatesTab from '@/modules/certificates/components/CrewCertificatesTab';
import CompanyCertificatesTab from '@/modules/certificates/components/CompanyCertificatesTab';
import AddCertificateModal from '@/modules/certificates/components/AddCertificateModal';
import CertificateDetailModal from '@/modules/certificates/components/CertificateDetailModal';
import type { Certificate } from '@/modules/certificates/hooks/useCertificates';

const Certificates: React.FC = () => {
  // "all" is the default tab — flat list, not nested under "Vessel Certificates"
  const [activeTab, setActiveTab] = useState('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);
  const [defaultType, setDefaultType] = useState<string>('');

  const { certificates, stats, isLoading } = useCertificates();
  const { vessels } = useVessels();

  const handleAddCertificate = (type?: string) => {
    setDefaultType(type || '');
    setIsAddModalOpen(true);
  };

  const handleViewCertificate = (certificate: Certificate) => {
    setSelectedCertificate(certificate);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Certificates</h1>
            <p className="text-muted-foreground">All vessel, crew, company, and class certificates in one place</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleAddCertificate()}>
              <Plus className="w-4 h-4 mr-2" />
              Add Certificate
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Certificates</p>
                  <p className="text-3xl font-bold text-foreground">{stats.total}</p>
                </div>
                <div className="p-3 bg-primary/10 rounded-full">
                  <Award className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Expiring Soon</p>
                  <p className="text-3xl font-bold text-yellow-600">{stats.expiringSoon}</p>
                  <p className="text-xs text-muted-foreground">Within 90 days</p>
                </div>
                <div className="p-3 bg-yellow-500/10 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Expired</p>
                  <p className="text-3xl font-bold text-destructive">{stats.expired}</p>
                  <p className="text-xs text-muted-foreground">Requires immediate action</p>
                </div>
                <div className="p-3 bg-destructive/10 rounded-full">
                  <XCircle className="w-6 h-6 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Next Expiry</p>
                  {stats.nextExpiry ? (
                    <>
                      <p className="text-lg font-semibold text-foreground truncate max-w-[150px]">
                        {stats.nextExpiry.certificate_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(stats.nextExpiry.expiry_date), 'dd MMM yyyy')}
                        {' '}
                        <Badge
                          variant="outline"
                          className={
                            daysUntilExpiry(stats.nextExpiry.expiry_date) < 0
                              ? 'text-destructive border-destructive'
                              : daysUntilExpiry(stats.nextExpiry.expiry_date) <= 30
                                ? 'text-yellow-600 border-yellow-600'
                                : 'text-muted-foreground'
                          }
                        >
                          {daysUntilExpiry(stats.nextExpiry.expiry_date) < 0
                            ? `${Math.abs(daysUntilExpiry(stats.nextExpiry.expiry_date))} days overdue`
                            : `${daysUntilExpiry(stats.nextExpiry.expiry_date)} days left`
                          }
                        </Badge>
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No certificates</p>
                  )}
                </div>
                <div className="p-3 bg-muted rounded-full">
                  <Clock className="w-6 h-6 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Tabs — FLAT, not nested. No "Vessel Certificates" subfolder. */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted">
            <TabsTrigger value="all" className="gap-2">
              <Award className="w-4 h-4" />
              All
            </TabsTrigger>
            <TabsTrigger value="vessel" className="gap-2">
              <Ship className="w-4 h-4" />
              Vessel
            </TabsTrigger>
            <TabsTrigger value="crew" className="gap-2">
              <Users className="w-4 h-4" />
              Crew
            </TabsTrigger>
            <TabsTrigger value="company" className="gap-2">
              <Building2 className="w-4 h-4" />
              Company
            </TabsTrigger>
            <TabsTrigger value="class" className="gap-2">
              <Award className="w-4 h-4" />
              Class
            </TabsTrigger>
            <TabsTrigger value="flag" className="gap-2">
              <Flag className="w-4 h-4" />
              Flag State
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6">
            {/* Show all certificates — uses VesselCertificatesTab as default for now */}
            <VesselCertificatesTab
              onAddCertificate={() => handleAddCertificate()}
              onViewCertificate={handleViewCertificate}
            />
          </TabsContent>

          <TabsContent value="vessel" className="mt-6">
            <VesselCertificatesTab
              onAddCertificate={() => handleAddCertificate('Statutory')}
              onViewCertificate={handleViewCertificate}
            />
          </TabsContent>

          <TabsContent value="crew" className="mt-6">
            <CrewCertificatesTab
              onAddCertificate={() => handleAddCertificate('Crew')}
              onViewCertificate={handleViewCertificate}
            />
          </TabsContent>

          <TabsContent value="company" className="mt-6">
            <CompanyCertificatesTab
              onAddCertificate={() => handleAddCertificate('DOC')}
              onViewCertificate={handleViewCertificate}
            />
          </TabsContent>

          <TabsContent value="class" className="mt-6">
            <VesselCertificatesTab
              onAddCertificate={() => handleAddCertificate('Classification')}
              onViewCertificate={handleViewCertificate}
            />
          </TabsContent>

          <TabsContent value="flag" className="mt-6">
            <VesselCertificatesTab
              onAddCertificate={() => handleAddCertificate('Flag State')}
              onViewCertificate={handleViewCertificate}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <AddCertificateModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        defaultType={defaultType}
      />

      <CertificateDetailModal
        certificate={selectedCertificate}
        isOpen={!!selectedCertificate}
        onClose={() => setSelectedCertificate(null)}
      />
    </DashboardLayout>
  );
};

export default Certificates;
