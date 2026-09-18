import { collection, doc, getDocs, setDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ChorusGroup } from '../types';

// Default initial choruses requested: Chorus 9 through 14
export const DEFAULT_CHORUS_GROUPS: Omit<ChorusGroup, 'createdAt'>[] = [
  {
    id: 'chorus_9',
    name: 'الخورس التاسع',
    code: 'chorus_9',
    order: 9,
    description: 'مجموعة خورس 9 - خدمة القداسات والألحان والتسبحة',
    active: true,
    color: '#3B82F6' // Blue
  },
  {
    id: 'chorus_10',
    name: 'الخورس العاشر',
    code: 'chorus_10',
    order: 10,
    description: 'مجموعة خورس 10 - خدمة القداسات والألحان والتسبحة',
    active: true,
    color: '#8B5CF6' // Purple
  },
  {
    id: 'chorus_11',
    name: 'الخورس الحادي عشر',
    code: 'chorus_11',
    order: 11,
    description: 'مجموعة خورس 11 - خدمة القداسات والألحان والتسبحة',
    active: true,
    color: '#EC4899' // Pink/Rose
  },
  {
    id: 'chorus_12',
    name: 'الخورس الثاني عشر',
    code: 'chorus_12',
    order: 12,
    description: 'مجموعة خورس 12 - خدمة القداسات والألحان والتسبحة',
    active: true,
    color: '#F59E0B' // Amber
  },
  {
    id: 'chorus_13',
    name: 'الخورس الثالث عشر',
    code: 'chorus_13',
    order: 13,
    description: 'مجموعة خورس 13 - خدمة القداسات والألحان والتسبحة',
    active: true,
    color: '#10B981' // Emerald
  },
  {
    id: 'chorus_14',
    name: 'الخورس الرابع عشر',
    code: 'chorus_14',
    order: 14,
    description: 'مجموعة خورس 14 - خدمة القداسات والألحان والتسبحة',
    active: true,
    color: '#06B6D4' // Cyan
  }
];

/**
 * Initialize default choruses in Firestore if collection is empty
 */
export const initDefaultChoruses = async (): Promise<ChorusGroup[]> => {
  try {
    const q = query(collection(db, 'chorus_groups'), orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChorusGroup));
    }

    // Bootstrap default choruses
    const seeded: ChorusGroup[] = [];
    const now = new Date().toISOString();
    for (const chorus of DEFAULT_CHORUS_GROUPS) {
      const item: ChorusGroup = {
        ...chorus,
        createdAt: now
      };
      await setDoc(doc(db, 'chorus_groups', chorus.id), item);
      seeded.push(item);
    }
    return seeded;
  } catch (error) {
    console.warn('Error fetching or bootstrapping chorus groups:', error);
    return DEFAULT_CHORUS_GROUPS.map(c => ({ ...c, createdAt: new Date().toISOString() }));
  }
};
