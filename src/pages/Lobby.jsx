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

  const loadPlayers = async () => {
    if (!code) return;
    const { data, error } = await fetchPlayers(code);
    if (!error) setPlayers(data || []);
  };

  const loadGame = async () => {
    if (!code) return;
    const { data, error } = await fetchGameByCode(code);
    if (!error) setGame(data || null);
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

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      loadPlayers();
      loadGame();
    }, 1000);

    try {
      const { unsubscribe } = subscribePlayers(code, ({ eventType, payload }) => {
        setPlayers(prev => {
          if (eventType === 'INSERT') {
            const newRow = payload.new;
            if (!newRow) return prev;
            if (prev.some(p => p.id === newRow.id)) return prev;
            return [...prev, newRow];
          }
          if (eventType === 'UPDATE') {
            const updated = payload.new;
            if (!updated) return prev;
            return prev.map(p => (p.id === updated.id ? updated : p));
          }
          if (eventType === 'DELETE') {
            const oldRow = payload.old;
            if (!oldRow) return prev;
            return prev.filter(p => p.id !== oldRow.id);
          }
          return prev;
        });
      });
      playersUnsubRef.current = unsubscribe;
    } catch (e) {
      console.warn('subscribePlayers failed', e);
    }

    try {
      const { unsubscribe } = subscribeGames(code, ({ payload }) => {
        const row = payload.new || payload.old;
        if (row) setGame(row);
      });
      gamesUnsubRef.current = unsubscribe;
    } catch (e) {
      console.warn('subscribeGames failed', e);
    }

    return () => {
      mounted = false;
      pollRef.current && clearInterval(pollRef.current);
      playersUnsubRef.current && playersUnsubRef.current();
      gamesUnsubRef.current && gamesUnsubRef.current();
    };
  }, [code]);

  useEffect(() => {
    if (game?.state === 'running') {
      nav(`/game/${code}`, { state: { gameId: game.id, playerId, name } });
    }
  }, [game, code, nav, playerId, name]);

  const toggleReady = async (id, current) => {
    setPlayers(prev => prev.map(p => (p.id === id ? { ...p, is_ready: !current } : p)));
    const { data, error } = await setPlayerReady(id, !current);
    if (error) {
      setPlayers(prev => prev.map(p => (p.id === id ? { ...p, is_ready: current } : p)));
      setErrorBanner('Не удалось изменить готовность');
      setTimeout(() => setErrorBanner(null), 4000);
    } else if (data) {
      setPlayers(prev => prev.map(p => (p.id === id ? data : p)));
    }
  };

  const handleLeave = async () => {
    try { playerId && await removePlayer(playerId); } catch {}
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

  const currentPlayerRecord = players.find(p => p.id === playerId);
  const isHost = !!(currentPlayerRecord && currentPlayerRecord.is_host);
  const fallbackHost = !isHost && players.length > 0 && players[0].id === playerId;
  const allReady = players.length > 0 && players.every(p => p.is_ready);

  const handleStartGame = async () => {
    if (!isHost && !fallbackHost) return;
    if (!allReady && !confirm('Не все игроки готовы. Всё равно начать?')) return;

    try {
      const res = await startGame(code);
      if (res.error) {
        setErrorBanner('Не удалось запустить игру');
        setTimeout(() => setErrorBanner(null), 6000);
        return;
      }
      res.data?.game_id && nav(`/game/${code}`, { state: { gameId: res.data.game_id, playerId, name } });
    } catch {
      setErrorBanner('Ошибка при старте игры');
      setTimeout(() => setErrorBanner(null), 6000);
    }
  };

  return (
    <div className="screen-center lobby-root">
      <div className="title-wrap">
        <h1 className="app-title flicker">МАФИЯ</h1>
        <p className="subtitle">
          Лобби — код комнаты: <strong className="code-highlight">{code || '—'}</strong>
        </p>
      </div>

      <div className="lobby-container">
        {errorBanner && <div className="error-banner">{errorBanner}</div>}

        <div className="top-controls">
          <div className="code-group">
            <div className="room-code">{code || '—'}</div>
            <button className="glow-btn" onClick={handleCopyCode}>{copied ? 'Скопировано' : 'Копировать код'}</button>
          </div>

          <div className="action-buttons">
            <button className="glow-btn ghost" onClick={handleLeave}>Выйти</button>
            {(isHost || fallbackHost) && (
              <button className="glow-btn start-game" onClick={handleStartGame}>Начать игру</button>
            )}
          </div>
        </div>

        <section className="players-section">
          <h3>Игроки ({players.length})</h3>
          <ul className="players-list">
            {players.map(p => (
              <li key={p.id} className={`player-item ${!p.is_alive ? 'dead' : ''}`}>
                <div className="player-info">
                  <div className="player-avatar">{p.name?.charAt(0).toUpperCase() || '?'}</div>
                  <div>
                    <div className="player-name">
                      {p.name} {p.is_host && <span className="host-label">(host)</span>}
                    </div>
                    <div className="player-status">{p.is_alive ? 'В игре' : 'Выбывший'}</div>
                  </div>
                </div>
                <div className="player-actions">
                  <div className={`ready-status ${p.is_ready ? 'ready' : 'not-ready'}`}>
                    {p.is_ready ? 'Готов' : 'Не готов'}
                  </div>
                  {p.id === playerId && (
                    <button className="glow-btn ready-btn" onClick={() => toggleReady(p.id, p.is_ready)}>
                      {p.is_ready ? 'Отменить' : 'Готов'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="small-footer"></footer>
    </div>
  );
}
