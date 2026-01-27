import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useVessel } from '@/contexts/VesselContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Plus, Search, FileText, Copy, 
  Calendar, Clock, CheckCircle, Edit, Eye, 
  MoreHorizontal, Loader2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface FormTemplate {
  id: string;
  template_code: string;
  template_name: string;
  description: string | null;
  form_type: string;
  category_id: string | null;
  version: number;
  status: string;
  vessel_scope: string;
  initiation_mode: string;
  created_at: string;
}

const FORM_TYPES = [
  { value: 'CHECKLIST', label: 'Checklist', icon: '☑️' },
  { value: 'REPORT', label: 'Report', icon: '📋' },
  { value: 'MEETING_MINUTES', label: 'Meeting Minutes', icon: '📝' },
  { value: 'DRILL_REPORT', label: 'Drill Report', icon: '🚨' },
  { value: 'HANDOVER', label: 'Handover', icon: '🔄' },
  { value: 'AUDIT_FORM', label: 'Audit Form', icon: '🔍' },
  { value: 'RISK_ASSESSMENT', label: 'Risk Assessment', icon: '⚠️' },
  { value: 'INSPECTION', label: 'Inspection', icon: '👁️' },
  { value: 'PERMIT_TO_WORK', label: 'Permit to Work', icon: '🔒' }
];

const FormTemplates: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedVesselId } = useVessel();
  
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('PUBLISHED');

  useEffect(() => {
    loadTemplates();
  }, [selectedVesselId, filterType, filterStatus]);

  const loadTemplates = async () => {
    setLoading(true);
    
    try {
      let query = supabase
        .from('form_templates')
        .select('*')
        .order('template_name');

      if (filterStatus && filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      if (filterType && filterType !== 'all') {
        query = query.eq('form_type', filterType);
      }

      // Filter by vessel scope
      if (selectedVesselId) {
        query = query.or(`vessel_scope.eq.FLEET,vessel_ids.cs.{${selectedVesselId}}`);
      }

      const { data, error } = await query;

      if (!error && data) {
        setTemplates(data);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter(t =>
    t.template_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.template_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      DRAFT: 'secondary',
      UNDER_REVIEW: 'outline',
      PUBLISHED: 'default',
      ARCHIVED: 'destructive'
    };
    return (
      <Badge variant={variants[status] || 'secondary'}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getFormTypeInfo = (type: string) => {
    return FORM_TYPES.find(t => t.value === type) || { value: type, label: type, icon: '📄' };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Form Templates</h1>
            <p className="text-muted-foreground">Manage checklists, forms, and document templates</p>
          </div>
          <Button onClick={() => navigate('/ism/forms/templates/create')}>
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {FORM_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="PUBLISHED">Published</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Templates Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No Templates Found</h3>
              <p className="text-muted-foreground text-sm mt-1">Create your first template to get started</p>
              <Button 
                className="mt-4"
                onClick={() => navigate('/ism/forms/templates/create')}
              >
                Create Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map(template => {
              const typeInfo = getFormTypeInfo(template.form_type);
              
              return (
                <Card key={template.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{typeInfo.icon}</span>
                        <div>
                          <CardTitle className="text-base">{template.template_name}</CardTitle>
                          <CardDescription className="text-xs mt-0.5">{template.template_code}</CardDescription>
                        </div>
                      </div>
                      {getStatusBadge(template.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4">
                    {template.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {template.description}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-4">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        v{template.version}
                      </span>
                      <span>
                        {template.vessel_scope === 'FLEET' ? '🌐 Fleet-wide' : '🚢 Vessel'}
                      </span>
                      <span className="flex items-center gap-1">
                        {template.initiation_mode === 'SCHEDULED' ? (
                          <><Calendar className="h-3 w-3" /> Scheduled</>
                        ) : (
                          <><Clock className="h-3 w-3" /> Manual</>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/ism/forms/templates/${template.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/ism/forms/templates/${template.id}/edit`)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      
                      {template.status === 'PUBLISHED' && (
                        <Button
                          size="sm"
                          onClick={() => navigate(`/ism/forms/new?template=${template.id}`)}
                        >
                          Start Form
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default FormTemplates;
