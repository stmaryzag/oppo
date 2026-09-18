import { UserData } from '../types';
import { createAuthUser } from '../lib/adminAuth';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

/**
 * Extracts parent full name from deacon full name
 * e.g. "أنطون عادل جرجس" -> "عادل جرجس"
 * e.g. "بيشوي عماد جرجس فهمي" -> "عماد جرجس فهمي"
 * e.g. "مينا سامح" -> "سامح"
 */
export function extractParentName(deaconFullName: string): string {
  if (!deaconFullName) return 'ولي أمر';
  const parts = deaconFullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 3) {
    return parts.slice(1).join(' ');
  } else if (parts.length === 2) {
    return parts[1];
  }
  return `ولي أمر ${deaconFullName.trim()}`;
}

/**
 * Generates a standard parent username from deacon's username
 * e.g. "anton.adel" -> "p_anton.adel"
 */
export function generateParentUsername(deaconUsername: string): string {
  const clean = (deaconUsername || 'deacon').replace(/^p_|^parent\./, '');
  return `p_${clean}`;
}

export interface ParentCreationResult {
  deaconId: string;
  deaconName: string;
  parentName: string;
  parentUsername: string;
  parentPassword: string;
  status: 'created' | 'linked' | 'skipped' | 'failed';
  message: string;
}

/**
 * Creates and links a parent account for a specific deacon
 */
export async function createAndLinkParentAccount(
  deacon: UserData,
  existingUsers: UserData[]
): Promise<ParentCreationResult> {
  const parentName = extractParentName(deacon.fullName);
  const parentUsername = generateParentUsername(deacon.username);
  const parentPassword = deacon.tempPassword || '123456';
  const parentEmail = `${parentUsername}@deacons-app.local`;

  // Check if a parent account already exists for this deacon
  const existingParent = existingUsers.find(
    u => u.role === 'parent' && (u.parentOfDeaconId === deacon.id || u.username === parentUsername)
  );

  if (existingParent) {
    // If it exists but wasn't linked properly, update link
    if (existingParent.parentOfDeaconId !== deacon.id) {
      await setDoc(doc(db, 'users', existingParent.id), {
        parentOfDeaconId: deacon.id,
        fullName: existingParent.fullName || parentName
      }, { merge: true });
      return {
        deaconId: deacon.id,
        deaconName: deacon.fullName,
        parentName: existingParent.fullName || parentName,
        parentUsername: existingParent.username,
        parentPassword: '(كلمة المرور الحالية)',
        status: 'linked',
        message: `تم ربط حساب ولي الأمر الموجود مسبقاً (${existingParent.fullName})`
      };
    }

    return {
      deaconId: deacon.id,
      deaconName: deacon.fullName,
      parentName: existingParent.fullName,
      parentUsername: existingParent.username,
      parentPassword: '(موجود مسبقاً)',
      status: 'skipped',
      message: 'حساب ولي الأمر مرتبط بالفعل مسبقاً'
    };
  }

  // Create new parent account
  try {
    let uid = '';
    try {
      const authUser = await createAuthUser(parentEmail, parentPassword);
      uid = authUser.uid;
    } catch (authErr: any) {
      if (authErr.code === 'auth/email-already-in-use') {
        uid = `uid_${parentUsername.replace(/[^a-zA-Z0-9]/g, '_')}`;
      } else {
        throw authErr;
      }
    }

    const parentDocId = uid || `uid_${parentUsername}`;
    await setDoc(doc(db, 'users', parentDocId), {
      fullName: parentName,
      username: parentUsername,
      role: 'parent',
      parentOfDeaconId: deacon.id,
      ownPhone: deacon.dadPhone || deacon.parentPhone || deacon.momPhone || '',
      address: deacon.address || '',
      tempPassword: parentPassword,
      isFirstLogin: true,
      createdAt: new Date().toISOString()
    }, { merge: true });

    return {
      deaconId: deacon.id,
      deaconName: deacon.fullName,
      parentName,
      parentUsername,
      parentPassword,
      status: 'created',
      message: `تم إنشاء حساب ولي الأمر بنجاح (${parentName})`
    };
  } catch (err: any) {
    console.error(`Failed to create parent for ${deacon.fullName}:`, err);
    return {
      deaconId: deacon.id,
      deaconName: deacon.fullName,
      parentName,
      parentUsername,
      parentPassword,
      status: 'failed',
      message: err.message || 'فشل في إنشاء الحساب'
    };
  }
}
