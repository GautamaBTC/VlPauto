/*────────────────────────────────────────────
  js/modules/state.js
  Управление глобальным состоянием приложения.
─────────────────────────────────────────────*/

export const state = {
  token: null,
  socket: null,
  activeTab: 'home',
  user: {},
  masters: [],
  data: {
    weekOrders: [],
    todayOrders: [],
    leaderboard: [],
    weekStats: {},
    archive: [],
    history: []
  },
  selectedMaster: 'all',
};

export function isPrivileged() {
  return state.user.role === 'DIRECTOR' || state.user.role === 'SENIOR_MASTER';
}
