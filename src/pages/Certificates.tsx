import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
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

// AI Certificate Recognition modal
const AIRecognitionModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<'upload' | 'analyzing' | 'review'>('upload');
  const [confidence] = useState(92);

  const startAnalysis = () => {
    setStep('analyzing');
    setTimeout(() => setStep('review'), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { onClose(); setStep('upload'); } }}>
      <DialogContent className="bg-[#111D33] border-[#1A2740] max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-[#3B82F6]" />
            AI Certificate Recognition
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-[#1A2740] rounded-lg p-12 text-center hover:border-[#3B82F6]/50 transition cursor-pointer"
              onClick={startAnalysis}>
              <Upload className="w-12 h-12 text-[#94A3B8] mx-auto mb-4" />
              <p className="text-white font-medium">Drop certificate here or click to upload</p>
              <p className="text-[#94A3B8] text-sm mt-1">PDF, JPG, PNG up to 10MB</p>
            </div>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="py-12 text-center">
            <ScanLine className="w-16 h-16 text-[#3B82F6] mx-auto mb-4 animate-pulse" />
            <p className="text-white font-medium text-lg">Analysing certificate...</p>
            <p className="text-[#94A3B8] text-sm mt-2">Extracting data using AI</p>
            <Progress value={65} className="max-w-xs mx-auto mt-4" />
          </div>
        )}

        {step === 'review' && (
          <div className="grid grid-cols-2 gap-6">
            {/* Document Preview */}
            <div className="bg-[#1A2740] rounded-lg p-4 flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <FileText className="w-24 h-24 text-[#94A3B8]/30 mx-auto mb-3" />
                <p className="text-[#94A3B8] text-sm">Document Preview</p>
                <p className="text-[#94A3B8] text-xs">(Zoomable)</p>
              </div>
            </div>

            {/* Extracted Data */}
            <div className="space-y-3">
              <h3 className="text-white font-semibold">Extracted Data</h3>
              {[
                { label: 'Type', value: 'Certificate of Competency' },
                { label: 'Number', value: 'KY-CI/2024/0891' },
                { label: 'Holder', value: 'Phillip Carter' },
                { label: 'Issued', value: '2024-03-15' },
                { label: 'Expiry', value: '2029-03-15' },
                { label: 'Authority', value: 'CISR' },
                { label: 'Flag', value: 'Cayman Islands' },
              ].map((field, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1">
                    <p className="text-xs text-[#94A3B8]">{field.label}</p>
                    <Input
                      defaultValue={field.value}
                      className="bg-[#1A2740] border-[#1A2740] text-white h-8 text-sm"
                    />
                  </div>
                  <button className="text-[#94A3B8] hover:text-white mt-4">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Confidence */}
              <div className="mt-4 p-3 rounded-lg bg-[#1A2740]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[#94A3B8] text-sm">Confidence</span>
                  <span className={`font-bold ${confidence >= 85 ? 'text-[#22C55E]' : confidence >= 70 ? 'text-[#F59E0B]' : 'text-[#EF4444]'}`}>
                    {confidence}%
                  </span>
                </div>
                <Progress value={confidence} className="h-2" />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setStep('upload'); }} className="border-[#1A2740] text-[#94A3B8]">
            Cancel
          </Button>
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={() => setStep('analyzing')} className="gap-1 border-[#1A2740] text-[#94A3B8]">
                <RefreshCw className="w-4 h-4" /> Re-scan
              </Button>
              <Button className="bg-[#22C55E] gap-1" onClick={() => { onClose(); setStep('upload'); }}>
                Confirm & Save
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Certificates: React.FC = () => {
  // "all" is the default tab — flat list, not nested under "Vessel Certificates"
  const [activeTab, setActiveTab] = useState('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
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
            <Button variant="outline" onClick={() => setIsAIModalOpen(true)} className="gap-1">
              <ScanLine className="w-4 h-4" />
              Upload & Scan
            </Button>
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

      <AIRecognitionModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
      />
    </DashboardLayout>
  );
};

export default Certificates;
