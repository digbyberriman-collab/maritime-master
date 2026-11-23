/**
 * Non-blocking strips under the top bar (spec §6.7, §5.6): the RBAC Retry
 * notice, in the vessel scope the module-settings Retry notice, and in every
 * scope the vessel-list Retry notice (D-04, D-76), which also covers the
 * vessel switcher and the command palette. The container is always mounted,
 * so screen readers already track the live regions inside it when a strip
 * appears.
 */
import React from 'react';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import RbacRetryNotice from './RbacRetryNotice';
import ModuleSettingsNotice from './ModuleSettingsNotice';
import VesselListNotice from './VesselListNotice';

const ShellNotices: React.FC = () => (
  // Shell chrome: never printed (DS23, D-36).
  <div data-testid={SHELL_TEST_IDS.shellNotices} className="min-w-0 print:hidden">
    <RbacRetryNotice />
    <ModuleSettingsNotice />
    <VesselListNotice />
  </div>
);

export default ShellNotices;
