import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Building2, Upload, CheckCircle2, Calendar, Users, Ship, Save } from 'lucide-react';

const AccountDetailsPage: React.FC = () => {
  const [logo, setLogo] = useState<string | null>(null);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl">
        <PageHeader
          eyebrow="Administration"
          title="Account Details"
          description="Fleet identity, account holder and subscription status"
          actions={<Button><Save className="w-4 h-4 mr-2" />Save Changes</Button>}
        />

        <StatGrid cols={4}>
          <StatCard
            label="Account Status"
            value="Active"
            tone="success"
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          />
          <StatCard
            label="Vessels"
            value="7 / 10"
            icon={<Ship className="w-4 h-4 text-primary" />}
          />
          <StatCard
            label="Active Users"
            value="84 / 120"
            icon={<Users className="w-4 h-4 text-primary" />}
          />
          <StatCard
            label="Renews"
            value="12 Mar 2027"
            icon={<Calendar className="w-4 h-4 text-muted-foreground" />}
          />
        </StatGrid>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fleet Logo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center bg-muted/20 p-6">
                {logo ? (
                  <img src={logo} alt="Fleet logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <>
                    <Building2 className="w-12 h-12 text-muted-foreground mb-3" />
                    <p className="text-sm font-medium text-center">Upload fleet logo</p>
                    <p className="text-xs text-muted-foreground text-center mt-1">PNG/SVG · Square · Max 2 MB</p>
                  </>
                )}
              </div>
              <label className="block mt-3">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setLogo(URL.createObjectURL(f));
                }} />
                <Button variant="outline" className="w-full" asChild>
                  <span><Upload className="w-4 h-4 mr-2" />Choose file</span>
                </Button>
              </label>
              <p className="text-xs text-muted-foreground mt-3">Used on PDF reports, dashboards and crew app branding.</p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Fleet Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Fleet / Company Name</Label>
                <Input defaultValue="Storm Maritime Group" />
              </div>
              <div>
                <Label>Trading Name</Label>
                <Input defaultValue="Storm Yachts" />
              </div>
              <div>
                <Label>Registration Number</Label>
                <Input defaultValue="GB-2018-MAR-04421" />
              </div>
              <div>
                <Label>Country of Registration</Label>
                <Select defaultValue="gb">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gb">United Kingdom</SelectItem>
                    <SelectItem value="ky">Cayman Islands</SelectItem>
                    <SelectItem value="mt">Malta</SelectItem>
                    <SelectItem value="mh">Marshall Islands</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>VAT / Tax ID</Label>
                <Input defaultValue="GB 421 5599 87" />
              </div>
              <div className="col-span-2">
                <Label>Registered Address</Label>
                <Textarea rows={3} defaultValue="14 Harbour Quay, Sovereign House&#10;Plymouth PL1 3DR&#10;United Kingdom" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Account Holder</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label>Full Name</Label>
              <Input defaultValue="James Marsden" />
            </div>
            <div>
              <Label>Role / Position</Label>
              <Input defaultValue="Designated Person Ashore (DPA)" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" defaultValue="j.marsden@stormyachts.com" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input defaultValue="+44 1752 552 110" />
            </div>
            <Separator className="col-span-2" />
            <div className="col-span-2 flex items-center justify-between p-3 rounded-md border border-border bg-muted/20">
              <div>
                <p className="text-sm font-medium">Billing contact same as account holder</p>
                <p className="text-xs text-muted-foreground">Invoices and renewal notices will be sent to this address</p>
              </div>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/40">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Yes
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Subscription</CardTitle>
              <Badge className="bg-primary/15 text-primary border-primary/30">Storm Fleet — Pro</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
              <Meta label="Plan" value="Storm Fleet Pro" />
              <Meta label="Billing Cycle" value="Annual" />
              <Meta label="Next Renewal" value="12 Mar 2027" />
              <Meta label="Seats" value="84 of 120" />
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm">View Invoices</Button>
              <Button variant="outline" size="sm">Manage Plan</Button>
              <Button variant="outline" size="sm">Update Payment Method</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

const Meta: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
    <p className="font-medium mt-0.5">{value}</p>
  </div>
);

export default AccountDetailsPage;