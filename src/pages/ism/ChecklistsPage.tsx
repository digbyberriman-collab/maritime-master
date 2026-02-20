import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { 
  ClipboardList, 
  Plus, 
  Search, 
  FileCheck,
  Calendar,
  Clock,
  CheckCircle2,
  ListChecks
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const ChecklistsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('templates');
  
  const { data: templates = [], isLoading } = useFormTemplates();

  // Filter templates that are checklists (by category or naming)
  const checklistTemplates = templates.filter(
    t => t.category?.name?.toLowerCase().includes('checklist') || 
         t.template_name?.toLowerCase().includes('checklist') ||
         t.form_type === 'checklist'
  );

  const filteredTemplates = checklistTemplates.filter(
    t => searchQuery === '' || 
         t.template_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
         t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Stats
  const activeTemplates = checklistTemplates.filter(t => t.status === 'active').length;
  const totalTemplates = checklistTemplates.length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <ClipboardList className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Checklists</h1>
            </div>
            <p className="text-muted-foreground">
              Safety and operational checklists for vessel operations
            </p>
          </div>
          <Button onClick={() => navigate('/ism/forms/templates/create', { state: { preselectedType: 'CHECKLIST' } })}>
            <Plus className="w-4 h-4 mr-2" />
            Create Checklist
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Checklists</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeTemplates}</div>
              <p className="text-xs text-muted-foreground">In use</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Templates</CardTitle>
              <ListChecks className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalTemplates}</div>
              <p className="text-xs text-muted-foreground">All checklists</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
              <FileCheck className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">Submissions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
              <Calendar className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">Due this week</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="submissions">Recent Submissions</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="space-y-4">
            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search checklists..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Checklist Grid */}
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Loading checklists...</p>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                  <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold">No checklists found</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first checklist to get started
                  </p>
                   <Button onClick={() => navigate('/ism/forms/templates/create', { state: { preselectedType: 'CHECKLIST' } })}>
                     <Plus className="w-4 h-4 mr-2" />
                     Create Checklist
                   </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTemplates.map((template) => (
                  <Card key={template.id} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="h-5 w-5 text-primary" />
                          <CardTitle className="text-base">{template.template_name}</CardTitle>
                        </div>
                        <Badge variant={template.status === 'active' ? 'default' : 'secondary'}>
                          {template.status}
                        </Badge>
                      </div>
                      <CardDescription className="line-clamp-2">
                        {template.description || 'No description'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>Version {template.version || 1}</span>
                        <span>{template.created_at && format(new Date(template.created_at), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1">
                          Preview
                        </Button>
                        <Button size="sm" className="flex-1" onClick={(e) => { e.stopPropagation(); navigate(`/ism/forms/new?templateId=${template.id}`); }}>
                          Start
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="submissions">
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                <FileCheck className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold">No recent submissions</h3>
                <p className="text-muted-foreground">
                  Completed checklists will appear here
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scheduled">
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold">No scheduled checklists</h3>
                <p className="text-muted-foreground">
                  Set up recurring checklists for your operations
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ChecklistsPage;
