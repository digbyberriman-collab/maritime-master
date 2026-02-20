import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  FileText, Search, Edit, Trash2, Clock,
  Eye, Send, Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface DraftTemplate {
  id: string;
  name: string;
  description: string | null;
  form_type: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  created_by_name: string | null;
  field_count: number;
}

export default function DraftTemplates() {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<DraftTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!profile?.company_id) {
      setTemplates([]);
      setIsLoading(false);
      return;
    }
    loadDrafts();
  }, [profile?.company_id]);

  async function loadDrafts() {
    if (!profile?.company_id) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('form_templates')
        .select(`
          id,
          template_name,
          description,
          form_type,
          status,
          created_at,
          updated_at,
          form_schema,
          creator:profiles!form_templates_created_by_fkey(first_name, last_name)
        `)
        .eq('company_id', profile.company_id)
        .eq('status', 'DRAFT')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      setTemplates(
        (data || []).map((t: {
          id: string;
          template_name: string;
          description: string | null;
          form_type: string | null;
          status: string;
          created_at: string;
          updated_at: string;
          form_schema: { fields?: unknown[] } | null;
          creator: { first_name: string | null; last_name: string | null } | null;
        }) => ({
          id: t.id,
          name: t.template_name,
          description: t.description,
          form_type: t.form_type,
          status: t.status,
          created_at: t.created_at,
          updated_at: t.updated_at,
          created_by_name: [t.creator?.first_name, t.creator?.last_name].filter(Boolean).join(' ') || null,
          field_count: Array.isArray(t.form_schema?.fields) ? t.form_schema.fields.length : 0,
        })),
      );
    } catch (error) {
      console.error('Failed to load drafts:', error);
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePublish(id: string) {
    if (!profile?.user_id) return;

    try {
      const { error } = await supabase
        .from('form_templates')
        .update({
          status: 'PUBLISHED',
          published_at: new Date().toISOString(),
          published_by: profile.user_id,
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Template published');
      loadDrafts();
    } catch (error) {
      console.error('Failed to publish:', error);
      toast.error('Failed to publish template');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this draft?')) return;

    try {
      const { error } = await supabase
        .from('form_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Draft deleted');
      loadDrafts();
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error('Failed to delete draft');
    }
  }

  const filteredTemplates = templates.filter(t => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      t.name?.toLowerCase().includes(searchLower) ||
      t.description?.toLowerCase().includes(searchLower) ||
      t.form_type?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6" />
              Draft Templates
            </h1>
            <p className="text-muted-foreground">Templates in draft state awaiting review</p>
          </div>
          <Button asChild>
            <Link to="/ism/forms/templates/create">
              Create New Template
            </Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{templates.length}</p>
                  <p className="text-sm text-muted-foreground">Total Drafts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Edit className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {templates.filter(t => {
                      const updated = new Date(t.updated_at);
                      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                      return updated > dayAgo;
                    }).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Updated Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Send className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {templates.filter(t => t.field_count > 0).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Ready to Publish</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search drafts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Drafts List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No draft templates found</p>
              <Button asChild className="mt-4">
                <Link to="/ism/forms/templates/create">Create Your First Template</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredTemplates.map((template) => (
              <Card key={template.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-yellow-100 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-yellow-600" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{template.name}</p>
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                          Draft
                        </Badge>
                        {template.form_type && (
                          <Badge variant="secondary" className="text-xs">
                            {template.form_type}
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {template.description || 'No description'}
                      </p>
                      
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span>{template.field_count} fields</span>
                        <span>•</span>
                        <span>Updated {format(new Date(template.updated_at), 'MMM d, yyyy')}</span>
                        {template.created_by_name && (
                          <>
                            <span>•</span>
                            <span>By {template.created_by_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/ism/forms/templates/${template.id}`}>
                          <Eye className="w-4 h-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/ism/forms/templates/${template.id}/edit`}>
                          <Edit className="w-4 h-4" />
                        </Link>
                      </Button>
                      {template.field_count > 0 && (
                        <Button 
                          size="sm" 
                          onClick={() => handlePublish(template.id)}
                        >
                          <Send className="w-4 h-4 mr-1" />
                          Publish
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-600"
                        onClick={() => handleDelete(template.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
