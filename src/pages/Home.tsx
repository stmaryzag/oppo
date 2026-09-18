import { useAuth } from '../contexts/AuthContext';
import { DeaconDashboard } from './dashboard/DeaconDashboard';
import { ParentDashboard } from './dashboard/ParentDashboard';
import { AssistantDashboard } from './dashboard/AssistantDashboard';
import { AdminDashboard } from './admin/AdminDashboard';

export const Home = () => {
  const { userData, loading, currentUser } = useAuth();

  if (loading || (currentUser && !userData)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-500 gap-3">
        <div className="w-9 h-9 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-slate-600">جاري تحميل لوحة التحكم المخصصة...</p>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-500 gap-3">
        <div className="w-9 h-9 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-slate-600">جاري التحقق من الحساب...</p>
      </div>
    );
  }

  if (userData.role === 'admin') {
    return <AdminDashboard />;
  }

  if (userData.role === 'deacon') {
    return <DeaconDashboard />;
  }

  if (userData.role === 'parent') {
    return <ParentDashboard />;
  }
  
  if (userData.role === 'assistant') {
    return <AssistantDashboard />;
  }

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-slate-500 gap-2">
      <p className="text-sm font-bold text-slate-700">لم يتم تحديد دور الحساب</p>
      <p className="text-xs text-slate-400">يرجى التواصل مع مسؤول النظام</p>
    </div>
  );
};

