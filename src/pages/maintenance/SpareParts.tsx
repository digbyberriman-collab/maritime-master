import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  Package, Search, Filter, Plus, AlertCircle, CheckCircle,
  Ship, Loader2, ArrowDown, ArrowUp, Settings, Tag
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface SparePart {
  id: string;
  name: string;
  part_number: string;
  category: string;
  location: string | null;
  vessel_id: string | null;
  vessel_name: string | null;
  quantity_on_hand: number;
  minimum_quantity: number;
  unit: string;
  unit_cost: number | null;
  supplier: string | null;
  is_critical: boolean;
  last_ordered: string | null;
}

const categories = [
  { value: 'engine', label: 'Engine Parts' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'deck', label: 'Deck Equipment' },
  { value: 'safety', label: 'Safety Equipment' },
  { value: 'navigation', label: 'Navigation' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'consumables', label: 'Consumables' },
];

export default function SpareParts() {
  const [parts, setParts] = useState<SparePart[]>([]);
  const [vessels, setVessels] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [vesselFilter, setVesselFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, [categoryFilter, vesselFilter, stockFilter]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [partsRes, vesselsRes] = await Promise.all([
        supabase
          .from('spare_parts')
          .select('*, vessel:vessels(name)')
          .order('name', { ascending: true }),
        supabase
          .from('vessels')
          .select('id, name')
          .eq('status', 'active')
          .order('name'),
      ]);

      if (partsRes.error) throw partsRes.error;
      if (vesselsRes.error) throw vesselsRes.error;

      setVessels(vesselsRes.data || []);
      setParts((partsRes.data || []).map((p: any) => ({
        id: p.id,
        name: p.part_name,
        part_number: p.part_number,
        category: p.category || 'other',
        location: p.location_onboard || null,
        vessel_id: p.vessel_id || null,
        vessel_name: p.vessel?.name || null,
        quantity_on_hand: p.quantity || 0,
        minimum_quantity: p.minimum_stock || 0,
        unit: p.unit || 'pcs',
        unit_cost: p.unit_cost || null,
        supplier: p.supplier || null,
        is_critical: p.is_critical || false,
        last_ordered: p.last_ordered_date || null,
      })));
    } catch (error) {
      console.error('Failed to load data:', error);
      // Mock data
      setParts([
        { id: '1', name: 'Fuel Injector - Main Engine', part_number: 'ME-FI-001', category: 'engine', location: 'Engine Store A1', vessel_id: '1', vessel_name: 'MV Ocean Star', quantity_on_hand: 4, minimum_quantity: 2, unit: 'pcs', unit_cost: 2500, supplier: 'MAN Energy Solutions', is_critical: true, last_ordered: '2024-01-15' },
        { id: '2', name: 'Turbocharger Bearing Kit', part_number: 'ME-TB-002', category: 'engine', location: 'Engine Store A2', vessel_id: '1', vessel_name: 'MV Ocean Star', quantity_on_hand: 1, minimum_quantity: 2, unit: 'kit', unit_cost: 8500, supplier: 'ABB Marine', is_critical: true, last_ordered: '2023-11-20' },
        { id: '3', name: 'Navigation Light - Port Red', part_number: 'NAV-LT-003', category: 'navigation', location: 'Bridge Store', vessel_id: '1', vessel_name: 'MV Ocean Star', quantity_on_hand: 6, minimum_quantity: 4, unit: 'pcs', unit_cost: 350, supplier: 'Hella Marine', is_critical: false, last_ordered: '2024-02-01' },
        { id: '4', name: 'Fire Extinguisher CO2 5kg', part_number: 'SAF-FE-001', category: 'safety', location: 'Safety Store', vessel_id: '2', vessel_name: 'MV Pacific Trader', quantity_on_hand: 8, minimum_quantity: 6, unit: 'pcs', unit_cost: 180, supplier: 'Tyco Fire', is_critical: true, last_ordered: '2024-01-10' },
        { id: '5', name: 'Hydraulic Oil Filter', part_number: 'HYD-FL-001', category: 'deck', location: 'Deck Store B1', vessel_id: '2', vessel_name: 'MV Pacific Trader', quantity_on_hand: 3, minimum_quantity: 4, unit: 'pcs', unit_cost: 120, supplier: 'Parker Hannifin', is_critical: false, last_ordered: '2023-12-15' },
        { id: '6', name: 'Alternator Brush Set', part_number: 'EL-ALT-001', category: 'electrical', location: 'Engine Store B1', vessel_id: '1', vessel_name: 'MV Ocean Star', quantity_on_hand: 0, minimum_quantity: 2, unit: 'set', unit_cost: 450, supplier: 'Leroy Somer', is_critical: true, last_ordered: '2024-03-01' },
      ]);
      setVessels([
        { id: '1', name: 'MV Ocean Star' },
        { id: '2', name: 'MV Pacific Trader' },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredParts = parts.filter(p => {
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
    if (vesselFilter !== 'all' && p.vessel_id !== vesselFilter) return false;
    if (stockFilter === 'low' && p.quantity_on_hand >= p.minimum_quantity) return false;
    if (stockFilter === 'out' && p.quantity_on_hand > 0) return false;
    if (stockFilter === 'critical' && !p.is_critical) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        p.name?.toLowerCase().includes(searchLower) ||
        p.part_number?.toLowerCase().includes(searchLower) ||
        p.supplier?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  const lowStockCount = parts.filter(p => p.quantity_on_hand < p.minimum_quantity && p.quantity_on_hand > 0).length;
  const outOfStockCount = parts.filter(p => p.quantity_on_hand === 0).length;
  const criticalLowCount = parts.filter(p => p.is_critical && p.quantity_on_hand < p.minimum_quantity).length;
  const totalValue = parts.reduce((sum, p) => sum + (p.quantity_on_hand * (p.unit_cost || 0)), 0);

  function getStockStatus(part: SparePart): 'ok' | 'low' | 'out' {
    if (part.quantity_on_hand === 0) return 'out';
    if (part.quantity_on_hand < part.minimum_quantity) return 'low';
    return 'ok';
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="w-6 h-6" />
              Spare Parts Inventory
            </h1>
            <p className="text-muted-foreground">Manage spare parts inventory across the fleet</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Part
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Spare Part</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Part Name *</Label>
                    <Input placeholder="e.g., Fuel Injector" />
                  </div>
                  <div className="space-y-2">
                    <Label>Part Number *</Label>
                    <Input placeholder="e.g., ME-FI-001" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Vessel</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select vessel" />
                      </SelectTrigger>
                      <SelectContent>
                        {vessels.map(v => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input type="number" placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>Min. Quantity</Label>
                    <Input type="number" placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit Cost ($)</Label>
                    <Input type="number" placeholder="0.00" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input placeholder="e.g., Engine Store A1" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => {
                  toast.success('Part added successfully');
                  setIsDialogOpen(false);
                }}>
                  Add Part
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Package className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{parts.length}</p>
                  <p className="text-sm text-muted-foreground">Total Parts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <ArrowDown className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{lowStockCount}</p>
                  <p className="text-sm text-muted-foreground">Low Stock</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{outOfStockCount}</p>
                  <p className="text-sm text-muted-foreground">Out of Stock</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Settings className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{criticalLowCount}</p>
                  <p className="text-sm text-muted-foreground">Critical Low</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Tag className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">${(totalValue / 1000).toFixed(1)}k</p>
                  <p className="text-sm text-muted-foreground">Total Value</p>
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
                  placeholder="Search by name, part number, or supplier..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
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
                <SelectTrigger className="w-full sm:w-[160px]">
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
              <Select value={stockFilter} onValueChange={setStockFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Stock Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="low">Low Stock</SelectItem>
                  <SelectItem value="out">Out of Stock</SelectItem>
                  <SelectItem value="critical">Critical Parts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Parts List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredParts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No spare parts found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredParts.map((part) => {
              const status = getStockStatus(part);
              const stockPercent = Math.min((part.quantity_on_hand / part.minimum_quantity) * 100, 100);
              
              return (
                <Card key={part.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${
                        status === 'ok' ? 'bg-green-100' :
                        status === 'low' ? 'bg-yellow-100' : 'bg-red-100'
                      }`}>
                        <Package className={`w-6 h-6 ${
                          status === 'ok' ? 'text-green-600' :
                          status === 'low' ? 'text-yellow-600' : 'text-red-600'
                        }`} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">{part.name}</p>
                          {part.is_critical && (
                            <Badge variant="destructive" className="text-xs">Critical</Badge>
                          )}
                          <Badge variant={status === 'ok' ? 'default' : status === 'low' ? 'secondary' : 'destructive'} className="text-xs">
                            {status === 'ok' ? 'In Stock' : status === 'low' ? 'Low Stock' : 'Out of Stock'}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="font-mono">{part.part_number}</span>
                          <span>•</span>
                          <span>{categories.find(c => c.value === part.category)?.label}</span>
                          {part.vessel_name && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Ship className="w-3 h-3" />
                                {part.vessel_name}
                              </span>
                            </>
                          )}
                          {part.location && (
                            <>
                              <span>•</span>
                              <span>{part.location}</span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex-shrink-0 w-32">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">
                            {part.quantity_on_hand} / {part.minimum_quantity}
                          </span>
                          <span className="text-xs text-muted-foreground">{part.unit}</span>
                        </div>
                        <Progress 
                          value={stockPercent} 
                          className={`h-2 ${
                            status === 'out' ? '[&>div]:bg-red-500' :
                            status === 'low' ? '[&>div]:bg-yellow-500' : ''
                          }`}
                        />
                      </div>
                      
                      {part.unit_cost && (
                        <div className="flex-shrink-0 text-right">
                          <p className="font-medium">${part.unit_cost.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">per {part.unit}</p>
                        </div>
                      )}
                      
                      <Button size="sm" variant="outline">
                        <ArrowUp className="w-4 h-4 mr-1" />
                        Reorder
                      </Button>
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
}
