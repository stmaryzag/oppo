import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Activity, Plus, Trash2, Loader2, Check, X, Sparkles } from 'lucide-react';
import { STANDARD_CHURCH_ACTIVITIES } from '../../utils/defaultActivities';

export const ManageActivities = () => {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState('');
  
  const [name, setName] = useState('');
  const [points, setPoints] = useState('10');
  const [category, setCategory] = useState<'liturgy' | 'confession' | 'hymns' | 'service' | 'other'>('liturgy');
  const [requiresApproval, setRequiresApproval] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'activity_types'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActivities(data);
    });
    return () => unsub();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'activity_types'), { 
        name: name.trim(),
        defaultPoints: parseInt(points) || 0,
        category,
        active: true,
        requiresApproval
      });
      setName('');
      setPoints('10');
      setCategory('liturgy');
      setRequiresApproval(false);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDefaults = async () => {
    if (!window.confirm('هل تريد إضافة حزمة الأنشطة والقداسات الكنسية الثابتة (قداس الجمعة، قداس الأحد، قداسات وسط الأسبوع، حصص الألحان، والاعتراف)؟')) return;
    setSeeding(true);
    try {
      const snap = await getDocs(collection(db, 'activity_types'));
      const existingNames = new Set(snap.docs.map(d => d.data().name?.trim()));

      let addedCount = 0;
      for (const act of STANDARD_CHURCH_ACTIVITIES) {
        if (!existingNames.has(act.name.trim())) {
          await addDoc(collection(db, 'activity_types'), act);
          addedCount++;
        }
      }

      setSeedSuccess(`تمت إضافة ${addedCount} نشاط بنجاح!`);
      setTimeout(() => setSeedSuccess(''), 3500);
    } catch (err: any) {
      console.error(err);
      alert('حدث خطأ أثناء إضافة الأنشطة: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا النشاط؟')) {
      await deleteDoc(doc(db, 'activity_types', id));
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await updateDoc(doc(db, 'activity_types', id), { active: !current });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 text-green-600 rounded-2xl">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">إدارة أنواع الأنشطة والقداسات</h2>
              <p className="text-xs text-slate-500 mt-0.5">تحديد القداسات الأسبوعية، قداسات وسط الأسبوع، وحصص الألحان والاعترافات</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSeedDefaults}
            disabled={seeding}
            className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-2xl text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-xs"
          >
            {seeding ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <Sparkles className="w-4 h-4 text-indigo-600" />}
            إضافة حزمة القداسات والأنشطة الافتراضية
          </button>
        </div>

        {seedSuccess && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 text-xs font-bold text-center">
            {seedSuccess}
          </div>
        )}

        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم النشاط أو القداس</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: قداس وسط الأسبوع (الأربعاء)..."
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-green-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">النقاط الافتراضية</label>
              <input
                type="number"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-green-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تصنيف النشاط</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-green-500"
              >
                <option value="liturgy">قداس إلهي (جمعة / أحد / وسط أسبوع)</option>
                <option value="hymns">حصة ألحان وطقس</option>
                <option value="confession">جلسة سر اعتراف</option>
                <option value="service">خدمة أو نشاط خورس</option>
                <option value="other">نشاط آخر</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div>
              <p className="font-bold text-slate-800 text-xs">يطلب موافقة الأدمن / الخادم؟</p>
              <p className="text-[11px] text-slate-500">متاح لطلب الشماس بنفسه من لوحته ويحتاج تأكيد الخادم لاحتساب النقاط (مثل قداسات وسط الأسبوع وجلسات الاعتراف)</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={requiresApproval} onChange={() => setRequiresApproval(!requiresApproval)} className="sr-only peer" />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>
          
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 transition-colors shadow-sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            إضافة النشاط
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {activities.map((activity) => (
          <div key={activity.id} className={`bg-white p-5 rounded-3xl border ${activity.active ? 'border-slate-100' : 'border-red-200 bg-slate-50 opacity-75'} shadow-sm flex flex-col justify-between gap-3 transition-colors`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-base">{activity.name}</h3>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg border border-blue-100">
                    +{activity.defaultPoints} نقطة
                  </span>
                  {activity.requiresApproval && (
                    <span className="px-2.5 py-1 bg-amber-50 text-amber-800 text-xs font-bold rounded-lg border border-amber-200">
                      طلب بموافقة الخادم
                    </span>
                  )}
                  {activity.category && (
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg">
                      {activity.category === 'liturgy' ? 'قداس إلهي' :
                       activity.category === 'confession' ? 'سر اعتراف' :
                       activity.category === 'hymns' ? 'حصة ألحان' :
                       activity.category === 'service' ? 'خدمة خورس' : 'عام'}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(activity.id)}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            
            <div className="pt-3 border-t border-slate-100 mt-1 flex items-center justify-between">
              <button 
                onClick={() => toggleActive(activity.id, activity.active)}
                className={`text-xs font-bold flex items-center gap-1.5 ${activity.active ? 'text-slate-500 hover:text-red-600' : 'text-green-600'}`}
              >
                {activity.active ? <><X className="w-3.5 h-3.5"/> إيقاف النشاط مؤقتاً</> : <><Check className="w-3.5 h-3.5"/> تفعيل النشاط</>}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

