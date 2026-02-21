import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Eye, 
  Plus, 
  Search, 
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  TrendingUp,
  MessageSquare
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// Mock data for observations (would come from hook in production)
const mockObservations = [
  {
    id: '1',
    observation_number: 'OBS-2026-001',
    type: 'Positive',
    category: 'Safety',
    description: 'Crew member properly secured equipment before rough weather',
    location: 'Main Deck',
    observed_by: 'John Smith',
    observed_date: '2026-01-28',
    status: 'Reviewed',
  },
  {
    id: '2',
    observation_number: 'OBS-2026-002',
    type: 'Concern',
    category: 'Housekeeping',
    description: 'Oil spill near engine room entrance not cleaned promptly',
    location: 'Engine Room',
    observed_by: 'Jane Doe',
    observed_date: '2026-01-29',
    status: 'Open',
  },
];

const ObservationsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showNewObservation, setShowNewObservation] = useState(false);
  
  const observations = mockObservations;
  const isLoading = false;

  const filteredObservations = observations.filter((obs) => {
    const matchesSearch = searchQuery === '' || 
      obs.observation_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      obs.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = typeFilter === 'all' || obs.type === typeFilter;
    
    return matchesSearch && matchesType;
  });

  // Stats
  const positiveCount = observations.filter(o => o.type === 'Positive').length;
  const concernCount = observations.filter(o => o.type === 'Concern').length;
  const openCount = observations.filter(o => o.status === 'Open').length;

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'Positive':
        return <Badge className="bg-green-500 text-white"><ThumbsUp className="w-3 h-3 mr-1" />Positive</Badge>;
      case 'Concern':
        return <Badge className="bg-orange-500 text-white"><AlertTriangle className="w-3 h-3 mr-1" />Concern</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Eye className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Safety Observations</h1>
            </div>
            <p className="text-muted-foreground">
              Report positive behaviors and safety concerns
            </p>
          </div>
          <Dialog open={showNewObservation} onOpenChange={setShowNewObservation}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Observation
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Report Observation</DialogTitle>
                <DialogDescription>
                  Record a safety observation - positive behavior or concern
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Type</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Positive">
                        <span className="flex items-center gap-2">
                          <ThumbsUp className="w-4 h-4 text-green-500" />
                          Positive Observation
                        </span>
                      </SelectItem>
                      <SelectItem value="Concern">
                        <span className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-orange-500" />
                          Safety Concern
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Category</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Safety">Safety</SelectItem>
                      <SelectItem value="Housekeeping">Housekeeping</SelectItem>
                      <SelectItem value="PPE">PPE</SelectItem>
                      <SelectItem value="Procedures">Procedures</SelectItem>
                      <SelectItem value="Equipment">Equipment</SelectItem>
                      <SelectItem value="Environment">Environment</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Location</Label>
                  <Input placeholder="Where did this occur?" />
                </div>
                <div className="grid gap-2">
                  <Label>Description</Label>
                  <Textarea 
                    placeholder="Describe what you observed..."
                    rows={4}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNewObservation(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setShowNewObservation(false)}>
                  Submit Observation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Positive</CardTitle>
              <ThumbsUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{positiveCount}</div>
              <p className="text-xs text-muted-foreground">Good behaviors noted</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Concerns</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", concernCount > 0 && "text-orange-600")}>
                {concernCount}
              </div>
              <p className="text-xs text-muted-foreground">Areas for improvement</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open</CardTitle>
              <MessageSquare className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{openCount}</div>
              <p className="text-xs text-muted-foreground">Awaiting review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <TrendingUp className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{observations.length}</div>
              <p className="text-xs text-muted-foreground">Total observations</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search observations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Positive">Positive</SelectItem>
                  <SelectItem value="Concern">Concern</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Observations Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Loading observations...</p>
              </div>
            ) : filteredObservations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Eye className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold">No observations found</h3>
                <p className="text-muted-foreground mb-4">
                  Start recording safety observations
                </p>
                <Button onClick={() => setShowNewObservation(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Observation
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Observation #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredObservations.map((obs) => (
                    <TableRow key={obs.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">
                        {obs.observation_number}
                      </TableCell>
                      <TableCell>{getTypeBadge(obs.type)}</TableCell>
                      <TableCell>{obs.category}</TableCell>
                      <TableCell className="max-w-[250px] truncate">
                        {obs.description}
                      </TableCell>
                      <TableCell>{obs.location}</TableCell>
                      <TableCell>
                        {format(new Date(obs.observed_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={obs.status === 'Open' ? 'default' : 'secondary'}>
                          {obs.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ObservationsPage;
