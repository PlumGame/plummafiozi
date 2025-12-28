import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import MainScreen from './pages/MainScreen';
import CreateRoom from './pages/CreateRoom';
import JoinRoom from './pages/JoinRoom';
import Lobby from './pages/Lobby';

const NotFound = () => (
  <div style={{ padding: 20 }}>
    <h2>Страница не найдена</h2>
    <p>Вернуться на <Link to="/">главную</Link>.</p>
  </div>
);

export default function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
    

      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<MainScreen />} />
          <Route path="/create" element={<CreateRoom />} />
          <Route path="/join" element={<JoinRoom />} />
          <Route path="/lobby/:code" element={<Lobby />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
