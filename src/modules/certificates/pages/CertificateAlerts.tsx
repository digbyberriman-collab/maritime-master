import React, { useState } from 'react';
import { toast } from 'sonner';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  AlertTriangle, 
  XCircle, 
  Clock,
  CheckCircle,
  Bell,
  BellOff,
  RotateCcw,
  Archive,
  Search,
  Filter,
} from 'lucide-react';
import { useCertificates, Certificate } from '@/modules/certificates/hooks/useCertificates';
import { daysUntilExpiry } from '@/modules/certificates/constants';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const CertificateAlerts: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { certificates, isLoading } = useCertificates();

  // Get expired and expiring certificates
  const expiredCerts = certificates?.filter(c => c.status === 'Expired') || [];
  const expiringCerts = certificates?.filter(c => c.status === 'Expiring_Soon') || [];

  // Group expiring by timeframe
  const expiring7Days = expiringCerts.filter(c => daysUntilExpiry(c.expiry_date) <= 7);
  const expiring30Days = expiringCerts.filter(c => {
    const days = daysUntilExpiry(c.expiry_date);
    return days > 7 && days <= 30;
  });
  const expiring60Days = expiringCerts.filter(c => {
    const days = daysUntilExpiry(c.expiry_date);
    return days > 30 && days <= 60;
  });
  const expiring90Days = expiringCerts.filter(c => {
    const days = daysUntilExpiry(c.expiry_date);
    return days > 60 && days <= 90;
  });

  // Filter certificates based on search and status
  const filterCertificates = (certs: Certificate[]) => {
    return certs.filter(cert => {
      const matchesSearch = !searchQuery || 
        cert.certificate_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cert.certificate_number.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  };

  const renderCertificateRow = (cert: Certificate) => {
    const days = daysUntilExpiry(cert.expiry_date);
    const isExpired = days < 0;
    
    return (
      <TableRow key={cert.id}>
        <TableCell className="font-medium">{cert.certificate_name}</TableCell>
        <TableCell>{cert.certificate_number}</TableCell>
        <TableCell>
          {cert.vessels?.name || cert.profiles ? 
            `${cert.profiles?.first_name || ''} ${cert.profiles?.last_name || ''}`.trim() || 
            cert.vessels?.name : 
            'Company'
          }
        </TableCell>
        <TableCell>{format(new Date(cert.expiry_date), 'dd MMM yyyy')}</TableCell>
        <TableCell>
          <Badge 
            variant="outline"
            className={cn(
              isExpired 
                ? 'text-destructive border-destructive bg-destructive/10' 
                : days <= 7 
                  ? 'text-red-600 border-red-600 bg-red-50'
                  : days <= 30 
                    ? 'text-yellow-600 border-yellow-600 bg-yellow-50'
                    : 'text-muted-foreground'
            )}
          >
            {isExpired 
              ? `${Math.abs(days)} days overdue` 
              : `${days} days left`
            }
          </Badge>
        </TableCell>
        <TableCell>
          <Badge variant="secondary">Not Started</Badge>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" title="Start Renewal" onClick={() => toast.info(`Starting renewal for ${cert.certificate_name}`)}>
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" title="Snooze Alert" onClick={() => toast.info(`Alert snoozed for ${cert.certificate_name}`)}>
              <BellOff className="w-4 h-4" />
            </Button>
            {isExpired && (
              <Button variant="ghost" size="icon" title="Archive" onClick={() => toast.info(`Archived alert for ${cert.certificate_name}`)}>
                <Archive className="w-4 h-4" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const renderSection = (title: string, icon: React.ReactNode, certs: Certificate[], variant: 'expired' | 'warning') => {
    const filtered = filterCertificates(certs);
    if (filtered.length === 0) return null;

    return (
      <Card className={cn(
        variant === 'expired' && 'border-destructive/50',
        variant === 'warning' && 'border-yellow-500/50'
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-lg">{title}</CardTitle>
            <Badge variant={variant === 'expired' ? 'destructive' : 'secondary'}>
              {filtered.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Certificate</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Holder</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Renewal Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(renderCertificateRow)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Certificate Alerts</h1>
          <p className="text-muted-foreground">Track and manage certificate expiries and renewals</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Expired</p>
                  <p className="text-3xl font-bold text-destructive">{expiredCerts.length}</p>
                </div>
                <XCircle className="w-8 h-8 text-destructive" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-500/50 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Within 7 Days</p>
                  <p className="text-3xl font-bold text-red-600">{expiring7Days.length}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-500/50 bg-yellow-50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Within 30 Days</p>
                  <p className="text-3xl font-bold text-yellow-600">{expiring30Days.length}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Within 90 Days</p>
                  <p className="text-3xl font-bold text-foreground">
                    {expiring60Days.length + expiring90Days.length}
                  </p>
                </div>
                <Bell className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search certificates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Alerts</SelectItem>
              <SelectItem value="expired">Expired Only</SelectItem>
              <SelectItem value="expiring">Expiring Soon</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Alert Sections */}
        <div className="space-y-6">
          {/* Expired */}
          {(statusFilter === 'all' || statusFilter === 'expired') && 
            renderSection(
              'URGENT - Expired Certificates',
              <XCircle className="w-5 h-5 text-destructive" />,
              expiredCerts,
              'expired'
            )
          }

          {/* Expiring within 7 days */}
          {(statusFilter === 'all' || statusFilter === 'expiring') && 
            renderSection(
              'Expiring in 7 Days',
              <AlertTriangle className="w-5 h-5 text-red-600" />,
              expiring7Days,
              'warning'
            )
          }

          {/* Expiring within 30 days */}
          {(statusFilter === 'all' || statusFilter === 'expiring') && 
            renderSection(
              'Expiring in 30 Days',
              <Clock className="w-5 h-5 text-yellow-600" />,
              expiring30Days,
              'warning'
            )
          }

          {/* Expiring within 60 days */}
          {(statusFilter === 'all' || statusFilter === 'expiring') && 
            renderSection(
              'Expiring in 60 Days',
              <Clock className="w-5 h-5 text-muted-foreground" />,
              expiring60Days,
              'warning'
            )
          }

          {/* Expiring within 90 days */}
          {(statusFilter === 'all' || statusFilter === 'expiring') && 
            renderSection(
              'Expiring in 90 Days',
              <Bell className="w-5 h-5 text-muted-foreground" />,
              expiring90Days,
              'warning'
            )
          }

          {/* No alerts */}
          {expiredCerts.length === 0 && expiringCerts.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="w-12 h-12 text-green-600 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">All Clear!</h3>
                <p className="text-muted-foreground text-center">
                  No certificates are expired or expiring soon.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CertificateAlerts;
