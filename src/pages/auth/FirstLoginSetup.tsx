import React, { useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { updatePassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Loader2, Camera, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { compressImage } from '../../utils/image';

export const FirstLoginSetup = () => {
  const { currentUser, userData, reloadUserData } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState(userData?.ownPhone || '');
  const [photoBase64, setPhotoBase64] = useState(userData?.photoUrl || '');
  
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setCompressing(true);

    try {
      // Automatically compress and resize to ~25KB JPEG for fast & reliable Firestore saving
      const compressed = await compressImage(file, 280, 280, 0.75);
      setPhotoBase64(compressed);
    } catch (err: any) {
      console.error('Image compression error:', err);
      setError(err.message || 'تعذر معالجة الصورة، يرجى اختيار صورة أخرى');
    } finally {
      setCompressing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newPassword || newPassword.length < 6) {
      setError('كلمة المرور يجب أن تتكون من 6 أحرف أو أرقام على الأقل');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('كلمات المرور غير متطابقة');
      return;
    }

    if (!photoBase64) {
      setError('يجب اختيار ورفع صورة شخصية للمتابعة');
      return;
    }

    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 10) {
      setError('يرجى إدخال رقم هاتف صحيح (10 أرقام على الأقل)');
      return;
    }

    if (!currentUser) {
      setError('الجلسة منتهية، يرجى إعادة تسجيل الدخول');
      return;
    }

    setLoading(true);
    try {
      // 1. Update Password in Firebase Auth
      await updatePassword(currentUser, newPassword);

      // 2. Update user doc in Firestore (merging ensures safe write even if fields are partial)
      const targetUid = currentUser.uid;
      await setDoc(doc(db, 'users', targetUid), {
        photoUrl: photoBase64,
        ownPhone: cleanPhone,
        isFirstLogin: false
      }, { merge: true });

      // If userData has a legacy custom ID, update it too
      if (userData?.id && userData.id !== targetUid) {
        try {
          await setDoc(doc(db, 'users', userData.id), {
            photoUrl: photoBase64,
            ownPhone: cleanPhone,
            isFirstLogin: false
          }, { merge: true });
        } catch (subErr) {
          console.warn('Sub-doc sync notice:', subErr);
        }
      }

      // 3. Reload user data and redirect to dashboard
      await reloadUserData();
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('First login setup error:', err);
      if (err.code === 'auth/requires-recent-login') {
        setError('انتهت صلاحية الجلسة لتغيير كلمة المرور. يرجى تسجيل الخروج والدخول مجدداً.');
      } else if (err.code === 'auth/weak-password') {
        setError('كلمة المرور ضعيفة جداً، يرجى اختيار كلمة مرور أقوى (6 خانات أو أكثر).');
      } else {
        setError(err.message || 'حدث خطأ أثناء حفظ البيانات، يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-8" dir="rtl">
      <div className="sm:mx-auto sm:w-full sm:max-w-md mb-6">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full mb-3">
            <CheckCircle2 className="w-3.5 h-3.5" /> الخطوة الأولى والوحيدة
          </span>
          <h2 className="text-2xl font-extrabold text-slate-900">
            إعداد حساب الشماس لأول مرة
          </h2>
          <p className="mt-2 text-xs text-slate-600">
            أهلاً بك يا <span className="font-bold text-slate-800">{userData?.fullName || 'شماسنا الحبيب'}</span>، يرجى تعيين كلمة سر جديدة ورفع صورتك لتأكيد وتفعيل الحساب.
          </p>
        </div>
      </div>

      <div className="bg-white py-7 px-6 shadow-sm rounded-3xl border border-slate-100 sm:mx-auto sm:w-full sm:max-w-md">
        <form className="space-y-5" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 text-red-700 p-3.5 rounded-2xl text-xs border border-red-100 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Photo Upload with auto-compression */}
          <div className="flex flex-col items-center justify-center gap-2">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-28 h-28 rounded-full border-2 border-dashed border-blue-300 hover:border-blue-500 flex items-center justify-center bg-blue-50/50 cursor-pointer overflow-hidden relative group transition-all shadow-inner"
            >
              {compressing ? (
                <div className="flex flex-col items-center justify-center text-blue-600 gap-1">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-[10px] font-bold">جاري المعالجة...</span>
                </div>
              ) : photoBase64 ? (
                <>
                  <img src={photoBase64} alt="Profile" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Upload className="w-6 h-6 text-white" />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400 group-hover:text-blue-600 transition-colors">
                  <Camera className="w-8 h-8 mb-1" />
                  <span className="text-[10px] font-bold">رفع صورة</span>
                </div>
              )}
            </div>
            <span className="text-xs font-bold text-slate-700">اضغط لرفع الصورة الشخصية (إجباري)</span>
            <span className="text-[10px] text-slate-400">تُضغط الصورة تلقائياً لضمان سرعة التحميل</span>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              className="hidden" 
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              رقم الهاتف الشخصي للشماس
            </label>
            <input
              type="tel"
              required
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01xxxxxxxxx"
              className="appearance-none block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-left text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              كلمة المرور الجديدة (6 أحرف أو أرقام على الأقل)
            </label>
            <input
              type="password"
              required
              dir="ltr"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="appearance-none block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-left text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              تأكيد كلمة المرور الجديدة
            </label>
            <input
              type="password"
              required
              dir="ltr"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="appearance-none block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-left text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading || compressing}
            className="w-full flex justify-center py-3 px-4 rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ وتفعيل الحساب'}
          </button>
        </form>
      </div>
    </div>
  );
};
