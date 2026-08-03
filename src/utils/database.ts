import { Frame, VectorObject, Bone, Layer } from '../types';

export interface SavedAnimationRecord {
  id: string;
  title: string;
  savedAt: number;
  email: string;
  fps: number;
  layers: Layer[];
  objects: { [id: string]: VectorObject };
  frames: Frame[];
  bones: Bone[];
  thumbnailUrl?: string;
}

// Maximum quota allowed for saved animations per user/session
export const MAX_SAVED_ANIMATIONS_QUOTA = 10;

// Local storage keys for our database
const DB_STORAGE_KEY_V2 = 'animastudio_custom_db_v2';
const DB_STORAGE_KEY_V1 = 'animastudio_custom_db';

/**
 * Safely parses JSON with fallback
 */
function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error('Failed to parse database json', e);
    return fallback;
  }
}

/**
 * Loads the raw database list from LocalStorage for v2 schema.
 */
function getRawDbList(): SavedAnimationRecord[] {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY_V2);
    if (!raw) {
      // Migrate v1 legacy single record if exists
      const legacyRaw = localStorage.getItem(DB_STORAGE_KEY_V1);
      if (legacyRaw) {
        const legacyDict = safeJsonParse<Record<string, SavedAnimationRecord>>(legacyRaw, {});
        const migratedList: SavedAnimationRecord[] = [];
        Object.entries(legacyDict).forEach(([email, item]) => {
          if (item && item.savedAt) {
            migratedList.push({
              ...item,
              id: item.id || `anim_${item.savedAt}_${Math.random().toString(36).substring(2, 6)}`,
              title: item.title || 'Saved Animation 1',
              email: item.email || email,
            });
          }
        });
        if (migratedList.length > 0) {
          localStorage.setItem(DB_STORAGE_KEY_V2, JSON.stringify(migratedList));
        }
        return migratedList;
      }
      return [];
    }
    return safeJsonParse<SavedAnimationRecord[]>(raw, []);
  } catch (e) {
    console.error('Failed to parse animastudio local db list', e);
    return [];
  }
}

/**
 * Persists raw database list to LocalStorage.
 */
function saveRawDbList(list: SavedAnimationRecord[]) {
  try {
    localStorage.setItem(DB_STORAGE_KEY_V2, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save to local storage database', e);
  }
}

/**
 * Gets all saved animations for a specific email or guest user.
 */
export function getAllUserSavedAnimations(email: string): SavedAnimationRecord[] {
  const normalizedEmail = (email || 'guest').trim().toLowerCase();
  const all = getRawDbList();
  return all.filter(item => (item.email || 'guest').trim().toLowerCase() === normalizedEmail);
}

/**
 * Gets quota status (e.g. 3 / 10 used).
 */
export function getSavedAnimationsQuotaStatus(email: string): { count: number; max: number; isFull: boolean; remaining: number } {
  const userItems = getAllUserSavedAnimations(email);
  const count = userItems.length;
  const max = MAX_SAVED_ANIMATIONS_QUOTA;
  return {
    count,
    max,
    isFull: count >= max,
    remaining: Math.max(0, max - count),
  };
}

/**
 * Saves a new animation record into the 10-quota database.
 */
export function saveUserAnimationToQuotaDb(
  email: string,
  title: string,
  data: {
    fps: number;
    layers: Layer[];
    objects: { [id: string]: VectorObject };
    frames: Frame[];
    bones: Bone[];
    thumbnailUrl?: string;
  }
): { success: boolean; record?: SavedAnimationRecord; error?: string } {
  try {
    const normalizedEmail = (email || 'guest').trim().toLowerCase();
    const quota = getSavedAnimationsQuotaStatus(normalizedEmail);

    if (quota.isFull) {
      return {
        success: false,
        error: `Quota limit reached (${quota.count}/${quota.max} saved animations). Please delete an existing saved animation to save a new project.`,
      };
    }

    const all = getRawDbList();
    const newRecord: SavedAnimationRecord = {
      id: `anim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: title && title.trim().length > 0 ? title.trim() : `Saved Project ${quota.count + 1}`,
      savedAt: Date.now(),
      email: normalizedEmail,
      fps: data.fps,
      layers: data.layers,
      objects: data.objects,
      frames: data.frames,
      bones: data.bones,
      thumbnailUrl: data.thumbnailUrl,
    };

    all.unshift(newRecord); // Add to beginning of list
    saveRawDbList(all);

    return {
      success: true,
      record: newRecord,
    };
  } catch (e: any) {
    console.error('Error saving animation to database quota:', e);
    return {
      success: false,
      error: e.message || 'Failed to save animation to database.',
    };
  }
}

/**
 * Deletes a specific saved animation by ID.
 */
export function deleteSavedAnimationById(id: string, email: string): boolean {
  try {
    const all = getRawDbList();
    const filtered = all.filter(item => item.id !== id);
    saveRawDbList(filtered);
    return true;
  } catch (e) {
    console.error('Failed to delete saved animation by id', e);
    return false;
  }
}

/**
 * Retrieves a saved animation by ID.
 */
export function getSavedAnimationById(id: string): SavedAnimationRecord | null {
  const all = getRawDbList();
  return all.find(item => item.id === id) || null;
}

/**
 * Legacy compatibility functions:
 */
export function saveUserAnimation(
  email: string,
  data: {
    fps: number;
    layers: Layer[];
    objects: { [id: string]: VectorObject };
    frames: Frame[];
    bones: Bone[];
  }
): SavedAnimationRecord {
  const res = saveUserAnimationToQuotaDb(email, 'Latest Animation', data);
  if (res.record) return res.record;
  // If full, overwrite oldest for legacy caller
  const userItems = getAllUserSavedAnimations(email);
  if (userItems.length > 0) {
    deleteSavedAnimationById(userItems[userItems.length - 1].id, email);
  }
  const retry = saveUserAnimationToQuotaDb(email, 'Latest Animation', data);
  return retry.record!;
}

export function getUserAnimation(email: string): { record: SavedAnimationRecord | null; wasDeleted: boolean } {
  const items = getAllUserSavedAnimations(email);
  if (items.length === 0) return { record: null, wasDeleted: false };
  return { record: items[0], wasDeleted: false };
}

export function deleteUserAnimation(email: string) {
  const items = getAllUserSavedAnimations(email);
  items.forEach(item => deleteSavedAnimationById(item.id, email));
}

/**
 * Validates Gmail authentication logic.
 */
export function validateSimpleAuth(email: string, password: string): { success: boolean; message: string } {
  const trimmedEmail = email.trim();
  const isGmail = trimmedEmail.toLowerCase().endsWith('@gmail.com') && trimmedEmail.includes('@');

  if (!isGmail) {
    return {
      success: false,
      message: 'Invalid email address. Authentication requires a valid @gmail.com address.',
    };
  }

  if (password === '123456' || password === 'password' || password === 'password123') {
    return {
      success: true,
      message: 'Authentication successful!',
    };
  } else {
    return {
      success: false,
      message: 'Incorrect password. (Try using standard passwords like "123456" or "password")',
    };
  }
}
