import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
let aiModel = null;
const isGroq = apiKey && apiKey.startsWith('gsk_');

if (apiKey) {
  if (isGroq) {
    console.log('AI Service: Groq API mode enabled (key detected)');
  } else {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      aiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      console.log('AI Service: Gemini API initialized successfully');
    } catch (error) {
      console.error('AI Service: Failed to initialize Gemini API:', error);
    }
  }
} else {
  console.warn('AI Service: GEMINI_API_KEY is not set. Falling back to pre-defined quotes (demo mode)');
}

// Fallback list of motivational quotes in different languages (with authors)
const FALLBACK_QUOTES = {
  ru: [
    "Верь в себя, даже когда весь мир сомневается.\nКаждый шаг вперёд, каким бы маленьким он ни был, приближает тебя к твоей мечте.\nТы сильнее, чем тебе кажется.\n\n— Кристиан Д. Ларсон",
    "Ошибки — это доказательство того, что ты пытаешься.\nНе останавливайся на полпути к своей цели.\nЗавтрашний успех куется твоими усилиями сегодня.\n\n— Альберт Эйнштейн",
    "Секрет того, чтобы двигаться вперед — это начать.\nРаздели сложные задачи на простые шаги и сделай первый.\nТвои возможности безграничны.\n\n— Марк Твен",
    "Трудности делают нас сильнее, а опыт — мудрее.\nКаждое испытание — это скрытая возможность для роста.\nДержи фокус на своей цели и действуй.\n\n— Рой Т. Беннетт",
    "Успех не приходит к тем, кто ждет.\nОн приходит к тем, кто ежедневно делает шаг навстречу.\nТвое время пришло, начни прямо сейчас.\n\n— Наполеон Хилл"
  ],
  uz: [
    "O'zingizga ishoning, hatto butun dunyo shubha qilsa ham.\nHar bir oldinga tashlangan qadam, qanchalik kichik bo'lmasin, sizni maqsadingizga yaqinlashtiradi.\nSiz o'ylaganingizdan ko'ra kuchliroqsiz.\n\n— Kristian D. Larson",
    "Xatolar — bu harakat qilayotganingizning isbotidir.\nMaqsadingiz sari yarmidan to'xtab qolmang.\nErtangi muvaffaqiyat bugungi harakatlaringiz mahsulidir.\n\n— Albert Eynshteyn",
    "Oldinga intilishning siri — boshlashdir.\nMurakkab vazifalarni oddiy qadamlarga bo'lib, birinchisini boshlang.\nSizning imkoniyatlaringiz cheksizdir.\n\n— Mark Tven",
    "Qiyinchiliklar bizni kuchliroq, tajriba esa donoroq qiladi.\nHar bir sinov — o'sish uchun yashirin imkoniyatdir.\nE'tiboringizni maqsadga qarating va harakat qiling.\n\n— Roy T. Bennett",
    "Muvaffaqiyat kutayotganlarga kelmaydi.\nU har kuni o'z maqsadi sari qadam tashlayotganlarga keladi.\nSizning vaqtingiz keldi, hoziroq boshlang.\n\n— Napoleon Xill"
  ],
  en: [
    "Believe in yourself and all that you are.\nKnow that there is something inside you that is greater than any obstacle.\nYour potential is limitless.\n\n— Christian D. Larson",
    "Mistakes are proof that you are trying.\nDo not stop halfway to your goal.\nTomorrow's success is forged by your efforts today.\n\n— Albert Einstein",
    "The secret of getting ahead is getting started.\nBreak down your complex tasks into small steps and take the first one.\nGreat things take time.\n\n— Mark Twain",
    "Challenges make us stronger, and experience makes us wiser.\nEvery obstacle is a hidden opportunity for growth.\nKeep your eyes on the goal and take action.\n\n— Roy T. Bennett",
    "Success doesn't just find you.\nYou have to go out and get it.\nYour time is now, start today.\n\n— Napoleon Hill"
  ]
};

const DEFAULT_FALLBACKS = [
  "Focus on your goals, not the obstacles.\nEvery day is a new chance to write your story.\nMake it worth reading.\n\n— Unknown",
  "Great things never came from comfort zones.\nPush yourself, because no one else is going to do it for you.\nSuccess starts with self-discipline.\n\n— Unknown"
];

/**
 * Generate a motivational quote using Gemini AI, Groq API, or fallback catalog.
 * @param {string} language - Target language (e.g. 'ru', 'uz', 'en')
 * @returns {Promise<string>} - A motivational quote with author name
 */
export async function generateQuote(language = 'ru') {
  const normalizedLang = language.toLowerCase();
  const lines = Math.floor(Math.random() * 9) + 2; // Randomly choose between 2 and 10 lines

  // If using Groq API key (starts with gsk_)
  if (isGroq) {
    try {
      let targetLang = 'English';
      if (normalizedLang === 'ru') targetLang = 'Russian';
      else if (normalizedLang === 'uz') targetLang = 'Uzbek';

      const prompt = `Generate a powerful, deeply inspiring and motivational quote in ${targetLang} language.
Rules:
1. The quote must be a famous quote from a great, well-known historical or contemporary person.
2. The main text of the quote must be exactly ${lines} lines long. Use real line breaks to separate lines (press Enter), do NOT write the characters backslash-n.
3. At the end of the quote, add a blank line, and then on a new line, add the author's name formatted as '— Author Name' (translated to the target language, e.g. '— Стив Джобс' or '— Albert Einstein').
4. The text should feel modern, encouraging, and emotionally resonant.
5. Return ONLY the text of the quote and the author name. Do not wrap the whole response in quotes, markdown code blocks, or include introductory/explanatory sentences.
6. IMPORTANT: Never use literal backslash-n in your response. Only use real line breaks.`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq API error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      let text = data.choices?.[0]?.message?.content?.trim();
      if (text) {
        // Replace any literal \n that AI might still output with real newlines
        text = text.replace(/\\n/g, '\n');
        return text;
      }
    } catch (error) {
      console.error('Error generating quote with Groq:', error);
    }
  }

  // If using Gemini AI model
  if (aiModel) {
    try {
      let targetLang = 'English';
      if (normalizedLang === 'ru') targetLang = 'Russian';
      else if (normalizedLang === 'uz') targetLang = 'Uzbek';

      const prompt = `Generate a powerful, deeply inspiring and motivational quote in ${targetLang} language.
Rules:
1. The quote must be a famous quote from a great, well-known historical or contemporary person.
2. The main text of the quote must be exactly ${lines} lines long. Use real line breaks to separate lines (press Enter), do NOT write the characters backslash-n.
3. At the end of the quote, add a blank line, and then on a new line, add the author's name formatted as '— Author Name' (translated to the target language, e.g. '— Стив Джобс' or '— Albert Einstein').
4. The text should feel modern, encouraging, and emotionally resonant.
5. Return ONLY the text of the quote and the author name. Do not wrap the whole response in quotes, markdown code blocks, or include introductory/explanatory sentences.
6. IMPORTANT: Never use literal backslash-n in your response. Only use real line breaks.`;

      const result = await aiModel.generateContent(prompt);
      let text = result.response.text().trim();
      if (text && text.split('\n').length >= 1) {
        // Replace any literal \n that AI might still output with real newlines
        text = text.replace(/\\n/g, '\n');
        return text;
      }
    } catch (error) {
      console.error('Error generating quote with Gemini:', error);
    }
  }

  // Fallback catalog implementation
  const quotesList = FALLBACK_QUOTES[normalizedLang] || FALLBACK_QUOTES['en'] || DEFAULT_FALLBACKS;
  const randomIndex = Math.floor(Math.random() * quotesList.length);
  return quotesList[randomIndex];
}
