import { BarChart3, Users, DollarSign, BookOpen, TrendingUp } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';

export default function DevelopmentAdmin() {
  return (
    <DashboardLayout>
      <PlaceholderPage
        title="Crew Development Admin"
        description="Fleet-wide development overview, expense tracking, catalogue management, and reporting."
        features={[
          'Fleet-wide application pipeline',
          'YTD spend by category, vessel, and department',
          'Expense & reimbursement tracker',
          'Repayment / clawback calculator',
          'Course catalogue CRUD management',
          'Compliance & cert gap analysis',
          'CSV export and reporting',
        ]}
        icon={<BarChart3 className="w-8 h-8 text-primary" />}
        expectedRelease="Phase 2"
      />
    </DashboardLayout>
  );
}
