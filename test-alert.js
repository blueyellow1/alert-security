import 'dotenv/config';

console.log('PORTLG alert test started.');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !chatId) {
  console.log('Telegram haijaunganishwa bado. Tunahitaji kuweka bot token na chat ID.');
} else {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '✅ PORTLG Alert Monitor: Telegram test successful.'
      })
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    console.error('Telegram test failed:', result.description || response.status);
    process.exitCode = 1;
  } else {
    console.log('Telegram test successful. Angalia Telegram yako.');
  }
}
