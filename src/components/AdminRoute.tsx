import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const AdminRoute = () => {
  const { userData, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Only allow admin or assistant to access the admin routes
  if (userData && (userData.role === 'admin' || userData.role === 'assistant')) {
    return <Outlet />;
  }

  // Otherwise, redirect to the home page
  return <Navigate to="/" replace />;
};
