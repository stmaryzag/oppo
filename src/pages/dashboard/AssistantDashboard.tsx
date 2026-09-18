import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Users, CheckCircle, Clock, Loader2, CreditCard, CheckCircle2, XCircle, UserCheck, Trash2, Search, Filter, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SubscriptionRecord } from '../../types';
import { subscribeSystemSettings } from '../../utils/systemSettings';
import { sendSubscriptionNotification } from '../../utils/notificationHelper';
import { awardAfteqadPointsOnAttendance, revertAfteqadPointsOnAttendanceCancel } from '../../utils/afetqadHelper';

export const AssistantDashboard = () => {
  const { userData } = useAuth();
  const navigate = useNavigate();
  
  const [deacons, setDeacons] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, SubscriptionRecord>>({});
  const [attendanceMap, setAttendanceMap] = useState<Record<string, boolean>>({});
  const [subscriptionPoints, setSubscriptionPoints] = useState<number>(300);
  
  const [selectedActivity, setSelectedActivity] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterScope, setFilterScope] = useState<'all' | 'my'>('all');
  const [attendanceLoadingId, setAttendanceLoadingId] = useState<string | null>(null);
  const [subLoading, setSubLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const now = new Date();
  const todayDateStr = now.toISOString().slice(0, 10);
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Subscribe to system settings
  useEffect(() => {
    const unsub = subscribeSystemSettings((cfg) => {
      setSubscriptionPoints(cfg.subscriptionPoints ?? 300);
    });
    return () => unsub();
  }, []);

  // Fetch Deacons & Activities & Subscriptions
  useEffect(() => {
    if (!userData?.id) return;
    
    // Fetch ALL active deacons so the assistant can record attendance for any deacon
    const qDeacons = query(collection(db, 'users'), where('role', '==', 'deacon'));
    const unsubDeacons = onSnapshot(qDeacons, (snap) => {
      setDeacons(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch active activities
    const qActivities = query(collection(db, 'activity_types'), where('active', '==', true));
    const unsubActivities = onSnapshot(qActivities, (snap) => {
      const acts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setActivities(acts);
      if (acts.length > 0 && !selectedActivity) {
        setSelectedActivity(acts[0].id);
      }
    });

    // Fetch subscriptions for current month
    const qSubs = query(collection(db, 'subscriptions'), where('monthKey', '==', currentMonthKey));
    const unsubSubs = onSnapshot(qSubs, (snap) => {
      const subMap: Record<string, SubscriptionRecord> = {};
      snap.docs.forEach(docSnap => {
        const data = docSnap.data() as SubscriptionRecord;
        subMap[data.deaconId] = { ...data, id: docSnap.id };
      });
      setSubscriptions(subMap);
    });

    return () => {
      unsubDeacons();
      unsubActivities();
      unsubSubs();
    };
  }, [userData, currentMonthKey]);

  // Fetch today's attendance for selected activity
  useEffect(() => {
    if (!selectedActivity) return;
    const fetchTodayAttendance = async () => {
      try {
        const q = query(
          collection(db, 'attendance_records'),
          where('activityTypeId', '==', selectedActivity)
        );
        const snap = await getDocs(q);
        const map: Record<string, boolean> = {};
        snap.docs.forEach(d => {
          const data = d.data();
          if (data.date && data.date.startsWith(todayDateStr)) {
            map[data.deaconId] = true;
          }
        });
        setAttendanceMap(map);
      } catch (e) {
        console.error(e);
      }
    };
    fetchTodayAttendance();
  }, [selectedActivity, todayDateStr]);

  const handleToggleAttendance = async (deacon: any) => {
    if (!selectedActivity) {
      alert('يرجى اختيار النشاط أولاً');
      return;
    }

    setAttendanceLoadingId(deacon.id);
    const isAttended = !!attendanceMap[deacon.id];
    const activity = activities.find(a => a.id === selectedActivity);
    const points = activity?.defaultPoints || 0;

    try {
      if (!isAttended) {
        // Record Attendance & Points
        const recordDate = `${todayDateStr}T${new Date().toTimeString().slice(0, 8)}Z`;
        await addDoc(collection(db, 'attendance_records'), {
          deaconId: deacon.id,
          activityTypeId: selectedActivity,
          activityName: activity?.name || 'نشاط',
          date: recordDate,
          status: 'confirmed',
          recordedBy: userData?.id,
          recordedByName: userData?.fullName || 'الخادم',
          timestamp: new Date().toISOString()
        });

        await addDoc(collection(db, 'points_log'), {
          deaconId: deacon.id,
          activityTypeId: selectedActivity,
          reason: `حضور: ${activity?.name || 'نشاط'}`,
          points,
          date: recordDate,
          addedBy: userData?.id,
          monthKey: currentMonthKey
        });

        // Award Afteqad points to deacons who contacted this attendee
        const rewarded = await awardAfteqadPointsOnAttendance(deacon.id, deacon.fullName, todayDateStr, userData?.id);

        setAttendanceMap(prev => ({ ...prev, [deacon.id]: true }));
        if (rewarded.length > 0) {
          setSuccessMsg(`تم تسجيل حضور ${deacon.fullName} (+${points} نقطة) ومكافأة ${rewarded.length} شماس قاموا بافتقاده ✨`);
        } else {
          setSuccessMsg(`تم تسجيل حضور ${deacon.fullName} (+${points} نقطة) ✅`);
        }
      } else {
        // Cancel attendance: Delete attendance record & remove points log
        const qAtt = query(
          collection(db, 'attendance_records'),
          where('deaconId', '==', deacon.id),
          where('activityTypeId', '==', selectedActivity)
        );
        const attSnap = await getDocs(qAtt);
        for (const d of attSnap.docs) {
          const data = d.data();
          if (data.date && data.date.startsWith(todayDateStr)) {
            await deleteDoc(doc(db, 'attendance_records', d.id));
          }
        }

        // Revert any Afteqad points awarded to callers
        await revertAfteqadPointsOnAttendanceCancel(deacon.id, todayDateStr);

        // Delete points log
        const qPts = query(
          collection(db, 'points_log'),
          where('deaconId', '==', deacon.id)
        );
        const ptsSnap = await getDocs(qPts);
        let deletedPointsCount = 0;
        for (const d of ptsSnap.docs) {
          const data = d.data();
          const matchesAct = (data.activityTypeId === selectedActivity) || (data.reason && data.reason.includes(activity?.name));
          const matchesDate = data.date && data.date.startsWith(todayDateStr);
          if (matchesAct && matchesDate) {
            deletedPointsCount += (data.points || 0);
            await deleteDoc(doc(db, 'points_log', d.id));
          }
        }

        if (deletedPointsCount === 0 && points > 0) {
          await addDoc(collection(db, 'points_log'), {
            deaconId: deacon.id,
            activityTypeId: selectedActivity,
            reason: `خصم لإلغاء حضور: ${activity?.name || 'نشاط'}`,
            points: -points,
            date: new Date().toISOString(),
            addedBy: userData?.id,
            monthKey: currentMonthKey
          });
        }

        setAttendanceMap(prev => {
          const next = { ...prev };
          delete next[deacon.id];
          return next;
        });
        setSuccessMsg(`تم إلغاء حضور ${deacon.fullName} وخصم النقاط بنجاح (-${points} نقطة)`);
      }

      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (error: any) {
      console.error(error);
      alert('حدث خطأ أثناء تعديل الحضور: ' + error.message);
    } finally {
      setAttendanceLoadingId(null);
    }
  };

  const handleToggleSubPayment = async (deacon: any) => {
    setSubLoading(deacon.id);
    const subDocId = `${deacon.id}_${currentMonthKey}`;
    const isPaid = !!subscriptions[deacon.id]?.paid;

    try {
      const nowIso = new Date().toISOString();
      await setDoc(doc(db, 'subscriptions', subDocId), {
        deaconId: deacon.id,
        deaconName: deacon.fullName,
        monthKey: currentMonthKey,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        amount: 30,
        paid: !isPaid,
        paidAt: !isPaid ? nowIso : null,
        recordedBy: userData?.id,
        recordedByName: userData?.fullName || 'الخادم'
      }, { merge: true });

      if (!isPaid) {
        // Add Subscription Points
        if (subscriptionPoints > 0) {
          await addDoc(collection(db, 'points_log'), {
            deaconId: deacon.id,
            reason: `سداد الاشتراك الشهري (${currentMonthKey})`,
            points: subscriptionPoints,
            date: nowIso,
            addedBy: userData?.id,
            monthKey: currentMonthKey,
            type: 'subscription_reward'
          });
        }

        // Send notifications to deacon & parent
        await sendSubscriptionNotification(
          deacon.id,
          currentMonthKey,
          userData?.fullName || 'الخادم',
          subscriptionPoints,
          30
        );

        setSuccessMsg(`تم تسجيل دفع اشتراك 30 ج لـ ${deacon.fullName} وإضافة +${subscriptionPoints} نقطة تشجيعية بنجاح ✨`);
      } else {
        // Revert Subscription Points
        const qPts = query(
          collection(db, 'points_log'),
          where('deaconId', '==', deacon.id),
          where('monthKey', '==', currentMonthKey)
        );
        const ptsSnap = await getDocs(qPts);
        for (const docItem of ptsSnap.docs) {
          const data = docItem.data();
          if (data.type === 'subscription_reward' || (data.reason && data.reason.includes('سداد الاشتراك'))) {
            await deleteDoc(doc(db, 'points_log', docItem.id));
          }
        }
        setSuccessMsg(`تم إلغاء سداد اشتراك ${deacon.fullName} وخصم نقاط المكافأة`);
      }

      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      console.error(err);
      alert('حدث خطأ: ' + err.message);
    } finally {
      setSubLoading(null);
    }
  };

  // Filtered deacons
  const myAssignedDeacons = deacons.filter(d => d.assignedAssistantId === userData?.id);
  const filteredDeacons = deacons.filter(d => {
    if (filterScope === 'my' && d.assignedAssistantId !== userData?.id) {
      return false;
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchName = d.fullName?.toLowerCase().includes(term);
      const matchUser = d.username?.toLowerCase().includes(term);
      const matchPhone = d.ownPhone?.includes(term) || d.parentPhone?.includes(term);
      return matchName || matchUser || matchPhone;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 text-white p-6 rounded-3xl shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-3 py-0.5 bg-blue-500/30 text-blue-200 text-xs font-bold rounded-full">
                بوابة الخادم
              </span>
              <span className="px-3 py-0.5 bg-amber-400/20 text-amber-200 text-xs font-bold rounded-full border border-amber-300/30">
                +{subscriptionPoints} نقطة عند دفع الاشتراك
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black">لوحة تحكم الخادم</h2>
            <p className="text-blue-100/80 text-xs mt-0.5">
              تسجيل الحضور السريع، تحصيل اشتراك الـ 30ج، ومراجعة طلبات الأنشطة والاعترافات.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/15 text-center shrink-0">
            <span className="text-[11px] text-blue-200 block font-bold">إجمالي الشمامسة</span>
            <span className="text-xl font-black text-white">{deacons.length} شماس</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button 
          onClick={() => navigate('/admin/attendance')}
          className="bg-white hover:bg-teal-50/50 p-5 rounded-3xl border border-slate-100 flex items-center gap-4 transition-all shadow-sm text-right group"
        >
          <div className="p-3 bg-teal-600 text-white rounded-2xl group-hover:scale-105 transition-transform">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">تسجيل الحضور الفوري</h3>
            <p className="text-xs text-slate-500 mt-0.5">تحضير جماعي وسريع لجميع الشمامسة</p>
          </div>
        </button>

        <button 
          onClick={() => navigate('/admin/requests')}
          className="bg-white hover:bg-blue-50/50 p-5 rounded-3xl border border-slate-100 flex items-center gap-4 transition-all shadow-sm text-right group"
        >
          <div className="p-3 bg-blue-500 text-white rounded-2xl group-hover:scale-105 transition-transform">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">طلبات التسجيل المعلقة</h3>
            <p className="text-xs text-slate-500 mt-0.5">مراجعة طلبات أنشطة واعترافات الشمامسة</p>
          </div>
        </button>

        <button 
          onClick={() => navigate('/admin/subscriptions')}
          className="bg-white hover:bg-emerald-50/50 p-5 rounded-3xl border border-slate-100 flex items-center gap-4 transition-all shadow-sm text-right group"
        >
          <div className="p-3 bg-emerald-600 text-white rounded-2xl group-hover:scale-105 transition-transform">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">كشف الاشتراكات (30 ج)</h3>
            <p className="text-xs text-slate-500 mt-0.5">استعراض سجل تحصيل جميع الشهور</p>
          </div>
        </button>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        {/* Activity selector and Search Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-slate-800 text-base">تسجيل الحضور والاشتراكات</h3>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <select 
              value={selectedActivity}
              onChange={(e) => setSelectedActivity(e.target.value)}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 text-xs font-bold text-slate-700"
            >
              <option value="">-- اختر نشاط اليوم لتسجيل الحضور --</option>
              {activities.map(a => (
                <option key={a.id} value={a.id}>{a.name} (+{a.defaultPoints} نقطة)</option>
              ))}
            </select>
          </div>
        </div>

        {/* Filters and search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Filter Scope Tabs */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => setFilterScope('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterScope === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              جميع الشمامسة ({deacons.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterScope('my')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterScope === 'my'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              مجموعتي المسندة ({myAssignedDeacons.length})
            </button>
          </div>

          {/* Search box */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            <input
              type="text"
              placeholder="بحث بالاسم أو الهاتف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {successMsg && (
          <div className="p-3 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 text-xs font-bold text-center animate-in fade-in">
            {successMsg}
          </div>
        )}

        <div className="space-y-3 pt-2">
          {filteredDeacons.map(deacon => {
            const isSubPaid = !!subscriptions[deacon.id]?.paid;
            const isSubBusy = subLoading === deacon.id;
            const isAttended = !!attendanceMap[deacon.id];
            const isAttendanceBusy = attendanceLoadingId === deacon.id;

            return (
              <div key={deacon.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-slate-100 rounded-2xl hover:bg-slate-50 transition-colors gap-3">
                <div className="flex items-center gap-3">
                  {deacon.photoUrl ? (
                    <img src={deacon.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold shrink-0">
                      {deacon.fullName?.charAt(0) || 'ش'}
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{deacon.fullName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-slate-400 font-mono" dir="ltr">@{deacon.username}</span>
                      {deacon.ownPhone && (
                        <span className="text-[11px] text-slate-500 font-mono" dir="ltr">{deacon.ownPhone}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  {/* Subscription 30 EGP toggle button */}
                  <button
                    onClick={() => handleToggleSubPayment(deacon)}
                    disabled={isSubBusy}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      isSubPaid 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                        : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {isSubBusy ? (
                      <span className="animate-spin text-xs">⏳</span>
                    ) : isSubPaid ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        اشتراك الشهر: مدفوع (+{subscriptionPoints} pt)
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 text-rose-500" />
                        دفع اشتراك 30 ج (+{subscriptionPoints} pt)
                      </>
                    )}
                  </button>

                  {/* Attendance toggle button with points deduction on cancel */}
                  <button
                    onClick={() => handleToggleAttendance(deacon)}
                    disabled={isAttendanceBusy || !selectedActivity}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-xs ${
                      isAttended
                        ? 'bg-emerald-600 hover:bg-rose-600 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                    title={isAttended ? 'اضغط لإلغاء الحضور وخصم النقاط' : 'اضغط لتسجيل الحضور'}
                  >
                    {isAttendanceBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isAttended ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        حاضر (إلغاء وخصم)
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        تسجيل حضور
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}

          {filteredDeacons.length === 0 && (
            <div className="text-center text-slate-400 py-8 text-sm">
              لا يوجد شمامسة مطابقين لخيارات البحث.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
