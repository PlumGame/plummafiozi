import { supabase } from './supabase';

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

export async function addPlayer({ roomCode, name, isHost = false }) {
  try {
    let res = await supabase
      .from('players')
      .insert([{ room_code: roomCode, name, is_host: isHost }])
      .select()
      .single();

    if (
      res &&
      res.error &&
      typeof res.error.message === 'string' &&
      res.error.message.includes("Could not find the 'is_host' column")
    ) {
      res = await supabase
        .from('players')
        .insert([{ room_code: roomCode, name }])
        .select('id,room_code,name,joined_at,is_ready,is_alive,is_host')
        .single();
    }

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
    const res = await supabase.rpc('start_game_rpc', { p_room_code: roomCode });
    let payload = res.data ?? null;
    try { if (typeof payload === 'string') payload = JSON.parse(payload); } catch {}
    return { data: payload, error: res.error ?? null, status: res.status ?? null };
  } catch (e) {
    return { data: null, error: e, status: null };
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
      .select('role,is_alive,player_id,game_id')
      .eq('player_id', playerId)
      .eq('game_id', gameId)
      .maybeSingle();
    return { data: res.data ?? null, error: res.error ?? null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/* Cleanup / misc */

export async function removePlayer(playerId) {
  try {
    const res = await supabase.from('players').delete().eq('id', playerId).select();
    return { data: res.data ?? null, error: res.error ?? null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function removeRoom(code) {
  try {
    const res = await supabase.from('rooms').delete().eq('code', code);
    return { data: res.data ?? null, error: res.error ?? null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/* Realtime helpers */

export function subscribePlayers(roomCode, onChange) {
  const channel = supabase
    .channel(`room:${roomCode}:players`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_code=eq.${roomCode}` }, (payload) => {
      try { onChange(payload); } catch (e) { console.error('subscribePlayers handler error', e); }
    });
  channel.subscribe();
  return { unsubscribe: async () => { try { await channel.unsubscribe(); } catch {} } };
}

export function subscribeGames(roomCode, onChange) {
  const channel = supabase
    .channel(`room:${roomCode}:games`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `room_code=eq.${roomCode}` }, (payload) => {
      try { onChange(payload); } catch (e) { console.error('subscribeGames handler error', e); }
    });
  channel.subscribe();
  return { unsubscribe: async () => { try { await channel.unsubscribe(); } catch {} } };
}
