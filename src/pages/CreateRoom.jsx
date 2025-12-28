// src/pages/CreateRoom.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, addPlayer, getRoom } from '../lib/rooms';
import '../index.css';

function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // без похожих символов
  let code = '';
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default function CreateRoom() {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      alert('Введите имя');
      return;
    }

    setCreating(true);

    // Попробуем сгенерировать уникальный код (несколько попыток)
    let code;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = generateCode();
      try {
        const { data: existing, error: getErr } = await getRoom(code);
        if (getErr) {
          console.error('getRoom error', getErr);
          // не прерываем — попробуем создать и поймаем ошибку при insert
        }
        if (!existing) break; // код свободен
      } catch (e) {
        console.error('getRoom exception', e);
      }
      code = null;
    }
    if (!code) {
      alert('Не удалось сгенерировать код комнаты. Попробуйте ещё раз.');
      setCreating(false);
      return;
    }

    try {
      const { data: room, error: roomErr } = await createRoom({ code, host: trimmedName });
      console.log('createRoom', { code, room, roomErr });
      if (roomErr) {
        console.error('createRoom error', roomErr);
        alert('Не удалось создать комнату: ' + (roomErr.message || 'ошибка'));
        setCreating(false);
        return;
      }

      const { data: player, error: playerErr } = await addPlayer({ roomCode: code, name: trimmedName });
      console.log('addPlayer', { code, player, playerErr });
      if (playerErr) {
        console.error('addPlayer error', playerErr);
        alert('Комната создана, но не удалось добавить игрока: ' + (playerErr.message || 'ошибка'));
        setCreating(false);
        return;
      }

      // Сохраняем playerId локально и переходим в лобби
      try {
        localStorage.setItem('playerId', player.id);
      } catch (e) {
        console.warn('localStorage setItem failed', e);
      }
      nav(`/lobby/${code}`, { state: { name: trimmedName, playerId: player.id } });
    } catch (e) {
      console.error('handleCreate exception', e);
      alert('Произошла ошибка при создании комнаты');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="screen-center">
      <div className="title-wrap">
        <h1 className="app-title flicker">МАФИЯ</h1>
        <p className="subtitle">Создать новую комнату</p>
      </div>

      <div style={{ width: '100%', maxWidth: 520, padding: 18 }}>
        <div className="card" style={{ padding: 18 }}>
          <label style={{ display: 'block', marginBottom: 12, color: '#ddd', fontSize: 13 }}>
            Ваше имя
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Введите имя"
              style={{ display: 'block', width: '100%', marginTop: 8, padding: 8, borderRadius: 6 }}
              aria-label="Ваше имя"
            />
          </label>

          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button
              className="glow-btn"
              onClick={handleCreate}
              disabled={creating}
              aria-label="Создать комнату"
              style={{ flex: 1 }}
            >
              {creating ? 'Создаём…' : 'Создать комнату'}
            </button>

            <button
              className="glow-btn ghost"
              onClick={() => (window.location.href = '/')}
              aria-label="Отмена"
              style={{ padding: '10px 14px' }}
            >
              Отмена
            </button>
          </div>
        </div>
      </div>

      <footer className="small-footer">Версия прототипа</footer>
    </div>
  );
}
