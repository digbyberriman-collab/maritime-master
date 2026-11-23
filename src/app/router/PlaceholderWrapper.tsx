import React from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

/**
 * The Coming Soon page a planned nav leaf opens (DECISIONS D-06). It renders
 * the shell itself, so it works as a top-level route; inside a scope layout
 * the shell is already mounted and DashboardLayout passes it through
 * (ShellContext, D-13). It names no release: the build programme's phase
 * names are internal, so a tenant sees what is coming and a "Tell us what
 * you need" link to Support (gap/10 W3) instead.
 *
 * The route tests find placeholder routes by this component's name
 * (src/test/router/routeHarness.ts), so keep it.
 */
const PlaceholderWrapper: React.FC<{
  title: string;
  description?: string;
  features?: string[];
  icon?: React.ReactNode;
}> = ({ title, description, features, icon }) => (
  <DashboardLayout>
    <PlaceholderPage title={title} description={description} features={features} icon={icon} />
  </DashboardLayout>
);

export default PlaceholderWrapper;
