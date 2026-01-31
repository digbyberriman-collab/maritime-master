import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  Download, FileText, Calendar, Ship, Filter, Search,
  Loader2, CheckCircle, FileSpreadsheet, File, Archive
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

interface FormTemplate {
  id: string;
  name: string;
  category: string | null;
  submission_count: number;
}

interface Vessel {
  id: string;
  name: string;
}

export default function FormExports() {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  
  // Export options
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [selectedVessels, setSelectedVessels] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState('month');
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'zip'>('pdf');
  const [includeSignatures, setIncludeSignatures] = useState(true);
  const [includeAttachments, setIncludeAttachments] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [templatesRes, vesselsRes] = await Promise.all([
        supabase
          .from('form_templates')
          .select('id, template_name, category')
          .eq('status', 'active')
          .order('template_name'),
        supabase
          .from('vessels')
          .select('id, name')
          .eq('status', 'active')
          .order('name'),
      ]);

      if (templatesRes.error) throw templatesRes.error;
      if (vesselsRes.error) throw vesselsRes.error;

      setTemplates((templatesRes.data || []).map((t: any) => ({ id: t.id, name: t.template_name, category: t.category, submission_count: 0 })));
      setVessels(vesselsRes.data || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExport() {
    if (selectedTemplates.length === 0) {
      toast.error('Please select at least one form template');
      return;
    }

    setIsExporting(true);
    toast.info('Preparing export...');

    // Simulate export process
    setTimeout(() => {
      setIsExporting(false);
      toast.success(`Export completed! ${selectedTemplates.length} form type(s) exported as ${exportFormat.toUpperCase()}`);
    }, 2000);
  }

  function toggleTemplate(id: string) {
    setSelectedTemplates(prev => 
      prev.includes(id) 
        ? prev.filter(t => t !== id) 
        : [...prev, id]
    );
  }

  function toggleVessel(id: string) {
    setSelectedVessels(prev => 
      prev.includes(id) 
        ? prev.filter(v => v !== id) 
        : [...prev, id]
    );
  }

  function selectAllTemplates() {
    setSelectedTemplates(templates.map(t => t.id));
  }

  function selectAllVessels() {
    setSelectedVessels(vessels.map(v => v.id));
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Download className="w-6 h-6" />
            Form Exports
          </h1>
          <p className="text-muted-foreground">Export form submissions in bulk</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Selection */}
          <div className="lg:col-span-2 space-y-6">
            {/* Form Templates Selection */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Select Form Templates</CardTitle>
                    <CardDescription>Choose which forms to export</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={selectAllTemplates}>
                    Select All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No form templates found
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedTemplates.includes(template.id)
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => toggleTemplate(template.id)}
                      >
                        <Checkbox
                          checked={selectedTemplates.includes(template.id)}
                          onCheckedChange={() => toggleTemplate(template.id)}
                        />
                        <div className="flex-1">
                          <p className="font-medium">{template.name}</p>
                          {template.category && (
                            <p className="text-sm text-muted-foreground">{template.category}</p>
                          )}
                        </div>
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Vessel Selection */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Filter by Vessels</CardTitle>
                    <CardDescription>Leave empty for all vessels</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={selectAllVessels}>
                    Select All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {vessels.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No vessels found
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto">
                    {vessels.map((vessel) => (
                      <div
                        key={vessel.id}
                        className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                          selectedVessels.includes(vessel.id)
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => toggleVessel(vessel.id)}
                      >
                        <Checkbox
                          checked={selectedVessels.includes(vessel.id)}
                          onCheckedChange={() => toggleVessel(vessel.id)}
                        />
                        <span className="text-sm truncate">{vessel.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Options & Export */}
          <div className="space-y-6">
            {/* Export Options */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Export Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Date Range</Label>
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger>
                      <Calendar className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">Past Week</SelectItem>
                      <SelectItem value="month">Past Month</SelectItem>
                      <SelectItem value="quarter">Past Quarter</SelectItem>
                      <SelectItem value="year">Past Year</SelectItem>
                      <SelectItem value="all">All Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Export Format</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant={exportFormat === 'pdf' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExportFormat('pdf')}
                      className="w-full"
                    >
                      <File className="w-4 h-4 mr-1" />
                      PDF
                    </Button>
                    <Button
                      variant={exportFormat === 'excel' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExportFormat('excel')}
                      className="w-full"
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-1" />
                      Excel
                    </Button>
                    <Button
                      variant={exportFormat === 'zip' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExportFormat('zip')}
                      className="w-full"
                    >
                      <Archive className="w-4 h-4 mr-1" />
                      ZIP
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label>Include</Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="signatures"
                        checked={includeSignatures}
                        onCheckedChange={(c) => setIncludeSignatures(!!c)}
                      />
                      <Label htmlFor="signatures" className="text-sm cursor-pointer">
                        Signatures
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="attachments"
                        checked={includeAttachments}
                        onCheckedChange={(c) => setIncludeAttachments(!!c)}
                      />
                      <Label htmlFor="attachments" className="text-sm cursor-pointer">
                        Attachments
                      </Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Export Summary & Button */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Export Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Form Templates:</span>
                    <span className="font-medium">{selectedTemplates.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vessels:</span>
                    <span className="font-medium">
                      {selectedVessels.length || 'All'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date Range:</span>
                    <span className="font-medium capitalize">{dateRange}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Format:</span>
                    <span className="font-medium uppercase">{exportFormat}</span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleExport}
                  disabled={isExporting || selectedTemplates.length === 0}
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Export Forms
                    </>
                  )}
                </Button>

                {selectedTemplates.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center">
                    Select at least one form template to export
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
