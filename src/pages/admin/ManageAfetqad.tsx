import React, { useState, useEffect } from 'react';
import { 
  collection, query, getDocs, addDoc, where, orderBy, doc, getDoc, 
  updateDoc, deleteDoc, writeBatch, limit 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Phone, Home, Loader2, Users, CheckCircle2, RefreshCcw, 
  UserX, ShieldAlert, Sparkles, Filter, Search, Check, Clock,
  ArrowRight, PhoneCall, AlertTriangle, Save, Settings, Calendar,
  Download, Award
} from 'lucide-react';
import { UserData } from '../../types';
import { subscribeSystemSettings, updateSystemSettings } from '../../utils/systemSettings';
import { getLiturgicalWeekKey, getLiturgicalWeekRange } from '../../utils/afetqadHelper';

export const ManageAfetqad = () => {
  const { userData } = useAuth();
  const [activeTab, setActiveTab] = useState<'weekly' | 'home'>('weekly');
  
  // Weekly assignments state
  const [loadingAlgorithm, setLoadingAlgorithm] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [deacons, setDeacons] = useState<UserData[]>([]);
  const [activeWeekKey, setActiveWeekKey] = useState<string>(() => getLiturgicalWeekKey());
  const [loadingAbsentees, setLoadingAbsentees] = useState(false);
  
  // Afteqad Points Configuration
  const [afteqadCallPoints, setAfteqadCallPoints] = useState<number>(50);
  const [customAfteqadInput, setCustomAfteqadInput] = useState<string>('50');
  const [savingPointsSetting, setSavingPointsSetting] = useState<boolean>(false);
  const [settingSavedMsg, setSettingSavedMsg] = useState<string>('');

  // Absent deacons selection for the current week
  const [absentIds, setAbsentIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterView, setFilterView] = useState<'all' | 'absent' | 'completed' | 'pending'>('all');
  
  // Home visits state
  const [homeVisits, setHomeVisits] = useState<any[]>([]);
  const [selectedDeacon, setSelectedDeacon] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [visitNotes, setVisitNotes] = useState('');
  const [savingVisit, setSavingVisit] = useState(false);

  const currentWeekKey = getLiturgicalWeekKey();

  useEffect(() => {
    fetchInitialData();
  }, [activeTab]);

  // Subscribe to system settings
  useEffect(() => {
    const unsub = subscribeSystemSettings((cfg) => {
      setAfteqadCallPoints(cfg.afteqadCallPoints ?? 50);
      setCustomAfteqadInput(String(cfg.afteqadCallPoints ?? 50));
    });
    return () => unsub();
  }, []);

  const handleSaveAfteqadPoints = async (pointsValue: number) => {
    if (isNaN(pointsValue) || pointsValue < 0) {
      alert('يرجى إدخال عدد نقاط صحيح وموجب.');
      return;
    }
    setSavingPointsSetting(true);
    setSettingSavedMsg('');
    try {
      await updateSystemSettings({ afteqadCallPoints: pointsValue }, userData?.id);
      setAfteqadCallPoints(pointsValue);
      setCustomAfteqadInput(String(pointsValue));
      setSettingSavedMsg(`تم حفظ نقاط الافتقاد (${pointsValue} نقطة لكل اتصال) بنجاح ✨`);
      setTimeout(() => setSettingSavedMsg(''), 3000);
    } catch (err: any) {
      console.error(err);
      alert('تعذر حفظ الإعدادات: ' + err.message);
    } finally {
      setSavingPointsSetting(false);
    }
  };

  const fetchInitialData = async () => {
    setLoadingData(true);
    try {
      const qDeacons = query(collection(db, 'users'), where('role', '==', 'deacon'));
      const snap = await getDocs(qDeacons);
      const allDeacons = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserData));
      setDeacons(allDeacons);

      if (activeTab === 'weekly') {
        await fetchWeeklyAssignments(allDeacons);
      } else {
        await fetchHomeVisits(allDeacons);
      }
    } catch (e) {
      console.error("Error loading afetqad data:", e);
    } finally {
      setLoadingData(false);
    }
  };

  const fetchWeeklyAssignments = async (deaconsList = deacons) => {
    // 1. Try fetching current week's assignments
    let effectiveWeekKey = currentWeekKey;
    let q = query(collection(db, 'afetqad_assignments'), where('weekKey', '==', currentWeekKey));
    let snap = await getDocs(q);
    
    // 2. If current week has no assignments yet, fallback to the latest available distribution so assignments never disappear
    if (snap.empty) {
      const qLatest = query(collection(db, 'afetqad_assignments'), orderBy('createdAt', 'desc'), limit(150));
      const latestSnap = await getDocs(qLatest);
      if (!latestSnap.empty) {
        const foundWeekKey = latestSnap.docs[0].data().weekKey;
        if (foundWeekKey) {
          effectiveWeekKey = foundWeekKey;
          q = query(collection(db, 'afetqad_assignments'), where('weekKey', '==', foundWeekKey));
          snap = await getDocs(q);
        }
      }
    }

    setActiveWeekKey(effectiveWeekKey);

    const deaconsMap = new Map<string, UserData>(deaconsList.map(d => [d.id, d]));

    const data: any[] = snap.docs.map(d => {
      const docData = d.data();
      const caller = deaconsMap.get(docData.callerId);
      const target = deaconsMap.get(docData.targetId);

      return {
        id: d.id,
        ...docData,
        callerName: caller ? caller.fullName : 'غير معروف',
        callerPhone: caller?.ownPhone || caller?.parentPhone || '',
        targetName: target ? target.fullName : 'غير معروف',
        targetPhone: target?.ownPhone || target?.parentPhone || '',
        targetPhoto: target?.photoUrl
      };
    });

    setAssignments(data);

    // Extract absent IDs from existing priority assignments if available
    const priorityTargets = new Set<string>();
    data.forEach(a => {
      if (a.priority && a.targetId) priorityTargets.add(a.targetId);
    });
    if (priorityTargets.size > 0 && absentIds.length === 0) {
      setAbsentIds(Array.from(priorityTargets));
    }
  };

  // Helper to automatically import absent deacons from the latest recorded attendance
  const handleAutoImportAbsentees = async () => {
    if (deacons.length === 0) return;
    setLoadingAbsentees(true);
    try {
      // Find the most recent attendance records
      const qAtt = query(collection(db, 'attendance_records'), orderBy('date', 'desc'), limit(200));
      const snap = await getDocs(qAtt);
      
      if (snap.empty) {
        alert('لم يتم العثور على سجلات حضور سابقة للاستيراد منها.');
        return;
      }

      // Find the latest recorded date
      const latestDate = snap.docs[0].data().date?.slice(0, 10);
      if (!latestDate) {
        alert('لم يتم العثور على تاريخ مسجل.');
        return;
      }

      // Collect all deacons who attended on that latest date
      const attendedDeaconIds = new Set<string>();
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.date && data.date.startsWith(latestDate) && data.deaconId) {
          attendedDeaconIds.add(data.deaconId);
        }
      });

      // Absent = all deacons minus attended
      const computedAbsents = deacons
        .filter(d => !attendedDeaconIds.has(d.id))
        .map(d => d.id);

      setAbsentIds(computedAbsents);
      alert(`تم استيراد ${computedAbsents.length} غائب تلقائياً استناداً إلى آخر قداس/نشاط مسجل بتاريخ (${latestDate}).`);
    } catch (err: any) {
      console.error(err);
      alert('تعذر استيراد الغائبين: ' + err.message);
    } finally {
      setLoadingAbsentees(false);
    }
  };

  const fetchHomeVisits = async (deaconsList = deacons) => {
    const q = query(collection(db, 'home_visits'), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    const deaconsMap = new Map<string, UserData>(deaconsList.map(d => [d.id, d]));

    const data = snap.docs.map(d => {
      const docData = d.data();
      const deacon = deaconsMap.get(docData.deaconId);
      return {
        id: d.id,
        ...docData,
        deaconName: deacon ? deacon.fullName : 'غير معروف'
      };
    });
    setHomeVisits(data);
  };

  const toggleAbsent = (deaconId: string) => {
    setAbsentIds(prev => 
      prev.includes(deaconId) ? prev.filter(id => id !== deaconId) : [...prev, deaconId]
    );
  };

  // The Algorithmic Distribution Engine
  const runAlgorithm = async () => {
    if (deacons.length < 2) {
      alert('يجب وجود شماسين على الأقل لتشغيل التوزيع.');
      return;
    }

    const confirmMsg = `تأكيد توزيع الافتقاد لهذا الأسبوع (${currentWeekKey}):\n` +
      `• إجمالي الشمامسة: ${deacons.length}\n` +
      `• الغائبين المحددين (أولوية 6 اتصالات): ${absentIds.length}\n` +
      `• غير الغائبين (3 اتصالات): ${deacons.length - absentIds.length}\n` +
      `• كل شماس سيُسند إليه 3 زملاء ليتصل بهم.\n\nهل تريد المتابعة وحفظ التوزيع؟`;

    if (!window.confirm(confirmMsg)) return;

    setLoadingAlgorithm(true);
    try {
      const N = deacons.length;
      const tasksPerCaller = Math.min(3, N - 1);
      const absentSet = new Set(absentIds);

      // Best algorithm solver with multiple randomized attempts
      let bestSolution: Array<{ callerId: string; targetId: string; priority: boolean }> | null = null;
      let minPenalty = Infinity;

      for (let attempt = 0; attempt < 200; attempt++) {
        const callerAssignments: Record<string, string[]> = {};
        const targetIncoming: Record<string, number> = {};
        deacons.forEach(d => {
          callerAssignments[d.id] = [];
          targetIncoming[d.id] = 0;
        });

        // 1. Phase 1: Allocate Absent Targets (Priority: 6 calls each, or up to N-1)
        const targetCapacity: Record<string, number> = {};
        deacons.forEach(d => {
          targetCapacity[d.id] = absentSet.has(d.id) ? Math.min(6, N - 1) : Math.min(3, N - 1);
        });

        // Shuffle deacons for randomness
        const shuffledCallers = [...deacons].sort(() => 0.5 - Math.random());
        const shuffledAbsent = deacons.filter(d => absentSet.has(d.id)).sort(() => 0.5 - Math.random());
        const shuffledPresent = deacons.filter(d => !absentSet.has(d.id)).sort(() => 0.5 - Math.random());

        // Fill absent targets first
        for (const target of shuffledAbsent) {
          const needed = targetCapacity[target.id];
          const availableCallers = shuffledCallers
            .filter(c => c.id !== target.id && callerAssignments[c.id].length < tasksPerCaller)
            .sort((a, b) => callerAssignments[a.id].length - callerAssignments[b.id].length);

          for (const caller of availableCallers) {
            if (targetIncoming[target.id] >= needed) break;
            if (!callerAssignments[caller.id].includes(target.id)) {
              callerAssignments[caller.id].push(target.id);
              targetIncoming[target.id]++;
            }
          }
        }

        // Fill remaining slots for callers who have < tasksPerCaller
        for (const caller of shuffledCallers) {
          while (callerAssignments[caller.id].length < tasksPerCaller) {
            // Pick target with lowest incoming count that isn't the caller and not already assigned
            const candidates = [...deacons]
              .filter(t => t.id !== caller.id && !callerAssignments[caller.id].includes(t.id))
              .sort((a, b) => {
                // prioritize under-capacity targets
                const diffA = targetIncoming[a.id] - targetCapacity[a.id];
                const diffB = targetIncoming[b.id] - targetCapacity[b.id];
                return diffA - diffB;
              });

            if (candidates.length === 0) break;
            const chosen = candidates[0];
            callerAssignments[caller.id].push(chosen.id);
            targetIncoming[chosen.id]++;
          }
        }

        // Calculate penalty
        let penalty = 0;
        deacons.forEach(d => {
          // Caller must have exact tasksPerCaller
          const callerShortage = tasksPerCaller - callerAssignments[d.id].length;
          penalty += callerShortage * 100;

          // Target capacity difference
          const targetDiff = Math.abs(targetIncoming[d.id] - targetCapacity[d.id]);
          penalty += targetDiff * 5;
        });

        if (penalty < minPenalty) {
          minPenalty = penalty;
          const sol: Array<{ callerId: string; targetId: string; priority: boolean }> = [];
          Object.entries(callerAssignments).forEach(([cId, targets]) => {
            targets.forEach(tId => {
              sol.push({
                callerId: cId,
                targetId: tId,
                priority: absentSet.has(tId)
              });
            });
          });
          bestSolution = sol;
          if (penalty === 0) break;
        }
      }

      if (!bestSolution || bestSolution.length === 0) {
        throw new Error('تعذر إيجاد حل توزيع متوازن');
      }

      // Step 2: Delete previous assignments for this week
      const qOld = query(collection(db, 'afetqad_assignments'), where('weekKey', '==', currentWeekKey));
      const oldSnap = await getDocs(qOld);
      for (const d of oldSnap.docs) {
        await deleteDoc(doc(db, 'afetqad_assignments', d.id));
      }

      // Step 3: Insert new assignments into Firestore
      for (const item of bestSolution) {
        await addDoc(collection(db, 'afetqad_assignments'), {
          callerId: item.callerId,
          targetId: item.targetId,
          weekKey: currentWeekKey,
          priority: item.priority,
          status: 'pending',
          createdAt: new Date().toISOString()
        });
      }

      await fetchWeeklyAssignments(deacons);
      alert(`تم التوزيع بنجاح! تم إنشاء ${bestSolution.length} مهمة اتصال (${tasksPerCaller} مهام لكل شماس).`);
    } catch (err: any) {
      console.error("Algorithm error:", err);
      alert('حدث خطأ أثناء تشغيل الخوارزمية: ' + err.message);
    } finally {
      setLoadingAlgorithm(false);
    }
  };

  const handleToggleTaskStatus = async (taskId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
      await updateDoc(doc(db, 'afetqad_assignments', taskId), {
        status: newStatus,
        completedAt: newStatus === 'completed' ? new Date().toISOString() : null
      });
      setAssignments(prev => prev.map(a => a.id === taskId ? { ...a, status: newStatus } : a));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveHomeVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeacon || !visitDate) return;
    setSavingVisit(true);
    try {
      await addDoc(collection(db, 'home_visits'), {
        deaconId: selectedDeacon,
        date: new Date(visitDate).toISOString(),
        notes: visitNotes,
        recordedBy: userData?.id,
        createdAt: new Date().toISOString()
      });
      setSelectedDeacon('');
      setVisitDate('');
      setVisitNotes('');
      await fetchHomeVisits(deacons);
      alert('تم حفظ الزيارة المنزلية بنجاح.');
    } catch (error) {
      console.error(error);
    } finally {
      setSavingVisit(false);
    }
  };

  // Group assignments by caller
  const groupedByCaller = React.useMemo(() => {
    const map = new Map<string, { caller: UserData | undefined; tasks: any[] }>();
    deacons.forEach(d => map.set(d.id, { caller: d, tasks: [] }));

    assignments.forEach(a => {
      const entry = map.get(a.callerId);
      if (entry) {
        entry.tasks.push(a);
      }
    });

    return Array.from(map.values());
  }, [assignments, deacons]);

  const filteredCallerGroups = groupedByCaller.filter(group => {
    if (!group.caller) return false;
    const nameMatch = group.caller.fullName.toLowerCase().includes(searchTerm.toLowerCase());
    if (!nameMatch) {
      // search inside assigned targets
      const targetMatch = group.tasks.some(t => t.targetName?.toLowerCase().includes(searchTerm.toLowerCase()));
      if (!targetMatch) return false;
    }

    if (filterView === 'absent') {
      return absentIds.includes(group.caller.id);
    }
    if (filterView === 'completed') {
      return group.tasks.length > 0 && group.tasks.every(t => t.status === 'completed');
    }
    if (filterView === 'pending') {
      return group.tasks.some(t => t.status !== 'completed');
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 text-white p-6 rounded-3xl shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20">
              <Phone className="w-8 h-8 text-orange-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="inline-block px-3 py-0.5 bg-orange-500/30 text-orange-100 text-xs font-bold rounded-full">
                  نظام الافتقاد الذكي الأسبوعي
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-0.5 bg-yellow-400/20 text-yellow-100 text-xs font-bold rounded-full border border-yellow-300/30">
                  <Sparkles className="w-3.5 h-3.5" />
                  مكافأة نجاح الافتقاد: +{afteqadCallPoints} نقطة عند الحضور
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-black">توزيع ومتابعة افتقاد الشمامسة</h2>
              <p className="text-xs text-orange-100/90 mt-1 font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>{getLiturgicalWeekRange(activeWeekKey)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setActiveTab('weekly')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${
                activeTab === 'weekly' 
                  ? 'bg-white text-orange-900 shadow-sm' 
                  : 'bg-white/15 text-white hover:bg-white/25 border border-white/20'
              }`}
            >
              الافتقاد الأسبوعي (3 أسماء)
            </button>
            <button 
              onClick={() => setActiveTab('home')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${
                activeTab === 'home' 
                  ? 'bg-white text-orange-900 shadow-sm' 
                  : 'bg-white/15 text-white hover:bg-white/25 border border-white/20'
              }`}
            >
              الزيارات المنزلية
            </button>
          </div>
        </div>
      </div>

      {/* 🎯 Afteqad Points Configuration Card for Admins */}
      {userData?.role === 'admin' && (
        <div className="bg-gradient-to-r from-amber-50/95 via-orange-50/80 to-yellow-50/90 border border-amber-200 rounded-3xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-sm shrink-0">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-slate-800 text-sm">مكافأة نقاط نجاح الافتقاد</h3>
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-800 text-[11px] font-bold rounded-full">
                    الحالي: {afteqadCallPoints} نقطة لكل اتصال ناجح
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  عندما يحدد الشماس المهمة كـ "منجز"، ينتظر النظام قداس الجمعة التالي، وإذا حضر الشماس المُفتقَد تُضاف النقاط آلياً للشماس المتصل تشجيعاً لثمر الافتقاد.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
              <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-slate-200 shadow-inner">
                <input
                  type="number"
                  min="0"
                  max="1000"
                  step="5"
                  value={customAfteqadInput}
                  onChange={(e) => setCustomAfteqadInput(e.target.value)}
                  className="w-20 px-3 py-1.5 text-center font-black text-slate-800 text-sm focus:outline-none"
                  placeholder="50"
                />
                <span className="text-xs font-bold text-slate-500 pl-2">نقطة</span>
              </div>

              <button
                type="button"
                onClick={() => handleSaveAfteqadPoints(Number(customAfteqadInput))}
                disabled={savingPointsSetting}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                {savingPointsSetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                حفظ التعديل
              </button>

              {/* Quick Presets */}
              <div className="hidden sm:flex items-center gap-1 mr-1">
                {[20, 30, 50, 100].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setCustomAfteqadInput(String(val));
                      handleSaveAfteqadPoints(val);
                    }}
                    className={`px-2.5 py-1.5 text-[11px] font-bold rounded-xl transition-all border ${
                      afteqadCallPoints === val
                        ? 'bg-orange-500 text-white border-orange-600 shadow-sm'
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

      {activeTab === 'weekly' && (
        <div className="space-y-6">
          {/* Algorithm Setup Box: Absent Selection & Run Button */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <UserX className="w-5 h-5 text-rose-500" />
                  تحديد الغائبين عن قداس هذا الأسبوع ({absentIds.length} غائب)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  اضغط على اسم الشماس لتحديده كغائب (يحصل الغائب على أولوية 6 متصلين للاطمئنان عليه)
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <button
                  type="button"
                  onClick={handleAutoImportAbsentees}
                  disabled={loadingAbsentees}
                  className="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-2xl font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                  title="استيراد الغائبين تلقائياً من آخر قداس مسجل"
                >
                  {loadingAbsentees ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  استيراد الغائبين من آخر قداس
                </button>

                <button 
                  onClick={runAlgorithm}
                  disabled={loadingAlgorithm}
                  className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-slate-900/20 transition-all disabled:opacity-50"
                >
                  {loadingAlgorithm ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                      جاري تشغيل الخوارزمية وتوزيع الـ 3 أسماء...
                    </>
                  ) : (
                    <>
                      <RefreshCcw className="w-4 h-4 text-orange-400" />
                      توليد وتوزيع الافتقاد لهذا الأسبوع
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Absent Toggle Grid */}
            <div>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                {deacons.map(d => {
                  const isAbsent = absentIds.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleAbsent(d.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                        isAbsent 
                          ? 'bg-rose-500 text-white border-rose-600 shadow-xs' 
                          : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      <span>{d.fullName}</span>
                      {isAbsent ? (
                        <span className="bg-rose-700 text-white text-[10px] px-1.5 py-0.2 rounded-md">غائب (6)</span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">حاضر</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Stats Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-2xl text-center">
                <span className="text-[10px] text-blue-700 font-bold block">إجمالي الشمامسة</span>
                <span className="text-lg font-black text-blue-900">{deacons.length}</span>
              </div>
              <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl text-center">
                <span className="text-[10px] text-rose-700 font-bold block">الغائبين (أولوية 6 اتصالات)</span>
                <span className="text-lg font-black text-rose-900">{absentIds.length}</span>
              </div>
              <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-2xl text-center">
                <span className="text-[10px] text-emerald-700 font-bold block">الحاضرين (3 اتصالات)</span>
                <span className="text-lg font-black text-emerald-900">{deacons.length - absentIds.length}</span>
              </div>
              <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-2xl text-center">
                <span className="text-[10px] text-amber-700 font-bold block">مهام الاتصال المنفذة</span>
                <span className="text-lg font-black text-amber-900">{assignments.length}</span>
              </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
              <input
                type="text"
                placeholder="بحث باسم الشماس أو الزميل المسند..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
              <button
                onClick={() => setFilterView('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  filterView === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                الكل ({groupedByCaller.length})
              </button>
              <button
                onClick={() => setFilterView('absent')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  filterView === 'absent' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
              >
                الغائبين فقط ({absentIds.length})
              </button>
              <button
                onClick={() => setFilterView('completed')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  filterView === 'completed' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                تم الاتصال بالكامل
              </button>
              <button
                onClick={() => setFilterView('pending')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  filterView === 'pending' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                قيد المتابعة
              </button>
            </div>
          </div>

          {/* Deacon Cards with their 3 Assigned Tasks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCallerGroups.map(group => {
              if (!group.caller) return null;
              const isAbsent = absentIds.includes(group.caller.id);
              const completedCount = group.tasks.filter(t => t.status === 'completed').length;

              return (
                <div 
                  key={group.caller.id} 
                  className={`bg-white p-5 rounded-3xl border shadow-sm transition-all space-y-4 ${
                    isAbsent ? 'border-rose-200 bg-rose-50/20' : 'border-slate-100'
                  }`}
                >
                  {/* Caller Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      {group.caller.photoUrl ? (
                        <img src={group.caller.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm">
                          {group.caller.fullName.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-slate-800 text-sm">{group.caller.fullName}</h4>
                          {isAbsent && (
                            <span className="px-2 py-0.2 bg-rose-100 text-rose-800 rounded-md text-[10px] font-black">
                              غائب
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {group.caller.ownPhone || group.caller.parentPhone || 'بدون هاتف'}
                        </p>
                      </div>
                    </div>

                    <div className="text-left">
                      <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                        completedCount === group.tasks.length && group.tasks.length > 0
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {completedCount} / {group.tasks.length} اتصالات
                      </span>
                    </div>
                  </div>

                  {/* 3 Assigned Targets */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-slate-600">الشمامسة المطلوب الافتقاد والاتصال بهم (3 أسماء):</p>
                    {group.tasks.length > 0 ? (
                      <div className="space-y-2">
                        {group.tasks.map((task, idx) => (
                          <div 
                            key={task.id || idx}
                            className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                              task.status === 'completed'
                                ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                                : 'bg-slate-50 border-slate-100 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-full bg-white text-slate-600 text-xs font-black flex items-center justify-center border border-slate-200">
                                {idx + 1}
                              </span>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-xs">{task.targetName}</span>
                                  {task.priority && (
                                    <span className="px-1.5 py-0.2 bg-rose-100 text-rose-700 rounded text-[9px] font-extrabold">
                                      غائب
                                    </span>
                                  )}
                                </div>
                                {task.targetPhone && (
                                  <a 
                                    href={`tel:${task.targetPhone}`}
                                    className="text-[10px] text-blue-600 hover:underline font-mono block"
                                  >
                                    📞 {task.targetPhone}
                                  </a>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {task.status === 'completed' && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                                  task.pointsAwarded 
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                                }`}>
                                  {task.pointsAwarded ? '🎉 حضر وأضيفت النقاط' : '⏳ بانتظار حضور القداس'}
                                </span>
                              )}

                              <button
                                onClick={() => handleToggleTaskStatus(task.id, task.status)}
                                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all ${
                                  task.status === 'completed'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                                }`}
                              >
                                {task.status === 'completed' ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" /> تم الاتصال
                                  </>
                                ) : (
                                  <>
                                    <Clock className="w-3.5 h-3.5 text-amber-500" /> تعيين كمنجز
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 rounded-2xl text-center text-xs text-slate-400 border border-dashed border-slate-200">
                        لم يتم التوزيع لهذا الشماس بعد
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredCallerGroups.length === 0 && (
              <div className="col-span-2 text-center p-12 bg-white rounded-3xl border border-slate-200 border-dashed text-slate-400 text-sm">
                لا توجد نتائج مطابقة لبحثك.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'home' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-max space-y-4">
            <h3 className="font-extrabold text-slate-800 text-base">تسجيل زيارة منزلية جديدة</h3>
            <form onSubmit={handleSaveHomeVisit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">الشماس المستهدف:</label>
                <select 
                  required 
                  value={selectedDeacon} 
                  onChange={e => setSelectedDeacon(e.target.value)} 
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500"
                >
                  <option value="">-- اختر الشماس --</option>
                  {deacons.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ الزيارة:</label>
                <input 
                  required 
                  type="date" 
                  value={visitDate} 
                  onChange={e => setVisitDate(e.target.value)} 
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">ملاحظات وتقرير الزيارة:</label>
                <textarea 
                  required 
                  value={visitNotes} 
                  onChange={e => setVisitNotes(e.target.value)} 
                  rows={3} 
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs text-slate-800 focus:outline-none focus:border-orange-500" 
                  placeholder="اكتب ما تم في الزيارة وحالة الشماس والأسرة..."
                />
              </div>
              <button 
                disabled={savingVisit} 
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-md shadow-orange-600/20 transition-all disabled:opacity-50"
              >
                {savingVisit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Home className="w-4 h-4" />}
                حفظ الزيارة في الأرشيف
              </button>
            </form>
          </div>

          <div className="md:col-span-2 space-y-3">
            {homeVisits.map(visit => (
              <div key={visit.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-start gap-4">
                <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl shrink-0">
                  <Home className="w-6 h-6" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-slate-800 text-sm">{visit.deaconName}</h4>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {new Date(visit.date).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-100 leading-relaxed">
                    {visit.notes}
                  </p>
                </div>
              </div>
            ))}
            {homeVisits.length === 0 && (
              <div className="text-center p-12 bg-white rounded-3xl text-slate-400 border border-slate-200 border-dashed text-xs">
                لا توجد زيارات منزلية مسجلة بعد.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
