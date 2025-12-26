import TelegramBot from 'node-telegram-bot-api'

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })

bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, 'Играть', {
    reply_markup: {
      web_app: {
        url: 'https://YOUR_APP.netlify.app'
      }
    }
  })
})
