// src/pages/Game.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import './css/Game.css';
import { ROLES } from '../config/roles';
import { supabase } from '../lib/supabase';
import {
  fetchGameByCode,
  getMyRole,
  fetchPlayers,
  submitPlayerAction,
  startNight,
  resolveNight,
} from '../lib/rooms';

export default function Game() {
  const { code } = useParams();
  const location = useLocation();
  const nav = useNavigate();

  const initialPlayerId = (location.state && location.state.playerId) || localStorage.getItem('playerId');
  const initialGameId = (location.state && location.state.gameId) || null;

  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [myRole, setMyRole] = useState(null);
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
  const [lastResolve, setLastResolve] = useState(null);

  const gameSubRef = useRef(null);
  const actionsSubRef = useRef(null);

  // Загрузка игры и игроков
  const loadAll = async () => {
    try {
      const { data: g } = await fetchGameByCode(code);
      if (g) {
        setGame(g);
        setPhase(g.phase);
        setPhaseEndsAt(g.phase_ends_at);
      }

      const { data: pls } = await fetchPlayers(code);
      if (pls) setPlayers(pls);

      const gameId = initialGameId || (g && g.id);
      if (initialPlayerId && gameId) {
        const { data: roleRow } = await getMyRole(initialPlayerId, gameId);
        if (roleRow) setMyRole(roleRow);
      }
    } catch (e) {
      console.error('[loadAll] error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!code) { nav('/'); return; }
    loadAll();

    // Подписка на изменения игры
    gameSubRef.current = supabase
      .channel(`game_changes_${code}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `code=eq.${code}` }, (payload) => {
        const newRow = payload.new;
        if (newRow) {
          setGame(newRow);
          setPhase(newRow.phase);
          setPhaseEndsAt(newRow.phase_ends_at);
          setActionDone(false);
        }
      })
      .subscribe();

    // Подписка на действия игроков
    actionsSubRef.current = supabase
      .channel(`game_actions_${code}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'actions', filter: `game_id=eq.${game?.id}` }, (payload) => {
        setLastResolve(payload.new);
      })
      .subscribe();

    return () => {
      if (gameSubRef.current) supabase.removeChannel(gameSubRef.current);
      if (actionsSubRef.current) supabase.removeChannel(actionsSubRef.current);
    };
  }, [code, game?.id]);

  // Таймер для фазы
  useEffect(() => {
    if (!phaseEndsAt) { setTimer(null); return; }
    const ti = setInterval(() => {
      const left = Math.max(0, Math.round((new Date(phaseEndsAt).getTime() - Date.now()) / 1000));
      setTimer(left);
      if (left <= 0) clearInterval(ti);
    }, 1000);
    return () => clearInterval(ti);
  }, [phaseEndsAt]);

  const roleName = myRole?.role?.toLowerCase() || null;
  const roleConfig = roleName ? ROLES[roleName] : null;

  // Хост
  const isHost = players.find(p => String(p.id) === String(initialPlayerId))?.is_host;
  const availableTargets = players.filter(p => p.is_alive && String(p.id) !== String(initialPlayerId));

  const submitAction = async (actionType, targetId) => {
    if (!targetId || actionSubmitting) return;
    setActionSubmitting(true);
    try {
      const phaseKey = `${game.phase}-${game?.day ?? 0}`;
      await submitPlayerAction({ gameId: game.id, playerId: initialPlayerId, phase: phaseKey, actionType, targetId });
      setActionDone(true);
    } catch (e) {
      alert('Ошибка: ' + e.message);
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleStartNight = async (sec = 60) => {
    await startNight(code, sec);
  };

  const handleResolveNight = async () => {
    await resolveNight(code);
  };

  if (loading) return <div className="screen-center">Загрузка игры...</div>;

  return (
    <div className={`screen-center game-screen minimal ${game?.phase === 'night' ? 'night' : 'day'}`}>
      <div className={`game-container ${zoomCard ? 'zoom' : ''}`}>

        <header className="game-top">
          <div className="title-row">
            <div className="title-left">
              <div className="small-title">Игра</div>
              <div className="code-pill subtle">{code}</div>
            </div>
            <div className="title-right">
              <div className="meta small muted">Фаза: <strong>{game?.phase === 'night' ? 'НОЧЬ' : 'ДЕНЬ'}</strong></div>
              <div className="meta small muted">День: <strong>{game?.day ?? 1}</strong></div>

              {isHost && (
                <div className="host-buttons" style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {game?.phase !== 'night' ? (
                    <button className="glow-btn small" onClick={() => handleStartNight(60)}>Начать ночь</button>
                  ) : (
                    <button className="glow-btn start-game small" onClick={handleResolveNight} style={{ background: '#ff4757' }}>Итоги ночи</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="game-main">
          <section className="role-area card-soft">
            <div className="role-header">
              <h3 className="section-title">Ваша роль</h3>
              <div className="role-controls">
                <button className="icon-btn" onClick={() => setZoomCard(!zoomCard)}>{zoomCard ? '−' : '+'}</button>
                <button className="icon-btn" onClick={() => setRevealed(!revealed)}>{revealed ? 'Скрыть' : 'Глаз'}</button>
              </div>
            </div>

            <div className={`role-card compact ${revealed ? 'revealed' : ''}`}>
              <div className="role-info">
                <div className="role-name" style={{ color: roleConfig?.color }}>
                  {revealed ? roleConfig?.name : '??????'}
                </div>
                <div className={`role-status ${myRole?.is_alive ? 'alive' : 'dead'}`}>
                  {myRole?.is_alive ? 'ЖИВОЙ' : 'ВЫБЫЛ'}
                </div>
                {revealed && <div className="role-desc" style={{ fontSize: 12, opacity: 0.7 }}>{roleConfig?.description}</div>}
              </div>
              <div className="role-media">
                {revealed && roleConfig?.image ? <img src={roleConfig.image} alt={roleConfig.name} className="role-thumb"/> : <div className="role-placeholder">?</div>}
              </div>
            </div>

            {game?.phase === 'night' && myRole?.is_alive && roleName !== 'villager' && (
              <div className="action-panel" style={{ marginTop: 20, padding: 15, background: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>
                <p style={{ fontSize: 12, marginBottom: 10, opacity: 0.7 }}>Выберите цель:</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select disabled={actionDone} value={actionTarget} onChange={(e) => setActionTarget(e.target.value)} className="action-select">
                    <option value="">Выберите игрока</option>
                    {availableTargets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button className={`glow-btn ${actionDone ? 'success' : ''}`} disabled={!actionTarget || actionSubmitting || actionDone} onClick={() => submitAction(
                    roleName === 'mafia' ? 'kill' : roleName === 'doctor' ? 'save' : 'check',
                    actionTarget
                  )}>
                    {actionSubmitting ? '...' : actionDone ? 'Готово' : 'ОК'}
                  </button>
                </div>
                {timer !== null && <div className="timer-sub" style={{ marginTop: 10, fontSize: 11 }}>Осталось: {timer}с</div>}
              </div>
            )}
          </section>

          <aside className="players-area card-soft">
            <div className="players-header">
              <h3 className="section-title">Игроки ({players.length})</h3>
              <button className="icon-btn" onClick={() => setPlayersOpen(!playersOpen)}>👥</button>
            </div>
            <div className={`players-list-wrap ${playersOpen ? 'open' : ''}`}>
              <ul className="players-compact">
                {players.map((p) => (
                  <li key={p.id} className={`player-row ${String(p.id) === String(initialPlayerId) ? 'you' : ''} ${!p.is_alive ? 'dead' : ''}`}>
                    <span className="player-name">{p.name} {p.is_host && '⭐'}</span>
                    <span className={`status-tag ${p.is_alive ? 'alive' : 'out'}`}>{p.is_alive ? 'Жив' : 'Выбыл'}</span>
                  </li>
                ))}
              </ul>
              <button className="glow-btn ghost full-width" style={{ marginTop: 10 }} onClick={() => nav(`/lobby/${code}`)}>В лобби</button>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
