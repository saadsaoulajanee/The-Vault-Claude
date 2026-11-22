// Shared constants and pure helpers. No DOM here, so everything can be unit-tested in Node.
// STATUSES keeps the exact order of v4 so existing data maps over unchanged.
export const STATUSES = [
  ['🔍', 'Questions research'], ['✍️', 'Questions ready'], ['🎥', 'To film'], ['✂️', 'To edit'],
  ['👀', 'To validate'], ['📅', 'Long format scheduled'], ['📱', 'Shorts scheduled'],
  ['🔗', 'Linktree updated'], ['🎉', 'Published'], ['⏸️', 'On hold'], ['❌', 'Cancelled'],
  ['📥', 'Footage transferred'], ['🗂️', 'Footage organized & backed up'],
  ['🎞️', 'Audio/video synchronized'], ['✂️', 'Rough cut'], ['🎬', 'Fine cut'],
  ['🎨', 'Color & audio finishing'], ['🖼️', 'Thumbnail in progress'], ['📝', 'Metadata prepared'],
  ['✅', 'Final review'],
];

export const GROUPS = ['Prep', 'Film', 'Edit', 'Scheduled', 'Published', 'Parked'];

export function groupOf(status) {
  const s = Number(status);
  if (s === 0 || s === 1) return 'Prep';
  if (s === 2 || s === 11) return 'Film';
  if (s === 5 || s === 6 || s === 7) return 'Scheduled';
  if (s === 8) return 'Published';
  if (s === 9 || s === 10) return 'Parked';
  return 'Edit';
}

export const isActive = (e) => e.status !== 8 && e.status !== 9 && e.status !== 10;

export const DEFAULT_PACKING = [
  'Pyjama haut', 'Pyjama bas', 'Caleçons', 'Chaussettes', '2 Chemise', '2 Pantalon', 'Back up tenue',
  'Lisseur', 'Sèche cheveux', 'Pied de téléphone', 'Huile cheveux', 'Brosse', 'Vaporisateur',
  '3ème pièce costard', 'Chaussures', 'Chargeur USB-C', 'Moisturizer', 'Chargeur USB', 'Passeport',
  'Multiprises', 'Rallonge', 'Montre', 'Chargeur montre', 'Lint roll', 'Caméra ZV-1', 'Caméra ZV-E10',
  'Micro cravate x2', 'Light', 'Trépied x2', 'Micro', 'Tablette', 'Chargeur tablette', 'Disque dur',
  'Câbles chargeurs micros', 'Câble ventilateur', 'Ventilateur x2', 'Câble ZV-1',
];

export const DEFAULT_PRECON_TASKS = [
  'Confirm press accreditation and interview schedule',
  'Download tickets, confirmations and convention information',
  'Confirm hotel booking and travel arrangements',
  'Prepare guest research and interview questions',
  'Check weather and plan outfits',
  'Charge camera batteries, power banks and audio equipment',
  'Clear and format memory cards after verifying backups',
  'Pack chargers, cables, adapters and backup storage',
];

export const DEFAULT_SETUP_TASKS = [
  'Set up all three cameras and confirm recording media',
  'Set camera framing: host, guest and two-shot',
  'Set focus and exposure on every camera',
  'Match white balance and color settings across cameras',
  'Set up microphones and check audio levels',
  'Record a short test clip and check picture and sound',
  'Check battery/power and remaining card capacity',
  'Confirm all cameras are recording before starting',
];

export const EXPENSE_CATEGORIES = ['Travel', 'Accommodation', 'Convention tickets', 'Autographs & photo ops', 'Food', 'Shopping', 'Other'];
export const PROJECT_TYPES = ['Film', 'TV series', 'Theatre', 'Video game', 'Voice', 'Other'];
export const ROOM_KINDS = [
  ['panel', 'Panel room'], ['interview', 'Interview room'], ['photoshoot', 'Photoshoot room'],
  ['autographs', 'Autographs'], ['meeting', 'Meeting room'], ['other', 'Other'],
];

export const DEFAULT_GAME_FORMATS = [
  { id: 'this-or-that', name: 'This or That', examples: [] },
  { id: 'would-you-rather', name: 'Would You Rather', examples: [] },
  { id: 'rank', name: 'Rank These', examples: [] },
  { id: 'character', name: 'Character Challenge', examples: [] },
  { id: 'custom', name: 'Custom Game', examples: [] },
];

/** Starter prompts for a game format. Credits are used only for what the host saved, never invented. */
export function starterPrompts(type, guest, formats = DEFAULT_GAME_FORMATS) {
  const saved = formats.find((f) => f.id === type);
  if (saved?.examples?.length) return saved.examples.slice();
  const projects = (guest?.projects || []).filter((p) => p.title);
  if (type === 'this-or-that') return ['Rehearsals or improvisation?', 'Early call times or late night shoots?', 'Hero or villain?', 'Comedy or drama?', 'Auditions or first day on set?', 'Play yourself or someone completely different?'];
  if (type === 'would-you-rather') return ['Would you rather instantly memorize any script or never forget a face?', 'Would you rather play a detective or an undercover spy?', 'Would you rather direct one episode or write one episode?', 'Would you rather improvise an entire scene or learn a ten-page monologue?', 'Would you rather revisit your first role or jump ahead to a role ten years from now?'];
  if (type === 'rank') return ['Rank these from most to least nerve-racking: audition, first read-through, first day on set.', 'Rank these from most to least useful: rehearsal time, a great scene partner, a surprising script.', 'Rank these by your personal preference: comedy, drama, mystery.'];
  if (type === 'character') {
    return projects.length
      ? projects.slice(0, 6).map((p) => { const who = p.role || p.characterName; return `Describe your character${who ? ' ' + who : ''} from ${p.title} in three words, without explaining why until afterward.`; })
      : ["Describe a character you've played in three words and let me guess who it is.", 'Choose a past character and describe their ideal vacation without naming them.'];
  }
  return [];
}

// ---- dates (ISO yyyy-mm-dd strings, no time zones involved)
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const isIso = (s) => ISO.test(String(s || ''));
const utc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const weekdayName = (iso) => (isIso(iso) ? DAYS[new Date(utc(iso)).getUTCDay()] : '');

/** Every date from start to end inclusive (at most 14 days, to stay sane on bad data). */
export function datesBetween(start, end) {
  if (!isIso(start)) return [];
  const last = isIso(end) && utc(end) >= utc(start) ? end : start;
  const out = [];
  for (let t = utc(start); t <= utc(last) && out.length < 14; t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Does a stored day (a date, or a weekday name from v4) refer to this date? */
export const matchesDay = (value, iso) => !!value && (value === iso || String(value).toLowerCase() === weekdayName(iso).toLowerCase());

/** The date an interview happens at the convention. Handles v4 weekday names. */
export function interviewDate(e, c) {
  if (isIso(e?.interviewDay)) return e.interviewDay;
  const range = c ? datesBetween(c.startDate, c.endDate || c.startDate) : [];
  if (e?.interviewDay) {
    const hit = range.find((d) => weekdayName(d).toLowerCase() === String(e.interviewDay).toLowerCase());
    if (hit) return hit;
  }
  return isIso(e?.date) && (!range.length || range.includes(e.date)) ? e.date : '';
}

export function timeToMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export const episodeGuestIds = (e) => (Array.isArray(e?.guestIds) && e.guestIds.length ? e.guestIds : e?.guestId ? [e.guestId] : []);
