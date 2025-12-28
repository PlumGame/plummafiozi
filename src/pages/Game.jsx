// src/pages/Game.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import './css/Game.css';
import { fetchGameByCode, getMyRole, fetchPlayers } from '../lib/rooms';

const ROLE_IMAGE_MAP = {
  mafia: '/assets/roles/mafia.png',
  sheriff: '/assets/roles/sheriff.png',
  doctor: '/assets/roles/doctor.png',
  villager: '/assets/roles/villager.png',
};

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
  const pollRef = useRef(null);

  const loadAll = async () => {
    try {
      const { data: g, error: gameErr } = await fetchGameByCode(code);
      if (!gameErr) setGame(g || null);

      const { data: pls, error: plsErr } = await fetchPlayers(code);
      if (!plsErr) setPlayers(pls || []);

      const gameId = initialGameId || (g && g.id);
      if (!initialPlayerId) return;
      if (gameId) {
        const { data: roleRow, error: roleErr } = await getMyRole(initialPlayerId, gameId);
        if (!roleErr && roleRow) setMyRole(roleRow);
      }
    } catch (e) {
      console.error('loadAll exception', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!code) {
      nav('/');
      return;
    }
    setLoading(true);
    loadAll();
    pollRef.current = setInterval(loadAll, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const roleName = myRole && myRole.role ? myRole.role.toLowerCase() : null;
  const roleImageSrc = roleName ? (ROLE_IMAGE_MAP[roleName] || `/assets/roles/${roleName}.png`) : null;

  return (
    <div
  className={`screen-center game-screen minimal ${
    game?.state === 'night' ? 'night' : 'day'
  }`}
>
      <div className={`game-container ${zoomCard ? 'zoom' : ''}`}>
        <header className="game-top">
          <div className="title-row">
            <div className="title-left">
              <div className="small-title">Игра</div>
              <div className="code-pill subtle">{code}</div>
            </div>

            <div className="title-right">
              <div className="meta small muted">Состояние: <strong>{game ? game.state : (loading ? 'загрузка...' : '—')}</strong></div>
              <div className="meta small muted">День: <strong>{game ? (game.day ?? '—') : '—'}</strong></div>
            </div>
          </div>
        </header>

        <main className="game-main">
          <section className="role-area card-soft">
            <div className="role-header">
              <h3 className="section-title">Ваша роль</h3>
              <div className="role-controls">
                <button className="icon-btn" onClick={() => setZoomCard((s) => !s)} aria-pressed={zoomCard} title="Увеличить карточку">
                  {zoomCard ? 'Уменьшить' : 'Увеличить'}
                </button>
                <button className="icon-btn" onClick={() => setRevealed((s) => !s)} aria-pressed={revealed}>
                  {revealed ? 'Скрыть' : 'Показать'}
                </button>
              </div>
            </div>

            <div
  className={`role-card compact
    ${revealed ? 'revealed' : ''}
    ${revealed && roleName === 'mafia' ? 'mafia' : ''}
  `}
>
              <div className="role-info">
                <div className="role-name">{roleName ? roleName.toUpperCase() : '—'}</div>
                <div className={`role-status ${myRole?.is_alive ? 'alive' : 'dead'}`}>{myRole ? (myRole.is_alive ? 'Вы живы' : 'Вы выбиты') : ''}</div>
              </div>

              <div className="role-media">
                {roleImageSrc ? (
                  <img src={roleImageSrc} alt={roleName} className="role-thumb" />
                ) : (
                  <div className="role-placeholder">Изображение отсутствует</div>
                )}
              </div>
            </div>

            <div className="role-note muted small">Карточка приватна — показывайте только себе</div>
          </section>

          <aside className="players-area card-soft">
            <div className="players-header">
              <h3 className="section-title">Игроки <span className="muted">({players.length})</span></h3>
              <button className="icon-btn" onClick={() => setPlayersOpen((s) => !s)} aria-expanded={playersOpen}>
                {playersOpen ? 'Скрыть' : 'Список'}
              </button>
            </div>

            <div className={`players-list-wrap ${playersOpen ? 'open' : ''}`}>
              <ul className="players-compact">
                {players.map((p) => (
                  <li key={p.id} className={`player-row ${p.id === initialPlayerId ? 'you' : ''}`}>
                    <div className="player-meta">
                      <div className="player-name">{p.name}</div>
                      <div className="player-sub muted">{p.is_host ? 'host' : p.is_alive ? 'в игре' : 'выбывший'}</div>
                    </div>
                    <div className="player-state">
                      <span className={`ready-dot ${p.is_ready ? 'ready' : 'not-ready'}`} aria-hidden />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="players-actions">
                <button className="glow-btn ghost" onClick={() => nav(`/lobby/${code}`)}>Вернуться в лобби</button>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
