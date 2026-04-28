import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Plus, Search, FileText, Copy, 
  Calendar, Clock, CheckCircle, Edit, Eye, 
  MoreHorizontal, Loader2, Trash2, ShieldAlert, RotateCcw
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import AdminPinModal from '@/modules/crew/components/AdminPinModal';
import { toast } from '@/shared/hooks/use-toast';

interface FormTemplate {
  id: string;
  template_code: string;
  template_name: string;
  description: string | null;
  form_type: string;
  category_id: string | null;
  version: number;
  status: string;
  vessel_scope: string;
  initiation_mode: string;
  created_at: string;
  archived_at?: string | null;
}

const RESTORE_WINDOW_HOURS = 24;

const FORM_TYPES = [
  { value: 'CHECKLIST', label: 'Checklist', icon: '☑️' },
  { value: 'REPORT', label: 'Report', icon: '📋' },
  { value: 'MEETING_MINUTES', label: 'Meeting Minutes', icon: '📝' },
  { value: 'DRILL_REPORT', label: 'Drill Report', icon: '🚨' },
  { value: 'HANDOVER', label: 'Handover', icon: '🔄' },
  { value: 'AUDIT_FORM', label: 'Audit Form', icon: '🔍' },
  { value: 'RISK_ASSESSMENT', label: 'Risk Assessment', icon: '⚠️' },
  { value: 'INSPECTION', label: 'Inspection', icon: '👁️' },
  { value: 'PERMIT_TO_WORK', label: 'Permit to Work', icon: '🔒' }
];

const FormTemplates: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedVesselId } = useVessel();
  
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('PUBLISHED');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [archiveOffered, setArchiveOffered] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const pinConfirmedRef = useRef(false);

  useEffect(() => {
    loadTemplates();
  }, [selectedVesselId, filterType, filterStatus]);

  const loadTemplates = async () => {
    setLoading(true);
    
    try {
      let query = supabase
        .from('form_templates')
        .select('*')
        .order('template_name');

      if (filterStatus && filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      if (filterType && filterType !== 'all') {
        query = query.eq('form_type', filterType);
      }

      // Filter by vessel scope
      if (selectedVesselId) {
        query = query.or(`vessel_scope.eq.FLEET,vessel_ids.cs.{${selectedVesselId}}`);
      }

      const { data, error } = await query;

      if (!error && data) {
        setTemplates(data);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter(t =>
    t.template_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.template_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      DRAFT: 'secondary',
      UNDER_REVIEW: 'outline',
      PUBLISHED: 'default',
      ARCHIVED: 'destructive'
    };
    return (
      <Badge variant={variants[status] || 'secondary'}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getFormTypeInfo = (type: string) => {
    return FORM_TYPES.find(t => t.value === type) || { value: type, label: type, icon: '📄' };
  };

  const pendingTemplate = templates.find(t => t.id === pendingDeleteId);

  const checkDpaAccess = async (): Promise<boolean> => {
    if (!user?.id) {
      toast({
        title: 'Not signed in',
        description: 'You must be signed in as a DPA to delete templates.',
        variant: 'destructive',
      });
      return false;
    }

    // Check user_roles table for active DPA / superadmin role
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('role', ['dpa', 'superadmin']);

    if (rolesError) {
      console.error('Role check failed:', rolesError);
    }

    if (roles && roles.length > 0) return true;

    // Legacy fallback: profiles.role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    const legacy = (profile?.role || '').toString().toLowerCase();
    if (legacy === 'dpa' || legacy === 'superadmin' || legacy === 'shore_management') {
      return true;
    }

    toast({
      title: 'Permission denied',
      description:
        'Only the Designated Person Ashore (DPA) can permanently delete form templates. Please ask your DPA to perform this action, or archive the template instead.',
      variant: 'destructive',
    });
    return false;
  };

  const handleDeleteClick = async (id: string) => {
    const allowed = await checkDpaAccess();
    if (!allowed) return;
    pinConfirmedRef.current = false;
    setDeleteError(null);
    setArchiveOffered(false);
    setPendingDeleteId(id);
    setPinOpen(true);
  };

  const handlePinConfirmed = () => {
    pinConfirmedRef.current = true;
    setPinOpen(false);
    setConfirmOpen(true);
  };

  const classifyError = (err: any): { kind: string; detail: string } => {
    // Network / fetch failure
    if (err?.name === 'TypeError' && /fetch|network/i.test(err?.message || '')) {
      return { kind: 'Network error', detail: err.message };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { kind: 'Network error', detail: 'Browser is offline.' };
    }

    const code = err?.code as string | undefined;
    const msg = (err?.message || '').toString();
    const details = (err?.details || '').toString();
    const hint = (err?.hint || '').toString();
    const combined = `${msg} ${details} ${hint}`.toLowerCase();

    // Postgres error codes
    // 23503 = foreign_key_violation, 42501 = insufficient_privilege
    if (code === '23503' || combined.includes('foreign key') || combined.includes('violates foreign key')) {
      return {
        kind: 'Foreign key constraint',
        detail: `${msg}${details ? ` — ${details}` : ''}`,
      };
    }
    if (
      code === '42501' ||
      combined.includes('row-level security') ||
      combined.includes('row level security') ||
      combined.includes('permission denied') ||
      combined.includes('rls')
    ) {
      return {
        kind: 'Row-Level Security (permission denied)',
        detail: msg || 'The database refused this delete for the current user.',
      };
    }
    if (code) {
      return { kind: `Database error (${code})`, detail: msg };
    }
    return { kind: 'Unknown error', detail: msg || 'No error message returned.' };
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      // Clean up dependent rows that don't have ON DELETE CASCADE,
      // otherwise the delete will fail silently due to FK constraints.
      const jobsRes = await supabase.from('form_ai_extraction_jobs').delete().eq('template_id', pendingDeleteId);
      if (jobsRes.error) throw Object.assign(jobsRes.error, { _stage: 'cleanup:form_ai_extraction_jobs' });

      const schedRes = await supabase.from('form_schedules').delete().eq('template_id', pendingDeleteId);
      if (schedRes.error) throw Object.assign(schedRes.error, { _stage: 'cleanup:form_schedules' });

      const supRes = await supabase
        .from('form_templates')
        .update({ supersedes_template_id: null })
        .eq('supersedes_template_id', pendingDeleteId);
      if (supRes.error) throw Object.assign(supRes.error, { _stage: 'cleanup:supersedes' });

      // Check for submissions — these are records we should NOT silently destroy.
      const { count: submissionCount, error: countErr } = await supabase
        .from('form_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('template_id', pendingDeleteId);
      if (countErr) throw Object.assign(countErr, { _stage: 'count:form_submissions' });

      if ((submissionCount ?? 0) > 0) {
        throw Object.assign(
          new Error(
            `${submissionCount} submission(s) reference this template. Archive the template instead to preserve history.`
          ),
          { _stage: 'guard:submissions', _kind: 'Blocked by existing submissions' }
        );
      }

      const { data: deleted, error } = await supabase
        .from('form_templates')
        .delete()
        .eq('id', pendingDeleteId)
        .select('id');
      if (error) throw Object.assign(error, { _stage: 'delete:form_templates' });
      if (!deleted || deleted.length === 0) {
        throw Object.assign(
          new Error('No rows deleted. Most likely a Row-Level Security policy denied this user, or the row no longer exists.'),
          { _stage: 'delete:form_templates', _kind: 'Row-Level Security (no rows affected)' }
        );
      }
      toast({ title: 'Template deleted', description: 'The form template has been permanently removed.' });
      setTemplates(prev => prev.filter(t => t.id !== pendingDeleteId));
      setConfirmOpen(false);
      setPendingDeleteId(null);
      pinConfirmedRef.current = false;
    } catch (err: any) {
      const { kind, detail } = err?._kind
        ? { kind: err._kind as string, detail: err.message as string }
        : classifyError(err);
      const stage = err?._stage ? ` [stage: ${err._stage}]` : '';
      const code = err?.code ? ` (code ${err.code})` : '';
      const full = `${kind}${code}: ${detail}${stage}`;
      console.error('Template delete failed:', { kind, code: err?.code, stage: err?._stage, err });
      setDeleteError(full);
      // Offer archive fallback when delete is blocked by data dependencies
      const canArchive =
        kind === 'Foreign key constraint' ||
        kind === 'Blocked by existing submissions' ||
        err?._stage === 'guard:submissions';
      setArchiveOffered(canArchive);
      toast({
        title: `Delete failed — ${kind}`,
        description: full,
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleArchiveInstead = async () => {
    if (!pendingDeleteId) return;
    setArchiving(true);
    const archivedAt = new Date().toISOString();
    try {
      const { data, error } = await supabase
        .from('form_templates')
        .update({ status: 'ARCHIVED', archived_at: archivedAt })
        .eq('id', pendingDeleteId)
        .select('id, status, archived_at');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Archive blocked by Row-Level Security (no rows updated).');
      }
      toast({
        title: 'Template archived',
        description: `History preserved. You have ${RESTORE_WINDOW_HOURS} hours to undo this from the Archived view.`,
      });
      setTemplates(prev =>
        prev.map(t =>
          t.id === pendingDeleteId ? { ...t, status: 'ARCHIVED', archived_at: archivedAt } : t
        )
      );
      setConfirmOpen(false);
      setPendingDeleteId(null);
      setDeleteError(null);
      setArchiveOffered(false);
      pinConfirmedRef.current = false;
    } catch (err: any) {
      const { kind, detail } = classifyError(err);
      toast({
        title: `Archive failed — ${kind}`,
        description: `${kind}: ${detail}`,
        variant: 'destructive',
      });
    } finally {
      setArchiving(false);
    }
  };

  const isWithinRestoreWindow = (archivedAt?: string | null): boolean => {
    if (!archivedAt) return false;
    const ageMs = Date.now() - new Date(archivedAt).getTime();
    return ageMs >= 0 && ageMs < RESTORE_WINDOW_HOURS * 3600_000;
  };

  const restoreLabel = (archivedAt?: string | null): string => {
    if (!archivedAt) return '';
    const remainingMs =
      RESTORE_WINDOW_HOURS * 3600_000 - (Date.now() - new Date(archivedAt).getTime());
    if (remainingMs <= 0) return 'Restore window expired';
    const hours = Math.floor(remainingMs / 3600_000);
    const mins = Math.floor((remainingMs % 3600_000) / 60_000);
    return hours > 0 ? `Restore (${hours}h ${mins}m left)` : `Restore (${mins}m left)`;
  };

  const handleRestore = async (template: FormTemplate) => {
    const allowed = await checkDpaAccess();
    if (!allowed) return;
    if (!isWithinRestoreWindow(template.archived_at)) {
      toast({
        title: 'Restore window expired',
        description: `This template was archived more than ${RESTORE_WINDOW_HOURS} hours ago. A DPA must re-publish it manually.`,
        variant: 'destructive',
      });
      return;
    }
    try {
      const { data, error } = await supabase
        .from('form_templates')
        .update({ status: 'PUBLISHED', archived_at: null })
        .eq('id', template.id)
        .select('id, status, archived_at');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Restore blocked by Row-Level Security (no rows updated).');
      }
      toast({
        title: 'Template restored',
        description: `${template.template_name} is published again.`,
      });
      setTemplates(prev =>
        prev.map(t =>
          t.id === template.id ? { ...t, status: 'PUBLISHED', archived_at: null } : t
        )
      );
    } catch (err: any) {
      const { kind, detail } = classifyError(err);
      toast({
        title: `Restore failed — ${kind}`,
        description: `${kind}: ${detail}`,
        variant: 'destructive',
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Form Templates</h1>
            <p className="text-muted-foreground">Manage checklists, forms, and document templates</p>
          </div>
          <Button onClick={() => navigate('/ism/forms/templates/create')}>
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {FORM_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="PUBLISHED">Published</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Templates Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No Templates Found</h3>
              <p className="text-muted-foreground text-sm mt-1">Create your first template to get started</p>
              <Button 
                className="mt-4"
                onClick={() => navigate('/ism/forms/templates/create')}
              >
                Create Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map(template => {
              const typeInfo = getFormTypeInfo(template.form_type);
              
              return (
                <Card key={template.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{typeInfo.icon}</span>
                        <div>
                          <CardTitle className="text-base">{template.template_name}</CardTitle>
                          <CardDescription className="text-xs mt-0.5">{template.template_code}</CardDescription>
                        </div>
                      </div>
                      {getStatusBadge(template.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4">
                    {template.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {template.description}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-4">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        v{template.version}
                      </span>
                      <span>
                        {template.vessel_scope === 'FLEET' ? '🌐 Fleet-wide' : '🚢 Vessel'}
                      </span>
                      <span className="flex items-center gap-1">
                        {template.initiation_mode === 'SCHEDULED' ? (
                          <><Calendar className="h-3 w-3" /> Scheduled</>
                        ) : (
                          <><Clock className="h-3 w-3" /> Manual</>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/ism/forms/templates/${template.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/ism/forms/templates/${template.id}/edit`)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDeleteClick(template.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete (DPA PIN)
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      
                      {template.status === 'PUBLISHED' && (
                        <Button
                          size="sm"
                          onClick={() => navigate(`/ism/forms/new?template=${template.id}`)}
                        >
                          Start Form
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <AdminPinModal
        open={pinOpen}
        onOpenChange={(open) => {
          setPinOpen(open);
          if (!open && !pinConfirmedRef.current) setPendingDeleteId(null);
        }}
        onConfirmed={handlePinConfirmed}
        title="DPA PIN Required"
        description="Deleting a form template is permanent. Enter the DPA PIN to authorise this action."
      />

      <AlertDialog open={confirmOpen} onOpenChange={(open) => {
        setConfirmOpen(open);
        if (!open && !deleting && !archiving) {
          setPendingDeleteId(null);
          pinConfirmedRef.current = false;
          setDeleteError(null);
          setArchiveOffered(false);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Delete this template?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTemplate ? (
                <>You are about to permanently delete <strong>{pendingTemplate.template_name}</strong> ({pendingTemplate.template_code}). This cannot be undone. Existing submissions referencing this template may also be affected.</>
              ) : (
                <>This action cannot be undone.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <div className="font-semibold mb-1">Backend rejected the delete</div>
              <div className="break-words whitespace-pre-wrap font-mono text-xs">{deleteError}</div>
              {archiveOffered && (
                <div className="mt-2 text-xs text-foreground/80">
                  Submissions or related records depend on this template. You can{' '}
                  <strong>archive</strong> it instead — this hides the template from active
                  use while preserving full history for audits.
                </div>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting || archiving}>Cancel</AlertDialogCancel>
            {archiveOffered && (
              <Button
                variant="secondary"
                onClick={handleArchiveInstead}
                disabled={deleting || archiving}
              >
                {archiving ? 'Archiving…' : 'Archive instead'}
              </Button>
            )}
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmDelete(); }}
              disabled={deleting || archiving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default FormTemplates;
