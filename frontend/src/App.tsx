import type { ReactElement } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { queryClient } from './lib/queryClient';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { IssueList } from './pages/IssueList';
import { QueryIndex } from './pages/QueryIndex';
import { ForcePasswordChange } from './pages/ForcePasswordChange';
import { AccountSettings } from './pages/AccountSettings';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminConfig } from './pages/admin/AdminConfig';
import { AdminQueries } from './pages/admin/AdminQueries';
import { AdminQueryEditor } from './pages/admin/AdminQueryEditor';
import { AdminBranding } from './pages/admin/AdminBranding';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminAuditLogs } from './pages/admin/AdminAuditLogs';

export function App(): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/force-password-change" element={<ForcePasswordChange />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<QueryIndex />} />
            <Route path="queries/:queryId" element={<IssueList />} />
            <Route path="account" element={<AccountSettings />} />
            <Route
              path="admin"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="config" replace />} />
              <Route path="config" element={<AdminConfig />} />
              <Route path="queries" element={<AdminQueries />} />
              <Route path="queries/:queryId" element={<AdminQueryEditor />} />
              <Route path="branding" element={<AdminBranding />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="audit-logs" element={<AdminAuditLogs />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
