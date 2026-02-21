import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useDrills, Drill } from '@/modules/drills/hooks/useDrills';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { format, subMonths, isWithinInterval, parseISO } from 'date-fns';
import { Search, FileText, Eye, Star, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Download, Filter } from 'lucide-react';
import { DRILL_STATUSES, getDrillTypeColor } from '@/modules/drills/constants';
import { cn } from '@/lib/utils';
import DrillDetailModal from './DrillDetailModal';

const DrillHistoryTab: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVessel, setSelectedVessel] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedRating, setSelectedRating] = useState<string>('all');
  const [selectedConductedBy, setSelectedConductedBy] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: subMonths(new Date(), 12),
    to: new Date()
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDrill, setSelectedDrill] = useState<Drill | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  const itemsPerPage = 20;

  const { drills, drillTypes, completedDrills } = useDrills();
  const { vessels } = useVessels();

  // Get unique conductors
  const conductors = useMemo(() => {
    const unique = new Map();
    drills.forEach(d => {
      if (d.conducted_by) {
        unique.set(d.conducted_by.user_id, d.conducted_by);
      }
    });
    return Array.from(unique.values());
  }, [drills]);

  // Filter drills
  const filteredDrills = useMemo(() => {
    return drills.filter(drill => {
      const matchesSearch = searchQuery === '' || 
        drill.drill_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        drill.drill_type?.drill_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        drill.vessel?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        drill.scenario_description.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesVessel = selectedVessel === 'all' || drill.vessel_id === selectedVessel;
      const matchesType = selectedType === 'all' || drill.drill_type_id === selectedType;
      const matchesStatus = selectedStatus === 'all' || drill.status === selectedStatus;
      const matchesRating = selectedRating === 'all' || 
        (selectedRating === '5' && drill.overall_rating === 5) ||
        (selectedRating === '4' && drill.overall_rating === 4) ||
        (selectedRating === '3' && drill.overall_rating === 3) ||
        (selectedRating === '2' && drill.overall_rating === 2) ||
        (selectedRating === '1' && drill.overall_rating === 1);
      const matchesConductor = selectedConductedBy === 'all' || drill.conducted_by_id === selectedConductedBy;
      
      let matchesDate = true;
      if (dateRange.from && dateRange.to) {
        const drillDate = new Date(drill.drill_date_scheduled);
        matchesDate = isWithinInterval(drillDate, { start: dateRange.from, end: dateRange.to });
      }

      return matchesSearch && matchesVessel && matchesType && matchesStatus && matchesRating && matchesConductor && matchesDate;
    });
  }, [drills, searchQuery, selectedVessel, selectedType, selectedStatus, selectedRating, selectedConductedBy, dateRange]);

  // Pagination
  const totalPages = Math.ceil(filteredDrills.length / itemsPerPage);
  const paginatedDrills = filteredDrills.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

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
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(star => (
          <Star 
            key={star}
            className={`h-3 w-3 ${star <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
          />
        ))}
      </div>
    );
  };

  const handleViewDrill = (drill: Drill) => {
    setSelectedDrill(drill);
    setShowDetailModal(true);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedVessel('all');
    setSelectedType('all');
    setSelectedStatus('all');
    setSelectedRating('all');
    setSelectedConductedBy('all');
    setDateRange({ from: subMonths(new Date(), 12), to: new Date() });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Drill History</CardTitle>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="space-y-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search drills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              {/* Date Range Picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[280px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange.from}
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                    numberOfMonths={2}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-wrap gap-2">
              <Select value={selectedVessel} onValueChange={setSelectedVessel}>
                <SelectTrigger className="w-[160px]">
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

              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[160px]">
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

              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                  <SelectItem value="Postponed">Postponed</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedRating} onValueChange={setSelectedRating}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ratings</SelectItem>
                  <SelectItem value="5">5 Stars</SelectItem>
                  <SelectItem value="4">4 Stars</SelectItem>
                  <SelectItem value="3">3 Stars</SelectItem>
                  <SelectItem value="2">2 Stars</SelectItem>
                  <SelectItem value="1">1 Star</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedConductedBy} onValueChange={setSelectedConductedBy}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Conducted By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Officers</SelectItem>
                  {conductors.map(conductor => (
                    <SelectItem key={conductor.user_id} value={conductor.user_id}>
                      {conductor.first_name} {conductor.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <Filter className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
          </div>

          {/* Results count */}
          <div className="text-sm text-muted-foreground mb-4">
            Showing {paginatedDrills.length} of {filteredDrills.length} drills
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Drill #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="max-w-[200px]">Scenario</TableHead>
                  <TableHead>Participants</TableHead>
                  <TableHead>Objectives</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Deficiencies</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDrills.length > 0 ? (
                  paginatedDrills.map(drill => (
                    <TableRow key={drill.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewDrill(drill)}>
                      <TableCell className="font-medium text-primary">
                        {drill.drill_number}
                      </TableCell>
                      <TableCell>
                        {format(new Date(drill.drill_date_actual || drill.drill_date_scheduled), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          style={{ 
                            backgroundColor: getDrillTypeColor(drill.drill_type?.drill_name || ''),
                            color: 'white' 
                          }}
                        >
                          {drill.drill_type?.drill_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {drill.scenario_description}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">—</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {drill.objectives?.length || 0} defined
                        </Badge>
                      </TableCell>
                      <TableCell>{renderRating(drill.overall_rating)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">0</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(drill.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" onClick={() => handleViewDrill(drill)}>
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
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No drills found matching your filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drill Detail Modal */}
      <DrillDetailModal
        drill={selectedDrill}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedDrill(null);
        }}
      />
    </>
  );
};

export default DrillHistoryTab;
