import { Phone, Mail, AlertTriangle, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { VesselEmergencyContacts } from '@/modules/emergency/types';

interface EmergencyContactCardProps {
  contacts: VesselEmergencyContacts;
  variant?: 'full' | 'compact' | 'widget';
  onViewFull?: () => void;
  showLogo?: boolean;
}

export function EmergencyContactCard({ 
  contacts, 
  variant = 'full',
  onViewFull,
  showLogo = true,
}: EmergencyContactCardProps) {
  
  // Compact widget variant for dashboard
  if (variant === 'widget') {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-destructive/10 rounded-md">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
            <span className="font-semibold text-sm">Emergency Contact 24/7</span>
          </div>
          
          <div className="space-y-2">
            <a 
              href={`tel:${contacts.primary_phone}`}
              className="flex items-center gap-2 text-lg font-bold text-destructive hover:underline"
            >
              <Phone className="w-4 h-4" />
              {contacts.primary_phone}
            </a>
            <a 
              href={`mailto:${contacts.primary_email}`}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:underline"
            >
              <Mail className="w-3 h-3" />
              {contacts.primary_email}
            </a>
          </div>
          
          {onViewFull && (
            <Button 
              variant="link" 
              size="sm" 
              className="mt-3 p-0 h-auto text-xs"
              onClick={onViewFull}
            >
              View Full Emergency Details
              <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Full or compact variant
  return (
    <Card className="border-destructive/30 overflow-hidden">
      <CardContent className={variant === 'full' ? 'p-8' : 'p-6'}>
        {/* Logo */}
        {showLogo && contacts.logo_url && (
          <div className="flex justify-center mb-6">
            <img 
              src={contacts.logo_url} 
              alt="Company Logo" 
              className="h-16 w-auto object-contain"
            />
          </div>
        )}

        {/* Emergency Heading */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <AlertTriangle className="w-6 h-6 text-destructive" />
            <h2 className="text-xl font-bold text-destructive uppercase tracking-wide">
              {contacts.emergency_heading}
            </h2>
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
        </div>

        {/* Primary Instruction */}
        <p className="text-center text-lg font-semibold mb-6 text-foreground">
          {contacts.primary_instruction}
        </p>

        {/* Primary Contact - HIGH VISIBILITY */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-8 mb-8">
          <a 
            href={`tel:${contacts.primary_phone}`}
            className="flex items-center gap-3 px-6 py-4 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors shadow-lg"
          >
            <div className="p-2 bg-destructive-foreground/20 rounded-full">
              <Phone className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold">{contacts.primary_phone}</span>
          </a>
          
          <span className="text-muted-foreground">or</span>
          
          <a 
            href={`mailto:${contacts.primary_email}`}
            className="flex items-center gap-3 px-6 py-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow-lg"
          >
            <div className="p-2 bg-primary-foreground/20 rounded-full">
              <Mail className="w-5 h-5" />
            </div>
            <span className="text-lg font-semibold">{contacts.primary_email}</span>
          </a>
        </div>

        {/* Secondary Instruction */}
        {contacts.secondary_instruction && contacts.team_members.length > 0 && (
          <>
            <p className="text-center text-muted-foreground mb-6">
              {contacts.secondary_instruction}
            </p>

            {/* Emergency Team Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Name</TableHead>
                    <TableHead className="font-semibold">Position</TableHead>
                    <TableHead className="font-semibold">Emergency Number</TableHead>
                    <TableHead className="font-semibold">Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.team_members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell>{member.position}</TableCell>
                      <TableCell>
                        <a 
                          href={`tel:${member.phone}`}
                          className="text-primary hover:underline font-medium"
                        >
                          {member.phone}
                        </a>
                      </TableCell>
                      <TableCell>
                        <a 
                          href={`mailto:${member.email}`}
                          className="text-primary hover:underline"
                        >
                          {member.email}
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {/* Revision Footer */}
        {variant === 'full' && (
          <div className="mt-8 pt-4 border-t flex justify-between items-center text-sm text-muted-foreground">
            <span>
              Rev. {contacts.revision_number} — {new Date(contacts.revision_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            {contacts.updated_by_name && (
              <span>Last updated by {contacts.updated_by_name}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
