import React, { useRef } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { toast } from '@/shared/hooks/use-toast';
import { useUploadAvatar } from '@/modules/hris/hooks/useHrProfile';
import { AVATAR_MIME_TYPES, profileInitials, validateAvatarFile } from '@/modules/hris/lib/profileForm';

interface AvatarUploaderProps {
  profileId: string;
  avatarUrl: string | null;
  firstName: string;
  lastName: string;
  /** Whether the viewer may replace the photo (HR editor or own record). */
  canUpload: boolean;
  className?: string;
}

/**
 * Large avatar with an overlay button that opens the file picker. Validation
 * happens client-side before the upload so a wrong file type never reaches
 * storage; the bucket enforces the same limits server-side.
 */
export const AvatarUploader: React.FC<AvatarUploaderProps> = ({
  profileId,
  avatarUrl,
  firstName,
  lastName,
  canUpload,
  className,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAvatar();

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again re-triggers change.
    event.target.value = '';
    if (!file) return;

    const problem = validateAvatarFile(file);
    if (problem) {
      toast({ title: 'Photo not accepted', description: problem, variant: 'destructive' });
      return;
    }

    try {
      await upload.mutateAsync({ profileId, file });
      toast({ title: 'Photo updated' });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Could not upload the photo',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className={cn('relative inline-flex', className)}>
      <Avatar className="h-24 w-24 border-2 border-border text-2xl">
        <AvatarImage src={avatarUrl ?? undefined} alt={`${firstName} ${lastName}`.trim()} className="object-cover" />
        <AvatarFallback className="bg-muted text-muted-foreground">{profileInitials(firstName, lastName)}</AvatarFallback>
      </Avatar>
      {canUpload && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_MIME_TYPES.join(',')}
            className="sr-only"
            onChange={handleFile}
            disabled={upload.isPending}
            aria-label="Upload profile photo"
          />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full border border-border shadow-sm"
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
            title="Change photo (JPEG, PNG or WebP, up to 5 MB)"
          >
            {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </Button>
        </>
      )}
    </div>
  );
};

export default AvatarUploader;
