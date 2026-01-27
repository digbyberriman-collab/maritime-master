import React, { useState } from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Upload, 
  Download, 
  FileText, 
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission, Permission } from '@/lib/permissions';
import { 
  useCrewCertificates, 
  uploadCertificateFile,
  MARITIME_CERTIFICATE_TYPES,
  type CrewCertificate,
  type CrewCertificateFormData,
} from '@/hooks/useCrewCertificates';

interface CrewCertificatesProps {
  crewId: string;
  crewVesselId?: string;
}

const CrewCertificates: React.FC<CrewCertificatesProps> = ({ crewId, crewVesselId }) => {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const { 
    certificates, 
    stats, 
    isLoading, 
    addCertificate, 
    updateCertificate, 
    deleteCertificate 
  } = useCrewCertificates(crewId);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState<CrewCertificate | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState<CrewCertificateFormData & { file: File | null }>({
    certificate_type: '',
    certificate_name: '',
    issuing_authority: '',
    certificate_number: '',
    issue_date: '',
    expiry_date: '',
    notes: '',
    file: null,
  });

  const userRole = profile?.role || null;
  const canEdit = hasPermission(userRole, Permission.EDIT_CREW_CERTIFICATES, {
    targetUserId: crewId,
    currentUserId: user?.id,
    targetVesselId: crewVesselId,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Valid':
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20">
            <CheckCircle className="w-3 h-3 mr-1" />
            Valid
          </Badge>
        );
      case 'Expiring':
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/20">
            <Clock className="w-3 h-3 mr-1" />
            Expiring
          </Badge>
        );
      case 'Expiring Soon':
        return (
          <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20 hover:bg-orange-500/20">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Expiring Soon
          </Badge>
        );
      case 'Expired':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Expired
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            No Expiry
          </Badge>
        );
    }
  };

  const handleOpenAddModal = () => {
    setSelectedCertificate(null);
    setFormData({
      certificate_type: '',
      certificate_name: '',
      issuing_authority: '',
      certificate_number: '',
      issue_date: '',
      expiry_date: '',
      notes: '',
      file: null,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (certificate: CrewCertificate) => {
    setSelectedCertificate(certificate);
    setFormData({
      certificate_type: certificate.certificate_type,
      certificate_name: certificate.certificate_name,
      issuing_authority: certificate.issuing_authority || '',
      certificate_number: certificate.certificate_number || '',
      issue_date: certificate.issue_date || '',
      expiry_date: certificate.expiry_date || '',
      notes: certificate.notes || '',
      file: null,
    });
    setIsModalOpen(true);
  };

  const handleOpenDeleteDialog = (certificate: CrewCertificate) => {
    setSelectedCertificate(certificate);
    setIsDeleteDialogOpen(true);
  };

  const validateCertificateForm = (): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!formData.certificate_type) {
      errors.push('Certificate type is required');
    }
    if (!formData.certificate_name) {
      errors.push('Certificate name is required');
    }
    if (formData.issue_date && formData.expiry_date) {
      if (new Date(formData.expiry_date) <= new Date(formData.issue_date)) {
        errors.push('Expiry date must be after issue date');
      }
    }

    return { valid: errors.length === 0, errors };
  };

  const handleSaveCertificate = async () => {
    const validation = validateCertificateForm();
    if (!validation.valid) {
      toast({
        title: 'Validation Error',
        description: validation.errors.join(', '),
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      let fileData = selectedCertificate 
        ? { 
            url: selectedCertificate.file_url || '', 
            name: selectedCertificate.file_name || '', 
            size: selectedCertificate.file_size || 0 
          } 
        : { url: '', name: '', size: 0 };

      // Upload file if provided
      if (formData.file) {
        fileData = await uploadCertificateFile(formData.file, crewId);
      }

      const certificateData: CrewCertificateFormData = {
        certificate_type: formData.certificate_type,
        certificate_name: formData.certificate_name,
        issuing_authority: formData.issuing_authority || undefined,
        certificate_number: formData.certificate_number || undefined,
        issue_date: formData.issue_date || undefined,
        expiry_date: formData.expiry_date || undefined,
        file_url: fileData.url || undefined,
        file_name: fileData.name || undefined,
        file_size: fileData.size || undefined,
        notes: formData.notes || undefined,
      };

      if (selectedCertificate) {
        await updateCertificate.mutateAsync({
          id: selectedCertificate.id,
          data: certificateData,
          oldData: selectedCertificate,
        });
      } else {
        await addCertificate.mutateAsync(certificateData);
      }

      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving certificate:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteCertificate = async () => {
    if (!selectedCertificate) return;

    try {
      await deleteCertificate.mutateAsync({ 
        id: selectedCertificate.id, 
        certificate: selectedCertificate 
      });
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error deleting certificate:', error);
    }
  };

  const handleDownloadCertificate = async (certificate: CrewCertificate) => {
    if (!certificate.file_url) return;

    try {
      const response = await fetch(certificate.file_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = certificate.file_name || 'certificate.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading certificate:', error);
      toast({
        title: 'Error',
        description: 'Failed to download certificate',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
            <p className="text-sm text-muted-foreground">Total Certificates</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{stats.valid}</div>
            <p className="text-sm text-muted-foreground">Valid</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.expiring}</div>
            <p className="text-sm text-muted-foreground">Expiring</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-destructive">{stats.expired}</div>
            <p className="text-sm text-muted-foreground">Expired</p>
          </CardContent>
        </Card>
      </div>

      {/* Header with Add Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Certificates & Qualifications</h3>
        {canEdit && (
          <Button onClick={handleOpenAddModal} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Certificate
          </Button>
        )}
      </div>

      {/* Certificates List */}
      {!certificates || certificates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Award className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h4 className="text-lg font-medium mb-2">No Certificates</h4>
            <p className="text-muted-foreground">
              {canEdit
                ? 'Click "Add Certificate" to add the first certificate'
                : 'No certificates have been added yet'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {certificates.map((certificate) => (
            <Card key={certificate.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium truncate">{certificate.certificate_name}</h4>
                      {getStatusBadge(certificate.status)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {certificate.certificate_type}
                    </p>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 mt-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Issuing Authority: </span>
                        <span className="font-medium">{certificate.issuing_authority || '—'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Certificate No: </span>
                        <span className="font-medium">{certificate.certificate_number || '—'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Issue Date: </span>
                        <span className="font-medium">
                          {certificate.issue_date
                            ? new Date(certificate.issue_date).toLocaleDateString()
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Expiry Date: </span>
                        <span className={`font-medium ${
                          certificate.status === 'Expired' ? 'text-destructive' : 
                          certificate.status === 'Expiring Soon' ? 'text-orange-600' : ''
                        }`}>
                          {certificate.expiry_date
                            ? new Date(certificate.expiry_date).toLocaleDateString()
                            : 'No Expiry'}
                        </span>
                      </div>
                    </div>

                    {certificate.notes && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Notes: {certificate.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 ml-4 flex-shrink-0">
                    {certificate.file_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownloadCertificate(certificate)}
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                    {canEdit && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEditModal(certificate)}
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDeleteDialog(certificate)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Certificate Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCertificate ? 'Edit Certificate' : 'Add Certificate'}
            </DialogTitle>
            <DialogDescription>
              {selectedCertificate 
                ? 'Update certificate details below.' 
                : 'Add a new certificate or qualification.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="certificate_type">Certificate Type *</Label>
                <Select
                  value={formData.certificate_type}
                  onValueChange={(value) => setFormData({ ...formData, certificate_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover max-h-60">
                    {MARITIME_CERTIFICATE_TYPES.map((category) => (
                      <SelectGroup key={category.category}>
                        <SelectLabel className="text-muted-foreground text-xs uppercase tracking-wider">
                          {category.category}
                        </SelectLabel>
                        {category.types.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="certificate_name">Certificate Name *</Label>
                <Input
                  id="certificate_name"
                  value={formData.certificate_name}
                  onChange={(e) => setFormData({ ...formData, certificate_name: e.target.value })}
                  placeholder="e.g., STCW Basic Safety Training"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="issuing_authority">Issuing Authority</Label>
                <Input
                  id="issuing_authority"
                  value={formData.issuing_authority || ''}
                  onChange={(e) => setFormData({ ...formData, issuing_authority: e.target.value })}
                  placeholder="e.g., MCA, USCG, Marshall Islands"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="certificate_number">Certificate Number</Label>
                <Input
                  id="certificate_number"
                  value={formData.certificate_number || ''}
                  onChange={(e) => setFormData({ ...formData, certificate_number: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="issue_date">Issue Date</Label>
                <Input
                  id="issue_date"
                  type="date"
                  value={formData.issue_date || ''}
                  onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiry_date">Expiry Date</Label>
                <Input
                  id="expiry_date"
                  type="date"
                  value={formData.expiry_date || ''}
                  onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any additional notes"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Certificate File</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setFormData({ ...formData, file: e.target.files?.[0] || null })}
                  className="hidden"
                  id="certificate-file"
                />
                <label htmlFor="certificate-file" className="cursor-pointer">
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">
                    {formData.file
                      ? formData.file.name
                      : selectedCertificate?.file_name
                      ? `Current: ${selectedCertificate.file_name}`
                      : 'Click to upload PDF, JPG, or PNG'}
                  </p>
                  <p className="text-xs text-muted-foreground">Max 10MB</p>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={handleSaveCertificate} disabled={uploading}>
              {uploading ? 'Saving...' : selectedCertificate ? 'Update Certificate' : 'Add Certificate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Certificate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedCertificate?.certificate_name}"? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteCertificate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CrewCertificates;
