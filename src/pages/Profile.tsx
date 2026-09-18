import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, Phone, Shield, Lock, CheckCircle, AlertCircle, RefreshCw, Camera, Upload } from 'lucide-react';
import { updatePassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { compressImage } from '../utils/image';

export const Profile = () => {
  const { currentUser, userData, reloadUserData } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newPassword, setNewPassword] = useState('');
  const [phone, setPhone] = useState(userData?.ownPhone || '');
  const [photoBase64, setPhotoBase64] = useState(userData?.photoUrl || '');
  const [loading, setLoading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMsg(null);
    setCompressing(true);

    try {
      const compressed = await compressImage(file, 280, 280, 0.75);
      setPhotoBase64(compressed);
    } catch (err: any) {
      console.error('Image compression error:', err);
      setMsg({ type: 'error', text: err.message || 'تعذر معالجة الصورة المختارة' });
    } finally {
      setCompressing(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      if (newPassword) {
        if (newPassword.length < 6) {
          throw new Error('كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل');
        }
        if (currentUser) {
          await updatePassword(currentUser, newPassword);
        }
      }

      if (currentUser?.uid) {
        await setDoc(doc(db, 'users', currentUser.uid), {
          ownPhone: phone.trim(),
          photoUrl: photoBase64
        }, { merge: true });
      }

      if (userData?.id && userData.id !== currentUser?.uid) {
        try {
          await setDoc(doc(db, 'users', userData.id), {
            ownPhone: phone.trim(),
            photoUrl: photoBase64
          }, { merge: true });
        } catch (e) {
          console.warn('Sync warning:', e);
        }
      }

      await reloadUserData();
      setMsg({ type: 'success', text: 'تم تحديث البيانات بنجاح' });
      setNewPassword('');
    } catch (err: any) {
      console.error(err);
      setMsg({ type: 'error', text: err.message || 'حدث خطأ أثناء حفظ التعديلات' });
    } finally {
      setLoading(false);
    }
  };

  const getRoleName = (r?: string) => {
    switch (r) {
      case 'admin': return 'أدمن (مدير النظام)';
      case 'assistant': return 'خادم (أمين خدمة)';
      case 'parent': return 'ولي أمر';
      default: return 'شماس';
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 text-center">
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="w-24 h-24 mx-auto rounded-full bg-slate-100 flex items-center justify-center border-2 border-blue-500 overflow-hidden mb-3 relative group cursor-pointer"
        >
          {compressing ? (
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
          ) : photoBase64 ? (
            <>
              <img src={photoBase64} alt="profile" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Upload className="w-6 h-6 text-white" />
              </div>
            </>
          ) : (
            <>
              <User className="w-10 h-10 text-slate-400" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </>
          )}
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="image/*" 
          className="hidden" 
        />
        <button 
          type="button" 
          onClick={() => fileInputRef.current?.click()}
          className="text-xs font-bold text-blue-600 hover:text-blue-700 mb-2 inline-block"
        >
          تغيير الصورة الشخصية
        </button>

        <h2 className="text-xl font-bold text-slate-800">{userData?.fullName || 'مستخدم'}</h2>
        <p className="text-sm text-slate-500 mb-2">@{userData?.username || currentUser?.email}</p>
        <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 font-bold rounded-full text-xs">
          {getRoleName(userData?.role)}
        </span>
      </div>

      {msg && (
        <div className={`p-4 rounded-2xl text-sm flex items-center gap-2 ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <form onSubmit={handleUpdate} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base border-b pb-3">
          <User className="w-5 h-5 text-blue-600" /> تعديل البيانات الشخصية
        </h3>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">رقم الهاتف</label>
          <div className="relative">
            <input
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-left focus:outline-none focus:border-blue-500 text-sm"
              placeholder="01xxxxxxxxx"
            />
            <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">تغيير كلمة المرور (اتركه فارغاً إذا لم ترغب في التغيير)</label>
          <div className="relative">
            <input
              type="password"
              dir="ltr"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-left focus:outline-none focus:border-blue-500 text-sm"
              placeholder="••••••••"
            />
            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || compressing}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mt-4"
        >
          {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'حفظ التعديلات'}
        </button>
      </form>
    </div>
  );
};
