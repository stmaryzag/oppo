import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Quiz, QuizSubmission, ChorusGroup } from '../../types';
import { initDefaultChoruses } from '../../utils/chorusHelper';
import { 
  FileQuestion, ArrowRight, Award, CheckCircle2, XCircle, 
  Users, Download, Search, Filter, Loader2, Sparkles 
} from 'lucide-react';

export const QuizResults: React.FC = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [submissions, setSubmissions] = useState<QuizSubmission[]>([]);
  const [choruses, setChoruses] = useState<ChorusGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChorus, setSelectedChorus] = useState('all');

  useEffect(() => {
    initDefaultChoruses().then(setChoruses);

    const loadData = async () => {
      if (!quizId) return;
      try {
        const quizDoc = await getDoc(doc(db, 'quizzes', quizId));
        if (quizDoc.exists()) {
          setQuiz({ id: quizDoc.id, ...quizDoc.data() } as Quiz);
        }

        const q = query(
          collection(db, 'quiz_submissions'),
          where('quizId', '==', quizId)
        );
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as QuizSubmission));
        // Sort descending by score
        list.sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
        setSubmissions(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [quizId]);

  const filteredSubmissions = submissions.filter(sub => {
    if (selectedChorus !== 'all' && sub.groupId !== selectedChorus) return false;
    if (searchQuery.trim()) {
      const matchName = sub.deaconName?.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchName) return false;
    }
    return true;
  });

  const exportCSV = () => {
    if (!filteredSubmissions.length) return;
    const headers = ['اسم الشماس', 'الخورس', 'الدرجة', 'إجمالي الامتحان', 'النسبة المئوية', 'النتيجة', 'تاريخ التسليم'];
    const rows = filteredSubmissions.map(s => [
      `"${s.deaconName}"`,
      `"${s.groupId}"`,
      s.score,
      s.totalPoints,
      `${s.percentage}%`,
      s.passed ? 'ناجح' : 'راسب',
      `"${new Date(s.submittedAt).toLocaleString('ar-EG')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `كشف_درجات_${quiz?.title || 'الامتحان'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600" />
        <p className="mt-3 font-bold">جاري تحميل كشوف الدرجات...</p>
      </div>
    );
  }

  const passedCount = submissions.filter(s => s.passed).length;
  const avgPercentage = submissions.length > 0
    ? Math.round(submissions.reduce((sum, s) => sum + s.percentage, 0) / submissions.length)
    : 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Back and Title Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/quizzes')}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold text-sm"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لقائمة الاختبارات</span>
        </button>

        <button
          onClick={exportCSV}
          disabled={filteredSubmissions.length === 0}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-2xl text-xs shadow-md transition-all flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          <span>تصدير كشف إكسل (CSV)</span>
        </button>
      </div>

      {/* Quiz Summary Stats */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <h1 className="text-2xl font-black text-slate-900">{quiz?.title}</h1>
        <p className="text-slate-500 text-xs">{quiz?.description || 'كشف إحصائيات ودرجات الشمامسة'}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          <div className="bg-purple-50 p-3.5 rounded-2xl border border-purple-100">
            <span className="text-xs text-purple-900 font-bold block">إجمالي المشاركين</span>
            <span className="text-2xl font-black text-purple-700">{submissions.length} شماس</span>
          </div>
          <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-100">
            <span className="text-xs text-emerald-900 font-bold block">عدد الناجحين</span>
            <span className="text-2xl font-black text-emerald-700">{passedCount}</span>
          </div>
          <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-100">
            <span className="text-xs text-amber-900 font-bold block">متوسط الدرجات</span>
            <span className="text-2xl font-black text-amber-700">{avgPercentage}%</span>
          </div>
          <div className="bg-indigo-50 p-3.5 rounded-2xl border border-indigo-100">
            <span className="text-xs text-indigo-900 font-bold block">مكافأة الشماس</span>
            <span className="text-2xl font-black text-indigo-700">+{quiz?.pointsReward || 0} نقطة</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-xs font-bold text-slate-500 whitespace-nowrap">الخورس:</label>
          <select
            value={selectedChorus}
            onChange={e => setSelectedChorus(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
          >
            <option value="all">جميع الخوارس</option>
            {choruses.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="relative w-full md:w-72">
          <input
            type="text"
            placeholder="بحث باسم الشماس..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
        </div>
      </div>

      {/* Submissions Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
              <tr>
                <th className="p-4">#</th>
                <th className="p-4">اسم الشماس</th>
                <th className="p-4">الخورس</th>
                <th className="p-4">الدرجة</th>
                <th className="p-4">النسبة</th>
                <th className="p-4">النقاط المضافة</th>
                <th className="p-4">الحالة</th>
                <th className="p-4">توقيت التسليم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredSubmissions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                    لا توجد إجابات مسجلة بعد لهذا الامتحان
                  </td>
                </tr>
              ) : (
                filteredSubmissions.map((sub, idx) => (
                  <tr key={sub.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-4 font-bold text-slate-400">{idx + 1}</td>
                    <td className="p-4 font-bold text-slate-900">{sub.deaconName}</td>
                    <td className="p-4 text-slate-500 font-mono text-[11px]">{sub.groupId}</td>
                    <td className="p-4 font-black text-purple-700">{sub.score} / {sub.totalPoints}</td>
                    <td className="p-4 font-black">{sub.percentage}%</td>
                    <td className="p-4 font-bold text-emerald-600">
                      {sub.pointsAwarded > 0 ? `+${sub.pointsAwarded}` : '0'}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] inline-flex items-center gap-1 ${
                        sub.passed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {sub.passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span>{sub.passed ? 'اجتاز بنجاح' : 'لم يجتز'}</span>
                      </span>
                    </td>
                    <td className="p-4 text-slate-400 text-[11px]">
                      {new Date(sub.submittedAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
