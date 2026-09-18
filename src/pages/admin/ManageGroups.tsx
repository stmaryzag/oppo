import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ChorusGroup } from '../../types';
import { DEFAULT_CHORUS_GROUPS, initDefaultChoruses } from '../../utils/chorusHelper';
import { Users, Plus, Trash2, Edit2, Loader2, Sparkles, Check, CheckCircle2, AlertCircle, Shield } from 'lucide-react';

export const ManageGroups: React.FC = () => {
  const [groups, setGroups] = useState<ChorusGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ChorusGroup | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    order: 15,
    description: '',
    color: '#6366F1'
  });

  useEffect(() => {
    // Listen to chorus groups
    const q = query(collection(db, 'chorus_groups'), orderBy('order', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        initDefaultChoruses();
      } else {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChorusGroup));
        setGroups(list);
      }
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setSaving(true);

    try {
      if (editingGroup) {
        // Update
        await updateDoc(doc(db, 'chorus_groups', editingGroup.id), {
          name: formData.name.trim(),
          order: Number(formData.order),
          description: formData.description.trim(),
          color: formData.color
        });
        setSuccessMsg('تم تحديث بيانات الخورس بنجاح');
      } else {
        // Add new
        const code = formData.code.trim() || `chorus_${formData.order}`;
        await addDoc(collection(db, 'chorus_groups'), {
          name: formData.name.trim(),
          code: code,
          order: Number(formData.order),
          description: formData.description.trim(),
          color: formData.color,
          active: true,
          createdAt: new Date().toISOString()
        });
        setSuccessMsg('تمت إضافة المجموعة/الخورس الجديد بنجاح');
      }

      setShowAddModal(false);
      setEditingGroup(null);
      setFormData({
        name: '',
        code: '',
        order: groups.length > 0 ? Math.max(...groups.map(g => g.order)) + 1 : 15,
        description: '',
        color: '#6366F1'
      });
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء حفظ بيانات الخورس');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (group: ChorusGroup) => {
    if (confirm(`هل أنت متأكد من حذف ${group.name}؟ هذا الإجراء لا يمكن التراجع عنه.`)) {
      try {
        await deleteDoc(doc(db, 'chorus_groups', group.id));
      } catch (err) {
        console.error(err);
        alert('تعذر حذف الخورس');
      }
    }
  };

  const handleToggleActive = async (group: ChorusGroup) => {
    try {
      await updateDoc(doc(db, 'chorus_groups', group.id), {
        active: !group.active
      });
    } catch (err) {
      console.error(err);
    }
  };

  const openEditModal = (group: ChorusGroup) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      code: group.code,
      order: group.order,
      description: group.description || '',
      color: group.color || '#6366F1'
    });
    setShowAddModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-600 p-6 md:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-inner">
              <Users className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black">إدارة مجموعات وخوارس الشمامسة</h1>
              <p className="text-indigo-100 text-sm mt-1">
                التحكم بالخوارس (الخورس التاسع حتى الرابع عشر والمجموعات الجديدة) وعزل بيانات كل خورس
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingGroup(null);
              setFormData({
                name: '',
                code: '',
                order: groups.length > 0 ? Math.max(...groups.map(g => g.order)) + 1 : 15,
                description: '',
                color: '#6366F1'
              });
              setShowAddModal(true);
            }}
            className="px-5 py-3 bg-white text-indigo-700 font-bold rounded-2xl shadow-lg hover:bg-indigo-50 active:scale-95 transition-all flex items-center justify-center gap-2 self-start md:self-auto"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة خورس / مجموعة جديدة</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl flex items-center gap-2 font-bold shadow-sm animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Groups Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600" />
          <p className="mt-3 font-bold">جاري تحميل خوارس الشمامسة...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {groups.map((grp) => (
            <div
              key={grp.id}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-md"
                      style={{ backgroundColor: grp.color || '#6366F1' }}
                    >
                      {grp.order}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">{grp.name}</h3>
                      <span className="text-xs text-slate-400 font-mono" dir="ltr">#{grp.code}</span>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                      grp.active
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {grp.active ? 'نشط' : 'معطل'}
                  </span>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed min-h-[36px]">
                  {grp.description || 'لا يوجد وصف محدد لهذا الخورس'}
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => handleToggleActive(grp)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors ${
                    grp.active
                      ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                      : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  {grp.active ? 'إيقاف مؤقت' : 'تفعيل'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(grp)}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                    title="تعديل"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(grp)}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                    title="حذف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Add or Edit Chorus */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-lg text-slate-900">
                {editingGroup ? 'تعديل بيانات الخورس' : 'إضافة خورس أو مجموعة جديدة'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                إلغاء
              </button>
            </div>

            <form onSubmit={handleCreateOrUpdate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الخورس / المجموعة *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: الخورس الخامس عشر، خورس إعداد خدام"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الترتيب الرقمي *</label>
                  <input
                    type="number"
                    required
                    value={formData.order}
                    onChange={e => setFormData({ ...formData, order: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">لون التمييز</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.color}
                      onChange={e => setFormData({ ...formData, color: e.target.value })}
                      className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 p-0.5"
                    />
                    <span className="text-xs font-mono text-slate-500">{formData.color}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الوصف والمرحلة الدراسية</label>
                <textarea
                  rows={3}
                  placeholder="مثال: مخصص لشمامسة المرحلة الثانوية أو الجامعية..."
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-bold text-sm transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl text-sm shadow-md transition-all flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingGroup ? 'حفظ التعديلات' : 'إنشاء الخورس'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
