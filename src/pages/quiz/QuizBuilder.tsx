import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Quiz, QuizQuestion, QuestionType, ChorusGroup, StudySubject } from '../../types';
import { initDefaultChoruses } from '../../utils/chorusHelper';
import { useNavigate } from 'react-router-dom';
import { 
  FileQuestion, Plus, Trash2, Clock, Award, Calendar, 
  HelpCircle, Image, Music, Check, CheckCircle2, ArrowRight, Loader2 
} from 'lucide-react';

export const QuizBuilder: React.FC = () => {
  const { userData } = useAuth();
  const navigate = useNavigate();

  const [choruses, setChoruses] = useState<ChorusGroup[]>([]);
  const [saving, setSaving] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [groupId, setGroupId] = useState('all');
  const [subject, setSubject] = useState<StudySubject>('hymns');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(15);
  const [passingPercentage, setPassingPercentage] = useState<number>(60);
  const [pointsReward, setPointsReward] = useState<number>(50);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);

  // Questions List
  const [questions, setQuestions] = useState<QuizQuestion[]>([
    {
      id: 'q_1',
      type: 'single_choice',
      prompt: 'ما هو المرد الذي يقال في ختام صلوات رفع بخور عشية وباكر؟',
      points: 5,
      timerSeconds: 30,
      options: [
        { id: 'opt_1', text: 'أمين الليلويا' },
        { id: 'opt_2', text: 'بركتهم المقدسة فلتكن معنا' },
        { id: 'opt_3', text: 'المسيح إلهنا هو يباركنا' },
        { id: 'opt_4', text: 'كيرياليسون' }
      ],
      correctOptionIds: ['opt_1'],
      explanation: 'المرد الختامي المعروف هو أمين الليلويا'
    }
  ]);

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

  const handleAddQuestion = (type: QuestionType = 'single_choice') => {
    const newQ: QuizQuestion = {
      id: `q_${Date.now()}`,
      type: type,
      prompt: '',
      points: 5,
      timerSeconds: 0,
      options: type === 'true_false' 
        ? [{ id: 'opt_true', text: 'صح' }, { id: 'opt_false', text: 'خطأ' }]
        : [
            { id: `opt_${Date.now()}_1`, text: 'الخيار الأول' },
            { id: `opt_${Date.now()}_2`, text: 'الخيار الثاني' },
            { id: `opt_${Date.now()}_3`, text: 'الخيار الثالث' }
          ],
      correctOptionIds: type === 'true_false' ? ['opt_true'] : [`opt_${Date.now()}_1`],
      explanation: ''
    };
    setQuestions([...questions, newQ]);
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length === 1) {
      alert('يجب أن يحتوي الامتحان على سؤال واحد على الأقل');
      return;
    }
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleUpdateQuestion = (index: number, updates: Partial<QuizQuestion>) => {
    const next = [...questions];
    next[index] = { ...next[index], ...updates };
    setQuestions(next);
  };

  const handleAddOption = (qIndex: number) => {
    const q = questions[qIndex];
    if (!q.options) return;
    const newOpt = {
      id: `opt_${Date.now()}_${q.options.length + 1}`,
      text: `خيار ${q.options.length + 1}`
    };
    handleUpdateQuestion(qIndex, { options: [...q.options, newOpt] });
  };

  const handleRemoveOption = (qIndex: number, optId: string) => {
    const q = questions[qIndex];
    if (!q.options || q.options.length <= 2) {
      alert('يجب أن يتوفر خياران على الأقل');
      return;
    }
    const filtered = q.options.filter(o => o.id !== optId);
    const correctNext = (q.correctOptionIds || []).filter(id => id !== optId);
    handleUpdateQuestion(qIndex, { 
      options: filtered, 
      correctOptionIds: correctNext.length > 0 ? correctNext : [filtered[0].id] 
    });
  };

  const handleToggleCorrectOption = (qIndex: number, optId: string) => {
    const q = questions[qIndex];
    if (q.type === 'single_choice' || q.type === 'true_false' || q.type === 'audio_identify') {
      handleUpdateQuestion(qIndex, { correctOptionIds: [optId] });
    } else if (q.type === 'multiple_choice') {
      const current = q.correctOptionIds || [];
      const exists = current.includes(optId);
      const next = exists ? current.filter(id => id !== optId) : [...current, optId];
      handleUpdateQuestion(qIndex, { correctOptionIds: next.length > 0 ? next : [optId] });
    }
  };

  const totalQuizPoints = questions.reduce((sum, q) => sum + (q.points || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('يرجى كتابة عنوان الامتحان');
      return;
    }

    // Validation
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].prompt.trim()) {
        alert(`السؤال رقم ${i + 1} لا يحتوي على نص سؤال`);
        return;
      }
    }

    setSaving(true);
    try {
      const newQuiz: Omit<Quiz, 'id'> = {
        title: title.trim(),
        description: description.trim(),
        groupId,
        subject,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        timeLimitMinutes: Number(timeLimitMinutes) || 0,
        passingPercentage: Number(passingPercentage) || 60,
        pointsReward: Number(pointsReward) || 0,
        shuffleQuestions,
        showResultsImmediately: true,
        showCorrectAnswers: true,
        questions,
        totalPoints: totalQuizPoints,
        active: true,
        createdBy: userData?.id || 'admin',
        createdByName: userData?.fullName || 'الخادم المسؤول',
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'quizzes'), newQuiz);
      alert('تم إنشاء الامتحان بنجاح ونشره للشمامسة!');
      navigate('/quizzes');
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء حفظ الامتحان');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/quizzes')}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold text-sm"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لمنصة الاختبارات</span>
        </button>

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold rounded-2xl shadow-lg transition-all flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>نشر وتفعيل الامتحان</span>
        </button>
      </div>

      {/* Main Form Info Card (Google Forms Style) */}
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-purple-100 shadow-md space-y-5 border-t-8 border-t-purple-600">
        <div>
          <input
            type="text"
            required
            placeholder="عنوان الامتحان (مثال: اختبار لحن القيامة وطقس القداس)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full text-2xl md:text-3xl font-black text-slate-900 placeholder:text-slate-300 border-b border-slate-200 pb-2 focus:outline-none focus:border-purple-600"
          />
        </div>

        <div>
          <textarea
            rows={2}
            placeholder="وصف الامتحان والتعليمات الموجهة للشمامسة..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full text-sm text-slate-600 placeholder:text-slate-400 border-b border-slate-200 pb-2 focus:outline-none focus:border-purple-600"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الخورس المستهدف *</label>
            <select
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-purple-500"
            >
              <option value="all">متاح لجميع الخوارس</option>
              {choruses.map(c => (
                <option key={c.id} value={c.id}>{c.name} (الخورس {c.order})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">المادة والتصنيف</label>
            <select
              value={subject}
              onChange={e => setSubject(e.target.value as StudySubject)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-purple-500"
            >
              <option value="hymns">الألحان والمردات</option>
              <option value="rituals">الطقس الكنسي</option>
              <option value="coptic">اللغة القبطية</option>
              <option value="bible">الكتاب المقدس</option>
              <option value="creed">العقيدة</option>
              <option value="patrology">سير الآباء</option>
              <option value="spiritual">روحيات</option>
            </select>
          </div>
        </div>

        {/* Timing & Gamification Settings */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 bg-purple-50/50 p-4 rounded-2xl border border-purple-100">
          <div>
            <label className="block text-[11px] font-bold text-purple-900 mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-purple-600" />
              <span>مؤقت كلي (دقائق)</span>
            </label>
            <input
              type="number"
              min={0}
              value={timeLimitMinutes}
              onChange={e => setTimeLimitMinutes(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-1.5 bg-white border border-purple-200 rounded-xl text-xs font-bold text-slate-800"
              placeholder="0 = بدون مؤقت"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-purple-900 mb-1 flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              <span>مكافأة النقاط للشماس</span>
            </label>
            <input
              type="number"
              min={0}
              value={pointsReward}
              onChange={e => setPointsReward(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-1.5 bg-white border border-purple-200 rounded-xl text-xs font-bold text-slate-800"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-purple-900 mb-1">نسبة النجاح %</label>
            <input
              type="number"
              min={10}
              max={100}
              value={passingPercentage}
              onChange={e => setPassingPercentage(parseInt(e.target.value, 10) || 60)}
              className="w-full px-3 py-1.5 bg-white border border-purple-200 rounded-xl text-xs font-bold text-slate-800"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-purple-900 mb-1">إجمالي الدرجات</label>
            <div className="w-full px-3 py-1.5 bg-white border border-purple-200 rounded-xl text-xs font-black text-purple-700">
              {totalQuizPoints} درجة
            </div>
          </div>
        </div>

        {/* Schedule Dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-purple-600" />
              <span>موعد وتاريخ بدء الامتحان (اختياري)</span>
            </label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-rose-500" />
              <span>موعد إغلاق الامتحان النهائي (اختياري)</span>
            </label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Questions Header & Add Bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <span>أسئلة الامتحان</span>
          <span className="text-sm font-normal text-slate-400">({questions.length} سؤال)</span>
        </h2>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleAddQuestion('single_choice')}
            className="px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>سؤال اختياري</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddQuestion('true_false')}
            className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>صح وخطأ</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddQuestion('audio_identify')}
            className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
          >
            <Music className="w-3.5 h-3.5" />
            <span>سؤال استماع لحن</span>
          </button>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        {questions.map((q, qIndex) => (
          <div
            key={q.id}
            className="bg-white p-5 md:p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 hover:border-purple-300 transition-all"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-xl bg-purple-600 text-white font-black text-xs flex items-center justify-center">
                  {qIndex + 1}
                </span>
                <select
                  value={q.type}
                  onChange={e => handleUpdateQuestion(qIndex, { type: e.target.value as QuestionType })}
                  className="px-3 py-1 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                >
                  <option value="single_choice">اختيار من متعدد (إجابة واحدة)</option>
                  <option value="multiple_choice">مربعات اختيار (إجابات متعددة)</option>
                  <option value="true_false">صح أو خطأ</option>
                  <option value="audio_identify">استماع مقطع لحن وتحديد الإجابة</option>
                  <option value="text_short">إجابة نصية قصيرة</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                {/* Per-Question Timer */}
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <input
                    type="number"
                    min={0}
                    value={q.timerSeconds || 0}
                    onChange={e => handleUpdateQuestion(qIndex, { timerSeconds: parseInt(e.target.value, 10) || 0 })}
                    placeholder="مؤقت السؤال"
                    className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-center"
                    title="مؤقت خاص بالسؤال بالثواني (0 = بدون مؤقت)"
                  />
                  <span className="text-[10px] text-slate-400">ثانية</span>
                </div>

                {/* Question Points */}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={q.points}
                    onChange={e => handleUpdateQuestion(qIndex, { points: parseInt(e.target.value, 10) || 1 })}
                    className="w-12 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-center text-purple-700"
                  />
                  <span className="text-[10px] text-slate-400 font-bold">درجات</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveQuestion(qIndex)}
                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                  title="حذف السؤال"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Prompt */}
            <div>
              <input
                type="text"
                required
                placeholder="نص السؤال (مثال: ما هو اسم الربع الذي يقال بعد ذكصولوجية القديسة مريم؟)"
                value={q.prompt}
                onChange={e => handleUpdateQuestion(qIndex, { prompt: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Audio URL if audio_identify */}
            {q.type === 'audio_identify' && (
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex items-center gap-3">
                <Music className="w-5 h-5 text-emerald-600 shrink-0" />
                <input
                  type="url"
                  placeholder="رابط التسجيل الصوتي المسموع (MP3 URL) ليستمع إليه الشماس أثناء السؤال..."
                  value={q.audioUrl || ''}
                  onChange={e => handleUpdateQuestion(qIndex, { audioUrl: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-mono"
                  dir="ltr"
                />
              </div>
            )}

            {/* Options List */}
            {q.type !== 'text_short' && q.options && (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] font-bold text-slate-400">
                  حدد الإجابة الصحيحة بالضغط على الدائرة/المربع الأخضر:
                </p>
                {q.options.map((opt, optIndex) => {
                  const isCorrect = (q.correctOptionIds || []).includes(opt.id);
                  return (
                    <div key={opt.id} className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleCorrectOption(qIndex, opt.id)}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                          isCorrect
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'border-slate-300 hover:border-emerald-400'
                        }`}
                        title={isCorrect ? 'إجابة صحيحة' : 'تعيين كإجابة صحيحة'}
                      >
                        {isCorrect && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>

                      <input
                        type="text"
                        value={opt.text}
                        onChange={e => {
                          const updated = [...q.options!];
                          updated[optIndex] = { ...opt, text: e.target.value };
                          handleUpdateQuestion(qIndex, { options: updated });
                        }}
                        className={`flex-1 px-3 py-1.5 bg-slate-50 border rounded-xl text-xs focus:outline-none ${
                          isCorrect ? 'border-emerald-300 bg-emerald-50/40 font-bold' : 'border-slate-200'
                        }`}
                      />

                      {q.type !== 'true_false' && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(qIndex, opt.id)}
                          className="text-slate-300 hover:text-rose-500 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}

                {q.type !== 'true_false' && (
                  <button
                    type="button"
                    onClick={() => handleAddOption(qIndex)}
                    className="text-xs font-bold text-purple-600 hover:text-purple-800 pt-1 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة خيار آخر</span>
                  </button>
                )}
              </div>
            )}

            {/* Explanation / Model Answer */}
            <div>
              <input
                type="text"
                placeholder="تفسير أو شرح الإجابة الصحيحة (يظهر للشماس بعد انتهاء الامتحان كفائدة تعليمية)..."
                value={q.explanation || ''}
                onChange={e => handleUpdateQuestion(qIndex, { explanation: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-500 focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Floating Add Bottom Bar */}
      <div className="pt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => handleAddQuestion('single_choice')}
          className="px-5 py-3 bg-purple-100 hover:bg-purple-200 text-purple-800 font-bold rounded-2xl text-xs transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة سؤال جديد</span>
        </button>
      </div>
    </form>
  );
};
