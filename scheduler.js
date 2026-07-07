import cron from 'node-cron';
import * as db from './db.js';
import { generateQuote } from './ai.js';

// Calculate standard UTC time for the next motivational message.
// Schedules randomized time between 10:00 and 20:00 in user's local timezone (default UTC+3).
export function calculateNextSendTime(timezoneOffset = 3) {
  const now = new Date();
  
  // Convert current UTC time to user local time
  const userTime = new Date(now.getTime() + timezoneOffset * 60 * 60 * 1000);
  const userYear = userTime.getUTCFullYear();
  const userMonth = userTime.getUTCMonth();
  const userDate = userTime.getUTCDate();
  const userHour = userTime.getUTCHours();

  const targetDate = new Date(userTime);
  let targetHour;
  let targetMinute;

  const startHour = 10;
  const endHour = 20;

  if (userHour < endHour - 1) {
    // Schedule for today
    const minHour = Math.max(userHour + 1, startHour);
    targetHour = minHour + Math.floor(Math.random() * (endHour - minHour));
    targetMinute = Math.floor(Math.random() * 60);
  } else {
    // Schedule for tomorrow
    targetDate.setUTCDate(userDate + 1);
    targetHour = startHour + Math.floor(Math.random() * (endHour - startHour));
    targetMinute = Math.floor(Math.random() * 60);
  }

  targetDate.setUTCHours(targetHour, targetMinute, 0, 0);

  // Convert back to UTC Date
  return new Date(targetDate.getTime() - timezoneOffset * 60 * 60 * 1000);
}

/**
 * Update the schedule for a single user
 */
export async function rescheduleUser(telegramId, timezoneOffset = 3) {
  const nextTime = calculateNextSendTime(timezoneOffset);
  await db.query(
    'UPDATE users SET next_notification_at = $1 WHERE telegram_id = $2',
    [nextTime, telegramId]
  );
  return nextTime;
}

/**
 * Main polling function to check and send due quotes
 * @param {import('telegraf').Telegraf} botInstance 
 */
export async function checkAndSendQuotes(botInstance) {
  try {
    const now = new Date();
    // Query users whose notification time has passed
    const res = await db.query(
      `SELECT * FROM users 
       WHERE notifications_enabled = TRUE 
       AND (next_notification_at IS NULL OR next_notification_at <= $1)`,
      [now]
    );

    const dueUsers = res.rows;
    if (dueUsers.length === 0) return;

    console.log(`Scheduler: Found ${dueUsers.length} users due for quotes.`);

    for (const user of dueUsers) {
      try {
        const lang = user.language_code || 'ru';
        const quote = await generateQuote(lang);

        // Format message beautifully
        let header = '🌟 Thought of the Day:';
        if (lang === 'ru') header = '🌟 Напутствие дня:';
        else if (lang === 'uz') header = '🌟 Kun hikmati:';
        
        const formattedMessage = `${header}\n\n_${quote}_`;

        // Send message via Telegram
        await botInstance.telegram.sendMessage(user.telegram_id, formattedMessage, {
          parse_mode: 'Markdown'
        });

        // Log sent quote
        await db.query(
          'INSERT INTO sent_quotes (telegram_id, quote, language_code) VALUES ($1, $2, $3)',
          [user.telegram_id, quote, lang]
        );

        // Schedule next notification for tomorrow
        const nextTime = calculateNextSendTime(user.timezone_offset);
        await db.query(
          'UPDATE users SET next_notification_at = $1 WHERE telegram_id = $2',
          [nextTime, user.telegram_id]
        );

        console.log(`Scheduler: Quote sent to user ${user.telegram_id} (${user.first_name}). Next run: ${nextTime}`);
      } catch (err) {
        console.error(`Scheduler: Error sending quote to user ${user.telegram_id}:`, err);
        // Delay next try by 30 mins to avoid spamming errors
        const retryTime = new Date(Date.now() + 30 * 60 * 1000);
        await db.query(
          'UPDATE users SET next_notification_at = $1 WHERE telegram_id = $2',
          [retryTime, user.telegram_id]
        );
      }
    }
  } catch (error) {
    console.error('Scheduler: Error in polling loop:', error);
  }
}

/**
 * Initialize cron schedule to run every minute
 * @param {import('telegraf').Telegraf} botInstance
 */
export function startScheduler(botInstance) {
  console.log('Scheduler: Daily quotes scheduler started (polling every minute)');
  
  // Run every minute
  cron.schedule('* * * * *', () => {
    checkAndSendQuotes(botInstance);
  });
}
