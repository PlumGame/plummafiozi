// src/pages/JoinRoom.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRoom, addPlayer, getPlayer } from '../lib/rooms';

import './css/JoinRoom.css';

export default function JoinRoom() {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

const handleJoin = async () => {
  const trimmed = (code || '').trim().toUpperCase();
  const trimmedName = (name || '').trim();

  if (!trimmed || !trimmedName) {
    alert('Введите код комнаты и имя');
    return;
  }

  if (trimmedName === trimmed) {
    alert('Имя не может совпадать с кодом комнаты');
    return;
  }

 const existingPlayerId = localStorage.getItem('playerId');

if (existingPlayerId) {
  const { data: existingPlayer } = await getPlayer(trimmed, existingPlayerId);

  if (existingPlayer) {
    nav(`/lobby/${trimmed}`, {
      state: {
        playerId: existingPlayer.id,
        name: existingPlayer.name,
      },
    });
    return;
  } else {
    localStorage.removeItem('playerId');
  }
}


  setJoining(true);
  try {
    const { data: room } = await getRoom(trimmed);
    if (!room) {
      alert('Комната не найдена');
      return;
    }

    const { data: player, error } = await addPlayer({
      roomCode: trimmed,
      name: trimmedName,
    });

    if (error) {
      alert('Ошибка входа');
      return;
    }

    nav(`/lobby/${trimmed}`, { state: { playerId: player.id } });
  } finally {
    setJoining(false);
  }
};


  const handlePasteCode = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setCode(text.trim().toUpperCase());
    } catch {
      // ignore clipboard errors silently
    }
  };

  return (
    <div className="screen-center">
      <div className="title-wrap">
        <h1 className="app-title flicker">МАФИЯ</h1>
        <p className="subtitle">Войти в существующую комнату</p>
      </div>

      <div style={{ width: '100%', maxWidth: 420, padding: 18 }}>
        <label style={{ display: 'block', marginBottom: 12, color: '#ddd', fontSize: 13 }}>
          Код комнаты
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Например: ABC123"
            style={{ marginTop: 8 }}
            aria-label="Код комнаты"
            inputMode="text"
          />
        </label>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            className="glow-btn"
            onClick={handlePasteCode}
            aria-label="Вставить код из буфера обмена"
            style={{ flex: '0 0 140px', fontSize: 14, padding: '10px 12px' }}
            type="button"
          >
            Вставить код
          </button>

          <button
            className="glow-btn ghost"
            onClick={() => setCode('')}
            aria-label="Очистить код"
            style={{ flex: '1 1 auto', fontSize: 14, padding: '10px 12px' }}
            type="button"
          >
            Очистить
          </button>
        </div>

        <label style={{ display: 'block', marginBottom: 12, color: '#ddd', fontSize: 13 }}>
          Ваше имя
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Как вас зовут?"
            style={{ marginTop: 8 }}
            aria-label="Ваше имя"
          />
        </label>

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            className="glow-btn"
            onClick={handleJoin}
            disabled={joining}
            aria-label="Войти в комнату"
            style={{ flex: 1 }}
          >
            {joining ? 'Входим...' : 'Войти в комнату'}
          </button>
        </div>
      </div>

      <footer className="small-footer">Версия прототипа</footer>
    </div>
  );
}
