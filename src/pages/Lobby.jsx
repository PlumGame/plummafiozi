import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './css/Lobby.css';
import {
  fetchPlayers,
  setPlayerReady,
  removePlayer,
  startGame,
  subscribePlayers,
  fetchGameByCode,
  subscribeGames,
  startIntro,
} from '../lib/rooms';

export default function Lobby() {
  const { code } = useParams();
  const nav = useNavigate();
  const initialPlayerId = localStorage.getItem('playerId');

  // ===== STATE =====
  const [players, setPlayers] = useState([]);
  const [playerId] = useState(initialPlayerId);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState(null);
  const [errorBanner, setErrorBanner] = useState(null);
  const [introTimer, setIntroTimer] = useState(10);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [startedByMe, setStartedByMe] = useState(false);

  // Новый state
  const [localIntroStartAt, setLocalIntroStartAt] = useState(null);

  const pollRef = useRef(null);
  const playersUnsubRef = useRef(null);
  const gamesUnsubRef = useRef(null);

  // ===== DERIVED =====
  const isHost = players.some(
    p => p.id === playerId && p.is_host === true
  );

  const allReady =
    players.length > 0 && players.every(p => p.is_ready);

  // showIntro = true если интро запущено и таймер > 0
  const showIntro = !!(game?.intro_started && introTimer > 0);

  // ===== ACTIONS =====
  const handleStartGame = async () => {
    if (!isHost) return;

    if (!allReady) {
      setShowStartConfirm(true);
      return;
    }

    setStartedByMe(true);
    setLocalIntroStartAt(Date.now());  // <-- важно
    setIntroTimer(10);                 // <-- важно
    await startIntro(code);
  };

  const startGameNow = async () => {
    try {
      const res = await startGame(code);

      if (res.error) {
        setErrorBanner('Не удалось запустить игру');
        setTimeout(() => setErrorBanner(null), 6000);
        return;
      }

      if (res.data?.game_id) {
        setLocalIntroStartAt(null);
        nav(`/game/${code}`, {
          state: { gameId: res.data.game_id, playerId },
        });
      }
    } catch {
      setErrorBanner('Ошибка при старте игры');
      setTimeout(() => setErrorBanner(null), 6000);
    }
  };

  // ===== INTRO TIMER =====
  useEffect(() => {
    if (!game?.intro_started && !localIntroStartAt) return;

    const startAt =
      localIntroStartAt ||
      new Date(game.intro_started_at).getTime();

    const updateTimer = () => {
      const diff = Date.now() - startAt;
      const remain = Math.max(0, 10 - Math.floor(diff / 1000));
      setIntroTimer(remain);
    };

    updateTimer();

    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [game?.intro_started, game?.intro_started_at, localIntroStartAt]);

  // ===== START GAME AFTER INTRO (HOST ONLY) =====
  useEffect(() => {
    if (!isHost) return;
    if (!startedByMe) return;
    if (introTimer !== 0) return;
    if (game?.state === 'running') return;

    startGameNow();
  }, [introTimer, isHost, game?.state, startedByMe]);

  // ===== LOAD DATA =====
  const loadPlayers = async () => {
    if (!code) return;
    const { data } = await fetchPlayers(code);
    setPlayers(data || []);
  };

  const loadGame = async () => {
    if (!code) return;
    const { data } = await fetchGameByCode(code);
    setGame(data || null);
  };

  useEffect(() => {
    let mounted = true;

    if (!code) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      await Promise.all([loadPlayers(), loadGame()]);
      if (mounted) setLoading(false);
    })();

    pollRef.current = setInterval(() => {
      loadPlayers();
      loadGame();
    }, 1000);

    try {
      const { unsubscribe } = subscribePlayers(code, ({ eventType, payload }) => {
        setPlayers(prev => {
          if (eventType === 'INSERT') {
            if (!payload.new) return prev;
            if (prev.some(p => p.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          }
          if (eventType === 'UPDATE') {
            return prev.map(p =>
              p.id === payload.new.id ? payload.new : p
            );
          }
          if (eventType === 'DELETE') {
            return prev.filter(p => p.id !== payload.old.id);
          }
          return prev;
        });
      });
      playersUnsubRef.current = unsubscribe;
    } catch {}

    try {
      const { unsubscribe } = subscribeGames(code, ({ payload }) => {
        const row = payload.new || payload.old;
        if (row) setGame(row);
      });
      gamesUnsubRef.current = unsubscribe;
    } catch {}

    return () => {
      mounted = false;
      pollRef.current && clearInterval(pollRef.current);
      playersUnsubRef.current && playersUnsubRef.current();
      gamesUnsubRef.current && gamesUnsubRef.current();
    };
  }, [code]);

  // ===== NAV TO GAME =====
  useEffect(() => {
  if (game?.state !== 'running') return;

  nav(`/game/${code}`, {
    state: { gameId: game.id, playerId },
  });
}, [game?.state]);


  // ===== UI ACTIONS =====
  const toggleReady = async (id, current) => {
    setPlayers(prev =>
      prev.map(p =>
        p.id === id ? { ...p, is_ready: !current } : p
      )
    );

    const { error } = await setPlayerReady(id, !current);
    if (error) {
      setPlayers(prev =>
        prev.map(p =>
          p.id === id ? { ...p, is_ready: current } : p
        )
      );
    }
  };

  const handleLeave = async () => {
    try {
      playerId && (await removePlayer(playerId));
    } catch {}
    localStorage.removeItem('playerId');
    nav('/');
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setErrorBanner('Не удалось скопировать код');
      setTimeout(() => setErrorBanner(null), 3000);
    }
  };

  // ===== RENDER =====
  return (
    <div className="screen-center lobby-root">
      <div className="title-wrap">
        <h1 className="ms-title">МАФИЯ</h1>
        <p className="subtitle">
          Лобби — код комнаты:{' '}
          <strong className="code-highlight">{code || '—'}</strong>
        </p>
      </div>

      <div className="lobby-container">
        {errorBanner && <div className="error-banner">{errorBanner}</div>}

        <div className="top-controls">
          <div className="code-group">
            <div className="room-code">{code || '—'}</div>
            <button className="glow-btn" onClick={handleCopyCode}>
              {copied ? 'Скопировано' : 'Копировать код'}
            </button>
          </div>

          <div className="action-buttons">
            <button className="glow-btn ghost" onClick={handleLeave}>
              Выйти
            </button>

            {isHost && !showIntro && (
              <button
                className="glow-btn start-game"
                onClick={handleStartGame}
              >
                Начать игру
              </button>
            )}
          </div>
        </div>

        <section className="players-section">
          <h3>Игроки: {players.length} в игре</h3>
          <ul className="players-list">
            {players.map(p => (
              <li key={p.id} className="player-item">
                <div className="player-info">
                  <div className="player-avatar">
                    {p.name?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div>
                    <div className="player-name">
                      {p.name} {p.is_host && <span>👑</span>}
                    </div>
                    <div className="player-status">
                      {p.is_ready ? 'Готов' : 'Не готов'}
                    </div>
                  </div>
                </div>

                {p.id === playerId && (
                  <button
                    className="glow-btn ready-btn"
                    onClick={() => toggleReady(p.id, p.is_ready)}
                  >
                    {p.is_ready ? 'Отменить' : 'Готов'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {showStartConfirm && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-title">
              Не все игроки готовы. Всё равно начать?
            </div>

            <div className="modal-buttons">
              <button
                className="glow-btn"
                onClick={async () => {
                  setShowStartConfirm(false);
                  setStartedByMe(true);
                  setLocalIntroStartAt(Date.now());
                  setIntroTimer(10);
                  await startIntro(code);
                }}
              >
                ДА
              </button>

              <button
                className="glow-btn ghost"
                onClick={() => setShowStartConfirm(false)}
              >
                НЕТ
              </button>
            </div>
          </div>
        </div>
      )}

      {showIntro && (
        <div className="intro-overlay">
          <div className="intro-bg" />
          <div className="intro-content">
            <h1 className="intro-title">
              <b>Город погружается во тьму...</b>
            </h1>
            <p className="intro-text">
              Старые улицы хранят слишком много секретов.
              Мафия выходит на охоту, а мирные жители
              запирают двери.
            </p>
            <div className="intro-timer">
              Начало через: <span>{introTimer}</span> сек
            </div>
          </div>
        </div>
      )}

      <footer className="small-footer" />
    </div>
  );
}
