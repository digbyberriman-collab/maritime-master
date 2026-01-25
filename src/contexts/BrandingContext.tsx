import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface BrandingContextType {
  clientDisplayName: string | null;
  brandColor: string;
  clientLogoUrl: string | null;
  companyName: string | null;
  isLoading: boolean;
}

const DEFAULT_PRIMARY_COLOR = '#1e3a8a';

const BrandingContext = createContext<BrandingContextType>({
  clientDisplayName: null,
  brandColor: DEFAULT_PRIMARY_COLOR,
  clientLogoUrl: null,
  companyName: null,
  isLoading: true,
});

export const useBrandingContext = () => useContext(BrandingContext);

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['company-branding', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return null;
      
      const { data, error } = await supabase
        .from('companies')
        .select('client_display_name, brand_color, client_logo_url, name')
        .eq('id', profile.company_id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
  });

  const brandColor = data?.brand_color || DEFAULT_PRIMARY_COLOR;

  // Apply brand color as CSS custom property
  useEffect(() => {
    if (brandColor) {
      // Convert hex to HSL for Tailwind compatibility
      const hsl = hexToHSL(brandColor);
      document.documentElement.style.setProperty('--brand-primary', hsl);
    }
    
    return () => {
      document.documentElement.style.removeProperty('--brand-primary');
    };
  }, [brandColor]);

  const value = useMemo(() => ({
    clientDisplayName: data?.client_display_name ?? null,
    brandColor,
    clientLogoUrl: data?.client_logo_url ?? null,
    companyName: data?.name ?? null,
    isLoading,
  }), [data, brandColor, isLoading]);

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
};

// Helper to convert hex to HSL string
function hexToHSL(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Parse hex
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
