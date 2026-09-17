import React from 'react';
import { UserSearch } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const CandidatesPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={UserSearch} title="Candidates" />
    <PlaceholderPage title="Candidates" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default CandidatesPage;
