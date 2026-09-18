import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Quiz, QuizQuestion, QuizSubmission, QuizSubmissionAnswer } from '../../types';
import { 
  Clock, Award, CheckCircle2, XCircle, AlertTriangle, 
  HelpCircle, Volume2, Play, ArrowRight, Loader2, Sparkles, Check 
} from 'lucide-react';

export const QuizTaker: React.FC = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const { userData } = useAuth();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [alreadySubmitted, setAlreadySubmitted] = useState<QuizSubmission | null>(null);

  // Active quiz state
  const [answers, setAnswers] = useState<Record<string, QuizSubmissionAnswer>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeftTotal, setTimeLeftTotal] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultSubmission, setResultSubmission] = useState<QuizSubmission | null>(null);

  // Load Quiz & Check previous submission
  useEffect(() => {
    if (!quizId) return;

    const fetchQuizAndSubmission = async () => {
      try {
        const quizDoc = await getDoc(doc(db, 'quizzes', quizId));
        if (!quizDoc.exists()) {
          alert('هذا الامتحان غير موجود');
          navigate('/quizzes');
          return;
        }
        const data = { id: quizDoc.id, ...quizDoc.data() } as Quiz;
        setQuiz(data);

        // Set total timer if configured
        if (data.timeLimitMinutes && data.timeLimitMinutes > 0) {
          setTimeLeftTotal(data.timeLimitMinutes * 60);
        }

        // Check if user already submitted
        if (userData?.id) {
          const subDoc = await getDoc(doc(db, 'quiz_submissions', `${quizId}_${userData.id}`));
          if (subDoc.exists()) {
            setAlreadySubmitted(subDoc.data() as QuizSubmission);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchQuizAndSubmission();
  }, [quizId, userData, navigate]);

  // Overall Countdown Timer
  useEffect(() => {
    if (timeLeftTotal === null || timeLeftTotal <= 0 || alreadySubmitted || resultSubmission) return;

    const timer = setInterval(() => {
      setTimeLeftTotal(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          handleSubmitAnswers(true); // Auto-submit on time up
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeftTotal, alreadySubmitted, resultSubmission]);

  const handleSelectOption = (question: QuizQuestion, optId: string) => {
    const qId = question.id;
    const current = answers[qId] || { questionId: qId, awardedPoints: 0 };

    if (question.type === 'single_choice' || question.type === 'true_false' || question.type === 'audio_identify') {
      setAnswers({
        ...answers,
        [qId]: {
          ...current,
          selectedOptionIds: [optId]
        }
      });
    } else if (question.type === 'multiple_choice') {
      const selected = current.selectedOptionIds || [];
      const updated = selected.includes(optId)
        ? selected.filter(id => id !== optId)
        : [...selected, optId];
      setAnswers({
        ...answers,
        [qId]: {
          ...current,
          selectedOptionIds: updated
        }
      });
    }
  };

  const handleTextAnswerChange = (question: QuizQuestion, text: string) => {
    const qId = question.id;
    const current = answers[qId] || { questionId: qId, awardedPoints: 0 };
    setAnswers({
      ...answers,
      [qId]: {
        ...current,
        textAnswer: text
      }
    });
  };

  const handleSubmitAnswers = async (forcedByTimer: boolean = false) => {
    if (!quiz || !userData) return;
    if (!forcedByTimer && !confirm('هل أنت متأكد من تسليم إجابات الامتحان؟ لا يمكن التعديل بعد التسليم.')) {
      return;
    }

    setIsSubmitting(true);
    try {
      let earnedPoints = 0;
      const evaluatedAnswers: Record<string, QuizSubmissionAnswer> = {};

      // Grade automatically
      quiz.questions.forEach(q => {
        const deaconAns = answers[q.id];
        let isCorrect = false;
        let awarded = 0;

        if (q.type === 'single_choice' || q.type === 'true_false' || q.type === 'audio_identify') {
          const selected = deaconAns?.selectedOptionIds?.[0];
          const correct = q.correctOptionIds?.[0];
          if (selected && selected === correct) {
            isCorrect = true;
            awarded = q.points;
          }
        } else if (q.type === 'multiple_choice') {
          const selectedSet = new Set(deaconAns?.selectedOptionIds || []);
          const correctSet = new Set(q.correctOptionIds || []);
          const isEqual = selectedSet.size === correctSet.size && [...selectedSet].every(x => correctSet.has(x));
          if (isEqual) {
            isCorrect = true;
            awarded = q.points;
          }
        } else if (q.type === 'text_short') {
          const text = deaconAns?.textAnswer?.trim().toLowerCase();
          const target = q.correctTextAnswer?.trim().toLowerCase();
          if (text && target && text === target) {
            isCorrect = true;
            awarded = q.points;
          }
        }

        earnedPoints += awarded;
        evaluatedAnswers[q.id] = {
          questionId: q.id,
          selectedOptionIds: deaconAns?.selectedOptionIds || [],
          textAnswer: deaconAns?.textAnswer || '',
          isCorrect,
          awardedPoints: awarded
        };
      });

      const percentage = Math.round((earnedPoints / (quiz.totalPoints || 1)) * 100);
      const passed = percentage >= quiz.passingPercentage;
      const pointsToAward = passed ? (quiz.pointsReward || 0) : 0;

      const submission: QuizSubmission = {
        id: `${quiz.id}_${userData.id}`,
        quizId: quiz.id,
        quizTitle: quiz.title,
        deaconId: userData.id,
        deaconName: userData.fullName || userData.username,
        groupId: userData.groupId || quiz.groupId,
        score: earnedPoints,
        totalPoints: quiz.totalPoints,
        percentage,
        passed,
        pointsAwarded: pointsToAward,
        submittedAt: new Date().toISOString(),
        answers: evaluatedAnswers
      };

      // Save submission
      await setDoc(doc(db, 'quiz_submissions', submission.id), submission);

      // Award points directly to deacon if passed
      if (pointsToAward > 0) {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        await addDoc(collection(db, 'point_logs'), {
          deaconId: userData.id,
          groupId: userData.groupId || quiz.groupId,
          reason: `اجتياز امتحان: ${quiz.title} (${percentage}%)`,
          points: pointsToAward,
          date: now.toISOString(),
          addedBy: 'system_quiz',
          monthKey,
          activityTypeId: 'quiz'
        });
      }

      setResultSubmission(submission);
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء حفظ النتيجة');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600" />
        <p className="mt-3 font-bold">جاري تحميل أسئلة الامتحان...</p>
      </div>
    );
  }

  if (!quiz) return null;

  // View Results screen (if already submitted or just finished)
  const displayResult = resultSubmission || alreadySubmitted;
  if (displayResult) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in pb-16">
        <div className={`p-8 rounded-3xl border shadow-xl text-center space-y-4 ${
          displayResult.passed 
            ? 'bg-gradient-to-b from-emerald-500 to-teal-700 text-white border-emerald-400' 
            : 'bg-gradient-to-b from-rose-500 to-rose-700 text-white border-rose-400'
        }`}>
          <div className="w-16 h-16 rounded-3xl bg-white/20 backdrop-blur-md mx-auto flex items-center justify-center border border-white/30 shadow-inner">
            {displayResult.passed ? <Award className="w-10 h-10 text-amber-300" /> : <AlertTriangle className="w-10 h-10 text-white" />}
          </div>

          <div>
            <h1 className="text-2xl md:text-3xl font-black">
              {displayResult.passed ? 'مبروك! لقد اجتزت الامتحان بنجاح' : 'لم تجتز الامتحان هذه المرة'}
            </h1>
            <p className="text-white/80 text-sm mt-1">{quiz.title}</p>
          </div>

          <div className="flex items-center justify-center gap-6 py-2">
            <div className="bg-white/10 backdrop-blur-xs px-4 py-2 rounded-2xl border border-white/20">
              <span className="text-xs text-white/70 block">الدرجة النهائية</span>
              <span className="text-2xl font-black">{displayResult.score} / {displayResult.totalPoints}</span>
            </div>
            <div className="bg-white/10 backdrop-blur-xs px-4 py-2 rounded-2xl border border-white/20">
              <span className="text-xs text-white/70 block">النسبة المئوية</span>
              <span className="text-2xl font-black">{displayResult.percentage}%</span>
            </div>
            {displayResult.pointsAwarded > 0 && (
              <div className="bg-amber-400 text-amber-950 px-4 py-2 rounded-2xl shadow-lg font-black">
                <span className="text-xs block text-amber-900">النقاط المكتسبة</span>
                <span className="text-2xl">+{displayResult.pointsAwarded}</span>
              </div>
            )}
          </div>
        </div>

        {/* Model Answers Review */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <h2 className="font-bold text-lg text-slate-900 border-b pb-3 border-slate-100">
            مراجعة الإجابات والنموذج الصحيح:
          </h2>

          <div className="space-y-5">
            {quiz.questions.map((q, idx) => {
              const deaconAns = displayResult.answers?.[q.id];
              const isCorrect = deaconAns?.isCorrect;

              return (
                <div
                  key={q.id}
                  className={`p-4 rounded-2xl border ${
                    isCorrect ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-bold text-slate-800 text-sm">
                      {idx + 1}. {q.prompt}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {isCorrect ? `+${q.points} درجات` : '0 درجة'}
                    </span>
                  </div>

                  {/* Options status */}
                  {q.options && (
                    <div className="space-y-1.5 pt-2">
                      {q.options.map(opt => {
                        const wasChosen = deaconAns?.selectedOptionIds?.includes(opt.id);
                        const isTheCorrectOpt = q.correctOptionIds?.includes(opt.id);

                        let badgeClass = 'text-slate-600 bg-white border border-slate-200';
                        if (isTheCorrectOpt) badgeClass = 'text-emerald-800 bg-emerald-100 border border-emerald-300 font-bold';
                        else if (wasChosen && !isTheCorrectOpt) badgeClass = 'text-rose-800 bg-rose-100 border border-rose-300 line-through';

                        return (
                          <div key={opt.id} className={`px-3 py-1.5 rounded-xl text-xs flex items-center justify-between ${badgeClass}`}>
                            <span>{opt.text}</span>
                            {isTheCorrectOpt && <span className="text-[10px] text-emerald-700 font-bold">(الإجابة الصحيحة)</span>}
                            {wasChosen && !isTheCorrectOpt && <span className="text-[10px] text-rose-700">(إجابتك الخاطئة)</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.explanation && (
                    <p className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-200/50 flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      <span>{q.explanation}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-center pt-2">
          <button
            onClick={() => navigate('/quizzes')}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl text-xs shadow-md transition-all"
          >
            العودة لقائمة الاختبارات
          </button>
        </div>
      </div>
    );
  }

  // Active Quiz Taker
  const currentQ = quiz.questions[currentQuestionIndex];
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      {/* Top Header Card with Timer */}
      <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-slate-900 text-base md:text-lg">{quiz.title}</h1>
          <span className="text-xs text-slate-400">
            السؤال {currentQuestionIndex + 1} من {quiz.questions.length}
          </span>
        </div>

        {timeLeftTotal !== null && (
          <div className="flex items-center gap-2 bg-purple-50 text-purple-900 px-4 py-2 rounded-2xl border border-purple-200 font-mono font-bold text-sm shadow-xs">
            <Clock className="w-4 h-4 text-purple-600 animate-pulse" />
            <span dir="ltr">{formatTime(timeLeftTotal)}</span>
          </div>
        )}
      </div>

      {/* Current Question Card */}
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-md space-y-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base md:text-lg font-black text-slate-900 leading-relaxed">
            {currentQuestionIndex + 1}. {currentQ.prompt}
          </h2>
          <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full whitespace-nowrap">
            {currentQ.points} درجات
          </span>
        </div>

        {/* Audio Player for audio_identify */}
        {currentQ.audioUrl && (
          <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-emerald-700" />
              <span className="text-xs font-bold text-emerald-900">استمع للمقطع الصوتي المطلوب:</span>
            </div>
            <audio controls src={currentQ.audioUrl} className="h-9 max-w-[200px]" />
          </div>
        )}

        {/* Options */}
        {currentQ.options && (
          <div className="space-y-3 pt-2">
            {currentQ.options.map(opt => {
              const selected = (answers[currentQ.id]?.selectedOptionIds || []).includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectOption(currentQ, opt.id)}
                  className={`w-full p-4 rounded-2xl border text-right transition-all flex items-center justify-between gap-3 ${
                    selected
                      ? 'border-purple-600 bg-purple-50/70 text-purple-950 font-bold shadow-xs'
                      : 'border-slate-200 hover:border-purple-300 text-slate-700 bg-slate-50/50'
                  }`}
                >
                  <span className="text-sm">{opt.text}</span>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                      selected ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-300'
                    }`}
                  >
                    {selected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Text short input */}
        {currentQ.type === 'text_short' && (
          <div>
            <input
              type="text"
              placeholder="اكتب إجابتك هنا..."
              value={answers[currentQ.id]?.textAnswer || ''}
              onChange={e => handleTextAnswerChange(currentQ, e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:border-purple-500"
            />
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          disabled={currentQuestionIndex === 0}
          onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs disabled:opacity-30 disabled:pointer-events-none"
        >
          السؤال السابق
        </button>

        {currentQuestionIndex < quiz.questions.length - 1 ? (
          <button
            type="button"
            onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold rounded-xl text-xs shadow-md transition-all"
          >
            السؤال التالي
          </button>
        ) : (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSubmitAnswers(false)}
            className="px-7 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black rounded-xl text-xs shadow-lg transition-all flex items-center gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>إنهاء وتسليم الامتحان</span>
          </button>
        )}
      </div>
    </div>
  );
};
