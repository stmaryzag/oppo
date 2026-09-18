import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, MapPin, Trophy, Activity, ChevronLeft, Clock, Star, Medal, 
  Phone, Bell, CreditCard, Cake, Sparkles, Send, CheckCircle2,
  AlertCircle, Award, UserCheck, Search, Download, Crown, TrendingUp,
  ArrowUpDown, Eye, ExternalLink, ShieldCheck, Layers, BookOpen, HelpCircle
} from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { UserData, UserLevel } from '../../types';
import { calculateDeaconLevel, ComputedLevelInfo } from '../../utils/levels';

const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

interface RankedDeacon {
  deacon: UserData;
  totalPoints: number;
  monthPoints: number;
  activePoints: number;
  rank: number;
  isDuplicate: boolean;
  rankDisplay: string;
  levelInfo: ComputedLevelInfo;
  teamName: string;
}

export const AdminDashboard = () => {
  const { userData } = useAuth();
  const navigate = useNavigate();

  const [deacons, setDeacons] = useState<UserData[]>([]);
  const [todaysBirthdays, setTodaysBirthdays] = useState<UserData[]>([]);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<UserData[]>([]);
  const [congratsSent, setCongratsSent] = useState<Record<string, boolean>>({});
  const [congratsLoading, setCongratsLoading] = useState<string | null>(null);

  // Points tracking states
  const [totalPointsMap, setTotalPointsMap] = useState<Record<string, number>>({});
  const [monthPointsMap, setMonthPointsMap] = useState<Record<string, number>>({});
  const [levels, setLevels] = useState<UserLevel[]>([]);
  const [teamsMap, setTeamsMap] = useState<Record<string, string>>({});
  
  // Leaderboard filters
  const [rankingMode, setRankingMode] = useState<'month' | 'total'>('month');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('');
  const [tableRowsLimit, setTableRowsLimit] = useState<number>(20);

  // Subscriptions quick count for current month
  const now = new Date();
  const currentMonthNum = now.getMonth() + 1;
  const currentMonthNameAr = MONTH_NAMES_AR[now.getMonth()];
  const currentMonthKey = `${now.getFullYear()}-${String(currentMonthNum).padStart(2, '0')}`;
  const [paidSubsCount, setPaidSubsCount] = useState(0);

  useEffect(() => {
    // 1. Fetch all deacons
    const q = query(collection(db, 'users'), where('role', '==', 'deacon'));
    const unsub = onSnapshot(q, (snap) => {
      const allDeacons = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserData));
      setDeacons(allDeacons);

      // Calculate Birthdays
      const todayDay = now.getDate();
      const todayMonth = now.getMonth() + 1;

      const todayList: UserData[] = [];
      const upcomingList: UserData[] = [];

      allDeacons.forEach(deacon => {
        if (!deacon.birthDate) return;
        let bDay = 0;
        let bMonth = 0;
        const cleanDate = deacon.birthDate.trim();

        if (cleanDate.includes('-')) {
          const parts = cleanDate.split('-');
          if (parts.length === 3) {
            if (parts[0].length === 4) { // YYYY-MM-DD
              bMonth = parseInt(parts[1], 10);
              bDay = parseInt(parts[2], 10);
            } else { // DD-MM-YYYY
              bDay = parseInt(parts[0], 10);
              bMonth = parseInt(parts[1], 10);
            }
          }
        } else if (cleanDate.includes('/')) {
          const parts = cleanDate.split('/');
          if (parts.length === 3) {
            bDay = parseInt(parts[0], 10);
            bMonth = parseInt(parts[1], 10);
          }
        }

        if (bDay === todayDay && bMonth === todayMonth) {
          todayList.push(deacon);
        } else if (bMonth === todayMonth && bDay > todayDay && bDay <= todayDay + 7) {
          upcomingList.push(deacon);
        }
      });

      setTodaysBirthdays(todayList);
      setUpcomingBirthdays(upcomingList);
    });

    // 2. Fetch all points in real time to calculate live ranking
    const unsubPoints = onSnapshot(collection(db, 'points_log'), (snap) => {
      const totalPts: Record<string, number> = {};
      const monthPts: Record<string, number> = {};

      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (!data.deaconId) return;
        const pts = Number(data.points) || 0;
        totalPts[data.deaconId] = (totalPts[data.deaconId] || 0) + pts;
        if (data.monthKey === currentMonthKey) {
          monthPts[data.deaconId] = (monthPts[data.deaconId] || 0) + pts;
        }
      });

      setTotalPointsMap(totalPts);
      setMonthPointsMap(monthPts);
    });

    // 3. Fetch Levels
    const unsubLevels = onSnapshot(collection(db, 'levels'), (snap) => {
      const lvls = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserLevel));
      lvls.sort((a, b) => a.levelNumber - b.levelNumber);
      setLevels(lvls);
    });

    // 4. Fetch Teams
    const unsubTeams = onSnapshot(collection(db, 'teams'), (snap) => {
      const tmMap: Record<string, string> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        tmMap[d.id] = data.name || 'فريق';
      });
      setTeamsMap(tmMap);
    });

    // 5. Fetch subscription count
    const qSubs = query(collection(db, 'subscriptions'), where('monthKey', '==', currentMonthKey), where('paid', '==', true));
    const unsubSubs = onSnapshot(qSubs, (snap) => {
      setPaidSubsCount(snap.size);
    });

    return () => {
      unsub();
      unsubPoints();
      unsubLevels();
      unsubTeams();
      unsubSubs();
    };
  }, [currentMonthKey]);

  // Send Birthday Notification to Deacon
  const handleSendBirthdayGreeting = async (deacon: UserData) => {
    setCongratsLoading(deacon.id);
    try {
      const message = `رسالة من كنيسة السيدة العذراء وماريوحنا الرسول خورس الشمامسة : كل سنة وانت طيب يا ${deacon.fullName} نتمنى لك النجاح دائما 🎉🎂`;
      
      await addDoc(collection(db, 'notifications_inbox'), {
        userId: deacon.id,
        title: '🎂 تهنئة خاصة بعيد ميلادك المبارك',
        body: message,
        date: new Date().toISOString(),
        read: false,
        type: 'birthday',
        icon: 'Cake'
      });

      // Also add points reward for birthday!
      await addDoc(collection(db, 'points_log'), {
        deaconId: deacon.id,
        reason: 'هدية عيد الميلاد المبارك 🎂',
        points: 10,
        date: new Date().toISOString(),
        addedBy: userData?.id || 'admin',
        monthKey: currentMonthKey
      });

      setCongratsSent(prev => ({ ...prev, [deacon.id]: true }));
    } catch (e) {
      console.error(e);
    } finally {
      setCongratsLoading(null);
    }
  };

  // Calculate descending points rankings (Dense Ranking - الخيار ب مع تمييز المكرر)
  const rankedList: RankedDeacon[] = useMemo(() => {
    const list = deacons.map(d => {
      const tot = Number(totalPointsMap[d.id]) || 0;
      const mon = Number(monthPointsMap[d.id]) || 0;
      const active = rankingMode === 'month' ? mon : tot;
      const lvl = calculateDeaconLevel(tot, levels);
      const tm = d.teamId && teamsMap[d.teamId] ? teamsMap[d.teamId] : (d.grade || 'عام');
      return {
        deacon: d,
        totalPoints: tot,
        monthPoints: mon,
        activePoints: active,
        rank: 0,
        isDuplicate: false,
        rankDisplay: '',
        levelInfo: lvl,
        teamName: tm
      };
    });

    // 1. Sort descending by active points, then total points, then alphabetical name
    list.sort((a, b) => {
      if (b.activePoints !== a.activePoints) {
        return b.activePoints - a.activePoints;
      }
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      return (a.deacon.fullName || '').localeCompare(b.deacon.fullName || '', 'ar');
    });

    // 2. Count frequency of each active points score
    const scoreCounts: Record<number, number> = {};
    list.forEach(item => {
      scoreCounts[item.activePoints] = (scoreCounts[item.activePoints] || 0) + 1;
    });

    // 3. Dense Ranking calculation (1, 2, 3...) with duplicate detection
    let currentRank = 0;
    let lastScore: number | null = null;

    return list.map((item) => {
      if (lastScore === null || item.activePoints !== lastScore) {
        currentRank += 1;
        lastScore = item.activePoints;
      }

      const isDup = (scoreCounts[item.activePoints] || 0) > 1 && item.activePoints > 0;
      const rankDisplay = isDup ? `${currentRank} (مكرر)` : `${currentRank}`;

      return {
        ...item,
        rank: currentRank,
        isDuplicate: isDup,
        rankDisplay
      };
    });
  }, [deacons, totalPointsMap, monthPointsMap, rankingMode, levels, teamsMap]);

  // Filter list by search term and team
  const filteredRankedList = useMemo(() => {
    return rankedList.filter(item => {
      const matchesSearch = !searchTerm.trim() || 
        item.deacon.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.deacon.username?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesTeam = !selectedTeamFilter || item.deacon.teamId === selectedTeamFilter || item.teamName === selectedTeamFilter;

      return matchesSearch && matchesTeam;
    });
  }, [rankedList, searchTerm, selectedTeamFilter]);

  // Top 3 Ranks Podium (All deacons holding ranks 1, 2, 3)
  const topRank1 = useMemo(() => rankedList.filter(item => item.rank === 1 && item.activePoints > 0), [rankedList]);
  const topRank2 = useMemo(() => rankedList.filter(item => item.rank === 2 && item.activePoints > 0), [rankedList]);
  const topRank3 = useMemo(() => rankedList.filter(item => item.rank === 3 && item.activePoints > 0), [rankedList]);
  const hasTopPodium = topRank1.length > 0;

  // Overall points stats
  const pointsStats = useMemo(() => {
    const totalVals = Object.values(totalPointsMap) as number[];
    const monthVals = Object.values(monthPointsMap) as number[];
    const totalPointsSum = totalVals.reduce((a, b) => a + (Number(b) || 0), 0);
    const monthPointsSum = monthVals.reduce((a, b) => a + (Number(b) || 0), 0);
    const activeDeaconsWithPoints = monthVals.filter(p => (Number(p) || 0) > 0).length;
    const maxScore = rankedList.length > 0 ? (rankedList[0].activePoints || 0) : 0;
    const currentSum = rankingMode === 'month' ? monthPointsSum : totalPointsSum;
    const avgScore = deacons.length > 0 ? Math.round(currentSum / deacons.length) : 0;

    return {
      totalPointsSum,
      monthPointsSum,
      activeDeaconsWithPoints,
      maxScore,
      avgScore
    };
  }, [totalPointsMap, monthPointsMap, deacons, rankedList, rankingMode]);

  // Unique teams list for filter dropdown
  const uniqueTeams = useMemo(() => {
    const teamsSet = new Set<string>();
    deacons.forEach(d => {
      const tName = d.teamId && teamsMap[d.teamId] ? teamsMap[d.teamId] : d.grade;
      if (tName) teamsSet.add(tName);
    });
    return Array.from(teamsSet);
  }, [deacons, teamsMap]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['الترتيب', 'حالة الترتيب', 'الاسم الكامل', 'اسم المستخدم', 'الفريق / المرحلة', 'الرتبة والمستوى', `نقاط ${currentMonthNameAr} ${now.getFullYear()}`, 'إجمالي النقاط الكلي'];
    const rows = filteredRankedList.map(item => [
      item.rank,
      item.isDuplicate ? '"مكرر"' : '"عادي"',
      `"${item.deacon.fullName || ''}"`,
      `"${item.deacon.username || ''}"`,
      `"${item.teamName || ''}"`,
      `"${item.levelInfo.title}"`,
      item.monthPoints,
      item.totalPoints
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `كشف_ترتيب_نقاط_الشمامسة_${currentMonthKey}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sections = [
    {
      title: 'إدارة مجموعات الخوارس (الخورسات 9 - 14)',
      desc: 'فصل وتخصيص كل خورس بنظامه المنفصل ومسؤوليه وخدامه وأوائله',
      icon: Layers,
      color: 'bg-violet-600',
      badge: 'الخورسات المتعددة',
      path: '/admin/groups'
    },
    {
      title: 'مناهج الألحان والطقوس والملفات التعليمية',
      desc: 'إدارة الملفات الصوتية، الهزات، ملفات PDF، وتصنيف المواد حسب الخورس',
      icon: BookOpen,
      color: 'bg-emerald-600',
      badge: 'المكتبة التعليمية',
      path: '/study'
    },
    {
      title: 'منصة الاختبارات والمسابقات والتقييم',
      desc: 'إنشاء ومتابعة الامتحانات التفاعلية، التصحيح التلقائي، وإيداع النقاط',
      icon: HelpCircle,
      color: 'bg-purple-600',
      badge: 'الامتحانات التفاعلية',
      path: '/quizzes'
    },
    {
      title: 'تسجيل الحضور السريع والجماعي',
      desc: 'تحضير الشمامسة بنقرة واحدة وتوزيع نقاط القداسات والأنشطة',
      icon: UserCheck,
      color: 'bg-teal-600',
      badge: 'جديد وسريع',
      path: '/admin/attendance'
    },
    {
      title: 'التقارير والإحصائيات الشاملة',
      desc: 'تقارير مفصلة لكل نشاط أو لكل شماس مع المنحنيات البيانية',
      icon: Activity,
      color: 'bg-indigo-600',
      badge: 'جديد',
      path: '/admin/reports'
    },
    {
      title: 'الاشتراكات الشهرية (30 ج)',
      desc: 'متابعة وتسجيل دفع 30 جنيه شهرياً لكل شماس',
      icon: CreditCard,
      color: 'bg-emerald-600',
      badge: `${paidSubsCount} / ${deacons.length} مسدد`,
      path: '/admin/subscriptions'
    },
    {
      title: 'إدارة المستويات والرتب (User Levels)',
      desc: 'تحديد نقاط ومسميات الرتب والترقيات لجميع الشمامسة',
      icon: Award,
      color: 'bg-amber-600',
      path: '/admin/levels'
    },
    {
      title: 'إدارة الحسابات والشمامسة',
      desc: 'إضافة وتعديل الحسابات واستيراد Excel محلياً',
      icon: Users,
      color: 'bg-blue-500',
      badge: `${deacons.length} شماس`,
      path: '/admin/users'
    },
    {
      title: 'إدارة الأنشطة والقداسات',
      desc: 'تحديد الأنشطة ونقاط الحضور والاعتراف',
      icon: Activity,
      color: 'bg-teal-500',
      path: '/admin/activities'
    },
    {
      title: 'إضافة نقاط يدوياً',
      desc: 'تصحيح ومكافآت استثنائية ونقاط إضافية',
      icon: Star,
      color: 'bg-yellow-500',
      path: '/admin/points'
    },
    {
      title: 'مراجعة طلبات التسجيل',
      desc: 'الموافقة على طلبات الأنشطة والاعتراف',
      icon: Clock,
      color: 'bg-indigo-500',
      path: '/admin/requests'
    },
    {
      title: 'قاعة الشرف والأوائل',
      desc: 'أرشيف الفائزين وترتيب الشمامسة شهرياً',
      icon: Medal,
      color: 'bg-amber-500',
      path: '/admin/hall-of-fame'
    },
    {
      title: 'نظام الافتقاد الأسبوعي',
      desc: 'التوزيع الأسبوعي والزيارات الهاتفية والمنزلية',
      icon: Phone,
      color: 'bg-orange-500',
      path: '/admin/afetqad'
    },
    {
      title: 'إدارة الإشعارات والتنبيهات',
      desc: 'إرسال التنبيهات العامة والمجدولة',
      icon: Bell,
      color: 'bg-purple-500',
      path: '/admin/notifications'
    },
    {
      title: 'إدارة مناطق الافتقاد',
      desc: 'المناطق الجغرافية لتوزيع الشمامسة',
      icon: MapPin,
      color: 'bg-rose-500',
      path: '/admin/areas'
    },
    {
      title: 'إدارة الفرق والمجموعات',
      desc: 'المنافسة والتنافس الجماعي بين المجموعات',
      icon: Trophy,
      color: 'bg-cyan-600',
      path: '/admin/teams'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-3xl shadow-lg border border-blue-800/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="inline-block px-3 py-1 bg-blue-500/30 text-blue-200 text-xs font-bold rounded-full mb-2">
              لوحة التحكم الإدارية المركزية
            </span>
            <h2 className="text-2xl font-black">خورس شمامسة كنيسة العذراء وماريوحنا</h2>
            <p className="text-xs text-blue-200/80 mt-1">
              مرحباً {userData?.fullName || 'بك'} • يمكنك إدارة كل أقسام الخدمة والاشتراكات والمتابعة بسهولة
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/15 text-center">
              <span className="text-[10px] text-blue-200 block font-bold">إجمالي الشمامسة</span>
              <span className="text-xl font-black">{deacons.length}</span>
            </div>
            <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/15 text-center">
              <span className="text-[10px] text-emerald-200 block font-bold">اشتراك الشهر (30ج)</span>
              <span className="text-xl font-black text-emerald-300">{paidSubsCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Birthday Monitoring Hub (قسم متابعة وتذكير أعياد الميلاد) */}
      <div className="bg-gradient-to-br from-amber-50 via-orange-50/50 to-pink-50/40 p-5 md:p-6 rounded-3xl border border-amber-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-sm">
              <Cake className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                تذكير ومتابعة أعياد ميلاد الشمامسة
                {todaysBirthdays.length > 0 && (
                  <span className="px-2.5 py-0.5 bg-rose-500 text-white rounded-full text-xs animate-pulse">
                    {todaysBirthdays.length} اليوم!
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                إرسال رسالة التهنئة الرسمية وإشعار الشماس تلقائياً
              </p>
            </div>
          </div>
        </div>

        {/* Today's Birthdays List */}
        {todaysBirthdays.length > 0 ? (
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
              أعياد ميلاد اليوم المباركة:
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {todaysBirthdays.map(d => (
                <div key={d.id} className="bg-white p-3.5 rounded-2xl border border-amber-200 shadow-xs flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {d.photoUrl ? (
                      <img src={d.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-amber-300" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm">
                        🎂
                      </div>
                    )}
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{d.fullName}</p>
                      <p className="text-xs text-amber-700 font-medium">تاريخ الميلاد: {d.birthDate}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSendBirthdayGreeting(d)}
                    disabled={congratsSent[d.id] || congratsLoading === d.id}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs ${
                      congratsSent[d.id]
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                  >
                    {congratsLoading === d.id ? (
                      <span className="animate-spin text-xs">⏳</span>
                    ) : congratsSent[d.id] ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> تم إرسال التهنئة
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" /> إرسال تهنئة + 10 نقاط
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white/80 p-3.5 rounded-2xl border border-amber-100 text-xs text-slate-600 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Cake className="w-4 h-4 text-amber-500" /> لا يوجد أعياد ميلاد شمامسة اليوم.
            </span>
            {upcomingBirthdays.length > 0 && (
              <span className="font-bold text-amber-800">
                يوجد {upcomingBirthdays.length} شماس يحتفلون خلال الـ 7 أيام القادمة.
              </span>
            )}
          </div>
        )}

        {/* Upcoming Birthdays this week */}
        {upcomingBirthdays.length > 0 && (
          <div className="pt-1">
            <p className="text-[11px] font-bold text-slate-500 mb-2">أعياد الميلاد القادمة خلال هذا الأسبوع:</p>
            <div className="flex flex-wrap gap-2">
              {upcomingBirthdays.map(d => (
                <div key={d.id} className="bg-white/90 px-3 py-1.5 rounded-xl border border-amber-100 text-xs text-slate-700 flex items-center gap-2 font-medium">
                  <span>🎂 {d.fullName}</span>
                  <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">({d.birthDate})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 🌟 Points Leaderboard Section (كشف وترتيب الشمامسة حسب النقاط تنازلياً) 🌟 */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 md:p-7 space-y-6">
        {/* Leaderboard Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white flex items-center justify-center shadow-md shrink-0">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-slate-900">
                  كشف وترتيب الشمامسة حسب النقاط
                </h3>
                <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-200 text-xs font-black rounded-full">
                  ترتيب تنازلي مباشر
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                متابعة دقيقة لرصيد كل شماس وترتيبه في الخورس مع إمكانية التصفية والتصدير
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Mode Toggle: Current Month vs All Time */}
            <div className="bg-slate-100 p-1 rounded-2xl flex items-center gap-1 border border-slate-200 text-xs font-bold">
              <button
                onClick={() => setRankingMode('month')}
                className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                  rankingMode === 'month'
                    ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/80 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Star className="w-3.5 h-3.5 text-amber-500" />
                نقاط شهر {currentMonthNameAr}
              </button>
              <button
                onClick={() => setRankingMode('total')}
                className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                  rankingMode === 'total'
                    ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/80 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Trophy className="w-3.5 h-3.5 text-amber-500" />
                الترتيب التراكمي العام
              </button>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
              title="تصدير كشف النقاط كملف Excel / CSV"
            >
              <Download className="w-3.5 h-3.5" />
              تصدير CSV
            </button>
          </div>
        </div>

        {/* Quick Statistics Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-amber-50 to-amber-100/40 p-4 rounded-2xl border border-amber-200/70">
            <span className="text-[11px] text-amber-800 block font-bold flex items-center gap-1">
              <Crown className="w-3.5 h-3.5 text-amber-600" />
              أعلى رصيد (المتصدر)
            </span>
            <span className="text-xl font-black text-amber-900 mt-1 block">
              {pointsStats.maxScore} <span className="text-xs font-normal">نقطة</span>
            </span>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50/40 p-4 rounded-2xl border border-blue-200/70">
            <span className="text-[11px] text-blue-800 block font-bold flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
              متوسط نقاط الشماس
            </span>
            <span className="text-xl font-black text-blue-900 mt-1 block">
              {pointsStats.avgScore} <span className="text-xs font-normal">نقطة</span>
            </span>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-teal-50/40 p-4 rounded-2xl border border-emerald-200/70">
            <span className="text-[11px] text-emerald-800 block font-bold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              المتفاعلون هذا الشهر
            </span>
            <span className="text-xl font-black text-emerald-900 mt-1 block">
              {pointsStats.activeDeaconsWithPoints} <span className="text-xs font-normal">من {deacons.length}</span>
            </span>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50/40 p-4 rounded-2xl border border-purple-200/70">
            <span className="text-[11px] text-purple-800 block font-bold flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-purple-600" />
              إجمالي نقاط الخورس
            </span>
            <span className="text-xl font-black text-purple-900 mt-1 block">
              {rankingMode === 'month' ? pointsStats.monthPointsSum : pointsStats.totalPointsSum} <span className="text-xs font-normal">نقطة</span>
            </span>
          </div>
        </div>

        {/* Top 3 Podium (منصة المتصدرين الأوائل مع دعم المكرر) */}
        {hasTopPodium && !searchTerm && !selectedTeamFilter && (
          <div className="bg-gradient-to-b from-slate-50 to-slate-100/80 p-5 rounded-3xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-amber-500" />
                منصة المتصدرين الأوائل ({rankingMode === 'month' ? `شهر ${currentMonthNameAr}` : 'الترتيب العام'}):
              </h4>
              <span className="text-[11px] text-slate-500 font-bold">
                (يتم تصنيف المتساوين في النقاط بنفس المركز مكرر)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
              {/* 1st Place Group (ذهب) */}
              {topRank1.length > 0 && (
                <div className="md:order-2 bg-gradient-to-b from-amber-100 via-amber-50 to-white p-4 rounded-2xl border-2 border-amber-300 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
                  <div className="bg-amber-500 text-white text-[10px] font-black px-3 py-0.5 rounded-full flex items-center gap-1 shadow-xs mb-2">
                    <Crown className="w-3 h-3" />
                    المركز الأول {topRank1.length > 1 ? '(مكرر)' : ''} 🥇
                  </div>

                  <div className="w-full space-y-3">
                    {topRank1.map((item, idx) => (
                      <div key={item.deacon.id} className={idx > 0 ? 'pt-3 border-t border-amber-200/60' : ''}>
                        <div className="relative mx-auto w-16 h-16 mb-2">
                          {item.deacon.photoUrl ? (
                            <img src={item.deacon.photoUrl} alt="" className="w-16 h-16 rounded-full object-cover border-3 border-amber-400 shadow-md" />
                          ) : (
                            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-300 text-white flex items-center justify-center font-black text-xl border-3 border-amber-400 shadow-md">
                              {item.deacon.fullName?.[0] || '✝️'}
                            </div>
                          )}
                          <span className="absolute -bottom-1 -right-1 bg-amber-500 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                            1
                          </span>
                        </div>
                        <p className="font-extrabold text-slate-900 text-sm">{item.deacon.fullName}</p>
                        <p className="text-[11px] text-amber-800 font-bold mt-0.5">{item.teamName} • {item.levelInfo.title}</p>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-3 bg-amber-500 text-white font-black text-sm px-4 py-1.5 rounded-xl shadow-xs flex items-center gap-1">
                    <Star className="w-4 h-4 fill-white" />
                    {topRank1[0].activePoints} نقطة
                  </div>
                </div>
              )}

              {/* 2nd Place Group (فضة) */}
              {topRank2.length > 0 && (
                <div className="md:order-1 bg-gradient-to-b from-slate-100 via-slate-50 to-white p-4 rounded-2xl border-2 border-slate-300 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
                  <div className="bg-slate-500 text-white text-[10px] font-black px-3 py-0.5 rounded-full flex items-center gap-1 shadow-xs mb-2">
                    <Medal className="w-3 h-3" />
                    المركز الثاني {topRank2.length > 1 ? '(مكرر)' : ''} 🥈
                  </div>

                  <div className="w-full space-y-3">
                    {topRank2.map((item, idx) => (
                      <div key={item.deacon.id} className={idx > 0 ? 'pt-3 border-t border-slate-200/60' : ''}>
                        <div className="relative mx-auto w-14 h-14 mb-2">
                          {item.deacon.photoUrl ? (
                            <img src={item.deacon.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover border-3 border-slate-300 shadow-sm" />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center font-black text-lg border-3 border-slate-300 shadow-sm">
                              {item.deacon.fullName?.[0] || '✝️'}
                            </div>
                          )}
                          <span className="absolute -bottom-1 -right-1 bg-slate-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                            2
                          </span>
                        </div>
                        <p className="font-extrabold text-slate-900 text-sm">{item.deacon.fullName}</p>
                        <p className="text-[11px] text-slate-600 font-bold mt-0.5">{item.teamName} • {item.levelInfo.title}</p>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-3 bg-slate-700 text-white font-black text-sm px-4 py-1.5 rounded-xl shadow-xs flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-white" />
                    {topRank2[0].activePoints} نقطة
                  </div>
                </div>
              )}

              {/* 3rd Place Group (برونز) */}
              {topRank3.length > 0 && (
                <div className="md:order-3 bg-gradient-to-b from-orange-100 via-orange-50 to-white p-4 rounded-2xl border-2 border-orange-300 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
                  <div className="bg-orange-600 text-white text-[10px] font-black px-3 py-0.5 rounded-full flex items-center gap-1 shadow-xs mb-2">
                    <Award className="w-3 h-3" />
                    المركز الثالث {topRank3.length > 1 ? '(مكرر)' : ''} 🥉
                  </div>

                  <div className="w-full space-y-3">
                    {topRank3.map((item, idx) => (
                      <div key={item.deacon.id} className={idx > 0 ? 'pt-3 border-t border-orange-200/60' : ''}>
                        <div className="relative mx-auto w-14 h-14 mb-2">
                          {item.deacon.photoUrl ? (
                            <img src={item.deacon.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover border-3 border-orange-300 shadow-sm" />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-orange-200 text-orange-800 flex items-center justify-center font-black text-lg border-3 border-orange-300 shadow-sm">
                              {item.deacon.fullName?.[0] || '✝️'}
                            </div>
                          )}
                          <span className="absolute -bottom-1 -right-1 bg-orange-700 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                            3
                          </span>
                        </div>
                        <p className="font-extrabold text-slate-900 text-sm">{item.deacon.fullName}</p>
                        <p className="text-[11px] text-orange-800 font-bold mt-0.5">{item.teamName} • {item.levelInfo.title}</p>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-3 bg-orange-600 text-white font-black text-sm px-4 py-1.5 rounded-xl shadow-xs flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-white" />
                    {topRank3[0].activePoints} نقطة
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filter and Search Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالاسم أو اسم المستخدم..."
              className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto">
            {uniqueTeams.length > 0 && (
              <select
                value={selectedTeamFilter}
                onChange={(e) => setSelectedTeamFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:outline-none"
              >
                <option value="">جميع الفرق والمراحل</option>
                {uniqueTeams.map((tm, i) => (
                  <option key={i} value={tm}>{tm}</option>
                ))}
              </select>
            )}

            <span className="text-xs text-slate-500 font-bold whitespace-nowrap">
              ({filteredRankedList.length} شماس مسجل)
            </span>
          </div>
        </div>

        {/* Descending Roster Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-600 font-extrabold">
              <tr>
                <th className="py-3 px-3.5 text-center w-20">الترتيب</th>
                <th className="py-3 px-4">الشماس</th>
                <th className="py-3 px-4">الفريق / المرحلة</th>
                <th className="py-3 px-4">الرتبة والمستوى</th>
                <th className="py-3 px-4 text-center">
                  نقاط شهر {currentMonthNameAr}
                </th>
                <th className="py-3 px-4 text-center">
                  إجمالي النقاط الكلي
                </th>
                <th className="py-3 px-4 text-center">إجراءات سريعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredRankedList.slice(0, tableRowsLimit).map((item) => {
                const isTop1 = item.rank === 1 && item.activePoints > 0;
                const isTop2 = item.rank === 2 && item.activePoints > 0;
                const isTop3 = item.rank === 3 && item.activePoints > 0;

                return (
                  <tr 
                    key={item.deacon.id}
                    className={`hover:bg-blue-50/40 transition-colors ${
                      isTop1 ? 'bg-amber-50/30 font-bold' : isTop2 ? 'bg-slate-50/40' : isTop3 ? 'bg-orange-50/20' : ''
                    }`}
                  >
                    {/* Rank Badge with "مكرر" indicator */}
                    <td className="py-3 px-3.5 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        {isTop1 ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-amber-500 text-white font-black text-xs shadow-xs">
                            🥇 1
                          </span>
                        ) : isTop2 ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-slate-500 text-white font-black text-xs shadow-xs">
                            🥈 2
                          </span>
                        ) : isTop3 ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-orange-600 text-white font-black text-xs shadow-xs">
                            🥉 3
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs">
                            #{item.rank}
                          </span>
                        )}

                        {item.isDuplicate && (
                          <span className="px-1.5 py-0.2 bg-amber-100/80 text-amber-900 border border-amber-300 text-[10px] font-black rounded-md leading-tight">
                            مكرر
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Deacon Info */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {item.deacon.photoUrl ? (
                          <img src={item.deacon.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 font-black text-xs flex items-center justify-center shrink-0 border border-indigo-100">
                            {item.deacon.fullName?.[0] || '✝️'}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                            {item.deacon.fullName}
                            {isTop1 && <Crown className="w-3.5 h-3.5 text-amber-500 inline" />}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono">@{item.deacon.username}</p>
                        </div>
                      </div>
                    </td>

                    {/* Team */}
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">
                        {item.teamName}
                      </span>
                    </td>

                    {/* Level */}
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-[11px] font-bold inline-flex items-center gap-1">
                        <Award className="w-3 h-3 text-indigo-500" />
                        {item.levelInfo.title}
                      </span>
                    </td>

                    {/* Current Month Points */}
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-xl text-xs font-black inline-block ${
                        item.monthPoints > 0 
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                          : 'text-slate-400 font-normal'
                      }`}>
                        {item.monthPoints > 0 ? `+${item.monthPoints}` : '0'}
                      </span>
                    </td>

                    {/* Total All-Time Points */}
                    <td className="py-3 px-4 text-center">
                      <span className="px-3 py-1 bg-blue-50 text-blue-900 border border-blue-200 rounded-xl text-sm font-black inline-block">
                        {item.totalPoints}
                      </span>
                    </td>

                    {/* Quick Actions */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => navigate('/admin/reports')}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="عرض التقرير المفصل"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => navigate('/admin/points')}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="إضافة أو تعديل نقاط"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredRankedList.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                    لا توجد بيانات مطابقة لمعايير البحث.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Expand / Show More Rows Button */}
        {filteredRankedList.length > tableRowsLimit && (
          <div className="text-center pt-2">
            <button
              onClick={() => setTableRowsLimit(prev => prev + 50)}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all shadow-xs"
            >
              عرض باقي الشمامسة (متبقي {filteredRankedList.length - tableRowsLimit} شماس)
            </button>
          </div>
        )}
      </div>

      {/* Main Sections Navigation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((sec, idx) => (
          <button
            key={idx}
            onClick={() => navigate(sec.path)}
            className="flex items-center p-5 bg-white rounded-3xl shadow-sm border border-slate-100 hover:border-blue-300 hover:shadow-md transition-all text-right group"
          >
            <div className={`w-13 h-13 rounded-2xl ${sec.color} text-white flex items-center justify-center shrink-0 ml-4 group-hover:scale-105 transition-transform shadow-sm`}>
              <sec.icon className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 text-base">{sec.title}</h3>
                {sec.badge && (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-extrabold rounded-md">
                    {sec.badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{sec.desc}</p>
            </div>
            <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0 mr-2" />
          </button>
        ))}
      </div>
    </div>
  );
};
