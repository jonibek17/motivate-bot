import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from './db.js';
import { initBot } from './bot.js';
import { startScheduler, checkAndSendQuotes } from './scheduler.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// API Endpoints for Admin Dashboard
app.get('/api/stats', async (req, res) => {
  try {
    // 1. Basic counts
    const countsRes = await db.query(
      `SELECT 
         COUNT(*) as total_users,
         COUNT(CASE WHEN notifications_enabled = TRUE THEN 1 END) as active_users
       FROM users`
    );
    const { total_users, active_users } = countsRes.rows[0] || { total_users: 0, active_users: 0 };

    // 2. Sent quotes total count
    const quotesCountRes = await db.query('SELECT COUNT(*) as total_sent FROM sent_quotes');
    const total_sent = quotesCountRes.rows[0]?.total_sent || 0;

    // 3. Language distribution
    const langRes = await db.query(
      `SELECT language_code, COUNT(*) as count 
       FROM users 
       GROUP BY language_code`
    );
    const languages = langRes.rows.map(row => ({
      code: row.language_code,
      count: parseInt(row.count, 10)
    }));

    res.json({
      totalUsers: parseInt(total_users, 10),
      activeUsers: parseInt(active_users, 10),
      totalSent: parseInt(total_sent, 10),
      languages
    });
  } catch (error) {
    console.error('API Error: /api/stats failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/logs', async (req, res) => {
  try {
    const logsRes = await db.query(
      `SELECT 
         sq.id,
         sq.telegram_id,
         sq.quote,
         sq.language_code,
         sq.sent_at,
         u.first_name,
         u.username
       FROM sent_quotes sq
       LEFT JOIN users u ON sq.telegram_id = u.telegram_id
       ORDER BY sq.sent_at DESC
       LIMIT 50`
    );
    res.json(logsRes.rows);
  } catch (error) {
    console.error('API Error: /api/logs failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to trigger manual notification check (forcing immediate dispatch of pending quotes)
app.post('/api/trigger-scheduler', async (req, res) => {
  try {
    if (bot) {
      await checkAndSendQuotes(bot);
      res.json({ success: true, message: 'Scheduler check executed successfully' });
    } else {
      res.status(400).json({ error: 'Bot is not active' });
    }
  } catch (error) {
    console.error('API Error: Manual trigger failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend assets in production
const frontendBuildPath = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(frontendBuildPath));

app.get('*', (req, res) => {
  // If request doesn't match API, serve frontend index.html
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendBuildPath, 'index.html'), (err) => {
      if (err) {
        res.status(404).send('Dashboard frontend has not been compiled yet. Run production build.');
      }
    });
  } else {
    res.status(404).json({ error: 'Endpoint not found' });
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`Server: Dashboard API listening on port ${PORT}`);
});

// Initialize Telegram Bot
const token = process.env.TELEGRAM_BOT_TOKEN;
let bot = null;

if (token) {
  try {
    bot = initBot(token);
    if (bot) {
      bot.launch();
      console.log('Bot: Telegram Bot service launched successfully');
      
      // Start scheduling loops
      startScheduler(bot);
    }
  } catch (error) {
    console.error('Bot: Error launching Telegram Bot:', error);
  }
} else {
  console.warn('Bot: TELEGRAM_BOT_TOKEN not provided. Telegram services disabled.');
}

// Graceful shutdown logic
process.once('SIGINT', async () => {
  console.log('Stopping application...');
  if (bot) bot.stop('SIGINT');
  await db.close();
  process.exit(0);
});

process.once('SIGTERM', async () => {
  console.log('Stopping application...');
  if (bot) bot.stop('SIGTERM');
  await db.close();
  process.exit(0);
});
