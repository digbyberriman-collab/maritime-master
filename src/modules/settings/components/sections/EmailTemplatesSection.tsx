import React, { useState } from 'react';
import { Mail, Edit, Eye, Send, History, Copy, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/shared/hooks/use-toast';
import { format } from 'date-fns';

interface EmailTemplate {
  id: string;
  code: string;
  name: string;
  subject: string;
  body: string;
  updatedAt: string;
  version: number;
}

const TEMPLATES: EmailTemplate[] = [
  {
    id: '1',
    code: 'crew_invitation',
    name: 'Crew Invitation',
    subject: 'Welcome to STORM - {{vessel_name}}',
    body: `<h1>Welcome aboard, {{first_name}}!</h1>
<p>You have been invited to join {{vessel_name}} as part of the crew managed through STORM.</p>
<p>Please click the link below to complete your registration:</p>
<p><a href="{{action_link}}">Accept Invitation</a></p>
<p>Best regards,<br>{{company_name}}</p>`,
    updatedAt: '2026-01-20T10:30:00Z',
    version: 3
  },
  {
    id: '2',
    code: 'password_reset',
    name: 'Password Reset',
    subject: 'Reset your STORM password',
    body: `<h1>Password Reset Request</h1>
<p>Hello {{first_name}},</p>
<p>We received a request to reset your password. Click the link below to set a new password:</p>
<p><a href="{{action_link}}">Reset Password</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>
<p>Best regards,<br>STORM Team</p>`,
    updatedAt: '2026-01-15T14:20:00Z',
    version: 2
  },
  {
    id: '3',
    code: 'flight_request',
    name: 'Flight Request to Agent',
    subject: 'New Flight Request - {{crew_name}} - {{vessel_name}}',
    body: `<h1>Flight Request</h1>
<p>A new flight request has been submitted:</p>
<ul>
  <li><strong>Crew Member:</strong> {{crew_name}}</li>
  <li><strong>Vessel:</strong> {{vessel_name}}</li>
  <li><strong>Travel Date:</strong> {{travel_date}}</li>
  <li><strong>From:</strong> {{origin}}</li>
  <li><strong>To:</strong> {{destination}}</li>
</ul>
<p>Please review and book the appropriate flights.</p>
<p><a href="{{action_link}}">View in Portal</a></p>`,
    updatedAt: '2026-01-10T09:15:00Z',
    version: 5
  },
  {
    id: '4',
    code: 'cert_expiry',
    name: 'Certificate Expiry Reminder',
    subject: '{{cert_name}} expiring in {{days_remaining}} days',
    body: `<h1>Certificate Expiry Reminder</h1>
<p>Hello {{first_name}},</p>
<p>This is a reminder that the following certificate is expiring soon:</p>
<ul>
  <li><strong>Certificate:</strong> {{cert_name}}</li>
  <li><strong>Expiry Date:</strong> {{expiry_date}}</li>
  <li><strong>Days Remaining:</strong> {{days_remaining}}</li>
</ul>
<p>Please arrange for renewal as soon as possible.</p>
<p><a href="{{action_link}}">View Certificate</a></p>`,
    updatedAt: '2026-01-05T16:45:00Z',
    version: 4
  }
];

const AVAILABLE_VARIABLES = [
  { name: '{{first_name}}', description: 'Recipient first name' },
  { name: '{{last_name}}', description: 'Recipient last name' },
  { name: '{{vessel_name}}', description: 'Vessel name' },
  { name: '{{company_name}}', description: 'Company name' },
  { name: '{{cert_name}}', description: 'Certificate name' },
  { name: '{{expiry_date}}', description: 'Expiry date' },
  { name: '{{days_remaining}}', description: 'Days until expiry' },
  { name: '{{action_link}}', description: 'Action URL' },
  { name: '{{crew_name}}', description: 'Crew member name' },
  { name: '{{travel_date}}', description: 'Travel date' },
  { name: '{{origin}}', description: 'Origin location' },
  { name: '{{destination}}', description: 'Destination location' }
];

const SAMPLE_DATA = {
  first_name: 'John',
  last_name: 'Smith',
  vessel_name: 'M/Y Aurora',
  company_name: 'STORM Maritime',
  cert_name: 'STCW Basic Safety',
  expiry_date: 'March 15, 2026',
  days_remaining: '30',
  action_link: 'https://storm.example.com/action',
  crew_name: 'John Smith',
  travel_date: 'February 1, 2026',
  origin: 'London Heathrow',
  destination: 'Monaco'
};

const EmailTemplatesSection: React.FC = () => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>(TEMPLATES);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [editForm, setEditForm] = useState({ subject: '', body: '' });
  const [previewMode, setPreviewMode] = useState(false);
  const [sending, setSending] = useState(false);

  const openEditor = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setEditForm({ subject: template.subject, body: template.body });
    setPreviewMode(false);
  };

  const renderPreview = (content: string) => {
    let rendered = content;
    Object.entries(SAMPLE_DATA).forEach(([key, value]) => {
      rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });
    return rendered;
  };

  const insertVariable = (variable: string) => {
    const textarea = document.getElementById('template-body') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newBody = editForm.body.slice(0, start) + variable + editForm.body.slice(end);
      setEditForm(prev => ({ ...prev, body: newBody }));
    }
  };

  const handleSave = () => {
    if (!editingTemplate) return;
    
    setTemplates(prev => prev.map(t => 
      t.id === editingTemplate.id 
        ? { 
            ...t, 
            subject: editForm.subject, 
            body: editForm.body,
            updatedAt: new Date().toISOString(),
            version: t.version + 1
          }
        : t
    ));
    
    setEditingTemplate(null);
    toast({
      title: 'Template Saved',
      description: 'Email template has been updated successfully.',
    });
  };

  const handleTestSend = async () => {
    setSending(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setSending(false);
    toast({
      title: 'Test Email Sent',
      description: 'A test email has been sent to your admin email address.',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Email Templates</h2>
        <p className="text-muted-foreground mt-1">Customize email templates for notifications</p>
      </div>

      {/* Templates List */}
      <div className="space-y-4">
        {templates.map(template => (
          <Card key={template.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{template.name}</h4>
                      <Badge variant="secondary" className="text-xs">
                        v{template.version}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground font-mono">{template.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-sm">
                    <p className="text-muted-foreground truncate max-w-xs">
                      Subject: {template.subject}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center justify-end gap-1 mt-1">
                      <Clock className="h-3 w-3" />
                      Updated {format(new Date(template.updatedAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openEditor(template)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Template Editor Modal */}
      <Dialog open={!!editingTemplate} onOpenChange={() => setEditingTemplate(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Template: {editingTemplate?.name}</DialogTitle>
            <DialogDescription>
              Modify the email template and preview with sample data.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="edit" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="w-fit">
              <TabsTrigger value="edit">
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </TabsTrigger>
              <TabsTrigger value="preview">
                <Eye className="h-4 w-4 mr-1" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="variables">
                <Copy className="h-4 w-4 mr-1" />
                Variables
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="edit" className="flex-1 overflow-auto space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="template-subject">Subject</Label>
                <Input
                  id="template-subject"
                  value={editForm.subject}
                  onChange={(e) => setEditForm(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="Email subject line"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="template-body">Body (HTML)</Label>
                <Textarea
                  id="template-body"
                  value={editForm.body}
                  onChange={(e) => setEditForm(prev => ({ ...prev, body: e.target.value }))}
                  placeholder="Email body content..."
                  rows={15}
                  className="font-mono text-sm"
                />
              </div>
            </TabsContent>
            
            <TabsContent value="preview" className="flex-1 overflow-auto mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Subject:</CardDescription>
                  <CardTitle className="text-base">{renderPreview(editForm.subject)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div 
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderPreview(editForm.body) }}
                  />
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="variables" className="flex-1 overflow-auto mt-4">
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_VARIABLES.map(variable => (
                  <button
                    key={variable.name}
                    onClick={() => insertVariable(variable.name)}
                    className="p-3 border rounded-lg text-left hover:bg-muted transition-colors"
                  >
                    <code className="text-sm font-medium text-primary">{variable.name}</code>
                    <p className="text-xs text-muted-foreground mt-1">{variable.description}</p>
                  </button>
                ))}
              </div>
            </TabsContent>
          </Tabs>
          
          <DialogFooter className="flex gap-2 sm:gap-0 mt-4">
            <Button 
              variant="outline" 
              onClick={handleTestSend}
              disabled={sending}
            >
              {sending ? (
                <>Sending...</>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Test
                </>
              )}
            </Button>
            <Button onClick={handleSave}>
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailTemplatesSection;
