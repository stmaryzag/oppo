import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, addDoc, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle2, UserCheck, Calendar, Filter, Search, CheckCheck, Loader2, Award } from 'lucide-react';
import { UserData, ActivityType } from '../../types';
import { awardAfteqadPointsOnAttendance, revertAfteqadPointsOnAttendanceCancel } from '../../utils/afetqadHelper';

export const FastAttendance = () => {
  const { userData } = useAuth();
  
  const [deacons, setDeacons] = useState<UserData[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filterAssistant, setFilterAssistant] = useState('all');
  const [assistants, setAssistants] = useState<UserData[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [recordedMap, setRecordedMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const [deaconLoading, setDeaconLoading] = useState<Record<string, boolean>>({});

  // 1. Fetch deacons & assistants & activities
  useEffect(() => {
    // Activities
    const unsubActivities = onSnapshot(
      query(collection(db, 'activity_types'), where('active', '==', true)),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityType));
        setActivities(list);
        if (list.length > 0 && !selectedActivityId) {
          setSelectedActivityId(list[0].id);
        }
      }
    );

    // Deacons
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserData));
      setDeacons(all.filter(u => u.role === 'deacon'));
      setAssistants(all.filter(u => u.role === 'assistant' || u.role === 'admin'));
    });

    return () => {
      unsubActivities();
      unsubUsers();
    };
  }, []);

  // 2. Fetch existing attendance records for the selected activity and date to highlight already recorded deacons
  useEffect(() => {
    if (!selectedActivityId || !selectedDate) return;

    // Check attendance records for that day (within 24h of selectedDate)
    const fetchExisting = async () => {
      try {
        const q = query(
          collection(db, 'attendance_records'),
          where('activityTypeId', '==', selectedActivityId)
        );
        const snap = await getDocs(q);
        const map: Record<string, boolean> = {};
        snap.docs.forEach(d => {
          const data = d.data();
          if (data.date && data.date.startsWith(selectedDate)) {
            map[data.deaconId] = true;
          }
        });
        setRecordedMap(map);
      } catch (err) {
        console.error("Error fetching existing attendance:", err);
      }
    };

    fetchExisting();
  }, [selectedActivityId, selectedDate]);

  const activeActivity = activities.find(a => a.id === selectedActivityId);

  // Filter deacons
  const filteredDeacons = deacons.filter(d => {
    if (filterAssistant !== 'all' && d.assignedAssistantId !== filterAssistant) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchName = d.fullName?.toLowerCase().includes(term);
      const matchUser = d.username?.toLowerCase().includes(term);
      const matchPhone = d.ownPhone?.includes(term) || d.parentPhone?.includes(term);
      return matchName || matchUser || matchPhone;
    }
    return true;
  });

  const handleToggleAttendance = async (deacon: UserData) => {
    if (!activeActivity) {
      alert('يرجى اختيار النشاط أولاً');
      return;
    }

    if (deaconLoading[deacon.id]) return; // Prevent double clicks
    
    const isAlreadyRecorded = !!recordedMap[deacon.id];
    
    setDeaconLoading(prev => ({ ...prev, [deacon.id]: true }));

    try {
      if (!isAlreadyRecorded) {
        // Record attendance & add points
        const recordDate = `${selectedDate}T${new Date().toTimeString().slice(0, 8)}Z`;
        const monthKey = selectedDate.slice(0, 7);
        const uniqueRecordId = `${deacon.id}_${activeActivity.id}_${selectedDate}`;

        await setDoc(doc(db, 'attendance_records', uniqueRecordId), {
          deaconId: deacon.id,
          activityTypeId: activeActivity.id,
          activityName: activeActivity.name,
          date: recordDate,
          status: 'confirmed',
          recordedBy: userData?.id,
          recordedByName: userData?.fullName || 'الخادم',
          timestamp: new Date().toISOString()
        });

        const uniquePointsId = `att_pt_${deacon.id}_${activeActivity.id}_${selectedDate}`;
        await setDoc(doc(db, 'points_log', uniquePointsId), {
          deaconId: deacon.id,
          activityTypeId: activeActivity.id,
          reason: `حضور: ${activeActivity.name}`,
          points: activeActivity.defaultPoints || 0,
          date: recordDate,
          addedBy: userData?.id,
          monthKey
        });

        // Check and award Afteqad points to deacons who contacted this attendee
        const rewarded = await awardAfteqadPointsOnAttendance(deacon.id, deacon.fullName, selectedDate, userData?.id);

        setRecordedMap(prev => ({ ...prev, [deacon.id]: true }));
        if (rewarded.length > 0) {
          setSuccessMsg(`تم تسجيل حضور ${deacon.fullName} (+${activeActivity.defaultPoints} نقطة) ومكافأة ${rewarded.length} خادم شماس قاموا بافتقاده ✨`);
        } else {
          setSuccessMsg(`تم تسجيل حضور ${deacon.fullName} (+${activeActivity.defaultPoints} نقطة)`);
        }
      } else {
        // Unmark: Delete attendance record in Firestore and remove/deduct points
        const uniqueRecordId = `${deacon.id}_${activeActivity.id}_${selectedDate}`;
        const uniquePointsId = `att_pt_${deacon.id}_${activeActivity.id}_${selectedDate}`;
        
        await deleteDoc(doc(db, 'attendance_records', uniqueRecordId)).catch(() => {});
        await deleteDoc(doc(db, 'points_log', uniquePointsId)).catch(() => {});
        
        // Revert any Afteqad points awarded to callers
        await revertAfteqadPointsOnAttendanceCancel(deacon.id, selectedDate);
        
        // Also cleanup any old legacy records that might exist with random IDs to be safe
        const qAtt = query(
          collection(db, 'attendance_records'),
          where('deaconId', '==', deacon.id),
          where('activityTypeId', '==', activeActivity.id)
        );
        const attSnap = await getDocs(qAtt);
        for (const d of attSnap.docs) {
          const data = d.data();
          if (data.date && data.date.startsWith(selectedDate) && d.id !== uniqueRecordId) {
            await deleteDoc(doc(db, 'attendance_records', d.id));
          }
        }

        const qPts = query(
          collection(db, 'points_log'),
          where('deaconId', '==', deacon.id)
        );
        const ptsSnap = await getDocs(qPts);
        for (const d of ptsSnap.docs) {
          const data = d.data();
          const matchesActivity = (data.activityTypeId === activeActivity.id) || 
            (data.reason && data.reason.includes(activeActivity.name));
          const matchesDate = (data.date && data.date.startsWith(selectedDate));
          if (matchesActivity && matchesDate && d.id !== uniquePointsId) {
            await deleteDoc(doc(db, 'points_log', d.id));
          }
        }

        setRecordedMap(prev => {
          const next = { ...prev };
          delete next[deacon.id];
          return next;
        });
        setSuccessMsg(`تم إلغاء حضور ${deacon.fullName} وخصم النقاط بنجاح (-${activeActivity.defaultPoints} نقطة)`);
      }
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      console.error(err);
      alert('حدث خطأ أثناء تعديل الحضور: ' + err.message);
    } finally {
      setDeaconLoading(prev => ({ ...prev, [deacon.id]: false }));
    }
  };

  const handleMarkAllVisible = async () => {
    if (!activeActivity) return;
    const unrecorded = filteredDeacons.filter(d => !recordedMap[d.id]);
    if (unrecorded.length === 0) {
      alert('جميع الشمامسة الظاهرين مسجل حضورهم بالفعل.');
      return;
    }

    if (!window.confirm(`هل تريد تسجيل حضور جماعي لـ ${unrecorded.length} شماس بنشاط (${activeActivity.name})؟`)) return;

    setBatchLoading(true);
    try {
      const recordDate = `${selectedDate}T${new Date().toTimeString().slice(0, 8)}Z`;
      const monthKey = selectedDate.slice(0, 7);

      for (const d of unrecorded) {
        const uniqueRecordId = `${d.id}_${activeActivity.id}_${selectedDate}`;
        await setDoc(doc(db, 'attendance_records', uniqueRecordId), {
          deaconId: d.id,
          activityTypeId: activeActivity.id,
          activityName: activeActivity.name,
          date: recordDate,
          status: 'confirmed',
          recordedBy: userData?.id,
          recordedByName: userData?.fullName || 'الخادم',
          timestamp: new Date().toISOString()
        });

        const uniquePointsId = `att_pt_${d.id}_${activeActivity.id}_${selectedDate}`;
        await setDoc(doc(db, 'points_log', uniquePointsId), {
          deaconId: d.id,
          activityTypeId: activeActivity.id,
          reason: `حضور جماعي: ${activeActivity.name}`,
          points: activeActivity.defaultPoints || 0,
          date: recordDate,
          addedBy: userData?.id,
          monthKey
        });

        // Trigger Afteqad reward check
        await awardAfteqadPointsOnAttendance(d.id, d.fullName, selectedDate, userData?.id);
      }

      const updated = { ...recordedMap };
      unrecorded.forEach(d => { updated[d.id] = true; });
      setRecordedMap(updated);

      setSuccessMsg(`تم تسجيل الحضور الجماعي لـ ${unrecorded.length} شماس بنجاح! 🎉`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error(err);
      alert('حدث خطأ أثناء التسجيل الجماعي: ' + err.message);
    } finally {
      setBatchLoading(false);
    }
  };

  const recordedCount = filteredDeacons.filter(d => recordedMap[d.id]).length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-700 via-emerald-800 to-slate-900 text-white p-6 rounded-3xl shadow-sm border border-teal-600/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
              <UserCheck className="w-8 h-8 text-emerald-300" />
            </div>
            <div>
              <span className="inline-block px-3 py-0.5 bg-emerald-500/30 text-emerald-200 text-xs font-bold rounded-full mb-1">
                نظام التحضير الفوري والسريع
              </span>
              <h2 className="text-xl md:text-2xl font-black">تسجيل الحضور السريع والجماعي</h2>
              <p className="text-xs text-emerald-100/80 mt-0.5">
                تحضير الشمامسة بنقرة واحدة وتوزيع نقاط القداسات والأنشطة فورياً
              </p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/15 text-center">
            <span className="text-[10px] text-emerald-200 block font-bold">الحاضرون اليوم</span>
            <span className="text-xl font-black text-white">{recordedCount} / {filteredDeacons.length}</span>
          </div>
        </div>
      </div>

      {/* Control Bar: Activity selector, Date, Filter */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-emerald-600" />
              النشاط أو القداس
            </label>
            <select
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
            >
              {activities.map(act => (
                <option key={act.id} value={act.id}>
                  {act.name} (+{act.defaultPoints} نقطة)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-blue-600" />
              تاريخ القداس / النشاط
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {userData?.role === 'admin' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-indigo-600" />
                تصفية حسب الخادم المسؤول
              </label>
              <select
                value={filterAssistant}
                onChange={(e) => setFilterAssistant(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">جميع الشمامسة والخُدام</option>
                {assistants.map(a => (
                  <option key={a.id} value={a.id}>{a.fullName} ({a.username})</option>
                ))}
              </select>
            </div>
          )}

          <div className={userData?.role === 'admin' ? '' : 'sm:col-span-2'}>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Search className="w-4 h-4 text-slate-400" />
              بحث بالاسم أو الهاتف
            </label>
            <input
              type="text"
              placeholder="اكتب اسم الشماس للبحث السريع..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Quick Bulk Action Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-500">
            اضغط على بطاقة أي شماس لتحضيره فوراً أو استخدم التحضير الجماعي
          </div>

          <button
            type="button"
            onClick={handleMarkAllVisible}
            disabled={batchLoading || filteredDeacons.length === 0}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm shadow-emerald-600/20 disabled:opacity-50"
          >
            {batchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
            تحضير كل الظاهرين دفعة واحدة ({filteredDeacons.length - recordedCount} متبقي)
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 text-xs font-bold text-center animate-in fade-in">
          {successMsg}
        </div>
      )}

      {/* Deacon Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredDeacons.map(deacon => {
          const isPresent = !!recordedMap[deacon.id];

          return (
            <div
              key={deacon.id}
              onClick={() => handleToggleAttendance(deacon)}
              className={`p-4 rounded-3xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                isPresent 
                  ? 'bg-emerald-50/80 border-emerald-500 shadow-xs ring-2 ring-emerald-500/10' 
                  : 'bg-white hover:bg-slate-50 border-slate-100 hover:border-slate-200 shadow-xs'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {deacon.photoUrl ? (
                  <img src={deacon.photoUrl} alt="" className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0" />
                ) : (
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                    isPresent ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {deacon.fullName?.charAt(0) || 'ش'}
                  </div>
                )}

                <div className="min-w-0">
                  <h4 className={`font-bold text-xs truncate ${isPresent ? 'text-emerald-950' : 'text-slate-800'}`}>
                    {deacon.fullName}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-400 font-mono" dir="ltr">@{deacon.username}</span>
                    {deacon.ownPhone && (
                      <span className="text-[10px] text-slate-500 font-mono" dir="ltr">{deacon.ownPhone}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                {deaconLoading[deacon.id] ? (
                  <div className="w-8 h-8 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-300">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                ) : isPresent ? (
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-300 hover:border-emerald-400">
                    <UserCheck className="w-4 h-4" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredDeacons.length === 0 && (
        <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 p-6 text-slate-400 text-xs">
          لا يوجد شمامسة مطابقين لشروط البحث والتصفية.
        </div>
      )}
    </div>
  );
};
