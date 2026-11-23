/**
 * The channel for a shell-owned state's own title (spec §7; see
 * `pageLocationOverride.ts`). AppShell renders it around `<main>`.
 */
import React from 'react';
import {
  OverrideSetterContext,
  OverrideValueContext,
  type OverrideSetter,
  type ResolvedPageLocationOverride,
} from './pageLocationOverride';

export const PageLocationOverrideProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entry, setEntry] = React.useState<{ token: symbol; value: ResolvedPageLocationOverride } | null>(null);
  const setter = React.useMemo<OverrideSetter>(
    () => ({
      set: (token, value) => setEntry({ token, value }),
      clear: (token) => setEntry((current) => (current?.token === token ? null : current)),
    }),
    [],
  );
  return (
    <OverrideSetterContext.Provider value={setter}>
      <OverrideValueContext.Provider value={entry?.value ?? null}>{children}</OverrideValueContext.Provider>
    </OverrideSetterContext.Provider>
  );
};

export default PageLocationOverrideProvider;
