/**
 * Non-blocking strips under the top bar (spec §6.7, §5.6): the RBAC Retry
 * notice and, in the vessel scope, the module-settings Retry notice. The
 * container is always mounted, so screen readers already track the live
 * regions inside it when a strip appears.
 */
import React from 'react';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import RbacRetryNotice from './RbacRetryNotice';
import ModuleSettingsNotice from './ModuleSettingsNotice';

const ShellNotices: React.FC = () => (
  // Shell chrome: never printed (DS23, D-36).
  <div data-testid={SHELL_TEST_IDS.shellNotices} className="min-w-0 print:hidden">
    <RbacRetryNotice />
    <ModuleSettingsNotice />
  </div>
);

export default ShellNotices;
