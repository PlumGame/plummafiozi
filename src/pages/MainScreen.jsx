// src/pages/MainScreen.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../index.css';

export default function MainScreen() {
  const nav = useNavigate();

  return (
    <div
      className="screen-center"
      style={{
        backgroundImage: "url('/images/bg.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
      }}
    >
      <div className="title-wrap">
        <h1 className="app-title flicker">МАФИЯ</h1>
        <p className="subtitle">Онлайн игра с друзьями</p>
      </div>

      <div className="btn-column" role="navigation" aria-label="Главные действия">
        <button
          className="glow-btn"
          onClick={() => nav('/create')}
          aria-label="Создать игру"
        >
          Создать игру
        </button>

        <button
          className="glow-btn"
          onClick={() => nav('/join')}
          aria-label="Войти в комнату"
        >
          Войти в комнату
        </button>

        <button
          className="glow-btn ghost"
          onClick={() => nav('/rules')}
          aria-label="Правила игры"
        >
          Правила
        </button>
      </div>

      <footer className="small-footer">Версия прототипа</footer>
    </div>
  );
}
