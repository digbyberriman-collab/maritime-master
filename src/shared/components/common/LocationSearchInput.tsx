import React, { useState, useRef, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useGeocodingSearch, type GeocodingResult } from '@/shared/hooks/useGeocodingSearch';

interface LocationSearchInputProps {
  value: string;
  country: string;
  onSelect: (location: string, country: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

const LocationSearchInput: React.FC<LocationSearchInputProps> = ({
  value,
  country,
  onSelect,
  placeholder = 'Search location...',
  className = '',
  inputClassName = '',
}) => {
  const [search, setSearch] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: results = [], isLoading } = useGeocodingSearch(search);

  // Sync external value changes
  useEffect(() => {
    setSearch(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (result: GeocodingResult) => {
    setSearch(result.name);
    setShowDropdown(false);
    onSelect(result.name, result.country);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      <Input
        placeholder={placeholder}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setShowDropdown(true);
          // If user clears or types, reset the selection
          if (e.target.value !== value) {
            onSelect(e.target.value, country);
          }
        }}
        onFocus={() => search.length >= 2 && setShowDropdown(true)}
        className={`pl-8 ${inputClassName}`}
      />
      {showDropdown && search.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
          {isLoading && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Searching...</div>
          )}
          {!isLoading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No results found</div>
          )}
          {results.map((result, idx) => (
            <button
              key={`${result.osm_id}-${idx}`}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted text-xs"
              onClick={() => handleSelect(result)}
            >
              <span className="font-medium">{result.name}</span>
              {result.country && (
                <span className="text-muted-foreground">, {result.country}</span>
              )}
              <span className="text-muted-foreground block truncate text-[10px]">{result.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LocationSearchInput;
