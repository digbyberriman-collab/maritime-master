import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, ClipboardCheck, AlertTriangle, FileCheck, Calendar } from 'lucide-react';
import { useAudits } from '@/hooks/useAudits';
import { useCertificates } from '@/hooks/useCertificates';
import { format, differenceInDays } from 'date-fns';
import InternalAuditsTab from '@/components/audits/InternalAuditsTab';
import ExternalAuditsTab from '@/components/audits/ExternalAuditsTab';
import ManagementReviewsTab from '@/components/audits/ManagementReviewsTab';
import AuditCalendarTab from '@/components/audits/AuditCalendarTab';
import ScheduleAuditModal from '@/components/audits/ScheduleAuditModal';
import ScheduleReviewModal from '@/components/audits/ScheduleReviewModal';

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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Audits & Reviews</h1>
            <p className="text-muted-foreground">Manage internal audits, external audits, and management reviews</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleScheduleAudit('Internal')}>
              <Plus className="w-4 h-4 mr-2" />
              Schedule Audit
            </Button>
            <Button variant="outline" onClick={() => setShowScheduleReviewModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Management Review
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Next Audit</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {nextAudit ? (
                <>
                  <div className="text-2xl font-bold">{format(new Date(nextAudit.scheduled_date), 'MMM d')}</div>
                  <p className="text-xs text-muted-foreground">{nextAudit.audit_type} - {nextAudit.vessel?.name || 'Company'}</p>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No audits scheduled</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Findings</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{openFindings.length}</div>
              <p className="text-xs text-muted-foreground">
                {openFindings.filter(f => f.finding_type === 'Major_NC').length} Major, {' '}
                {openFindings.filter(f => f.finding_type === 'Minor_NC').length} Minor
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">DOC Valid Until</CardTitle>
              <FileCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {docCertificate ? (
                <>
                  <div className="text-2xl font-bold">{format(new Date(docCertificate.expiry_date), 'MMM yyyy')}</div>
                  <p className="text-xs text-muted-foreground">
                    {differenceInDays(new Date(docCertificate.expiry_date), new Date())} days remaining
                  </p>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Not configured</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SMC Valid Until</CardTitle>
              <FileCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {smcCertificate ? (
                <>
                  <div className="text-2xl font-bold">{format(new Date(smcCertificate.expiry_date), 'MMM yyyy')}</div>
                  <p className="text-xs text-muted-foreground">
                    {differenceInDays(new Date(smcCertificate.expiry_date), new Date())} days remaining
                  </p>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Not configured</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Last Management Review</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {lastReview ? (
                <>
                  <div className="text-2xl font-bold">{format(new Date(lastReview.review_date), 'MMM d, yyyy')}</div>
                  <p className="text-xs text-muted-foreground">{lastReview.period_covered}</p>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No reviews completed</div>
              )}
            </CardContent>
          </Card>
        </div>

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
