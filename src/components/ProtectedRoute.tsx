import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const ProtectedRoute = () => {
  const { currentUser, userData, loading } = useAuth();
  const location = useLocation();

  if (loading || (currentUser && !userData)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-600 gap-3">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-bold text-sm text-slate-700">جاري تحميل الحساب...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const isFirstLogin = userData && userData.role !== 'admin' && userData.isFirstLogin === true;

  if (isFirstLogin && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  if (!isFirstLogin && location.pathname === '/setup') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

