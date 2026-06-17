import React from 'react';
import { Route } from 'react-router-dom';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';

const Test = () => <div className="p-8">Test route OK</div>;

export const newBuildRoutes = (
  <>
    <Route
      path="/yard/new-build/test"
      element={
        <ProtectedRoute>
          <DashboardLayout>
            <Test />
          </DashboardLayout>
        </ProtectedRoute>
      }
    />
  </>
);
