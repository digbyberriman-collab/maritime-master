import React from 'react';
import { Link } from 'react-router-dom';
import { Award, ClipboardCheck, AlertCircle, ChevronRight, User } from 'lucide-react';
import { useDashboardStore } from '@/modules/dashboard/store/dashboardStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export const ComplianceSnapshot: React.FC = () => {
  const { summary, expiringCerts, upcomingAudits, isAllVessels } = useDashboardStore();

  const getDaysColor = (days: number) => {
    if (days <= 7) return 'bg-destructive text-destructive-foreground';
    if (days <= 30) return 'bg-orange-500 text-white';
    if (days <= 60) return 'bg-yellow-500 text-black';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <ClipboardCheck className="w-4 h-4 text-primary" />
          Compliance Snapshot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Link 
            to="/ism/non-conformities"
            className="flex flex-col items-center p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            <span className={cn(
              'text-2xl font-bold',
              (summary?.open_ncs_count || 0) > 0 && 'text-destructive'
            )}>
              {summary?.open_ncs_count || 0}
            </span>
            <span className="text-xs text-muted-foreground">Open NCs</span>
          </Link>
          <Link 
            to="/ism/corrective-actions"
            className="flex flex-col items-center p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            <span className={cn(
              'text-2xl font-bold',
              (summary?.open_capas_count || 0) > 0 && 'text-warning'
            )}>
              {summary?.open_capas_count || 0}
            </span>
            <span className="text-xs text-muted-foreground">Open CAPAs</span>
          </Link>
        </div>

        {/* Tabs for Certificates and Audits */}
        <Tabs defaultValue="certs" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="certs" className="text-xs">
              Expiring Certs ({expiringCerts.length})
            </TabsTrigger>
            <TabsTrigger value="audits" className="text-xs">
              Upcoming Audits ({upcomingAudits.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="certs" className="mt-3">
            {expiringCerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No certificates expiring in next 90 days
              </p>
            ) : (
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {expiringCerts.slice(0, 10).map(cert => (
                  <Link
                    key={cert.id}
                    to={cert.is_crew_cert ? '/certificates?tab=crew' : '/certificates?tab=vessel'}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {cert.is_crew_cert ? (
                        <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <Award className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{cert.certificate_name}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {cert.is_crew_cert && cert.crew_member_name && (
                            <span className="truncate">{cert.crew_member_name}</span>
                          )}
                          {isAllVessels && cert.vessel_name && (
                            <>
                              {cert.is_crew_cert && <span>•</span>}
                              <span className="truncate">{cert.vessel_name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge className={cn('ml-2 flex-shrink-0', getDaysColor(cert.days_until_expiry))}>
                      {cert.days_until_expiry}d
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
            {expiringCerts.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-2" asChild>
                <Link to="/certificates/alerts">
                  View All <ChevronRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            )}
          </TabsContent>

          <TabsContent value="audits" className="mt-3">
            {upcomingAudits.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No audits scheduled in next 90 days
              </p>
            ) : (
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {upcomingAudits.map(audit => (
                  <Link
                    key={audit.id}
                    to={`/ism/audits?id=${audit.id}`}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{audit.audit_number}</p>
                      <p className="text-xs text-muted-foreground truncate">{audit.audit_type}</p>
                      {isAllVessels && audit.vessel_name && (
                        <p className="text-xs text-muted-foreground truncate">{audit.vessel_name}</p>
                      )}
                    </div>
                    <Badge className={cn('ml-2 flex-shrink-0', getDaysColor(audit.days_until_due))}>
                      {audit.days_until_due}d
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
            {upcomingAudits.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-2" asChild>
                <Link to="/ism/audits">
                  View All <ChevronRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
