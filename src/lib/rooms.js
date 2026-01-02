// src/lib/rooms.js
import { supabase } from './supabase';

/* Вспомогательная функция для перемешивания массива */
const shuffle = (array) => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

/* Room / Player helpers */

export async function createRoom({ code, host }) {
  try {
    const res = await supabase.from('rooms').insert([{ code, host }]).select().single();
    return { data: res.data ?? null, error: res.error ?? null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getRoom(code) {
  try {
    const res = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
    return { data: res.data ?? null, error: res.error ?? null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/* Исправленная функция addPlayer: первый игрок автоматически хост */
export async function addPlayer({ roomCode, name }) {
  try {
    // Проверяем, есть ли уже игроки в комнате
    const { data: existingPlayers } = await fetchPlayers(roomCode);
    const isHost = !existingPlayers || existingPlayers.length === 0; // первый игрок — хост

    const res = await supabase
      .from('players')
      .insert([{ room_code: roomCode, name, is_host: isHost, is_alive: true }])
      .select()
      .single();

    // Сохраняем id игрока в localStorage
    if (res?.data?.id) {
      try { localStorage.setItem('playerId', res.data.id); } catch {}
    }

    return { data: res.data ?? null, error: res.error ?? null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function fetchPlayers(roomCode) {
  try {
    const res = await supabase
      .from('players')
      .select('*')
      .eq('room_code', roomCode)
      .order('joined_at', { ascending: true });
    return { data: res.data ?? [], error: res.error ?? null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function setPlayerReady(playerId, isReady) {
  try {
    const res = await supabase.from('players').update({ is_ready: isReady }).eq('id', playerId).select().single();
    return { data: res.data ?? null, error: res.error ?? null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/* Game / RPC helpers */

export async function startGame(roomCode) {
  try {
    const { data: players } = await fetchPlayers(roomCode);
    if (!players?.length) throw new Error('Игроки не найдены');

    const playerIds = players.map(p => p.id);

    const res = await supabase.rpc('start_game_rpc', { p_room_code: roomCode });
    if (res.error) throw res.error;

    const { data: game } = await fetchGameByCode(roomCode);
    if (!game) throw new Error('Не удалось получить данные игры');

    await supabase.from('player_roles').delete().eq('game_id', game.id);

    const count = players.length;
    let rolesPool = [];
    // Простейшая логика: 1 мафия для 4-6, 2 для 7-9, 3 для 10+
    if (count >= 10) {
      const mafiaCount = 3;
      rolesPool = Array.from({ length: mafiaCount }).map(() => 'mafia');
      rolesPool.push('sheriff', 'doctor');
      while (rolesPool.length < count) rolesPool.push('villager');
    } else if (count >= 7) {
      const mafiaCount = 2;
      rolesPool = Array.from({ length: mafiaCount }).map(() => 'mafia');
      rolesPool.push('sheriff', 'doctor');
      while (rolesPool.length < count) rolesPool.push('villager');
    } else if (count >= 4) {
      rolesPool = ['mafia', 'sheriff', 'doctor'];
      while (rolesPool.length < count) rolesPool.push('villager');
    } else {
      rolesPool = ['mafia', 'sheriff', 'villager', 'villager'].slice(0, count);
    }

    const shuffledRoles = shuffle(rolesPool);

    const roleAssignments = players.map((player, index) => ({
      game_id: game.id,
      player_id: player.id,
      role: shuffledRoles[index],
      is_alive: true,
    }));

    const { error: roleErr } = await supabase.from('player_roles').insert(roleAssignments);
    if (roleErr) throw roleErr;

    await supabase.from('players').update({ is_alive: true }).in('id', playerIds);

    return { data: game, error: null };
  } catch (e) {
    console.error('Критическая ошибка старта игры:', e);
    return { data: null, error: e };
  }
}

export async function fetchGameByCode(roomCode) {
  try {
    const res = await supabase.from('games').select('*').eq('room_code', roomCode).maybeSingle();
    return { data: res.data ?? null, error: res.error ?? null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getMyRole(playerId, gameId) {
  try {
    if (!playerId || !gameId) return { data: null, error: new Error('missing playerId or gameId') };
    const res = await supabase
      .from('player_roles')
      .select('role,is_alive,player_id,game_id,doctor_self_heal_used')
      .eq('player_id', playerId)
      .eq('game_id', gameId)
      .maybeSingle();
    return { data: res.data ?? null, error: res.error ?? null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/* Actions (night/day) helpers */

/*
  submitPlayerAction:
  - логирует payload в консоль (для отладки)
  - использует upsert onConflict по (game_id, player_id, phase)
  - возвращает результат upsert
*/
export async function submitPlayerAction({ gameId, playerId, phase, actionType, targetId }) {
  try {
    const payload = {
      game_id: gameId,
      player_id: playerId,
      phase,
      action_type: actionType,
      target_id: targetId ?? null,
    };

    // Лог для отладки: убедись, что payload корректный
    try { console.log('SUBMIT ACTION', payload); } catch {}

    const res = await supabase
      .from('actions')
      .upsert(payload, { onConflict: ['game_id', 'player_id', 'phase'] })
      .select();

    try { console.log('UPsert result', res); } catch {}
    return { data: res.data ?? null, error: res.error ?? null };
  } catch (e) {
    console.error('submitPlayerAction error', e);
    return { data: null, error: e };
  }
}

export async function startNight(roomCode, durationSec = 60) {
  try {
    const res = await supabase.rpc('start_night', { p_code: roomCode, p_duration: durationSec });
    return { data: res.data ?? null, error: res.error ?? null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function resolveNight(roomCode) {
  try {
    const res = await supabase.rpc('resolve_night', { p_code: roomCode });
    return { data: res.data ?? null, error: res.error ?? null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function resolveDay(roomCode) {
  try {
    const res = await supabase.rpc('resolve_day', { p_code: roomCode });
    return { data: res.data ?? null, error: res.error ?? null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/* Tick (автофазы) */
export async function tickGame(roomCode) {
  try {
    const res = await supabase.rpc('tick_game', { p_code: roomCode });
    return { data: res.data ?? null, error: res.error ?? null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/* Cleanup / Realtime */

export async function removePlayer(playerId) {
  try {
    const res = await supabase.from('players').delete().eq('id', playerId).select();
    return { data: res.data ?? null, error: res.error ?? null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export function subscribePlayers(roomCode, onChange) {
  const channel = supabase
    .channel(`room:${roomCode}:players`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_code=eq.${roomCode}` }, (payload) => {
      onChange(payload);
    })
    .subscribe();
  return { unsubscribe: () => supabase.removeChannel(channel) };
}

export function subscribeGames(roomCode, onChange) {
  const channel = supabase
    .channel(`room:${roomCode}:games`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `room_code=eq.${roomCode}` }, (payload) => {
      onChange(payload);
    })
    .subscribe();
  return { unsubscribe: () => supabase.removeChannel(channel) };
}

export async function getPlayer(roomCode, playerId) {
  return supabase
    .from('players')
    .select('*')
    .eq('room_code', roomCode)
    .eq('id', playerId)
    .single();
}

export async function sheriffCheck(gameId, sheriffId, targetId) {
  const res = await supabase.rpc('sheriff_check_rpc', {
    p_game_id: gameId,
    p_sheriff_id: sheriffId,
    p_target_id: targetId,
  });

  if (res.error) throw res.error;
  return res.data; // ← роль
}

export async function fetchGameEvents(gameId) {
  return supabase
    .from('game_events')
    .select('*')
    .eq('game_id', gameId)
    .order('created_at', { ascending: true });
}

