import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, 
  Award, 
  AlertTriangle, 
  XCircle, 
  Clock,
  Ship,
  Users,
  Building2,
} from 'lucide-react';
import { useCertificates } from '@/hooks/useCertificates';
import { useVessels } from '@/hooks/useVessels';
import { daysUntilExpiry } from '@/lib/certificateConstants';
import { format } from 'date-fns';
import VesselCertificatesTab from '@/components/certificates/VesselCertificatesTab';
import CrewCertificatesTab from '@/components/certificates/CrewCertificatesTab';
import CompanyCertificatesTab from '@/components/certificates/CompanyCertificatesTab';
import AddCertificateModal from '@/components/certificates/AddCertificateModal';
import CertificateDetailModal from '@/components/certificates/CertificateDetailModal';
import type { Certificate } from '@/hooks/useCertificates';

const Certificates: React.FC = () => {
  const [activeTab, setActiveTab] = useState('vessel');
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
            <h1 className="text-2xl font-bold text-foreground">Certificates & Compliance</h1>
            <p className="text-muted-foreground">Track and manage all vessel, crew, and company certificates</p>
          </div>
          <Button onClick={() => handleAddCertificate()}>
            <Plus className="w-4 h-4 mr-2" />
            Add Certificate
          </Button>
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted">
            <TabsTrigger value="vessel" className="gap-2">
              <Ship className="w-4 h-4" />
              Vessel Certificates
            </TabsTrigger>
            <TabsTrigger value="crew" className="gap-2">
              <Users className="w-4 h-4" />
              Crew Certificates
            </TabsTrigger>
            <TabsTrigger value="company" className="gap-2">
              <Building2 className="w-4 h-4" />
              Company Certificates
            </TabsTrigger>
          </TabsList>

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
