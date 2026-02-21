import React from 'react';
import { User, Camera, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { SectionHeader, SettingsCard, FormField, useSettingsToast } from '@/modules/settings/components/common';

const ProfileSection: React.FC = () => {
  const { profile } = useAuth();
  const { success } = useSettingsToast();

  const initials = profile 
    ? `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase()
    : 'U';

  const handleSave = () => {
    success('Profile Updated', 'Your changes have been saved successfully.');
  };

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="My Profile"
        description="Manage your personal information and preferences"
        icon={User}
      />

      {/* Profile Photo */}
      <SettingsCard
        title="Profile Photo"
        description="Your photo will be visible to other users in the system"
      >
        <div className="flex items-center gap-6">
          <Avatar className="h-20 w-20">
            <AvatarImage src="" alt={profile?.first_name} />
            <AvatarFallback className="text-xl bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <Button variant="outline" size="sm">
              <Camera className="h-4 w-4 mr-2" />
              Change Photo
            </Button>
            <p className="text-xs text-muted-foreground">JPG, PNG or GIF. Max 2MB</p>
          </div>
        </div>
      </SettingsCard>

      {/* Personal Information */}
      <SettingsCard
        title="Personal Information"
        description="Update your personal details here"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              id="firstName"
              label="First Name"
              defaultValue={profile?.first_name || ''}
              placeholder="Enter first name"
            />
            <FormField
              id="lastName"
              label="Last Name"
              defaultValue={profile?.last_name || ''}
              placeholder="Enter last name"
            />
          </div>

          <FormField
            id="email"
            label="Email Address"
            type="email"
            defaultValue={profile?.email || ''}
            placeholder="Enter email"
            disabled
            hint="Email cannot be changed. Contact support if needed."
          />

          <FormField
            id="role"
            label="Role"
            defaultValue={profile?.role?.replace('_', ' ').toUpperCase() || ''}
            disabled
          />

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
};

export default ProfileSection;
