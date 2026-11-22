import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { hasStoredThemeChoice } from '@/components/ui/theme-config';

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

/**
 * Sign-in on a new device (gap/10 W1): when this browser has never stored a
 * theme, adopt the one saved on the user's profile. Only an explicit `dark` or
 * `light` is adopted: rows written before Abyss carry `system` merely because
 * it was the old form's default, and D-DS1 makes dark the default. Once a
 * choice is stored locally, the device's own choice wins and no query runs.
 */
function useProfileThemeOnNewDevice(userId: string | undefined) {
  const { setTheme } = useTheme();
  const isNewDevice = !hasStoredThemeChoice();
  const { data: profileTheme } = useQuery({
    queryKey: ['user-preferences', 'theme', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('theme')
        .eq('user_id', userId as string)
        .maybeSingle();
      if (error) throw error;
      return data?.theme ?? null;
    },
    enabled: !!userId && isNewDevice,
    staleTime: Infinity,
  });

  useEffect(() => {
    if ((profileTheme === 'dark' || profileTheme === 'light') && !hasStoredThemeChoice()) {
      setTheme(profileTheme);
    }
  }, [profileTheme, setTheme]);
}

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
  useProfileThemeOnNewDevice(user?.id);

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
