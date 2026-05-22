import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';
import { Bell, AlertCircle, AlertTriangle, Info, CheckCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SAMPLE_ALERTS = [
  { id: '1', type: 'critical', title: 'SMC Certificate Expired', vessel: 'M/Y Aurora', module: 'Certificates', time: '2 hours ago', status: 'open' },
  { id: '2', type: 'warning', title: 'Drill Overdue: Fire Drill', vessel: 'M/Y Horizon', module: 'Drills', time: '1 day ago', status: 'open' },
  { id: '3', type: 'warning', title: 'Crew Certificate Expiring', vessel: 'M/Y Aurora', module: 'Crew Management', time: '2 days ago', status: 'acknowledged' },
  { id: '4', type: 'info', title: 'Document Review Due', vessel: 'M/Y Horizon', module: 'Documents', time: '3 days ago', status: 'open' },
  { id: '5', type: 'critical', title: 'CAPA Overdue', vessel: 'M/Y Aurora', module: 'CAPA', time: '5 days ago', status: 'escalated' },
];

const getAlertIcon = (type: string) => {
  switch (type) {
    case 'critical': return <AlertCircle className="h-5 w-5 text-destructive" />;
    case 'warning': return <AlertTriangle className="h-5 w-5 text-orange-500" />;
    case 'info': return <Info className="h-5 w-5 text-blue-500" />;
    default: return <Bell className="h-5 w-5" />;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'open': return <Badge variant="destructive">Open</Badge>;
    case 'acknowledged': return <Badge variant="secondary">Acknowledged</Badge>;
    case 'escalated': return <Badge className="bg-orange-500">Escalated</Badge>;
    case 'resolved': return <Badge className="bg-green-500">Resolved</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
};

const Alerts: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const alertTab = searchParams.get('tab') || 'all';
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Alerts"
          description="Monitor and manage system alerts across your fleet"
          actions={
            <Button variant="outline" onClick={() => toast.success('All alerts marked as read')}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Mark All Read
            </Button>
          }
        />

        <StatGrid>
          <StatCard
            label="Critical"
            value={2}
            tone="danger"
            icon={<AlertCircle className="h-5 w-5 text-destructive/60" />}
          />
          <StatCard
            label="Warnings"
            value={2}
            tone="warning"
            icon={<AlertTriangle className="h-5 w-5 text-orange-500/60" />}
          />
          <StatCard
            label="Info"
            value={1}
            tone="info"
            icon={<Info className="h-5 w-5 text-blue-500/60" />}
          />
          <StatCard
            label="Resolved Today"
            value={3}
            tone="success"
            icon={<CheckCircle className="h-5 w-5 text-green-500/60" />}
          />
        </StatGrid>

        {/* Alerts List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Alerts</CardTitle>
            <CardDescription>Alerts requiring attention across all vessels</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={alertTab} onValueChange={(v) => setSearchParams({ tab: v })}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="critical">Critical</TabsTrigger>
                <TabsTrigger value="warning">Warnings</TabsTrigger>
                <TabsTrigger value="info">Info</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="mt-4">
                <div className="space-y-3">
                  {SAMPLE_ALERTS.map((alert) => (
                    <div 
                      key={alert.id} 
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        {getAlertIcon(alert.type)}
                        <div>
                          <p className="font-medium">{alert.title}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{alert.vessel}</span>
                            <span>•</span>
                            <span>{alert.module}</span>
                            <span>•</span>
                            <Clock className="h-3 w-3" />
                            <span>{alert.time}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(alert.status)}
                        <Button variant="ghost" size="sm" onClick={() => toast.info(`Viewing alert: ${alert.title}`)}>View</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="critical" className="mt-4">
                <div className="space-y-3">
                  {SAMPLE_ALERTS.filter(a => a.type === 'critical').map((alert) => (
                    <div 
                      key={alert.id} 
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        {getAlertIcon(alert.type)}
                        <div>
                          <p className="font-medium">{alert.title}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{alert.vessel}</span>
                            <span>•</span>
                            <span>{alert.module}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(alert.status)}
                        <Button variant="ghost" size="sm" onClick={() => toast.info(`Viewing alert: ${alert.title}`)}>View</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="warning" className="mt-4">
                <div className="space-y-3">
                  {SAMPLE_ALERTS.filter(a => a.type === 'warning').map((alert) => (
                    <div 
                      key={alert.id} 
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        {getAlertIcon(alert.type)}
                        <div>
                          <p className="font-medium">{alert.title}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{alert.vessel}</span>
                            <span>•</span>
                            <span>{alert.module}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(alert.status)}
                        <Button variant="ghost" size="sm" onClick={() => toast.info(`Viewing alert: ${alert.title}`)}>View</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="info" className="mt-4">
                <div className="space-y-3">
                  {SAMPLE_ALERTS.filter(a => a.type === 'info').map((alert) => (
                    <div 
                      key={alert.id} 
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        {getAlertIcon(alert.type)}
                        <div>
                          <p className="font-medium">{alert.title}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{alert.vessel}</span>
                            <span>•</span>
                            <span>{alert.module}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(alert.status)}
                        <Button variant="ghost" size="sm" onClick={() => toast.info(`Viewing alert: ${alert.title}`)}>View</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Alerts;
