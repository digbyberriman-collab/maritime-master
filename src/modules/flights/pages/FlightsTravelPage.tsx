import React, { useState } from 'react';
import { toast } from 'sonner';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Plane, Search, DollarSign, Plus, ArrowRight, Clock, Filter,
  Calendar, CheckCircle, Loader2, AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { SAMPLE_BOOKINGS, FREQUENT_ROUTES, CREW_DRAAK } from '@/data/seedData';
import { cn } from '@/lib/utils';

function statusBadge(status: string) {
  switch (status) {
    case 'confirmed': return <Badge className="bg-[#22C55E] text-white gap-1"><CheckCircle className="w-3 h-3" /> Confirmed</Badge>;
    case 'searching': return <Badge className="bg-[#3B82F6] text-white gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Searching</Badge>;
    case 'pending': return <Badge className="bg-[#F59E0B] text-black gap-1"><Clock className="w-3 h-3" /> Pending</Badge>;
    case 'cancelled': return <Badge className="bg-[#EF4444] text-white gap-1"><AlertCircle className="w-3 h-3" /> Cancelled</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

// Mock search results
const MOCK_FLIGHTS = [
  { airline: 'British Airways', flight: 'BA1234', origin: 'AMS', dest: 'NCE', depart: '08:30', arrive: '10:45', stops: 0, duration: '2h 15m', price: 245, cabin: 'Economy' },
  { airline: 'KLM', flight: 'KL1523', origin: 'AMS', dest: 'NCE', depart: '11:00', arrive: '13:10', stops: 0, duration: '2h 10m', price: 198, cabin: 'Economy' },
  { airline: 'easyJet', flight: 'EJ4521', origin: 'AMS', dest: 'NCE', depart: '14:30', arrive: '16:40', stops: 0, duration: '2h 10m', price: 89, cabin: 'Economy' },
  { airline: 'Air France', flight: 'AF1892', origin: 'AMS', dest: 'NCE', depart: '06:15', arrive: '09:45', stops: 1, duration: '3h 30m', price: 175, cabin: 'Economy' },
  { airline: 'British Airways', flight: 'BA2381', origin: 'AMS', dest: 'NCE', depart: '17:45', arrive: '19:55', stops: 0, duration: '2h 10m', price: 312, cabin: 'Economy' },
];

const FlightsTravelPage: React.FC = () => {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchResults, setSearchResults] = useState<typeof MOCK_FLIGHTS | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = () => {
    setIsSearching(true);
    setTimeout(() => {
      setSearchResults(MOCK_FLIGHTS);
      setIsSearching(false);
    }, 1500);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Plane className="w-6 h-6" />
              Flights & Travel
            </h1>
            <p className="text-muted-foreground">Manage crew travel bookings and budget</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-1 border-[#1A2740] text-[#94A3B8]" onClick={() => toast.info('Manual entry feature coming soon')}>
              <Plus className="w-4 h-4" /> Manual Entry
            </Button>
            <Button className="gap-1 bg-[#3B82F6]" onClick={() => setShowSearchModal(true)}>
              <Search className="w-4 h-4" /> Search Flights
            </Button>
          </div>
        </div>

        <Tabs defaultValue="upcoming">
          <TabsList className="bg-[#111D33] border border-[#1A2740]">
            <TabsTrigger value="upcoming" className="data-[state=active]:bg-[#1A2740] data-[state=active]:text-white">
              Upcoming Trips
            </TabsTrigger>
            <TabsTrigger value="search" className="data-[state=active]:bg-[#1A2740] data-[state=active]:text-white">
              Search Flights
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-[#1A2740] data-[state=active]:text-white">
              Booking History
            </TabsTrigger>
            <TabsTrigger value="budget" className="data-[state=active]:bg-[#1A2740] data-[state=active]:text-white">
              Budget
            </TabsTrigger>
          </TabsList>

          {/* Upcoming Trips */}
          <TabsContent value="upcoming" className="mt-6">
            <Card className="bg-[#111D33] border-[#1A2740]">
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#1A2740]">
                      <TableHead className="text-[#94A3B8]">Crew Member</TableHead>
                      <TableHead className="text-[#94A3B8]">Route</TableHead>
                      <TableHead className="text-[#94A3B8]">Date</TableHead>
                      <TableHead className="text-[#94A3B8]">Flight</TableHead>
                      <TableHead className="text-[#94A3B8]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {SAMPLE_BOOKINGS.map((booking, i) => (
                      <TableRow key={i} className="border-[#1A2740]">
                        <TableCell className="text-white font-medium">{booking.crewName}</TableCell>
                        <TableCell className="text-white">
                          <span className="font-mono">{booking.origin}</span>
                          <ArrowRight className="w-3 h-3 inline mx-2 text-[#94A3B8]" />
                          <span className="font-mono">{booking.destination}</span>
                        </TableCell>
                        <TableCell className="text-white">{format(new Date(booking.date), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="text-white font-mono">{booking.flightNumber || '—'}</TableCell>
                        <TableCell>{statusBadge(booking.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Search Flights */}
          <TabsContent value="search" className="mt-6 space-y-6">
            <Card className="bg-[#111D33] border-[#1A2740]">
              <CardHeader>
                <CardTitle className="text-white">Search Flights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div>
                    <Label className="text-[#94A3B8]">Crew Member</Label>
                    <Select>
                      <SelectTrigger className="bg-[#1A2740] border-[#1A2740] text-white">
                        <SelectValue placeholder="Select crew" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#111D33] border-[#1A2740] max-h-[200px]">
                        {CREW_DRAAK.map((c, i) => (
                          <SelectItem key={i} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[#94A3B8]">Origin</Label>
                    <Input className="bg-[#1A2740] border-[#1A2740] text-white" placeholder="AMS" />
                  </div>
                  <div>
                    <Label className="text-[#94A3B8]">Destination</Label>
                    <Input className="bg-[#1A2740] border-[#1A2740] text-white" placeholder="NCE" />
                  </div>
                  <div>
                    <Label className="text-[#94A3B8]">Date</Label>
                    <Input type="date" className="bg-[#1A2740] border-[#1A2740] text-white" />
                  </div>
                  <div>
                    <Label className="text-[#94A3B8]">Cabin</Label>
                    <Select>
                      <SelectTrigger className="bg-[#1A2740] border-[#1A2740] text-white">
                        <SelectValue placeholder="Economy" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#111D33] border-[#1A2740]">
                        <SelectItem value="economy">Economy</SelectItem>
                        <SelectItem value="premium">Premium Economy</SelectItem>
                        <SelectItem value="business">Business</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button className="w-full gap-1 bg-[#3B82F6]" onClick={handleSearch}>
                      <Search className="w-4 h-4" /> Search
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Frequent Routes */}
            <Card className="bg-[#111D33] border-[#1A2740]">
              <CardHeader>
                <CardTitle className="text-white text-sm">Frequent Routes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {FREQUENT_ROUTES.map((route, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="gap-1 border-[#1A2740] text-[#94A3B8] hover:text-white"
                      onClick={() => setShowSearchModal(true)}
                    >
                      <span className="font-mono">{route.origin}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="font-mono">{route.destination}</span>
                      <span className="text-xs text-[#94A3B8]">({route.frequency})</span>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Search Results */}
            {isSearching && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#3B82F6]" />
                <span className="ml-3 text-[#94A3B8]">Searching flights...</span>
              </div>
            )}

            {searchResults && !isSearching && (
              <Card className="bg-[#111D33] border-[#1A2740]">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-white">{searchResults.length} Flights Found</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1 border-[#1A2740] text-[#94A3B8]">
                      <Filter className="w-3 h-3" /> Filter
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {searchResults.map((flight, i) => (
                      <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-[#1A2740] hover:bg-[#1A2740]/80 transition">
                        <div className="flex items-center gap-6">
                          <div className="text-center min-w-[80px]">
                            <p className="text-white font-bold">{flight.depart}</p>
                            <p className="text-[#94A3B8] text-xs font-mono">{flight.origin}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-px w-12 bg-[#94A3B8]" />
                            <div className="text-center">
                              <p className="text-xs text-[#94A3B8]">{flight.duration}</p>
                              <p className="text-xs text-[#94A3B8]">{flight.stops === 0 ? 'Direct' : `${flight.stops} stop`}</p>
                            </div>
                            <div className="h-px w-12 bg-[#94A3B8]" />
                          </div>
                          <div className="text-center min-w-[80px]">
                            <p className="text-white font-bold">{flight.arrive}</p>
                            <p className="text-[#94A3B8] text-xs font-mono">{flight.dest}</p>
                          </div>
                          <div className="ml-4">
                            <p className="text-white text-sm">{flight.airline}</p>
                            <p className="text-[#94A3B8] text-xs font-mono">{flight.flight}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-white font-bold text-lg">${flight.price}</p>
                            <p className="text-[#94A3B8] text-xs">{flight.cabin}</p>
                          </div>
                          <Button size="sm" className="bg-[#3B82F6]" onClick={() => toast.success(`Booking ${flight.flight} - ${flight.origin} to ${flight.destination}`)}>Book</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Booking History */}
          <TabsContent value="history" className="mt-6">
            <Card className="bg-[#111D33] border-[#1A2740]">
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#1A2740]">
                      <TableHead className="text-[#94A3B8]">Date</TableHead>
                      <TableHead className="text-[#94A3B8]">Crew</TableHead>
                      <TableHead className="text-[#94A3B8]">Route</TableHead>
                      <TableHead className="text-[#94A3B8]">Airline</TableHead>
                      <TableHead className="text-[#94A3B8]">Price</TableHead>
                      <TableHead className="text-[#94A3B8]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { date: '2026-02-15', crew: 'Phillip Carter', route: 'AMS → NCE', airline: 'BA', price: 245, status: 'completed' },
                      { date: '2026-02-10', crew: 'Callum Brown', route: 'LHR → NCE', airline: 'BA', price: 312, status: 'completed' },
                      { date: '2026-01-28', crew: 'Emil Schwarz', route: 'AKL → SIN', airline: 'Air NZ', price: 1890, status: 'completed' },
                      { date: '2026-01-20', crew: 'Jack Sanguinetti', route: 'SOU → AMS', airline: 'easyJet', price: 89, status: 'completed' },
                      { date: '2026-01-15', crew: 'Charlotte Elizabeth Williams', route: 'SOU → NCE', airline: 'BA', price: 198, status: 'completed' },
                    ].map((booking, i) => (
                      <TableRow key={i} className="border-[#1A2740]">
                        <TableCell className="text-white">{format(new Date(booking.date), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="text-white">{booking.crew}</TableCell>
                        <TableCell className="text-white font-mono">{booking.route}</TableCell>
                        <TableCell className="text-white">{booking.airline}</TableCell>
                        <TableCell className="text-white">${booking.price}</TableCell>
                        <TableCell>
                          <Badge className="bg-[#22C55E] text-white">Completed</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Budget */}
          <TabsContent value="budget" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-[#111D33] border-[#1A2740]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#94A3B8]">Annual Budget</p>
                      <p className="text-2xl font-bold text-white">$250,000</p>
                    </div>
                    <DollarSign className="w-8 h-8 text-[#3B82F6]" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[#111D33] border-[#1A2740]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#94A3B8]">YTD Spend</p>
                      <p className="text-2xl font-bold text-[#F59E0B]">$42,380</p>
                    </div>
                    <DollarSign className="w-8 h-8 text-[#F59E0B]" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[#111D33] border-[#1A2740]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#94A3B8]">Remaining</p>
                      <p className="text-2xl font-bold text-[#22C55E]">$207,620</p>
                    </div>
                    <DollarSign className="w-8 h-8 text-[#22C55E]" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[#111D33] border-[#1A2740]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#94A3B8]">Total Bookings</p>
                      <p className="text-2xl font-bold text-white">23</p>
                      <p className="text-xs text-[#94A3B8]">This year</p>
                    </div>
                    <Plane className="w-8 h-8 text-[#94A3B8]" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top spenders */}
            <Card className="bg-[#111D33] border-[#1A2740]">
              <CardHeader>
                <CardTitle className="text-white">Spend by Crew Member (YTD)</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#1A2740]">
                      <TableHead className="text-[#94A3B8]">Crew Member</TableHead>
                      <TableHead className="text-[#94A3B8]">Trips</TableHead>
                      <TableHead className="text-[#94A3B8]">Total Spend</TableHead>
                      <TableHead className="text-[#94A3B8]">Avg per Trip</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { name: 'Emil Schwarz', trips: 3, total: 8450, avg: 2817 },
                      { name: 'Phillip Carter', trips: 4, total: 5200, avg: 1300 },
                      { name: 'Jack Sanguinetti', trips: 5, total: 4100, avg: 820 },
                      { name: 'Callum Brown', trips: 3, total: 3800, avg: 1267 },
                      { name: 'Charlotte Elizabeth Williams', trips: 2, total: 2100, avg: 1050 },
                    ].map((crew, i) => (
                      <TableRow key={i} className="border-[#1A2740]">
                        <TableCell className="text-white">{crew.name}</TableCell>
                        <TableCell className="text-white">{crew.trips}</TableCell>
                        <TableCell className="text-white font-bold">${crew.total.toLocaleString()}</TableCell>
                        <TableCell className="text-[#94A3B8]">${crew.avg.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Flight Search Modal */}
        <Dialog open={showSearchModal} onOpenChange={setShowSearchModal}>
          <DialogContent className="bg-[#111D33] border-[#1A2740] max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">Quick Flight Search</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[#94A3B8]">Crew Member</Label>
                <Select>
                  <SelectTrigger className="bg-[#1A2740] border-[#1A2740] text-white">
                    <SelectValue placeholder="Select crew member" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111D33] border-[#1A2740] max-h-[200px]">
                    {CREW_DRAAK.slice(0, 15).map((c, i) => (
                      <SelectItem key={i} value={c.name}>{c.name} ({c.level})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[#94A3B8]">Cabin Class</Label>
                <Select>
                  <SelectTrigger className="bg-[#1A2740] border-[#1A2740] text-white">
                    <SelectValue placeholder="Economy" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111D33] border-[#1A2740]">
                    <SelectItem value="economy">Economy</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[#94A3B8]">Origin (IATA)</Label>
                <Input className="bg-[#1A2740] border-[#1A2740] text-white" placeholder="AMS" />
              </div>
              <div>
                <Label className="text-[#94A3B8]">Destination (IATA)</Label>
                <Input className="bg-[#1A2740] border-[#1A2740] text-white" placeholder="NCE" />
              </div>
              <div>
                <Label className="text-[#94A3B8]">Departure Date</Label>
                <Input type="date" className="bg-[#1A2740] border-[#1A2740] text-white" />
              </div>
              <div>
                <Label className="text-[#94A3B8]">Return Date (optional)</Label>
                <Input type="date" className="bg-[#1A2740] border-[#1A2740] text-white" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSearchModal(false)} className="border-[#1A2740] text-[#94A3B8]">
                Cancel
              </Button>
              <Button className="bg-[#3B82F6] gap-1" onClick={() => setShowSearchModal(false)}>
                <Search className="w-4 h-4" /> Search Flights
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default FlightsTravelPage;
