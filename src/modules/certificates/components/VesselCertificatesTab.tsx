import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Plus, 
  FileText, 
  Ship, 
  Shield, 
  Settings, 
  Flame,
  Eye,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import { useCertificates, Certificate } from '@/modules/certificates/hooks/useCertificates';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { daysUntilExpiry, CERTIFICATE_STATUS } from '@/modules/certificates/constants';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface VesselCertificatesTabProps {
  onAddCertificate: () => void;
  onViewCertificate: (certificate: Certificate) => void;
}

const VesselCertificatesTab: React.FC<VesselCertificatesTabProps> = ({
  onAddCertificate,
  onViewCertificate,
}) => {
  const [selectedVessel, setSelectedVessel] = useState<string>('all');
  const { vessels } = useVessels();
  const { certificates, isLoading } = useCertificates({
    type: undefined,
    vesselId: selectedVessel !== 'all' ? selectedVessel : undefined,
  });

  // Filter to only vessel certificates (Statutory, Class, DOC with vessel_id)
  const vesselCertificates = certificates?.filter(c => 
    c.vessel_id && ['Statutory', 'Class', 'DOC'].includes(c.certificate_type)
  ) || [];

  // Group by category
  const statutoryCerts = vesselCertificates.filter(c => c.certificate_type === 'Statutory');
  const classCerts = vesselCertificates.filter(c => c.certificate_type === 'Class');

  const getStatusBadge = (status: string) => {
    const statusConfig = CERTIFICATE_STATUS[status as keyof typeof CERTIFICATE_STATUS] || CERTIFICATE_STATUS.Valid;
    return (
      <Badge className={cn(statusConfig.color, 'text-white')}>
        {statusConfig.label}
      </Badge>
    );
  };

  const renderCertificateRow = (certificate: Certificate) => {
    const days = daysUntilExpiry(certificate.expiry_date);
    return (
      <TableRow key={certificate.id}>
        <TableCell className="font-medium">{certificate.certificate_name}</TableCell>
        <TableCell>{certificate.certificate_number}</TableCell>
        <TableCell>{certificate.issuing_authority}</TableCell>
        <TableCell>{format(new Date(certificate.issue_date), 'dd MMM yyyy')}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            {format(new Date(certificate.expiry_date), 'dd MMM yyyy')}
            <span className={cn(
              'text-xs',
              days < 0 ? 'text-destructive' : days <= 30 ? 'text-yellow-600' : 'text-muted-foreground'
            )}>
              ({days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`})
            </span>
          </div>
        </TableCell>
        <TableCell>{getStatusBadge(certificate.status)}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => onViewCertificate(certificate)}>
              <Eye className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-6">
      {/* Vessel Selector */}
      <div className="flex items-center gap-4">
        <Select value={selectedVessel} onValueChange={setSelectedVessel}>
          <SelectTrigger className="w-[250px]">
            <Ship className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Select vessel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vessels</SelectItem>
            {vessels?.map(vessel => (
              <SelectItem key={vessel.id} value={vessel.id}>
                {vessel.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={onAddCertificate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Vessel Certificate
        </Button>
      </div>

      {vesselCertificates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No certificates added</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add your first certificate to start tracking vessel compliance.
            </p>
            <Button onClick={onAddCertificate}>
              <Plus className="w-4 h-4 mr-2" />
              Add Certificate
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" defaultValue={['statutory', 'class']} className="space-y-4">
          {/* Statutory Certificates */}
          <AccordionItem value="statutory" className="border rounded-lg bg-card">
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <span className="font-semibold">Statutory Certificates</span>
                <Badge variant="secondary" className="ml-2">{statutoryCerts.length}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              {statutoryCerts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Certificate Name</TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>Issuing Authority</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statutoryCerts.map(renderCertificateRow)}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-4">No statutory certificates added.</p>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Class Certificates */}
          <AccordionItem value="class" className="border rounded-lg bg-card">
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" />
                <span className="font-semibold">Class Certificates</span>
                <Badge variant="secondary" className="ml-2">{classCerts.length}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              {classCerts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Certificate Name</TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>Issuing Authority</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classCerts.map(renderCertificateRow)}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-4">No class certificates added.</p>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
};

export default VesselCertificatesTab;
