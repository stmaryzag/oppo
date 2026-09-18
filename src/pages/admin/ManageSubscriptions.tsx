import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, getDocs, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { 
  CreditCard, CheckCircle2, XCircle, Search, Filter, 
  Download, Calendar, Users, DollarSign, Check, X, 
  AlertCircle, ShieldCheck, ChevronRight, ChevronLeft, ArrowUpDown,
  Sparkles, Settings, Save, Loader2
} from 'lucide-react';
import { UserData, SubscriptionRecord } from '../../types';
import { sendSubscriptionNotification } from '../../utils/notificationHelper';
import { subscribeSystemSettings, updateSystemSettings } from '../../utils/systemSettings';

const MONTH_NAMES_AR = [
  'يناير (1)', 'فبراير (2)', 'مارس (3)', 'أبريل (4)',
  'مايو (5)', 'يونيو (6)', 'يوليو (7)', 'أغسطس (8)',
  'سبتمبر (9)', 'أكتوبر (10)', 'نوفمبر (11)', 'ديسمبر (12)'
];

export const ManageSubscriptions = () => {
  const { userData } = useAuth();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);

  const [deacons, setDeacons] = useState<UserData[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, SubscriptionRecord>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // System Settings: Subscription Points & Amount
  const [subscriptionPoints, setSubscriptionPoints] = useState<number>(300);
  const [customPointsInput, setCustomPointsInput] = useState<string>('300');
  const [savingPointsSetting, setSavingPointsSetting] = useState<boolean>(false);
  const [settingSavedMsg, setSettingSavedMsg] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const currentMonthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  // Subscribe to System Settings (Points for subscription)
  useEffect(() => {
    const unsubSettings = subscribeSystemSettings((cfg) => {
      setSubscriptionPoints(cfg.subscriptionPoints ?? 300);
      setCustomPointsInput(String(cfg.subscriptionPoints ?? 300));
    });
    return () => unsubSettings();
  }, []);

  // Fetch Deacons
  useEffect(() => {
    const qDeacons = query(collection(db, 'users'), where('role', '==', 'deacon'));
    const unsub = onSnapshot(qDeacons, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserData));
      // Sort alphabetically by full name
      list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'ar'));
      setDeacons(list);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Fetch Subscriptions for current selected month
  useEffect(() => {
    const qSubs = query(collection(db, 'subscriptions'), where('monthKey', '==', currentMonthKey));
    const unsub = onSnapshot(qSubs, (snap) => {
      const subMap: Record<string, SubscriptionRecord> = {};
      snap.docs.forEach(docSnap => {
        const data = docSnap.data() as SubscriptionRecord;
        subMap[data.deaconId] = { ...data, id: docSnap.id };
      });
      setSubscriptions(subMap);
    });

    return () => unsub();
  }, [currentMonthKey]);

  // Handle saving new points configuration
  const handleSavePointsSetting = async (pointsValue: number) => {
    if (isNaN(pointsValue) || pointsValue < 0) {
      alert('يرجى إدخال عدد نقاط صحيح وموجب.');
      return;
    }
    setSavingPointsSetting(true);
    setSettingSavedMsg('');
    try {
      await updateSystemSettings({ subscriptionPoints: pointsValue }, userData?.id);
      setSubscriptionPoints(pointsValue);
      setCustomPointsInput(String(pointsValue));
      setSettingSavedMsg(`تم حفظ نقاط الاشتراك (${pointsValue} نقطة) بنجاح ✨`);
      setTimeout(() => setSettingSavedMsg(''), 3000);
    } catch (err: any) {
      console.error(err);
      alert('تعذر حفظ الإعدادات: ' + err.message);
    } finally {
      setSavingPointsSetting(false);
    }
  };

  // Toggle or Record Payment of 30 EGP + Award configured points
  const togglePayment = async (deacon: UserData) => {
    if (!deacon?.id) return;
    const isCurrentlyPaid = !!subscriptions[deacon.id]?.paid;
    const subDocId = `${deacon.id}_${currentMonthKey}`;
    const subPointsDocId = `sub_points_${deacon.id}_${currentMonthKey}`;
    setActionLoading(deacon.id);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const deaconNameStr = deacon.fullName || deacon.username || 'شماس';
      const recorderId = userData?.id || 'admin';
      const recorderName = userData?.fullName || 'المسؤول';
      const monthNameAr = MONTH_NAMES_AR[selectedMonth - 1] || `شهر ${selectedMonth}`;

      if (isCurrentlyPaid) {
        // Mark as unpaid / update
        await setDoc(doc(db, 'subscriptions', subDocId), {
          deaconId: deacon.id,
          deaconName: deaconNameStr,
          monthKey: currentMonthKey,
          year: Number(selectedYear),
          month: Number(selectedMonth),
          amount: 30,
          paid: false,
          updatedAt: new Date().toISOString(),
          recordedBy: recorderId,
          recordedByName: recorderName
        }, { merge: true });

        // Remove awarded points
        await deleteDoc(doc(db, 'points_log', subPointsDocId)).catch(() => {});

        setSuccessMsg(`تم إلغاء تسجيل اشتراك شهر ${selectedMonth} للشماس ${deaconNameStr} وخصم النقاط المرتبطة`);
      } else {
        // Mark as paid 30 EGP
        await setDoc(doc(db, 'subscriptions', subDocId), {
          deaconId: deacon.id,
          deaconName: deaconNameStr,
          monthKey: currentMonthKey,
          year: Number(selectedYear),
          month: Number(selectedMonth),
          amount: 30,
          paid: true,
          paidAt: new Date().toISOString(),
          recordedBy: recorderId,
          recordedByName: recorderName
        }, { merge: true });

        // Add configured points to points_log
        await setDoc(doc(db, 'points_log', subPointsDocId), {
          deaconId: deacon.id,
          reason: `سداد اشتراك خورس الشمامسة الشهري (${monthNameAr} ${selectedYear})`,
          points: subscriptionPoints,
          date: new Date().toISOString(),
          addedBy: recorderId,
          monthKey: currentMonthKey,
          isSubscription: true
        });

        // Send push/inbox notification to deacon and parent
        await sendSubscriptionNotification(
          deacon.id,
          `${monthNameAr} ${selectedYear}`,
          recorderName,
          subscriptionPoints,
          30
        );

        setSuccessMsg(`تم تسجيل دفع اشتراك ${monthNameAr} (30 ج) وإضافة +${subscriptionPoints} نقطة لـ ${deaconNameStr} بنجاح ✅`);
      }

      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err: any) {
      console.error("Subscription update error:", err);
      setErrorMsg('تعذر تحديث حالة الاشتراك: ' + (err?.message || 'خطأ غير متوقع'));
    } finally {
      setActionLoading(null);
    }
  };

  // Quick navigation between months
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(prev => prev - 1);
    } else {
      setSelectedMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(prev => prev + 1);
    } else {
      setSelectedMonth(prev => prev + 1);
    }
  };

  // Statistics calculation
  const totalDeacons = deacons.length;
  const paidCount = deacons.filter(d => subscriptions[d.id]?.paid).length;
  const unpaidCount = totalDeacons - paidCount;
  const totalCollectedAmount = paidCount * 30;
  const percentage = totalDeacons > 0 ? Math.round((paidCount / totalDeacons) * 100) : 0;

  // Filtered deacons
  const filteredDeacons = deacons.filter(d => {
    const isPaid = !!subscriptions[d.id]?.paid;
    const matchesSearch = 
      (d.fullName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.ownPhone || '').includes(searchQuery) ||
      (d.parentPhone || d.dadPhone || '').includes(searchQuery);

    if (!matchesSearch) return false;

    if (statusFilter === 'paid') return isPaid;
    if (statusFilter === 'unpaid') return !isPaid;
    return true;
  });

  // Export Subscription List to CSV
  const handleExportCSV = () => {
    const header = "م,اسم الشماس,اسم الدخول,رقم الهاتف,هاتف الوالد,حالة اشتراك الشهر,المبلغ المسدد,تاريخ السداد,مسجل الدفع\n";
    const rows = deacons.map((d, index) => {
      const sub = subscriptions[d.id];
      const isPaid = !!sub?.paid;
      const statusText = isPaid ? "تم الدفع (30 ج)" : "غير مدفوع";
      const paidDate = sub?.paidAt ? new Date(sub.paidAt).toLocaleDateString('ar-EG') : "-";
      const recordedBy = sub?.recordedByName || "-";

      return `"${index + 1}","${d.fullName}","${d.username}","${d.ownPhone || ''}","${d.parentPhone || d.dadPhone || ''}","${statusText}","${isPaid ? 30 : 0}","${paidDate}","${recordedBy}"`;
    }).join("\n");

    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `كشف_اشتراكات_الشمامسة_${currentMonthKey}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-800 p-6 rounded-3xl shadow-md text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20">
              <CreditCard className="w-8 h-8 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="inline-block px-3 py-0.5 bg-emerald-500/30 text-emerald-200 text-xs font-bold rounded-full">
                  الاشتراك الشهري: 30 جنيه
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-0.5 bg-amber-400/20 text-amber-200 text-xs font-bold rounded-full border border-amber-300/30">
                  <Sparkles className="w-3.5 h-3.5" />
                  مكافأة السداد: +{subscriptionPoints} نقطة
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-extrabold">إدارة ومتابعة الاشتراكات الشهرية</h2>
              <p className="text-xs text-emerald-100/80 mt-0.5">
                تسجيل السداد، منح نقاط التشجيع (+{subscriptionPoints} pt)، وإتاحة الرؤية اللحظية لولي الأمر والشماس
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-4 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold flex items-center gap-2 backdrop-blur-md transition-all border border-white/20"
            >
              <Download className="w-4 h-4" />
              تصدير كشف الشهر (CSV)
            </button>
          </div>
        </div>
      </div>

      {/* ⚙️ Points Configuration Card for Admins */}
      {userData?.role === 'admin' && (
        <div className="bg-gradient-to-r from-amber-50/90 via-orange-50/70 to-emerald-50/80 border border-amber-200/80 rounded-3xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-sm shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-slate-800 text-sm">مكافأة نقاط سداد الاشتراك الشهري</h3>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full">
                    الحالي: {subscriptionPoints} نقطة
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  تُضاف هذه النقاط تلقائياً لرصيد الشماس فور تسجيل دفع اشتراك الـ 30ج، وتُخصم تلقائياً إذا تم إلغاء التسجيل.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
              <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-slate-200 shadow-inner">
                <input
                  type="number"
                  min="0"
                  max="5000"
                  step="10"
                  value={customPointsInput}
                  onChange={(e) => setCustomPointsInput(e.target.value)}
                  className="w-24 px-3 py-1.5 text-center font-black text-slate-800 text-sm focus:outline-none"
                  placeholder="300"
                />
                <span className="text-xs font-bold text-slate-500 pl-2">نقطة</span>
              </div>

              <button
                type="button"
                onClick={() => handleSavePointsSetting(Number(customPointsInput))}
                disabled={savingPointsSetting}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                {savingPointsSetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                حفظ التعديل
              </button>

              {/* Quick Presets */}
              <div className="hidden sm:flex items-center gap-1 mr-1">
                {[100, 200, 300, 500].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setCustomPointsInput(String(val));
                      handleSavePointsSetting(val);
                    }}
                    className={`px-2.5 py-1.5 text-[11px] font-bold rounded-xl transition-all border ${
                      subscriptionPoints === val
                        ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {settingSavedMsg && (
            <div className="mt-3 p-2.5 bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-xl animate-in fade-in flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              {settingSavedMsg}
            </div>
          )}
        </div>
      )}

      {/* Month Navigator & Selector */}
      <div className="bg-white p-4 md:p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrevMonth}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            title="الشهر السابق"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-600" />
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:outline-none focus:border-emerald-500"
            >
              {MONTH_NAMES_AR.map((m, idx) => (
                <option key={idx + 1} value={idx + 1}>{m}</option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:outline-none focus:border-emerald-500 font-mono"
            >
              {[2025, 2026, 2027, 2028].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleNextMonth}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            title="الشهر القادم"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          أنت الآن تستعرض اشتراك: <span className="font-bold text-emerald-700">{MONTH_NAMES_AR[selectedMonth - 1]} {selectedYear}</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white p-4.5 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">إجمالي الشمامسة</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800">{totalDeacons}</p>
          <span className="text-[10px] text-slate-400">شماس مسجل بالخدمة</span>
        </div>

        <div className="bg-white p-4.5 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-600">المسددين للـ 30ج</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600">{paidCount}</p>
          <span className="text-[10px] text-emerald-700 font-medium">{percentage}% نسبة السداد</span>
        </div>

        <div className="bg-white p-4.5 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-rose-500">المتبقي عليهم دفع</span>
            <div className="p-2 bg-rose-50 text-rose-500 rounded-xl">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600">{unpaidCount}</p>
          <span className="text-[10px] text-rose-700 font-medium">لم يسددوا هذا الشهر</span>
        </div>

        <div className="bg-white p-4.5 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">إجمالي المحصل</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800">{totalCollectedAmount} <span className="text-xs font-bold text-slate-500">ج.م</span></p>
          <span className="text-[10px] text-slate-400">من أصل {totalDeacons * 30} ج.م</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-2">
        <div className="flex justify-between text-xs font-bold text-slate-700">
          <span>تقدم تحصيل اشتراك {MONTH_NAMES_AR[selectedMonth - 1]}</span>
          <span className="text-emerald-600">{paidCount} من {totalDeacons} ({percentage}%)</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
          <div 
            className="bg-gradient-to-r from-emerald-500 to-teal-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم أو رقم الهاتف..."
            className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${statusFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            الكل ({deacons.length})
          </button>
          <button
            onClick={() => setStatusFilter('paid')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${statusFilter === 'paid' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
          >
            تم الدفع ({paidCount})
          </button>
          <button
            onClick={() => setStatusFilter('unpaid')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${statusFilter === 'unpaid' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
          >
            غير مسدد ({unpaidCount})
          </button>
        </div>
      </div>

      {/* Deacons Subscription Grid / Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 text-slate-700 border-b border-slate-100">
              <tr>
                <th className="p-4 font-bold">#</th>
                <th className="p-4 font-bold">الشماس</th>
                <th className="p-4 font-bold">الهاتف</th>
                <th className="p-4 font-bold text-center">حالة الاشتراك (30 ج)</th>
                <th className="p-4 font-bold text-center">تاريخ السداد والمُسجل</th>
                <th className="p-4 font-bold text-center">إجراء السداد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDeacons.map((deacon, index) => {
                const sub = subscriptions[deacon.id];
                const isPaid = !!sub?.paid;
                const isProcessing = actionLoading === deacon.id;

                return (
                  <tr 
                    key={deacon.id} 
                    className={`transition-colors ${isPaid ? 'bg-emerald-50/20 hover:bg-emerald-50/40' : 'hover:bg-slate-50'}`}
                  >
                    <td className="p-4 font-mono text-slate-400 font-bold">{index + 1}</td>
                    
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {deacon.photoUrl ? (
                          <img src={deacon.photoUrl} alt={deacon.fullName} className="w-9 h-9 rounded-full object-cover border border-slate-200" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 border border-slate-200">
                            {deacon.fullName?.charAt(0) || 'ش'}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{deacon.fullName}</p>
                          <p className="text-[11px] text-slate-400 font-mono" dir="ltr">@{deacon.username}</p>
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      <span className="font-mono text-slate-600" dir="ltr">
                        {deacon.ownPhone || deacon.parentPhone || deacon.dadPhone || '-'}
                      </span>
                    </td>

                    <td className="p-4 text-center">
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-full text-xs border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          تم السداد (30 ج)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100 text-rose-800 font-bold rounded-full text-xs border border-rose-200">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          غير مسدد (30 ج)
                        </span>
                      )}
                    </td>

                    <td className="p-4 text-center text-[11px] text-slate-500">
                      {isPaid ? (
                        <div>
                          <p className="font-medium text-slate-700">
                            {sub?.paidAt ? new Date(sub.paidAt).toLocaleDateString('ar-EG') : 'مسجل'}
                          </p>
                          <p className="text-[10px] text-slate-400">بواسطة: {sub?.recordedByName || 'المسؤول'}</p>
                        </div>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>

                    <td className="p-4 text-center">
                      <button
                        onClick={() => togglePayment(deacon)}
                        disabled={isProcessing}
                        className={`px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 mx-auto disabled:opacity-50 ${
                          isPaid
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                        }`}
                      >
                        {isProcessing ? (
                          <span className="animate-spin text-xs">⏳</span>
                        ) : isPaid ? (
                          <>
                            <X className="w-3.5 h-3.5" /> إلغاء السداد
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" /> تسجيل دفع 30 ج
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredDeacons.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    لا يوجد شمامسة مطابقين لمعايير البحث.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
