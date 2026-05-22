import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { CadenceBadge } from './CadenceBadge';
import { type NotificationType, type NotificationSubscription, useSaveSubscriptions } from '../hooks/useNotificationData';

interface Props {
  type: NotificationType | null;
  existing: NotificationSubscription[];
  open: boolean;
  onClose: () => void;
}

export const EditSubscriptionDrawer: React.FC<Props> = ({ type, existing, open, onClose }) => {
  const [emails, setEmails] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const save = useSaveSubscriptions();
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setEmails(existing.map((s) => s.email ?? '').filter(Boolean));
      setInput('');
    }
  }, [open, existing]);

  const addEmail = () => {
    const v = input.trim().toLowerCase();
    if (!v || !v.includes('@') || emails.includes(v)) return;
    setEmails([...emails, v]);
    setInput('');
  };

  const handleSave = () => {
    if (!type) return;
    save.mutate(
      {
        typeKey: type.key,
        subscriptions: emails.map((e) => ({
          user_id: null,
          email: e,
          vessel_scope: 'all' as const,
          vessel_ids: [],
          channels: { in_app: true, email: true },
        })),
      },
      {
        onSuccess: () => {
          toast({ title: 'Recipients updated' });
          onClose();
        },
        onError: (e: any) => toast({ title: 'Failed to save', description: e.message, variant: 'destructive' }),
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {type?.name}
            {type && <CadenceBadge cadence={type.cadence} />}
          </SheetTitle>
          <SheetDescription>{type?.description}</SheetDescription>
        </SheetHeader>
        <div className="py-4 space-y-3">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Recipients</Label>
          <div className="flex flex-wrap gap-1.5">
            {emails.length === 0 && <span className="text-sm text-muted-foreground">No recipients</span>}
            {emails.map((e) => (
              <Badge key={e} variant="outline" className="gap-1 pr-1 bg-muted">
                {e}
                <button onClick={() => setEmails(emails.filter((x) => x !== e))} className="hover:bg-destructive/10 rounded p-0.5">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="email@company.com"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
            />
            <Button type="button" variant="outline" size="icon" onClick={addEmail}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Scope: All vessels</p>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={save.isPending}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};