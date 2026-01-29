import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { usePermissionsStore } from '@/store/permissionsStore';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  company_id: string | null;
  role: 'master' | 'chief_engineer' | 'chief_officer' | 'crew' | 'dpa' | 'shore_management';
  created_at: string;
  updated_at: string;
}

// Permission types for granular access control (legacy - to be migrated to RBAC)
type Permission = 
  | 'all'
  | 'vessel_read' | 'vessel_write'
  | 'crew_read' | 'crew_write'
  | 'ism_read' | 'ism_write'
  | 'maintenance_read' | 'maintenance_write'
  | 'documents_read' | 'documents_write'
  | 'certificates_read' | 'certificates_write'
  | 'alerts_read' | 'alerts_write'
  | 'admin_read' | 'admin_write'
  | 'self_read' | 'self_write';

// Role-based permission mapping (legacy fallback)
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  dpa: ['all'],
  shore_management: ['all'],
  master: [
    'vessel_read', 'vessel_write',
    'crew_read', 'crew_write',
    'ism_read', 'ism_write',
    'certificates_read', 'certificates_write',
    'documents_read',
    'alerts_read', 'alerts_write',
  ],
  chief_engineer: [
    'vessel_read',
    'maintenance_read', 'maintenance_write',
    'ism_read', 'ism_write',
    'documents_read',
    'alerts_read',
  ],
  chief_officer: [
    'vessel_read',
    'ism_read', 'ism_write',
    'crew_read',
    'certificates_read',
    'documents_read',
    'alerts_read',
  ],
  crew: [
    'self_read', 'self_write',
    'documents_read',
  ],
};

// Module access by role (legacy fallback - RBAC will take precedence when available)
const MODULE_ACCESS: Record<string, string[]> = {
  'dashboard': ['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer', 'crew'],
  'fleet-map': ['dpa', 'shore_management', 'master'],
  'vessels': ['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer'],
  'crew': ['dpa', 'shore_management', 'master', 'chief_officer'],
  'ism': ['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer'],
  'certificates': ['dpa', 'shore_management', 'master', 'chief_officer'],
  'documents': ['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer', 'crew'],
  'maintenance': ['dpa', 'shore_management', 'master', 'chief_engineer'],
  'alerts': ['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer'],
  'settings': ['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer', 'crew'],
  'admin': ['dpa', 'shore_management'],
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (data: SignUpData) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  // RBAC methods
  hasPermission: (permission: Permission) => boolean;
  canAccessModule: (moduleId: string) => boolean;
  userRole: string | null;
}

interface SignUpData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName: string;
  role: Profile['role'];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  
  // RBAC store integration
  const { loadPermissions, reset: resetPermissions, isInitialized: rbacInitialized, canView } = usePermissionsStore();

  const userRole = profile?.role ?? null;

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data as Profile | null;
  };

  // Check if user has a specific permission
  const hasPermission = useCallback((permission: Permission): boolean => {
    if (!userRole) return false;
    
    const rolePermissions = ROLE_PERMISSIONS[userRole] || [];
    
    // 'all' permission grants everything
    if (rolePermissions.includes('all')) return true;
    
    return rolePermissions.includes(permission);
  }, [userRole]);

  // Check if user can access a specific module - uses RBAC when available, falls back to legacy
  const canAccessModule = useCallback((moduleId: string): boolean => {
    // Try RBAC first if initialized
    if (rbacInitialized) {
      // Map navigation module IDs to RBAC module keys
      const moduleKeyMap: Record<string, string> = {
        'dashboard': 'dashboard',
        'fleet-map': 'fleet',
        'vessels': 'vessels',
        'crew': 'crew_roster',
        'ism': 'ism',
        'certificates': 'vessel_certificates',
        'documents': 'documents',
        'maintenance': 'maintenance',
        'alerts': 'dashboard', // Alerts are part of dashboard permissions
        'settings': 'settings',
        'admin': 'settings',
        'insurance': 'insurance',
        'hr': 'hr',
        'reports': 'reports',
      };
      
      const rbacKey = moduleKeyMap[moduleId] || moduleId;
      const hasRBACAccess = canView(rbacKey);
      if (hasRBACAccess) return true;
    }
    
    // Fallback to legacy system
    if (!userRole) return false;
    
    const allowedRoles = MODULE_ACCESS[moduleId];
    
    // If module is not in the access list, allow by default
    if (!allowedRoles) return true;
    
    return allowedRoles.includes(userRole);
  }, [userRole, rbacInitialized, canView]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer profile fetch with setTimeout
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id).then(setProfile);
            // Load RBAC permissions when user logs in
            loadPermissions();
          }, 0);
        } else {
          setProfile(null);
          // Reset RBAC permissions when user logs out
          resetPermissions();
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id).then((p) => {
          setProfile(p);
          setLoading(false);
        });
        // Load RBAC permissions for existing session
        loadPermissions();
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadPermissions, resetPermissions]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  };

  const signUp = async (data: SignUpData) => {
    try {
      // First, create the user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('No user returned from sign up');

      // Create the company
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .insert({ name: data.companyName })
        .select()
        .single();

      if (companyError) throw companyError;

      // Create the profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: authData.user.id,
          email: data.email,
          first_name: data.firstName,
          last_name: data.lastName,
          company_id: companyData.id,
          role: data.role,
        });

      if (profileError) throw profileError;

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error ? new Error(error.message) : null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
        hasPermission,
        canAccessModule,
        userRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
