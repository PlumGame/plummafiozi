import React from 'react';
import { useNavigate } from 'react-router-dom';
import './css/Rules.css';

export default function Rules() {
  const nav = useNavigate();

  return (
    <div className="rules-screen">

      {/* TITLE */}
      <header className="rules-header">
        <h1 className="rules-title flicker">МАФИЯ</h1>
        <p className="rules-subtitle">
          Полные правила игры
        </p>
      </header>

      {/* INTRO */}
      <section className="rules-section intro">
        <p>
          <b>Мафия</b> — это психологическая ролевая игра на логику,
          обман и внимательность.  
          Игроки делятся на <b>мирных</b> и <b>мафию</b>.
        </p>
        <p>
          Игра проходит циклами <b>Ночь → День</b>,
          пока одна из сторон не победит.
        </p>
      </section>

      {/* ROLES */}
      <section className="rules-section">
        <h2>Роли</h2>

        <div className="roles-grid">
          <Role
            img="/assets/roles/villager.png"
            title="Мирный житель"
            desc={[
              'Ночью спит',
              'Днём обсуждает и голосует',
              'Побеждает, если уничтожена мафия',
            ]}
          />

          <Role
            img="/assets/roles/mafia.png"
            title="Мафия"
            danger
            desc={[
              'Ночью выбирает жертву',
              'Днём притворяется мирным',
              'Побеждает, если мафия ≥ мирных',
            ]}
          />

          <Role
            img="/assets/roles/sheriff.png"
            title="Шериф"
            info
            desc={[
              'Ночью проверяет игроков',
              'Узнаёт сторону (мафия / нет)',
              'Помогает городу',
            ]}
          />

          <Role
            img="/assets/roles/doctor.png"
            title="Доктор"
            heal
            desc={[
              'Ночью лечит одного игрока',
              'Может спасти от убийства',
              'Нельзя лечить одного и того же',
            ]}
          />
        </div>
      </section>

      {/* NIGHT */}
      <section className="rules-section night">
        <h2>🌙 Ночь</h2>
        <ul>
          <li>Город засыпает</li>
          <li>Каждая роль делает свой ход по очереди</li>
          <li>Мафия выбирает жертву</li>
          <li>Доктор может спасти</li>
          <li>Шериф проверяет игрока</li>
        </ul>
      </section>

      {/* DAY */}
      <section className="rules-section day">
        <h2>☀️ День</h2>
        <ul>
          <li>Город просыпается</li>
          <li>Объявляются итоги ночи</li>
          <li>Игроки обсуждают происходящее</li>
          <li>Проходит голосование</li>
          <li>Игрок с большинством голосов выбывает</li>
        </ul>
      </section>

      {/* WIN */}
      <section className="rules-section win">
        <h2>🏆 Победа</h2>
        <p>
          <b>Мирные побеждают</b>, если вся мафия уничтожена.
        </p>
        <p>
          <b>Мафия побеждает</b>, если количество мафии
          становится равным или больше количества мирных.
        </p>
      </section>

      <footer className="rules-footer">
<button
  className="exit-door-btn"
  onClick={() => nav('/')}
>
  В главное меню
</button>

      </footer>
    </div>
  );
}

function Role({ img, title, desc, danger, info, heal }) {
  return (
    <div className={`role-card ${danger ? 'danger' : ''} ${info ? 'info' : ''} ${heal ? 'heal' : ''}`}>
      <img src={img} alt={title} />
      <h3>{title}</h3>
      <ul>
        {desc.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
    </div>
  );
}
