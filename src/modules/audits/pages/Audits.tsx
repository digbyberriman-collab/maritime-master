import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Plus, ClipboardCheck, AlertTriangle, FileCheck, Calendar } from 'lucide-react';
import { useAudits } from '@/modules/audits/hooks/useAudits';
import { useCertificates } from '@/modules/certificates/hooks/useCertificates';
import { format, differenceInDays } from 'date-fns';
import InternalAuditsTab from '@/modules/audits/components/InternalAuditsTab';
import ExternalAuditsTab from '@/modules/audits/components/ExternalAuditsTab';
import ManagementReviewsTab from '@/modules/audits/components/ManagementReviewsTab';
import AuditCalendarTab from '@/modules/audits/components/AuditCalendarTab';
import ScheduleAuditModal from '@/modules/audits/components/ScheduleAuditModal';
import ScheduleReviewModal from '@/modules/audits/components/ScheduleReviewModal';

const Audits: React.FC = () => {
  const [activeTab, setActiveTab] = useState('internal');
  const [showScheduleAuditModal, setShowScheduleAuditModal] = useState(false);
  const [showScheduleReviewModal, setShowScheduleReviewModal] = useState(false);
  const [defaultAuditType, setDefaultAuditType] = useState<'Internal' | 'External'>('Internal');
  
  const { audits, openFindings, reviews, nextAudit, isLoading } = useAudits();
  const { certificates = [] } = useCertificates();

  // Find DOC and SMC certificates for validity display
  const docCertificate = certificates.find(c => c.certificate_type === 'company' && c.certificate_name?.toLowerCase().includes('doc'));
  const smcCertificate = certificates.find(c => c.certificate_type === 'vessel' && c.certificate_name?.toLowerCase().includes('smc'));

  const lastReview = reviews.find(r => r.status === 'Completed');

  const handleScheduleAudit = (type: 'Internal' | 'External') => {
    setDefaultAuditType(type);
    setShowScheduleAuditModal(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Audits & Reviews"
          description="Manage internal audits, external audits, and management reviews"
          actions={
            <>
              <Button onClick={() => handleScheduleAudit('Internal')}>
                <Plus className="w-4 h-4 mr-2" />
                Schedule Audit
              </Button>
              <Button variant="outline" onClick={() => setShowScheduleReviewModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Management Review
              </Button>
            </>
          }
        />

        <StatGrid cols={5}>
          <StatCard
            label="Next Audit"
            icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
            value={
              nextAudit
                ? format(new Date(nextAudit.scheduled_date), 'MMM d')
                : <span className="text-sm text-muted-foreground">No audits scheduled</span>
            }
            hint={nextAudit ? `${nextAudit.audit_type} - ${nextAudit.vessel?.name || 'Company'}` : undefined}
          />
          <StatCard
            label="Open Findings"
            icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
            value={openFindings.length}
            hint={`${openFindings.filter(f => f.finding_type === 'Major_NC').length} Major, ${openFindings.filter(f => f.finding_type === 'Minor_NC').length} Minor`}
          />
          <StatCard
            label="DOC Valid Until"
            icon={<FileCheck className="h-4 w-4 text-muted-foreground" />}
            value={
              docCertificate
                ? format(new Date(docCertificate.expiry_date), 'MMM yyyy')
                : <span className="text-sm text-muted-foreground">Not configured</span>
            }
            hint={docCertificate ? `${differenceInDays(new Date(docCertificate.expiry_date), new Date())} days remaining` : undefined}
          />
          <StatCard
            label="SMC Valid Until"
            icon={<FileCheck className="h-4 w-4 text-muted-foreground" />}
            value={
              smcCertificate
                ? format(new Date(smcCertificate.expiry_date), 'MMM yyyy')
                : <span className="text-sm text-muted-foreground">Not configured</span>
            }
            hint={smcCertificate ? `${differenceInDays(new Date(smcCertificate.expiry_date), new Date())} days remaining` : undefined}
          />
          <StatCard
            label="Last Management Review"
            icon={<ClipboardCheck className="h-4 w-4 text-muted-foreground" />}
            value={
              lastReview
                ? format(new Date(lastReview.review_date), 'MMM d, yyyy')
                : <span className="text-sm text-muted-foreground">No reviews completed</span>
            }
            hint={lastReview ? lastReview.period_covered : undefined}
          />
        </StatGrid>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="internal">Internal Audits</TabsTrigger>
            <TabsTrigger value="external">External Audits</TabsTrigger>
            <TabsTrigger value="reviews">Management Reviews</TabsTrigger>
            <TabsTrigger value="calendar">Audit Calendar</TabsTrigger>
          </TabsList>

          <TabsContent value="internal" className="mt-4">
            <InternalAuditsTab onScheduleAudit={() => handleScheduleAudit('Internal')} />
          </TabsContent>

          <TabsContent value="external" className="mt-4">
            <ExternalAuditsTab onScheduleAudit={() => handleScheduleAudit('External')} />
          </TabsContent>

          <TabsContent value="reviews" className="mt-4">
            <ManagementReviewsTab onScheduleReview={() => setShowScheduleReviewModal(true)} />
          </TabsContent>

          <TabsContent value="calendar" className="mt-4">
            <AuditCalendarTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <ScheduleAuditModal 
        open={showScheduleAuditModal} 
        onOpenChange={setShowScheduleAuditModal}
        defaultType={defaultAuditType}
      />
      <ScheduleReviewModal 
        open={showScheduleReviewModal} 
        onOpenChange={setShowScheduleReviewModal}
      />
    </DashboardLayout>
  );
};

export default Audits;
