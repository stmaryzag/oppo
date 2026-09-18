import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, User, Bell, LogOut, Shield, UserCheck, Trophy, BookOpen, Award } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import clsx from 'clsx';
import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PushNotificationBanner } from '../notifications/PushNotificationBanner';

export const AppLayout = () => {
  const { userData, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userData?.id) return;
    const q = query(collection(db, 'notifications_inbox'), where('userId', '==', userData.id), where('read', '==', false));
    const unsub = onSnapshot(q, (snapshot) => {
      setUnreadCount(snapshot.size);
    });
    return () => unsub();
  }, [userData]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const roleBadge = (() => {
    switch (userData?.role) {
      case 'admin':
        return { label: 'الادمن الرئيسي', className: 'bg-red-50 text-red-700 border border-red-100' };
      case 'chorus_admin':
        return { label: 'أدمن الخورس', className: 'bg-purple-50 text-purple-700 border border-purple-200 font-black' };
      case 'assistant':
        return { label: 'خادم الخورس', className: 'bg-amber-50 text-amber-800 border border-amber-200' };
      case 'parent':
        return { label: 'ولي أمر', className: 'bg-blue-50 text-blue-700 border border-blue-200' };
      default:
        return { label: 'شماس', className: 'bg-indigo-50 text-indigo-700 border border-indigo-100' };
    }
  })();

  const navItems = [
    { label: 'الرئيسية', icon: Home, path: '/' },
    { label: 'المناهج والألحان', icon: BookOpen, path: '/study' },
    { label: 'الاختبارات', icon: Award, path: '/quizzes' },
    ...(userData?.role === 'admin' || userData?.role === 'chorus_admin' || userData?.role === 'assistant' 
      ? [{ label: 'الحضور السريع', icon: UserCheck, path: '/admin/attendance' }] 
      : []),
    { label: 'الإشعارات', icon: Bell, path: '/notifications', badge: unreadCount },
    ...(userData?.role === 'admin' 
      ? [{ label: 'لوحة الإدارة', icon: Shield, path: '/admin' }] 
      : userData?.role === 'chorus_admin'
      ? [{ label: 'لوحة الخورس', icon: Shield, path: '/admin/chorus' }]
      : []),
    { label: 'حسابي', icon: User, path: '/profile' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white/95 backdrop-blur-md shadow-xs border-b border-slate-100 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="relative">
            {userData?.photoUrl ? (
              <img src={userData.photoUrl} alt={userData.fullName} className="w-10 h-10 rounded-full object-cover border-2 border-indigo-100 shadow-xs" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                {userData?.fullName?.charAt(0) || 'ش'}
              </div>
            )}
            <span className="absolute bottom-0 left-0 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white"></span>
          </div>

          <div className="min-w-0">
            <h1 className="font-extrabold text-slate-800 text-sm truncate">{userData?.fullName}</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${roleBadge.className}`}>
                {roleBadge.label}
              </span>
              <span className="text-[10px] text-slate-400 font-mono hidden sm:inline" dir="ltr">@{userData?.username}</span>
            </div>
          </div>
        </div>

        {/* Desktop Nav Items */}
        <div className="hidden md:flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/60">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={clsx(
                  "relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all select-none",
                  isActive 
                    ? "bg-white text-indigo-600 shadow-xs" 
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
                {item.badge && item.badge > 0 ? (
                  <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Logout Button */}
        <button 
          onClick={handleLogout} 
          title="تسجيل الخروج"
          className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-24 md:pb-8 p-4 sm:p-6 max-w-7xl w-full mx-auto">
        <PushNotificationBanner />
        <Outlet />
      </main>

      {/* Bottom Navigation (Mobile Only) */}
      <nav className="md:hidden fixed bottom-0 w-full bg-white/95 backdrop-blur-md border-t border-slate-200/80 z-30 pb-safe shadow-lg">
        <div className="flex items-center justify-around p-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={clsx(
                  "relative flex flex-col items-center justify-center p-2 min-w-[56px] gap-1 rounded-2xl transition-all",
                  isActive ? "text-indigo-600 font-black" : "text-slate-400 hover:text-slate-600 font-bold"
                )}
              >
                <div className="relative">
                  <Icon className={clsx("w-5 h-5 transition-transform", isActive && "scale-110")} />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2 bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full min-w-[16px] text-center shadow-xs">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  ) : null}
                </div>
                <span className="text-[10px] leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
