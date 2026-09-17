import React from 'react';
import { Briefcase } from 'lucide-react';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';

const VacanciesPage: React.FC = () => (
  <div className="space-y-6">
    <HrisPageHeader icon={Briefcase} title="Vacancies" />
    <PlaceholderPage title="Vacancies" expectedRelease="In progress" showBackButton={false} />
  </div>
);

export default VacanciesPage;
