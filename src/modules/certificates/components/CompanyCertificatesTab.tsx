import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Plus, 
  Building2, 
  FileText,
  Eye,
  Pencil,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { useCertificates, Certificate } from '@/modules/certificates/hooks/useCertificates';
import { daysUntilExpiry, CERTIFICATE_STATUS } from '@/modules/certificates/constants';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface CompanyCertificatesTabProps {
  onAddCertificate: () => void;
  onViewCertificate: (certificate: Certificate) => void;
}

const CompanyCertificatesTab: React.FC<CompanyCertificatesTabProps> = ({
  onAddCertificate,
  onViewCertificate,
}) => {
  const { certificates } = useCertificates({ type: 'DOC' });

  // Filter to DOC certificates without vessel_id (company-level)
  const companyCertificates = certificates?.filter(c => 
    c.certificate_type === 'DOC' && !c.vessel_id
  ) || [];

  const docCertificate = companyCertificates[0];

  const getStatusBadge = (status: string) => {
    const statusConfig = CERTIFICATE_STATUS[status as keyof typeof CERTIFICATE_STATUS] || CERTIFICATE_STATUS.Valid;
    return (
      <Badge className={cn(statusConfig.color, 'text-white')}>
        {statusConfig.label}
      </Badge>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Expired':
        return <XCircle className="w-8 h-8 text-destructive" />;
      case 'Expiring_Soon':
        return <AlertTriangle className="w-8 h-8 text-yellow-600" />;
      default:
        return <CheckCircle className="w-8 h-8 text-green-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* DOC Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="w-6 h-6 text-primary" />
              <div>
                <CardTitle>Document of Compliance (DOC)</CardTitle>
                <CardDescription>
                  ISM Code certification for the company's Safety Management System
                </CardDescription>
              </div>
            </div>
            {!docCertificate && (
              <Button onClick={onAddCertificate}>
                <Plus className="w-4 h-4 mr-2" />
                Add DOC
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {docCertificate ? (
            <div className="grid md:grid-cols-2 gap-6">
              {/* DOC Details */}
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  {getStatusIcon(docCertificate.status)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-foreground">
                        {docCertificate.certificate_number}
                      </h3>
                      {getStatusBadge(docCertificate.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Issued by {docCertificate.issuing_authority}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground">Issue Date</p>
                    <p className="font-medium text-foreground">
                      {format(new Date(docCertificate.issue_date), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Expiry Date</p>
                    <p className="font-medium text-foreground">
                      {format(new Date(docCertificate.expiry_date), 'dd MMM yyyy')}
                    </p>
                    <p className={cn(
                      'text-xs',
                      daysUntilExpiry(docCertificate.expiry_date) < 0 
                        ? 'text-destructive' 
                        : daysUntilExpiry(docCertificate.expiry_date) <= 90 
                          ? 'text-yellow-600'
                          : 'text-muted-foreground'
                    )}>
                      {daysUntilExpiry(docCertificate.expiry_date) < 0 
                        ? `${Math.abs(daysUntilExpiry(docCertificate.expiry_date))} days overdue`
                        : `${daysUntilExpiry(docCertificate.expiry_date)} days remaining`
                      }
                    </p>
                  </div>
                  {docCertificate.next_survey_date && (
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Next Annual Verification</p>
                      <p className="font-medium text-foreground">
                        {format(new Date(docCertificate.next_survey_date), 'dd MMM yyyy')}
                      </p>
                    </div>
                  )}
                </div>

                {docCertificate.notes && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-1">Scope of SMS</p>
                    <p className="text-sm text-foreground">{docCertificate.notes}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 md:items-end">
                <Button variant="outline" onClick={() => onViewCertificate(docCertificate)}>
                  <Eye className="w-4 h-4 mr-2" />
                  View Certificate
                </Button>
                <Button variant="outline">
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit Details
                </Button>
                <Button variant="outline">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Renew DOC
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No DOC Added</h3>
              <p className="text-muted-foreground text-center mb-4">
                Add your company's Document of Compliance to track ISM Code certification.
              </p>
              <Button onClick={onAddCertificate}>
                <Plus className="w-4 h-4 mr-2" />
                Add DOC
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verification History */}
      {docCertificate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Verification History</CardTitle>
            <CardDescription>
              Annual and intermediate verifications for this DOC
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-muted-foreground">
                Verification history will be displayed here once verifications are recorded.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CompanyCertificatesTab;
