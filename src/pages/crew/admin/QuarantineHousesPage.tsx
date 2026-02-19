import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Home, MapPin, Plus, Wifi, Car, Utensils, 
  Calendar, Search, Loader2, Users, DollarSign
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface QuarantineHouse {
  id: string;
  name: string;
  address_line1: string;
  city: string;
  country: string;
  total_rooms: number;
  total_beds: number;
  daily_rate: number | null;
  rate_currency: string;
  wifi_available: boolean;
  kitchen_available: boolean;
  parking_available: boolean;
  airport_transfer_available: boolean;
  includes_meals: boolean;
  is_active: boolean;
}

export default function QuarantineHousesPage() {
  const [houses, setHouses] = useState<QuarantineHouse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { 
    loadHouses(); 
  }, []);

  async function loadHouses() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('quarantine_houses')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setHouses(data || []);
    } catch (error) {
      console.error('Failed to load houses:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredHouses = houses.filter(h => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      h.name.toLowerCase().includes(searchLower) ||
      h.city.toLowerCase().includes(searchLower) ||
      h.country.toLowerCase().includes(searchLower)
    );
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Home className="w-6 h-6" />
            Quarantine Houses
          </h1>
          <p className="text-muted-foreground">
            Manage crew accommodation for quarantine and transit
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/crew/admin/quarantine/bookings">
              <Calendar className="w-4 h-4 mr-2" />
              Bookings
            </Link>
          </Button>
          <Button asChild>
            <Link to="/crew/admin/quarantine/new">
              <Plus className="w-4 h-4 mr-2" />
              Add House
            </Link>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, city, or country..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Houses Grid */}
      {filteredHouses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Home className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No quarantine houses found</p>
            <Button asChild className="mt-4">
              <Link to="/crew/admin/quarantine/new">Add First House</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredHouses.map(house => (
            <Card key={house.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{house.name}</CardTitle>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" />
                      {house.city}, {house.country}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {house.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Capacity & Rate */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span>{house.total_rooms} Rooms / {house.total_beds} Beds</span>
                  </div>
                  {house.daily_rate && (
                    <div className="flex items-center gap-1 font-medium">
                      <DollarSign className="w-4 h-4" />
                      <span>{house.rate_currency} {house.daily_rate}/night</span>
                    </div>
                  )}
                </div>

                {/* Amenities */}
                <div className="flex flex-wrap gap-2">
                  {house.wifi_available && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Wifi className="w-3 h-3" />
                      WiFi
                    </Badge>
                  )}
                  {house.kitchen_available && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Utensils className="w-3 h-3" />
                      Kitchen
                    </Badge>
                  )}
                  {house.parking_available && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Car className="w-3 h-3" />
                      Parking
                    </Badge>
                  )}
                  {house.includes_meals && (
                    <Badge variant="outline" className="text-xs">
                      Meals Included
                    </Badge>
                  )}
                  {house.airport_transfer_available && (
                    <Badge variant="outline" className="text-xs">
                      Airport Transfer
                    </Badge>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1" asChild>
                    <Link to={`/crew/admin/quarantine/bookings?house=${house.id}`}>
                      View Bookings
                    </Link>
                  </Button>
                  <Button size="sm" className="flex-1" asChild>
                    <Link to={`/crew/admin/quarantine/bookings?house=${house.id}&new=true`}>
                      Book Room
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
