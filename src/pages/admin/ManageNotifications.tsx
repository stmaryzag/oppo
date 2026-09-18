import React, { useState, useEffect } from 'react';
import { 
  collection, query, orderBy, getDocs, addDoc, updateDoc, doc, 
  deleteDoc, setDoc, where 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Bell, Loader2, Send, Clock, Calendar, CheckCircle2, AlertCircle, 
  Plus, Trash2, Edit3, Power, Sparkles, RefreshCcw, Check, ToggleLeft, ToggleRight
} from 'lucide-react';
import { RecurringNotification } from '../../types';
import { sendOneSignalPush } from '../../utils/onesignal';

const DAYS_OF_WEEK = [
  { val: 0, label: 'الأحد' },
  { val: 1, label: 'الإثنين' },
  { val: 2, label: 'الثلاثاء' },
  { val: 3, label: 'الأربعاء' },
  { val: 4, label: 'الخميس' },
  { val: 5, label: 'الجمعة' },
  { val: 6, label: 'السبت' },
];

const PRESET_NOTIFICATIONS = [
  {
    title: '🔔 تذكير بحضور قداس الجمعة المبارك',
    body: 'نذكركم بالحضور المبكر في تمام الساعة 6:30 صباحاً بلبس التونية والاستعداد للتناول من الأسرار المقدسة.',
    dayOfWeek: 4, // Thursday
    time: '20:00',
    colorTag: 'blue' as const,
    audience: 'all' as const
  },
  {
    title: '🎶 موعد تمرين الألحان الأسبوعي',
    body: 'موعدنا غداً السبت مع فصل الألحان ودراسة طقس ومردات القداس الباسيلي، الحضور هام لجميع الشمامسة.',
    dayOfWeek: 5, // Friday
    time: '18:00',
    colorTag: 'yellow' as const,
    audience: 'deacons' as const
  },
  {
    title: '📞 تذكير بمهام الافتقاد الأسبوعي',
    body: 'برجاء الاتصال بالـ 3 شمامسة المسندين لك في نظام الافتقاد وتدوين حالة كل منهم على التطبيق.',
    dayOfWeek: 1, // Monday
    time: '19:00',
    colorTag: 'green' as const,
    audience: 'deacons' as const
  }
];

export const ManageNotifications = () => {
  const { userData } = useAuth();
  const [activeTab, setActiveTab] = useState<'recurring' | 'scheduled'>('recurring');

  // One-time Scheduled State
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [colorTag, setColorTag] = useState<'blue' | 'green' | 'red' | 'yellow'>('blue');
  const [audience, setAudience] = useState<'all' | 'deacons' | 'parents' | 'specific_user'>('all');
  const [specificUserId, setSpecificUserId] = useState('');
  const [allUsersList, setAllUsersList] = useState<any[]>([]);
  const [sendDate, setSendDate] = useState('');
  const [sendTime, setSendTime] = useState('');
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [sendingInstant, setSendingInstant] = useState(false);

  // Recurring Notifications State
  const [recurringList, setRecurringList] = useState<RecurringNotification[]>([]);
  const [recTitle, setRecTitle] = useState('');
  const [recBody, setRecBody] = useState('');
  const [recDayOfWeek, setRecDayOfWeek] = useState<number>(4);
  const [recTime, setRecTime] = useState('20:00');
  const [recColorTag, setRecColorTag] = useState<'blue' | 'green' | 'red' | 'yellow'>('blue');
  const [recAudience, setRecAudience] = useState<'all' | 'deacons' | 'parents'>('all');
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const [showRecForm, setShowRecForm] = useState(false);
  const [loadingRec, setLoadingRec] = useState(false);

  // Dispatching state
  const [dispatching, setDispatching] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchScheduled();
    fetchRecurring();
    fetchUsers();
    // Auto-check due notifications silently on page load
    runSilentAutoDispatch();
  }, []);

  const fetchUsers = async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => (a.fullName || '').localeCompare(b.fullName || '', 'ar'));
      setAllUsersList(list);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchScheduled = async () => {
    try {
      const snap = await getDocs(collection(db, 'notifications_scheduled'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => new Date(b.sendAt || 0).getTime() - new Date(a.sendAt || 0).getTime());
      setScheduled(list);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRecurring = async () => {
    try {
      const snap = await getDocs(collection(db, 'recurring_notifications'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as RecurringNotification));
      list.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
      setRecurringList(list);
    } catch (e) {
      console.error(e);
    }
  };

  const getWeekIdentifier = () => {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  };

  // Dispatch logic for both One-time and Weekly Recurring
  const dispatchNotifications = async (manualTrigger = false) => {
    if (manualTrigger) {
      setDispatching(true);
    }
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const currentDay = now.getDay();
      const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const currentWeekKey = getWeekIdentifier();

      // Fetch all users to deliver to
      const usersSnap = await getDocs(collection(db, 'users'));
      const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      let dispatchedCount = 0;

      // 1. Process One-time Scheduled Notifications
      const schedSnap = await getDocs(collection(db, 'notifications_scheduled'));
      const unsentScheduled = schedSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(d => !d.sent && d.sendAt && new Date(d.sendAt) <= now);

      for (const notif of unsentScheduled) {
        let targets = allUsers;
        if (notif.audience === 'deacons') {
          targets = allUsers.filter((u: any) => u.role === 'deacon');
        } else if (notif.audience === 'parents') {
          targets = allUsers.filter((u: any) => u.role === 'parent');
        } else if (notif.audience === 'specific_user' && notif.specificUserId) {
          targets = allUsers.filter((u: any) => u.id === notif.specificUserId);
        }

        for (const targetUser of targets) {
          await addDoc(collection(db, 'notifications_inbox'), {
            userId: targetUser.id,
            title: notif.title,
            body: notif.body,
            colorTag: notif.colorTag || 'blue',
            createdAt: nowIso,
            read: false
          });
        }

        // Send push notification to OneSignal
        if (notif.audience === 'all') {
          await sendOneSignalPush({
            title: notif.title,
            body: notif.body,
            includedSegments: ['Subscribed Users']
          });
        } else {
          const targetIds = targets.map((u: any) => u.id).filter(Boolean);
          if (targetIds.length > 0) {
            await sendOneSignalPush({
              title: notif.title,
              body: notif.body,
              externalUserIds: targetIds
            });
          }
        }

        await updateDoc(doc(db, 'notifications_scheduled', notif.id), {
          sent: true,
          actualSentAt: nowIso
        });
        dispatchedCount++;
      }

      // 2. Process Recurring Weekly Notifications
      const recSnap = await getDocs(collection(db, 'recurring_notifications'));
      const activeRecurring = recSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as RecurringNotification))
        .filter(r => r.active);

      for (const rec of activeRecurring) {
        // If today is the configured day of week (or if manual trigger with override)
        const isTodayDue = rec.dayOfWeek === currentDay && rec.time <= currentTimeStr;
        const alreadyDispatchedThisWeek = rec.lastDispatchedWeekKey === currentWeekKey;

        if (manualTrigger || (isTodayDue && !alreadyDispatchedThisWeek)) {
          let targets = allUsers;
          if (rec.audience === 'deacons') {
            targets = allUsers.filter((u: any) => u.role === 'deacon');
          } else if (rec.audience === 'parents') {
            targets = allUsers.filter((u: any) => u.role === 'parent');
          }

          for (const targetUser of targets) {
            await addDoc(collection(db, 'notifications_inbox'), {
              userId: targetUser.id,
              title: rec.title,
              body: rec.body,
              colorTag: rec.colorTag || 'blue',
              createdAt: nowIso,
              read: false,
              isRecurring: true
            });
          }

          // Send push notification to OneSignal
          if (rec.audience === 'all') {
            await sendOneSignalPush({
              title: rec.title,
              body: rec.body,
              includedSegments: ['Subscribed Users']
            });
          } else {
            const targetIds = targets.map((u: any) => u.id).filter(Boolean);
            if (targetIds.length > 0) {
              await sendOneSignalPush({
                title: rec.title,
                body: rec.body,
                externalUserIds: targetIds
              });
            }
          }

          if (rec.id) {
            await updateDoc(doc(db, 'recurring_notifications', rec.id), {
              lastDispatchedWeekKey: currentWeekKey,
              lastDispatchedAt: nowIso
            });
          }
          dispatchedCount++;
        }
      }

      await fetchScheduled();
      await fetchRecurring();

      if (manualTrigger) {
        setSuccessMsg(
          dispatchedCount > 0 
            ? `تم توزيع ${dispatchedCount} إشعار بنجاح وإرسالها لصناديق وارد المستخدمين ✅` 
            : 'لا توجد إشعارات مجدولة مستحقة في الوقت الحالي.'
        );
      }
    } catch (err: any) {
      console.error("Notification dispatch error:", err);
      if (manualTrigger) {
        setErrorMsg('تعذر توزيع الإشعارات: ' + (err.message || 'خطأ غير معروف'));
      }
    } finally {
      if (manualTrigger) {
        setDispatching(false);
      }
    }
  };

  const runSilentAutoDispatch = async () => {
    try {
      await dispatchNotifications(false);
    } catch (e) {
      // silent
    }
  };

  // Schedule Single Notification
  const handleScheduleSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || !sendDate || !sendTime) {
      setErrorMsg('يرجى إكمال جميع الحقول');
      return;
    }
    if (audience === 'specific_user' && !specificUserId) {
      setErrorMsg('يرجى اختيار المستخدم المستهدف');
      return;
    }

    setLoadingSchedule(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const sendAtIso = new Date(`${sendDate}T${sendTime}`).toISOString();
      await addDoc(collection(db, 'notifications_scheduled'), {
        title: title.trim(),
        body: body.trim(),
        colorTag,
        audience,
        specificUserId: audience === 'specific_user' ? specificUserId : null,
        sendAt: sendAtIso,
        createdBy: userData?.id || 'admin',
        createdAt: new Date().toISOString(),
        sent: false
      });

      setTitle('');
      setBody('');
      setSendDate('');
      setSendTime('');
      setSpecificUserId('');
      setSuccessMsg('تمت جدولة الإشعار بنجاح ✅');
      await fetchScheduled();
    } catch (err: any) {
      console.error(err);
      setErrorMsg('حدث خطأ أثناء الجدولة: ' + err.message);
    } finally {
      setLoadingSchedule(false);
    }
  };

  // Instant Send Notification directly to inbox
  const handleSendInstant = async () => {
    if (!title.trim() || !body.trim()) {
      setErrorMsg('يرجى كتابة عنوان ونص الإشعار أولاً');
      return;
    }
    if (audience === 'specific_user' && !specificUserId) {
      setErrorMsg('يرجى اختيار المستخدم المستهدف');
      return;
    }

    setSendingInstant(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const nowIso = new Date().toISOString();
      let targets = allUsersList;
      if (audience === 'deacons') {
        targets = allUsersList.filter(u => u.role === 'deacon');
      } else if (audience === 'parents') {
        targets = allUsersList.filter(u => u.role === 'parent');
      } else if (audience === 'specific_user' && specificUserId) {
        targets = allUsersList.filter(u => u.id === specificUserId);
      }

      for (const targetUser of targets) {
        await addDoc(collection(db, 'notifications_inbox'), {
          userId: targetUser.id,
          title: title.trim(),
          body: body.trim(),
          colorTag: colorTag || 'blue',
          createdAt: nowIso,
          read: false
        });
      }

      // Send Instant Push via OneSignal
      let pushRes: any = null;
      if (audience === 'all') {
        pushRes = await sendOneSignalPush({
          title: title.trim(),
          body: body.trim(),
          includedSegments: ['Subscribed Users']
        });
      } else {
        const targetIds = targets.map(u => u.id).filter(Boolean);
        if (targetIds.length > 0) {
          pushRes = await sendOneSignalPush({
            title: title.trim(),
            body: body.trim(),
            externalUserIds: targetIds
          });
        }
      }

      console.log('Push dispatch feedback:', pushRes);

      setTitle('');
      setBody('');
      setSpecificUserId('');

      const recipients = pushRes?.result?.recipients ?? pushRes?.recipients;
      const errors = pushRes?.result?.errors ?? pushRes?.errors;
      const allPlayersNotSubscribed = Array.isArray(errors) && errors.includes('All included players are not subscribed');

      if (recipients === 0 || allPlayersNotSubscribed) {
        setSuccessMsg(`تم حفظ الإشعار بالصندوق، ولكن لم يوجد أجهزة مشتركة حالياً في OneSignal بانتظار الإشعار. يرجى الضغط على "تفعيل الإشعارات" في الموبايل أولاً.`);
      } else {
        setSuccessMsg(`تم إرسال الإشعار بنجاح لـ ${recipients ? recipients + ' جهاز' : targets.length + ' مستخدم'}! 🚀`);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('حدث خطأ أثناء الإرسال: ' + err.message);
    } finally {
      setSendingInstant(false);
    }
  };

  // Save Recurring Notification
  const handleSaveRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recTitle.trim() || !recBody.trim() || !recTime) {
      setErrorMsg('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    setLoadingRec(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const payload: RecurringNotification = {
        title: recTitle.trim(),
        body: recBody.trim(),
        dayOfWeek: Number(recDayOfWeek),
        time: recTime,
        colorTag: recColorTag,
        audience: recAudience,
        active: true,
        createdAt: new Date().toISOString(),
        createdBy: userData?.id || 'admin'
      };

      if (editingRecId) {
        await updateDoc(doc(db, 'recurring_notifications', editingRecId), payload as any);
        setSuccessMsg('تم تحديث الإشعار الثابت الأسبوعي بنجاح ✅');
      } else {
        await addDoc(collection(db, 'recurring_notifications'), payload as any);
        setSuccessMsg('تمت إضافة الإشعار الثابت الأسبوعي بنجاح ✅');
      }

      resetRecForm();
      await fetchRecurring();
    } catch (err: any) {
      console.error(err);
      setErrorMsg('حدث خطأ أثناء حفظ الإشعار الثابت: ' + err.message);
    } finally {
      setLoadingRec(false);
    }
  };

  const handleToggleRecurringActive = async (rec: RecurringNotification) => {
    if (!rec.id) return;
    try {
      await updateDoc(doc(db, 'recurring_notifications', rec.id), {
        active: !rec.active
      });
      setRecurringList(prev => prev.map(r => r.id === rec.id ? { ...r, active: !r.active } : r));
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleDeleteRecurring = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الإشعار الثابت؟')) return;
    try {
      await deleteDoc(doc(db, 'recurring_notifications', id));
      setRecurringList(prev => prev.filter(r => r.id !== id));
      setSuccessMsg('تم الحذف بنجاح');
    } catch (err: any) {
      console.error(err);
      setErrorMsg('تعذر الحذف: ' + err.message);
    }
  };

  const handleEditRecurring = (rec: RecurringNotification) => {
    setEditingRecId(rec.id || null);
    setRecTitle(rec.title);
    setRecBody(rec.body);
    setRecDayOfWeek(rec.dayOfWeek);
    setRecTime(rec.time);
    setRecColorTag(rec.colorTag);
    setRecAudience(rec.audience);
    setShowRecForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetRecForm = () => {
    setEditingRecId(null);
    setRecTitle('');
    setRecBody('');
    setRecDayOfWeek(4);
    setRecTime('20:00');
    setRecColorTag('blue');
    setRecAudience('all');
    setShowRecForm(false);
  };

  const applyPreset = (preset: typeof PRESET_NOTIFICATIONS[0]) => {
    setRecTitle(preset.title);
    setRecBody(preset.body);
    setRecDayOfWeek(preset.dayOfWeek);
    setRecTime(preset.time);
    setRecColorTag(preset.colorTag);
    setRecAudience(preset.audience);
    setShowRecForm(true);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-800 via-indigo-800 to-blue-900 text-white p-6 rounded-3xl shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20">
              <Bell className="w-8 h-8 text-purple-200" />
            </div>
            <div>
              <span className="inline-block px-3 py-0.5 bg-purple-500/30 text-purple-200 text-xs font-bold rounded-full mb-1">
                مركز البث والإشعارات
              </span>
              <h2 className="text-xl md:text-2xl font-black">إدارة الإشعارات والتنبيهات المجدولة</h2>
              <p className="text-xs text-purple-200/80 mt-0.5">
                إشعارات ثابتة أسبوعية تتكرر تلقائياً • إشعارات مخصصة لمرة واحدة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => dispatchNotifications(true)}
              disabled={dispatching}
              className="bg-white hover:bg-purple-50 text-purple-950 px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
            >
              {dispatching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-purple-700" />
                  جاري التوزيع...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 text-purple-700" />
                  تشغيل موزع الإشعارات الآن
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button 
          onClick={() => setActiveTab('recurring')}
          className={`flex-1 py-3 font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'recurring' 
              ? 'bg-purple-600 text-white shadow-md' 
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          الاشعارات الثابتة الأسبوعية (متكررة تلقائياً)
        </button>
        <button 
          onClick={() => setActiveTab('scheduled')}
          className={`flex-1 py-3 font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'scheduled' 
              ? 'bg-purple-600 text-white shadow-md' 
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-4 h-4" />
          جدولة إشعار لمرة واحدة (One-time)
        </button>
      </div>

      {/* Messages */}
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

      {/* TAB 1: Recurring Weekly Notifications */}
      {activeTab === 'recurring' && (
        <div className="space-y-6">
          {/* Presets and Add Button Bar */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  قوالب سريعة للتنبيهات الأسبوعية الثابتة
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  انقر على أي قالب لتعبئته وضبط موعد تكراره الأسبوعي دون الحاجة لإعادة كتابته يدوياً كل أسبوع
                </p>
              </div>

              <button
                onClick={() => {
                  resetRecForm();
                  setShowRecForm(!showRecForm);
                }}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs shrink-0"
              >
                <Plus className="w-4 h-4" />
                إنشاء إشعار ثابت جديد
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {PRESET_NOTIFICATIONS.map((preset, idx) => (
                <div 
                  key={idx}
                  onClick={() => applyPreset(preset)}
                  className="p-3.5 rounded-2xl bg-purple-50/50 hover:bg-purple-100/60 border border-purple-100 cursor-pointer transition-all space-y-1.5 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-purple-900 group-hover:text-purple-700">{preset.title}</span>
                    <span className="text-[10px] bg-purple-200/80 text-purple-800 px-2 py-0.5 rounded-md font-bold">
                      {DAYS_OF_WEEK.find(d => d.val === preset.dayOfWeek)?.label} ({preset.time})
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">{preset.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Form */}
          {showRecForm && (
            <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-purple-300 space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-purple-600" />
                  {editingRecId ? 'تعديل بيانات الإشعار الثابت' : 'إعداد إشعار ثابت أسبوعي جديد'}
                </h3>
                <button onClick={resetRecForm} className="text-slate-400 hover:text-slate-600 p-1">
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveRecurring} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">عنوان الإشعار:</label>
                    <input 
                      required 
                      type="text" 
                      value={recTitle} 
                      onChange={e => setRecTitle(e.target.value)} 
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500" 
                      placeholder="مثال: تذكير بحضور قداس الجمعة" 
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">المستهدفين:</label>
                    <select 
                      value={recAudience} 
                      onChange={e => setRecAudience(e.target.value as any)} 
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500"
                    >
                      <option value="all">الجميع (الشمامسة وأولياء الأمور)</option>
                      <option value="deacons">الشمامسة فقط</option>
                      <option value="parents">أولياء الأمور فقط</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">نص ومحتوى الإشعار:</label>
                  <textarea 
                    required 
                    value={recBody} 
                    onChange={e => setRecBody(e.target.value)} 
                    rows={3} 
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-purple-500 leading-relaxed" 
                    placeholder="اكتب نص الإشعار بالتفصيل..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">يوم الإرسال أسبوعياً:</label>
                    <select 
                      value={recDayOfWeek} 
                      onChange={e => setRecDayOfWeek(Number(e.target.value))} 
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500"
                    >
                      {DAYS_OF_WEEK.map(d => (
                        <option key={d.val} value={d.val}>كل يوم {d.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">وقت الإرسال:</label>
                    <input 
                      required 
                      type="time" 
                      value={recTime} 
                      onChange={e => setRecTime(e.target.value)} 
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500 font-mono" 
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">اللون التمييزي:</label>
                    <select 
                      value={recColorTag} 
                      onChange={e => setRecColorTag(e.target.value as any)} 
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500"
                    >
                      <option value="blue">أزرق (عادي/روحي)</option>
                      <option value="green">أخضر (مكافأة/نشاط)</option>
                      <option value="red">أحمر (هام جداً)</option>
                      <option value="yellow">أصفر (تذكير)</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button 
                    type="button" 
                    onClick={resetRecForm} 
                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors"
                  >
                    إلغاء
                  </button>
                  <button 
                    type="submit" 
                    disabled={loadingRec} 
                    className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-purple-600/20 disabled:opacity-50"
                  >
                    {loadingRec ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {editingRecId ? 'حفظ التعديلات' : 'حفظ وتفعيل الإشعار الثابت'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* List of Recurring Notifications */}
          <div className="space-y-3">
            <h3 className="font-extrabold text-slate-800 text-base">
              الإشعارات الثابتة النشطة والمعدة ({recurringList.length})
            </h3>

            {recurringList.map(rec => {
              const dayLabel = DAYS_OF_WEEK.find(d => d.val === rec.dayOfWeek)?.label;
              const colorTagClass = rec.colorTag === 'red' ? 'bg-red-500' : rec.colorTag === 'green' ? 'bg-green-500' : rec.colorTag === 'yellow' ? 'bg-yellow-500' : 'bg-blue-500';

              return (
                <div 
                  key={rec.id} 
                  className={`bg-white p-5 rounded-3xl border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                    rec.active ? 'border-slate-100' : 'border-slate-200 opacity-60 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-3 h-12 rounded-full ${colorTagClass} shrink-0 mt-1`}></div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-extrabold text-slate-800 text-sm">{rec.title}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          rec.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {rec.active ? 'نشط أسبوعياً' : 'متوقف مؤقتاً'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{rec.body}</p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium pt-1">
                        <span className="flex items-center gap-1 font-bold text-purple-700">
                          <Calendar className="w-3.5 h-3.5" /> كل يوم {dayLabel} الساعة {rec.time}
                        </span>
                        <span>•</span>
                        <span>
                          المستهدف: {rec.audience === 'all' ? 'الجميع' : rec.audience === 'deacons' ? 'الشمامسة' : 'أولياء الأمور'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t md:border-t-0 pt-3 md:pt-0">
                    <button
                      onClick={() => handleToggleRecurringActive(rec)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                        rec.active 
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200' 
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                      title={rec.active ? 'إيقاف مؤقت' : 'تفعيل'}
                    >
                      <Power className="w-3.5 h-3.5" />
                      {rec.active ? 'إيقاف مؤقت' : 'تفعيل'}
                    </button>

                    <button
                      onClick={() => handleEditRecurring(rec)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                      title="تعديل"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => rec.id && handleDeleteRecurring(rec.id)}
                      className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {recurringList.length === 0 && (
              <div className="text-center p-12 bg-white rounded-3xl border border-slate-200 border-dashed text-slate-400 text-xs">
                لا توجد إشعارات ثابتة مسجلة. اضغط على "إنشاء إشعار ثابت جديد" أو اختر قالباً من القوالب أعلاه.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: One-time Scheduled Notifications */}
      {activeTab === 'scheduled' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-max space-y-4">
            <h3 className="font-extrabold text-slate-800 text-base">جدولة إشعار لمرة واحدة</h3>
            <form onSubmit={handleScheduleSingle} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">العنوان</label>
                <input 
                  required 
                  type="text" 
                  value={title} 
                  onChange={e => setTitle(e.target.value)} 
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500" 
                  placeholder="مثال: تنبيه خاص برحلة الكنيسة" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">النص</label>
                <textarea 
                  required 
                  value={body} 
                  onChange={e => setBody(e.target.value)} 
                  rows={3} 
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs text-slate-800 focus:outline-none focus:border-purple-500" 
                  placeholder="محتوى وتفاصيل الإشعار..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">اللون المميز</label>
                  <select 
                    value={colorTag} 
                    onChange={e => setColorTag(e.target.value as any)} 
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500"
                  >
                    <option value="blue">أزرق (عادي)</option>
                    <option value="green">أخضر (مكافأة)</option>
                    <option value="red">أحمر (هام)</option>
                    <option value="yellow">أصفر (تذكير)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">المستهدفين</label>
                  <select 
                    value={audience} 
                    onChange={e => setAudience(e.target.value as any)} 
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500"
                  >
                    <option value="all">الجميع (عام)</option>
                    <option value="deacons">الشمامسة فقط</option>
                    <option value="parents">أولياء الأمور فقط</option>
                    <option value="specific_user">مستخدم معين (شماس / ولي أمر / خادم)</option>
                  </select>
                </div>
              </div>

              {audience === 'specific_user' && (
                <div className="p-3 bg-purple-50/60 rounded-2xl border border-purple-200 space-y-1.5 animate-in fade-in">
                  <label className="block text-xs font-bold text-purple-900">اختر الشخص المستهدف للإشعار:</label>
                  <select
                    value={specificUserId}
                    onChange={e => setSpecificUserId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500"
                  >
                    <option value="">-- اختر المستخدم من القائمة --</option>
                    {allUsersList.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} (@{u.username}) - {u.role === 'deacon' ? 'شماس' : u.role === 'parent' ? 'ولي أمر' : u.role === 'assistant' ? 'خادم' : 'أدمن'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 space-y-3">
                <button 
                  type="button"
                  onClick={handleSendInstant}
                  disabled={sendingInstant || !title.trim() || !body.trim()} 
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs py-3 rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50"
                >
                  {sendingInstant ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  إرسال فوري الآن للوارد 🚀
                </button>

                <div className="text-center text-[10px] text-slate-400 font-bold">— أو حدد موعداً للجدولة —</div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ الجدولة</label>
                    <input 
                      type="date" 
                      value={sendDate} 
                      onChange={e => setSendDate(e.target.value)} 
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">وقت الجدولة</label>
                    <input 
                      type="time" 
                      value={sendTime} 
                      onChange={e => setSendTime(e.target.value)} 
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500" 
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={loadingSchedule || !title.trim() || !body.trim() || !sendDate || !sendTime} 
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs py-3 rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-purple-600/20 transition-all disabled:opacity-50"
                >
                  {loadingSchedule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                  حفظ الجدولة الآلية
                </button>
              </div>
            </form>
          </div>

          <div className="lg:col-span-2 space-y-3">
            <h3 className="font-extrabold text-slate-800 text-base">قائمة الإشعارات المجدولة / المرسلة</h3>
            {scheduled.map(notif => (
              <div key={notif.id} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex gap-3.5">
                  <div className={`w-2.5 rounded-full ${notif.colorTag === 'red' ? 'bg-red-500' : notif.colorTag === 'green' ? 'bg-green-500' : notif.colorTag === 'yellow' ? 'bg-yellow-500' : 'bg-blue-500'}`}></div>
                  <div className="space-y-1">
                    <h4 className="font-extrabold text-slate-800 text-sm">{notif.title}</h4>
                    <p className="text-xs text-slate-600">{notif.body}</p>
                    <p className="text-[11px] text-slate-400 font-medium">
                      موعد الإرسال: {new Date(notif.sendAt).toLocaleString('ar-EG', { dateStyle: 'long', timeStyle: 'short' })}
                      <span className="mx-2">•</span>
                      المستهدف: {notif.audience === 'all' ? 'الجميع' : notif.audience === 'deacons' ? 'الشمامسة' : 'أولياء الأمور'}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-left">
                  {notif.sent ? (
                    <span className="inline-block bg-emerald-100 text-emerald-800 px-3 py-1 rounded-xl text-xs font-bold">
                      ✓ تم الإرسال
                    </span>
                  ) : (
                    <span className="inline-block bg-amber-100 text-amber-800 px-3 py-1 rounded-xl text-xs font-bold">
                      ⏳ مجدول للانتظار
                    </span>
                  )}
                </div>
              </div>
            ))}
            {scheduled.length === 0 && (
              <div className="text-center p-12 bg-white rounded-3xl text-slate-400 border border-slate-200 border-dashed text-xs">
                لا توجد إشعارات مجدولة.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
