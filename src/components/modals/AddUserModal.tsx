import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: 'active' | 'inactive' | 'pending';
  last_login?: string;
  vessels_access?: string[];
  created_at: string;
}

interface AddUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserAdded: (user: User) => void;
  editUser?: User | null;
}

const vessels = [
  'MV Atlantic Pioneer', 'MV Ocean Explorer', 'MV North Star', 'MV Pacific Voyager',
  'MV Eastern Dawn', 'MV Iron Duke', 'MV Grain Master', 'MV Coal Express'
];

const AddUserModal: React.FC<AddUserModalProps> = ({
  open,
  onOpenChange,
  onUserAdded,
  editUser
}) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    first_name: editUser?.first_name || '',
    last_name: editUser?.last_name || '',
    email: editUser?.email || '',
    role: editUser?.role || '',
    status: editUser?.status || 'pending' as const,
    vessels_access: editUser?.vessels_access || []
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validation
    if (!formData.first_name || !formData.last_name || !formData.email || !formData.role) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    try {
      const newUser: User = {
        id: editUser?.id || `user-${Date.now()}`,
        ...formData,
        last_login: editUser?.last_login,
        created_at: editUser?.created_at || new Date().toISOString()
      };

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      onUserAdded(newUser);
      
      toast({
        title: editUser ? 'User Updated' : 'User Added',
        description: `${formData.first_name} ${formData.last_name} has been ${editUser ? 'updated' : 'added'} successfully.`,
      });

      // Reset form
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        role: '',
        status: 'pending',
        vessels_access: []
      });

      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save user. Please try again.',
        variant: 'destructive',
      });
    }

    setLoading(false);
  };

  const handleVesselAccessChange = (vessel: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      vessels_access: checked
        ? [...(prev.vessels_access || []), vessel]
        : (prev.vessels_access || []).filter(v => v !== vessel)
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editUser ? 'Edit User' : 'Add New User'}
          </DialogTitle>
          <DialogDescription>
            {editUser ? 'Update user information and access permissions.' : 'Create a new user account with access permissions.'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData(prev => ({...prev, first_name: e.target.value}))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name *</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData(prev => ({...prev, last_name: e.target.value}))}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({...prev, email: e.target.value}))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select value={formData.role} onValueChange={(value) => setFormData(prev => ({...prev, role: value}))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="master">Master</SelectItem>
                  <SelectItem value="chief_engineer">Chief Engineer</SelectItem>
                  <SelectItem value="chief_officer">Chief Officer</SelectItem>
                  <SelectItem value="crew">Crew</SelectItem>
                  <SelectItem value="dpa">DPA</SelectItem>
                  <SelectItem value="shore_management">Shore Management</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value: any) => setFormData(prev => ({...prev, status: value}))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Vessel Access</Label>
            <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded p-2">
              {vessels.map((vessel) => (
                <div key={vessel} className="flex items-center space-x-2">
                  <Checkbox
                    id={vessel}
                    checked={(formData.vessels_access || []).includes(vessel)}
                    onCheckedChange={(checked) => handleVesselAccessChange(vessel, !!checked)}
                  />
                  <Label htmlFor={vessel} className="text-sm cursor-pointer">
                    {vessel}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : (editUser ? 'Update User' : 'Add User')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddUserModal;