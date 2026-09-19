import React, { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SignatureValue } from '@/modules/legal/lib/forms';

interface SignatureFieldProps {
  id: string;
  value: SignatureValue | null;
  onChange: (value: SignatureValue | null) => void;
  readOnly?: boolean;
  acknowledgementText?: string;
}

const EMPTY: SignatureValue = { name: '', acknowledged: false, signedAt: '', image: null };

/** Typed name + acknowledgement, with an optional drawn signature. */
export const SignatureField: React.FC<SignatureFieldProps> = ({ id, value, onChange, readOnly, acknowledgementText = 'I confirm the information above is accurate and I accept the terms of this document.' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(Boolean(value?.image));
  const current = value ?? EMPTY;

  const update = (patch: Partial<SignatureValue>) => {
    const next = { ...current, ...patch };
    const signed = next.name.trim() !== '' && next.acknowledged;
    onChange({ ...next, signedAt: signed ? next.signedAt || new Date().toISOString() : '' });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (value?.image) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = value.image;
    }
    // Only redraw when the stored image changes (e.g. loading a submission).
  }, [value?.image]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    const p = point(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = getComputedStyle(canvasRef.current as HTMLCanvasElement).color;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    update({ image: canvas.toDataURL('image/png') });
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    update({ image: null });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-name`}>Full name (typed signature)</Label>
        <Input id={`${id}-name`} value={current.name} onChange={(e) => update({ name: e.target.value })} readOnly={readOnly} placeholder="Type your full name" autoComplete="name" />
      </div>
      <div className="flex items-start gap-2">
        <Checkbox id={`${id}-ack`} checked={current.acknowledged} onCheckedChange={(v) => update({ acknowledged: v === true })} disabled={readOnly} />
        <Label htmlFor={`${id}-ack`} className="text-sm font-normal leading-snug">
          {acknowledgementText}
        </Label>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Draw your signature (optional)</span>
          {!readOnly && hasInk && (
            <Button type="button" variant="ghost" size="sm" className="h-7" onClick={clear}>
              <Eraser className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          className="h-32 w-full touch-none rounded-md border border-dashed border-border bg-card text-foreground"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          aria-label="Signature pad"
          role="img"
        />
      </div>
      {current.signedAt && <p className="text-xs text-muted-foreground">Signed {new Date(current.signedAt).toLocaleString()}</p>}
    </div>
  );
};

export default SignatureField;
