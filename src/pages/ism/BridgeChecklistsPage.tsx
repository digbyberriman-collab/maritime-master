import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { Navigation } from 'lucide-react';

const BridgeChecklistsPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Bridge Checklists"
      description="Bridge operational and navigation checklists"
      icon={Navigation}
      sectionName="Bridge Checklists"
      contentType="bridge watchkeeping checklists, pre-departure checks, navigation safety forms, and passage planning documents"
    />
  );
};

export default BridgeChecklistsPage;
