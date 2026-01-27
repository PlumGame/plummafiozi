// src/pages/MainScreen.jsx
import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './css/MainScreen.css';
import bgMusic from '../assets/bg.mp3';

export default function MainScreen() {
  const nav = useNavigate();
  const audioRef = useRef(null);

  const [isSoundOn, setIsSoundOn] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // проверяем сохранённое состояние
    const saved = localStorage.getItem('mafia_sound');
    const soundOn = saved === 'true';

    setIsSoundOn(soundOn);

    audio.loop = true;
    audio.volume = soundOn ? 0.4 : 0;
    audio.muted = !soundOn;

    // стартуем музыку (muted)
    audio.play().catch(() => { });
  }, []);

  const toggleSound = () => {
    const audio = audioRef.current;
    if (!audio) return;

    const newState = !isSoundOn;
    setIsSoundOn(newState);

    audio.muted = !newState;
    audio.volume = newState ? 0.4 : 0;

    localStorage.setItem('mafia_sound', newState);
  };

  return (
    <main className="ms-screen" role="main" aria-label="Главный экран">
      <div className="ms-bg" aria-hidden="true" />

      <audio
        ref={audioRef}
        src={bgMusic}
        playsInline
        preload="auto"
      />

      <div className="ms-content">
        <header className="ms-header">
          <div className="ms-title-card">
            <h1 className="ms-title">МАФИЯ</h1>
            <p className="ms-subtitle">Онлайн игра с друзьями</p>
          </div>
        </header>

        <nav className="ms-actions">
          <button className="ms-btn ms-btn-primary" onClick={() => nav('/create')}>
            Создать игру
          </button>
          <button className="ms-btn ms-btn-secondary" onClick={() => nav('/join')}>
            Войти в комнату
          </button>
          <a
            href="https://buymeacoffee.com/plumgamestudio"
            target="_blank"
            rel="noopener noreferrer"
            className="ms-btn ms-btn-support"
          >
            Поддержать проект
          </a>

          <button className="ms-btn ms-btn-ghost" onClick={() => nav('/rules')}>
            Правила игры
          </button>

          {/* Кнопка звука */}
          <button
            className={`ms-btn ms-sound-btn ${isSoundOn ? '' : 'off'}`}
            onClick={toggleSound}
          >
            {isSoundOn ? 'Звук ВКЛ' : 'Звук ВЫКЛ'}

            <span className="ms-sound-bars" aria-hidden="true">
              <span></span><span></span><span></span><span></span><span></span>
            </span>
          </button>
        </nav>
        <footer className="ms-footer">БЕТА версия #145.2</footer>
      </div>
    </main>
  );
}
