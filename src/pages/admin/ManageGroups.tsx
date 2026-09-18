import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { ChorusGroup, UserData } from '../../types';
import { initDefaultChoruses } from '../../utils/chorusHelper';
import { 
  Users, Plus, Trash2, Edit2, Loader2, Sparkles, Check, CheckCircle2, 
  AlertCircle, Shield, Crown, UserCheck, ExternalLink, Layers, X, UserCog
} from 'lucide-react';

export const ManageGroups: React.FC = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ChorusGroup[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ChorusGroup | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Assign Officials Modal State
  const [assigningGroup, setAssigningGroup] = useState<ChorusGroup | null>(null);
  const [selectedAdminId, setSelectedAdminId] = useState<string>('');
  const [selectedServantIds, setSelectedServantIds] = useState<string[]>([]);
  const [savingAssignments, setSavingAssignments] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    order: 15,
    description: '',
    color: '#6366F1'
  });

  useEffect(() => {
    // 1. Listen to chorus groups
    const q = query(collection(db, 'chorus_groups'), orderBy('order', 'asc'));
    const unsubGroups = onSnapshot(q, (snap) => {
      if (snap.empty) {
        initDefaultChoruses().then(seeded => {
          setGroups(seeded);
          setLoading(false);
        });
      } else {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChorusGroup));
        setGroups(list);
        setLoading(false);
      }
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    // 2. Listen to users
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const uList = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserData));
      setUsers(uList);
    });

    return () => {
      unsubGroups();
      unsubUsers();
    };
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
          adminIds: [],
          servantIds: [],
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

  // Open Assign Modal
  const openAssignModal = (group: ChorusGroup) => {
    setAssigningGroup(group);
    
    // Find current chorus admin
    const currentAdmin = users.find(u => 
      group.adminIds?.includes(u.id) || 
      (u.role === 'chorus_admin' && (u.groupId === group.id || u.groupId === group.code))
    );
    setSelectedAdminId(currentAdmin ? currentAdmin.id : '');

    // Find current servants
    const currentServants = users.filter(u => 
      group.servantIds?.includes(u.id) || 
      (u.role === 'assistant' && (u.groupId === group.id || u.groupId === group.code || u.assignedGroupIds?.includes(group.id)))
    ).map(u => u.id);
    setSelectedServantIds(currentServants);
  };

  // Save Assignments
  const handleSaveAssignments = async () => {
    if (!assigningGroup) return;
    setSavingAssignments(true);

    try {
      const grpId = assigningGroup.id;
      const grpCode = assigningGroup.code;

      // 1. Update group document
      await updateDoc(doc(db, 'chorus_groups', grpId), {
        adminIds: selectedAdminId ? [selectedAdminId] : [],
        servantIds: selectedServantIds
      });

      // 2. If an admin is selected, update that user to role 'chorus_admin' and set their groupId
      if (selectedAdminId) {
        await updateDoc(doc(db, 'users', selectedAdminId), {
          role: 'chorus_admin',
          groupId: grpId
        });
      }

      // 3. For all selected servants, make sure their role is assistant and grpId is included in assignedGroupIds
      for (const sId of selectedServantIds) {
        const u = users.find(x => x.id === sId);
        if (u) {
          const updatedAssigned = Array.from(new Set([...(u.assignedGroupIds || []), grpId]));
          await updateDoc(doc(db, 'users', sId), {
            assignedGroupIds: updatedAssigned,
            groupId: u.groupId || grpId
          });
        }
      }

      setSuccessMsg(`تم تعيين المسؤولين والخدام لـ ${assigningGroup.name} بنجاح ✨`);
      setAssigningGroup(null);
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err: any) {
      console.error(err);
      alert('حدث خطأ أثناء حفظ التعيينات: ' + err.message);
    } finally {
      setSavingAssignments(false);
    }
  };

  // Stats calculation
  const totalDeacons = users.filter(u => u.role === 'deacon').length;
  const totalChorusAdmins = users.filter(u => u.role === 'chorus_admin').length;
  const totalServants = users.filter(u => u.role === 'assistant').length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-700 p-6 md:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-inner">
              <Layers className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-3 py-0.5 bg-amber-400 text-slate-900 text-xs font-black rounded-full shadow-sm">
                  لوحة الإدارة المركزية
                </span>
                <span className="px-3 py-0.5 bg-white/20 text-white text-xs font-bold rounded-full">
                  هيكل الخوارس والأدوار
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black">إدارة مجموعات وخوارس الشمامسة</h1>
              <p className="text-indigo-100 text-xs md:text-sm mt-1">
                التحكم بالخوارس وتعيين أدمن الخورس (أدمن فرعي مستقل) والخدام المخصصين لكل خورس
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
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
              className="px-5 py-3 bg-white text-indigo-700 font-black rounded-2xl shadow-lg hover:bg-indigo-50 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm"
            >
              <Plus className="w-5 h-5" />
              <span>إضافة خورس جديد</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-white/15">
          <div className="bg-white/10 backdrop-blur-xs px-4 py-2.5 rounded-2xl border border-white/10">
            <span className="text-[11px] text-indigo-200 block font-bold">عدد الخوارس</span>
            <span className="text-lg font-black text-white">{groups.length} خورس</span>
          </div>
          <div className="bg-white/10 backdrop-blur-xs px-4 py-2.5 rounded-2xl border border-white/10">
            <span className="text-[11px] text-indigo-200 block font-bold">أدمن الخوارس المعينين</span>
            <span className="text-lg font-black text-amber-300">{totalChorusAdmins} أدمن</span>
          </div>
          <div className="bg-white/10 backdrop-blur-xs px-4 py-2.5 rounded-2xl border border-white/10">
            <span className="text-[11px] text-indigo-200 block font-bold">الخدام الميدانيين</span>
            <span className="text-lg font-black text-white">{totalServants} خادم</span>
          </div>
          <div className="bg-white/10 backdrop-blur-xs px-4 py-2.5 rounded-2xl border border-white/10">
            <span className="text-[11px] text-indigo-200 block font-bold">إجمالي الشمامسة</span>
            <span className="text-lg font-black text-emerald-300">{totalDeacons} شماس</span>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl flex items-center gap-2 font-bold shadow-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((grp) => {
            // Calculate deacons in this chorus
            const chorusDeacons = users.filter(u => 
              u.role === 'deacon' && (u.groupId === grp.id || u.groupId === grp.code || (!u.groupId && grp.id === 'chorus_9'))
            );

            // Find Chorus Admin
            const chorusAdmin = users.find(u => 
              grp.adminIds?.includes(u.id) || 
              (u.role === 'chorus_admin' && (u.groupId === grp.id || u.groupId === grp.code))
            );

            // Find Servants
            const chorusServants = users.filter(u => 
              grp.servantIds?.includes(u.id) || 
              (u.role === 'assistant' && (u.groupId === grp.id || u.groupId === grp.code || u.assignedGroupIds?.includes(grp.id)))
            );

            return (
              <div
                key={grp.id}
                className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div>
                  {/* Top Bar */}
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-base shadow-sm"
                        style={{ backgroundColor: grp.color || '#6366F1' }}
                      >
                        {grp.order}
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 text-lg leading-tight">{grp.name}</h3>
                        <span className="text-xs text-slate-400 font-mono" dir="ltr">#{grp.code}</span>
                      </div>
                    </div>
                    <span
                      className={`text-xs px-3 py-1 rounded-full font-bold ${
                        grp.active
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {grp.active ? 'نشط' : 'معطل'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed mb-4">
                    {grp.description || 'مجموعة تنظيمية للشمامسة تشمل كافة المراحل العمرية التابعة لها.'}
                  </p>

                  {/* Officials & Deacons Cards */}
                  <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100">
                    {/* Chorus Admin */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-slate-700 font-bold">
                        <Crown className="w-4 h-4 text-amber-500" />
                        <span>أدمن الخورس:</span>
                      </div>
                      {chorusAdmin ? (
                        <span className="font-black text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100">
                          {chorusAdmin.fullName}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium">لم يتم التعيين</span>
                      )}
                    </div>

                    {/* Servants */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-slate-700 font-bold">
                        <UserCheck className="w-4 h-4 text-teal-600" />
                        <span>الخدام المعينين:</span>
                      </div>
                      <span className="font-bold text-slate-800">
                        {chorusServants.length > 0 ? `${chorusServants.length} خادم` : 'لا يوجد'}
                      </span>
                    </div>

                    {/* Deacons Count */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-slate-700 font-bold">
                        <Users className="w-4 h-4 text-blue-600" />
                        <span>عدد الشمامسة:</span>
                      </div>
                      <span className="font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-100">
                        {chorusDeacons.length} شماس
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-3 border-t border-slate-100">
                  {/* Primary Direct Dashboard Access for this Chorus */}
                  <button
                    onClick={() => navigate(`/admin/chorus?groupId=${grp.id}`)}
                    className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-xs transition-all active:scale-95"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>دخول لوحة تحكم {grp.name} (أدمن الخورس)</span>
                  </button>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => openAssignModal(grp)}
                      className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <UserCog className="w-4 h-4 text-indigo-600" />
                      <span>تعيين الأدمن والخدام</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(grp)}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors"
                        title="تعديل الاسم والوصف"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(grp)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                        title="حذف الخورس"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Assign Chorus Admin & Servants */}
      {assigningGroup && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                  <UserCog className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    تعيين المسؤولين والخدام لـ {assigningGroup.name}
                  </h3>
                  <p className="text-xs text-slate-500">تحكم كامل وسهل في أدمن الخورس والخدام التابعين له</p>
                </div>
              </div>
              <button
                onClick={() => setAssigningGroup(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 1. Chorus Admin Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-amber-500" />
                  <span>أدمن الخورس (مسؤول الخورس صاحب الصلاحيات الكاملة للخورس)</span>
                </label>
                <select
                  value={selectedAdminId}
                  onChange={(e) => setSelectedAdminId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- بدون أدمن خورس حالياً --</option>
                  {users
                    .filter(u => u.role === 'chorus_admin' || u.role === 'assistant' || u.role === 'admin')
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} (@{u.username}) [{u.role === 'chorus_admin' ? 'أدمن خورس' : u.role === 'assistant' ? 'خادم' : 'أدمن رئيسي'}]
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  عند اختيار مستخدم هنا، سيتم ترقيته تلقائياً لدور (أدمن الخورس) وربطه بهذا الخورس.
                </p>
              </div>

              {/* 2. Servants Multiple Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-teal-600" />
                  <span>خدام الخورس (تحديد الخدام المكلفين بخدمة هذا الخورس)</span>
                </label>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100 p-2 bg-slate-50/50">
                  {users
                    .filter(u => u.role === 'assistant' || u.role === 'chorus_admin')
                    .map(servant => {
                      const isChecked = selectedServantIds.includes(servant.id);
                      return (
                        <label
                          key={servant.id}
                          className="flex items-center justify-between p-2.5 hover:bg-white rounded-xl cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedServantIds([...selectedServantIds, servant.id]);
                                } else {
                                  setSelectedServantIds(selectedServantIds.filter(id => id !== servant.id));
                                }
                              }}
                              className="w-4 h-4 text-indigo-600 rounded-md focus:ring-indigo-500"
                            />
                            <div>
                              <span className="font-bold text-xs text-slate-800 block">{servant.fullName}</span>
                              <span className="text-[10px] text-slate-400" dir="ltr">@{servant.username}</span>
                            </div>
                          </div>
                          {isChecked && (
                            <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                              معين
                            </span>
                          )}
                        </label>
                      );
                    })}
                  {users.filter(u => u.role === 'assistant' || u.role === 'chorus_admin').length === 0 && (
                    <p className="p-3 text-xs text-slate-400 text-center">لا يوجد خدام مسجلين في النظام بعد.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAssigningGroup(null)}
                className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-bold text-xs transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveAssignments}
                disabled={savingAssignments}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-2"
              >
                {savingAssignments && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>حفظ التعيينات</span>
              </button>
            </div>
          </div>
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
                <label className="block text-xs font-bold text-slate-700 mb-1">الوصف العام للخورس</label>
                <textarea
                  rows={3}
                  placeholder="وصف الخورس أو الفئة التابعة له..."
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
