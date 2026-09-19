import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VIDEO_CATEGORIES, useExercises, type PtVideo } from '@/modules/health/hooks/usePtLibrary';

interface VideoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: PtVideo | null;
  onSave: (values: Partial<PtVideo> & { title: string }) => void;
  saving?: boolean;
}

interface FormState {
  title: string;
  description: string;
  category: string;
  url: string;
  storage_path: string;
  duration_seconds: string;
  exercise_id: string;
  tags: string;
  is_active: boolean;
}

const empty: FormState = {
  title: '',
  description: '',
  category: 'technique',
  url: '',
  storage_path: '',
  duration_seconds: '',
  exercise_id: 'none',
  tags: '',
  is_active: true,
};

const fromRow = (row: PtVideo): FormState => ({
  title: row.title,
  description: row.description ?? '',
  category: row.category,
  url: row.url ?? '',
  storage_path: row.storage_path ?? '',
  duration_seconds: row.duration_seconds?.toString() ?? '',
  exercise_id: row.exercise_id ?? 'none',
  tags: (row.tags ?? []).join(', '),
  is_active: row.is_active,
});

const nullable = (value: string): string | null => (value.trim() ? value.trim() : null);

/** Create or edit one clip in the media library. */
export const VideoFormDialog: React.FC<VideoFormDialogProps> = ({
  open,
  onOpenChange,
  video,
  onSave,
  saving,
}) => {
  const [form, setForm] = useState<FormState>(empty);
  const { exercises } = useExercises({ limit: 300 });

  useEffect(() => {
    if (open) setForm(video ? fromRow(video) : empty);
  }, [open, video]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    onSave({
      ...(video ? { id: video.id } : {}),
      title: form.title.trim(),
      description: nullable(form.description),
      category: form.category,
      url: nullable(form.url),
      storage_path: nullable(form.storage_path),
      duration_seconds: form.duration_seconds.trim() ? Number(form.duration_seconds) : null,
      exercise_id: form.exercise_id === 'none' ? null : form.exercise_id,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      is_active: form.is_active,
    });
  };

  const hasMedia = Boolean(form.url.trim() || form.storage_path.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{video ? 'Edit video' : 'Add a video'}</DialogTitle>
          <DialogDescription>
            Give it a link or an upload path so it can be played on board.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="video-title">Title</Label>
                <Input
                  id="video-title"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  required
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => set('category', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VIDEO_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="video-duration">Duration (seconds)</Label>
                  <Input
                    id="video-duration"
                    type="number"
                    min={1}
                    value={form.duration_seconds}
                    onChange={(e) => set('duration_seconds', e.target.value)}
                    placeholder="90"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="video-url">Link</Label>
                <Input
                  id="video-url"
                  value={form.url}
                  onChange={(e) => set('url', e.target.value)}
                  placeholder="https://"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="video-path">Storage path</Label>
                <Input
                  id="video-path"
                  value={form.storage_path}
                  onChange={(e) => set('storage_path', e.target.value)}
                  placeholder="training/technique/back-squat.mp4"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Linked exercise</Label>
                <Select value={form.exercise_id} onValueChange={(v) => set('exercise_id', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Not linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked</SelectItem>
                    {exercises.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="video-tags">Tags</Label>
                <Input
                  id="video-tags"
                  value={form.tags}
                  onChange={(e) => set('tags', e.target.value)}
                  placeholder="squat, technique, beginner"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="video-description">Description</Label>
                <Textarea
                  id="video-description"
                  rows={3}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3 rounded-md border border-border p-3">
                <Switch
                  id="video-active"
                  checked={form.is_active}
                  onCheckedChange={(v) => set('is_active', v)}
                />
                <Label htmlFor="video-active" className="cursor-pointer">
                  Available to athletes
                </Label>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.title.trim() || !hasMedia}>
              {saving ? 'Saving...' : 'Save video'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default VideoFormDialog;
