import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Star, History, Trophy, User, CreditCard, CheckCircle2, 
  AlertCircle, Phone, Award, Shield, HeartHandshake, Sparkles,
  TrendingUp, CalendarCheck, BarChart3
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import clsx from 'clsx';
import { SubscriptionRecord } from '../../types';

const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export const ParentDashboard = () => {
  const { userData } = useAuth();
  
  const [childData, setChildData] = useState<any>(null);
  const [assistantData, setAssistantData] = useState<any>(null);
  const [pointsLog, setPointsLog] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [team, setTeam] = useState<any>(null);
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [loadingChild, setLoadingChild] = useState(true);
  const [resolvedDeaconId, setResolvedDeaconId] = useState<string | null>(userData?.parentOfDeaconId || null);
  
  const now = new Date();
  const currentMonthNum = now.getMonth() + 1;
  const currentMonthName = MONTH_NAMES_AR[now.getMonth()];
  const currentYear = now.getFullYear();
  const currentMonthKey = `${currentYear}-${String(currentMonthNum).padStart(2, '0')}`;

  // Resolve deacon ID either from parentOfDeaconId or from p_<username> convention
  useEffect(() => {
    let isMounted = true;

    async function resolveDeacon() {
      if (userData?.parentOfDeaconId) {
        setResolvedDeaconId(userData.parentOfDeaconId);
        return;
      }

      if (userData?.username && userData.username.startsWith('p_')) {
        const deaconUsername = userData.username.substring(2);
        try {
          const qDeacon = query(
            collection(db, 'users'),
            where('role', '==', 'deacon'),
            where('username', '==', deaconUsername)
          );
          const snap = await getDocs(qDeacon);
          if (!snap.empty && isMounted) {
            const deaconDoc = snap.docs[0];
            const dId = deaconDoc.id;
            setResolvedDeaconId(dId);

            // Auto-update parent document for future fast lookup
            if (userData.id) {
              await updateDoc(doc(db, 'users', userData.id), {
                parentOfDeaconId: dId
              }).catch(() => {});
            }
          }
        } catch (e) {
          console.error('Failed to resolve deacon by username:', e);
        }
      }
    }

    resolveDeacon();
    return () => { isMounted = false; };
  }, [userData]);

  useEffect(() => {
    if (!resolvedDeaconId) {
      setLoadingChild(false);
      return;
    }

    setLoadingChild(true);

    // Fetch Child User Data
    const childRef = doc(db, 'users', resolvedDeaconId);
    getDoc(childRef).then(async snap => {
      if (snap.exists()) {
        const data: any = { id: snap.id, ...snap.data() };
        setChildData(data);
        
        // Fetch Child's Team Info
        if (data.teamId) {
          getDoc(doc(db, 'teams', data.teamId)).then((docSnap) => {
            if (docSnap.exists()) setTeam({ id: docSnap.id, ...docSnap.data() });
          });
        }

        // Fetch Assistant Info if assigned
        if (data.assignedAssistantId) {
          getDoc(doc(db, 'users', data.assignedAssistantId)).then((docSnap) => {
            if (docSnap.exists()) setAssistantData({ id: docSnap.id, ...docSnap.data() });
          });
        }
      }
      setLoadingChild(false);
    }).catch(() => setLoadingChild(false));

    // Fetch Subscription status for current month
    const subDocId = `${resolvedDeaconId}_${currentMonthKey}`;
    const unsubSub = onSnapshot(doc(db, 'subscriptions', subDocId), (docSnap) => {
      if (docSnap.exists()) {
        setSubscription(docSnap.data() as SubscriptionRecord);
      } else {
        setSubscription(null);
      }
    });

    // Fetch Points Log for Child
    const qPoints = query(collection(db, 'points_log'), where('deaconId', '==', resolvedDeaconId));
    const unsubPoints = onSnapshot(qPoints, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPointsLog(data);
    });

    // Fetch Attendance records for child
    const qAttendance = query(collection(db, 'attendance_records'), where('deaconId', '==', resolvedDeaconId));
    const unsubAttendance = onSnapshot(qAttendance, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttendanceRecords(data);
    });

    return () => {
      unsubSub();
      unsubPoints();
      unsubAttendance();
    };
  }, [resolvedDeaconId, currentMonthKey]);

  // Aggregate monthly activity & attendance data for LineChart
  const attendanceChartData = useMemo(() => {
    // Generate past 6 months list
    const result = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const mNum = d.getMonth() + 1;
      const mKey = `${d.getFullYear()}-${String(mNum).padStart(2, '0')}`;
      const mName = MONTH_NAMES_AR[d.getMonth()];

      const monthAtt = attendanceRecords.filter(r => {
        const rDate = r.date || r.timestamp;
        return rDate && rDate.startsWith(mKey);
      });

      const monthPts = pointsLog
        .filter(l => l.monthKey === mKey)
        .reduce((acc, curr) => acc + (curr.points || 0), 0);

      // Estimated expected sessions per month ~ 6 (4 liturgies + 2 classes)
      const expectedSessions = 6;
      const attendedCount = monthAtt.length;
      const absentCount = Math.max(0, expectedSessions - attendedCount);

      result.push({
        month: mName,
        monthKey: mKey,
        حضور: attendedCount,
        غياب: absentCount,
        نقاط: monthPts
      });
    }
    return result;
  }, [attendanceRecords, pointsLog]);

  if (loadingChild) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 text-sm">
        جاري تحميل وتجهيز بيانات ابنك الشماس...
      </div>
    );
  }

  if (!resolvedDeaconId || !childData) {
    return (
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 text-center min-h-[40vh] flex flex-col items-center justify-center">
        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-400">
          <User className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-1">لم يتم ربط حسابك بشماس حتى الآن</h2>
        <p className="text-slate-500 text-xs">يرجى التواصل مع إدارة الخورس لربط حسابك بابنك الشماس للمتابعة المستمرة.</p>
      </div>
    );
  }

  const currentMonthPoints = pointsLog
    .filter(log => log.monthKey === currentMonthKey)
    .reduce((acc, curr) => acc + (curr.points || 0), 0);

  const totalPoints = pointsLog.reduce((acc, curr) => acc + (curr.points || 0), 0);

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-6">
      {/* Reassurance Header */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-5 rounded-3xl shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-white/20 rounded-2xl">
            <HeartHandshake className="w-6 h-6 text-blue-100" />
          </div>
          <div>
            <h2 className="font-extrabold text-base">متابعة ولي الأمر • خورس الشمامسة</h2>
            <p className="text-xs text-blue-100">متابعة نشاط والتزام ابنك الشماس واشتراكاته الشهرية</p>
          </div>
        </div>
        <span className="text-[11px] font-bold px-3 py-1 bg-white/20 rounded-full border border-white/20">
          حساب ولي أمر
        </span>
      </div>

      {/* Child Profile Card */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-6 justify-between">
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-right">
          {childData?.photoUrl ? (
            <img src={childData.photoUrl} alt="Profile" className="w-22 h-22 rounded-full object-cover border-4 border-blue-50 shadow-md" />
          ) : (
            <div className="w-22 h-22 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-2xl font-bold border-4 border-blue-100">
              {childData?.fullName?.charAt(0) || 'ش'}
            </div>
          )}
          <div>
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl font-extrabold text-slate-800">{childData?.fullName}</h2>
              {childData?.grade && (
                <span className="text-[10px] font-bold px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-md">
                  {childData.grade}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-mono">@{childData?.username}</p>
            {assistantData && (
              <p className="text-xs text-blue-700 font-medium mt-1 flex items-center gap-1">
                <span>الخادم المسؤول:</span>
                <strong className="text-slate-800">{assistantData.fullName}</strong>
                {assistantData.ownPhone && (
                  <a href={`tel:${assistantData.ownPhone}`} className="text-blue-600 font-mono text-[11px] mr-1">
                    ({assistantData.ownPhone})
                  </a>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Points Display */}
        <div className="flex items-center gap-3">
          <div className="bg-blue-50/80 px-4 py-3 rounded-2xl border border-blue-100 text-center">
            <span className="text-[10px] font-bold text-blue-600 block">نقاط شهر {currentMonthName}</span>
            <span className="text-2xl font-black text-blue-700">{currentMonthPoints}</span>
          </div>
          <div className="bg-amber-50/80 px-4 py-3 rounded-2xl border border-amber-100 text-center">
            <span className="text-[10px] font-bold text-amber-700 block">الإجمالي الكلي</span>
            <span className="text-2xl font-black text-amber-700">{totalPoints}</span>
          </div>
        </div>
      </div>

      {/* 💳 MONTHLY SUBSCRIPTION STATUS CARD FOR PARENTS (30 EGP) */}
      <div className={clsx(
        "p-5 rounded-3xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all",
        subscription?.paid 
          ? "bg-gradient-to-r from-emerald-50 via-teal-50/30 to-emerald-50 border-emerald-300 text-emerald-950" 
          : "bg-gradient-to-r from-amber-50 via-orange-50/40 to-rose-50 border-amber-300 text-amber-950"
      )}>
        <div className="flex items-center gap-3.5">
          <div className={clsx(
            "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
            subscription?.paid ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"
          )}>
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">الاشتراك الشهري لابنك ({currentMonthName} {currentYear})</span>
              <span className="text-xs font-black bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-800">30 جنيه</span>
            </div>
            {subscription?.paid ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h4 className="font-extrabold text-emerald-800 text-sm">تم سداد الاشتراك بنجاح ✅</h4>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-0.5">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <h4 className="font-extrabold text-amber-900 text-sm">في انتظار سداد اشتراك الشهر (30 جنيه)</h4>
              </div>
            )}
          </div>
        </div>

        <div className="text-xs font-medium text-slate-600 bg-white/90 px-4 py-2.5 rounded-2xl border border-slate-200">
          {subscription?.paid ? (
            <div>
              <p className="text-emerald-700 font-bold">تاريخ السداد: {subscription.paidAt ? new Date(subscription.paidAt).toLocaleDateString('ar-EG') : 'مسجل'}</p>
              <p className="text-[10px] text-slate-500">تم السداد للخادم: {subscription.recordedByName || 'المسؤول'}</p>
            </div>
          ) : (
            <p className="text-amber-800 font-medium">يمكنكم تسليم مبلغ الـ 30 جنيه مع ابنك للخادم المسؤول عنه بالخورس</p>
          )}
        </div>
      </div>

      {/* 📈 LINE CHART: Attendance & Absence Trend Tracking */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm">مخطط التزام الحضور والغياب (Line Chart)</h3>
              <p className="text-[11px] text-slate-400">متابعة بيانية لعدد مرات حضور الأنشطة والقداسات شهرياً</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-emerald-600">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              الحضور
            </span>
            <span className="flex items-center gap-1.5 text-rose-500">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
              الغياب المتوقع
            </span>
            <span className="flex items-center gap-1.5 text-blue-600">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              النقاط
            </span>
          </div>
        </div>

        <div className="h-64 w-full pt-2" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={attendanceChartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 11, fill: '#64748b' }} 
                axisLine={{ stroke: '#e2e8f0' }} 
              />
              <YAxis 
                tick={{ fontSize: 11, fill: '#64748b' }} 
                axisLine={{ stroke: '#e2e8f0' }} 
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
              />
              <Legend 
                wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} 
              />
              <Line 
                type="monotone" 
                dataKey="حضور" 
                stroke="#10b981" 
                strokeWidth={3} 
                dot={{ r: 4, fill: '#10b981' }} 
                activeDot={{ r: 6 }} 
              />
              <Line 
                type="monotone" 
                dataKey="غياب" 
                stroke="#f43f5e" 
                strokeWidth={2} 
                strokeDasharray="4 4"
                dot={{ r: 3, fill: '#f43f5e' }} 
              />
              <Line 
                type="monotone" 
                dataKey="نقاط" 
                stroke="#3b82f6" 
                strokeWidth={2} 
                dot={{ r: 3, fill: '#3b82f6' }} 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Team Progress */}
      {team && (
        <div className="bg-gradient-to-r from-purple-700 to-indigo-800 p-5 rounded-3xl shadow-sm text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-2xl">
              <Trophy className="w-6 h-6 text-yellow-300" />
            </div>
            <div>
              <p className="text-purple-200 text-xs font-medium">فريق ابنك في الخورس</p>
              <h3 className="text-lg font-bold">{team.name}</h3>
            </div>
          </div>
          <div className="text-left font-mono">
            <span className="text-2xl font-black text-yellow-300">{team.teamMonthlyPoints || 0}</span>
            <span className="text-xs text-purple-200 mr-1">نقطة</span>
          </div>
        </div>
      )}

      {/* Points History */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-400" />
            <h3 className="font-extrabold text-slate-800 text-sm">سجل التزام ونشاط ابنك</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">{pointsLog.length} نشاط مسجل</span>
        </div>

        <div className="space-y-3">
          {pointsLog.slice(0, 10).map((log, idx) => (
            <div key={log.id || idx} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
              <div>
                <p className="font-bold text-slate-800 text-xs">{log.reason}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {new Date(log.date).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              </div>
              <div className={clsx("font-bold text-xs px-3 py-1 rounded-xl font-mono", log.points > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                {log.points > 0 ? '+' : ''}{log.points}
              </div>
            </div>
          ))}

          {pointsLog.length === 0 && (
            <p className="text-center text-slate-400 text-xs py-4">لا يوجد نشاط مسجل حتى الآن.</p>
          )}
        </div>
      </div>
    </div>
  );
};
