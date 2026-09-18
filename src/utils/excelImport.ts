import * as XLSX from 'xlsx';

export interface ParsedDeaconRow {
  fullName: string;
  username: string;
  password: string;
  birthDate: string;
  ownPhone: string;
  dadPhone: string;
  momPhone: string;
  parentPhone: string;
  address: string;
  grade: string;
}

// Arabic transliteration map for generating friendly English usernames
const ARABIC_TRANSLIT: Record<string, string> = {
  'يوسف': 'youssef',
  'بيشوي': 'bishoy',
  'بيشوى': 'bishoy',
  'بيتر': 'peter',
  'أنطون': 'anton',
  'انطون': 'anton',
  'بيمن': 'bemen',
  'عازر': 'azer',
  'جيفاري': 'geffary',
  'چڤارى': 'geffary',
  'جڤارى': 'geffary',
  'جفاري': 'geffary',
  'مايكل': 'michael',
  'كاراس': 'karas',
  'كراس': 'karas',
  'مناهرى': 'manahery',
  'مناهري': 'manahery',
  'كيفين': 'kevin',
  'كفن': 'kevin',
  'جورج': 'george',
  'چورچ': 'george',
  'كيرلس': 'kyrillos',
  'مينا': 'mina',
  'داني': 'danny',
  'دانيال': 'daniel',
  'شنوده': 'shenouda',
  'شنودة': 'shenouda',
  'فيلوباتير': 'philopateer',
  'فيلوباتير ': 'philopateer',
  'ماثيو': 'matthew',
  'ماتي': 'matthew',
  'بيير': 'pierre',
  'مكسيموس': 'maximus',
  'كيروس': 'cyrus',
  'فايز': 'faiez',
  'تامر': 'tamer',
  'هاني': 'hany',
  'هانى': 'hany',
  'عادل': 'adel',
  'ميلاد': 'milad',
  'فادي': 'fady',
  'فادى': 'fady',
  'عصمت': 'esmat',
  'متياس': 'metias',
  'ميشيل': 'michel',
  'مختار': 'mokhtar',
  'نظمي': 'nazmy',
  'نظمى': 'nazmy',
  'سامح': 'sameh',
  'شكري': 'shokry',
  'شكرى': 'shokry',
  'مجدي': 'magdy',
  'مجدى': 'magdy',
  'ابراهيم': 'ibrahim',
  'إبراهيم': 'ibrahim',
  'جمال': 'gamal',
  'فريد': 'farid',
  'سعيد': 'saeed',
  'فتحي': 'fathy',
  'فتحى': 'fathy',
  'عماد': 'emad',
  'سامي': 'samy',
  'سامى': 'samy',
  'بولس': 'boulos',
  'أمير': 'amir',
  'امير': 'amir',
  'عوض': 'awad',
  'جرجس': 'gerges',
  'سمير': 'samir',
  'عزيز': 'aziz',
  'كرم': 'karam',
  'ماجد': 'maged',
  'كمال': 'kamal',
  'شوقي': 'shawky',
  'شوقى': 'shawky',
  'فهمي': 'fahmy',
  'فهمى': 'fahmy',
  'عطية': 'attia',
  'عطيه': 'attia'
};

/**
 * Converts Arabic name to clean English username (e.g. "يوسف فايز" -> "youssef.faiez")
 */
export const generateUsername = (name: string, index: number): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return `deacon.${index + 1}`;

  const transliteratedParts = parts.slice(0, 2).map((part) => {
    const cleaned = part.replace(/[^\u0621-\u064A]/g, '');
    if (ARABIC_TRANSLIT[cleaned]) {
      return ARABIC_TRANSLIT[cleaned];
    }
    // Simple phonetic character by character fallback
    const charMap: Record<string, string> = {
      'ا': 'a', 'أ': 'a', 'إ': 'e', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th',
      'ج': 'g', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z',
      'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a',
      'غ': 'gh', 'ف': 'f', 'ق': 'k', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
      'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'y', 'ئ': 'e', 'ء': 'a', 'ة': 'a'
    };
    const chars = cleaned.split('').map(c => charMap[c] || '').join('');
    return chars || 'deacon';
  });

  const base = transliteratedParts.join('.').toLowerCase().replace(/[^a-z0-9.]/g, '');
  return base || `deacon.${index + 1}`;
};

/**
 * Generates a random 6-digit password
 */
export const generateRandomPassword = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Parses an Excel or CSV file buffer and maps headers intelligently
 */
export const parseExcelFile = async (file: File): Promise<ParsedDeaconRow[]> => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to JSON array of objects
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

  const usedUsernames = new Set<string>();

  const parsed: ParsedDeaconRow[] = rawRows.map((row, index) => {
    // Flexible column finder
    const getVal = (...keys: string[]): string => {
      for (const k of keys) {
        const foundKey = Object.keys(row).find(
          rk => rk.trim().toLowerCase() === k.trim().toLowerCase() ||
                rk.trim().includes(k.trim())
        );
        if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
          return String(row[foundKey]).trim();
        }
      }
      return '';
    };

    const fullName = getVal('الاسم الكامل', 'الاسم', 'اسم الشماس', 'Name', 'FullName') || `شماس ${index + 1}`;
    const birthDate = getVal('تاريخ الميلاد', 'الميلاد', 'BirthDate', 'Birth');
    const ownPhone = getVal('رقم الشماس', 'رقم الهاتف', 'الموبايل', 'الهاتف', 'Phone', 'Mobile');
    const dadPhone = getVal('رقم الاب', 'هاتف الاب', 'موبايل الاب', 'تليفون الاب', 'DadPhone');
    const momPhone = getVal('رقم الام', 'هاتف الام', 'موبايل الام', 'تليفون الام', 'MomPhone');
    const parentPhone = getVal('هاتف الوالدين', 'رقم الوالد', 'رقم الوالدة', 'ParentPhone') || dadPhone || momPhone;
    const address = getVal('العنوان', 'العنوان بالتفصيل', 'السكن', 'المحل', 'Address');
    const grade = getVal('الصف', 'الصف الدراسي', 'المرحلة', 'السنة الدراسية', 'Grade');

    // Generate unique username
    let username = generateUsername(fullName, index);
    let suffix = 1;
    while (usedUsernames.has(username)) {
      username = `${generateUsername(fullName, index)}${suffix}`;
      suffix++;
    }
    usedUsernames.add(username);

    const password = generateRandomPassword();

    return {
      fullName,
      username,
      password,
      birthDate,
      ownPhone,
      dadPhone,
      momPhone,
      parentPhone,
      address,
      grade
    };
  });

  return parsed.filter(p => p.fullName && p.fullName.trim() !== '');
};
