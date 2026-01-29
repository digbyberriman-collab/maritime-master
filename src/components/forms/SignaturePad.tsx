import React, { useRef, useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CheckCircle, PenLine, Type, Trash2, X } from 'lucide-react';

export interface SignatureData {
  type: 'typed' | 'drawn';
  typed_name: string;
  drawn_data?: string; // Base64 canvas image
  timestamp: string;
}

interface SignaturePadProps {
  label: string;
  signerRole?: string;
  required?: boolean;
  value?: SignatureData | null;
  onChange: (signature: SignatureData | null) => void;
  disabled?: boolean;
  showTimestamp?: boolean;
}

const SignaturePad: React.FC<SignaturePadProps> = ({
  label,
  signerRole,
  required = false,
  value,
  onChange,
  disabled = false,
  showTimestamp = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [typedName, setTypedName] = useState(value?.typed_name || '');
  const [activeTab, setActiveTab] = useState<'typed' | 'drawn'>(value?.type || 'typed');
  const [hasDrawn, setHasDrawn] = useState(false);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    // Style
    ctx.strokeStyle = '#1a365d';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Restore drawn signature if exists
    if (value?.drawn_data) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.offsetWidth, canvas.offsetHeight);
        setHasDrawn(true);
      };
      img.src = value.drawn_data;
    }
  }, []);

  const getPosition = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const pos = getPosition(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const pos = getPosition(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange(null);
  };

  const confirmSignature = () => {
    const timestamp = new Date().toISOString();
    
    if (activeTab === 'typed') {
      if (!typedName.trim()) return;
      
      onChange({
        type: 'typed',
        typed_name: typedName.trim(),
        timestamp,
      });
    } else {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) return;

      const drawnData = canvas.toDataURL('image/png');
      
      onChange({
        type: 'drawn',
        typed_name: typedName.trim() || 'Unknown',
        drawn_data: drawnData,
        timestamp,
      });
    }
  };

  const clearSignature = () => {
    setTypedName('');
    clearCanvas();
  };

  const isComplete = value !== null && value !== undefined;

  if (isComplete && disabled) {
    return (
      <Card className="border-accent bg-accent/10">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">{label}</p>
                <p className="text-sm text-muted-foreground">
                  Signed by {value.typed_name}
                  {showTimestamp && (
                    <span className="ml-2 text-muted-foreground">
                      • {new Date(value.timestamp).toLocaleString()}
                    </span>
                  )}
                </p>
              </div>
            </div>
            {signerRole && (
              <Badge variant="outline" className="text-primary border-primary/30">
                {signerRole}
              </Badge>
            )}
          </div>
          {value.type === 'drawn' && value.drawn_data && (
            <div className="mt-3">
              <img 
                src={value.drawn_data} 
                alt="Signature" 
                className="h-16 object-contain"
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium">
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {signerRole && (
            <Badge variant="secondary">{signerRole}</Badge>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'typed' | 'drawn')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="typed" disabled={disabled}>
              <Type className="h-4 w-4 mr-2" />
              Type Name
            </TabsTrigger>
            <TabsTrigger value="drawn" disabled={disabled}>
              <PenLine className="h-4 w-4 mr-2" />
              Draw Signature
            </TabsTrigger>
          </TabsList>

          <TabsContent value="typed" className="space-y-3 mt-4">
            <div>
              <Label htmlFor="typed-name">Full Legal Name</Label>
              <Input
                id="typed-name"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Enter your full name"
                disabled={disabled}
                className="mt-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              By typing your name, you confirm this serves as your electronic signature.
            </p>
          </TabsContent>

          <TabsContent value="drawn" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label htmlFor="drawn-name">Your Name</Label>
              <Input
                id="drawn-name"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Enter your name"
                disabled={disabled}
                className="mt-1"
              />
            </div>
            
            <div className="relative">
              <Label>Draw Your Signature</Label>
              <div className="mt-1 border-2 border-dashed border-muted rounded-lg bg-background relative">
                <canvas
                  ref={canvasRef}
                  className="w-full h-32 cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                {!hasDrawn && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-muted-foreground text-sm">Sign here</p>
                  </div>
                )}
              </div>
              {hasDrawn && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCanvas}
                  disabled={disabled}
                  className="absolute top-0 right-0 text-muted-foreground"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex gap-2 pt-2">
          <Button
            onClick={confirmSignature}
            disabled={disabled || (activeTab === 'typed' ? !typedName.trim() : !hasDrawn)}
            className="flex-1"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Confirm Signature
          </Button>
          {(typedName || hasDrawn) && (
            <Button
              variant="outline"
              onClick={clearSignature}
              disabled={disabled}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SignaturePad;
