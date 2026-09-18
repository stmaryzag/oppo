import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { StudyMaterial, StudySubject, ChorusGroup } from '../../types';
import { initDefaultChoruses } from '../../utils/chorusHelper';
import { 
  BookOpen, Music, FileText, Plus, Trash2, Edit2, Play, Pause, 
  ExternalLink, Video, Download, Filter, Search, Loader2, Sparkles, CheckCircle2 
} from 'lucide-react';

const SUBJECTS_METADATA: Record<StudySubject, { name: string; color: string; icon: any }> = {
  hymns: { name: 'الألحان والمردات', color: 'indigo', icon: Music },
  rituals: { name: 'الطقس الكنسي', color: 'purple', icon: BookOpen },
  coptic: { name: 'اللغة القبطية', color: 'emerald', icon: FileText },
  bible: { name: 'الكتاب المقدس', color: 'amber', icon: BookOpen },
  creed: { name: 'العقيدة المسيحية', color: 'blue', icon: Sparkles },
  patrology: { name: 'سير الآباء والشهداء', color: 'rose', icon: BookOpen },
  spiritual: { name: 'روحيات ومحاضرات', color: 'teal', icon: BookOpen },
};

export const StudyMaterials: React.FC = () => {
  const { userData } = useAuth();
  const isAdminOrAssistant = userData?.role === 'admin' || userData?.role === 'assistant';

  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [choruses, setChoruses] = useState<ChorusGroup[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [selectedChorus, setSelectedChorus] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Audio Player State
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<StudyMaterial | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    groupId: 'all',
    subject: 'hymns' as StudySubject,
    description: '',
    audioUrl: '',
    attachmentUrl: '',
    videoUrl: '',
    content: ''
  });

  // Load Choruses
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

  // Default filter for deacon: their own chorus
  useEffect(() => {
    if (userData?.role === 'deacon' && userData?.groupId) {
      setSelectedChorus(userData.groupId);
    }
  }, [userData]);

  // Load Study Materials
  useEffect(() => {
    const q = query(collection(db, 'study_materials'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as StudyMaterial));
      setMaterials(list);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Filter materials
  const filteredMaterials = materials.filter(item => {
    // Chorus Filter: match specific chorus or 'all'
    if (selectedChorus !== 'all' && item.groupId !== 'all' && item.groupId !== selectedChorus) {
      return false;
    }
    // Subject Filter
    if (selectedSubject !== 'all' && item.subject !== selectedSubject) {
      return false;
    }
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      const matchContent = item.content?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchContent) return false;
    }
    return true;
  });

  const handleToggleAudio = (id: string, url: string) => {
    if (currentPlayingId === id) {
      audioElement?.pause();
      setCurrentPlayingId(null);
    } else {
      if (audioElement) {
        audioElement.pause();
      }
      const newAudio = new Audio(url);
      newAudio.play();
      newAudio.onended = () => setCurrentPlayingId(null);
      setAudioElement(newAudio);
      setCurrentPlayingId(id);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    setSaving(true);

    try {
      if (editingItem) {
        await updateDoc(doc(db, 'study_materials', editingItem.id), {
          ...formData,
          updatedAt: new Date().toISOString()
        });
        setSuccessMsg('تم تحديث المحتوى الدراسي بنجاح');
      } else {
        await addDoc(collection(db, 'study_materials'), {
          ...formData,
          createdBy: userData?.id || 'admin',
          createdByName: userData?.fullName || 'الخادم المسؤول',
          createdAt: new Date().toISOString()
        });
        setSuccessMsg('تمت إضافة المادة الدراسية بنجاح');
      }

      setShowAddModal(false);
      setEditingItem(null);
      setFormData({
        title: '',
        groupId: 'all',
        subject: 'hymns',
        description: '',
        audioUrl: '',
        attachmentUrl: '',
        videoUrl: '',
        content: ''
      });
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء حفظ المادة');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذه المادة الدراسية؟')) {
      try {
        await deleteDoc(doc(db, 'study_materials', id));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const openEditModal = (item: StudyMaterial) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      groupId: item.groupId,
      subject: item.subject,
      description: item.description || '',
      audioUrl: item.audioUrl || '',
      attachmentUrl: item.attachmentUrl || '',
      videoUrl: item.videoUrl || '',
      content: item.content || ''
    });
    setShowAddModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 p-6 md:p-8 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-inner">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black">المناهج والمواد الدراسية والألحان</h1>
            <p className="text-teal-100 text-sm mt-1">
              تسجيلات الألحان الكنسية، المردات، شروحات الطقس، واللغة القبطية لكل خورس
            </p>
          </div>
        </div>

        {isAdminOrAssistant && (
          <button
            onClick={() => {
              setEditingItem(null);
              setFormData({
                title: '',
                groupId: selectedChorus !== 'all' ? selectedChorus : 'all',
                subject: 'hymns',
                description: '',
                audioUrl: '',
                attachmentUrl: '',
                videoUrl: '',
                content: ''
              });
              setShowAddModal(true);
            }}
            className="px-5 py-3 bg-white text-emerald-800 font-bold rounded-2xl shadow-lg hover:bg-emerald-50 active:scale-95 transition-all flex items-center justify-center gap-2 self-start md:self-auto"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة درس أو لحن جديد</span>
          </button>
        )}
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl flex items-center gap-2 font-bold shadow-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Filter Controls */}
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Chorus Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">تصفية حسب الخورس:</label>
            <select
              value={selectedChorus}
              onChange={e => setSelectedChorus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">جميع الخوارس والمواد العامة</option>
              {choruses.map(c => (
                <option key={c.id} value={c.id}>{c.name} (الخورس {c.order})</option>
              ))}
            </select>
          </div>

          {/* Subject Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">نوع المادة:</label>
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">جميع المواد والتصنيفات</option>
              {Object.entries(SUBJECTS_METADATA).map(([key, meta]) => (
                <option key={key} value={key}>{meta.name}</option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">بحث سريع:</label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث عن لحن، طقس، موضوع..."
                className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Materials List / Cards */}
      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-600" />
          <p className="mt-3 font-bold">جاري تحميل المواد الدراسية والألحان...</p>
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-3xl border border-slate-100 shadow-sm">
          <Music className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-bold text-base">لا توجد مواد دراسية مضافة حالياً لهذا الفلتر</p>
          <p className="text-slate-400 text-xs mt-1">يمكن للخدام إضافة دروس، تسجيلات ألحان، وملفات PDF بسهولة</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredMaterials.map((item) => {
            const chorusObj = choruses.find(c => c.id === item.groupId);
            const isPlaying = currentPlayingId === item.id;
            const subjectInfo = SUBJECTS_METADATA[item.subject] || { name: item.subject, color: 'indigo' };

            return (
              <div
                key={item.id}
                className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {item.groupId === 'all' ? 'عام لجميع الخوارس' : (chorusObj?.name || item.groupId)}
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {subjectInfo.name}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-lg leading-snug mb-2">{item.title}</h3>
                  {item.description && (
                    <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed mb-4">
                      {item.description}
                    </p>
                  )}

                  {/* Audio Player Widget */}
                  {item.audioUrl && (
                    <div className="bg-emerald-50/70 border border-emerald-100 p-3 rounded-2xl flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleAudio(item.id, item.audioUrl!)}
                          className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md active:scale-95 transition-all"
                        >
                          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                        </button>
                        <div>
                          <span className="text-xs font-bold text-emerald-900 block">
                            {isPlaying ? 'جاري الاستماع الآن...' : 'استمع لتسجيل اللحن'}
                          </span>
                          <span className="text-[10px] text-emerald-700">تسجيل صوتي مسموع</span>
                        </div>
                      </div>
                      <a
                        href={item.audioUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-700 hover:text-emerald-900 p-1"
                        title="تحميل المقطع الصوتي"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  )}

                  {/* Textual Lyrics / Notes preview */}
                  {item.content && (
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4 max-h-32 overflow-y-auto">
                      <p className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                        {item.content}
                      </p>
                    </div>
                  )}

                  {/* Links & Attachments */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {item.attachmentUrl && (
                      <a
                        href={item.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-indigo-600" />
                        <span>ملف الشرح / النوتة (PDF)</span>
                      </a>
                    )}
                    {item.videoUrl && (
                      <a
                        href={item.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors"
                      >
                        <Video className="w-3.5 h-3.5 text-rose-600" />
                        <span>فيديو الشرح</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Footer and Servant Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span>بواسطة: {item.createdByName || 'الخادم'}</span>

                  {isAdminOrAssistant && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(item)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Add or Edit Study Material */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-lg text-slate-900">
                {editingItem ? 'تعديل المادة الدراسية' : 'إضافة مادة دراسية أو لحن جديد'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                إلغاء
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">عنوان المادة / اسم اللحن *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: لحن إبؤورو كامل، مرد الإنجيل، طقس دورة البخور"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الخورس المستهدف</label>
                  <select
                    value={formData.groupId}
                    onChange={e => setFormData({ ...formData, groupId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="all">عام لكل الخوارس</option>
                    {choruses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تصنيف المادة</label>
                  <select
                    value={formData.subject}
                    onChange={e => setFormData({ ...formData, subject: e.target.value as StudySubject })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500"
                  >
                    {Object.entries(SUBJECTS_METADATA).map(([key, meta]) => (
                      <option key={key} value={key}>{meta.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رابط التسجيل الصوتي المسموع (Audio MP3 URL)</label>
                <input
                  type="url"
                  placeholder="https://.../hymn.mp3"
                  value={formData.audioUrl}
                  onChange={e => setFormData({ ...formData, audioUrl: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                  dir="ltr"
                />
                <span className="text-[10px] text-slate-400">يمكن وضع رابط صوتي من درايف أو موقع مباشر لتشغيله في المشغل المدمج</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رابط ملف الشرح / النوتة (PDF)</label>
                  <input
                    type="url"
                    placeholder="https://.../notes.pdf"
                    value={formData.attachmentUrl}
                    onChange={e => setFormData({ ...formData, attachmentUrl: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رابط الفيديو (YouTube / Video)</label>
                  <input
                    type="url"
                    placeholder="https://youtube.com/..."
                    value={formData.videoUrl}
                    onChange={e => setFormData({ ...formData, videoUrl: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">وصف المادة وملاحظات الحفظ</label>
                <textarea
                  rows={2}
                  placeholder="ملاحظات توجيهية للشماس أثناء الحفظ..."
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نص اللحن / الكلمات القبطية والهزات</label>
                <textarea
                  rows={4}
                  placeholder="اكتب كلمات اللحن أو الهزات هنا ليقرأها الشماس مباشرة..."
                  value={formData.content}
                  onChange={e => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-bold text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-sm shadow-md transition-all flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingItem ? 'حفظ التعديلات' : 'نشر المادة'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
