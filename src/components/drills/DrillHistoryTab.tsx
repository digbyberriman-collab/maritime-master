import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDrills } from '@/hooks/useDrills';
import { useVessels } from '@/hooks/useVessels';
import { format } from 'date-fns';
import { Search, FileText, Eye, Star } from 'lucide-react';
import { DRILL_STATUSES } from '@/lib/drillConstants';

const DrillHistoryTab: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVessel, setSelectedVessel] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedType, setSelectedType] = useState<string>('all');

  const { drills, drillTypes, completedDrills } = useDrills();
  const { vessels } = useVessels();

  // Get unique years from drills
  const years = [...new Set(drills.map(d => new Date(d.drill_date_scheduled).getFullYear()))]
    .sort((a, b) => b - a);

  // Filter drills
  const filteredDrills = drills.filter(drill => {
    const matchesSearch = searchQuery === '' || 
      drill.drill_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      drill.drill_type?.drill_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      drill.vessel?.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesVessel = selectedVessel === 'all' || drill.vessel_id === selectedVessel;
    const matchesYear = selectedYear === 'all' || 
      new Date(drill.drill_date_scheduled).getFullYear().toString() === selectedYear;
    const matchesType = selectedType === 'all' || drill.drill_type_id === selectedType;

    return matchesSearch && matchesVessel && matchesYear && matchesType;
  });

  const getStatusBadge = (status: string) => {
    const statusConfig = DRILL_STATUSES.find(s => s.value === status);
    return (
      <Badge className={statusConfig?.color || ''}>
        {statusConfig?.label || status}
      </Badge>
    );
  };

  const renderRating = (rating: number | null) => {
    if (!rating) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <Star 
            key={star}
            className={`h-3 w-3 ${star <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
          />
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Drill History</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search drills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={selectedVessel} onValueChange={setSelectedVessel}>
            <SelectTrigger className="w-[180px]">
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
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map(year => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {drillTypes.map(type => (
                <SelectItem key={type.id} value={type.id}>
                  {type.drill_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Drill #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Vessel</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDrills.length > 0 ? (
                filteredDrills.map(drill => (
                  <TableRow key={drill.id}>
                    <TableCell className="font-medium">{drill.drill_number}</TableCell>
                    <TableCell>{drill.drill_type?.drill_name}</TableCell>
                    <TableCell>{drill.vessel?.name}</TableCell>
                    <TableCell>
                      {format(new Date(drill.drill_date_scheduled), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      {drill.drill_date_actual 
                        ? format(new Date(drill.drill_date_actual), 'MMM d, yyyy')
                        : '—'
                      }
                    </TableCell>
                    <TableCell>
                      {drill.drill_duration_minutes 
                        ? `${drill.drill_duration_minutes} min`
                        : '—'
                      }
                    </TableCell>
                    <TableCell>{renderRating(drill.overall_rating)}</TableCell>
                    <TableCell>{getStatusBadge(drill.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <FileText className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No drills found matching your filters
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default DrillHistoryTab;
