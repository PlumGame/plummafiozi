// src/pages/Game.jsx
import React, {
  useEffect, useState, useRef
} from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import './css/Game.css';
import { ROLES } from '../config/roles';

import { supabase } from '../lib/supabase';
import sheriffCheckImg from '../assets/checksherif.png';
import winMafiaImg from '../assets/win-mafia.png';
import winCivilImg from '../assets/win-civil.png';
import doctorSaveImg from '../assets/doctor-save.png';

import nightMusic from '../assets/night.mp3';
import dayMusic from '../assets/day.mp3';


import {
  fetchGameByCode,
  getMyRole,
  fetchPlayers,
  submitPlayerAction,
  startNight,
  resolveNight,
  resolveDay, // если будешь использовать дневное голосование
  sheriffCheck,
} from '../lib/rooms';

export default function Game() {
  const { code } = useParams();
  // 👮 модалка результата для шерифа
  const [sheriffResult, setSheriffResult] = useState(null);

  // Доктор лечит себя
  const [doctorSelfHealUsed, setDoctorSelfHealUsed] = useState(false);


  // 🎭 модалка для игрока, которого проверили
  const [checkedBySheriff, setCheckedBySheriff] = useState(null);
  // пример для отображения роли умершего игрока
  const getRoleNameRu = (role) => ROLES[role?.toLowerCase()]?.name || role;


// ⚠️ ВРЕМЕННО: разрешить чат мафии даже при 1 мафии
const FORCE_MAFIA_CHAT = true;

const [chatOpen, setChatOpen] = useState(false);
const [chatType, setChatType] = useState('day'); // 'day' | 'night_mafia'

const [chat, setChat] = useState([]);
const [chatText, setChatText] = useState('');
const chatRef = useRef(null);

const [killSilhouette, setKillSilhouette] = useState(false);
  const location = useLocation();
  const nav = useNavigate();
  const endHandledRef = useRef(false);
  const initialPlayerId =
    (location.state && location.state.playerId) || localStorage.getItem('playerId');

  const [game, setGame] = useState(null);
  const [showEndModal, setShowEndModal] = useState(false);
  const [exitTimer, setExitTimer] = useState(25);

  const [players, setPlayers] = useState([]);
  const [myRole, setMyRole] = useState(null);
  const [votes, setVotes] = useState({});

  const roleName = myRole?.role?.toLowerCase() || null;
const roleConfig = roleName ? ROLES[roleName] : null;


  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [zoomCard, setZoomCard] = useState(false);

  const [phase, setPhase] = useState('waiting');
  const [phaseEndsAt, setPhaseEndsAt] = useState(null);
  const [timer, setTimer] = useState(null);

  const [actionTarget, setActionTarget] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionDone, setActionDone] = useState(false);

  const [phaseTransition, setPhaseTransition] = useState(null);
  // 'night' | 'day' | null
  const prevPhaseRef = useRef(null);
  const [savedByDoctor, setSavedByDoctor] = useState(null);
  const [nightMessage, setNightMessage] = useState(null);

  const [soundEnabled, setSoundEnabled] = useState(false);
const dayAudioRef = useRef(null);
const nightAudioRef = useRef(null);


const checkDoctorSelfHeal = async () => {
  if (!game?.id || roleName !== 'doctor') return;

  const { data, error } = await supabase
    .from('actions')
    .select('id')
    .eq('game_id', game.id)
    .eq('action_type', 'save')
    .eq('player_id', initialPlayerId)
    .eq('target_id', initialPlayerId);

  if (!error) {
    setDoctorSelfHealUsed((data || []).length > 0);
  }
};


// чат
const sendMessage = async () => {
  if (!chatText.trim()) return;
  if (!game?.id) return;

  const me = players.find(p => String(p.id) === String(initialPlayerId));

  const type = game.phase === 'night' && roleName === 'mafia'
    ? 'night_mafia'
    : 'day';

  const { error } = await supabase
    .from('chat_messages')
    .insert([
      {
        game_id: game.id,
        player_id: initialPlayerId,
        player_name: me?.name || 'Игрок',
        text: chatText.trim(),
        chat_type: type,
      },
    ]);

  if (error) {
    console.error('sendMessage error:', error);
    return;
  }
  setChatText('');


  
  // обновляем чат
  await loadChat(type);
};

const loadChat = async (chatType) => {
  if (!game?.id) return;
  if (!chatType) return;

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, text, created_at, player_id, player_name, chat_type')
    .eq('game_id', game.id)
    .eq('chat_type', chatType)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('loadChat error:', error);
    return;
  }

  setChat(data || []);
};


const openChat = async () => {
  let type = 'day';

  if (
    game.phase === 'night' &&
    roleName === 'mafia' &&
    (FORCE_MAFIA_CHAT /* || aliveMafiaCount >= 2 */)
  ) {
    type = 'night_mafia';
  }

  setChatType(type);
  setChatOpen(true);

  await loadChat(type);
};




  // 🧮 подсчёт голосов по игрокам
  const voteCounts = {};
  Object.values(votes).forEach(targetId => {
    voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
  });


  const isActionDisabled = () => {
    if (!actionTarget || actionSubmitting || actionDone) return true;

    if (game.phase === 'night') {
      // Если текущая роль не назначена, всем живым игрокам с действиями разрешено ходить
      if (!game.currentNightRole) return false;
      return game.currentNightRole.toLowerCase() !== roleName;
    }

    // Днём — можно голосовать, если выбрана цель
    if (game.phase === 'day') return false;
    return true;
  };

  // Загрузка игры и игроков
  const loadAll = async () => {
    try {
      const { data: g } = await fetchGameByCode(code);
      if (g) {
        setGame(g);
        setPhase(g.phase);
        setPhaseEndsAt(g.phase_ends_at);
      } else {
        setGame(null);
        setPhase('waiting');
        setPhaseEndsAt(null);
        return;
      }

      // 🎭 ЗАГРУЗКА МОЕЙ РОЛИ
      if (g.id && initialPlayerId) {
        const { data: myRoleData, error } = await getMyRole(initialPlayerId, g.id);
        if (!error) setMyRole(myRoleData);
      }

      // Загрузка игроков
      const { data: playersData, error: playersError } = await fetchPlayers(code);
      if (playersError) throw playersError;
      if (!playersData) return;

      // Загрузка ролей
      const { data: roles, error: rolesError } = await supabase
        .from('player_roles')
        .select('player_id, is_alive, is_revealed, role')
        .eq('game_id', g.id);
      if (rolesError) throw rolesError;

      const { data: pls } = await fetchPlayers(code);

      if (pls && g?.id) {
        const { data: roles, error } = await supabase
          .from('player_roles')
          .select('player_id, is_alive, is_revealed, role')
          .eq('game_id', g.id);

        if (error) {
          console.error('player_roles error:', error);
          return;
        }

        const roleMap = new Map(roles.map(r => [String(r.player_id), r]));

        const mergedPlayers = playersData.map(p => {
          const r = roleMap.get(String(p.id));
          return {
            ...p,
            is_alive: r?.is_alive ?? true,
            is_revealed: r?.is_revealed ?? false,
            role: r?.role ?? null,
          };
        });

        setPlayers(mergedPlayers);

      }

      // 🔔 УВЕДОМЛЕНИЕ ОТ ШЕРИФА
      if (g.id && initialPlayerId) {
        const { data: playerNotes } = await supabase
          .from('notifications')
          .select('*')
          .eq('player_id', initialPlayerId)
          .eq('game_id', g.id)
          .eq('is_read', false);

        if (playerNotes?.length) {
          const sheriffNote = playerNotes.find(n =>
            n.message?.toLowerCase().includes('шериф')
          );

          const doctorNote = playerNotes.find(n =>
            n.message?.toLowerCase().includes('доктор')
          );

          if (sheriffNote && !checkedBySheriff) {
            setCheckedBySheriff(sheriffNote);
          }

          if (doctorNote && !savedByDoctor) {
            setSavedByDoctor(doctorNote);
          }
        }

        // 🗳️ ЗАГРУЗКА ГОЛОСОВ (ТОЛЬКО ДНЁМ)
        if (g?.id && g.phase === 'day') {
          const phaseKey = `day-${g.day ?? 0}`;

          const { data: voteRows } = await supabase
            .from('actions')
            .select('player_id, target_id')
            .eq('game_id', g.id)
            .eq('action_type', 'vote')
            .eq('phase', phaseKey);

          const voteMap = {};
          voteRows?.forEach(v => {
            voteMap[String(v.player_id)] = String(v.target_id);
          });

          setVotes(voteMap);
        } else {
          setVotes({});
        }
      }

    } catch (e) {
      console.error('[loadAll] error:', e);
    } finally {
      setLoading(false);
    }
  };

  // чат
useEffect(() => {
  if (!chatRef.current) return;
  chatRef.current.scrollTop = chatRef.current.scrollHeight;
}, [chat]);


useEffect(() => {
  setActionDone(false);
  setActionTarget('');
}, [game?.phase, game?.day]);

// 🔒 Автозакрытие чата при смене фазы (день ↔ ночь)
useEffect(() => {
  if (!game?.id) return;

  const channel = supabase
    .channel(`chat-${game.id}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `game_id=eq.${game.id}`,
      },
      payload => {
        const msg = payload.new;

        // 🔒 фильтрация по типу чата
        if (msg.chat_type !== chatType) return;

        setChat(prev => {
          // защита от дублей
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });

        setTimeout(() => {
          chatRef.current?.scrollTo({
            top: chatRef.current.scrollHeight,
            behavior: 'smooth',
          });
        }, 50);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [game?.id, chatType]);




  useEffect(() => {
    loadAll();
    const i = setInterval(loadAll, 1000);
    return () => clearInterval(i);
  }, [code]);

useEffect(() => {
  if (game?.id) {
    checkDoctorSelfHeal();
  }
}, [game?.id]);


useEffect(() => {
  if (game?.phase !== 'day') return;

  const deadNow = players.filter(p => !p.is_alive && !p._deathShown);

  if (deadNow.length > 0) {
    setKillSilhouette(true);

    // скрываем через 900мс
    setTimeout(() => {
      setKillSilhouette(false);
    }, 900);

    // помечаем, чтобы не повторялось
    setPlayers(prev =>
      prev.map(p =>
        !p.is_alive ? { ...p, _deathShown: true } : p
      )
    );
  }
}, [game?.phase, players]);

useEffect(() => {
  if (!game?.id) return;

  const type = game.phase === 'night' && roleName === 'mafia'
    ? 'night_mafia'
    : 'day';

  setChatType(type);

  // если ночь и ты не мафия — чат пустой
  if (game.phase === 'night' && roleName !== 'mafia') {
    setChat([]);
    return;
  }

  loadChat(type);
}, [game?.id, game?.phase, roleName]);


  useEffect(() => {
  if (!game?.id) return;

  const interval = setInterval(async () => {
    // ❌ ДНЁМ НИЧЕГО НЕ ПОКАЗЫВАЕМ
    if (game.phase !== 'night') return;

    const { data: notes } = await supabase
      .from('notifications')
      .select('*')
      .eq('game_id', game.id)
      .is('player_id', null)
      .eq('is_read', false)
      .eq('night_only', true) // ✅ ТОЛЬКО НОЧНЫЕ
      .order('created_at', { ascending: true })
      .limit(1);

    if (!notes?.length) return;

    const note = notes[0];

    setNightMessage(note.message);

    setTimeout(() => setNightMessage(null), 10000);

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', note.id);

  }, 500);
  

  return () => clearInterval(interval);
}, [game?.id, game?.phase]);


  useEffect(() => {
    if (!game?.phase) return;

    const prev = prevPhaseRef.current;
    const current = game.phase;

    if (prev && prev !== current) {
      if (current === 'night') {
        setPhaseTransition('night');
        setTimeout(() => setPhaseTransition(null), 2600);
      }

      if (current === 'day') {
        setPhaseTransition('day');
        setTimeout(() => setPhaseTransition(null), 2200);
      }
    }

    prevPhaseRef.current = current;
  }, [game?.phase]);

  // Сбрасываем состояние действия при смене фазы или дня
  useEffect(() => {
    setActionDone(false);
    setActionTarget('');
  }, [game?.phase, game?.day]);

  useEffect(() => {
    if (game?.phase === 'ended' && !endHandledRef.current) {
      endHandledRef.current = true;

      setShowEndModal(true);
      setExitTimer(25);

      const interval = setInterval(() => {
        setExitTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            nav(`/lobby/${code}`);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [game?.phase]);

  // Музыка при смене дня и ночи

  useEffect(() => {
  dayAudioRef.current = new Audio(dayMusic);
  nightAudioRef.current = new Audio(nightMusic);

  dayAudioRef.current.loop = true;
  nightAudioRef.current.loop = true;

  return () => {
    dayAudioRef.current?.pause();
    nightAudioRef.current?.pause();
  };
}, []);

useEffect(() => {
  const enableSound = () => {
    setSoundEnabled(true);
    window.removeEventListener('pointerdown', enableSound);
  };

  window.addEventListener('pointerdown', enableSound);

  return () => {
    window.removeEventListener('pointerdown', enableSound);
  };
}, []);

useEffect(() => {
  if (!soundEnabled) return;

  const dayAudio = dayAudioRef.current;
  const nightAudio = nightAudioRef.current;

  if (game?.phase === 'day') {
    nightAudio?.pause();
    dayAudio.currentTime = 0;
    dayAudio.play().catch(() => {});
  }

  if (game?.phase === 'night') {
    dayAudio?.pause();
    nightAudio.currentTime = 0;
    nightAudio.play().catch(() => {});
  }
}, [game?.phase, soundEnabled]);

useEffect(() => {
  if (!soundEnabled) return;

  const handleVisibility = () => {
    const dayAudio = dayAudioRef.current;
    const nightAudio = nightAudioRef.current;

    if (document.hidden) {
      dayAudio?.pause();
      nightAudio?.pause();
    } else {
      if (game?.phase === 'day') {
        dayAudio?.play().catch(() => {});
      }
      if (game?.phase === 'night') {
        nightAudio?.play().catch(() => {});
      }
    }
  };

  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}, [soundEnabled, game?.phase]);



  // Таймер для фазы
  useEffect(() => {
    if (!phaseEndsAt) {
      setTimer(null);
      return;
    }
    const ti = setInterval(() => {
      const left = Math.max(
        0,
        Math.round((new Date(phaseEndsAt).getTime() - Date.now()) / 1000)
      );
      setTimer(left);
      if (left <= 0) clearInterval(ti);
    }, 1000);
    return () => clearInterval(ti);
  }, [phaseEndsAt]);

// ✅ ВОТ ЭТО НУЖНО ДОБАВИТЬ
const isHost = players.find(
  p => String(p.id) === String(initialPlayerId)
)?.is_host;

// ===== ДЕНЬ =====
const availableTargetsDay = players.filter(p => {
  if (!p.is_alive) return false;

  // Днём никто не может голосовать за себя
  return String(p.id) !== String(initialPlayerId);
});

// ===== НОЧЬ =====
const availableTargetsNight = players.filter(p => {
  if (!p.is_alive) return false;

  // Ночью доктор видит себя
  if (roleName === 'doctor') return true;

  // Остальные не видят себя
  return String(p.id) !== String(initialPlayerId);
});




  const submitAction = async (actionType, targetId) => {
    if (!targetId || actionSubmitting || !game?.id) return;
    // ===== Очередность ночных ходов =====
    // game.currentNightRole — роль, которая сейчас ходит
    if (game.phase === 'night' && game.currentNightRole) {
      if (roleName !== game.currentNightRole.toLowerCase()) {
        alert(`Сейчас ходят ${game.currentNightRole}`);
        setActionSubmitting(false);
        return;
      }
    }

// === ДОКТОР И САМОИСЦЕЛЕНИЕ ===
if (roleName === 'doctor' && actionType === 'save') {

  // 1) нельзя лечить себя в 1 ночь
  if (game.day === 1 && targetId === initialPlayerId) {
    alert('Ты не можешь лечить себя этой ночью');
    return;
  }

  // 2) нельзя лечить себя второй раз
  if (targetId === initialPlayerId && doctorSelfHealUsed) {
    alert('Ты уже лечил себя!');
    return;
  }
}


    setActionSubmitting(true);
if (roleName === 'doctor' && actionType === 'save' && targetId === initialPlayerId) {
  setDoctorSelfHealUsed(true);
}



    try {
      // 👮 ШЕРИФ — ПРОВЕРКА ТОЛЬКО НОЧЬЮ
      if (
        roleName === 'sheriff' &&
        game.phase === 'night' &&
        actionType === 'check'
      ) {
        const role = await sheriffCheck(
          game.id,
          initialPlayerId,
          targetId
        );

        const targetPlayer = players.find(
          p => String(p.id) === String(targetId)


        );

        // 👮 результат для шерифа
        setSheriffResult({
          name: targetPlayer?.name ?? 'Игрок',
          role: role?.toLowerCase() ?? 'unknown',
        });
      }

      // Отправка уведомления в базу для всех игроков

      let msg = null;

if (game.phase === 'night') {
  if (roleName === 'mafia' && actionType === 'kill') {
    msg = 'В городе раздался выстрел...';
  }

  if (roleName === 'doctor' && actionType === 'save') {
    msg = 'Кто-то сегодня избежал смерти.';
  }

  if (roleName === 'sheriff' && actionType === 'check') {
    msg = 'Шериф проводит ночную проверку.';
  }
}

if (msg) {
  await supabase.from('notifications').insert([
    {
      game_id: game.id,
      player_id: null,
      message: msg,
      night_only: true,
      is_read: false,
    },
  ]);
}


      //МОДУЛЬ ГОЛОСОВАНИЕ
      const phaseKey = `${game.phase}-${game.day ?? 0}`;

      await submitPlayerAction({
        gameId: game.id,
        playerId: initialPlayerId,
        phase: phaseKey,
        actionType,
        targetId,
      });

// ===== Переход к следующей роли =====
const { data: nextRole, error: nextRoleError } = await supabase.rpc('next_night_step', { game_id: game.id });

if (nextRoleError) {
  console.error('next_night_step error', nextRoleError);
} else {
  console.log('next night role:', nextRole);
}

// Перезагрузка game + players
await loadAll();

setActionDone(true);

    } catch (e) {
      alert('Ошибка: ' + e.message);
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleStartNight = async (sec = 60) => {
    try {
      await startNight(code, sec);
    } catch (e) {
      console.error('startNight error:', e);
    }
  };

  const handleResolveNight = async () => {
    try {
      await resolveNight(code);
    } catch (e) {
      console.error('resolveNight error:', e);
    }
  };

  if (loading) return <div className="screen-center">Загрузка игры...</div>;

  return (
    <div
      className={`screen-center game-screen minimal ${game?.phase === 'night' ? 'night' : 'day'
        }`}
    >
      <div className={`game-container ${zoomCard ? 'zoom' : ''}`}>
        <header className="game-top">
          <div className="title-row">
            <div className="title-left">
              <ul></ul>
              <div className="small-title code-pill subtle"><b>Игра: {code}</b></div>
<ul></ul>
<button
  className="exit-btn"
  onClick={() => (window.location.href = '/')}
  aria-label="Выйти из комнаты"
>
  Выйти
</button>
            </div>
            <div className="title-right">
              <div className="meta small muted">
                <b>Фаза:</b>{' '}
                <strong key={game?.phase} className="update show">
                  {game?.phase === 'night' ? 'НОЧЬ' : 'ДЕНЬ'}
                </strong>
              </div>
              <div className="meta small muted">
                <b>День:</b>{' '}
                <strong key={game?.day} className="update show">
                  {game?.day ?? 1}-й
                </strong>
              </div>
<ul></ul>
<ul></ul>
<ul></ul>
<ul></ul>
<ul></ul>
<ul></ul>
              {isHost && (
                <div className="host-buttons">
                  {game?.phase === 'night' && (
                    <button
                      className="host-btn wake"
                      onClick={handleResolveNight}
                    >
                      ☀️ День
                    </button>
                  )}

                  {game?.phase === 'day' && game?.winner == null && (
                    <button
                      className="host-btn sleep"
                      onClick={async () => {
                        if (game.phase !== 'day' || game.winner) return;
                        try {
                          await resolveDay(code);
                        } catch (e) {
                          console.error('resolveDay error:', e);
                        }
                      }}
                    >
                      🌙 Ночь
                    </button>
                  )}
                </div>
              )}

            </div>
          </div>
        </header>

        <main className="game-main">
          <section className="role-area card-soft">
            <div className="role-header">
              <h3 className="section-title"><b>Ваша роль:</b></h3>
              <div className="role-controls">
                <button className="icon-btn" onClick={() => setRevealed(!revealed)}>
                  {revealed ? 'Скрыть карту' : 'Открыть карту'}
                </button>
                
{myRole?.is_alive && (
  <>
    {(game?.phase === 'day' ||
      (game?.phase === 'night' &&
        roleName === 'mafia' &&
        FORCE_MAFIA_CHAT)) && (

      <button
        className={`icon-btn chat-toggle ${chatOpen ? 'open' : 'closed'}`}
        onClick={async () => {
          let type = 'day';

          if (
            game.phase === 'night' &&
            roleName === 'mafia'
          ) {
            type = 'night_mafia';
          }

          setChatType(type);
          setChatOpen(v => !v);

          if (!chatOpen) {
            await loadChat(type);
          }
        }}
      >
        {chatOpen ? 'Закрыть чат' : 'Открыть чат'}
      </button>
    )}
  </>
)}


              </div>
            </div>

            <div
  className={`role-card compact ${revealed ? 'revealed' : ''} role-${roleName}`}
>
              <div className="role-info">
                <div className="role-name" style={{ color: roleConfig?.color }}>
                  {revealed ? roleConfig?.name : ''}
                </div>
                <div
                  className={`role-status ${myRole?.is_alive ? 'alive' : 'dead'
                    }`}
                >
                  {myRole?.is_alive ? 'ЖИВОЙ' : 'ВЫБЫЛ'}
                </div>
                {revealed && (
                  <div
                    className="role-desc"
                    style={{ fontSize: 10, opacity: 0.7 }}
                  >
                    {roleConfig?.description}
                  </div>
                )}
              </div>
              <div className="role-media">
                {revealed && roleConfig?.image ? (
                  <img
                    src={roleConfig.image}
                    alt={roleConfig.name}
                    className="role-thumb"
                  />
                ) : (
                  <div className="role-placeholder">
  <img 
    src="/assets/see.gif" 
    alt="Searching eye" 
    className="role-gif"
  />
</div>
                )}
              </div>
            </div>

{game?.phase === 'night' &&
  myRole?.is_alive &&
  roleName === 'villager' && (
    <div className="action-panel">
      <div className="sleep-panel">
        <div className="sleep-lock">🔒</div>

        <b className="sleep-title">Город спит...</b>

        <span className="sleep-sub">Вы мирно отдыхаете.</span>

        <div className="sleep-zzz">
<span>Z</span>
<span>z</span>
<span>z</span>


        </div>
      </div>
    </div>
)}
            {game?.phase === 'night' &&
              myRole?.is_alive &&
              roleName !== 'villager' && (
                <div
                  className="action-panel"
                  style={{
                    marginTop: 20,
                    padding: 15,
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 12,
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      marginBottom: 10,
                      opacity: 0.7,
                    }}
                  >
                    Выберите цель:
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      disabled={actionDone}
                      value={actionTarget}
                      onChange={e => setActionTarget(e.target.value)}
                      className="action-select"
                    >
                      
                      <option value="">Выберите игрока </option>
                      {availableTargetsNight.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className={`glow-btn ${actionDone ? 'success done' : ''}`}
                      disabled={isActionDisabled()}
onClick={() =>
  submitAction(
    game.phase === 'night'
      ? roleName === 'mafia'
        ? 'kill'
        : roleName === 'doctor'
          ? 'save'
          : 'check'
      : 'vote',
    actionTarget
  )
}>
                      
                      {actionSubmitting ? '...' : actionDone ? '✓' : 'ОК'}
                    </button>

                  </div>
                </div>
              )}
            {game?.phase === 'day' &&
              myRole?.is_alive && (
                <div
                  className="action-panel"
                  style={{
                    marginTop: 20,
                    padding: 15,
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 12,
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      marginBottom: 10,
                      opacity: 0.7,
                    }}
                  >
                    Голосование:
                  </p>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      disabled={actionDone}
                      value={actionTarget}
                      onChange={e => setActionTarget(e.target.value)}
                      className="action-select"
                    >
                      <option value="">Выберите игрока</option>
                      {availableTargetsDay.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>

                    <button
                      className={`glow-btn ${actionDone ? 'success done' : ''}`}
                      disabled={!actionTarget || actionDone}
                      onClick={() => submitAction('vote', actionTarget)}
                    >
                      <span>{actionDone ? '✓' : 'ОК'}</span>
                    </button>

                  </div>
                </div>
              )}

          </section>
          <aside className="players-area card-soft">
            <div className="players-header">
              <h3 className="section-title1">Игроки: {players.length} в игре</h3>
              <button
                className="icon-btn"
                onClick={() => setPlayersOpen(!playersOpen)}
              >
                Список
              </button>
            </div>
            <div
              className={`players-list-wrap ${playersOpen ? 'open' : ''
                }`}
            >
              <ul className="players-compact">
                {players
                  .filter(p => p.id)
                  .map(p => (
                    <li key={`player-${p.id}`} className={`player-row ${!p.is_alive ? 'dead' : ''}`}>
                      <span className="player-name">
                        {p.is_host && '👑'} {p.name}


                      </span>
<div className="player-meta">
  {game?.phase === 'day' && votes[p.id] && (
    <div className="vote-for">
      🙋‍♂️ <b>{players.find(x => String(x.id) === String(votes[p.id]))?.name}</b>
    </div>
  )}

  {game?.phase === 'day' && voteCounts[p.id] > 0 && (
    <div className="vote-count">
      <b>🗣️ {voteCounts[p.id]}</b>
    </div>
  )}

  <span className={`status-tag ${p.is_alive ? 'alive' : 'out'}`}>
    {p.is_alive ? 'Живой' : 'Мёртв'}
  </span>
</div>


{/* 👁️ РАСКРЫТАЯ РОЛЬ */}
{!p.is_alive && p.is_revealed && (
  <div className="revealed-card mini">
    <img
      src={ROLES[p.role?.toLowerCase()]?.image}
      alt={p.role}
      className="revealed-img"
    />
    <span className="revealed-name">
      {getRoleNameRu(p.role)}
    </span>
  </div>
)}

                    </li>
                  ))}
              </ul>
            </div>
          </aside>
        </main>
      </div>

      {sheriffResult && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div style={{ fontSize: 20, marginBottom: 10 }}>
              <b>Информатор предоставил вам данные что</b>
            </div>

            <div style={{ marginBottom: 10 }}>
              Игрок: <strong>{sheriffResult.name}</strong>
            </div>

            <img
              src={ROLES[sheriffResult.role]?.image}
              alt={sheriffResult.role}
              style={{ width: 120, marginBottom: 10 }}
            />

            <div
              style={{
                fontSize: 18,
                color: ROLES[sheriffResult.role]?.color,
                marginBottom: 20,
              }}
            >
              {getRoleNameRu(sheriffResult.role)}
            </div>

            <button
              className="glow-btn"
              onClick={() => setSheriffResult(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {checkedBySheriff && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div style={{ fontSize: 22, marginBottom: 12 }}>
              Шериф раскопал правду о вас.
            </div>
            <img
              src={sheriffCheckImg}
              alt="Проверка шерифа"
              className="sheriff-check-img"
            />
            <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 20 }}>
              {checkedBySheriff.message}
            </div>

            <button
              className="glow-btn"
              onClick={async () => {
                await supabase
                  .from('notifications')
                  .update({ is_read: true })
                  .eq('id', checkedBySheriff.id);

                setCheckedBySheriff(null);
              }}
            >
              Понятно
            </button>
          </div>
        </div>
      )}

{showEndModal && (
  <div className="modal-overlay end-overlay">
    <div className="modal-card end-card-anim">

      <div className="end-title-anim">
        {game?.winner === 'mafia'
          ? 'Те, кто доверял, ошиблись. Мафия правит этим городом.'
          : 'Правда всплыла на свет. Мирные вернули город себе.'}
      </div>

      {/* ===== Компактный список игроков ===== */}
      <div className="end-players-compact">
        {players.map(p => {
          const role = ROLES[p.role?.toLowerCase()];
          return (
            <div key={p.id} className="compact-row">
              <div className="compact-left">
                <span className="compact-avatar">
                  {p.name?.charAt(0).toUpperCase() || '?'}
                </span>
                <span className="compact-name">{p.name}</span>
              </div>

              <div className="compact-right">
                <span className="compact-role" style={{ color: role?.color || '#fff' }}>
                  {role?.name || '—'}
                </span>
                <span className={`compact-status ${p.is_alive ? 'alive' : 'dead'}`}>
                  {p.is_alive ? 'Жив' : 'Мёртв'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <img
        src={game?.winner === 'mafia' ? winMafiaImg : winCivilImg}
        alt="Победа"
        className="end-win-img-anim"
      />

      <div className="end-timer-anim">
        Выход в лобби через {exitTimer} сек
      </div>

      <button
        className="glow-btn"
        onClick={() => nav(`/lobby/${code}`)}
      >
        Перейти в лобби
      </button>

    </div>
  </div>
)}

      {showEndModal && game?.winner === 'civil' && (
        <div className="confetti-layer">
          {Array.from({ length: 30 }).map((_, i) => (
            <span key={i} className="confetti" />
          ))}
        </div>
      )}


      {phaseTransition === 'night' && (
        <div className="phase-overlay night">
          <div className="phase-text">
            🌙 Наступает ночь…
          </div>
        </div>
      )}

      {phaseTransition === 'day' && (
        <div className="phase-overlay day">
          <div className="phase-text">
            ☀️ Наступает день
          </div>
        </div>
      )}

      {savedByDoctor && (
        <div className="modal-overlay">
          <div className="modal-card">

            <div style={{ fontSize: 22, marginBottom: 12 }}>
              Если бы не доктор вы могли умереть!
            </div>

            <img
              src={doctorSaveImg}
              alt="Доктор спас"
              className="doctor-save-img"
            />

            <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 20 }}>
              {savedByDoctor.message}
            </div>

            <button
              className="glow-btn"
              onClick={async () => {
                await supabase
                  .from('notifications')
                  .update({ is_read: true })
                  .eq('id', savedByDoctor.id);

                setSavedByDoctor(null);
              }}
            >
              Понятно
            </button>

          </div>
        </div>
      )}

      {nightMessage && (
        <div className="phase-overlay night-step">
          <div className="phase-text ">{nightMessage}</div>
        </div>
      )}

{game?.phase === 'night' && (
  <div className="fog-layer">
    <span className="fog fog-1" />
    <span className="fog fog-2" />
    <span className="fog fog-3" />

       {/* 👤 ТЕНИ */}
    <span className="fog-shadow shadow-1" />
    <span className="fog-shadow shadow-2" />
    <span className="fog-shadow shadow-3" />
  </div>
)}

{/* 👤 Силует при убийстве */}
{killSilhouette && (
  <div className="kill-silhouette">
    <div className="silhouette-body" />
  </div>
)}

{myRole?.is_alive && chatOpen && (
  <section className="chat-panel card-soft">
<div className="chat-header">
  <span>
    <b>{chatType === 'day' ? 'Городской чат' : 'Ночной чат мафии'}</b>
  </span>

      <button
        className="chat-close"
        onClick={() => setChatOpen(false)}
      >
        ✕
      </button>
    </div>

    <div className="chat-messages" ref={chatRef}>
      {chat.map(m => (
        <div
          key={m.id}
          className={`chat-msg ${
            m.player_id === initialPlayerId ? 'me ' : ''
          }fog-in`}
        >
          <span className="chat-name">
  {m.player_name}:  
</span> 
           <span className="chat-text ">
            {" "}{m.text}
          </span>
        </div>
      ))}
    </div>

    <div className="chat-input">
      <input
        value={chatText}
        onChange={e => setChatText(e.target.value)}
        placeholder="Написать сообщение..."
        maxLength={180}
        onKeyDown={e => e.key === 'Enter' && sendMessage()}
      />
      <button className="chat-send" onClick={sendMessage}>
        ➤
      </button>
    </div>
  </section>
)}



    </div>
  );
}

