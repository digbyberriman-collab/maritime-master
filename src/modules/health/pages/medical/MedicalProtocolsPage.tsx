import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import {
  PROTOCOL_CATEGORIES,
  protocolCategoryLabel,
  useMedicalProtocols,
  useMyProtocolAcknowledgements,
  type ProtocolEntry,
} from '@/modules/health/hooks/useMedicalProtocols';
import { expiryLabel, expiryTone, formatDate, toneClass } from '@/modules/health/lib/format';

/**
 * The medical protocol library. Protocols are versioned: publishing a change
 * bumps the version, so an acknowledgement recorded against version 2 does
 * not silently cover version 3.
 */
const MedicalProtocolsPage: React.FC = () => {
  const access = useMedicalAccess();
  const protocols = useMedicalProtocols();
  const myAcks = useMyProtocolAcknowledgements();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProtocolEntry | null>(null);
  const [reading, setReading] = useState<ProtocolEntry | null>(null);
  const [deleting, setDeleting] = useState<ProtocolEntry | null>(null);

  const filter = (rows: ProtocolEntry[]) => {
    const term = search.trim().toLowerCase();
    return rows.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (!term) return true;
      return [p.title, p.reference, p.summary]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(term));
    });
  };

  const active = useMemo(() => filter(protocols.protocols.filter((p) => p.status === 'active')), [
    protocols.protocols,
    search,
    category,
  ]);
  const drafts = useMemo(() => filter(protocols.protocols.filter((p) => p.status === 'draft')), [
    protocols.protocols,
    search,
    category,
  ]);
  const archived = useMemo(() => filter(protocols.protocols.filter((p) => p.status === 'archived')), [
    protocols.protocols,
    search,
    category,
  ]);

  const outstanding = useMemo(
    () =>
      protocols.protocols.filter(
        (p) =>
          p.status === 'active' &&
          p.requires_acknowledgement &&
          (myAcks.byProtocol.get(p.id) ?? 0) < p.version,
      ),
    [protocols.protocols, myAcks.byProtocol],
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const renderList = (rows: ProtocolEntry[], emptyTitle: string, emptyDescription: string) => {
    if (protocols.isLoading) return <HealthLoading rows={3} />;
    if (rows.length === 0) {
      return <HealthEmpty icon={BookOpen} title={emptyTitle} description={emptyDescription} />;
    }
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((p) => (
          <ProtocolCard
            key={p.id}
            protocol={p}
            canEdit={access.canEdit}
            acknowledgedVersion={myAcks.byProtocol.get(p.id) ?? 0}
            onRead={setReading}
            onEdit={(x) => {
              setEditing(x);
              setFormOpen(true);
            }}
            onPublish={(x) => protocols.publish.mutate(x)}
            onAcknowledge={(x) => protocols.acknowledge.mutate(x)}
            onDelete={setDeleting}
          />
        ))}
      </div>
    );
  };

  if (protocols.isError) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={BookOpen} scope="medical" title="Protocols" />
        <HealthError error={protocols.error} title="Could not load protocols" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={BookOpen}
        scope="medical"
        title="Protocols"
        description="Emergency, clinical and medication protocols, versioned and acknowledged."
        actions={
          access.canEdit && (
            <Button size="sm" className="gap-1" onClick={openCreate}>
              <Plus className="h-4 w-4" /> New protocol
            </Button>
          )
        }
        toolbar={
          <>
            <div className="relative md:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, reference or summary"
                className="pl-8"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="md:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {PROTOCOL_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      {outstanding.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {outstanding.length} {outstanding.length === 1 ? 'protocol needs' : 'protocols need'} your
              acknowledgement
            </CardTitle>
            <CardDescription>
              Read each one and confirm. Acknowledgements are recorded against the version you read.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {outstanding.map((p) => (
              <Button key={p.id} variant="outline" size="sm" onClick={() => setReading(p)}>
                {p.title}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          {access.canEdit && <TabsTrigger value="drafts">Drafts ({drafts.length})</TabsTrigger>}
          {access.canEdit && <TabsTrigger value="archived">Archived ({archived.length})</TabsTrigger>}
        </TabsList>
        <TabsContent value="active" className="mt-4">
          {renderList(
            active,
            'No active protocols',
            access.canEdit
              ? 'Write your medevac, anaphylaxis and controlled drug protocols, then publish them so the crew can acknowledge them.'
              : 'Nothing has been published yet.',
          )}
        </TabsContent>
        <TabsContent value="drafts" className="mt-4">
          {renderList(drafts, 'No drafts', 'A protocol stays in draft until you publish it.')}
        </TabsContent>
        <TabsContent value="archived" className="mt-4">
          {renderList(archived, 'Nothing archived', 'Superseded protocols live here.')}
        </TabsContent>
      </Tabs>

      <ProtocolFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        protocol={editing}
        onSubmit={(values) => protocols.save.mutateAsync(values)}
        busy={protocols.isMutating}
      />

      <ProtocolReader
        protocol={reading}
        onOpenChange={(open) => !open && setReading(null)}
        acknowledgedVersion={reading ? myAcks.byProtocol.get(reading.id) ?? 0 : 0}
        onAcknowledge={(p) => protocols.acknowledge.mutate(p)}
        busy={protocols.isMutating}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              Acknowledgements go with it. Archiving keeps the record and takes it out of use.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) protocols.remove.mutate(deleting.id);
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface ProtocolCardProps {
  protocol: ProtocolEntry;
  canEdit: boolean;
  acknowledgedVersion: number;
  onRead: (p: ProtocolEntry) => void;
  onEdit: (p: ProtocolEntry) => void;
  onPublish: (p: ProtocolEntry) => void;
  onAcknowledge: (p: ProtocolEntry) => void;
  onDelete: (p: ProtocolEntry) => void;
}

const ProtocolCard: React.FC<ProtocolCardProps> = ({
  protocol,
  canEdit,
  acknowledgedVersion,
  onRead,
  onEdit,
  onPublish,
  onAcknowledge,
  onDelete,
}) => {
  const needsAck =
    protocol.status === 'active' &&
    protocol.requires_acknowledgement &&
    acknowledgedVersion < protocol.version;

  return (
    <Card className={cn(needsAck && 'border-warning/40')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{protocol.title}</CardTitle>
            <CardDescription className="truncate">
              {[protocol.reference, protocolCategoryLabel(protocol.category), `v${protocol.version}`]
                .filter(Boolean)
                .join(' · ')}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'shrink-0 text-[10px]',
              protocol.status === 'active' ? toneClass.ok : toneClass.none,
            )}
          >
            {protocol.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {protocol.summary && (
          <p className="line-clamp-2 text-muted-foreground">{protocol.summary}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {protocol.review_due && (
            <Badge
              variant="outline"
              className={cn('gap-1 text-[10px]', toneClass[expiryTone(protocol.review_due)])}
            >
              <CalendarClock className="h-3 w-3" /> Review {expiryLabel(protocol.review_due)}
            </Badge>
          )}
          {protocol.requires_acknowledgement && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Users className="h-3 w-3" /> {protocol.acknowledgementCount} acknowledged
            </Badge>
          )}
          {protocol.effective_from && (
            <span className="text-muted-foreground">From {formatDate(protocol.effective_from)}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1" onClick={() => onRead(protocol)}>
              <FileText className="h-4 w-4" /> Read
            </Button>
            {needsAck && (
              <Button size="sm" className="gap-1" onClick={() => onAcknowledge(protocol)}>
                <CheckCircle2 className="h-4 w-4" /> Acknowledge
              </Button>
            )}
            {!needsAck && protocol.requires_acknowledgement && protocol.status === 'active' && (
              <Badge variant="outline" className={cn('gap-1 text-[10px]', toneClass.ok)}>
                <CheckCircle2 className="h-3 w-3" /> You have acknowledged v{acknowledgedVersion}
              </Badge>
            )}
          </div>
          {canEdit && (
            <div className="flex gap-1">
              {protocol.status !== 'active' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => onPublish(protocol)}
                >
                  <Send className="h-4 w-4" /> Publish
                </Button>
              )}
              <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => onEdit(protocol)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete"
                onClick={() => onDelete(protocol)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const ProtocolReader: React.FC<{
  protocol: ProtocolEntry | null;
  onOpenChange: (open: boolean) => void;
  acknowledgedVersion: number;
  onAcknowledge: (p: ProtocolEntry) => void;
  busy: boolean;
}> = ({ protocol, onOpenChange, acknowledgedVersion, onAcknowledge, busy }) => {
  const needsAck =
    protocol?.status === 'active' &&
    protocol.requires_acknowledgement &&
    acknowledgedVersion < protocol.version;

  return (
    <Dialog open={Boolean(protocol)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{protocol?.title}</DialogTitle>
          <DialogDescription>
            {[
              protocol?.reference,
              protocolCategoryLabel(protocol?.category),
              `Version ${protocol?.version}`,
              protocol?.effective_from ? `Effective ${formatDate(protocol.effective_from)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </DialogDescription>
        </DialogHeader>

        {protocol?.summary && (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-foreground">{protocol.summary}</p>
        )}

        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {protocol?.content || 'No content recorded. The protocol may be held as an attached document.'}
        </div>

        {protocol?.document_name && (
          <p className="text-xs text-muted-foreground">Attached document: {protocol.document_name}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {needsAck && protocol && (
            <Button
              onClick={() => {
                onAcknowledge(protocol);
                onOpenChange(false);
              }}
              disabled={busy}
              className="gap-1"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              I have read and understood this
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ProtocolFormDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  protocol: ProtocolEntry | null;
  onSubmit: (values: Record<string, unknown> & { title: string }) => Promise<unknown>;
  busy: boolean;
}> = ({ open, onOpenChange, protocol, onSubmit, busy }) => {
  const { vessels } = useVessel();
  const [form, setForm] = useState({
    title: '',
    reference: '',
    category: 'clinical',
    summary: '',
    content: '',
    effective_from: '',
    review_due: '',
    requires_acknowledgement: false,
    vessel_id: 'none',
    notes: '',
  });

  React.useEffect(() => {
    if (!open) return;
    if (protocol) {
      setForm({
        title: protocol.title,
        reference: protocol.reference ?? '',
        category: protocol.category,
        summary: protocol.summary ?? '',
        content: protocol.content ?? '',
        effective_from: protocol.effective_from ?? '',
        review_due: protocol.review_due ?? '',
        requires_acknowledgement: protocol.requires_acknowledgement,
        vessel_id: protocol.vessel_id ?? 'none',
        notes: protocol.notes ?? '',
      });
    } else {
      setForm({
        title: '',
        reference: '',
        category: 'clinical',
        summary: '',
        content: '',
        effective_from: '',
        review_due: '',
        requires_acknowledgement: false,
        vessel_id: 'none',
        notes: '',
      });
    }
  }, [open, protocol]);

  const set = (key: keyof typeof form) => (value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form.title.trim()) return;
    await onSubmit({
      ...(protocol ? { id: protocol.id } : {}),
      title: form.title.trim(),
      reference: form.reference || null,
      category: form.category,
      summary: form.summary || null,
      content: form.content || null,
      effective_from: form.effective_from || null,
      review_due: form.review_due || null,
      requires_acknowledgement: form.requires_acknowledgement,
      vessel_id: form.vessel_id === 'none' ? null : form.vessel_id,
      notes: form.notes || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{protocol ? 'Edit protocol' : 'New protocol'}</DialogTitle>
          <DialogDescription>
            New protocols start as a draft. Publishing an already active protocol bumps its version,
            so crew are asked to acknowledge the change.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pr-title">Title</Label>
            <Input
              id="pr-title"
              value={form.title}
              onChange={(e) => set('title')(e.target.value)}
              placeholder="Medical evacuation"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-reference">Reference</Label>
            <Input
              id="pr-reference"
              value={form.reference}
              onChange={(e) => set('reference')(e.target.value)}
              placeholder="MED-PR-01"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-category">Category</Label>
            <Select value={form.category} onValueChange={set('category')}>
              <SelectTrigger id="pr-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROTOCOL_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-effective">Effective from</Label>
            <Input
              id="pr-effective"
              type="date"
              value={form.effective_from}
              onChange={(e) => set('effective_from')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-review">Review due</Label>
            <Input
              id="pr-review"
              type="date"
              value={form.review_due}
              onChange={(e) => set('review_due')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pr-vessel">Applies to</Label>
            <Select value={form.vessel_id} onValueChange={set('vessel_id')}>
              <SelectTrigger id="pr-vessel">
                <SelectValue placeholder="The whole fleet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">The whole fleet</SelectItem>
                {vessels.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pr-summary">Summary</Label>
          <Textarea
            id="pr-summary"
            rows={2}
            value={form.summary}
            onChange={(e) => set('summary')(e.target.value)}
            placeholder="One or two lines a reader sees before opening the protocol."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pr-content">Protocol</Label>
          <Textarea
            id="pr-content"
            rows={12}
            value={form.content}
            onChange={(e) => set('content')(e.target.value)}
            placeholder={'1. Assess and stabilise.\n2. Contact the telemedicine provider.\n3. ...'}
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="pr-ack" className="text-sm">
              Require acknowledgement
            </Label>
            <p className="text-xs text-muted-foreground">
              Crew are asked to confirm they have read it, and each version is tracked separately.
            </p>
          </div>
          <Switch
            id="pr-ack"
            checked={form.requires_acknowledgement}
            onCheckedChange={set('requires_acknowledgement')}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.title.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {protocol ? 'Save' : 'Create draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MedicalProtocolsPage;
