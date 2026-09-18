import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  collection, query, where, onSnapshot, getDocs, doc, 
  updateDoc, addDoc, deleteDoc, setDoc 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { 
  UserData, ChorusGroup, SubscriptionRecord, StudyMaterial, 
  Quiz, QuizSubmission, ActivityType 
} from '../../types';
import { 
  Users, UserCheck, ShieldCheck, Trophy, CreditCard, BookOpen, 
  Award, Bell, Search, Plus, Phone, Calendar, CheckCircle2, 
  XCircle, Clock, ChevronDown, Filter, Sparkles, MessageCircle, 
  ExternalLink, Layers, Send, AlertCircle, Edit3, ArrowUpDown, 
  FileSpreadsheet, Loader2, Star, Check, RefreshCw, Crown
} from 'lucide-react';
import { initDefaultChoruses } from '../../utils/chorusHelper';
import { subscribeSystemSettings } from '../../utils/systemSettings';
import { sendNotificationToDeacons } from '../../utils/notificationHelper';

export const ChorusAdminDashboard: React.FC<{ forcedGroupId?: string }> = ({ forcedGroupId }) => {
  const { userData } = useAuth();
  const [searchParams] = useSearchParams();
  const queryGroupId = searchParams.get('groupId') || forcedGroupId;
  
  // All Chorus Groups in church
  const [allChoruses, setAllChoruses] = useState<ChorusGroup[]>([]);
  // Active selected chorus for this view
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  
  // Data for selected chorus
  const [deacons, setDeacons] = useState<UserData[]>([]);
  const [servants, setServants] = useState<UserData[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, SubscriptionRecord>>({});
  const [attendanceMap, setAttendanceMap] = useState<Record<string, boolean>>({});
  const [todayAttendanceCount, setTodayAttendanceCount] = useState(0);
  const [studyMaterials, setStudyMaterials] = useState<StudyMaterial[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [submissions, setSubmissions] = useState<QuizSubmission[]>([]);
  const [afetqadLogs, setAfetqadLogs] = useState<any[]>([]);
  const [totalPointsMap, setTotalPointsMap] = useState<Record<string, number>>({});
  const [monthPointsMap, setMonthPointsMap] = useState<Record<string, number>>({});

  // Active Tab
  const [activeTab, setActiveTab] = useState<'deacons' | 'attendance' | 'subscriptions' | 'servants' | 'study' | 'quizzes' | 'leaderboard' | 'broadcast'>('deacons');

  // Loading & Filter States
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [subscriptionPoints, setSubscriptionPoints] = useState(300);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Modals
  const [showAddDeaconModal, setShowAddDeaconModal] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // New Deacon Form State
  const [newDeaconData, setNewDeaconData] = useState({
    fullName: '',
    username: '',
    password: '',
    ownPhone: '',
    parentPhone: '',
    grade: '',
    assignedAssistantId: ''
  });
  const [creatingDeacon, setCreatingDeacon] = useState(false);

  const now = new Date();
  const todayDateStr = now.toISOString().slice(0, 10);
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 1. Fetch System Settings
  useEffect(() => {
    const unsub = subscribeSystemSettings((cfg) => {
      setSubscriptionPoints(cfg.subscriptionPoints ?? 300);
    });
    return () => unsub();
  }, []);

  // 2. Fetch All Chorus Groups
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'chorus_groups'), (snap) => {
      if (snap.empty) {
        initDefaultChoruses().then(seeded => {
          setAllChoruses(seeded);
          determineInitialChorus(seeded);
        });
      } else {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChorusGroup))
          .sort((a, b) => a.order - b.order);
        setAllChoruses(list);
        determineInitialChorus(list);
      }
    });

    return () => unsub();
  }, [userData, forcedGroupId]);

  const determineInitialChorus = (list: ChorusGroup[]) => {
    if (queryGroupId) {
      const match = list.find(c => c.id === queryGroupId || c.code === queryGroupId);
      setSelectedGroupId(match ? match.id : queryGroupId);
      return;
    }
    // If user has specific groupId assigned
    if (userData?.groupId && list.some(c => c.id === userData.groupId || c.code === userData.groupId)) {
      const match = list.find(c => c.id === userData.groupId || c.code === userData.groupId);
      setSelectedGroupId(match ? match.id : userData.groupId);
      return;
    }
    // If user has assignedGroupIds
    if (userData?.assignedGroupIds && userData.assignedGroupIds.length > 0) {
      setSelectedGroupId(userData.assignedGroupIds[0]);
      return;
    }
    // Fallback: pick first active chorus
    if (list.length > 0 && !selectedGroupId) {
      setSelectedGroupId(list[0].id);
    }
  };

  const currentChorus = useMemo(() => {
    return allChoruses.find(c => c.id === selectedGroupId || c.code === selectedGroupId) || allChoruses[0];
  }, [allChoruses, selectedGroupId]);

  // Available choruses this user can switch between:
  // Super Admin can switch to ALL. Chorus Admin can switch to their assigned groups (or primary group).
  const switchableChoruses = useMemo(() => {
    if (userData?.role === 'admin') return allChoruses;
    if (userData?.assignedGroupIds && userData.assignedGroupIds.length > 0) {
      return allChoruses.filter(c => userData.assignedGroupIds?.includes(c.id) || userData.assignedGroupIds?.includes(c.code) || c.id === userData.groupId);
    }
    if (userData?.groupId) {
      return allChoruses.filter(c => c.id === userData.groupId || c.code === userData.groupId);
    }
    return allChoruses;
  }, [allChoruses, userData]);

  // 3. Fetch Data for the Selected Chorus
  useEffect(() => {
    if (!currentChorus) return;
    setLoading(true);

    const chorusId = currentChorus.id;
    const chorusCode = currentChorus.code;

    // Fetch Deacons of this Chorus
    const qUsers = query(collection(db, 'users'));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      const allList = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserData));
      
      // Deacons belonging to this chorus (matches id, code, or if unassigned on chorus 9 fallback)
      const chorusDeacons = allList.filter(u => {
        if (u.role !== 'deacon') return false;
        return u.groupId === chorusId || u.groupId === chorusCode || (!u.groupId && chorusId === 'chorus_9');
      });
      setDeacons(chorusDeacons);

      // Servants belonging to or assigned to this chorus
      const chorusServants = allList.filter(u => {
        if (u.role !== 'assistant' && u.role !== 'chorus_admin') return false;
        return u.groupId === chorusId || 
               u.groupId === chorusCode || 
               u.assignedGroupIds?.includes(chorusId) || 
               u.assignedGroupIds?.includes(chorusCode) ||
               currentChorus.servantIds?.includes(u.id) ||
               currentChorus.adminIds?.includes(u.id);
      });
      setServants(chorusServants);
      setLoading(false);
    });

    // Fetch Activities
    const qActs = query(collection(db, 'activity_types'), where('active', '==', true));
    const unsubActs = onSnapshot(qActs, (snap) => {
      const acts = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityType));
      setActivities(acts);
      if (acts.length > 0 && !selectedActivityId) {
        setSelectedActivityId(acts[0].id);
      }
    });

    // Fetch Subscriptions for Current Month
    const qSubs = query(collection(db, 'subscriptions'), where('monthKey', '==', currentMonthKey));
    const unsubSubs = onSnapshot(qSubs, (snap) => {
      const map: Record<string, SubscriptionRecord> = {};
      snap.docs.forEach(docSnap => {
        const data = docSnap.data() as SubscriptionRecord;
        map[data.deaconId] = { ...data, id: docSnap.id };
      });
      setSubscriptions(map);
    });

    // Fetch Study Materials for this chorus (or all)
    const qMaterials = query(collection(db, 'study_materials'));
    const unsubMaterials = onSnapshot(qMaterials, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as StudyMaterial))
        .filter(m => m.groupId === 'all' || m.groupId === chorusId || m.groupId === chorusCode);
      setStudyMaterials(list);
    });

    // Fetch Quizzes for this chorus
    const qQuizzes = query(collection(db, 'quizzes'));
    const unsubQuizzes = onSnapshot(qQuizzes, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Quiz))
        .filter(q => q.groupId === 'all' || q.groupId === chorusId || q.groupId === chorusCode);
      setQuizzes(list);
    });

    // Fetch Points Log to calculate Total and Month Points
    const qPoints = query(collection(db, 'points_log'));
    const unsubPoints = onSnapshot(qPoints, (snap) => {
      const totalMap: Record<string, number> = {};
      const monthMap: Record<string, number> = {};

      snap.docs.forEach(d => {
        const p = d.data();
        const dId = p.deaconId;
        const pts = Number(p.points || 0);
        totalMap[dId] = (totalMap[dId] || 0) + pts;
        if (p.monthKey === currentMonthKey) {
          monthMap[dId] = (monthMap[dId] || 0) + pts;
        }
      });

      setTotalPointsMap(totalMap);
      setMonthPointsMap(monthMap);
    });

    // Fetch Afetqad Logs for this Chorus
    const qAfetqad = query(collection(db, 'afetqad_records'));
    const unsubAfetqad = onSnapshot(qAfetqad, (snap) => {
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAfetqadLogs(logs);
    });

    return () => {
      unsubUsers();
      unsubActs();
      unsubSubs();
      unsubMaterials();
      unsubQuizzes();
      unsubPoints();
      unsubAfetqad();
    };
  }, [currentChorus, currentMonthKey]);

  // Fetch today's attendance when activity changes
  useEffect(() => {
    if (!selectedActivityId) return;

    const fetchAttendance = async () => {
      try {
        const q = query(
          collection(db, 'attendance_records'),
          where('activityTypeId', '==', selectedActivityId)
        );
        const snap = await getDocs(q);
        const map: Record<string, boolean> = {};
        let count = 0;
        snap.docs.forEach(d => {
          const data = d.data();
          if (data.date && data.date.startsWith(todayDateStr)) {
            map[data.deaconId] = true;
            // check if deacon belongs to this chorus
            if (deacons.some(dec => dec.id === data.deaconId)) {
              count++;
            }
          }
        });
        setAttendanceMap(map);
        setTodayAttendanceCount(count);
      } catch (e) {
        console.error(e);
      }
    };

    fetchAttendance();
  }, [selectedActivityId, todayDateStr, deacons]);

  // Handle Attendance Toggle
  const handleToggleAttendance = async (deacon: UserData) => {
    if (!selectedActivityId) return;
    setActionLoadingId(deacon.id);

    const isAttended = !!attendanceMap[deacon.id];
    const activity = activities.find(a => a.id === selectedActivityId);
    const points = activity?.defaultPoints || 0;

    try {
      if (!isAttended) {
        const recordDate = `${todayDateStr}T${new Date().toTimeString().slice(0, 8)}Z`;
        await addDoc(collection(db, 'attendance_records'), {
          deaconId: deacon.id,
          groupId: currentChorus?.id,
          activityTypeId: selectedActivityId,
          activityName: activity?.name || 'نشاط',
          date: recordDate,
          status: 'confirmed',
          recordedBy: userData?.id,
          recordedByName: userData?.fullName || 'أدمن الخورس',
          timestamp: new Date().toISOString()
        });

        await addDoc(collection(db, 'points_log'), {
          deaconId: deacon.id,
          groupId: currentChorus?.id,
          activityTypeId: selectedActivityId,
          reason: `حضور [${currentChorus?.name}]: ${activity?.name || 'نشاط'}`,
          points,
          date: recordDate,
          addedBy: userData?.id,
          monthKey: currentMonthKey
        });

        setAttendanceMap(prev => ({ ...prev, [deacon.id]: true }));
        setTodayAttendanceCount(prev => prev + 1);
        setSuccessMsg(`تم تسجيل حضور ${deacon.fullName} (+${points} نقطة) ✅`);
      } else {
        // Remove attendance record
        const qAtt = query(
          collection(db, 'attendance_records'),
          where('deaconId', '==', deacon.id),
          where('activityTypeId', '==', selectedActivityId)
        );
        const attSnap = await getDocs(qAtt);
        for (const d of attSnap.docs) {
          const data = d.data();
          if (data.date && data.date.startsWith(todayDateStr)) {
            await deleteDoc(doc(db, 'attendance_records', d.id));
          }
        }

        // Remove points log
        const qPts = query(
          collection(db, 'points_log'),
          where('deaconId', '==', deacon.id)
        );
        const ptsSnap = await getDocs(qPts);
        for (const d of ptsSnap.docs) {
          const data = d.data();
          if (data.date && data.date.startsWith(todayDateStr) && data.activityTypeId === selectedActivityId) {
            await deleteDoc(doc(db, 'points_log', d.id));
          }
        }

        setAttendanceMap(prev => ({ ...prev, [deacon.id]: false }));
        setTodayAttendanceCount(prev => Math.max(0, prev - 1));
        setSuccessMsg(`تم إلغاء تحضير ${deacon.fullName}`);
      }
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      console.error(e);
      alert('حدث خطأ أثناء تعديل الحضور');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Subscription Toggle (30 EGP)
  const handleToggleSubscription = async (deacon: UserData) => {
    setActionLoadingId(`sub_${deacon.id}`);
    const sub = subscriptions[deacon.id];
    const isPaid = sub?.paid ?? false;

    try {
      const docId = sub?.id || `${deacon.id}_${currentMonthKey}`;
      const newPaid = !isPaid;

      await setDoc(doc(db, 'subscriptions', docId), {
        deaconId: deacon.id,
        deaconName: deacon.fullName,
        groupId: currentChorus?.id,
        monthKey: currentMonthKey,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        amount: 30,
        paid: newPaid,
        paidAt: newPaid ? new Date().toISOString() : null,
        recordedBy: userData?.id,
        recordedByName: userData?.fullName || 'أدمن الخورس'
      }, { merge: true });

      // If marked as paid, award subscription points
      if (newPaid) {
        await addDoc(collection(db, 'points_log'), {
          deaconId: deacon.id,
          groupId: currentChorus?.id,
          reason: `سداد اشتراك الشهر (30 ج) - [${currentChorus?.name}]`,
          points: subscriptionPoints,
          date: new Date().toISOString(),
          addedBy: userData?.id,
          monthKey: currentMonthKey
        });
        setSuccessMsg(`تم تسجيل سداد اشتراك ${deacon.fullName} (+${subscriptionPoints} نقطة) 💳`);
      } else {
        setSuccessMsg(`تم إلغاء سداد اشتراك ${deacon.fullName}`);
      }
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      console.error(e);
      alert('تعذر تحديث الاشتراك');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Add Deacon directly to this Chorus
  const handleCreateDeacon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeaconData.fullName.trim() || !newDeaconData.username.trim() || !newDeaconData.password.trim()) {
      alert('يرجى ملء الاسم واسم المستخدم وكلمة المرور');
      return;
    }
    setCreatingDeacon(true);

    try {
      const usernameClean = newDeaconData.username.trim().toLowerCase();
      // Create user doc
      const newRef = doc(collection(db, 'users'));
      await setDoc(newRef, {
        fullName: newDeaconData.fullName.trim(),
        username: usernameClean,
        tempPassword: newDeaconData.password.trim(),
        role: 'deacon',
        groupId: currentChorus?.id,
        ownPhone: newDeaconData.ownPhone.trim(),
        parentPhone: newDeaconData.parentPhone.trim(),
        grade: newDeaconData.grade.trim(),
        assignedAssistantId: newDeaconData.assignedAssistantId || '',
        createdAt: new Date().toISOString(),
        isFirstLogin: true
      });

      setShowAddDeaconModal(false);
      setNewDeaconData({
        fullName: '',
        username: '',
        password: '',
        ownPhone: '',
        parentPhone: '',
        grade: '',
        assignedAssistantId: ''
      });
      setSuccessMsg(`تم إضافة الشماس بنجاح وتعيينه لـ ${currentChorus?.name} ✨`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      console.error(e);
      alert('تعذر إنشاء حساب الشماس');
    } finally {
      setCreatingDeacon(false);
    }
  };

  // Send Broadcast to this Chorus
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) return;
    setSendingBroadcast(true);

    try {
      // Save notification in database targeting this chorus
      await addDoc(collection(db, 'notifications'), {
        title: broadcastTitle.trim(),
        body: broadcastMessage.trim(),
        audience: 'deacons',
        groupId: currentChorus?.id,
        groupName: currentChorus?.name,
        createdAt: new Date().toISOString(),
        senderId: userData?.id,
        senderName: userData?.fullName || 'أدمن الخورس'
      });

      // Send push notification to all deacons in this chorus
      const deaconIds = deacons.map(d => d.id).filter(Boolean);
      if (deaconIds.length > 0) {
        await sendNotificationToDeacons(deaconIds, broadcastTitle.trim(), broadcastMessage.trim(), 'blue');
      }

      setShowBroadcastModal(false);
      setBroadcastTitle('');
      setBroadcastMessage('');
      setSuccessMsg(`تم إرسال التنبيه لشمامسة وأولياء أمور ${currentChorus?.name} بنجاح 🔔`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      console.error(e);
      alert('تعذر إرسال الإشعار');
    } finally {
      setSendingBroadcast(false);
    }
  };

  // Filtered deacons for searching
  const filteredDeacons = useMemo(() => {
    return deacons.filter(d => {
      const q = searchTerm.toLowerCase();
      return (
        d.fullName.toLowerCase().includes(q) ||
        d.username?.toLowerCase().includes(q) ||
        d.ownPhone?.includes(q) ||
        d.parentPhone?.includes(q)
      );
    });
  }, [deacons, searchTerm]);

  // Ranked deacons for Leaderboard
  const rankedDeacons = useMemo(() => {
    return [...deacons].map(d => ({
      ...d,
      monthPoints: monthPointsMap[d.id] || 0,
      totalPoints: totalPointsMap[d.id] || 0
    })).sort((a, b) => b.monthPoints - a.monthPoints || b.totalPoints - a.totalPoints);
  }, [deacons, monthPointsMap, totalPointsMap]);

  // Paid Subscriptions Count
  const paidCount = useMemo(() => {
    return deacons.filter(d => subscriptions[d.id]?.paid).length;
  }, [deacons, subscriptions]);

  const unpaidCount = Math.max(0, deacons.length - paidCount);

  return (
    <div className="space-y-6 pb-20 animate-fade-in" dir="rtl">
      {/* 🌟 CHORUS HEADER & IDENTIFIER BAR */}
      <div 
        className="rounded-3xl p-6 text-white shadow-xl relative overflow-hidden transition-all"
        style={{ 
          background: `linear-gradient(135deg, ${currentChorus?.color || '#4F46E5'} 0%, #1E1B4B 100%)` 
        }}
      >
        <div className="absolute top-0 left-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
              <ShieldCheck className="w-9 h-9 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-black bg-white/20 backdrop-blur-md border border-white/30">
                  لوحة أدمن الخورس المخصصة
                </span>
                <span className="text-xs text-white/80">كود: {currentChorus?.code}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black mt-1 tracking-tight">
                {currentChorus?.name || 'جاري تحميل الخورس...'}
              </h1>
              <p className="text-xs md:text-sm text-white/80 mt-1 max-w-xl">
                {currentChorus?.description || 'مجموعة الخورس المستقلة - إدارة الشمامسة والخدام والقداسات والألحان والاشتراكات'}
              </p>
            </div>
          </div>

          {/* Chorus Switcher (for Admins or Multi-group Admins) */}
          <div className="flex flex-wrap items-center gap-3">
            {switchableChoruses.length > 1 && (
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-1.5 flex items-center gap-2">
                <Layers className="w-4 h-4 text-white/80 mr-2" />
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="bg-transparent text-white text-xs md:text-sm font-black focus:outline-none cursor-pointer pr-2"
                >
                  {switchableChoruses.map(c => (
                    <option key={c.id} value={c.id} className="text-slate-900 font-bold">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => setShowBroadcastModal(true)}
              className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-2xl text-xs md:text-sm flex items-center gap-2 shadow-md transition-all active:scale-95"
            >
              <Send className="w-4 h-4" />
              إعلان لخورس {currentChorus?.name}
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/15">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10">
            <span className="text-xs text-white/80 font-medium block">شمامسة الخورس</span>
            <span className="text-2xl font-black mt-0.5 block">{deacons.length}</span>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10">
            <span className="text-xs text-white/80 font-medium block">خدام الخورس</span>
            <span className="text-2xl font-black mt-0.5 block">{servants.length}</span>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10">
            <span className="text-xs text-white/80 font-medium block">سداد اشتراك الشهر</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-2xl font-black">{paidCount}</span>
              <span className="text-xs text-white/70">/ {deacons.length}</span>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10">
            <span className="text-xs text-white/80 font-medium block">حضور نشاط اليوم</span>
            <span className="text-2xl font-black mt-0.5 block text-emerald-300">{todayAttendanceCount}</span>
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-center justify-between shadow-sm animate-bounce-short">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span className="text-sm font-bold">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-700">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* 🧭 NAVIGATION TABS (Comprehensive & Powerful) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 scrollbar-none">
        <button
          onClick={() => setActiveTab('deacons')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs md:text-sm font-black whitespace-nowrap transition-all ${
            activeTab === 'deacons'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          شمامسة الخورس ({deacons.length})
        </button>

        <button
          onClick={() => setActiveTab('attendance')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs md:text-sm font-black whitespace-nowrap transition-all ${
            activeTab === 'attendance'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          التحضير السريع والقداسات
        </button>

        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs md:text-sm font-black whitespace-nowrap transition-all ${
            activeTab === 'subscriptions'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          اشتراكات الخورس (30 ج)
        </button>

        <button
          onClick={() => setActiveTab('servants')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs md:text-sm font-black whitespace-nowrap transition-all ${
            activeTab === 'servants'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          خدام الخورس والافتقاد ({servants.length})
        </button>

        <button
          onClick={() => setActiveTab('study')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs md:text-sm font-black whitespace-nowrap transition-all ${
            activeTab === 'study'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          المناهج والألحان ({studyMaterials.length})
        </button>

        <button
          onClick={() => setActiveTab('quizzes')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs md:text-sm font-black whitespace-nowrap transition-all ${
            activeTab === 'quizzes'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Award className="w-4 h-4" />
          الامتحانات والمسابقات ({quizzes.length})
        </button>

        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs md:text-sm font-black whitespace-nowrap transition-all ${
            activeTab === 'leaderboard'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Trophy className="w-4 h-4" />
          أوائل الخورس
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. DEACONS TAB (Manage Chorus Deacons) */}
      {/* ========================================================================= */}
      {activeTab === 'deacons' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`بحث في شمامسة ${currentChorus?.name} بالاسم أو التليفون...`}
                className="w-full pr-10 pl-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs md:text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <button
              onClick={() => setShowAddDeaconModal(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl text-xs md:text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              إضافة شماس جديد لـ {currentChorus?.name}
            </button>
          </div>

          {/* Deacons Table / Grid */}
          {loading ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-500">جاري تحميل شمامسة الخورس...</p>
            </div>
          ) : filteredDeacons.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-slate-300">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="font-extrabold text-slate-700 text-base">لا يوجد شمامسة مسجلين في هذا الخورس حالياً</h3>
              <p className="text-xs text-slate-400 mt-1">اضغط على زر "إضافة شماس جديد" للبدء في تسجيل شمامسة {currentChorus?.name}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDeacons.map((deacon) => {
                const totalPts = totalPointsMap[deacon.id] || 0;
                const monthPts = monthPointsMap[deacon.id] || 0;
                const subPaid = subscriptions[deacon.id]?.paid ?? false;

                return (
                  <div 
                    key={deacon.id} 
                    className="bg-white rounded-3xl p-5 border border-slate-200 hover:border-indigo-300 shadow-sm transition-all space-y-3 relative group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center font-black text-indigo-600 text-lg">
                          {deacon.fullName.charAt(0) || 'ش'}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-sm">{deacon.fullName}</h4>
                          <span className="text-[11px] font-bold text-slate-400 block">@{deacon.username}</span>
                          {deacon.grade && (
                            <span className="inline-block mt-0.5 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold">
                              {deacon.grade}
                            </span>
                          )}
                        </div>
                      </div>

                      <span className={`px-2 py-1 rounded-xl text-[10px] font-extrabold border ${
                        subPaid 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {subPaid ? 'مسدد الاشتراك' : 'اشتراك غير مسدد'}
                      </span>
                    </div>

                    {/* Points Pills */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-center">
                      <div className="bg-indigo-50/60 p-2 rounded-xl">
                        <span className="text-[10px] text-indigo-600 font-bold block">نقاط الشهر</span>
                        <span className="text-sm font-black text-indigo-900">{monthPts}</span>
                      </div>
                      <div className="bg-amber-50/60 p-2 rounded-xl">
                        <span className="text-[10px] text-amber-600 font-bold block">النقاط الكلية</span>
                        <span className="text-sm font-black text-amber-900">{totalPts}</span>
                      </div>
                    </div>

                    {/* Phone & Contact Shortcuts */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      {deacon.ownPhone ? (
                        <a
                          href={`tel:${deacon.ownPhone}`}
                          className="flex-1 py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5 text-indigo-600" />
                          <span>الشماس</span>
                        </a>
                      ) : (
                        <span className="flex-1 text-[11px] text-slate-300 text-center py-1.5">لا يوجد هاتف</span>
                      )}

                      {deacon.parentPhone ? (
                        <a
                          href={`tel:${deacon.parentPhone}`}
                          className="flex-1 py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5 text-emerald-600" />
                          <span>ولي الأمر</span>
                        </a>
                      ) : (
                        <span className="flex-1 text-[11px] text-slate-300 text-center py-1.5">لا يوجد هاتف ولي أمر</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. ATTENDANCE TAB (Chorus Liturgies & Activities) */}
      {/* ========================================================================= */}
      {activeTab === 'attendance' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">تسجيل حضور شمامسة {currentChorus?.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5">تحضير فوري بنقرة زر مع إيداع نقاط القداسات والتسبحة والأنشطة</p>
            </div>

            {/* Select Activity */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-600 whitespace-nowrap">النشاط / القداس:</label>
              <select
                value={selectedActivityId}
                onChange={(e) => setSelectedActivityId(e.target.value)}
                className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm font-black text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {activities.map(act => (
                  <option key={act.id} value={act.id}>
                    {act.name} (+{act.defaultPoints} نقطة)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Attendance Check List */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-600">
                قائمة حضور {currentChorus?.name} (اليوم: {todayDateStr})
              </span>
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                حضر اليوم: {todayAttendanceCount} من {deacons.length}
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {deacons.map(deacon => {
                const isAttended = !!attendanceMap[deacon.id];
                const isLoading = actionLoadingId === deacon.id;

                return (
                  <div key={deacon.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                        isAttended ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {deacon.fullName.charAt(0)}
                      </div>
                      <div>
                        <h5 className="font-extrabold text-slate-900 text-sm">{deacon.fullName}</h5>
                        <span className="text-[11px] text-slate-400">@{deacon.username}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleAttendance(deacon)}
                      disabled={isLoading}
                      className={`px-5 py-2.5 rounded-2xl text-xs font-black flex items-center gap-2 transition-all active:scale-95 ${
                        isAttended
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isAttended ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          حاضر (انقر للإلغاء)
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          تسجيل حضور
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SUBSCRIPTIONS TAB (30 EGP per month) */}
      {/* ========================================================================= */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">اشتراكات {currentChorus?.name} - شهر {currentMonthKey}</h3>
              <p className="text-xs text-slate-500 mt-0.5">قيمة الاشتراك: 30 جنيهاً مصرياً مع منح (+{subscriptionPoints} نقطة مكافأة سداد)</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-2 rounded-2xl text-xs font-black">
                المسددين: {paidCount} ({paidCount * 30} ج)
              </div>
              <div className="bg-rose-50 text-rose-800 border border-rose-200 px-4 py-2 rounded-2xl text-xs font-black">
                المتبقي: {unpaidCount}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-100">
              {deacons.map(deacon => {
                const sub = subscriptions[deacon.id];
                const isPaid = sub?.paid ?? false;
                const isLoading = actionLoadingId === `sub_${deacon.id}`;

                return (
                  <div key={deacon.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                        isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <h5 className="font-extrabold text-slate-900 text-sm">{deacon.fullName}</h5>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-slate-400">@{deacon.username}</span>
                          {sub?.paidAt && (
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                              تم السداد: {new Date(sub.paidAt).toLocaleDateString('ar-EG')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleSubscription(deacon)}
                      disabled={isLoading}
                      className={`px-5 py-2.5 rounded-2xl text-xs font-black flex items-center gap-2 transition-all active:scale-95 ${
                        isPaid
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                          : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isPaid ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          تم السداد (30 ج)
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          تسجيل دفع 30 ج
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SERVANTS & PASTORAL CARE TAB */}
      {/* ========================================================================= */}
      {activeTab === 'servants' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">خدام ومسؤولو {currentChorus?.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5">متابعة تكليفات الخدام، الافتقادات، والزيارات المنزلية لشمامسة الخورس</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {servants.map(servant => (
              <div key={servant.id} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center font-black text-violet-700 text-base">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">{servant.fullName}</h4>
                    <span className="text-[11px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-md inline-block mt-0.5">
                      {servant.role === 'chorus_admin' ? 'أدمن الخورس' : 'خادم بالخورس'}
                    </span>
                  </div>
                </div>

                {servant.ownPhone && (
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-400">التليفون:</span>
                    <a href={`tel:${servant.ownPhone}`} className="font-bold text-indigo-600 dir-ltr">
                      {servant.ownPhone}
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Afetqad / Pastoral Follow-up Log for this chorus */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm mt-6">
            <h4 className="font-extrabold text-slate-900 text-sm mb-3">سجل الافتقاد ومتابعة الغائبين بالخورس</h4>
            {afetqadLogs.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">لا توجد زيارات أو افتقادات مسجلة حديثاً</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {afetqadLogs.slice(0, 10).map((log, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800">{log.deaconName || 'شماس'}</span>
                      <span className="text-slate-400 mr-2">بواسطة: {log.servantName || 'خادم'}</span>
                    </div>
                    <span className="text-slate-400">{log.date?.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. STUDY & HYMNS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'study' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">مناهج وألحان وطقوس {currentChorus?.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5">تسجيلات صوتية، نوتات الهزات، ملفات PDF وشروحات مخصصة للخورس</p>
            </div>
            <a
              href="#/study"
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl text-xs md:text-sm flex items-center gap-2 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              إضافة لحن أو درس جديد
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {studyMaterials.map(mat => (
              <div key={mat.id} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {mat.subject === 'hymns' ? 'لحن كنسي' : mat.subject === 'rituals' ? 'طقس' : 'مادة تعليمية'}
                  </span>
                  <span className="text-[10px] text-slate-400">{mat.createdAt?.slice(0, 10)}</span>
                </div>
                <h4 className="font-extrabold text-slate-900 text-base">{mat.title}</h4>
                {mat.description && <p className="text-xs text-slate-500 line-clamp-2">{mat.description}</p>}
                
                {mat.audioUrl && (
                  <audio controls src={mat.audioUrl} className="w-full h-8 mt-2" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. QUIZZES & EXAMS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'quizzes' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">امتحانات ومسابقات {currentChorus?.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5">اختبارات تفاعلية مجدولة مع تصحيح فوري وإيداع نقاط</p>
            </div>
            <a
              href="#/quizzes/create"
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-2xl text-xs md:text-sm flex items-center gap-2 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              إنشاء امتحان جديد للخورس
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quizzes.map(quiz => (
              <div key={quiz.id} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                    +{quiz.pointsReward} نقطة
                  </span>
                  <span className="text-[10px] text-slate-400">{quiz.questions.length} أسئلة</span>
                </div>
                <h4 className="font-extrabold text-slate-900 text-base">{quiz.title}</h4>
                {quiz.description && <p className="text-xs text-slate-500 line-clamp-2">{quiz.description}</p>}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <a
                    href={`#/quizzes/${quiz.id}/results`}
                    className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    عرض نتائج الشمامسة
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. LEADERBOARD TAB (Honor Roll for this Chorus) */}
      {/* ========================================================================= */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm">
            <h3 className="font-extrabold text-slate-900 text-base">لوحة شرف وأوائل {currentChorus?.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">ترتيب شمامسة الخورس حسب الالتزام والحضور والنقاط لشهر {currentMonthKey}</p>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-100">
              {rankedDeacons.map((deacon, index) => {
                const rank = index + 1;
                return (
                  <div key={deacon.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-black text-sm ${
                        rank === 1 ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-200' :
                        rank === 2 ? 'bg-slate-200 text-slate-800' :
                        rank === 3 ? 'bg-amber-700 text-white' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {rank}
                      </div>

                      <div>
                        <h5 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                          {deacon.fullName}
                          {rank === 1 && <Crown className="w-4 h-4 text-amber-500 inline" />}
                        </h5>
                        <span className="text-[11px] text-slate-400">@{deacon.username}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-left">
                      <div className="text-right">
                        <span className="text-xs font-black text-indigo-600 block">{deacon.monthPoints} نقطة</span>
                        <span className="text-[10px] text-slate-400 block">الإجمالي: {deacon.totalPoints}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Add New Deacon to this Chorus */}
      {/* ========================================================================= */}
      {showAddDeaconModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-up" dir="rtl">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-indigo-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">إضافة شماس جديد لـ {currentChorus?.name}</h3>
                  <p className="text-xs text-slate-500">سيتم تعيين الشماس تلقائياً لهذا الخورس</p>
                </div>
              </div>
              <button onClick={() => setShowAddDeaconModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleCreateDeacon} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">الاسم الرباعي للشماس *</label>
                <input
                  type="text"
                  required
                  value={newDeaconData.fullName}
                  onChange={(e) => setNewDeaconData(prev => ({ ...prev, fullName: e.target.value }))}
                  placeholder="مثال: بيشوي مرقس يوسف"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">اسم المستخدم (بالإنجليزي) *</label>
                  <input
                    type="text"
                    required
                    value={newDeaconData.username}
                    onChange={(e) => setNewDeaconData(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="bishoy123"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none dir-ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">كلمة المرور المؤقتة *</label>
                  <input
                    type="text"
                    required
                    value={newDeaconData.password}
                    onChange={(e) => setNewDeaconData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="123456"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none dir-ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">رقم هاتف الشماس</label>
                  <input
                    type="tel"
                    value={newDeaconData.ownPhone}
                    onChange={(e) => setNewDeaconData(prev => ({ ...prev, ownPhone: e.target.value }))}
                    placeholder="010..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none dir-ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">رقم هاتف ولي الأمر</label>
                  <input
                    type="tel"
                    value={newDeaconData.parentPhone}
                    onChange={(e) => setNewDeaconData(prev => ({ ...prev, parentPhone: e.target.value }))}
                    placeholder="012..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none dir-ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">المرحلة الدراسية / العمل</label>
                  <input
                    type="text"
                    value={newDeaconData.grade}
                    onChange={(e) => setNewDeaconData(prev => ({ ...prev, grade: e.target.value }))}
                    placeholder="مثال: تانية إعدادي / كلية هندسة"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">الخادم المتابع للشماس</label>
                  <select
                    value={newDeaconData.assignedAssistantId}
                    onChange={(e) => setNewDeaconData(prev => ({ ...prev, assignedAssistantId: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">بدون تخصيص</option>
                    {servants.map(s => (
                      <option key={s.id} value={s.id}>{s.fullName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddDeaconModal(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-2xl text-xs md:text-sm transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={creatingDeacon}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl text-xs md:text-sm flex items-center gap-2 shadow-md transition-all active:scale-95"
                >
                  {creatingDeacon && <Loader2 className="w-4 h-4 animate-spin" />}
                  حفظ وتأكيد الإضافة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Send Broadcast to Chorus */}
      {/* ========================================================================= */}
      {showBroadcastModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-up" dir="rtl">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-amber-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">إرسال إعلان لـ {currentChorus?.name}</h3>
                  <p className="text-xs text-slate-500">سيصل لجميع شمامسة وأولياء أمور هذا الخورس حصرياً</p>
                </div>
              </div>
              <button onClick={() => setShowBroadcastModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSendBroadcast} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">عنوان الإشعار *</label>
                <input
                  type="text"
                  required
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder="مثال: موعد تدريب ألحان البصخة القادم"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">نص الرسالة أو التنبيه *</label>
                <textarea
                  required
                  rows={4}
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="اكتب تفاصيل الإعلان والتنبيهات الموجهة لشمامسة الخورس..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-2xl text-xs md:text-sm transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={sendingBroadcast}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-2xl text-xs md:text-sm flex items-center gap-2 shadow-md transition-all active:scale-95"
                >
                  {sendingBroadcast && <Loader2 className="w-4 h-4 animate-spin" />}
                  إرسال الإشعار الآن
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
