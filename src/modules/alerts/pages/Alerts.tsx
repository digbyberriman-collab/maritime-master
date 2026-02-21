import React from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Alerts</h1>
            <p className="text-muted-foreground mt-1">Monitor and manage system alerts across your fleet</p>
          </div>
          <Button variant="outline">
            <CheckCircle className="h-4 w-4 mr-2" />
            Mark All Read
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Critical</p>
                  <p className="text-2xl font-bold text-destructive">2</p>
                </div>
                <AlertCircle className="h-8 w-8 text-destructive/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Warnings</p>
                  <p className="text-2xl font-bold text-orange-500">2</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-orange-500/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Info</p>
                  <p className="text-2xl font-bold text-blue-500">1</p>
                </div>
                <Info className="h-8 w-8 text-blue-500/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Resolved Today</p>
                  <p className="text-2xl font-bold text-green-500">3</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500/30" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alerts List */}
        <Card>
          <CardHeader>
            <CardTitle>Active Alerts</CardTitle>
            <CardDescription>Alerts requiring attention across all vessels</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all">
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
                        <Button variant="ghost" size="sm">View</Button>
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
                        <Button variant="ghost" size="sm">View</Button>
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
                        <Button variant="ghost" size="sm">View</Button>
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
                        <Button variant="ghost" size="sm">View</Button>
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
