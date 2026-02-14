import { Link } from 'react-router-dom';
import { ClipboardList, Plus, Filter } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMyApplications } from '@/hooks/useDevelopment';
import { CATEGORY_CONFIG, APPLICATION_STATUS_CONFIG, type DevCategory, type ApplicationStatus } from '@/lib/developmentConstants';
import { format } from 'date-fns';

export default function DevelopmentApplications() {
  const { data: applications = [], isLoading } = useMyApplications();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Applications</h1>
            <p className="text-muted-foreground">
              {applications.length} application{applications.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button asChild>
            <Link to="/development/catalogue">
              <Plus className="h-4 w-4 mr-2" /> New Application
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : applications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">No Applications Yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Browse the course catalogue to start your first application.
              </p>
              <Button asChild>
                <Link to="/development/catalogue">Browse Catalogue</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => {
              const catConfig = CATEGORY_CONFIG[app.category as DevCategory];
              const statusConfig = APPLICATION_STATUS_CONFIG[app.status as ApplicationStatus];

              return (
                <Card key={app.id} className="hover:border-primary/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium">{app.course_name}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className={`${catConfig.bgClass} ${catConfig.textClass} border-0 text-xs`}>
                            {catConfig.label}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${statusConfig?.color || ''}`}>
                            {statusConfig?.label || app.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{app.application_number}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        {app.estimated_total_usd != null && (
                          <p className="font-medium">${app.estimated_total_usd.toLocaleString()}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(app.created_at), 'dd MMM yyyy')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
