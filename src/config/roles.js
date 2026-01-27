export const ROLES = {
  mafia: {
    key: 'mafia',
    name: 'Мафия',
    description: 'Каждую ночь выбирает жертву.',
    image: '/assets/roles/mafia.png',
    nightAction: 'kill',
    color: '#ff2a2a',
  },

  doctor: {
    key: 'doctor',
    name: 'Доктор',
    description: 'Каждую ночь может спасти одного игрока.',
    image: '/assets/roles/doctor.png',
    nightAction: 'save',
    color: '#22c55e',
  },

  sheriff: {
    key: 'sheriff',
    name: 'Шериф',
    description: 'Проверяет игроков ночью.',
    image: '/assets/roles/sheriff.png',
    nightAction: 'check',
    color: '#3b82f6',
  },

  villager: {
    key: 'villager',
    name: 'Мирный житель',
    description: 'Не имеет ночных действий.',
    image: '/assets/roles/villager.png',
    color: '#a1a1aa',
  },
};
