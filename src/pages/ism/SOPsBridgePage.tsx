import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { Navigation } from 'lucide-react';

const SOPsBridgePage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Bridge SOPs"
      description="Standard operating procedures for bridge department"
      icon={Navigation}
      sectionName="Bridge SOPs"
      contentType="navigation procedures, watchkeeping protocols, and bridge operations documentation"
    />
  );
};

export default SOPsBridgePage;
