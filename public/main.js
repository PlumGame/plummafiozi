import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
import { ROLES } from './roles.js'

/* =========================
   Telegram Web App
========================= */

const tg = window.Telegram.WebApp
tg.ready()

const user = tg.initDataUnsafe?.user

if (!user) {
  document.body.innerHTML = 'Откройте приложение через Telegram'
  throw new Error('No Telegram user')
}

const telegramId = user.id

/* =========================
   Supabase
========================= */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

/* =========================
   UI
========================= */

const app = document.getElementById('app')
const joinBtn = document.getElementById('joinBtn')

joinBtn.addEventListener('click', joinGame)

/* =========================
   Game Logic
========================= */

async function joinGame() {
  joinBtn.disabled = true

  // 1. Получаем или создаём комнату
  let roomId = await getOrCreateRoom()

  // 2. Добавляем игрока
  await addPlayer(roomId)

  // 3. Назначаем роли (если ещё не назначены)
  await assignRoles(roomId)

  // 4. Получаем свою роль
  const role = await getMyRole(roomId)

  // 5. Показываем карточку
  showRoleCard(role)
}

/* =========================
   Supabase functions
========================= */

async function getOrCreateRoom() {
  const { data: rooms } = await supabase
    .from('rooms')
    .select('*')
    .eq('status', 'waiting')
    .limit(1)

  if (rooms.length > 0) {
    return rooms[0].id
  }

  const { data: room } = await supabase
    .from('rooms')
    .insert({ status: 'waiting' })
    .select()
    .single()

  return room.id
}

async function addPlayer(roomId) {
  const { data: existing } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', roomId)
    .eq('telegram_id', telegramId)

  if (existing.length > 0) return

  await supabase.from('players').insert({
    room_id: roomId,
    telegram_id: telegramId
  })
}

async function assignRoles(roomId) {
  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', roomId)

  // если роли уже назначены — ничего не делаем
  if (players.every(p => p.role)) return

  // перемешиваем роли
  const shuffledRoles = [...ROLES].sort(() => Math.random() - 0.5)

  for (let i = 0; i < players.length; i++) {
    await supabase
      .from('players')
      .update({ role: shuffledRoles[i % shuffledRoles.length] })
      .eq('id', players[i].id)
  }
}

async function getMyRole(roomId) {
  const { data } = await supabase
    .from('players')
    .select('role')
    .eq('room_id', roomId)
    .eq('telegram_id', telegramId)
    .single()

  return data.role
}

/* =========================
   UI rendering
========================= */

function showRoleCard(role) {
  app.innerHTML = `
    <h2>Ваша роль</h2>
    <img src="/assets/cards/${role}.png" />
  `
}
