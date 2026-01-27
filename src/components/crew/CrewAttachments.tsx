import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission, Permission } from '@/lib/permissions';
import { 
  useCrewAttachments, 
  CrewAttachment, 
  AttachmentFormData, 
  ATTACHMENT_TYPES,
  formatFileSize 
} from '@/hooks/useCrewAttachments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectTrigger, 
  SelectValue, 
  SelectContent, 
  SelectItem 
} from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Trash2, 
  Upload, 
  Download, 
  FileText, 
  FileImage,
  File,
  Eye
} from 'lucide-react';

interface CrewAttachmentsProps {
  crewId: string;
  crewVesselId?: string;
}

export const CrewAttachments: React.FC<CrewAttachmentsProps> = ({ crewId, crewVesselId }) => {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const { attachments, isLoading, uploadAttachment, deleteAttachment } = useCrewAttachments(crewId);
  
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<CrewAttachment | null>(null);
  const [uploading, setUploading] = useState(false);

  const [uploadForm, setUploadForm] = useState<{
    attachment_type: string;
    description: string;
    file: File | null;
  }>({
    attachment_type: '',
    description: '',
    file: null
  });

  const canEdit = hasPermission(profile?.role, Permission.EDIT_CREW_ATTACHMENTS, {
    targetUserId: crewId,
    currentUserId: user?.id,
    targetVesselId: crewVesselId
  });

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.startsWith('image/')) {
      return <FileImage className="w-8 h-8 text-blue-500" />;
    }
    if (mimeType?.includes('pdf')) {
      return <FileText className="w-8 h-8 text-red-500" />;
    }
    return <File className="w-8 h-8 text-muted-foreground" />;
  };

  const handleUpload = async () => {
    if (!uploadForm.file || !uploadForm.attachment_type) {
      toast({
        title: 'Validation Error',
        description: 'Please select a file and attachment type',
        variant: 'destructive'
      });
      return;
    }

    setUploading(true);
    try {
      await uploadAttachment.mutateAsync({
        attachment_type: uploadForm.attachment_type,
        description: uploadForm.description || undefined,
        file: uploadForm.file,
      });
      setIsUploadModalOpen(false);
      setUploadForm({
        attachment_type: '',
        description: '',
        file: null
      });
    } catch (error) {
      console.error('Error uploading:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedAttachment) return;

    try {
      await deleteAttachment.mutateAsync(selectedAttachment);
      setIsDeleteDialogOpen(false);
      setSelectedAttachment(null);
    } catch (error) {
      console.error('Error deleting:', error);
    }
  };

  const handleDownload = async (attachment: CrewAttachment) => {
    try {
      const response = await fetch(attachment.file_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading:', error);
      toast({
        title: 'Error',
        description: 'Failed to download attachment',
        variant: 'destructive'
      });
    }
  };

  const handlePreview = (attachment: CrewAttachment) => {
    setSelectedAttachment(attachment);
    setIsPreviewOpen(true);
  };

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading attachments...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header with Upload Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Documents & Attachments</h3>
        {canEdit && (
          <Button onClick={() => setIsUploadModalOpen(true)} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Upload Attachment
          </Button>
        )}
      </div>

      {/* Attachments Grid */}
      {(!attachments || attachments.length === 0) ? (
        <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed">
          <File className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h4 className="text-lg font-medium mb-2">No Attachments</h4>
          <p className="text-muted-foreground">
            {canEdit
              ? 'Click "Upload Attachment" to add documents'
              : 'No attachments have been added yet'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="border rounded-lg p-4 bg-card">
              <div className="flex items-start gap-4">
                {getFileIcon(attachment.mime_type)}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{attachment.file_name}</p>
                  <p className="text-sm text-muted-foreground">{attachment.attachment_type}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatFileSize(attachment.file_size)} • 
                    Uploaded {new Date(attachment.created_at).toLocaleDateString()}
                  </p>
                  {attachment.uploader && (
                    <p className="text-xs text-muted-foreground">
                      by {attachment.uploader.first_name} {attachment.uploader.last_name}
                    </p>
                  )}
                  {attachment.description && (
                    <p className="text-sm text-muted-foreground mt-2 italic">
                      {attachment.description}
                    </p>
                  )}
                </div>

                <div className="flex gap-1">
                  {(attachment.mime_type?.startsWith('image/') || attachment.mime_type?.includes('pdf')) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handlePreview(attachment)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDownload(attachment)}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedAttachment(attachment);
                        setIsDeleteDialogOpen(true);
                      }}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Attachment</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Attachment Type *</Label>
              <Select
                value={uploadForm.attachment_type}
                onValueChange={(value) => setUploadForm({ ...uploadForm, attachment_type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {ATTACHMENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Input
                value={uploadForm.description}
                onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                placeholder="Brief description of the document"
              />
            </div>

            <div className="space-y-2">
              <Label>File *</Label>
              <div className="border-2 border-dashed rounded-lg p-4">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx"
                  onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
                  className="hidden"
                  id="attachment-file"
                />
                <label htmlFor="attachment-file" className="cursor-pointer block text-center">
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm">
                    {uploadForm.file
                      ? uploadForm.file.name
                      : 'Click to upload or drag and drop'
                    }
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, DOC, DOCX, JPG, PNG, XLS, XLSX (Max 25MB)
                  </p>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadModalOpen(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Attachment</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            Are you sure you want to delete "{selectedAttachment?.file_name}"? 
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{selectedAttachment?.file_name}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center min-h-[400px]">
            {selectedAttachment?.mime_type?.startsWith('image/') ? (
              <img 
                src={selectedAttachment.file_url} 
                alt={selectedAttachment.file_name}
                className="max-w-full max-h-[70vh] object-contain"
              />
            ) : selectedAttachment?.mime_type?.includes('pdf') ? (
              <iframe 
                src={selectedAttachment.file_url}
                className="w-full h-[70vh]"
                title={selectedAttachment.file_name}
              />
            ) : (
              <div className="text-center">
                <File className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">Preview not available for this file type</p>
                <Button onClick={() => handleDownload(selectedAttachment!)}>
                  <Download className="w-4 h-4 mr-2" />
                  Download to View
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
