import { collection, getDocs, setDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserLevel } from '../types';

export const DEFAULT_LEVELS: UserLevel[] = [
  {
    levelNumber: 1,
    title: 'شماس واعد',
    minPoints: 0,
    badgeColor: 'emerald',
    description: 'مستوى البداية لجميع الشمامسة الجدد'
  },
  {
    levelNumber: 2,
    title: 'شماس نشيط',
    minPoints: 50,
    badgeColor: 'blue',
    description: 'حضور منتظم ومشاركة فعالة في القداسات'
  },
  {
    levelNumber: 3,
    title: 'شماس متقدم (إبصالتس)',
    minPoints: 100,
    badgeColor: 'purple',
    description: 'إتقان المردات والألحان الأساسية'
  },
  {
    levelNumber: 4,
    title: 'شماس متميز (أغنسطس)',
    minPoints: 200,
    badgeColor: 'amber',
    description: 'قراءة الرسائل والالتزام الروحي الكامل'
  },
  {
    levelNumber: 5,
    title: 'شماس قدوة (أبوغالمسيس)',
    minPoints: 350,
    badgeColor: 'rose',
    description: 'رتبة الشمامسة الأوائل والقدوة في الخورس'
  }
];

export const seedDefaultLevelsIfEmpty = async () => {
  try {
    const snap = await getDocs(collection(db, 'levels'));
    if (snap.empty) {
      for (const lvl of DEFAULT_LEVELS) {
        const docId = `level_${lvl.levelNumber}`;
        await setDoc(doc(db, 'levels', docId), lvl);
      }
    }
  } catch (error) {
    console.warn("Could not seed default levels:", error);
  }
};

export interface ComputedLevelInfo {
  levelNumber: number;
  title: string;
  minPoints: number;
  nextLevelPoints: number;
  badgeColor: string;
  bgGradient: string;
  textColor: string;
  description?: string;
  isMaxLevel: boolean;
}

export const calculateDeaconLevel = (points: number, levelsList: UserLevel[] = []): ComputedLevelInfo => {
  const activeLevels = levelsList.length > 0 ? [...levelsList] : [...DEFAULT_LEVELS];
  activeLevels.sort((a, b) => a.levelNumber - b.levelNumber);

  // Find the highest level achieved
  let currentLevel = activeLevels[0];
  let nextLevel: UserLevel | null = activeLevels[1] || null;

  for (let i = 0; i < activeLevels.length; i++) {
    if (points >= activeLevels[i].minPoints) {
      currentLevel = activeLevels[i];
      nextLevel = activeLevels[i + 1] || null;
    }
  }

  const getGradient = (color: string = 'blue') => {
    switch (color) {
      case 'emerald': return 'from-emerald-600 to-teal-500';
      case 'blue': return 'from-blue-600 to-cyan-500';
      case 'purple': return 'from-purple-600 to-indigo-600';
      case 'amber': return 'from-amber-600 to-yellow-500';
      case 'rose': return 'from-rose-600 to-pink-500';
      default: return 'from-blue-600 to-cyan-500';
    }
  };

  const getTextColor = (color: string = 'blue') => {
    switch (color) {
      case 'emerald': return 'text-emerald-300';
      case 'blue': return 'text-blue-300';
      case 'purple': return 'text-purple-300';
      case 'amber': return 'text-amber-300';
      case 'rose': return 'text-rose-300';
      default: return 'text-blue-300';
    }
  };

  const nextPoints = nextLevel ? nextLevel.minPoints : currentLevel.minPoints + 150;

  return {
    levelNumber: currentLevel.levelNumber,
    title: currentLevel.title,
    minPoints: currentLevel.minPoints,
    nextLevelPoints: nextPoints,
    badgeColor: currentLevel.badgeColor || 'blue',
    bgGradient: getGradient(currentLevel.badgeColor),
    textColor: getTextColor(currentLevel.badgeColor),
    description: currentLevel.description,
    isMaxLevel: !nextLevel
  };
};
