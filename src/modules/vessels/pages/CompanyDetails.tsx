import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  Globe, 
  Shield, 
  Users,
  FileText,
  Edit,
  Save,
  X,
  Plus,
  Trash2
} from 'lucide-react';

interface CompanyContact {
  id: string;
  name: string;
  position: string;
  phone: string;
  email: string;
  type: 'management' | 'dpa' | 'technical' | 'emergency';
}

interface CompanyInfo {
  name: string;
  registration_number: string;
  imo_company_id: string;
  address: string;
  city: string;
  country: string;
  postal_code: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  flag_state: string;
  classification_society: string;
  doc_number: string;
  doc_expiry: string;
  smc_issuing_authority: string;
}

// Mock data for demo
const mockCompanyInfo: CompanyInfo = {
  name: 'Atlantic Maritime Solutions Ltd.',
  registration_number: 'UK-MAR-123456',
  imo_company_id: 'IMO-9876543',
  address: '123 Maritime House, Harbor Street',
  city: 'Southampton',
  country: 'United Kingdom',
  postal_code: 'SO14 2AQ',
  phone: '+44 23 8012 3456',
  fax: '+44 23 8012 3457',
  email: 'info@atlanticmaritime.com',
  website: 'www.atlanticmaritime.com',
  flag_state: 'United Kingdom',
  classification_society: 'Lloyd\'s Register',
  doc_number: 'DOC-UK-2023-001',
  doc_expiry: '2025-12-31',
  smc_issuing_authority: 'MCA United Kingdom'
};

const mockContacts: CompanyContact[] = [
  {
    id: '1',
    name: 'James Morrison',
    position: 'Managing Director',
    phone: '+44 23 8012 3450',
    email: 'j.morrison@atlanticmaritime.com',
    type: 'management'
  },
  {
    id: '2',
    name: 'Sarah Chen',
    position: 'Designated Person Ashore (DPA)',
    phone: '+44 23 8012 3451',
    email: 's.chen@atlanticmaritime.com',
    type: 'dpa'
  },
  {
    id: '3',
    name: 'Michael Rodriguez',
    position: 'Fleet Manager',
    phone: '+44 23 8012 3452',
    email: 'm.rodriguez@atlanticmaritime.com',
    type: 'management'
  },
  {
    id: '4',
    name: 'Elena Petrov',
    position: 'Technical Manager',
    phone: '+44 23 8012 3453',
    email: 'e.petrov@atlanticmaritime.com',
    type: 'technical'
  },
  {
    id: '5',
    name: 'Robert Thompson',
    position: 'Emergency Response Coordinator',
    phone: '+44 23 8012 3454',
    email: 'emergency@atlanticmaritime.com',
    type: 'emergency'
  }
];

const CompanyDetails: React.FC = () => {
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(mockCompanyInfo);
  const [contacts, setContacts] = useState<CompanyContact[]>(mockContacts);
  const [isEditing, setIsEditing] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyInfo>(mockCompanyInfo);

  const getContactTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      management: 'bg-blue-100 text-blue-800 border-blue-200',
      dpa: 'bg-red-100 text-red-800 border-red-200',
      technical: 'bg-green-100 text-green-800 border-green-200',
      emergency: 'bg-orange-100 text-orange-800 border-orange-200',
    };
    return colors[type] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getContactTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      management: 'Management',
      dpa: 'DPA',
      technical: 'Technical',
      emergency: 'Emergency',
    };
    return labels[type] || type;
  };

  const handleSaveCompany = () => {
    setCompanyInfo(editingCompany);
    setIsEditing(false);
    // In real app, would save to backend
    console.log('Saving company info:', editingCompany);
  };

  const handleCancelEdit = () => {
    setEditingCompany(companyInfo);
    setIsEditing(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Company Details</h1>
            <p className="text-muted-foreground">
              Company information and management contacts
            </p>
          </div>
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} className="gap-2">
              <Edit className="w-4 h-4" />
              Edit Details
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button onClick={handleSaveCompany} className="gap-2">
                <Save className="w-4 h-4" />
                Save Changes
              </Button>
              <Button variant="outline" onClick={handleCancelEdit} className="gap-2">
                <X className="w-4 h-4" />
                Cancel
              </Button>
            </div>
          )}
        </div>

        <Tabs defaultValue="company" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="company">Company Info</TabsTrigger>
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
            <TabsTrigger value="certificates">Certificates</TabsTrigger>
            <TabsTrigger value="authorities">Authorities</TabsTrigger>
          </TabsList>

          <TabsContent value="company" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Basic Information */}
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Basic Information
                  </CardTitle>
                  <CardDescription>
                    Primary company identification and registration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="company_name">Company Name</Label>
                    {isEditing ? (
                      <Input
                        id="company_name"
                        value={editingCompany.name}
                        onChange={(e) => setEditingCompany({...editingCompany, name: e.target.value})}
                      />
                    ) : (
                      <p className="text-sm font-medium">{companyInfo.name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="registration_number">Registration Number</Label>
                    {isEditing ? (
                      <Input
                        id="registration_number"
                        value={editingCompany.registration_number}
                        onChange={(e) => setEditingCompany({...editingCompany, registration_number: e.target.value})}
                      />
                    ) : (
                      <p className="text-sm">{companyInfo.registration_number}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="imo_company_id">IMO Company ID</Label>
                    {isEditing ? (
                      <Input
                        id="imo_company_id"
                        value={editingCompany.imo_company_id}
                        onChange={(e) => setEditingCompany({...editingCompany, imo_company_id: e.target.value})}
                      />
                    ) : (
                      <p className="text-sm font-mono">{companyInfo.imo_company_id}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Contact Information */}
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="w-5 h-5" />
                    Contact Information
                  </CardTitle>
                  <CardDescription>
                    Primary contact details and website
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    {isEditing ? (
                      <Input
                        id="phone"
                        value={editingCompany.phone}
                        onChange={(e) => setEditingCompany({...editingCompany, phone: e.target.value})}
                      />
                    ) : (
                      <p className="text-sm">{companyInfo.phone}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    {isEditing ? (
                      <Input
                        id="email"
                        type="email"
                        value={editingCompany.email}
                        onChange={(e) => setEditingCompany({...editingCompany, email: e.target.value})}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <p className="text-sm">{companyInfo.email}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    {isEditing ? (
                      <Input
                        id="website"
                        value={editingCompany.website}
                        onChange={(e) => setEditingCompany({...editingCompany, website: e.target.value})}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                        <p className="text-sm text-blue-600 hover:underline cursor-pointer">{companyInfo.website}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Address */}
              <Card className="shadow-card md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    Address
                  </CardTitle>
                  <CardDescription>
                    Registered office address
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="address">Street Address</Label>
                    {isEditing ? (
                      <Textarea
                        id="address"
                        value={editingCompany.address}
                        onChange={(e) => setEditingCompany({...editingCompany, address: e.target.value})}
                        rows={2}
                      />
                    ) : (
                      <p className="text-sm">{companyInfo.address}</p>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      {isEditing ? (
                        <Input
                          id="city"
                          value={editingCompany.city}
                          onChange={(e) => setEditingCompany({...editingCompany, city: e.target.value})}
                        />
                      ) : (
                        <p className="text-sm">{companyInfo.city}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="postal_code">Postal Code</Label>
                      {isEditing ? (
                        <Input
                          id="postal_code"
                          value={editingCompany.postal_code}
                          onChange={(e) => setEditingCompany({...editingCompany, postal_code: e.target.value})}
                        />
                      ) : (
                        <p className="text-sm">{companyInfo.postal_code}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="country">Country</Label>
                      {isEditing ? (
                        <Input
                          id="country"
                          value={editingCompany.country}
                          onChange={(e) => setEditingCompany({...editingCompany, country: e.target.value})}
                        />
                      ) : (
                        <p className="text-sm">{companyInfo.country}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="contacts" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Management Contacts</h2>
                <p className="text-muted-foreground">Key personnel and their contact information</p>
              </div>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Contact
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {contacts.map((contact) => (
                <Card key={contact.id} className="shadow-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <Badge className={getContactTypeColor(contact.type)}>
                        {getContactTypeLabel(contact.type)}
                      </Badge>
                      <Button variant="ghost" size="sm" className="gap-2">
                        <Edit className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-semibold">{contact.name}</h3>
                        <p className="text-sm text-muted-foreground">{contact.position}</p>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{contact.phone}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-blue-600">{contact.email}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="certificates" className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-2">Company Certificates</h2>
              <p className="text-muted-foreground mb-6">Document of Compliance and related certificates</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Document of Compliance (DOC)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>DOC Number</Label>
                    <p className="text-sm font-mono">{companyInfo.doc_number}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Expiry Date</Label>
                    <p className="text-sm">{new Date(companyInfo.doc_expiry).toLocaleDateString()}</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Issuing Authority</Label>
                    <p className="text-sm">{companyInfo.smc_issuing_authority}</p>
                  </div>

                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    Valid
                  </Badge>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Safety Management Certificate
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Certificate Number</Label>
                    <p className="text-sm font-mono">SMC-UK-2023-001</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Expiry Date</Label>
                    <p className="text-sm">December 31, 2025</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Applicable to</Label>
                    <p className="text-sm">All company vessels</p>
                  </div>

                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    Valid
                  </Badge>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="authorities" className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-2">Regulatory Authorities</h2>
              <p className="text-muted-foreground mb-6">Flag state and classification society information</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Flag State
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Flag State</Label>
                    <p className="text-sm font-medium">{companyInfo.flag_state}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Maritime Authority</Label>
                    <p className="text-sm">Maritime and Coastguard Agency (MCA)</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Contact</Label>
                    <p className="text-sm">+44 203 817 2000</p>
                    <p className="text-sm text-blue-600">infoline@mcga.gov.uk</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Classification Society
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Classification Society</Label>
                    <p className="text-sm font-medium">{companyInfo.classification_society}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Class Notation</Label>
                    <p className="text-sm font-mono">✠100A1, General Cargo Ship, ✠LMC, UMS</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Surveyor Contact</Label>
                    <p className="text-sm">Southampton Office</p>
                    <p className="text-sm text-blue-600">southampton@lr.org</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default CompanyDetails;