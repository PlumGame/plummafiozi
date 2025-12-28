// src/pages/MainScreen.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './css/MainScreen.css'; // подключаем локальный CSS для этого экрана

export default function MainScreen() {
  const nav = useNavigate();

  return (
    <main className="ms-screen" role="main" aria-label="Главный экран">
      <div className="ms-bg" aria-hidden="true" />

      <div className="ms-content">
        <header className="ms-header">
          <div className="ms-title-card" aria-hidden="false">
            <h1 className="ms-title">МАФИЯ</h1>
            <p className="ms-subtitle">Онлайн игра с друзьями</p>
          </div>
        </header>

        <nav className="ms-actions" role="navigation" aria-label="Главные действия">
          <button className="ms-btn ms-btn-primary" onClick={() => nav('/create')} aria-label="Создать игру">
            Создать игру
          </button>
          <button className="ms-btn ms-btn-secondary" onClick={() => nav('/join')} aria-label="Войти в комнату">
            Войти в комнату
          </button>
          <button className="ms-btn ms-btn-ghost" onClick={() => nav('/rules')} aria-label="Правила игры">
            Правила
          </button>
        </nav>

        <footer className="ms-footer" aria-hidden="false">Версия прототипа</footer>
      </div>
    </main>
  );
}
