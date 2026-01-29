import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { CheckSquare } from 'lucide-react';

const ISMChecklistsPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="ISM Checklists"
      description="General ISM compliance checklists"
      icon={CheckSquare}
      sectionName="ISM Checklists"
      contentType="ISM compliance checklists, safety management forms, and audit preparation documents"
    />
  );
};

export default ISMChecklistsPage;
