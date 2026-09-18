import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Quiz, QuizQuestion, ChorusGroup, StudySubject } from '../../types';
import { initDefaultChoruses } from '../../utils/chorusHelper';
import { 
  FileQuestion, Plus, Trash2, Edit2, Clock, Calendar, CheckCircle2, 
  Award, Eye, Users, AlertCircle, Sparkles, Copy, Loader2, Play
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const QuizManager: React.FC = () => {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const isAdminOrAssistant = userData?.role === 'admin' || userData?.role === 'assistant';

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [choruses, setChoruses] = useState<ChorusGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChorus, setSelectedChorus] = useState<string>('all');
  const [successMsg, setSuccessMsg] = useState('');

  // Load choruses
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'chorus_groups'), (snap) => {
      if (!snap.empty) {
        setChoruses(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChorusGroup)));
      } else {
        initDefaultChoruses().then(setChoruses);
      }
    });
    return () => unsub();
  }, []);

  // Set default chorus filter for deacons
  useEffect(() => {
    if (userData?.role === 'deacon' && userData?.groupId) {
      setSelectedChorus(userData.groupId);
    }
  }, [userData]);

  // Load quizzes
  useEffect(() => {
    const q = query(collection(db, 'quizzes'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Quiz));
      setQuizzes(list);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredQuizzes = quizzes.filter(q => {
    if (selectedChorus !== 'all' && q.groupId !== 'all' && q.groupId !== selectedChorus) {
      return false;
    }
    return true;
  });

  const handleDelete = async (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا الاختبار؟ سيتم مسح بياناته بالكامل.')) {
      try {
        await deleteDoc(doc(db, 'quizzes', id));
        setSuccessMsg('تم حذف الاختبار بنجاح');
        setTimeout(() => setSuccessMsg(''), 3000);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleToggleActive = async (quiz: Quiz) => {
    try {
      await updateDoc(doc(db, 'quizzes', quiz.id), {
        active: !quiz.active
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Status check for scheduled quiz
  const getQuizStatus = (quiz: Quiz) => {
    if (!quiz.active) return { text: 'مغلق مؤقتاً', color: 'bg-slate-100 text-slate-500' };
    const now = new Date();
    if (quiz.startDate && new Date(quiz.startDate) > now) {
      return { text: 'لم يبدأ بعد (مجدول)', color: 'bg-amber-100 text-amber-800' };
    }
    if (quiz.endDate && new Date(quiz.endDate) < now) {
      return { text: 'انتهى موعد التقديم', color: 'bg-rose-100 text-rose-800' };
    }
    return { text: 'متاح للتقديم الآن', color: 'bg-emerald-100 text-emerald-800' };
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-700 p-6 md:p-8 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-inner">
            <FileQuestion className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black">منصة الاختبارات التفاعلية (Quizzes)</h1>
            <p className="text-purple-100 text-sm mt-1">
              امتحانات مجدولة ومؤقتة بمواصفات Google Forms، تصحيح تلقائي، وإضافة فورية لنقاط الشماس
            </p>
          </div>
        </div>

        {isAdminOrAssistant && (
          <button
            onClick={() => navigate('/quizzes/create')}
            className="px-5 py-3 bg-white text-purple-800 font-bold rounded-2xl shadow-lg hover:bg-purple-50 active:scale-95 transition-all flex items-center justify-center gap-2 self-start md:self-auto"
          >
            <Plus className="w-5 h-5" />
            <span>إنشاء امتحان جديد</span>
          </button>
        )}
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl flex items-center gap-2 font-bold shadow-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Filter by Chorus */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full max-w-sm">
          <label className="text-xs font-bold text-slate-500 whitespace-nowrap">تصفية حسب الخورس:</label>
          <select
            value={selectedChorus}
            onChange={e => setSelectedChorus(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-purple-500"
          >
            <option value="all">جميع الخوارس والاختبارات العامة</option>
            {choruses.map(c => (
              <option key={c.id} value={c.id}>{c.name} (الخورس {c.order})</option>
            ))}
          </select>
        </div>

        <span className="text-xs text-slate-400 font-bold">
          إجمالي الامتحانات: {filteredQuizzes.length}
        </span>
      </div>

      {/* Quizzes List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600" />
          <p className="mt-3 font-bold">جاري تحميل منصة الاختبارات...</p>
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-3xl border border-slate-100 shadow-sm">
          <FileQuestion className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-bold text-base">لا توجد اختبارات متاحة حالياً لهذا الخورس</p>
          <p className="text-slate-400 text-xs mt-1">يقوم الخدام بجدولة الامتحانات ومسابقات الألحان دورياً</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredQuizzes.map((quiz) => {
            const status = getQuizStatus(quiz);
            const chorusObj = choruses.find(c => c.id === quiz.groupId);
            const isAvailable = status.text === 'متاح للتقديم الآن';

            return (
              <div
                key={quiz.id}
                className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {quiz.groupId === 'all' ? 'عام لجميع الخوارس' : (chorusObj?.name || quiz.groupId)}
                    </span>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${status.color}`}>
                      {status.text}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-lg leading-snug mb-2">{quiz.title}</h3>
                  {quiz.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-4">
                      {quiz.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl mb-4 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-purple-600" />
                      <span>{quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} دقيقة` : 'بدون مؤقت إجمالي'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-amber-500" />
                      <span>+{quiz.pointsReward} نقطة للمجتاز</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <FileQuestion className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{quiz.questions?.length || 0} أسئلة</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span>النجاح من {quiz.passingPercentage}%</span>
                    </div>
                  </div>

                  {quiz.startDate && (
                    <p className="text-[11px] text-slate-400 mb-2 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>من: {new Date(quiz.startDate).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </p>
                  )}
                  {quiz.endDate && (
                    <p className="text-[11px] text-slate-400 mb-4 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>حتى: {new Date(quiz.endDate).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  {/* Deacon action: Take quiz */}
                  {userData?.role === 'deacon' ? (
                    <button
                      onClick={() => navigate(`/quizzes/${quiz.id}`)}
                      disabled={!isAvailable}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 ${
                        isAvailable
                          ? 'bg-purple-600 hover:bg-purple-700 active:scale-95 text-white'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>{isAvailable ? 'بدء أداء الامتحان الآن' : status.text}</span>
                    </button>
                  ) : (
                    // Servant/Admin Actions
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/quizzes/${quiz.id}/results`)}
                          className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-xl font-bold text-xs hover:bg-purple-100 flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>كشف الدرجات</span>
                        </button>
                        <button
                          onClick={() => navigate(`/quizzes/${quiz.id}`)}
                          className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold"
                          title="معاينة الامتحان"
                        >
                          معاينة
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleActive(quiz)}
                          className={`text-xs px-2 py-1 rounded-lg border font-bold ${
                            quiz.active ? 'border-amber-200 text-amber-700' : 'border-emerald-200 text-emerald-700'
                          }`}
                        >
                          {quiz.active ? 'تعطيل' : 'تفعيل'}
                        </button>
                        <button
                          onClick={() => handleDelete(quiz.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
