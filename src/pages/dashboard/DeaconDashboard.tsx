import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Star, History, PlusCircle, Trophy, User, X, Loader2, Phone, 
  CheckCircle, CreditCard, Cake, Sparkles, Flame, Shield, Award, 
  ChevronRight, Calendar, ArrowUpRight, CheckCircle2, AlertCircle, HeartHandshake,
  Clock
} from 'lucide-react';
import clsx from 'clsx';
import { SubscriptionRecord, UserLevel } from '../../types';
import { calculateDeaconLevel, DEFAULT_LEVELS } from '../../utils/levels';
import { subscribeSystemSettings } from '../../utils/systemSettings';
import { getLiturgicalWeekKey, getLiturgicalWeekRange } from '../../utils/afetqadHelper';

const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export const DeaconDashboard = () => {
  const { userData } = useAuth();
  const [pointsLog, setPointsLog] = useState<any[]>([]);
  const [team, setTeam] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [afetqadTasks, setAfetqadTasks] = useState<any[]>([]);
  const [afteqadCallPoints, setAfteqadCallPoints] = useState<number>(50);
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [levelsList, setLevelsList] = useState<UserLevel[]>(DEFAULT_LEVELS);
  const [allDeaconMonthScores, setAllDeaconMonthScores] = useState<{ id: string; points: number }[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Date and month key
  const now = new Date();
  const currentMonthNum = now.getMonth() + 1;
  const currentMonthName = MONTH_NAMES_AR[now.getMonth()];
  const currentYear = now.getFullYear();
  const currentMonthKey = `${currentYear}-${String(currentMonthNum).padStart(2, '0')}`;

  // Check if today is the Deacon's Birthday
  const isBirthdayToday = (() => {
    if (!userData?.birthDate) return false;
    const clean = userData.birthDate.trim();
    let bDay = 0;
    let bMonth = 0;

    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          bMonth = parseInt(parts[1], 10);
          bDay = parseInt(parts[2], 10);
        } else {
          bDay = parseInt(parts[0], 10);
          bMonth = parseInt(parts[1], 10);
        }
      }
    } else if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        bDay = parseInt(parts[0], 10);
        bMonth = parseInt(parts[1], 10);
      }
    }

    return bDay === now.getDate() && bMonth === currentMonthNum;
  })();

  useEffect(() => {
    if (!userData?.id) return;

    // Fetch Points Log
    const qPoints = query(collection(db, 'points_log'), where('deaconId', '==', userData.id));
    const unsubPoints = onSnapshot(qPoints, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPointsLog(data);
    });

    // Fetch Subscription Status for Current Month
    const subDocId = `${userData.id}_${currentMonthKey}`;
    const unsubSub = onSnapshot(doc(db, 'subscriptions', subDocId), (docSnap) => {
      if (docSnap.exists()) {
        setSubscription(docSnap.data() as SubscriptionRecord);
      } else {
        setSubscription(null);
      }
    });

    // Fetch Team Info
    if (userData.teamId) {
      getDoc(doc(db, 'teams', userData.teamId)).then((docSnap) => {
        if (docSnap.exists()) setTeam({ id: docSnap.id, ...docSnap.data() });
      });
    }

    // Fetch Active Activities that require approval
    const qActivities = query(collection(db, 'activity_types'), where('active', '==', true), where('requiresApproval', '==', true));
    const unsubActivities = onSnapshot(qActivities, (snapshot) => {
      setActivities(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch Afetqad Assignments for the liturgical week (Friday-to-Friday)
    const currentWeekKey = getLiturgicalWeekKey();

    // Fetch Configured User Levels
    const unsubLevels = onSnapshot(collection(db, 'levels'), (snap) => {
      if (!snap.empty) {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserLevel));
        list.sort((a, b) => a.levelNumber - b.levelNumber);
        setLevelsList(list);
      }
    });

    const qAfetqad = query(
      collection(db, 'afetqad_assignments'), 
      where('callerId', '==', userData.id)
    );
    const unsubAfetqad = onSnapshot(qAfetqad, async (snapshot) => {
      let rawDocs = snapshot.docs;
      // Filter for current liturgical week, or fallback to the latest week available
      const currentWeekDocs = rawDocs.filter(d => d.data().weekKey === currentWeekKey);
      const docsToUse = currentWeekDocs.length > 0 ? currentWeekDocs : rawDocs;

      // Sort by priority and creation
      const tasks = await Promise.all(docsToUse.map(async d => {
        const docData = d.data();
        const targetSnap = await getDoc(doc(db, 'users', docData.targetId));
        return {
          id: d.id,
          ...docData,
          targetName: targetSnap.exists() ? targetSnap.data().fullName : 'مجهول',
          targetPhone: targetSnap.exists() ? targetSnap.data().ownPhone || targetSnap.data().parentPhone : ''
        };
      }));
      setAfetqadTasks(tasks);
    });

    // Fetch Month Points for all deacons to determine Top 3 Standing
    const qAllPoints = query(collection(db, 'points_log'), where('monthKey', '==', currentMonthKey));
    const unsubAllPoints = onSnapshot(qAllPoints, (snap) => {
      const deaconTotals: Record<string, number> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.deaconId) {
          deaconTotals[data.deaconId] = (deaconTotals[data.deaconId] || 0) + (data.points || 0);
        }
      });
      const list = Object.entries(deaconTotals).map(([id, points]) => ({ id, points }));
      list.sort((a, b) => b.points - a.points);
      setAllDeaconMonthScores(list);
    });

    const unsubSettings = subscribeSystemSettings((cfg) => {
      setAfteqadCallPoints(cfg.afteqadCallPoints ?? 50);
    });

    return () => {
      unsubPoints();
      unsubSub();
      unsubActivities();
      unsubAfetqad();
      unsubLevels();
      unsubAllPoints();
      unsubSettings();
    };
  }, [userData, currentMonthKey]);

  const currentMonthPoints = pointsLog
    .filter(log => log.monthKey === currentMonthKey)
    .reduce((acc, curr) => acc + (curr.points || 0), 0);

  const totalAllTimePoints = pointsLog
    .reduce((acc, curr) => acc + (curr.points || 0), 0);

  // Compute Dense Rank in Month (الخيار ب) and Top 3 status with duplicate handling
  const distinctMonthScores = useMemo<number[]>(() => {
    const numbersList = allDeaconMonthScores.map(s => Number(s.points) || 0);
    const uniqueNumbers = Array.from(new Set<number>(numbersList)).filter((p: number) => p > 0);
    return uniqueNumbers.sort((a: number, b: number) => b - a);
  }, [allDeaconMonthScores]);

  const scoreCountsMap = useMemo(() => {
    const counts: Record<number, number> = {};
    allDeaconMonthScores.forEach(s => {
      const p = Number(s.points) || 0;
      counts[p] = (counts[p] || 0) + 1;
    });
    return counts;
  }, [allDeaconMonthScores]);

  const userRankPosition = currentMonthPoints > 0 
    ? (distinctMonthScores.indexOf(currentMonthPoints) + 1)
    : (distinctMonthScores.length + 1);

  const isUserDuplicate = currentMonthPoints > 0 && (scoreCountsMap[currentMonthPoints] || 0) > 1;
  const isTopThree = userRankPosition <= 3 && currentMonthPoints > 0;
  
  // 3rd place score (the 3rd distinct highest score, or the lowest active score if less than 3)
  const thirdPlaceScore = distinctMonthScores.length >= 3 
    ? distinctMonthScores[2] 
    : (distinctMonthScores[distinctMonthScores.length - 1] || 0);

  const pointsToTopThree = Math.max(1, (thirdPlaceScore - currentMonthPoints) + 1);

  // Dynamic Level & Rank calculations for Gamification
  const currentRank = calculateDeaconLevel(totalAllTimePoints, levelsList);
  const progressPercent = Math.min(100, Math.round((totalAllTimePoints / currentRank.nextLevelPoints) * 100));

  const handleRequestRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedActivity || !userData?.id) return;
    setRequestLoading(true);
    try {
      const act = activities.find(a => a.id === selectedActivity);
      await addDoc(collection(db, 'registration_requests'), {
        deaconId: userData.id,
        activityTypeId: selectedActivity,
        activityName: act?.name || '',
        notes: requestNotes.trim(),
        date: new Date().toISOString(),
        status: 'pending'
      });
      setSuccessMsg('تم إرسال طلبك للخادم للموافقة عليه بنجاح ✨');
      setIsModalOpen(false);
      setSelectedActivity('');
      setRequestNotes('');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (error) {
      console.error(error);
    } finally {
      setRequestLoading(false);
    }
  };

  const markAfetqadDone = async (taskId: string) => {
    if (!window.confirm('هل قمت بالاتصال والاطمئنان على زميلك الشماس؟\n(ملاحظة: ستُضاف نقاط المكافأة تلقائياً عند حضوره في قداس الجمعة القادم)')) return;
    try {
      await updateDoc(doc(db, 'afetqad_assignments', taskId), {
        status: 'completed',
        completedAt: new Date().toISOString(),
        pointsAwarded: false
      });
      
      setSuccessMsg(`بارك الله فيك! تم تسجيل إتمام الافتقاد بنجاح ⏳ ستُضاف نقاط المكافأة (+${afteqadCallPoints} نقطة) تلقائياً عند حضور زميلك في قداس الجمعة القادم ✨`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء حفظ الافتقاد.');
    }
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-6">
      {/* 🎂 Birthday Celebration Notification Banner */}
      {isBirthdayToday && (
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 text-white p-5 rounded-3xl shadow-lg border-2 border-yellow-200 animate-in fade-in zoom-in-95 duration-300">
          <div className="absolute top-2 left-4 text-3xl opacity-30">🎈</div>
          <div className="absolute bottom-1 right-12 text-3xl opacity-30">🎂</div>
          <div className="relative flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/40 shadow-inner">
              <Cake className="w-8 h-8 text-yellow-200 animate-bounce" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-white/20 backdrop-blur-md rounded-full text-[11px] font-black text-yellow-100 mb-1 border border-white/30">
                <Sparkles className="w-3.5 h-3.5" /> تهنئة خاصة بيوم ميلادك
              </span>
              <h3 className="font-extrabold text-base md:text-lg leading-relaxed">
                رسالة من كنيسة السيدة العذراء وماريوحنا الرسول خورس الشمامسة : كل سنة وانت طيب يا {userData?.fullName} نتمنى لك النجاح دائما 🎉🎂
              </h3>
            </div>
          </div>
        </div>
      )}

      {/* 🌟 HERO CARD: Large Avatar & Score & Level Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-950 via-blue-900 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl border border-indigo-800/40">
        {/* Background decorative circles */}
        <div className="absolute -right-16 -top-16 w-56 h-56 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-56 h-56 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row items-center gap-6 justify-between">
          {/* Avatar and Identity */}
          <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-right">
            <div className="relative">
              {userData?.photoUrl ? (
                <img 
                  src={userData.photoUrl} 
                  alt={userData.fullName} 
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-amber-400 shadow-xl ring-4 ring-blue-500/30" 
                />
              ) : (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-tr from-blue-700 to-indigo-500 flex items-center justify-center border-4 border-amber-400 shadow-xl ring-4 ring-blue-500/30 text-white font-black text-3xl">
                  {userData?.fullName?.charAt(0) || 'ش'}
                </div>
              )}
              <div className="absolute -bottom-2 -right-1 bg-amber-500 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded-full border-2 border-slate-900 shadow-md flex items-center gap-1">
                <Award className="w-3 h-3" /> Lv.{currentRank.levelNumber}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <span className="px-3 py-0.5 bg-blue-500/30 text-blue-200 border border-blue-400/30 rounded-full text-[11px] font-bold">
                  خورس الشمامسة
                </span>
                {userData?.grade && (
                  <span className="px-2.5 py-0.5 bg-white/10 text-slate-200 rounded-full text-[10px]">
                    {userData.grade}
                  </span>
                )}
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{userData?.fullName}</h2>
              <p className={`text-xs font-bold mt-1 ${currentRank.textColor}`}>{currentRank.title}</p>
            </div>
          </div>

          {/* Huge Dynamic Points Counter */}
          <div className="flex flex-col items-center bg-white/10 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/15 shadow-inner w-full md:w-auto">
            <span className="text-[11px] font-bold text-blue-200 flex items-center gap-1 mb-1">
              <Flame className="w-4 h-4 text-amber-400 fill-amber-400" /> نقاطك هذا الشهر ({currentMonthName})
            </span>
            <div className="flex items-baseline gap-1.5 text-amber-400">
              <Star className="w-6 h-6 fill-amber-400" />
              <span className="text-4xl md:text-5xl font-black tracking-tight">{currentMonthPoints}</span>
              <span className="text-xs text-white/80 font-bold">نقطة</span>
            </div>
            <span className="text-[10px] text-slate-300 mt-1">
              الإجمالي الكلي: <strong className="text-white font-mono">{totalAllTimePoints}</strong> نقطة
            </span>
          </div>
        </div>

        {/* Level XP Progress Bar */}
        <div className="mt-6 pt-5 border-t border-white/10 space-y-2">
          <div className="flex justify-between text-xs font-bold text-slate-300">
            <span>التقدم نحو الرتبة التالية ({currentRank.nextLevelPoints} نقطة)</span>
            <span className="text-amber-300">{totalAllTimePoints} / {currentRank.nextLevelPoints} ({progressPercent}%)</span>
          </div>
          <div className="w-full bg-slate-800/80 rounded-full h-3.5 overflow-hidden p-0.5 border border-white/10">
            <div 
              className={`bg-gradient-to-r ${currentRank.bgGradient} h-full rounded-full transition-all duration-500 shadow-md`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* 🏆 TOP 3 DISTINCTION STATUS STATEMENT BANNER */}
      {isTopThree ? (
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 p-5 rounded-3xl text-slate-950 shadow-lg border-2 border-yellow-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-950/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-slate-950/15">
              <Trophy className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-slate-950 text-amber-300 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                  المركز #{userRankPosition} {isUserDuplicate ? '(مكرر)' : ''} على مستوى الخورس
                </span>
                <span className="text-xs font-extrabold text-slate-900">شهر {currentMonthName}</span>
              </div>
              <h3 className="text-base sm:text-lg font-black mt-1 text-slate-950 leading-snug">
                🎉 رائع جداً يا {userData?.fullName}! أنت حالياً بالمركز #{userRankPosition} {isUserDuplicate ? '(مكرر)' : ''} ومن الثلاثة الأوائل في الخورس هذا الشهر! حافظ على تميزك وصدارتك! 🌟
              </h3>
            </div>
          </div>
          <div className="shrink-0 bg-slate-950 text-amber-400 px-4 py-2 rounded-2xl font-mono font-black text-sm text-center shadow-md">
            {currentMonthPoints} نقطة
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-3xl border border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center shrink-0 text-indigo-300">
              <Flame className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400">موقعك في لوحة شرف شهر {currentMonthName}:</p>
              <h4 className="text-sm font-extrabold text-slate-200 mt-0.5">
                أنت حالياً بالمركز <strong className="text-indigo-400 font-mono">#{userRankPosition} {isUserDuplicate ? '(مكرر)' : ''}</strong> (لست من الثلاثة الأوائل بعد). باقي لك <strong className="text-amber-400 font-mono">{pointsToTopThree}</strong> نقطة لدخول الثلاثة الأوائل! 💪
              </h4>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-[11px] text-slate-400">المركز الثالث يمتلك: <strong className="text-amber-400 font-mono">{thirdPlaceScore}</strong> نقطة</span>
          </div>
        </div>
      )}

      {/* 💳 MONTHLY SUBSCRIPTION STATUS CARD (Color Coded 30 EGP) */}
      <div className={clsx(
        "p-5 rounded-3xl border transition-all shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4",
        subscription?.paid 
          ? "bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-teal-500/10 border-emerald-300 text-emerald-950" 
          : "bg-gradient-to-r from-amber-500/10 via-rose-500/5 to-orange-500/10 border-amber-300 text-amber-950"
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
              <span className="text-xs font-bold text-slate-500">الاشتراك الشهري ({currentMonthName} {currentYear})</span>
              <span className="text-xs font-black bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md">30 جنيه</span>
            </div>
            {subscription?.paid ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h4 className="font-extrabold text-emerald-800 text-sm">تم سداد الاشتراك بنجاح ✅</h4>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-0.5">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <h4 className="font-extrabold text-amber-900 text-sm">في انتظار السداد (30 جنيه)</h4>
              </div>
            )}
          </div>
        </div>

        <div className="text-xs font-medium text-slate-600 bg-white/70 backdrop-blur-xs px-4 py-2.5 rounded-2xl border border-slate-200/60">
          {subscription?.paid ? (
            <div>
              <p className="text-emerald-700 font-bold">تاريخ الدفع: {subscription.paidAt ? new Date(subscription.paidAt).toLocaleDateString('ar-EG') : 'مسجل'}</p>
              <p className="text-[10px] text-slate-500">المستلم: {subscription.recordedByName || 'المسؤول'}</p>
            </div>
          ) : (
            <p className="text-amber-800 font-medium">يرجى تسليم الـ 30 جنيه للخادم المسؤول عنك</p>
          )}
        </div>
      </div>

      {/* Notifications and Alerts */}
      {successMsg && (
        <div className="bg-emerald-50 text-emerald-800 p-4 rounded-2xl border border-emerald-200 text-xs font-bold text-center flex items-center justify-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 🛡️ TEAM SHIELD & LEAGUE BANNER */}
      {team && (
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-blue-900 p-5 md:p-6 rounded-3xl shadow-md text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-purple-800/40">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-purple-500/30 backdrop-blur-md flex items-center justify-center border border-purple-400/30">
              <Trophy className="w-7 h-7 text-yellow-300" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-purple-200 uppercase tracking-wide">فريقك في الخورس</span>
              <h3 className="text-xl font-black">{team.name}</h3>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/15 text-center sm:text-right">
            <span className="text-[10px] text-purple-200 block font-bold">مجموع نقاط الفريق</span>
            <span className="text-2xl font-black text-yellow-300">{team.teamMonthlyPoints || 0} <span className="text-xs font-normal text-white">نقطة</span></span>
          </div>
        </div>
      )}

      {/* 🚀 QUICK ACTIONS: Registration & Afetqad & Study & Quizzes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Study Materials Card */}
        <a 
          href="#/study"
          className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white p-5 rounded-3xl shadow-sm flex items-center justify-between transition-all group text-right hover:shadow-md hover:scale-[1.01]"
        >
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center border border-white/30 shadow-inner">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-base">مناهج الألحان والطقس والقبطي</h3>
              <p className="text-xs text-emerald-100 mt-0.5">تسجيلات صوتية مسموعة، هزات الألحان، ونوتات PDF</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/70 group-hover:text-white transition-colors" />
        </a>

        {/* Quizzes & Exams Card */}
        <a 
          href="#/quizzes"
          className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-5 rounded-3xl shadow-sm flex items-center justify-between transition-all group text-right hover:shadow-md hover:scale-[1.01]"
        >
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center border border-white/30 shadow-inner">
              <Award className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-base">منصة الاختبارات والمسابقات</h3>
              <p className="text-xs text-purple-100 mt-0.5">امتحانات تفاعلية مجدولة، مؤقت، واكتساب نقاط فورية</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/70 group-hover:text-white transition-colors" />
        </a>

        {/* Request Activity / Liturgy attendance */}
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-white hover:bg-blue-50/40 border border-slate-100 p-5 rounded-3xl shadow-sm flex items-center justify-between transition-all group text-right hover:border-blue-300"
        >
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white flex items-center justify-center group-hover:scale-105 transition-transform shadow-md shadow-blue-500/20">
              <PlusCircle className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-base">تسجيل نشاط أو قداس</h3>
              <p className="text-xs text-slate-500 mt-0.5">حضور قداس، سر الاعتراف، أو حفظ ألحان</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
        </button>

        {/* Fellowship & Brotherhood (Afetqad Tasks) */}
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <HeartHandshake className="w-5 h-5 text-orange-500" />
              <div>
                <h3 className="font-extrabold text-slate-800 text-sm">افتقاد واطمئنان أسبوعي</h3>
                <span className="text-[10px] text-slate-400 font-medium">الجمعة إلى الجمعة</span>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-1 bg-amber-50 text-amber-800 rounded-xl border border-amber-200">
              +{afteqadCallPoints} نقطة عند حضور القداس
            </span>
          </div>

          <div className="space-y-2">
            {afetqadTasks.map(task => (
              <div key={task.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-slate-800">{task.targetName}</p>
                    {task.priority && (
                      <span className="px-1.5 py-0.2 bg-rose-100 text-rose-700 rounded text-[9px] font-extrabold">
                        غائب
                      </span>
                    )}
                  </div>
                  {task.targetPhone && (
                    <a href={`tel:${task.targetPhone}`} className="text-blue-600 font-mono text-[11px] block mt-0.5">
                      📞 {task.targetPhone}
                    </a>
                  )}
                </div>
                {task.status === 'completed' ? (
                  task.pointsAwarded ? (
                    <span className="text-emerald-700 font-bold text-[10px] bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> حضر القداس (+{task.awardedPoints || afteqadCallPoints} نقطة)
                    </span>
                  ) : (
                    <span className="text-amber-800 font-bold text-[10px] bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-600" /> تم الافتقاد • بانتظار حضور القداس
                    </span>
                  )
                ) : (
                  <button 
                    onClick={() => markAfetqadDone(task.id)}
                    className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold rounded-xl text-[11px] shadow-xs transition-all"
                  >
                    تأكيد الاتصال والاطمئنان
                  </button>
                )}
              </div>
            ))}
            {afetqadTasks.length === 0 && (
              <p className="text-center text-slate-400 text-xs py-2">لا توجد مهام افتقاد مخصصة لك هذا الأسبوع.</p>
            )}
          </div>
        </div>
      </div>

      {/* 📜 POINTS & ACTIVITY HISTORY (Timeline) */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-400" />
            <h3 className="font-extrabold text-slate-800 text-base">سجل نشاطك ومكافآتك</h3>
          </div>
          <span className="text-xs font-bold text-slate-400 font-mono">
            {pointsLog.length} نشاط مسجل
          </span>
        </div>

        <div className="space-y-3">
          {pointsLog.slice(0, 10).map((log, idx) => (
            <div key={log.id || idx} className="flex items-center justify-between p-4 bg-slate-50/80 hover:bg-slate-50 rounded-2xl border border-slate-100 transition-colors">
              <div className="flex items-center gap-3">
                <div className={clsx(
                  "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                  log.points > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                )}>
                  {log.points > 0 ? <Star className="w-5 h-5 fill-emerald-600 text-emerald-600" /> : '⚠️'}
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">{log.reason}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {new Date(log.date).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>

              <div className={clsx(
                "font-black text-base px-3.5 py-1.5 rounded-xl font-mono",
                log.points > 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
              )}>
                {log.points > 0 ? '+' : ''}{log.points}
              </div>
            </div>
          ))}

          {pointsLog.length === 0 && (
            <p className="text-center text-slate-400 text-xs py-6">
              لم تسجل أي نقاط بعد. شارك في القداسات والألحان لتجمع نقاطك الأولى!
            </p>
          )}
        </div>
      </div>

      {/* Registration Request Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-slate-100">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50/50">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-800">طلب تسجيل نشاط جديد</h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="w-8 h-8 rounded-full bg-white text-slate-400 hover:text-slate-600 flex items-center justify-center font-bold shadow-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRequestRegistration} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">اختر نوع النشاط أو القداس:</label>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {activities.map(act => (
                    <label 
                      key={act.id} 
                      className={clsx(
                        "flex items-center justify-between p-3.5 rounded-2xl border-2 cursor-pointer transition-all",
                        selectedActivity === act.id 
                          ? "border-blue-500 bg-blue-50/60 shadow-xs" 
                          : "border-slate-100 hover:border-blue-200 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <input 
                          type="radio" 
                          name="activity" 
                          value={act.id} 
                          checked={selectedActivity === act.id} 
                          onChange={(e) => setSelectedActivity(e.target.value)}
                          className="w-4 h-4 text-blue-600 accent-blue-600"
                        />
                        <span className="font-bold text-slate-800 text-xs">{act.name}</span>
                      </div>
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-lg">
                        +{act.defaultPoints} نقطة
                      </span>
                    </label>
                  ))}

                  {activities.length === 0 && (
                    <p className="text-center text-xs text-slate-400 py-4">لا توجد أنشطة متاحة للطلب حالياً.</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية (اختياري):</label>
                <input
                  type="text"
                  placeholder="مثال: قداس الأربعاء بكنيسة مارمرقس، اسم أب الاعتراف..."
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <button 
                type="submit" 
                disabled={!selectedActivity || requestLoading}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-md shadow-blue-600/20 text-xs"
              >
                {requestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إرسال الطلب للخادم'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
