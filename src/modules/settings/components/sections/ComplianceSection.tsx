import React, { useState } from 'react';
import { Shield, Bell, Clock, AlertTriangle, Save, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/shared/hooks/use-toast';

interface ComplianceSettings {
  certificateReminders: number[];
  drillFrequency: number;
  drillGracePeriod: number;
  minRestIn24h: number;
  minRestIn7Days: number;
  maxWorkIn24h: number;
  redAlertEscalation: number;
  orangeAlertEscalation: number;
  maxRedSnoozes: number;
  maxOrangeSnoozes: number;
}

const DEFAULT_SETTINGS: ComplianceSettings = {
  certificateReminders: [90, 60, 30, 7],
  drillFrequency: 30,
  drillGracePeriod: 7,
  minRestIn24h: 10,
  minRestIn7Days: 77,
  maxWorkIn24h: 14,
  redAlertEscalation: 30,
  orangeAlertEscalation: 24,
  maxRedSnoozes: 2,
  maxOrangeSnoozes: 3
};

const ComplianceSection: React.FC = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ComplianceSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const updateSetting = <K extends keyof ComplianceSettings>(
    key: K, 
    value: ComplianceSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const updateReminderDay = (index: number, value: number) => {
    const newReminders = [...settings.certificateReminders];
    newReminders[index] = value;
    updateSetting('certificateReminders', newReminders);
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    setHasChanges(false);
    toast({
      title: 'Compliance Settings Saved',
      description: 'Your compliance configuration has been updated.',
    });
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    setHasChanges(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Compliance</h2>
          <p className="text-muted-foreground mt-1">Configure compliance thresholds and reminder settings</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Certificate Reminder Windows */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Certificate Reminder Windows
          </CardTitle>
          <CardDescription>
            Configure when crew and vessel receive certificate expiry reminders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {settings.certificateReminders.map((days, index) => (
              <div key={index} className="p-4 border rounded-lg text-center bg-muted/30">
                <div className="flex items-center justify-center gap-1">
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={days}
                    onChange={(e) => updateReminderDay(index, parseInt(e.target.value) || 0)}
                    className="text-2xl font-bold text-primary w-20 text-center border-0 bg-transparent h-auto p-0"
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-1">days before</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Reminder {index + 1}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Reminders are sent at each interval before certificate expiry
          </p>
        </CardContent>
      </Card>

      {/* Drill Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Drill Requirements
          </CardTitle>
          <CardDescription>
            Set drill frequency and grace period for compliance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="drillFrequency">Drill Frequency (days)</Label>
              <Input
                id="drillFrequency"
                type="number"
                min={1}
                max={90}
                value={settings.drillFrequency}
                onChange={(e) => updateSetting('drillFrequency', parseInt(e.target.value) || 30)}
              />
              <p className="text-xs text-muted-foreground">
                Maximum days between required drills
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="drillGrace">Grace Period (days)</Label>
              <Input
                id="drillGrace"
                type="number"
                min={0}
                max={30}
                value={settings.drillGracePeriod}
                onChange={(e) => updateSetting('drillGracePeriod', parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Extra days allowed before drill becomes overdue
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hours of Rest Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Hours of Rest Thresholds
          </CardTitle>
          <CardDescription>
            STCW rest requirements configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="minRest24">Minimum Rest in 24h (hours)</Label>
              <Input
                id="minRest24"
                type="number"
                min={6}
                max={24}
                value={settings.minRestIn24h}
                onChange={(e) => updateSetting('minRestIn24h', parseInt(e.target.value) || 10)}
              />
              <p className="text-xs text-muted-foreground">
                STCW default: 10 hours
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="minRest7d">Minimum Rest in 7 Days (hours)</Label>
              <Input
                id="minRest7d"
                type="number"
                min={50}
                max={120}
                value={settings.minRestIn7Days}
                onChange={(e) => updateSetting('minRestIn7Days', parseInt(e.target.value) || 77)}
              />
              <p className="text-xs text-muted-foreground">
                STCW default: 77 hours
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxWork24">Maximum Work in 24h (hours)</Label>
              <Input
                id="maxWork24"
                type="number"
                min={8}
                max={18}
                value={settings.maxWorkIn24h}
                onChange={(e) => updateSetting('maxWorkIn24h', parseInt(e.target.value) || 14)}
              />
              <p className="text-xs text-muted-foreground">
                STCW default: 14 hours
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert Escalation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Alert Escalation Rules
          </CardTitle>
          <CardDescription>
            Configure how alerts escalate and snooze limits
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Red Alerts */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-destructive" />
                <span className="font-medium">Red (Critical) Alerts</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ml-5">
                <div className="space-y-2">
                  <Label htmlFor="redEscalation">Escalate After (minutes)</Label>
                  <Input
                    id="redEscalation"
                    type="number"
                    min={5}
                    max={120}
                    value={settings.redAlertEscalation}
                    onChange={(e) => updateSetting('redAlertEscalation', parseInt(e.target.value) || 30)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="redSnoozes">Maximum Snoozes</Label>
                  <Input
                    id="redSnoozes"
                    type="number"
                    min={0}
                    max={5}
                    value={settings.maxRedSnoozes}
                    onChange={(e) => updateSetting('maxRedSnoozes', parseInt(e.target.value) || 2)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Orange Alerts */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span className="font-medium">Orange (High Priority) Alerts</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ml-5">
                <div className="space-y-2">
                  <Label htmlFor="orangeEscalation">Escalate After (hours)</Label>
                  <Input
                    id="orangeEscalation"
                    type="number"
                    min={1}
                    max={72}
                    value={settings.orangeAlertEscalation}
                    onChange={(e) => updateSetting('orangeAlertEscalation', parseInt(e.target.value) || 24)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orangeSnoozes">Maximum Snoozes</Label>
                  <Input
                    id="orangeSnoozes"
                    type="number"
                    min={0}
                    max={10}
                    value={settings.maxOrangeSnoozes}
                    onChange={(e) => updateSetting('maxOrangeSnoozes', parseInt(e.target.value) || 3)}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ComplianceSection;
