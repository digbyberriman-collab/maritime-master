import React, { useState } from 'react';
import { Film, Pencil, Play, Plus, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { StaffOnlyNotice } from '@/modules/health/components/pt/PtCommon';
import { VideoFormDialog } from '@/modules/health/components/pt/VideoFormDialog';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import {
  VIDEO_CATEGORIES,
  useVideos,
  videoCategoryLabel,
  type PtVideoEntry,
} from '@/modules/health/hooks/usePtLibrary';
import { formatDuration } from '@/modules/health/lib/format';

/** Turns a watch link into something an iframe will play. */
const embedUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (parsed.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed${parsed.pathname}`;
    }
    if (parsed.hostname.includes('vimeo.com')) {
      return `https://player.vimeo.com/video${parsed.pathname}`;
    }
    return null;
  } catch {
    return null;
  }
};

const isDirectVideo = (url: string): boolean => /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);

/** Technique clips, class recordings and rehabilitation guides. */
const VideoLibraryPage: React.FC = () => {
  const access = useWellnessAccess();
  const canEdit = access.canEdit;

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PtVideoEntry | null>(null);
  const [preview, setPreview] = useState<PtVideoEntry | null>(null);

  const library = useVideos({ search, category: category === 'all' ? null : category });

  if (!access.loading && !access.canView) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={Film} title="Video library" description="Technique and class clips." />
        <StaffOnlyNotice what="library" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Film}
        title="Video library"
        description="Clips athletes can watch before a movement, and classes they can follow when the trainer is ashore."
        actions={
          canEdit ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add a video
            </Button>
          ) : undefined
        }
        toolbar={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search titles and descriptions"
                className="pl-9"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any category</SelectItem>
                {VIDEO_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {library.isLoading ? (
        <HealthLoading rows={4} />
      ) : library.isError ? (
        <HealthError error={library.error} title="Could not load the video library" />
      ) : library.videos.length === 0 ? (
        <HealthEmpty
          icon={Film}
          title="No videos yet"
          description={
            canEdit
              ? 'Add a link or an upload path so athletes can see the movement before they attempt it.'
              : 'Ask a trainer to add the clips you need.'
          }
          action={
            canEdit ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Add a video
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {library.videos.map((video) => (
            <Card key={video.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{video.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[videoCategoryLabel(video.category), video.exercise_name, formatDuration(
                        video.duration_seconds ? Math.round(video.duration_seconds / 60) : null,
                      )]
                        .filter((part) => part && part !== '—')
                        .join(' · ')}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Edit ${video.title}`}
                        onClick={() => {
                          setEditing(video);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        aria-label={`Remove ${video.title}`}
                        onClick={() => library.remove.mutate(video.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {video.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{video.description}</p>
                )}

                {video.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {video.tags.slice(0, 5).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {video.url ? (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setPreview(video)}>
                    <Play className="mr-2 h-4 w-4" />
                    Play
                  </Button>
                ) : (
                  <p className="rounded-md border border-dashed border-border p-2 text-center text-xs text-muted-foreground">
                    Stored on board at {video.storage_path}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{preview?.title}</DialogTitle>
          </DialogHeader>
          {preview?.url && (
            <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-muted">
              {embedUrl(preview.url) ? (
                <iframe
                  src={embedUrl(preview.url) as string}
                  title={preview.title}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : isDirectVideo(preview.url) ? (
                <video src={preview.url} controls className="h-full w-full">
                  <track kind="captions" />
                </video>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    This link cannot be embedded. Open it in a new tab instead.
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <a href={preview.url} target="_blank" rel="noreferrer">
                      Open the video
                    </a>
                  </Button>
                </div>
              )}
            </div>
          )}
          {preview?.description && (
            <p className="text-sm text-muted-foreground">{preview.description}</p>
          )}
        </DialogContent>
      </Dialog>

      <VideoFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        video={editing}
        saving={library.isMutating}
        onSave={(values) => library.save.mutate(values, { onSuccess: () => setFormOpen(false) })}
      />
    </div>
  );
};

export default VideoLibraryPage;
