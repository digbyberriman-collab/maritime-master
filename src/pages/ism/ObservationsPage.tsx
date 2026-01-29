import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Eye } from 'lucide-react';

const ObservationsPage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Eye className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground">
              Observations
            </h1>
          </div>
          <p className="text-muted-foreground">
            Safety observations and near-miss reports
          </p>
        </div>

        {/* Placeholder Content */}
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Eye className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">
            Observations Module
          </h3>
          <p className="text-muted-foreground mb-4">
            This section will contain safety observations, near-miss reports, and improvement suggestions.
          </p>
          <button 
            disabled
            className="px-4 py-2 bg-muted text-muted-foreground rounded-lg cursor-not-allowed text-sm"
          >
            Log Observation (Coming Soon)
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ObservationsPage;
