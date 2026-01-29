import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { FileText } from 'lucide-react';

const MiscellaneousFormsPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Miscellaneous ISM Forms"
      description="Additional forms that don't fit other categories"
      icon={FileText}
      sectionName="Miscellaneous Forms"
      contentType="general purpose forms, miscellaneous documentation, and uncategorized ISM templates"
    />
  );
};

export default MiscellaneousFormsPage;
