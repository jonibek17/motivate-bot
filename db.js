import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DB_PATH = path.join(__dirname, 'database', 'db_local.json');

// Initialize local DB if it doesn't exist
if (!fs.existsSync(path.dirname(LOCAL_DB_PATH))) {
  fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
}
if (!fs.existsSync(LOCAL_DB_PATH)) {
  fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify({ users: [], sent_quotes: [] }, null, 2));
}

let pool = null;
const usePostgres = !!process.env.DATABASE_URL;

if (usePostgres) {
  console.log('Database: PostgreSQL (Neon) mode enabled');
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Required for Neon connections in some environments
    }
  });

  // Automatically execute schema initialization on start
  (async () => {
    try {
      const schemaPath = path.join(__dirname, 'database', 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        await pool.query(sql);
        console.log('Database: PostgreSQL tables checked and initialized successfully');
      }
    } catch (err) {
      console.error('Database: Failed to run automatic SQL schema migration:', err);
    }
  })();
} else {
  console.warn('Database: DATABASE_URL not set. Falling back to Local JSON database (demo mode)');
}

// Helper to read local JSON db
function readLocalDb() {
  try {
    const data = fs.readFileSync(LOCAL_DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading local JSON db:', err);
    return { users: [], sent_quotes: [] };
  }
}

// Helper to write local JSON db
function writeLocalDb(data) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing local JSON db:', err);
  }
}

/**
 * Execute a SQL query. If PostgreSQL is not configured, this mock-simulates standard queries.
 * @param {string} text - SQL Query
 * @param {any[]} params - Query parameters
 */
export async function query(text, params = []) {
  if (usePostgres) {
    return pool.query(text, params);
  }

  // MOCK SQL IMPLEMENTATION FOR DEMO MODE
  const db = readLocalDb();
  const normalizedText = text.replace(/\s+/g, ' ').trim().toLowerCase();

  // 1. SELECT FROM users WHERE telegram_id = $1
  if (normalizedText.includes('select * from users where telegram_id =')) {
    const telegramId = Number(params[0]);
    const user = db.users.find(u => Number(u.telegram_id) === telegramId);
    return { rows: user ? [user] : [] };
  }

  // 2. INSERT INTO users ... ON CONFLICT
  if (normalizedText.includes('insert into users') && normalizedText.includes('on conflict')) {
    const [telegram_id, username, first_name, language_code, notifications_enabled, next_notification_at] = params;
    const existingIndex = db.users.findIndex(u => Number(u.telegram_id) === Number(telegram_id));
    const now = new Date().toISOString();

    const userData = {
      telegram_id: Number(telegram_id),
      username,
      first_name,
      language_code: language_code || 'ru',
      notifications_enabled: notifications_enabled !== undefined ? notifications_enabled : true,
      timezone_offset: 3,
      next_notification_at: next_notification_at || null,
      created_at: now,
      updated_at: now
    };

    if (existingIndex > -1) {
      // Update existing
      db.users[existingIndex] = {
        ...db.users[existingIndex],
        username,
        first_name,
        updated_at: now
      };
      if (next_notification_at !== undefined) db.users[existingIndex].next_notification_at = next_notification_at;
    } else {
      db.users.push(userData);
    }
    writeLocalDb(db);
    return { rows: [userData], rowCount: 1 };
  }

  // 3. UPDATE users SET language_code = $1 WHERE telegram_id = $2
  if (normalizedText.includes('update users set language_code =') && normalizedText.includes('where telegram_id =')) {
    const [lang, telegramId] = params;
    const user = db.users.find(u => Number(u.telegram_id) === Number(telegramId));
    if (user) {
      user.language_code = lang;
      user.updated_at = new Date().toISOString();
      writeLocalDb(db);
      return { rows: [user], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 4. UPDATE users SET notifications_enabled = $1, next_notification_at = $2 WHERE telegram_id = $3
  if (normalizedText.includes('update users set notifications_enabled =') && normalizedText.includes('next_notification_at =')) {
    const [enabled, nextTime, telegramId] = params;
    const user = db.users.find(u => Number(u.telegram_id) === Number(telegramId));
    if (user) {
      user.notifications_enabled = enabled;
      user.next_notification_at = nextTime;
      user.updated_at = new Date().toISOString();
      writeLocalDb(db);
      return { rows: [user], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 5. SELECT FROM users WHERE notifications_enabled = true AND (next_notification_at IS NULL OR next_notification_at <= $1)
  if (normalizedText.includes('notifications_enabled = true') && normalizedText.includes('next_notification_at <=')) {
    const checkTime = new Date(params[0]);
    const activeUsers = db.users.filter(u => {
      if (!u.notifications_enabled) return false;
      if (!u.next_notification_at) return true;
      return new Date(u.next_notification_at) <= checkTime;
    });
    return { rows: activeUsers };
  }

  // 6. UPDATE users SET next_notification_at = $1 WHERE telegram_id = $2
  if (normalizedText.includes('update users set next_notification_at =') && normalizedText.includes('where telegram_id =') && params.length === 2) {
    const [nextTime, telegramId] = params;
    const user = db.users.find(u => Number(u.telegram_id) === Number(telegramId));
    if (user) {
      user.next_notification_at = nextTime;
      user.updated_at = new Date().toISOString();
      writeLocalDb(db);
      return { rows: [user], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 7. INSERT INTO sent_quotes (telegram_id, quote, language_code) VALUES ($1, $2, $3)
  if (normalizedText.includes('insert into sent_quotes')) {
    const [telegramId, quote, languageCode] = params;
    const log = {
      id: db.sent_quotes.length + 1,
      telegram_id: Number(telegramId),
      quote,
      language_code: languageCode,
      sent_at: new Date().toISOString()
    };
    db.sent_quotes.push(log);
    writeLocalDb(db);
    return { rows: [log], rowCount: 1 };
  }

  // 8. Dashboard metrics queries:
  // SELECT COUNT(*), COUNT(CASE WHEN notifications_enabled THEN 1 END), ... FROM users
  if (normalizedText.includes('select count(*)') && normalizedText.includes('from users') && !normalizedText.includes('group by')) {
    const total = db.users.length;
    const active = db.users.filter(u => u.notifications_enabled).length;
    return {
      rows: [{
        total_users: String(total),
        active_users: String(active)
      }]
    };
  }

  // SELECT language_code, COUNT(*) FROM users GROUP BY language_code
  if (normalizedText.includes('group by language_code')) {
    const counts = {};
    db.users.forEach(u => {
      counts[u.language_code] = (counts[u.language_code] || 0) + 1;
    });
    const rows = Object.entries(counts).map(([lang, count]) => ({
      language_code: lang,
      count: String(count)
    }));
    return { rows };
  }

  // SELECT sq.*, u.first_name, u.username FROM sent_quotes sq JOIN users u ON sq.telegram_id = u.telegram_id ORDER BY sent_at DESC LIMIT 50
  if (normalizedText.includes('select sq.*') && normalizedText.includes('join users')) {
    const joined = db.sent_quotes.map(sq => {
      const user = db.users.find(u => Number(u.telegram_id) === Number(sq.telegram_id)) || {};
      return {
        ...sq,
        first_name: user.first_name || 'Unknown',
        username: user.username || null
      };
    }).sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at)).slice(0, 50);
    return { rows: joined };
  }

  console.warn(`Unmatched query in local DB mock: ${text}`);
  return { rows: [], rowCount: 0 };
}

// Clean shutdown pool
export async function close() {
  if (pool) {
    await pool.end();
  }
}
