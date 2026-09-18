import React, { useState, useEffect } from 'react';
import { Bell, CheckCircle2, Sparkles, X, Volume2 } from 'lucide-react';
import { requestPushPermission, isPushPermissionGranted } from '../../utils/onesignal';
import { useAuth } from '../../contexts/AuthContext';

export const PushNotificationBanner: React.FC = () => {
  const { userData } = useAuth();
  const [showBanner, setShowBanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [granted, setGranted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // If not logged in, don't show yet
    if (!userData?.id) return;

    // Check if permission already granted
    if (isPushPermissionGranted()) {
      setGranted(true);
      return;
    }

    // Check local storage if user dismissed it recently
    const dismissed = localStorage.getItem('push_banner_dismissed_at');
    if (dismissed) {
      const diffHours = (Date.now() - Number(dismissed)) / (1000 * 60 * 60);
      if (diffHours < 48) {
        return; // Don't annoy user if dismissed within 48h
      }
    }

    // Show banner after 2 seconds delay for a smooth experience
    const timer = setTimeout(() => {
      setShowBanner(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, [userData]);

  const handleEnablePush = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const isOk = await requestPushPermission();
      if (isOk || isPushPermissionGranted()) {
        setGranted(true);
        setTimeout(() => {
          setShowBanner(false);
        }, 3000);
      } else {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
        
        if (isIOS && !isStandalone) {
          setErrorMsg('أجهزة الآيفون تتطلب إضافة التطبيق للشاشة الرئيسية أولاً (Share -> Add to Home Screen) لتتمكن من تفعيل الإشعارات.');
        } else {
          setErrorMsg('يرجى السماح بالإشعارات من إعدادات المتصفح.');
        }
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('حدث خطأ، تأكد من إعدادات المتصفح.');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('push_banner_dismissed_at', String(Date.now()));
  };

  if (!showBanner || granted) {
    if (granted && showBanner) {
      return (
        <div className="bg-emerald-600 text-white px-4 py-2.5 rounded-2xl shadow-sm mb-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-200" />
            <span>تم تفعيل إشعارات شريط الهاتف بنجاح! ستصلك التنبيهات حتى والتطبيق مغلق.</span>
          </div>
          <button onClick={() => setShowBanner(false)} className="text-emerald-200 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-purple-800 text-white p-4 sm:p-5 rounded-3xl shadow-md border border-indigo-500/30 mb-5 animate-in fade-in slide-in-from-top-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-white/15 backdrop-blur-md rounded-2xl shrink-0 text-amber-300 ring-1 ring-white/20">
            <Bell className="w-6 h-6 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-extrabold text-sm sm:text-base">تفعيل إشعارات شريط الهاتف 📲</h4>
              <span className="px-2 py-0.5 bg-amber-400 text-slate-900 text-[10px] font-black rounded-full shadow-xs">
                موصى به
              </span>
            </div>
            <p className="text-xs text-indigo-100/90 mt-1 leading-relaxed max-w-xl">
              فعل الاشعارات لتعرف كل ما يخص تطبيق الشمامسة والمسابقة الخاصة به أ/ مايكل نبيل
            </p>
            {errorMsg && (
              <p className="text-xs text-rose-300 font-bold mt-2 bg-rose-500/20 p-2 rounded-lg border border-rose-500/30">
                ⚠️ {errorMsg}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-3 py-2 text-xs text-indigo-200 hover:text-white rounded-xl hover:bg-white/10 transition-all font-bold"
          >
            لاحقاً
          </button>
          <button
            type="button"
            onClick={handleEnablePush}
            disabled={loading}
            className="px-4 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-95 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {loading ? 'جارٍ التفعيل...' : 'تفعيل الإشعارات الآن'}
          </button>
        </div>
      </div>
    </div>
  );
};
