import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  Layers, Search, Filter, Plus, FolderOpen, FileImage,
  Eye, Download, Loader2, Ship, ZoomIn, Grid, List
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';

interface Drawing {
  id: string;
  title: string;
  drawing_number: string | null;
  category: string;
  vessel_id: string | null;
  vessel_name: string | null;
  revision: string | null;
  file_type: string;
  status: string;
  updated_at: string;
}

const categories = [
  { value: 'ga_plans', label: 'General Arrangement Plans' },
  { value: 'safety_plans', label: 'Safety Plans' },
  { value: 'fire_plans', label: 'Fire Control Plans' },
  { value: 'stability', label: 'Stability Plans' },
  { value: 'piping', label: 'Piping Diagrams' },
  { value: 'electrical', label: 'Electrical Diagrams' },
  { value: 'hvac', label: 'HVAC Diagrams' },
  { value: 'structural', label: 'Structural Drawings' },
  { value: 'machinery', label: 'Machinery Arrangements' },
];

export default function Drawings() {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [vessels, setVessels] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [vesselFilter, setVesselFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  useEffect(() => {
    loadData();
  }, [categoryFilter, vesselFilter]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [drawingsRes, vesselsRes] = await Promise.all([
        supabase
          .from('documents')
          .select('*, vessel:vessels(name)')
          .eq('document_type', 'drawing')
          .order('title', { ascending: true }),
        supabase
          .from('vessels')
          .select('id, name')
          .eq('status', 'active')
          .order('name'),
      ]);

      if (drawingsRes.error) throw drawingsRes.error;
      if (vesselsRes.error) throw vesselsRes.error;

      setVessels(vesselsRes.data || []);
      setDrawings((drawingsRes.data || []).map(d => ({
        ...d,
        vessel_name: (d as any).vessel?.name || null,
      })));
    } catch (error) {
      console.error('Failed to load data:', error);
      // Mock data
      setDrawings([
        { id: '1', title: 'General Arrangement Plan', drawing_number: 'GA-001', category: 'ga_plans', vessel_id: '1', vessel_name: 'MV Ocean Star', revision: 'B', file_type: 'PDF', status: 'approved', updated_at: '2024-02-15' },
        { id: '2', title: 'Fire Control Plan', drawing_number: 'FCP-001', category: 'fire_plans', vessel_id: '1', vessel_name: 'MV Ocean Star', revision: 'C', file_type: 'PDF', status: 'approved', updated_at: '2024-03-01' },
        { id: '3', title: 'Safety Plan - Deck A', drawing_number: 'SP-001A', category: 'safety_plans', vessel_id: '1', vessel_name: 'MV Ocean Star', revision: 'A', file_type: 'PDF', status: 'approved', updated_at: '2024-01-20' },
        { id: '4', title: 'Main Engine Room Piping', drawing_number: 'PIP-ME-001', category: 'piping', vessel_id: '2', vessel_name: 'MV Pacific Trader', revision: 'D', file_type: 'DWG', status: 'under_review', updated_at: '2024-03-10' },
        { id: '5', title: 'Electrical Single Line Diagram', drawing_number: 'EL-SLD-001', category: 'electrical', vessel_id: '2', vessel_name: 'MV Pacific Trader', revision: 'B', file_type: 'PDF', status: 'approved', updated_at: '2024-02-28' },
        { id: '6', title: 'Stability Booklet - Loading Conditions', drawing_number: 'STB-001', category: 'stability', vessel_id: '1', vessel_name: 'MV Ocean Star', revision: 'E', file_type: 'PDF', status: 'approved', updated_at: '2024-01-15' },
      ]);
      setVessels([
        { id: '1', name: 'MV Ocean Star' },
        { id: '2', name: 'MV Pacific Trader' },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredDrawings = drawings.filter(d => {
    if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
    if (vesselFilter !== 'all' && d.vessel_id !== vesselFilter) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        d.title?.toLowerCase().includes(searchLower) ||
        d.drawing_number?.toLowerCase().includes(searchLower) ||
        d.vessel_name?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Layers className="w-6 h-6" />
              Technical Drawings
            </h1>
            <p className="text-muted-foreground">Technical drawings, plans, and system diagrams</p>
          </div>
          <div className="flex gap-2">
            <div className="flex border rounded-lg">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="rounded-r-none"
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="rounded-l-none"
              >
                <Grid className="w-4 h-4" />
              </Button>
            </div>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Upload Drawing
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileImage className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{drawings.length}</p>
                  <p className="text-sm text-muted-foreground">Total Drawings</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <FolderOpen className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {new Set(drawings.map(d => d.category)).size}
                  </p>
                  <p className="text-sm text-muted-foreground">Categories</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Ship className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {new Set(drawings.filter(d => d.vessel_id).map(d => d.vessel_id)).size}
                  </p>
                  <p className="text-sm text-muted-foreground">Vessels</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Layers className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {drawings.filter(d => d.status === 'under_review').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Under Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search drawings..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <FolderOpen className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={vesselFilter} onValueChange={setVesselFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Ship className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Vessel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vessels</SelectItem>
                  {vessels.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Drawings List/Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredDrawings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Layers className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No drawings found</p>
            </CardContent>
          </Card>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDrawings.map((drawing) => (
              <Card key={drawing.id} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="aspect-video bg-muted rounded-lg mb-4 flex items-center justify-center">
                    <FileImage className="w-12 h-12 text-muted-foreground" />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{drawing.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {drawing.drawing_number} • Rev. {drawing.revision}
                      </p>
                      {drawing.vessel_name && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {drawing.vessel_name}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {drawing.file_type}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDrawings.map((drawing) => (
              <Card key={drawing.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                      <FileImage className="w-8 h-8 text-muted-foreground" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{drawing.title}</p>
                        <Badge variant="secondary" className="text-xs">
                          {drawing.file_type}
                        </Badge>
                        <Badge variant={drawing.status === 'approved' ? 'default' : 'outline'} className="text-xs">
                          {drawing.status}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {drawing.drawing_number && (
                          <span className="font-mono">{drawing.drawing_number}</span>
                        )}
                        <span>•</span>
                        <span>Rev. {drawing.revision}</span>
                        {drawing.vessel_name && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Ship className="w-3 h-3" />
                              {drawing.vessel_name}
                            </span>
                          </>
                        )}
                        <span>•</span>
                        <span>
                          {categories.find(c => c.value === drawing.category)?.label || drawing.category}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex-shrink-0 text-sm text-muted-foreground">
                      Updated {format(new Date(drawing.updated_at), 'MMM d, yyyy')}
                    </div>
                    
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm">
                        <ZoomIn className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Download className="w-4 h-4" />
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
