import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  Award, Plus, Trash2, Edit3, Check, X, 
  Sparkles, Star, AlertCircle, CheckCircle2, RotateCcw,
  Sliders, ShieldCheck, Flame, ChevronRight
} from 'lucide-react';
import { UserLevel } from '../../types';
import { DEFAULT_LEVELS, seedDefaultLevelsIfEmpty, calculateDeaconLevel } from '../../utils/levels';

export const ManageLevels = () => {
  const [levels, setLevels] = useState<UserLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State for Add / Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [levelNumber, setLevelNumber] = useState<number>(1);
  const [title, setTitle] = useState('');
  const [minPoints, setMinPoints] = useState<number>(0);
  const [badgeColor, setBadgeColor] = useState<string>('emerald');
  const [description, setDescription] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Sample points preview slider
  const [previewPoints, setPreviewPoints] = useState(75);

  useEffect(() => {
    // Listen to levels collection
    const unsub = onSnapshot(collection(db, 'levels'), (snap) => {
      if (snap.empty) {
        // Auto-seed defaults if totally empty
        seedDefaultLevelsIfEmpty();
      } else {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserLevel));
        list.sort((a, b) => a.levelNumber - b.levelNumber);
        setLevels(list);
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleSaveLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || minPoints < 0 || levelNumber < 1) {
      setErrorMsg('يرجى ملء جميع الحقول المطلوبة بشكل صحيح');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const docId = editingId || `level_${levelNumber}`;
      const payload: UserLevel = {
        levelNumber: Number(levelNumber),
        title: title.trim(),
        minPoints: Number(minPoints),
        badgeColor,
        description: description.trim()
      };

      await setDoc(doc(db, 'levels', docId), payload);

      setSuccessMsg(editingId ? 'تم تحديث المستوى بنجاح ✅' : 'تم إضافة المستوى الجديد بنجاح ✅');
      resetForm();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('تعذر حفظ المستوى: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (lvl: UserLevel) => {
    setEditingId(lvl.id || `level_${lvl.levelNumber}`);
    setLevelNumber(lvl.levelNumber);
    setTitle(lvl.title);
    setMinPoints(lvl.minPoints);
    setBadgeColor(lvl.badgeColor || 'blue');
    setDescription(lvl.description || '');
    setShowAddForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (lvl: UserLevel) => {
    if (levels.length <= 1) {
      alert('يجب الإبقاء على مستوى واحد على الأقل في النظام.');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من حذف ${lvl.title} (المستوى ${lvl.levelNumber})؟`)) return;

    try {
      const docId = lvl.id || `level_${lvl.levelNumber}`;
      await deleteDoc(doc(db, 'levels', docId));
      setSuccessMsg('تم حذف المستوى بنجاح');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('تعذر حذف المستوى: ' + err.message);
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('هل تريد استعادة المستويات الافتراضية الموصى بها؟')) return;
    setSaving(true);
    try {
      // Clear existing
      const snap = await getDocs(collection(db, 'levels'));
      for (const d of snap.docs) {
        await deleteDoc(doc(db, 'levels', d.id));
      }
      // Insert defaults
      for (const def of DEFAULT_LEVELS) {
        await setDoc(doc(db, 'levels', `level_${def.levelNumber}`), def);
      }
      setSuccessMsg('تم استعادة المستويات الافتراضية بنجاح ✅');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('تعذر الاستعادة: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setLevelNumber((levels[levels.length - 1]?.levelNumber || 0) + 1);
    setTitle('');
    setMinPoints((levels[levels.length - 1]?.minPoints || 0) + 50);
    setBadgeColor('blue');
    setDescription('');
    setShowAddForm(false);
  };

  const previewLevel = calculateDeaconLevel(previewPoints, levels);
  const previewProgress = Math.min(100, Math.round((previewPoints / previewLevel.nextLevelPoints) * 100));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 p-6 rounded-3xl shadow-md text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20">
              <Award className="w-8 h-8 text-amber-200" />
            </div>
            <div>
              <span className="inline-block px-3 py-0.5 bg-amber-500/30 text-amber-100 text-xs font-bold rounded-full mb-1">
                نظام الرتب والتحفيز الموحد
              </span>
              <h2 className="text-xl md:text-2xl font-black">إدارة مستويات ورتب الشمامسة (User Levels)</h2>
              <p className="text-xs text-amber-100/80 mt-0.5">
                تحديد مسميات المستويات والحد الأدنى للنقاط لكل مستوى لتطبيقها تلقائياً على كل الشمامسة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                resetForm();
                setShowAddForm(!showAddForm);
              }}
              className="px-4 py-2.5 bg-white text-amber-900 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm hover:bg-amber-50 transition-all"
            >
              <Plus className="w-4 h-4" />
              إضافة مستوى جديد
            </button>
            <button
              onClick={handleResetDefaults}
              className="px-3.5 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold flex items-center gap-2 backdrop-blur-md transition-all border border-white/20"
              title="استعادة الافتراضي"
            >
              <RotateCcw className="w-4 h-4" />
              الافتراضي
            </button>
          </div>
        </div>
      </div>

      {/* Live Simulation & Preview Box */}
      <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 text-white p-5 md:p-6 rounded-3xl border border-indigo-800/40 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="font-extrabold text-sm text-slate-100">معاينة تفاعلية حية لشكل شارة ومستوى الشماس:</h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">تجربة بعدد نقاط:</span>
            <input 
              type="range" 
              min="0" 
              max="500" 
              step="5"
              value={previewPoints} 
              onChange={e => setPreviewPoints(Number(e.target.value))}
              className="w-32 accent-amber-400 cursor-pointer"
            />
            <span className="font-mono font-bold text-amber-400 text-sm bg-white/10 px-2.5 py-0.5 rounded-lg">
              {previewPoints} نقطة
            </span>
          </div>
        </div>

        {/* Deacon Hero Preview Card */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-4 text-right">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center border-2 border-amber-400 text-white font-black text-xl shadow-lg">
                ش
              </div>
              <div className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full border border-slate-900 flex items-center gap-0.5">
                <Award className="w-2.5 h-2.5" /> Lv.{previewLevel.levelNumber}
              </div>
            </div>
            <div>
              <h4 className="font-black text-slate-100 text-base">اسم الشماس (معاينة)</h4>
              <p className={`text-xs font-bold mt-0.5 ${previewLevel.textColor}`}>
                {previewLevel.title}
              </p>
              {previewLevel.description && (
                <p className="text-[11px] text-slate-400 mt-0.5">{previewLevel.description}</p>
              )}
            </div>
          </div>

          <div className="w-full sm:w-64 space-y-1.5 bg-black/20 p-3 rounded-xl border border-white/5">
            <div className="flex justify-between text-[11px] font-bold text-slate-300">
              <span>التقدم للمستوى التالي</span>
              <span className="text-amber-300 font-mono">{previewPoints} / {previewLevel.nextLevelPoints} ({previewProgress}%)</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div 
                className={`bg-gradient-to-r ${previewLevel.bgGradient} h-full rounded-full transition-all duration-300`}
                style={{ width: `${previewProgress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
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

      {/* Add / Edit Form Modal or Inline Card */}
      {showAddForm && (
        <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-amber-300 space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-amber-600" />
              {editingId ? 'تعديل بيانات المستوى' : 'إضافة مستوى جديد في النظام'}
            </h3>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveLevel} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">رقم المستوى (ترتيبي):</label>
                <input 
                  type="number" 
                  min="1"
                  max="50"
                  required
                  value={levelNumber}
                  onChange={e => setLevelNumber(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-amber-500 font-mono"
                  placeholder="مثلاً: 1"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">مسمى الرتبة / المستوى:</label>
                <input 
                  type="text" 
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                  placeholder="مثال: شماس متقدم (إبصالتس)"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">الحد الأدنى للنقاط (Min XP):</label>
                <input 
                  type="number" 
                  min="0"
                  required
                  value={minPoints}
                  onChange={e => setMinPoints(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-amber-500 font-mono"
                  placeholder="مثلاً: 100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">اللون والسمة:</label>
                <select
                  value={badgeColor}
                  onChange={e => setBadgeColor(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  <option value="emerald">أخضر زمردي (Emerald - للبداية)</option>
                  <option value="blue">أزرق سماوي (Blue - للمستوى الثاني)</option>
                  <option value="purple">بنفسجي ملكي (Purple - للمستوى المتوسط)</option>
                  <option value="amber">ذهبي ملكي (Amber - للمتميزين)</option>
                  <option value="rose">وردي ياقوتي (Rose - للرتب العليا)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">وصف الشارة / متطلباتها:</label>
                <input 
                  type="text" 
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-amber-500"
                  placeholder="مثال: يمنح بعد حفظ مردات القداس الباسيلي"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {saving ? <span className="animate-spin">⏳</span> : <Check className="w-4 h-4" />}
                {editingId ? 'حفظ التعديلات' : 'إضافة المستوى للنظام'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Levels Table & List */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-extrabold text-slate-800 text-base">جدول الرتب والمستويات الحالية ({levels.length} مستويات)</h3>
            <p className="text-xs text-slate-500 mt-0.5">مرتبة تصاعدياً حسب عدد النقاط المطلوبة</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 text-slate-700 border-b border-slate-100">
              <tr>
                <th className="p-4 font-bold text-center">المستوى</th>
                <th className="p-4 font-bold">مسمى الرتبة</th>
                <th className="p-4 font-bold text-center">الحد الأدنى للنقاط</th>
                <th className="p-4 font-bold text-center">اللون المعين</th>
                <th className="p-4 font-bold">الوصف والمتطلبات</th>
                <th className="p-4 font-bold text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {levels.map((lvl) => {
                const getBadgeBg = (color?: string) => {
                  switch (color) {
                    case 'emerald': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
                    case 'blue': return 'bg-blue-100 text-blue-800 border-blue-200';
                    case 'purple': return 'bg-purple-100 text-purple-800 border-purple-200';
                    case 'amber': return 'bg-amber-100 text-amber-800 border-amber-200';
                    case 'rose': return 'bg-rose-100 text-rose-800 border-rose-200';
                    default: return 'bg-blue-100 text-blue-800 border-blue-200';
                  }
                };

                return (
                  <tr key={lvl.id || lvl.levelNumber} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 font-black font-mono text-slate-700 text-sm border border-slate-200">
                        {lvl.levelNumber}
                      </span>
                    </td>

                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-amber-500" />
                        <span className="font-black text-slate-800 text-sm">{lvl.title}</span>
                      </div>
                    </td>

                    <td className="p-4 text-center">
                      <span className="font-mono font-black text-sm px-3 py-1 bg-amber-50 text-amber-800 rounded-full border border-amber-200">
                        {lvl.minPoints} نقطة
                      </span>
                    </td>

                    <td className="p-4 text-center">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${getBadgeBg(lvl.badgeColor)}`}>
                        {lvl.badgeColor || 'blue'}
                      </span>
                    </td>

                    <td className="p-4 text-slate-500 text-xs">
                      {lvl.description || 'المستوى الافتراضي'}
                    </td>

                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(lvl)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                          title="تعديل"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(lvl)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {levels.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    لا توجد مستويات مسجلة حالياً.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
