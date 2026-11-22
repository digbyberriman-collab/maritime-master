import React from 'react';
import PageHeader from '@/shared/components/layout/PageHeader';
import { useBrandingContext } from '@/shared/contexts/BrandingContext';

interface FleetDashboardHeaderProps {
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * The fleet dashboard's page heading (Phase 1 S7; gap/10 IA17): the page's
 * only h1 through `PageHeader`, with the company's display name as the
 * eyebrow. It replaces the old gradient "Welcome" hero card.
 */
const FleetDashboardHeader: React.FC<FleetDashboardHeaderProps> = ({ description, actions }) => {
  const { clientDisplayName, companyName } = useBrandingContext();
  const eyebrow = clientDisplayName?.trim() || companyName?.trim() || 'Fleet';
  return <PageHeader title="Fleet dashboard" eyebrow={eyebrow} description={description} actions={actions} />;
};

export default FleetDashboardHeader;
