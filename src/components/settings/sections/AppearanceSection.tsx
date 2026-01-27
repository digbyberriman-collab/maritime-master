import React from 'react';
import { Palette, Sun, Moon, Monitor, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

const AppearanceSection: React.FC = () => {
  const [theme, setTheme] = React.useState<'light' | 'dark' | 'system'>('light');
  const [density, setDensity] = React.useState<'comfortable' | 'compact'>('comfortable');

  const themes = [
    { id: 'light', label: 'Light', icon: Sun, description: 'Classic light mode' },
    { id: 'dark', label: 'Dark', icon: Moon, description: 'Easy on the eyes' },
    { id: 'system', label: 'System', icon: Monitor, description: 'Match system settings' },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Appearance</h2>
        <p className="text-muted-foreground mt-1">Customize the look and feel of the application</p>
      </div>

      {/* Theme Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Theme
          </CardTitle>
          <CardDescription>Select your preferred color theme</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {themes.map((t) => {
              const Icon = t.icon;
              const isSelected = theme === t.id;

              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    'relative flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all',
                    'hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20',
                    isSelected ? 'border-primary bg-primary/5' : 'border-border'
                  )}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={cn(
                    'p-3 rounded-full',
                    isSelected ? 'bg-primary/10' : 'bg-muted'
                  )}>
                    <Icon className={cn('h-6 w-6', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Display Density */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Display Density</CardTitle>
          <CardDescription>Adjust spacing and sizing of elements</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={density} onValueChange={(v) => setDensity(v as typeof density)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="comfortable" id="comfortable" />
              <Label htmlFor="comfortable" className="cursor-pointer">
                <span className="font-medium">Comfortable</span>
                <span className="text-sm text-muted-foreground ml-2">More spacing, easier to read</span>
              </Label>
            </div>
            <div className="flex items-center space-x-2 mt-3">
              <RadioGroupItem value="compact" id="compact" />
              <Label htmlFor="compact" className="cursor-pointer">
                <span className="font-medium">Compact</span>
                <span className="text-sm text-muted-foreground ml-2">More content, less spacing</span>
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Accent Color */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Accent Color</CardTitle>
          <CardDescription>Choose the primary accent color</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            {['#1e3a8a', '#0891b2', '#059669', '#7c3aed', '#dc2626', '#ea580c'].map((color) => (
              <button
                key={color}
                className="w-10 h-10 rounded-full border-2 border-transparent hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Note: Accent color customization coming soon
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AppearanceSection;
