import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, setDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { createAuthUser } from '../../lib/adminAuth';
import { 
  Users, Plus, Loader2, User, Search, Edit3, CheckCircle, 
  AlertCircle, Download, Phone, MapPin, Calendar, FileSpreadsheet,
  UploadCloud, Copy, Check, ShieldCheck, HeartHandshake, Sparkles, Link2
} from 'lucide-react';
import { Role, UserData } from '../../types';
import { parseExcelFile, ParsedDeaconRow } from '../../utils/excelImport';
import { 
  createAndLinkParentAccount, 
  extractParentName, 
  generateParentUsername, 
  ParentCreationResult 
} from '../../utils/parentGenerator';

export const ManageUsers = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Single user add state
  const [showAddForm, setShowAddForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('deacon');
  const [selectedParentOfDeaconId, setSelectedParentOfDeaconId] = useState('');

  // Edit user state
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Auto Parent Generation State
  const [generatingParents, setGeneratingParents] = useState(false);
  const [parentGenResults, setParentGenResults] = useState<ParentCreationResult[]>([]);
  const [showParentGenModal, setShowParentGenModal] = useState(false);
  const [copiedParentCreds, setCopiedParentCreds] = useState(false);

  // Excel Bulk Import Modal State
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedDeaconRow[]>([]);
  const [excelFileName, setExcelFileName] = useState('');
  const [parsingExcel, setParsingExcel] = useState(false);
  const [importing, setImporting] = useState(false);
  const [autoCreateParentsOnImport, setAutoCreateParentsOnImport] = useState(true);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [importFinished, setImportFinished] = useState(false);
  const [copiedCredentials, setCopiedCredentials] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserData));
      setUsers(data);
    });

    const unsubAreas = onSnapshot(collection(db, 'areas'), (snapshot) => {
      setAreas(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubTeams = onSnapshot(collection(db, 'teams'), (snapshot) => {
      setTeams(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubUsers();
      unsubAreas();
      unsubTeams();
    };
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    const email = `${username.trim()}@deacons-app.local`;

    try {
      const authUser = await createAuthUser(email, password);

      await setDoc(doc(db, 'users', authUser.uid), {
        username: username.trim(),
        role,
        fullName: fullName.trim(),
        createdAt: new Date().toISOString(),
        isFirstLogin: true,
        photoUrl: '',
        ownPhone: '',
        parentPhone: '',
        dadPhone: '',
        momPhone: '',
        address: '',
        grade: '',
        areaId: '',
        teamId: '',
        assignedAssistantId: '',
        parentOfDeaconId: role === 'parent' ? selectedParentOfDeaconId : '',
        tempPassword: password
      });

      // If adding a deacon, auto-create their parent account right away
      if (role === 'deacon') {
        try {
          const newDeaconData: UserData = {
            id: authUser.uid,
            username: username.trim(),
            role: 'deacon',
            fullName: fullName.trim(),
            createdAt: new Date().toISOString(),
            tempPassword: password
          };
          await createAndLinkParentAccount(newDeaconData, users);
        } catch (pErr) {
          console.warn('Auto parent creation notice:', pErr);
        }
      }

      setSuccessMsg(`تم إنشاء حساب ${fullName} بنجاح كـ ${getRoleName(role)}`);
      setFullName('');
      setUsername('');
      setPassword('');
      setRole('deacon');
      setSelectedParentOfDeaconId('');
      setShowAddForm(false);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('اسم المستخدم هذا مسجل بالفعل');
      } else if (err.code === 'auth/weak-password') {
        setError('كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل');
      } else {
        setError(err.message || 'حدث خطأ أثناء إضافة المستخدم');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditLoading(true);
    try {
      const userRef = doc(db, 'users', editingUser.id);
      await updateDoc(userRef, {
        fullName: editingUser.fullName || '',
        ownPhone: editingUser.ownPhone || '',
        dadPhone: editingUser.dadPhone || '',
        momPhone: editingUser.momPhone || '',
        parentPhone: editingUser.parentPhone || editingUser.dadPhone || editingUser.momPhone || '',
        address: editingUser.address || '',
        birthDate: editingUser.birthDate || '',
        grade: editingUser.grade || '',
        areaId: editingUser.areaId || '',
        teamId: editingUser.teamId || '',
        role: editingUser.role || 'deacon',
        parentOfDeaconId: editingUser.parentOfDeaconId || ''
      });
      setSuccessMsg(`تم تحديث بيانات ${editingUser.fullName} بنجاح`);
      setEditingUser(null);
    } catch (err: any) {
      console.error(err);
      setError('تعذر حفظ التعديلات: ' + err.message);
    } finally {
      setEditLoading(false);
    }
  };

  // Generate & Link Parent Accounts for All Deacons
  const handleAutoGenerateAllParents = async () => {
    const deacons = users.filter(u => u.role === 'deacon');
    if (deacons.length === 0) {
      setError('لا يوجد شمامسة مسجلين لتوليد حسابات أولياء أمور لهم');
      return;
    }

    setGeneratingParents(true);
    setShowParentGenModal(true);
    setParentGenResults([]);
    const results: ParentCreationResult[] = [];

    for (const deacon of deacons) {
      try {
        const res = await createAndLinkParentAccount(deacon, users);
        results.push(res);
      } catch (err: any) {
        results.push({
          deaconId: deacon.id,
          deaconName: deacon.fullName,
          parentName: extractParentName(deacon.fullName),
          parentUsername: generateParentUsername(deacon.username),
          parentPassword: '---',
          status: 'failed',
          message: err.message || 'فشل'
        });
      }
      setParentGenResults([...results]);
    }

    setGeneratingParents(false);
    setSuccessMsg(`اكتملت عملية فحص وتوليد حسابات أولياء الأمور لـ ${deacons.length} شماس بنجاح!`);
  };

  // Copy Parent Credentials to Clipboard
  const handleCopyParentCredentials = () => {
    const text = parentGenResults.map((r, idx) => 
      `${idx + 1}. ولي أمر الشماس: ${r.deaconName}\n   - اسم ولي الأمر: ${r.parentName}\n   - اسم الدخول: ${r.parentUsername}\n   - كلمة المرور: ${r.parentPassword}\n   - الحالة: ${r.message}`
    ).join('\n\n');

    navigator.clipboard.writeText(text);
    setCopiedParentCreds(true);
    setTimeout(() => setCopiedParentCreds(false), 3000);
  };

  // Download CSV of Parent Credentials
  const downloadParentCredentialsCSV = () => {
    const header = "اسم الشماس,اسم ولي الامر,اسم الدخول,كلمة المرور,الحالة\n";
    const rows = parentGenResults.map(r => 
      `"${r.deaconName}","${r.parentName}","${r.parentUsername}","${r.parentPassword}","${r.message}"`
    ).join("\n");

    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `حسابات_أولياء_الأمور_${new Date().toLocaleDateString('ar-EG')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm(`هل أنت متأكد من حذف حساب ${name} من قاعدة البيانات؟`)) return;
    try {
      await deleteDoc(doc(db, 'users', id));
      setSuccessMsg(`تم حذف ${name} بنجاح`);
    } catch (err: any) {
      console.error(err);
      setError('فشل في حذف المستخدم: ' + err.message);
    }
  };

  // Handle Excel File Pick & Parsing locally in memory
  const handleExcelFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingExcel(true);
    setError('');
    setExcelFileName(file.name);
    setImportLogs([]);
    setImportFinished(false);

    try {
      const parsed = await parseExcelFile(file);
      if (parsed.length === 0) {
        throw new Error('لم يتم العثور على أي صفوف صالحة في ملف الإكسيل');
      }
      setParsedRows(parsed);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'فشل في قراءة ملف الإكسيل');
    } finally {
      setParsingExcel(false);
    }
  };

  // Perform Bulk Account Creation in Firebase directly
  const handleStartBulkImport = async () => {
    if (parsedRows.length === 0) return;
    setImporting(true);
    setImportProgress({ current: 0, total: parsedRows.length });
    const logs: string[] = [];

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      const email = `${row.username}@deacons-app.local`;

      try {
        let uid = '';
        try {
          const authUser = await createAuthUser(email, row.password);
          uid = authUser.uid;
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-in-use') {
            // Already created, we will update doc or create doc with email prefix
            uid = `uid_${row.username.replace(/[^a-zA-Z0-9]/g, '_')}`;
            logs.push(`⚠️ ${row.fullName}: الحساب مسجل بالفعل مسبقاً، جاري تحديث بياناته.`);
          } else {
            throw authErr;
          }
        }

        // Save in Firestore
        const deaconDocId = uid || `uid_${row.username}`;
        const newDeaconDoc: any = {
          fullName: row.fullName,
          username: row.username,
          tempPassword: row.password,
          birthDate: row.birthDate,
          ownPhone: row.ownPhone,
          dadPhone: row.dadPhone,
          momPhone: row.momPhone,
          parentPhone: row.parentPhone,
          address: row.address,
          grade: row.grade,
          role: 'deacon',
          isFirstLogin: true,
          photoUrl: '',
          areaId: '',
          teamId: '',
          assignedAssistantId: '',
          createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'users', deaconDocId), newDeaconDoc, { merge: true });
        logs.push(`✅ ${row.fullName} (@${row.username}) -> تم إنشاء حساب الشماس`);

        // Automatically create and link parent account if enabled
        if (autoCreateParentsOnImport) {
          try {
            const deaconObj: UserData = {
              id: deaconDocId,
              ...newDeaconDoc
            };
            const parentRes = await createAndLinkParentAccount(deaconObj, users);
            logs.push(`   👨‍👦 ${parentRes.message} (@${parentRes.parentUsername})`);
          } catch (pErr: any) {
            logs.push(`   ⚠️ تعذر إنشاء حساب ولي الأمر: ${pErr.message}`);
          }
        }
      } catch (err: any) {
        logs.push(`❌ ${row.fullName}: فشل الإنشاء (${err.message})`);
      }

      setImportProgress({ current: i + 1, total: parsedRows.length });
      setImportLogs([...logs]);
    }

    setImporting(false);
    setImportFinished(true);
    setSuccessMsg(`تم الانتهاء من إنشاء ${parsedRows.length} حساب في Firebase بنجاح!`);
  };

  // Copy Generated Passwords to Clipboard
  const handleCopyCredentials = () => {
    const text = parsedRows.map((r, idx) => 
      `${idx + 1}. ${r.fullName}\n   - اسم الدخول: ${r.username}\n   - كلمة المرور: ${r.password}\n   - الهاتف: ${r.ownPhone || 'غير مسجل'}`
    ).join('\n\n');

    navigator.clipboard.writeText(text);
    setCopiedCredentials(true);
    setTimeout(() => setCopiedCredentials(false), 3000);
  };

  // Download CSV of Current DB Users
  const downloadCSV = () => {
    const header = "الاسم,اسم الدخول,الرتبة,الهاتف,هاتف الوالدين,تاريخ الميلاد,العنوان,الصف الدراسي\n";
    const rows = users.map(u => 
      `"${u.fullName || ''}","${u.username || ''}","${getRoleName(u.role)}","${u.ownPhone || ''}","${u.parentPhone || u.dadPhone || u.momPhone || ''}","${u.birthDate || ''}","${(u.address || '').replace(/"/g, '""')}","${u.grade || ''}"`
    ).join("\n");

    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `تقرير_بيانات_الشمامسة_${new Date().toLocaleDateString('ar-EG')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download CSV of Imported Credentials
  const downloadImportedCredentialsCSV = () => {
    const header = "الاسم,اسم الدخول,كلمة المرور المبدئية,رقم الشماس,رقم الاب,رقم الام,العنوان,الصف\n";
    const rows = parsedRows.map(r => 
      `"${r.fullName}","${r.username}","${r.password}","${r.ownPhone}","${r.dadPhone}","${r.momPhone}","${(r.address || '').replace(/"/g, '""')}","${r.grade}"`
    ).join("\n");

    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `بيانات_دخول_الشمامسة_${new Date().toLocaleDateString('ar-EG')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getRoleColor = (r: string) => {
    switch (r) {
      case 'admin': return 'bg-red-50 text-red-700 border-red-200';
      case 'assistant': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'parent': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getRoleName = (r: string) => {
    switch (r) {
      case 'admin': return 'أدمن';
      case 'assistant': return 'خادم';
      case 'parent': return 'ولي أمر';
      default: return 'شماس';
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      (u.fullName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.address || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.ownPhone || '').includes(searchQuery) ||
      (u.parentPhone || '').includes(searchQuery);

    const matchesRole = roleFilter === 'all' || u.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">إدارة حسابات الشمامسة والمستخدمين</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              إجمالي الحسابات المسجلة في Firebase: <span className="font-bold text-blue-600">{users.length}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleAutoGenerateAllParents}
            disabled={generatingParents}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
          >
            {generatingParents ? <Loader2 className="w-4 h-4 animate-spin" /> : <HeartHandshake className="w-4 h-4" />}
            توليد وربط أولياء الأمور تلقائياً
          </button>

          <button
            onClick={() => setShowExcelModal(true)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            استيراد ملف Excel من جهازك
          </button>

          <button
            onClick={downloadCSV}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" />
            تصدير البيانات (CSV)
          </button>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            إضافة حساب يدوي
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl text-sm flex items-center gap-2">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Empty State Helper Card */}
      {users.length === 0 && !loading && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50/40 p-6 md:p-8 rounded-3xl border border-blue-100 text-center space-y-4">
          <div className="w-16 h-16 bg-white shadow-sm rounded-2xl flex items-center justify-center mx-auto text-blue-600 border border-blue-100">
            <UploadCloud className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-lg font-bold text-slate-800 mb-1">لا توجد حسابات مسجلة بعد في قاعدة البيانات</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              يمكنك رفع ملف الإكسيل الخاص بالشمامسة مباشرة من حاسوبك، وسيقوم المتصفح بقراءته وإنشاء الحسابات وتوليد كلمات المرور في Firebase فوراً وبشكل آمن تماماً بدون حفظ الملف على السيرفر.
            </p>
          </div>
          <button
            onClick={() => setShowExcelModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-sm shadow-md transition-all"
          >
            <FileSpreadsheet className="w-5 h-5" />
            اختيار ملف Excel لإنشاء حسابات الشمامسة الآن
          </button>
        </div>
      )}

      {/* Add Single User Form */}
      {showAddForm && (
        <form onSubmit={handleAddUser} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
            <Plus className="w-5 h-5 text-blue-600" /> إضافة مستخدم جديد
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">الاسم الكامل</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="مثال: بيشوي عماد جرجس"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">اسم الدخول (Username)</label>
              <input
                type="text"
                required
                dir="ltr"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="bishoy.emad"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 text-sm text-left"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">كلمة المرور المبدئية</label>
              <input
                type="text"
                required
                dir="ltr"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="123456"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 text-sm text-left"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">الدور (Role)</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as Role)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 text-sm font-medium"
              >
                <option value="deacon">شماس</option>
                <option value="assistant">خادم</option>
                <option value="parent">ولي أمر</option>
                <option value="admin">أدمن (مدير)</option>
              </select>
            </div>
          </div>

          {role === 'parent' && (
            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl">
              <label className="block text-xs font-bold text-amber-900 mb-1 flex items-center gap-1.5">
                <Link2 className="w-4 h-4 text-amber-700" /> ربط ولي الأمر بالشماس التابع له (الابن)
              </label>
              <select
                value={selectedParentOfDeaconId}
                onChange={e => setSelectedParentOfDeaconId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-amber-300 rounded-xl focus:outline-none focus:border-amber-500 text-sm font-medium"
              >
                <option value="">-- اختر الشماس المرتبط بهذا الحساب --</option>
                {users.filter(u => u.role === 'deacon').map(d => (
                  <option key={d.id} value={d.id}>{d.fullName} (@{d.username})</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ وإنشاء'}
            </button>
          </div>
        </form>
      )}

      {/* Filter and Search Bar */}
      {users.length > 0 && (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم، اسم المستخدم، الهاتف، العنوان..."
              className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-500"
            >
              <option value="all">كل الأدوار</option>
              <option value="deacon">الشمامسة فقط</option>
              <option value="assistant">الخُدام</option>
              <option value="parent">أولياء الأمور</option>
              <option value="admin">المدراء (Admins)</option>
            </select>
          </div>
        </div>
      )}

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredUsers.map((u) => {
          const userArea = areas.find(a => a.id === u.areaId)?.name;
          const userTeam = teams.find(t => t.id === u.teamId)?.name;

          // Find linked parent or linked deacon
          const linkedParent = u.role === 'deacon'
            ? users.find(p => p.role === 'parent' && (p.parentOfDeaconId === u.id || p.username === generateParentUsername(u.username)))
            : null;
          
          const linkedDeacon = u.role === 'parent' && u.parentOfDeaconId
            ? users.find(d => d.id === u.parentOfDeaconId)
            : null;

          return (
            <div key={u.id} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between hover:border-slate-200 transition-colors">
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    {u.photoUrl ? (
                      <img src={u.photoUrl} alt={u.fullName} className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                        <User className="w-6 h-6 text-slate-400" />
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm leading-tight">{u.fullName}</h4>
                      <p className="text-xs text-slate-500 mt-0.5" dir="ltr">@{u.username}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${getRoleColor(u.role)}`}>
                    {getRoleName(u.role)}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl mb-3">
                  {/* Linked Relations display */}
                  {u.role === 'deacon' && (
                    <div className="p-2 bg-indigo-50/70 rounded-xl text-indigo-900 flex items-center justify-between gap-2 border border-indigo-100/70">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <HeartHandshake className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="truncate">
                          ولي الأمر: <span className="font-bold">{linkedParent ? linkedParent.fullName : 'غير مرتبط'}</span>
                        </span>
                      </div>
                      {!linkedParent && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await createAndLinkParentAccount(u, users);
                              setSuccessMsg(res.message);
                            } catch (e: any) {
                              setError(e.message);
                            }
                          }}
                          className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold shrink-0 shadow-xs"
                        >
                          توليد
                        </button>
                      )}
                    </div>
                  )}

                  {u.role === 'parent' && (
                    <div className="p-2 bg-amber-50/80 rounded-xl text-amber-900 flex items-center gap-1.5 border border-amber-200/60">
                      <Link2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="truncate">
                        الشماس التابع له: <span className="font-bold">{linkedDeacon ? linkedDeacon.fullName : (u.parentOfDeaconId ? 'معرف غير متاح' : 'لم يتم الربط بعد')}</span>
                      </span>
                    </div>
                  )}

                  {u.birthDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>الميلاد: {u.birthDate}</span>
                    </div>
                  )}
                  {(u.ownPhone || u.parentPhone || u.dadPhone || u.momPhone) && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span dir="ltr">{u.ownPhone || u.parentPhone || u.dadPhone || u.momPhone}</span>
                    </div>
                  )}
                  {u.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{u.address}</span>
                    </div>
                  )}
                  {(userArea || userTeam) && (
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 font-medium">
                      {userArea && <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded-md text-[10px]">المنطقة: {userArea}</span>}
                      {userTeam && <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md text-[10px]">الفريق: {userTeam}</span>}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  onClick={() => setEditingUser(u)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" /> تعديل واستكمال
                </button>
                <button
                  onClick={() => handleDeleteUser(u.id, u.fullName)}
                  className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1"
                >
                  حذف
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Excel Bulk Import Modal */}
      {showExcelModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 md:p-8 space-y-5 my-8 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">استيراد وإنشاء حسابات الشمامسة من Excel</h3>
                  <p className="text-xs text-slate-500">
                    قراءة الملف تتم محلياً في متصفحك ورفع الحسابات لـ Firebase دون حفظ الملف في الـ Repo
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowExcelModal(false);
                  setParsedRows([]);
                  setExcelFileName('');
                  setImportFinished(false);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Drop / Pick Zone */}
            <div 
              onClick={() => excelInputRef.current?.click()}
              className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-2xl p-6 text-center cursor-pointer bg-emerald-50/40 transition-colors"
            >
              <input 
                type="file" 
                ref={excelInputRef} 
                onChange={handleExcelFileSelect} 
                accept=".xlsx, .xls, .csv" 
                className="hidden" 
              />
              <UploadCloud className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              {excelFileName ? (
                <div>
                  <p className="text-sm font-bold text-emerald-800">{excelFileName}</p>
                  <p className="text-xs text-emerald-600 mt-1">اضغط لاختيار ملف آخر</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-bold text-slate-800">اضغط هنا لاختيار ملف الإكسيل (.xlsx / .xls)</p>
                  <p className="text-xs text-slate-500 mt-1">يتعرف النظام تلقائياً على أعمدة: الاسم، رقم الشماس، هاتف الأب، تاريخ الميلاد، العنوان، الصف</p>
                </div>
              )}
            </div>

            {/* Parsing Indicator */}
            {parsingExcel && (
              <div className="flex items-center justify-center gap-2 text-emerald-700 py-3 text-sm font-bold">
                <Loader2 className="w-5 h-5 animate-spin" /> جاري قراءة وتجهيز البيانات وتوليد الحسابات...
              </div>
            )}

            {/* Options Checkbox */}
            {parsedRows.length > 0 && !importFinished && (
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-center gap-3">
                <input
                  type="checkbox"
                  id="autoParentsCheckbox"
                  checked={autoCreateParentsOnImport}
                  onChange={e => setAutoCreateParentsOnImport(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded-md focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="autoParentsCheckbox" className="text-xs font-bold text-indigo-950 cursor-pointer select-none">
                  توليد وربط حسابات أولياء الأمور تلقائياً لكل الشمامسة أثناء الاستيراد (استخراج اسم الأب والجد وتعيين كلمة مرور مبدئية)
                </label>
              </div>
            )}

            {/* Preview Table of Extracted Deacons */}
            {parsedRows.length > 0 && !importFinished && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    تم استخراج <span className="text-emerald-600 font-extrabold">{parsedRows.length}</span> شماس جاهز للإنشاء:
                  </span>
                  <span className="text-[11px] text-slate-400">
                    تم توليد أسماء دخول وكلمات مرور عشوائية
                  </span>
                </div>

                <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b">
                      <tr>
                        <th className="p-2.5">#</th>
                        <th className="p-2.5">الاسم</th>
                        <th className="p-2.5">اسم الدخول</th>
                        <th className="p-2.5">كلمة السر المبدئية</th>
                        <th className="p-2.5">الهاتف</th>
                        <th className="p-2.5">الصف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedRows.map((r, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-slate-800">{r.fullName}</td>
                          <td className="p-2.5 font-mono text-blue-600" dir="ltr">{r.username}</td>
                          <td className="p-2.5 font-mono text-emerald-700 bg-emerald-50/50" dir="ltr">{r.password}</td>
                          <td className="p-2.5 text-slate-600" dir="ltr">{r.ownPhone || r.dadPhone || '-'}</td>
                          <td className="p-2.5 text-slate-500">{r.grade || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Progress Bar during Import */}
                {importing && (
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>جاري إنشاء الحسابات في Firebase...</span>
                      <span>{importProgress.current} / {importProgress.total}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Finished Import State */}
            {importFinished && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-full">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-900 text-sm">تم إنشاء وتفعيل الحسابات بنجاح!</h4>
                    <p className="text-xs text-emerald-700">
                      تم حفظ كل البيانات في Firebase Auth و Firestore. يمكنك الآن نسخ أو تنزيل بيانات الدخول لتسليمها للشمامسة.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={handleCopyCredentials}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-colors"
                  >
                    {copiedCredentials ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedCredentials ? 'تم النسخ للحافظة!' : 'نسخ قائمة الحسابات وكلمات المرور'}
                  </button>

                  <button
                    onClick={downloadImportedCredentialsCSV}
                    className="px-4 py-2.5 bg-white border border-emerald-300 hover:bg-emerald-100/50 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    تنزيل ملف بيانات الدخول (Excel/CSV)
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                type="button"
                onClick={() => {
                  setShowExcelModal(false);
                  setParsedRows([]);
                  setExcelFileName('');
                  setImportFinished(false);
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                {importFinished ? 'إغلاق' : 'إلغاء'}
              </button>

              {parsedRows.length > 0 && !importFinished && (
                <button
                  type="button"
                  onClick={handleStartBulkImport}
                  disabled={importing}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {importing ? 'جاري الإنشاء...' : `بدء إنشاء وتفعيل الـ ${parsedRows.length} حساب في Firebase`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 space-y-4 my-8 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600" /> تعديل بيانات: {editingUser.fullName}
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الاسم الكامل</label>
                <input
                  type="text"
                  value={editingUser.fullName || ''}
                  onChange={e => setEditingUser({ ...editingUser, fullName: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">هاتف الشماس</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={editingUser.ownPhone || ''}
                    onChange={e => setEditingUser({ ...editingUser, ownPhone: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 text-left"
                    placeholder="01xxxxxxxxx"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">تاريخ الميلاد</label>
                  <input
                    type="text"
                    value={editingUser.birthDate || ''}
                    onChange={e => setEditingUser({ ...editingUser, birthDate: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                    placeholder="يوم/شهر/سنة"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">هاتف الأب</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={editingUser.dadPhone || ''}
                    onChange={e => setEditingUser({ ...editingUser, dadPhone: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 text-left"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">هاتف الأم</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={editingUser.momPhone || ''}
                    onChange={e => setEditingUser({ ...editingUser, momPhone: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 text-left"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">العنوان السكني</label>
                <input
                  type="text"
                  value={editingUser.address || ''}
                  onChange={e => setEditingUser({ ...editingUser, address: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">الدور (Role)</label>
                  <select
                    value={editingUser.role || 'deacon'}
                    onChange={e => setEditingUser({ ...editingUser, role: e.target.value as Role })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    <option value="deacon">شماس</option>
                    <option value="assistant">خادم</option>
                    <option value="parent">ولي أمر</option>
                    <option value="admin">أدمن (مدير)</option>
                  </select>
                </div>

                {editingUser.role === 'parent' ? (
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1 flex items-center gap-1">
                      <Link2 className="w-3.5 h-3.5 text-amber-600" /> الشماس التابع له (الابن)
                    </label>
                    <select
                      value={editingUser.parentOfDeaconId || ''}
                      onChange={e => setEditingUser({ ...editingUser, parentOfDeaconId: e.target.value })}
                      className="w-full px-3 py-2 bg-amber-50 border border-amber-300 rounded-xl text-xs font-bold text-amber-900 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- اختر الشماس المرتبط --</option>
                      {users.filter(u => u.role === 'deacon').map(d => (
                        <option key={d.id} value={d.id}>{d.fullName} (@{d.username})</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">الصف الدراسي</label>
                    <input
                      type="text"
                      value={editingUser.grade || ''}
                      onChange={e => setEditingUser({ ...editingUser, grade: e.target.value })}
                      placeholder="أولى إعدادي..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">المنطقة</label>
                  <select
                    value={editingUser.areaId || ''}
                    onChange={e => setEditingUser({ ...editingUser, areaId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="">بدون منطقة</option>
                    {areas.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">الفريق</label>
                  <select
                    value={editingUser.teamId || ''}
                    onChange={e => setEditingUser({ ...editingUser, teamId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="">بدون فريق</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2"
                >
                  {editLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Parent Generation Results Modal */}
      {showParentGenModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 md:p-8 space-y-5 my-8 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <HeartHandshake className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">توليد وربط حسابات أولياء الأمور تلقائياً</h3>
                  <p className="text-xs text-slate-500">
                    تم استخراج أسماء الآباء وتوليد الحسابات وربطها بالشمامسة
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowParentGenModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {generatingParents ? (
              <div className="py-12 text-center space-y-3">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
                <p className="text-sm font-bold text-slate-700">جاري فحص وتوليد حسابات أولياء الأمور لجميع الشمامسة في قاعدة البيانات...</p>
                <p className="text-xs text-slate-500">يرجى الانتظار ثوانٍ قليلة</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    نتائج العملية (<span className="text-indigo-600">{parentGenResults.length}</span> حساب):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyParentCredentials}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      {copiedParentCreds ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedParentCreds ? 'تم النسخ!' : 'نسخ البيانات'}
                    </button>
                    <button
                      onClick={downloadParentCredentialsCSV}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      تصدير Excel/CSV
                    </button>
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b">
                      <tr>
                        <th className="p-2.5">#</th>
                        <th className="p-2.5">الشماس</th>
                        <th className="p-2.5">ولي الأمر المستخرج</th>
                        <th className="p-2.5">اسم الدخول</th>
                        <th className="p-2.5">كلمة المرور</th>
                        <th className="p-2.5">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parentGenResults.map((r, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-slate-800">{r.deaconName}</td>
                          <td className="p-2.5 text-indigo-900 font-medium">{r.parentName}</td>
                          <td className="p-2.5 font-mono text-blue-600" dir="ltr">{r.parentUsername}</td>
                          <td className="p-2.5 font-mono text-emerald-700 bg-emerald-50/50" dir="ltr">{r.parentPassword}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              r.status === 'created' ? 'bg-emerald-100 text-emerald-800' :
                              r.status === 'linked' ? 'bg-blue-100 text-blue-800' :
                              r.status === 'skipped' ? 'bg-slate-100 text-slate-700' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {r.status === 'created' ? 'تم الإنشاء' :
                               r.status === 'linked' ? 'تم الربط' :
                               r.status === 'skipped' ? 'مرتبط مسبقاً' : 'فشل'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t">
              <button
                type="button"
                onClick={() => setShowParentGenModal(false)}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
