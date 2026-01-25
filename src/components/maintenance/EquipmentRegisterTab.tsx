import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useMaintenance, EquipmentCategory, Equipment } from '@/hooks/useMaintenance';
import { getCriticalityConfig, getEquipmentStatusConfig } from '@/lib/maintenanceConstants';
import { 
  Search, 
  Plus, 
  ChevronRight, 
  ChevronDown,
  Eye,
  Edit,
  ClipboardList,
  AlertTriangle,
  Filter
} from 'lucide-react';
import { format } from 'date-fns';

interface EquipmentRegisterTabProps {
  onAddEquipment: () => void;
  onViewEquipment?: (equipment: Equipment) => void;
}

const EquipmentRegisterTab: React.FC<EquipmentRegisterTabProps> = ({ onAddEquipment, onViewEquipment }) => {
  const { categories, equipment, tasks, flatCategories } = useMaintenance();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [criticalityFilter, setCriticalityFilter] = useState<string>('all');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Toggle category expansion
  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  // Get equipment count for a category (including children)
  const getEquipmentCount = (categoryId: string): number => {
    const directCount = equipment.filter(e => e.category_id === categoryId).length;
    const category = flatCategories.find(c => c.id === categoryId);
    const childCategories = flatCategories.filter(c => c.parent_category_id === categoryId);
    const childCount = childCategories.reduce((sum, child) => sum + getEquipmentCount(child.id), 0);
    return directCount + childCount;
  };

  // Filter equipment
  const filteredEquipment = equipment.filter(e => {
    const matchesSearch = 
      e.equipment_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.equipment_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
      (e.model?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    
    const matchesCategory = !selectedCategory || 
      e.category_id === selectedCategory ||
      flatCategories.find(c => c.id === e.category_id)?.parent_category_id === selectedCategory;
    
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    const matchesCriticality = criticalityFilter === 'all' || e.criticality === criticalityFilter;
    
    return matchesSearch && matchesCategory && matchesStatus && matchesCriticality;
  });

  // Get next maintenance date for equipment
  const getNextMaintenanceDate = (equipmentId: string): string | null => {
    const equipmentTasks = tasks.filter(
      t => t.equipment_id === equipmentId && 
      t.status !== 'Completed' && 
      t.status !== 'Cancelled'
    );
    if (equipmentTasks.length === 0) return null;
    const sortedTasks = equipmentTasks.sort((a, b) => 
      new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    );
    return sortedTasks[0].due_date;
  };

  // Render category tree
  const renderCategory = (category: EquipmentCategory, level: number = 0) => {
    const count = getEquipmentCount(category.id);
    const isExpanded = expandedCategories.has(category.id);
    const hasChildren = category.children && category.children.length > 0;
    const isSelected = selectedCategory === category.id;

    return (
      <div key={category.id}>
        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted transition-colors ${
            isSelected ? 'bg-primary/10 text-primary' : ''
          }`}
          style={{ paddingLeft: `${8 + level * 16}px` }}
          onClick={() => setSelectedCategory(isSelected ? null : category.id)}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleCategory(category.id);
              }}
              className="p-0.5"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-4" />}
          <span className="flex-1 text-sm truncate">{category.category_name}</span>
          <span className="text-xs text-muted-foreground">({count})</span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {category.children!.map(child => renderCategory(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex gap-4">
      {/* Category Sidebar */}
      <Card className="w-64 shrink-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Categories</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <ScrollArea className="h-[500px]">
            <div
              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted transition-colors ${
                !selectedCategory ? 'bg-primary/10 text-primary' : ''
              }`}
              onClick={() => setSelectedCategory(null)}
            >
              <div className="w-4" />
              <span className="flex-1 text-sm font-medium">All Equipment</span>
              <span className="text-xs text-muted-foreground">({equipment.length})</span>
            </div>
            {categories.map(cat => renderCategory(cat))}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Equipment List */}
      <Card className="flex-1">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Equipment Register</CardTitle>
            <Button size="sm" onClick={onAddEquipment}>
              <Plus className="h-4 w-4 mr-2" />
              Add Equipment
            </Button>
          </div>
          <div className="flex gap-2 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, code, manufacturer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Operational">Operational</SelectItem>
                <SelectItem value="Defective">Defective</SelectItem>
                <SelectItem value="Under_Repair">Under Repair</SelectItem>
                <SelectItem value="Decommissioned">Decommissioned</SelectItem>
              </SelectContent>
            </Select>
            <Select value={criticalityFilter} onValueChange={setCriticalityFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Criticality" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Criticality</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
                <SelectItem value="Important">Important</SelectItem>
                <SelectItem value="Non_Critical">Non-Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredEquipment.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No equipment found</p>
              <Button variant="link" onClick={onAddEquipment}>
                Add your first equipment
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Equipment Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Criticality</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Running Hours</TableHead>
                  <TableHead>Next Maintenance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEquipment.map((equip) => {
                  const criticalityConfig = getCriticalityConfig(equip.criticality);
                  const statusConfig = getEquipmentStatusConfig(equip.status);
                  const nextMaint = getNextMaintenanceDate(equip.id);
                  const isOverdue = nextMaint && new Date(nextMaint) < new Date();

                  return (
                    <TableRow key={equip.id}>
                      <TableCell className="font-mono font-medium">
                        {equip.equipment_code}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{equip.equipment_name}</p>
                          {equip.manufacturer && (
                            <p className="text-xs text-muted-foreground">
                              {equip.manufacturer} {equip.model && `- ${equip.model}`}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{equip.location || '—'}</TableCell>
                      <TableCell>
                        <Badge className={criticalityConfig?.color || ''}>
                          {criticalityConfig?.label || equip.criticality}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusConfig?.color || ''}>
                          {statusConfig?.label || equip.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {equip.running_hours_total > 0 ? (
                          <span className="font-mono">
                            {equip.running_hours_total.toLocaleString()} hrs
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {nextMaint ? (
                          <span className={isOverdue ? 'text-critical font-medium' : ''}>
                            {format(new Date(nextMaint), 'MMM d, yyyy')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            title="View"
                            onClick={() => onViewEquipment?.(equip)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Edit">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Tasks">
                            <ClipboardList className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Defects">
                            <AlertTriangle className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EquipmentRegisterTab;
