import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Bell, Award, Sparkles, Trophy } from 'lucide-react';
import clsx from 'clsx';

export const Notifications = () => {
  const { userData } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (!userData?.id) return;
    
    const q = query(
      collection(db, 'notifications_inbox'), 
      where('userId', '==', userData.id)
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setNotifications(list);
    }, (error) => {
      console.error("Notifications snapshot error:", error);
    });

    return () => unsub();
  }, [userData]);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications_inbox', id), {
        read: true
      });
    } catch (error) {
      console.error(error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const batch = writeBatch(db);
      notifications.filter(n => !n.read).forEach(n => {
        const ref = doc(db, 'notifications_inbox', n.id);
        batch.update(ref, { read: true });
      });
      await batch.commit();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">صندوق الإشعارات والجوائز</h2>
            <p className="text-xs text-slate-500 mt-0.5">سجل التنبيهات، النقاط، والمراكز المتقدمة</p>
          </div>
        </div>
        {notifications.some(n => !n.read) && (
          <button 
            onClick={markAllAsRead}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-4 py-2.5 rounded-xl transition-colors"
          >
            تحديد الكل كمقروء
          </button>
        )}
      </div>

      <div className="space-y-3">
        {notifications.map(notif => {
          const isAward = notif.isAward;

          return (
            <div 
              key={notif.id} 
              onClick={() => !notif.read && markAsRead(notif.id)}
              className={clsx(
                "p-5 rounded-3xl border transition-all flex gap-4 cursor-pointer hover:shadow-md",
                isAward
                  ? "bg-gradient-to-r from-amber-50/90 via-yellow-50/50 to-orange-50/90 border-amber-300 shadow-sm"
                  : !notif.read 
                    ? "bg-white border-indigo-100 shadow-sm" 
                    : "bg-slate-50 border-slate-100 opacity-80"
              )}
            >
              {isAward ? (
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Trophy className="w-5 h-5" />
                </div>
              ) : (
                <div className={clsx(
                  "w-2 rounded-full shrink-0",
                  notif.colorTag === 'red' ? 'bg-red-500' : 
                  notif.colorTag === 'green' ? 'bg-green-500' : 
                  notif.colorTag === 'yellow' ? 'bg-yellow-500' : 'bg-blue-500'
                )}></div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-2">
                    <h4 className={clsx("font-bold text-sm", isAward ? "text-amber-950 font-black" : !notif.read ? "text-slate-900" : "text-slate-700")}>
                      {notif.title}
                    </h4>
                    {isAward && (
                      <span className="px-2 py-0.5 bg-amber-200/80 text-amber-900 text-[10px] font-black rounded-md">
                        وسام التميز الشهري
                      </span>
                    )}
                  </div>
                  {!notif.read && <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full shrink-0 mt-1"></div>}
                </div>
                <p className={clsx("text-xs leading-relaxed", isAward ? "text-amber-900 font-medium" : !notif.read ? "text-slate-600 font-medium" : "text-slate-500")}>
                  {notif.body}
                </p>
                <p className="text-[10px] text-slate-400 mt-2.5 font-mono">
                  {new Date(notif.createdAt).toLocaleString('ar-EG', { dateStyle: 'long', timeStyle: 'short' })}
                </p>
              </div>
            </div>
          );
        })}
        {notifications.length === 0 && (
          <div className="text-center p-12 bg-white rounded-3xl text-slate-500 border border-slate-100 border-dashed">
            <Bell className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-xs">لا توجد إشعارات في الوقت الحالي.</p>
          </div>
        )}
      </div>
    </div>
  );
};

