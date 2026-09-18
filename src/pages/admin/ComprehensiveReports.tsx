import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { UserData, ActivityType } from '../../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import { FileBarChart, Users, Calendar as CalendarIcon, UserCheck, XCircle, Search, Activity, Download, Loader2, CheckCircle2 } from 'lucide-react';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export const ComprehensiveReports = () => {
  const { userData } = useAuth();
  const [activeTab, setActiveTab] = useState<'activity' | 'individual'>('activity');
  
  // Data states
  const [deacons, setDeacons] = useState<UserData[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);

  // Activity Report States
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedActivity, setSelectedActivity] = useState<string>('');
  const [activityReport, setActivityReport] = useState<{present: UserData[], absent: UserData[]}>({ present: [], absent: [] });

  // Individual Report States
  const [selectedDeacon, setSelectedDeacon] = useState<string>('');
  const [deaconSearch, setDeaconSearch] = useState('');
  const [individualStats, setIndividualStats] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch Deacons
        const qDeacons = query(collection(db, 'users'), where('role', '==', 'deacon'));
        const deaconsSnap = await getDocs(qDeacons);
        const deaconsList = deaconsSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData));
        setDeacons(deaconsList.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '')));

        // Fetch Activities
        const qActivities = query(collection(db, 'activity_types'));
        const actsSnap = await getDocs(qActivities);
        const actsList = actsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityType));
        setActivities(actsList);
        if (actsList.length > 0) setSelectedActivity(actsList[0].id);

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Generate Activity Report
  useEffect(() => {
    if (activeTab !== 'activity' || !selectedActivity || !selectedDate) return;

    const generateActivityReport = async () => {
      try {
        const qAtt = query(
          collection(db, 'attendance_records'),
          where('activityTypeId', '==', selectedActivity)
        );
        const snap = await getDocs(qAtt);
        
        const presentIds = new Set<string>();
        snap.docs.forEach(d => {
          const data = d.data();
          if (data.date && data.date.startsWith(selectedDate)) {
            presentIds.add(data.deaconId);
          }
        });

        const present = deacons.filter(d => presentIds.has(d.id));
        const absent = deacons.filter(d => !presentIds.has(d.id));
        
        setActivityReport({ present, absent });
      } catch (err) {
        console.error(err);
      }
    };
    generateActivityReport();
  }, [activeTab, selectedActivity, selectedDate, deacons]);

  // Generate Individual Report
  useEffect(() => {
    if (activeTab !== 'individual' || !selectedDeacon) return;

    const generateIndividualReport = async () => {
      try {
        // Points
        const qPts = query(collection(db, 'points_log'), where('deaconId', '==', selectedDeacon));
        const ptsSnap = await getDocs(qPts);
        
        // Attendance
        const qAtt = query(collection(db, 'attendance_records'), where('deaconId', '==', selectedDeacon));
        const attSnap = await getDocs(qAtt);

        let totalPoints = 0;
        const pointsByMonth: Record<string, number> = {};
        const activitiesCount: Record<string, number> = {};

        ptsSnap.docs.forEach(d => {
          const pt = d.data();
          totalPoints += pt.points || 0;
          
          if (pt.monthKey) {
            pointsByMonth[pt.monthKey] = (pointsByMonth[pt.monthKey] || 0) + (pt.points || 0);
          }
        });

        attSnap.docs.forEach(d => {
          const att = d.data();
          const name = att.activityName || 'نشاط غير معروف';
          activitiesCount[name] = (activitiesCount[name] || 0) + 1;
        });

        const pointsChartData = Object.entries(pointsByMonth)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, points]) => ({ month, points }));

        const activitiesChartData = Object.entries(activitiesCount)
          .map(([name, count]) => ({ name, count }));

        setIndividualStats({
          totalPoints,
          attendanceCount: attSnap.size,
          pointsChartData,
          activitiesChartData
        });
      } catch (err) {
        console.error(err);
      }
    };
    generateIndividualReport();
  }, [activeTab, selectedDeacon]);


  if (loading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-600" /></div>;

  const currentDeacon = deacons.find(d => d.id === selectedDeacon);
  const currentActivity = activities.find(a => a.id === selectedActivity);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-800 via-blue-800 to-slate-900 p-6 rounded-3xl shadow-sm text-white">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
            <FileBarChart className="w-8 h-8 text-blue-300" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">التقارير والإحصائيات الشاملة</h2>
            <p className="text-sm text-blue-100/80 mt-1">
              متابعة الحضور، النقاط، وأداء الشمامسة والأنشطة برسوم بيانية تفصيلية
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-2xl p-2 shadow-sm border border-slate-100 gap-2">
        <button
          onClick={() => setActiveTab('activity')}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'activity' 
              ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100' 
              : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <CalendarIcon className="w-4 h-4" /> تقرير نشاط محدد (باليوم)
        </button>
        <button
          onClick={() => setActiveTab('individual')}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'individual' 
              ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100' 
              : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <UserCheck className="w-4 h-4" /> التقرير الفردي (شماس محدد)
        </button>
      </div>

      {activeTab === 'activity' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">تاريخ النشاط / القداس</label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">النشاط أو الحدث</label>
              <select
                value={selectedActivity}
                onChange={e => setSelectedActivity(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
              >
                {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                <h3 className="font-bold text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> الحاضرون ({activityReport.present.length})
                </h3>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {activityReport.present.length === 0 ? <p className="text-xs text-slate-400">لا يوجد حضور مسجل</p> : null}
                {activityReport.present.map((d, i) => (
                  <div key={d.id} className="flex items-center gap-3 p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                    <span className="text-xs font-bold text-emerald-800 w-5">{i+1}-</span>
                    <div>
                      <p className="font-bold text-sm text-slate-800">{d.fullName}</p>
                      <p className="text-[10px] text-slate-500 font-mono">@{d.username}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                <h3 className="font-bold text-rose-700 flex items-center gap-2">
                  <XCircle className="w-5 h-5" /> الغائبون ({activityReport.absent.length})
                </h3>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {activityReport.absent.length === 0 ? <p className="text-xs text-slate-400">الجميع حاضر</p> : null}
                {activityReport.absent.map((d, i) => (
                  <div key={d.id} className="flex items-center gap-3 p-3 bg-rose-50/50 rounded-xl border border-rose-100">
                    <span className="text-xs font-bold text-rose-800 w-5">{i+1}-</span>
                    <div>
                      <p className="font-bold text-sm text-slate-800">{d.fullName}</p>
                      <p className="text-[10px] text-slate-500 font-mono">@{d.username} | {d.ownPhone || d.parentPhone || ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm h-[300px]">
            <h3 className="font-bold text-slate-800 mb-4 text-center">نسبة الحضور لـ {currentActivity?.name}</h3>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'حاضر', value: activityReport.present.length },
                    { name: 'غائب', value: activityReport.absent.length }
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                  label
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#f43f5e" />
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'individual' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
            <label className="block text-xs font-bold text-slate-700 mb-2">اختر الشماس</label>
            <div className="relative">
              <Search className="w-5 h-5 absolute right-3 top-3 text-slate-400" />
              <select
                value={selectedDeacon}
                onChange={e => setSelectedDeacon(e.target.value)}
                className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm appearance-none"
              >
                <option value="">-- ابحث واختر شماس --</option>
                {deacons.map(d => (
                  <option key={d.id} value={d.id}>{d.fullName} (@{d.username})</option>
                ))}
              </select>
            </div>
          </div>

          {currentDeacon && individualStats ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2 bg-gradient-to-r from-emerald-50 to-teal-50 p-6 rounded-3xl border border-emerald-100 flex items-center gap-6">
                {currentDeacon.photoUrl ? (
                  <img src={currentDeacon.photoUrl} alt="" className="w-20 h-20 rounded-full border-4 border-white shadow-sm" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center font-bold text-3xl border-4 border-white shadow-sm">
                    {currentDeacon.fullName?.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="text-2xl font-black text-slate-800">{currentDeacon.fullName}</h3>
                  <div className="flex gap-4 mt-2">
                    <span className="px-3 py-1 bg-white rounded-full text-xs font-bold text-emerald-700 border border-emerald-200">
                      إجمالي النقاط: {individualStats.totalPoints}
                    </span>
                    <span className="px-3 py-1 bg-white rounded-full text-xs font-bold text-blue-700 border border-blue-200">
                      مرات الحضور: {individualStats.attendanceCount}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm h-[300px]">
                <h3 className="font-bold text-slate-800 text-sm mb-4 text-center">معدل النقاط شهرياً</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={individualStats.pointsChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                    <XAxis dataKey="month" fontSize={10} />
                    <YAxis fontSize={10} />
                    <RechartsTooltip cursor={{fill: 'transparent'}} />
                    <Bar dataKey="points" name="النقاط" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm h-[300px]">
                <h3 className="font-bold text-slate-800 text-sm mb-4 text-center">توزيع المشاركة في الأنشطة</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={individualStats.activitiesChartData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                      nameKey="name"
                      label
                    >
                      {individualStats.activitiesChartData.map((_: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : selectedDeacon ? (
            <div className="text-center p-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-500" /></div>
          ) : null}
        </div>
      )}
    </div>
  );
};
