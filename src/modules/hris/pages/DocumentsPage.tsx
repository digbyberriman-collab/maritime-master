import React from 'react';
import { FileText } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const DocumentsPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={FileText} title="Documents & Certificates" />
    <PlaceholderPage title="Documents & Certificates" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default DocumentsPage;
