import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDrills, useDrillDetails } from '@/modules/drills/hooks/useDrills';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { format, addDays, differenceInDays, isPast, isFuture } from 'date-fns';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  LifeBuoy, 
  Flame, 
  ShieldAlert, 
  Plus,
  Calendar,
  Download,
  MapPin,
  AlertTriangle,
  Clock,
  Wrench,
  FileText,
  Navigation
} from 'lucide-react';

interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  location: string;
  lastInspected: string;
  nextInspection: string;
  serviceDue: string | null;
  expiryDate: string | null;
  status: 'ready' | 'service_due' | 'expired' | 'defective';
  lastUsedInDrill: string | null;
  notes: string | null;
}

// Mock equipment data (in real app, this would come from database)
const mockEquipment: EquipmentItem[] = [
  // Life Saving
  { id: '1', name: 'Lifeboat Port', category: 'life_saving', location: 'Port Side Deck', lastInspected: '2025-01-15', nextInspection: '2025-02-15', serviceDue: '2025-06-01', expiryDate: null, status: 'ready', lastUsedInDrill: '2025-01-10', notes: null },
  { id: '2', name: 'Lifeboat Starboard', category: 'life_saving', location: 'Starboard Deck', lastInspected: '2025-01-15', nextInspection: '2025-02-15', serviceDue: '2025-06-01', expiryDate: null, status: 'ready', lastUsedInDrill: '2025-01-10', notes: null },
  { id: '3', name: 'Life Raft #1', category: 'life_saving', location: 'Forward Deck', lastInspected: '2025-01-10', nextInspection: '2025-02-10', serviceDue: '2025-03-15', expiryDate: null, status: 'service_due', lastUsedInDrill: null, notes: 'Service due in 2 months' },
  { id: '4', name: 'Life Raft #2', category: 'life_saving', location: 'Aft Deck', lastInspected: '2025-01-10', nextInspection: '2025-02-10', serviceDue: null, expiryDate: null, status: 'ready', lastUsedInDrill: null, notes: null },
  { id: '5', name: 'EPIRB', category: 'life_saving', location: 'Bridge', lastInspected: '2025-01-20', nextInspection: '2025-02-20', serviceDue: null, expiryDate: '2026-12-01', status: 'ready', lastUsedInDrill: null, notes: null },
  { id: '6', name: 'SART', category: 'life_saving', location: 'Bridge', lastInspected: '2025-01-20', nextInspection: '2025-02-20', serviceDue: null, expiryDate: '2026-06-01', status: 'ready', lastUsedInDrill: null, notes: null },
  { id: '7', name: 'Life Jackets (50)', category: 'life_saving', location: 'Various', lastInspected: '2025-01-05', nextInspection: '2025-02-05', serviceDue: null, expiryDate: null, status: 'ready', lastUsedInDrill: '2025-01-10', notes: null },
  { id: '8', name: 'Immersion Suits (25)', category: 'life_saving', location: 'Accommodation', lastInspected: '2025-01-05', nextInspection: '2025-02-05', serviceDue: null, expiryDate: null, status: 'service_due', lastUsedInDrill: '2025-01-10', notes: '3 suits need zipper repair' },
  
  // Fire Fighting
  { id: '9', name: 'CO2 Extinguisher #1', category: 'fire_fighting', location: 'Engine Room', lastInspected: '2025-01-18', nextInspection: '2025-02-18', serviceDue: null, expiryDate: '2026-01-01', status: 'ready', lastUsedInDrill: '2025-01-15', notes: null },
  { id: '10', name: 'CO2 Extinguisher #2', category: 'fire_fighting', location: 'Galley', lastInspected: '2025-01-18', nextInspection: '2025-02-18', serviceDue: null, expiryDate: '2026-01-01', status: 'ready', lastUsedInDrill: null, notes: null },
  { id: '11', name: 'Foam Extinguisher', category: 'fire_fighting', location: 'Cargo Hold', lastInspected: '2025-01-18', nextInspection: '2025-02-18', serviceDue: null, expiryDate: '2025-06-01', status: 'ready', lastUsedInDrill: '2025-01-15', notes: null },
  { id: '12', name: 'SCBA Set #1', category: 'fire_fighting', location: 'Fire Station', lastInspected: '2025-01-20', nextInspection: '2025-02-20', serviceDue: '2025-04-01', expiryDate: null, status: 'ready', lastUsedInDrill: '2025-01-15', notes: null },
  { id: '13', name: 'SCBA Set #2', category: 'fire_fighting', location: 'Fire Station', lastInspected: '2025-01-20', nextInspection: '2025-02-20', serviceDue: null, expiryDate: null, status: 'ready', lastUsedInDrill: '2025-01-15', notes: null },
  { id: '14', name: 'Fireman Outfit', category: 'fire_fighting', location: 'Fire Station', lastInspected: '2025-01-05', nextInspection: '2025-02-05', serviceDue: null, expiryDate: null, status: 'defective', lastUsedInDrill: null, notes: 'Helmet visor cracked, replacement ordered' },
  { id: '15', name: 'Fire Hose Station #1', category: 'fire_fighting', location: 'Main Deck Fwd', lastInspected: '2025-01-15', nextInspection: '2025-02-15', serviceDue: null, expiryDate: null, status: 'ready', lastUsedInDrill: '2025-01-15', notes: null },
  { id: '16', name: 'Fire Pump Main', category: 'fire_fighting', location: 'Engine Room', lastInspected: '2025-01-12', nextInspection: '2025-02-12', serviceDue: null, expiryDate: null, status: 'ready', lastUsedInDrill: '2025-01-15', notes: null },
  
  // Navigation Safety
  { id: '17', name: 'Flares - Red', category: 'navigation', location: 'Bridge', lastInspected: '2025-01-20', nextInspection: '2025-02-20', serviceDue: null, expiryDate: '2025-12-01', status: 'ready', lastUsedInDrill: null, notes: null },
  { id: '18', name: 'Flares - Parachute', category: 'navigation', location: 'Bridge', lastInspected: '2025-01-20', nextInspection: '2025-02-20', serviceDue: null, expiryDate: '2025-08-01', status: 'ready', lastUsedInDrill: null, notes: null },
  { id: '19', name: 'Smoke Signals', category: 'navigation', location: 'Bridge', lastInspected: '2025-01-20', nextInspection: '2025-02-20', serviceDue: null, expiryDate: '2025-06-01', status: 'service_due', lastUsedInDrill: null, notes: 'Expiring in 5 months' },
  { id: '20', name: 'Line Throwing Apparatus', category: 'navigation', location: 'Forward', lastInspected: '2025-01-15', nextInspection: '2025-02-15', serviceDue: null, expiryDate: null, status: 'ready', lastUsedInDrill: null, notes: null },
  
  // Medical Equipment
  { id: '21', name: 'Medical Kit - Main', category: 'medical', location: 'Hospital', lastInspected: '2025-01-10', nextInspection: '2025-02-10', serviceDue: null, expiryDate: null, status: 'ready', lastUsedInDrill: null, notes: null },
  { id: '22', name: 'First Aid Kit - Bridge', category: 'medical', location: 'Bridge', lastInspected: '2025-01-10', nextInspection: '2025-02-10', serviceDue: null, expiryDate: null, status: 'service_due', lastUsedInDrill: null, notes: 'Some items expired, restock needed' },
  { id: '23', name: 'Stretcher', category: 'medical', location: 'Hospital', lastInspected: '2025-01-10', nextInspection: '2025-02-10', serviceDue: null, expiryDate: null, status: 'ready', lastUsedInDrill: '2025-01-08', notes: null },
  { id: '24', name: 'Oxygen Equipment', category: 'medical', location: 'Hospital', lastInspected: '2025-01-15', nextInspection: '2025-02-15', serviceDue: '2025-03-01', expiryDate: null, status: 'ready', lastUsedInDrill: null, notes: null },
  
  // Pollution Response
  { id: '25', name: 'Oil Spill Kit', category: 'pollution', location: 'Cargo Deck', lastInspected: '2025-01-12', nextInspection: '2025-02-12', serviceDue: null, expiryDate: null, status: 'ready', lastUsedInDrill: null, notes: null },
  { id: '26', name: 'SOPEP Locker', category: 'pollution', location: 'Engine Room', lastInspected: '2025-01-12', nextInspection: '2025-02-12', serviceDue: null, expiryDate: null, status: 'ready', lastUsedInDrill: null, notes: null },
];

const EQUIPMENT_CATEGORIES = [
  { id: 'life_saving', name: 'Life Saving Appliances', icon: LifeBuoy, color: 'text-blue-500' },
  { id: 'fire_fighting', name: 'Fire Fighting Equipment', icon: Flame, color: 'text-red-500' },
  { id: 'navigation', name: 'Navigation Safety', icon: Navigation, color: 'text-green-500' },
  { id: 'medical', name: 'Medical Equipment', icon: ShieldAlert, color: 'text-pink-500' },
  { id: 'pollution', name: 'Pollution Response', icon: AlertTriangle, color: 'text-orange-500' },
];

const EquipmentReadinessTab: React.FC = () => {
  const [selectedVessel, setSelectedVessel] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  const { completedDrills } = useDrills();
  const { vessels } = useVessels();

  // Filter equipment by category
  const filteredEquipment = selectedCategory === 'all' 
    ? mockEquipment 
    : mockEquipment.filter(e => e.category === selectedCategory);

  // Calculate stats
  const stats = useMemo(() => {
    const ready = mockEquipment.filter(e => e.status === 'ready').length;
    const serviceDue = mockEquipment.filter(e => e.status === 'service_due').length;
    const defective = mockEquipment.filter(e => e.status === 'defective').length;
    const expired = mockEquipment.filter(e => e.status === 'expired').length;
    const total = mockEquipment.length;
    const readinessRate = Math.round((ready / total) * 100);
    
    return { ready, serviceDue, defective, expired, total, readinessRate };
  }, []);

  // Category stats
  const categoryStats = useMemo(() => {
    return EQUIPMENT_CATEGORIES.map(cat => {
      const items = mockEquipment.filter(e => e.category === cat.id);
      const ready = items.filter(e => e.status === 'ready').length;
      return {
        ...cat,
        total: items.length,
        ready,
        rate: items.length > 0 ? Math.round((ready / items.length) * 100) : 100
      };
    });
  }, []);

  // Upcoming inspections
  const upcomingInspections = useMemo(() => {
    return mockEquipment
      .filter(e => {
        const nextDate = new Date(e.nextInspection);
        const daysUntil = differenceInDays(nextDate, new Date());
        return daysUntil >= 0 && daysUntil <= 30;
      })
      .sort((a, b) => new Date(a.nextInspection).getTime() - new Date(b.nextInspection).getTime())
      .slice(0, 10);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'service_due':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'defective':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'expired':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <Badge className="bg-green-100 text-green-800">Ready</Badge>;
      case 'service_due':
        return <Badge className="bg-yellow-100 text-yellow-800">Service Due</Badge>;
      case 'defective':
        return <Badge className="bg-red-100 text-red-800">Defective</Badge>;
      case 'expired':
        return <Badge className="bg-red-100 text-red-800">Expired</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={selectedVessel} onValueChange={setSelectedVessel}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Vessels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vessels</SelectItem>
              {vessels.map(vessel => (
                <SelectItem key={vessel.id} value={vessel.id}>
                  {vessel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Inventory
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Equipment Check
          </Button>
        </div>
      </div>

      {/* Overall Readiness */}
      <Card>
        <CardHeader>
          <CardTitle>Overall Equipment Readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <Progress 
                value={stats.readinessRate} 
                className={`h-4 ${
                  stats.readinessRate >= 90 ? '[&>div]:bg-green-500' : 
                  stats.readinessRate >= 70 ? '[&>div]:bg-yellow-500' : 
                  '[&>div]:bg-red-500'
                }`}
              />
            </div>
            <span className="text-3xl font-bold">{stats.readinessRate}%</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-green-700">{stats.ready}</p>
                <p className="text-xs text-green-600">Ready</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold text-yellow-700">{stats.serviceDue}</p>
                <p className="text-xs text-yellow-600">Service Due</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <XCircle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold text-red-700">{stats.defective}</p>
                <p className="text-xs text-red-600">Defective</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <Wrench className="h-5 w-5 text-gray-500" />
              <div>
                <p className="text-2xl font-bold text-gray-700">{stats.total}</p>
                <p className="text-xs text-gray-600">Total Items</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {categoryStats.map(cat => {
          const IconComponent = cat.icon;
          return (
            <Card 
              key={cat.id}
              className={`cursor-pointer transition-all ${selectedCategory === cat.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSelectedCategory(selectedCategory === cat.id ? 'all' : cat.id)}
            >
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <IconComponent className={`h-5 w-5 ${cat.color}`} />
                  <span className="font-medium text-sm truncate">{cat.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress 
                    value={cat.rate} 
                    className={`h-2 flex-1 ${
                      cat.rate >= 90 ? '[&>div]:bg-green-500' : 
                      cat.rate >= 70 ? '[&>div]:bg-yellow-500' : 
                      '[&>div]:bg-red-500'
                    }`}
                  />
                  <span className="text-sm font-bold">{cat.rate}%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {cat.ready}/{cat.total} ready
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Equipment List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Equipment Inventory</CardTitle>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {EQUIPMENT_CATEGORIES.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Last Inspected</TableHead>
                  <TableHead>Next Due</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEquipment.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(item.status)}
                        <span className="font-medium">{item.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {item.location}
                      </div>
                    </TableCell>
                    <TableCell>{format(new Date(item.lastInspected), 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {format(new Date(item.nextInspection), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Upcoming Inspections */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Upcoming Inspections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingInspections.map(item => {
                const daysUntil = differenceInDays(new Date(item.nextInspection), new Date());
                return (
                  <div 
                    key={item.id}
                    className={`p-3 rounded-lg border ${
                      daysUntil <= 7 ? 'bg-red-50 border-red-200' : 
                      daysUntil <= 14 ? 'bg-yellow-50 border-yellow-200' : 
                      'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.location}</p>
                      </div>
                      <Badge 
                        variant="outline"
                        className={
                          daysUntil <= 7 ? 'border-red-300 text-red-700' : 
                          daysUntil <= 14 ? 'border-yellow-300 text-yellow-700' : ''
                        }
                      >
                        {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
                      </Badge>
                    </div>
                  </div>
                );
              })}
              {upcomingInspections.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No inspections due in the next 30 days
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Defects & Issues */}
      {stats.defective > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-base text-red-700 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Equipment Defects Requiring Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mockEquipment.filter(e => e.status === 'defective').map(item => (
                <div key={item.id} className="p-4 rounded-lg bg-red-50 border border-red-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-muted-foreground">{item.location}</p>
                      {item.notes && (
                        <p className="text-sm mt-2">{item.notes}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline">
                        <FileText className="h-4 w-4 mr-1" />
                        Create CAPA
                      </Button>
                      <Button size="sm">
                        Mark Resolved
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EquipmentReadinessTab;
