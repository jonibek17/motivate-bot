import { Telegraf, Markup } from 'telegraf';
import * as db from './db.js';
import { generateQuote } from './ai.js';
import { rescheduleUser } from './scheduler.js';

// Dictionary of localized system texts
const TEXTS = {
  welcome: {
    ru: 'Привет! Этот бот каждый день в случайное время будет отправлять тебе вдохновляющие послания для мотивации и энергии. 🌟\n\nПожалуйста, выбери язык для цитат:',
    uz: 'Salom! Ushbu bot har kuni tasodifiy vaqtda sizga motivatsiya beruvchi va ruhlantiruvchi hikmatli iqtibos yuboradi. 🌟\n\nIltimos, iqtiboslar tilini tanlang:',
    en: 'Hello! This bot will send you inspiring and motivational quotes every day at a random time. 🌟\n\nPlease select your preferred language:'
  },
  langSelected: {
    ru: 'Выбран Русский язык! 🇷🇺\n\nЭтот бот ежедневно в случайное время присылает глубокие цитаты и мысли великих людей для твоего вдохновения. Время отправки всегда разное, чтобы это было приятным и неожиданным сюрпризом в течение дня.\n\nВ любой момент ты можешь отправить команду /settings, чтобы настроить параметры или получить цитату мгновенно.',
    uz: 'O\'zbek tili tanlandi! 🇺🇿\n\nUshbu bot har kuni kutilmagan vaqtda sizga ilhom bag\'ishlovchi buyuk shaxslarning hikmatli so\'zlarini yuboradi. Yuborish vaqti har safar har xil bo\'ladi, bu esa kun davomida yoqimli syurpriz bo\'lib xizmat qiladi.\n\nSozlamalarni o\'zgartirish yoki istalgan vaqtda tezkor iqtibos olish uchun /settings buyrug\'ini yuboring.',
    en: 'English selected! 🇬🇧\n\nThis bot will send you inspiring quotes from great minds daily at a random time. The sending hour is randomized every day to make it a pleasant surprise.\n\nYou can send /settings at any time to customize your profile or fetch an instant quote.'
  },
  settingsTitle: {
    ru: '⚙️ *Настройки бота*\n\nЗдесь ты можешь изменить язык или отключить/включить уведомления.',
    uz: '⚙️ *Bot sozlamalari*\n\nBu yerda siz tilni o\'zgartirishingiz yoki xabarnomalarni yoqishingiz/o\'chirishingiz mumkin.',
    en: '⚙️ *Bot Settings*\n\nHere you can modify the language or toggle daily notifications.'
  },
  statusNotifications: {
    ru: '\n🔔 Уведомления: *Включены*',
    uz: '\n🔔 Xabarnomalar: *Yoqilgan*',
    en: '\n🔔 Notifications: *Enabled*'
  },
  statusNotificationsOff: {
    ru: '\n🔕 Уведомления: *Выключены*',
    uz: '\n🔕 Xabarnomalar: *O\'chirilgan*',
    en: '\n🔕 Notifications: *Disabled*'
  },
  statusLang: {
    ru: '\n🌐 Язык: *Русский*',
    uz: '\n🌐 Til: *O\'zbek tili*',
    en: '\n🌐 Language: *English*'
  },
  btnChangeLang: {
    ru: 'Изменить язык 🌐',
    uz: 'Tilni o\'zgartirish 🌐',
    en: 'Change Language 🌐'
  },
  btnNotifToggleOff: {
    ru: 'Выключить уведомления ❌',
    uz: 'Xabarnomalarni o\'chirish ❌',
    en: 'Turn Notifications Off ❌'
  },
  btnNotifToggleOn: {
    ru: 'Включить уведомления ✅',
    uz: 'Xabarnomalarni yoqish ✅',
    en: 'Turn Notifications On ✅'
  },
  btnInspire: {
    ru: 'Вдохнови меня сейчас ✨',
    uz: 'Meni hozir ruhlantir ✨',
    en: 'Inspire me now ✨'
  },
  notifDisabledMsg: {
    ru: '🔕 Ежедневные уведомления отключены. Ты больше не будешь получать автоматические цитаты.',
    uz: '🔕 Kundalik xabarnomalar o\'chirildi. Endi sizga avtomatik ravishda iqtiboslar yuborilmaydi.',
    en: '🔕 Daily notifications disabled. You will no longer receive automated quotes.'
  },
  notifEnabledMsg: {
    ru: '🔔 Ежедневные уведомления включены! Бот пришлет тебе следующую цитату в случайное время.',
    uz: '🔔 Kundalik xabarnomalar yoqildi! Bot sizga navbatdagi iqtibosni tasodifiy vaqtda yuboradi.',
    en: '🔔 Daily notifications enabled! The bot will send you the next quote at a random time.'
  },
  generatingQuote: {
    ru: '🔄 Подбираю для тебя лучшие слова...',
    uz: '🔄 Siz uchun eng yaxshi so\'zlarni tayyorlayapman...',
    en: '🔄 Crafting the best words for you...'
  }
};

/**
 * Get user record or create one if it doesn't exist
 */
async function getOrCreateUser(ctx) {
  const telegramId = ctx.from.id;
  const username = ctx.from.username || null;
  const firstName = ctx.from.first_name || 'User';

  const res = await db.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
  if (res.rows.length > 0) {
    return res.rows[0];
  }

  // Insert new user
  const insertRes = await db.query(
    `INSERT INTO users (telegram_id, username, first_name, language_code, notifications_enabled)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (telegram_id) DO UPDATE SET username = $2, first_name = $3
     RETURNING *`,
    [telegramId, username, firstName, 'ru', true]
  );
  return insertRes.rows[0];
}

export function initBot(token) {
  if (!token) {
    console.error('Telegram bot token is missing. Bot cannot be started.');
    return null;
  }

  const bot = new Telegraf(token);

  // Command /start
  bot.start(async (ctx) => {
    try {
      const telegramId = ctx.from.id;
      // Check if user is already registered in DB
      const res = await db.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
      
      if (res.rows.length > 0) {
        // User already agreed and registered, greet them in their language
        const user = res.rows[0];
        const lang = user.language_code || 'ru';
        let greetMsg = 'Рад видеть тебя снова! Используй /settings для изменения настроек или мгновенного напутствия.';
        if (lang === 'uz') greetMsg = 'Sizni qayta ko\'rganimdan xursandman! Sozlamalarni o\'zgartirish yoki tezkor iqtibos olish uchun /settings buyrug\'idan foydalaning.';
        if (lang === 'en') greetMsg = 'Welcome back! Use /settings to change your configuration or get an instant quote.';
        
        await ctx.reply(greetMsg);
        return;
      }

      // If user is new, ask for agreement consent first
      const msg = `Привет! Чтобы бот мог ежедневно присылать тебе мотивацию, нужно согласиться на регистрацию (мы сохраним твоё имя и юзернейм для отображения в панели управления бота).\n\n` +
                  `Salom! Bot har kuni sizga motivatsiya yuborishi uchun ro'yxatdan o'tishga rozilik berishingiz kerak (boshqaruv panelida ko'rsatish uchun ismingiz va foydalanuvchi nomingiz saqlanadi).`;
      
      await ctx.reply(
        msg,
        Markup.inlineKeyboard([
          [Markup.button.callback('Согласен / Roziman ✅', 'agree_consent')]
        ])
      );
    } catch (err) {
      console.error('Error on /start handler:', err);
    }
  });

  // User согласился (Consent callback)
  bot.action('agree_consent', async (ctx) => {
    try {
      // Register user in database
      const user = await getOrCreateUser(ctx);
      
      await ctx.answerCbQuery();
      
      // Prompt language selection
      await ctx.reply(
        'Отлично! Теперь выберите язык для цитат:\n\nAjoyib! Endi iqtiboslar tilini tanlang:',
        Markup.inlineKeyboard([
          [Markup.button.callback('Русский 🇷🇺', 'set_lang_ru')],
          [Markup.button.callback('O\'zbekcha 🇺🇿', 'set_lang_uz')],
          [Markup.button.callback('English 🇬🇧', 'set_lang_en')]
        ])
      );
    } catch (err) {
      console.error('Error in agree_consent callback:', err);
      await ctx.reply('⚠️ Error. Please try starting again with /start.');
    }
  });

  // Language selectors callbacks
  bot.action(/^set_lang_(ru|en|uz)$/, async (ctx) => {
    try {
      const lang = ctx.match[1];
      const telegramId = ctx.from.id;

      await db.query('UPDATE users SET language_code = $1 WHERE telegram_id = $2', [lang, telegramId]);
      
      // Reschedule user notifications starting today/tomorrow
      const nextTime = await rescheduleUser(telegramId, 3);
      console.log(`Bot: User ${telegramId} chose language: ${lang}. Next notification scheduled: ${nextTime}`);

      await ctx.answerCbQuery();
      
      // Send functionality explanation
      await ctx.reply(TEXTS.langSelected[lang]);

      // Instantly generate and send the first quote!
      const statusMsg = await ctx.reply(TEXTS.generatingQuote[lang]);
      const quote = await generateQuote(lang);
      
      // Delete status message and send quote
      await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
      
      let header = '✨ Твоё первое напутствие:';
      if (lang === 'uz') header = '✨ Sizning birinchi hikmatingiz:';
      if (lang === 'en') header = '✨ Your first inspiration:';
      
      await ctx.replyWithMarkdown(`${header}\n\n_${quote}_`);

      // Log the first sent quote
      await db.query(
        'INSERT INTO sent_quotes (telegram_id, quote, language_code) VALUES ($1, $2, $3)',
        [telegramId, quote, lang]
      );
    } catch (err) {
      console.error('Error in language selection callback:', err);
    }
  });

  // Helper to render /settings panel
  async function sendSettings(ctx, user) {
    const lang = user.language_code || 'ru';
    let text = TEXTS.settingsTitle[lang];
    
    text += user.notifications_enabled 
      ? TEXTS.statusNotifications[lang] 
      : TEXTS.statusNotificationsOff[lang];
      
    text += TEXTS.statusLang[lang];

    const keyboard = [
      [Markup.button.callback(TEXTS.btnChangeLang[lang], 'change_lang')],
      [
        user.notifications_enabled
          ? Markup.button.callback(TEXTS.btnNotifToggleOff[lang], 'toggle_notif_off')
          : Markup.button.callback(TEXTS.btnNotifToggleOn[lang], 'toggle_notif_on')
      ],
      [Markup.button.callback(TEXTS.btnInspire[lang], 'instant_quote')]
    ];

    await ctx.replyWithMarkdown(text, Markup.inlineKeyboard(keyboard));
  }

  // Command /settings
  bot.command('settings', async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx);
      await sendSettings(ctx, user);
    } catch (err) {
      console.error('Error in /settings handler:', err);
    }
  });

  // Callback to return to language select
  bot.action('change_lang', async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx);
      const lang = user.language_code || 'ru';
      let promptText = 'Выберите язык:';
      if (lang === 'uz') promptText = 'Tilni tanlang:';
      if (lang === 'en') promptText = 'Choose language:';

      await ctx.answerCbQuery();
      await ctx.reply(
        promptText,
        Markup.inlineKeyboard([
          [Markup.button.callback('Русский 🇷🇺', 'set_lang_ru')],
          [Markup.button.callback('O\'zbekcha 🇺🇿', 'set_lang_uz')],
          [Markup.button.callback('English 🇬🇧', 'set_lang_en')]
        ])
      );
    } catch (err) {
      console.error('Error on change_lang callback:', err);
    }
  });

  // Toggle notifications OFF
  bot.action('toggle_notif_off', async (ctx) => {
    try {
      const telegramId = ctx.from.id;
      const user = await getOrCreateUser(ctx);
      const lang = user.language_code || 'ru';

      await db.query(
        'UPDATE users SET notifications_enabled = FALSE, next_notification_at = NULL WHERE telegram_id = $1',
        [telegramId]
      );

      await ctx.answerCbQuery();
      await ctx.reply(TEXTS.notifDisabledMsg[lang]);
      
      // Re-send updated settings screen
      const updatedUser = { ...user, notifications_enabled: false };
      await sendSettings(ctx, updatedUser);
    } catch (err) {
      console.error('Error on toggle_notif_off:', err);
    }
  });

  // Toggle notifications ON
  bot.action('toggle_notif_on', async (ctx) => {
    try {
      const telegramId = ctx.from.id;
      const user = await getOrCreateUser(ctx);
      const lang = user.language_code || 'ru';

      const nextTime = await rescheduleUser(telegramId, 3);
      await db.query(
        'UPDATE users SET notifications_enabled = TRUE, next_notification_at = $1 WHERE telegram_id = $2',
        [nextTime, telegramId]
      );

      await ctx.answerCbQuery();
      await ctx.reply(TEXTS.notifEnabledMsg[lang]);

      const updatedUser = { ...user, notifications_enabled: true };
      await sendSettings(ctx, updatedUser);
    } catch (err) {
      console.error('Error on toggle_notif_on:', err);
    }
  });

  // Trigger immediate quote
  bot.action('instant_quote', async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx);
      const lang = user.language_code || 'ru';
      
      await ctx.answerCbQuery();
      const statusMsg = await ctx.reply(TEXTS.generatingQuote[lang]);

      // Generate quote
      const quote = await generateQuote(lang);

      // Delete status message and send quote
      await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
      
      let header = '✨ Твоё персональное напутствие:';
      if (lang === 'uz') header = '✨ Sizning shaxsiy iqtibosingiz:';
      if (lang === 'en') header = '✨ Your Personal Inspiration:';
      
      await ctx.replyWithMarkdown(`${header}\n\n_${quote}_`);

      // Log the quote
      await db.query(
        'INSERT INTO sent_quotes (telegram_id, quote, language_code) VALUES ($1, $2, $3)',
        [ctx.from.id, quote, lang]
      );
    } catch (err) {
      console.error('Error in instant_quote callback:', err);
      await ctx.reply('⚠️ Error generating quote. Please try again.');
    }
  });

  // Catch-all message for help
  bot.on('message', async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx);
      const lang = user.language_code || 'ru';
      let msg = 'Используй /settings, чтобы открыть панель настроек или получить мгновенную цитату!';
      if (lang === 'uz') msg = 'Sozlamalar panelini ochish yoki tezkor iqtibos olish uchun /settings buyrug\'idan foydalaning!';
      if (lang === 'en') msg = 'Use /settings to open settings dashboard or fetch an instant quote!';
      
      await ctx.reply(msg);
    } catch (err) {
      console.error('Error in fallback message handler:', err);
    }
  });

  return bot;
}
