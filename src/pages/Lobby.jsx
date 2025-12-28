// src/pages/Lobby.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import './css/Lobby.css';
import {
  fetchPlayers,
  setPlayerReady,
  removePlayer,
  startGame,
  subscribePlayers,
  fetchGameByCode,
  subscribeGames,
} from '../lib/rooms';

export default function Lobby() {
  const { code } = useParams();
  const location = useLocation();
  const nav = useNavigate();

  const initialName = (location.state && location.state.name) || 'Игрок';
  const initialPlayerId = (location.state && location.state.playerId) || localStorage.getItem('playerId');

  const [players, setPlayers] = useState([]);
  const [name] = useState(initialName);
  const [playerId, setPlayerId] = useState(initialPlayerId);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState(null);
  const [errorBanner, setErrorBanner] = useState(null);

  const pollRef = useRef(null);
  const playersUnsubRef = useRef(null);
  const gamesUnsubRef = useRef(null);

  // load players
  const loadPlayers = async () => {
    if (!code) return;
    const { data, error } = await fetchPlayers(code);
    if (error) {
      console.error('fetchPlayers error', error);
      return;
    }
    setPlayers(data || []);
  };

  // load game
  const loadGame = async () => {
    if (!code) return;
    const { data, error } = await fetchGameByCode(code);
    if (error) {
      console.error('fetchGameByCode error', error);
      return;
    }
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

    // polling fallback
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      loadPlayers();
      loadGame();
    }, 1000);

    // realtime players
    try {
      const { unsubscribe } = subscribePlayers(code, ({ eventType, payload }) => {
        setPlayers((prev) => {
          try {
            if (eventType === 'INSERT') {
              const newRow = payload.new;
              if (!newRow) return prev;
              if (prev.some((p) => p.id === newRow.id)) return prev;
              return [...prev, newRow];
            }
            if (eventType === 'UPDATE') {
              const updated = payload.new;
              if (!updated) return prev;
              return prev.map((p) => (p.id === updated.id ? updated : p));
            }
            if (eventType === 'DELETE') {
              const oldRow = payload.old;
              if (!oldRow) return prev;
              return prev.filter((p) => p.id !== oldRow.id);
            }
          } catch (e) {
            console.error('realtime players handler error', e);
          }
          return prev;
        });
      });
      playersUnsubRef.current = unsubscribe;
    } catch (e) {
      console.warn('subscribePlayers failed', e);
    }

    // realtime games: следим за state -> running
    try {
      const { unsubscribe } = subscribeGames(code, ({ eventType, payload }) => {
        try {
          const row = payload.new || payload.old;
          if (row) {
            setGame(row);
          }
        } catch (e) {
          console.error('realtime games handler error', e);
        }
      });
      gamesUnsubRef.current = unsubscribe;
    } catch (e) {
      console.warn('subscribeGames failed', e);
    }

    return () => {
      mounted = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (playersUnsubRef.current) {
        try { playersUnsubRef.current(); } catch (e) { /* ignore */ }
        playersUnsubRef.current = null;
      }
      if (gamesUnsubRef.current) {
        try { gamesUnsubRef.current(); } catch (e) { /* ignore */ }
        gamesUnsubRef.current = null;
      }
    };
  }, [code]);

  // redirect to game only when game.state === 'running'
  useEffect(() => {
    if (!game) return;
    if (game.state === 'running') {
      nav(`/game/${code}`, { state: { gameId: game.id, playerId, name } });
    }
  }, [game, code, nav, playerId, name]);

  // debug logs
  useEffect(() => {
    console.log('[lobby debug] playerId:', playerId);
    console.log('[lobby debug] players:', players);
    console.log('[lobby debug] game:', game);
  }, [players, playerId, game]);

  const toggleReady = async (id, current) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, is_ready: !current } : p)));
    const { data, error } = await setPlayerReady(id, !current);
    if (error) {
      console.error('setPlayerReady error', error);
      setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, is_ready: current } : p)));
      setErrorBanner('Не удалось изменить готовность: ' + (error.message || 'ошибка'));
      setTimeout(() => setErrorBanner(null), 4000);
    } else if (data) {
      setPlayers((prev) => prev.map((p) => (p.id === id ? data : p)));
    }
  };

  const handleLeave = async () => {
    try {
      if (playerId) await removePlayer(playerId);
    } catch (e) {
      console.warn('removePlayer failed', e);
    } finally {
      localStorage.removeItem('playerId');
      nav('/');
    }
  };

  const handleCopyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setErrorBanner('Не удалось скопировать код');
      setTimeout(() => setErrorBanner(null), 3000);
    }
  };

  const currentPlayerRecord = players.find((p) => p.id === playerId);
  const isHost = !!(currentPlayerRecord && currentPlayerRecord.is_host);
  const fallbackHost = !isHost && players.length > 0 && players[0].id === playerId;
  const allReady = players.length > 0 && players.every((p) => p.is_ready);

  const handleStartGame = async () => {
    if (!isHost && !fallbackHost) return;
    if (!allReady) {
      if (!confirm('Не все игроки готовы. Всё равно начать?')) return;
    }

    setErrorBanner(null);
    try {
      console.log('[lobby] startGame request for room', code);
      const res = await startGame(code);
      console.log('[lobby] startGame response', res);

      if (res.error) {
        const msg = res.error.message || JSON.stringify(res.error);
        console.error('[lobby] startGame error details:', res);
        setErrorBanner('Не удалось запустить игру: ' + msg);
        setTimeout(() => setErrorBanner(null), 6000);
        return;
      }

      if (res.data && res.data.game_id) {
        // сразу переходим, но обычно realtime/games подхватит это
        nav(`/game/${code}`, { state: { gameId: res.data.game_id, playerId, name } });
      } else {
        // ждём обновления games через realtime/polling
        setErrorBanner('Игра запускается, ожидаем подтверждения...');
        setTimeout(() => setErrorBanner(null), 3000);
      }
    } catch (e) {
      console.error('handleStartGame exception', e);
      setErrorBanner('Ошибка при старте игры: ' + (e.message || e));
      setTimeout(() => setErrorBanner(null), 6000);
    }
  };

  return (
    <div className="screen-center">
      <div className="title-wrap">
        <h1 className="app-title flicker">МАФИЯ</h1>
        <p className="subtitle">Лобби — код комнаты: <strong style={{ color: '#ffd84d' }}>{code || '—'}</strong></p>
      </div>

      <div style={{ width: '100%', maxWidth: 720, padding: 18 }}>
        {errorBanner && (
          <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: '#3b1f1f', color: '#ffd1d1', fontWeight: 700 }}>
            {errorBanner}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,200,50,0.06)', color: '#ffd84d', fontWeight: 700 }}>
              {code || '—'}
            </div>
            <button className="glow-btn" onClick={handleCopyCode} style={{ flex: '0 0 auto', padding: '8px 12px', fontSize: 14 }}>
              {copied ? 'Скопировано' : 'Копировать код'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="glow-btn ghost" onClick={handleLeave} style={{ padding: '8px 12px', fontSize: 14 }}>
              Выйти
            </button>

            {(isHost || fallbackHost) && (
              <button className="glow-btn" onClick={handleStartGame} style={{ padding: '8px 12px', fontSize: 14 }}>
                Начать игру
              </button>
            )}
          </div>
        </div>

        <section style={{ background: 'rgba(0,0,0,0.28)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,200,50,0.06)' }}>
          <h3 style={{ margin: 0, marginBottom: 10 }}>Игроки ({players.length})</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {players.map((p) => (
              <li key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderRadius: 8, background: p.is_alive ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(180deg, rgba(255,216,77,0.08), rgba(255,200,50,0.03))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffd84d', fontWeight: 800, fontSize: 16 }} aria-hidden>
                    {p.name ? p.name.charAt(0).toUpperCase() : '?'}
                  </div>

                  <div>
                    <div style={{ fontWeight: 700, color: '#fff' }}>
                      {p.name} {p.is_host && <span style={{ color: '#ffd84d', fontSize: 12, marginLeft: 6 }}>(host)</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#cfcfcf' }}>{p.is_alive ? 'В игре' : 'Выбывший'}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 14, color: p.is_ready ? '#9ee29e' : '#ffd84d', fontWeight: 700 }}>{p.is_ready ? 'Готов' : 'Не готов'}</div>

                  {p.id === playerId ? (
                    <button className="glow-btn" onClick={() => toggleReady(p.id, p.is_ready)} aria-pressed={p.is_ready} aria-label={p.is_ready ? 'Отменить готовность' : 'Отметить готовность'} style={{ padding: '8px 10px', fontSize: 13, minWidth: 110 }}>
                      {p.is_ready ? 'Отменить' : 'Готов'}
                    </button>
                  ) : (
                    <div style={{ width: 110 }} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="small-footer">Версия прототипа</footer>
    </div>
  );
}
