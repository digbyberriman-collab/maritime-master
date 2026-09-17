import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LifeBuoy, Mail, Phone, Send, Ticket } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const SUPPORT_EMAIL = 'SOS@INK.FISH';
const EMERGENCY_PHONE = '+1 954 355 1305';

const CATEGORIES = [
  { value: 'technical', label: 'Technical issue' },
  { value: 'data', label: 'Data correction' },
  { value: 'access', label: 'Access & permissions' },
  { value: 'feature', label: 'Feature request' },
  { value: 'training', label: 'Training request' },
  { value: 'other', label: 'Other' },
] as const;

const PRIORITIES = [
  { value: 'low', label: 'Low — whenever convenient' },
  { value: 'normal', label: 'Normal — this week' },
  { value: 'high', label: 'High — blocking my work' },
  { value: 'urgent', label: 'Urgent — vessel operations affected' },
] as const;

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

const statusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (status) {
    case 'open': return 'destructive';
    case 'in_progress': return 'default';
    case 'resolved': return 'secondary';
    default: return 'outline';
  }
};

const statusLabel = (status: string) =>
  status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

interface TicketRecord {
  id: string;
  reference: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
}

const SupportPage: React.FC = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<string>('technical');
  const [priority, setPriority] = useState<string>('normal');
  const [description, setDescription] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submittedReference, setSubmittedReference] = useState<string | null>(null);

  const companyId = profile?.company_id ?? null;

  const ticketsQuery = useQuery({
    queryKey: ['support-tickets', profile?.user_id ?? profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, reference, subject, category, priority, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as TicketRecord[];
    },
  });

  const submitTicket = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('Your account is not linked to a company yet.');
      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          company_id: companyId,
          reporter_id: profile.user_id,
          reporter_name:
            [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
            profile.email ||
            '',
          reporter_email: profile.email ?? '',
          reference: '',
          subject: subject.trim(),
          category,
          priority,
          description: description.trim(),
        })
        .select('reference')
        .single();
      if (error) throw error;
      return data.reference as string;
    },
    onSuccess: (reference) => {
      setSubmittedReference(reference);
      setSubject('');
      setCategory('technical');
      setPriority('normal');
      setDescription('');
      setValidationError(null);
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 4) {
      setValidationError('Please give your ticket a short subject (at least 4 characters).');
      return;
    }
    if (description.trim().length < 15) {
      setValidationError('Please describe the issue in a little more detail (at least 15 characters).');
      return;
    }
    setValidationError(null);
    submitTicket.mutate();
  };

  const fullName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || profile?.email || '';

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-8 space-y-6">
        <div>
          <Link
            to="/help/how-to-guides"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to How-to Guides
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-foreground flex items-center gap-2">
            <LifeBuoy className="h-6 w-6 text-primary" />
            Support
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Get in touch with the Inkfish team, or raise a ticket and we'll get back to you by email.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                Email support
              </CardTitle>
              <CardDescription>Best for general questions and follow-ups.</CardDescription>
            </CardHeader>
            <CardContent>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                  `Support request from ${fullName}`,
                )}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
              <p className="mt-1 text-xs text-muted-foreground">
                We aim to reply within one business day.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                24/7 emergency line
              </CardTitle>
              <CardDescription>
                For urgent incidents at sea only — not for software issues.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a
                href={`tel:${EMERGENCY_PHONE.replace(/\s/g, '')}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {EMERGENCY_PHONE}
              </a>
              <p className="mt-1 text-xs text-muted-foreground">Manned around the clock, every day.</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" />
              Submit a ticket
            </CardTitle>
            <CardDescription>
              Tell us what went wrong and we'll email you when it's resolved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submittedReference ? (
              <div className="rounded-md border border-border bg-muted/40 p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Ticket {submittedReference} submitted — thank you.
                </p>
                <p className="text-sm text-muted-foreground">
                  We've sent a confirmation to {profile?.email || 'your email'}. Our support team will
                  reply to you there.
                </p>
                <Button variant="outline" size="sm" onClick={() => setSubmittedReference(null)}>
                  Submit another ticket
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ticket-subject">Subject</Label>
                  <Input
                    id="ticket-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Rotation planner not saving blocks"
                    maxLength={150}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Priority</Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger>
                        <SelectValue placeholder="How urgent is it?" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ticket-description">What happened?</Label>
                  <Textarea
                    id="ticket-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the issue, which page you were on, and anything you already tried."
                    rows={5}
                    maxLength={5000}
                  />
                </div>

                {validationError && (
                  <p className="text-sm text-destructive">{validationError}</p>
                )}
                {submitTicket.isError && (
                  <p className="text-sm text-destructive">
                    Your ticket could not be submitted. Please email {SUPPORT_EMAIL} instead.
                  </p>
                )}

                <Button type="submit" disabled={submitTicket.isPending} className="gap-2">
                  <Send className="h-4 w-4" />
                  {submitTicket.isPending ? 'Submitting…' : 'Submit ticket'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {ticketsQuery.data && ticketsQuery.data.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your recent tickets</CardTitle>
              <CardDescription>Your last ten submissions and where they stand.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {ticketsQuery.data.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      <span className="text-muted-foreground font-normal">{t.reference}</span>{' '}
                      {t.subject}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[t.category] ?? t.category} ·{' '}
                      {new Date(t.created_at).toLocaleDateString(undefined, {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </p>
                  </div>
                  <Badge variant={statusVariant(t.status)} className="shrink-0">
                    {statusLabel(t.status)}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default SupportPage;
