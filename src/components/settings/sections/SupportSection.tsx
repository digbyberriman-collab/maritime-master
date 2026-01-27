import React from 'react';
import { HelpCircle, MessageCircle, Book, ExternalLink, Mail, Phone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const SupportSection: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Support</h2>
        <p className="text-muted-foreground mt-1">Get help and find answers to your questions</p>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardContent className="flex flex-col items-center py-6">
            <div className="p-3 rounded-full bg-primary/10 mb-3">
              <Book className="h-6 w-6 text-primary" />
            </div>
            <p className="font-medium">Documentation</p>
            <p className="text-sm text-muted-foreground text-center mt-1">
              Browse user guides and tutorials
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardContent className="flex flex-col items-center py-6">
            <div className="p-3 rounded-full bg-primary/10 mb-3">
              <HelpCircle className="h-6 w-6 text-primary" />
            </div>
            <p className="font-medium">FAQ</p>
            <p className="text-sm text-muted-foreground text-center mt-1">
              Find answers to common questions
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardContent className="flex flex-col items-center py-6">
            <div className="p-3 rounded-full bg-primary/10 mb-3">
              <MessageCircle className="h-6 w-6 text-primary" />
            </div>
            <p className="font-medium">Live Chat</p>
            <p className="text-sm text-muted-foreground text-center mt-1">
              Chat with our support team
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Contact Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contact Support</CardTitle>
          <CardDescription>Send us a message and we'll get back to you within 24 hours</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" placeholder="What do you need help with?" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea 
              id="message" 
              placeholder="Describe your issue or question in detail..."
              rows={5}
            />
          </div>
          <Button>
            <Mail className="h-4 w-4 mr-2" />
            Send Message
          </Button>
        </CardContent>
      </Card>

      {/* Emergency Contact */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-lg text-destructive">Emergency Support</CardTitle>
          <CardDescription>For urgent issues requiring immediate assistance</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <Button variant="destructive">
            <Phone className="h-4 w-4 mr-2" />
            Call Emergency Line
          </Button>
          <div className="text-sm text-muted-foreground">
            Available 24/7 for critical system issues
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SupportSection;
