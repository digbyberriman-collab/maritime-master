import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  Plus, 
  Search, 
  ChevronDown,
  ChevronRight,
  User,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Eye,
  Pencil,
  RotateCcw,
  Download,
} from 'lucide-react';
import { useCertificates, Certificate } from '@/modules/certificates/hooks/useCertificates';
import { useCrew } from '@/modules/crew/hooks/useCrew';
import { daysUntilExpiry, CERTIFICATE_STATUS, CREW_CATEGORIES } from '@/modules/certificates/constants';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface CrewCertificatesTabProps {
  onAddCertificate: () => void;
  onViewCertificate: (certificate: Certificate) => void;
}

const CrewCertificatesTab: React.FC<CrewCertificatesTabProps> = ({
  onAddCertificate,
  onViewCertificate,
}) => {
  const [viewMode, setViewMode] = useState<'crew' | 'type'>('crew');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCrew, setExpandedCrew] = useState<string[]>([]);

  const { certificates } = useCertificates({ type: 'Crew' });
  const { crew: crewMembers } = useCrew();

  // Filter crew certificates
  const crewCertificates = certificates?.filter(c => c.certificate_type === 'Crew') || [];

  // Group by crew member
  const certsByCrewMember = crewMembers?.reduce((acc, member) => {
    const memberCerts = crewCertificates.filter(c => c.user_id === member.user_id);
    const hasExpired = memberCerts.some(c => c.status === 'Expired');
    const hasExpiringSoon = memberCerts.some(c => c.status === 'Expiring_Soon');
    
    acc[member.user_id] = {
      member,
      certificates: memberCerts,
      status: hasExpired ? 'expired' : hasExpiringSoon ? 'expiring' : 'valid',
    };
    return acc;
  }, {} as Record<string, { member: any; certificates: Certificate[]; status: string }>) || {};

  // Group by certificate type
  const certsByType = CREW_CATEGORIES.reduce((acc, cat) => {
    const typeCerts = crewCertificates.filter(c => c.certificate_category === cat.value);
    acc[cat.value] = {
      label: cat.label,
      certificates: typeCerts,
    };
    return acc;
  }, {} as Record<string, { label: string; certificates: Certificate[] }>);

  const toggleCrewExpanded = (userId: string) => {
    setExpandedCrew(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'expired':
        return <XCircle className="w-5 h-5 text-destructive" />;
      case 'expiring':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      default:
        return <CheckCircle className="w-5 h-5 text-green-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = CERTIFICATE_STATUS[status as keyof typeof CERTIFICATE_STATUS] || CERTIFICATE_STATUS.Valid;
    return (
      <Badge className={cn(statusConfig.color, 'text-white')}>
        {statusConfig.label}
      </Badge>
    );
  };

  // Filter crew members by search
  const filteredCrewMembers = Object.values(certsByCrewMember).filter(({ member }) => {
    if (!searchQuery) return true;
    const fullName = `${member.first_name} ${member.last_name}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search crew member..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={viewMode} onValueChange={(v) => setViewMode(v as 'crew' | 'type')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="View by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="crew">By Crew Member</SelectItem>
            <SelectItem value="type">By Certificate Type</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={onAddCertificate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Crew Certificate
        </Button>
      </div>

      {viewMode === 'crew' ? (
        /* By Crew Member View */
        <div className="space-y-2">
          {filteredCrewMembers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <User className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No crew members found</h3>
                <p className="text-muted-foreground text-center">
                  Add crew members to track their certificates.
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredCrewMembers.map(({ member, certificates: memberCerts, status }) => (
              <Collapsible
                key={member.user_id}
                open={expandedCrew.includes(member.user_id)}
                onOpenChange={() => toggleCrewExpanded(member.user_id)}
              >
                <Card>
                  <CollapsibleTrigger className="w-full">
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-4">
                        {expandedCrew.includes(member.user_id) ? (
                          <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        )}
                        <div className="flex items-center gap-3">
                          {getStatusIcon(status)}
                          <div className="text-left">
                            <p className="font-medium text-foreground">
                              {member.first_name} {member.last_name}
                            </p>
                            <p className="text-sm text-muted-foreground">{member.rank || 'Crew'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="secondary">{memberCerts.length} certificates</Badge>
                      </div>
                    </CardContent>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-6 pb-4">
                      {memberCerts.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Certificate</TableHead>
                              <TableHead>Number</TableHead>
                              <TableHead>Issue Date</TableHead>
                              <TableHead>Expiry Date</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {memberCerts.map(cert => {
                              const days = daysUntilExpiry(cert.expiry_date);
                              return (
                                <TableRow key={cert.id}>
                                  <TableCell className="font-medium">{cert.certificate_name}</TableCell>
                                  <TableCell>{cert.certificate_number}</TableCell>
                                  <TableCell>{format(new Date(cert.issue_date), 'dd MMM yyyy')}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {format(new Date(cert.expiry_date), 'dd MMM yyyy')}
                                      <span className={cn(
                                        'text-xs',
                                        days < 0 ? 'text-destructive' : days <= 30 ? 'text-yellow-600' : 'text-muted-foreground'
                                      )}>
                                        ({days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`})
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>{getStatusBadge(cert.status)}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      <Button variant="ghost" size="icon" onClick={() => onViewCertificate(cert)}>
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon">
                                        <Pencil className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-muted-foreground text-center py-4">
                          No certificates added for this crew member.
                        </p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))
          )}
        </div>
      ) : (
        /* By Certificate Type View */
        <div className="space-y-4">
          {Object.entries(certsByType).map(([type, { label, certificates: typeCerts }]) => (
            typeCerts.length > 0 && (
              <Card key={type}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center justify-between">
                    {label}
                    <Badge variant="secondary">{typeCerts.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Crew Member</TableHead>
                        <TableHead>Number</TableHead>
                        <TableHead>Issue Date</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {typeCerts.map(cert => {
                        const days = daysUntilExpiry(cert.expiry_date);
                        return (
                          <TableRow key={cert.id}>
                            <TableCell className="font-medium">
                              {cert.profiles ? `${cert.profiles.first_name} ${cert.profiles.last_name}` : 'Unknown'}
                            </TableCell>
                            <TableCell>{cert.certificate_number}</TableCell>
                            <TableCell>{format(new Date(cert.issue_date), 'dd MMM yyyy')}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {format(new Date(cert.expiry_date), 'dd MMM yyyy')}
                                <span className={cn(
                                  'text-xs',
                                  days < 0 ? 'text-destructive' : days <= 30 ? 'text-yellow-600' : 'text-muted-foreground'
                                )}>
                                  ({days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`})
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>{getStatusBadge(cert.status)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => onViewCertificate(cert)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )
          ))}
          
          {Object.values(certsByType).every(({ certificates }) => certificates.length === 0) && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <User className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No crew certificates</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Add crew certificates to start tracking compliance.
                </p>
                <Button onClick={onAddCertificate}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Certificate
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Export Button */}
      {crewCertificates.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export to Excel
          </Button>
        </div>
      )}
    </div>
  );
};

export default CrewCertificatesTab;
