/**
 * Choose a theme from the shell (account menu Appearance radio, command
 * palette Theme actions; contract, BUILD-PLAN S1, S5).
 *
 * gap/10 W1: a theme picked in Appearance *or the account menu* applies at
 * once on this device (next-themes writes `storm-theme`) and is mirrored to
 * `user_preferences.theme`, so a new device starts with it (D-19 decides
 * when a stored value is adopted). This is the same behaviour as the
 * Appearance page's own `chooseTheme`; the shell and the palette call this
 * hook so neither writes the preference its own way. Density stays
 * device-only (`useDensity`, D-19).
 *
 * A failed mirror never reverts the device choice: it shows a notice and the
 * theme stays applied here (no fake success, no silent failure).
 */
import { useCallback } from 'react';
import { useTheme } from 'next-themes';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { isThemePreference, type ThemePreference } from '@/components/ui/theme-config';
import { notify } from '@/shared/lib/notify';

export interface ThemeChoice {
  /** The stored choice (`dark`, `light` or `system`); null before next-themes has mounted. */
  theme: ThemePreference | null;
  /** Apply `next` on this device now, then mirror it to the signed-in user's preferences. */
  choose: (next: ThemePreference) => Promise<void>;
}

export function useThemeChoice(): ThemeChoice {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const choose = useCallback(
    async (next: ThemePreference) => {
      setTheme(next);
      if (!userId) return;
      const { error } = await supabase
        .from('user_preferences')
        .upsert({ user_id: userId, theme: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) {
        notify.error(error, {
          title: 'Theme applied on this device only',
          fallback: 'It could not be saved to your profile. Try again later.',
        });
      }
    },
    [setTheme, userId],
  );

  return { theme: isThemePreference(theme) ? theme : null, choose };
}
