import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Download, 
  Printer, 
  Pencil, 
  RotateCcw, 
  Trash2,
  ExternalLink,
  Calendar,
  Building2,
  Ship,
  User,
  FileText,
  Clock,
  Bell,
} from 'lucide-react';
import { Certificate, useCertificates } from '@/modules/certificates/hooks/useCertificates';
import { daysUntilExpiry, CERTIFICATE_STATUS } from '@/modules/certificates/constants';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface CertificateDetailModalProps {
  certificate: Certificate | null;
  isOpen: boolean;
  onClose: () => void;
}

const CertificateDetailModal: React.FC<CertificateDetailModalProps> = ({
  certificate,
  isOpen,
  onClose,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { deleteCertificate } = useCertificates();

  if (!certificate) return null;

  const days = daysUntilExpiry(certificate.expiry_date);
  const statusConfig = CERTIFICATE_STATUS[certificate.status as keyof typeof CERTIFICATE_STATUS] || CERTIFICATE_STATUS.Valid;

  const handleDelete = async () => {
    await deleteCertificate.mutateAsync(certificate.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  const handleDownload = () => {
    if (certificate.file_url) {
      window.open(certificate.file_url, '_blank');
    }
  };

  const handlePrint = () => {
    if (certificate.file_url) {
      const printWindow = window.open(certificate.file_url, '_blank');
      printWindow?.print();
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-xl">{certificate.certificate_name}</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {certificate.certificate_number}
                </p>
              </div>
              <Badge className={cn(statusConfig.color, 'text-white')}>
                {statusConfig.label}
              </Badge>
            </div>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2">
              {certificate.file_url && (
                <>
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePrint}>
                    <Printer className="w-4 h-4 mr-2" />
                    Print
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm">
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button variant="outline" size="sm">
                <RotateCcw className="w-4 h-4 mr-2" />
                Renew
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="text-destructive hover:text-destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>

            <Separator />

            {/* Certificate Details */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Certificate Type</p>
                    <p className="font-medium text-foreground">{certificate.certificate_type}</p>
                    {certificate.certificate_category && (
                      <p className="text-sm text-muted-foreground">{certificate.certificate_category}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Building2 className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Issuing Authority</p>
                    <p className="font-medium text-foreground">{certificate.issuing_authority}</p>
                  </div>
                </div>

                {certificate.vessels && (
                  <div className="flex items-start gap-3">
                    <Ship className="w-5 h-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Vessel</p>
                      <p className="font-medium text-foreground">{certificate.vessels.name}</p>
                    </div>
                  </div>
                )}

                {certificate.profiles && (
                  <div className="flex items-start gap-3">
                    <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Crew Member</p>
                      <p className="font-medium text-foreground">
                        {certificate.profiles.first_name} {certificate.profiles.last_name}
                      </p>
                      {certificate.profiles.rank && (
                        <p className="text-sm text-muted-foreground">{certificate.profiles.rank}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Issue Date</p>
                    <p className="font-medium text-foreground">
                      {format(new Date(certificate.issue_date), 'dd MMMM yyyy')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Expiry Date</p>
                    <p className="font-medium text-foreground">
                      {format(new Date(certificate.expiry_date), 'dd MMMM yyyy')}
                    </p>
                    <p className={cn(
                      'text-sm',
                      days < 0 ? 'text-destructive' : days <= 30 ? 'text-yellow-600' : 'text-muted-foreground'
                    )}>
                      {days < 0 
                        ? `${Math.abs(days)} days overdue`
                        : `${days} days remaining`
                      }
                    </p>
                  </div>
                </div>

                {certificate.next_survey_date && (
                  <div className="flex items-start gap-3">
                    <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Next Survey Date</p>
                      <p className="font-medium text-foreground">
                        {format(new Date(certificate.next_survey_date), 'dd MMMM yyyy')}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <Bell className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Alert Setting</p>
                    <p className="font-medium text-foreground">
                      {certificate.alert_days} days before expiry
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {certificate.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Notes</p>
                  <p className="text-foreground">{certificate.notes}</p>
                </div>
              </>
            )}

            {/* Certificate File Preview */}
            {certificate.file_url && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Certificate Document</p>
                  <div className="border rounded-lg p-4 bg-muted/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="w-8 h-8 text-primary" />
                        <div>
                          <p className="font-medium text-foreground">Certificate File</p>
                          <p className="text-sm text-muted-foreground">Click to view or download</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={handleDownload}>
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Open
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Alert History (placeholder) */}
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground mb-2">Alert History</p>
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">
                  No alerts have been sent yet.
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Certificate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{certificate.certificate_name}"? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CertificateDetailModal;
