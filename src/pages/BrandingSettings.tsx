import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding, canManageBranding } from '@/hooks/useBranding';
import { Palette, Building2, Image, Loader2, Upload, Trash2, RotateCcw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const DEFAULT_COLOR = '#1e3a8a';
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

const BrandingSettings: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { branding, isLoading, updateBranding, uploadLogo, deleteLogo } = useBranding();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [clientName, setClientName] = useState('');
  const [brandColor, setBrandColor] = useState(DEFAULT_COLOR);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);

  // Check permissions
  const hasPermission = canManageBranding(profile?.role);

  useEffect(() => {
    if (!hasPermission && !isLoading) {
      toast({
        title: 'Access Denied',
        description: 'Only DPA and Shore Management can access branding settings.',
        variant: 'destructive',
      });
      navigate('/settings');
    }
  }, [hasPermission, isLoading, navigate]);

  // Initialize form from branding data
  useEffect(() => {
    if (branding) {
      setClientName(branding.client_display_name || '');
      setBrandColor(branding.brand_color || DEFAULT_COLOR);
      setLogoPreview(branding.client_logo_url || null);
    }
  }, [branding]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/png', 'image/svg+xml'].includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PNG or SVG file.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'File too large',
        description: 'Maximum file size is 2MB.',
        variant: 'destructive',
      });
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setPendingLogoFile(file);
  };

  const handleRemoveLogo = async () => {
    setLogoPreview(null);
    setPendingLogoFile(null);
    if (branding?.client_logo_url) {
      await deleteLogo();
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let logoUrl = branding?.client_logo_url;

      // Upload new logo if pending
      if (pendingLogoFile) {
        setIsUploading(true);
        const uploadedUrl = await uploadLogo(pendingLogoFile);
        if (uploadedUrl) {
          logoUrl = uploadedUrl;
        }
        setIsUploading(false);
        setPendingLogoFile(null);
      }

      // Update branding
      await updateBranding.mutateAsync({
        client_display_name: clientName.trim() || null,
        brand_color: brandColor !== DEFAULT_COLOR ? brandColor : null,
        client_logo_url: logoUrl,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setClientName('');
    setBrandColor(DEFAULT_COLOR);
    setLogoPreview(null);
    setPendingLogoFile(null);
  };

  if (!hasPermission) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Branding Settings</h1>
          <p className="text-muted-foreground">Customize your company branding for reports and emails</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <>
            {/* Company Name */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Company Display Name
                </CardTitle>
                <CardDescription>
                  This name appears as a subtitle in navigation and in report headers as "Prepared for: [Name]"
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="clientName">Display Name (optional)</Label>
                  <Input
                    id="clientName"
                    placeholder="e.g., ABC Yachts"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to show only STORM branding
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Brand Color */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Primary Brand Color
                </CardTitle>
                <CardDescription>
                  Overrides the default navy blue for buttons, links, and navigation elements
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="brandColor">Color</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        id="brandColor"
                        value={brandColor}
                        onChange={(e) => setBrandColor(e.target.value)}
                        className="w-12 h-12 rounded-lg border border-input cursor-pointer"
                      />
                      <Input
                        value={brandColor.toUpperCase()}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                            setBrandColor(val);
                          }
                        }}
                        className="w-28 font-mono"
                        maxLength={7}
                      />
                    </div>
                  </div>
                  
                  {/* Preview */}
                  <div className="flex-1 space-y-2">
                    <Label>Preview</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        style={{ backgroundColor: brandColor, borderColor: brandColor }}
                        className="text-white"
                      >
                        Sample Button
                      </Button>
                      <span style={{ color: brandColor }} className="font-medium">
                        Sample Link
                      </span>
                    </div>
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  Default color: {DEFAULT_COLOR} (Navy Blue)
                </p>
              </CardContent>
            </Card>

            {/* Client Logo */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="w-5 h-5" />
                  Client Logo
                </CardTitle>
                <CardDescription>
                  Appears alongside STORM logo in PDF reports and email headers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Logo File (PNG or SVG, max 2MB)</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Recommended size: 200x60 pixels
                  </p>
                  
                  {logoPreview ? (
                    <div className="space-y-3">
                      <div className="relative inline-block p-4 bg-muted rounded-lg border border-border">
                        <img
                          src={logoPreview}
                          alt="Logo preview"
                          className="max-w-[200px] max-h-[60px] object-contain"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Replace
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRemoveLogo}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    >
                      <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PNG or SVG, max 2MB
                      </p>
                    </div>
                  )}
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.svg,image/png,image/svg+xml"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-between">
              <Button variant="outline" onClick={handleReset} className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Reset to Defaults
              </Button>
              <Button onClick={handleSave} disabled={isSaving || isUploading} className="gap-2">
                {(isSaving || isUploading) && <Loader2 className="w-4 h-4 animate-spin" />}
                {isUploading ? 'Uploading...' : isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>

            {/* Info Box */}
            <Card className="bg-muted/50 border-muted">
              <CardContent className="pt-6">
                <h4 className="font-medium mb-2">Branding Hierarchy</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• <strong>STORM logo</strong>: Always visible in primary position (top-left)</li>
                  <li>• <strong>Client name</strong>: Appears as subtitle or secondary branding</li>
                  <li>• <strong>Client logo</strong>: Supplementary, appears in reports/emails</li>
                  <li>• <strong>Brand color</strong>: Applied to interactive elements only</li>
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default BrandingSettings;
