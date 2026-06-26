const ADMIN_ID = 1099017045;
let allUsers = {}; // { userId: userData }

function checkAccess() {
  const isTelegramWebApp = typeof window.Telegram !== 'undefined' && window.Telegram.WebApp;
  if (isTelegramWebApp && window.Telegram.WebApp.initDataUnsafe?.user) {
    const userId = window.Telegram.WebApp.initDataUnsafe.user.id;
    if (userId !== ADMIN_ID) {
      document.body.innerHTML = `<div style="color:white;text-align:center;margin-top:50px;">Доступ запрещён. Ваш ID: ${userId}. Необходим ID: ${ADMIN_ID}</div>`;
      return false;
    }
  }
  return true;
}

// Загрузка всех пользователей из Firebase
async function loadUsersFromFirebase() {
  const list = document.getElementById('users-list');
  const countEl = document.getElementById('user-count');
  list.innerHTML = '<p class="muted">⏳ Загрузка...</p>';
  countEl.textContent = '';

  try {
    const snapshot = await database.ref('users').once('value');
    const data = snapshot.val();
    allUsers = data || {};
    renderUsersList();
    const count = Object.keys(allUsers).length;
    countEl.textContent = `Всего: ${count}`;
    if (count === 0) {
      list.innerHTML = '<p class="muted">Нет загруженных пользователей</p>';
    }
  } catch (e) {
    console.error('Ошибка загрузки из Firebase:', e);
    list.innerHTML = '<p class="muted">❌ Ошибка загрузки. См. консоль.</p>';
  }
}

function renderUsersList() {
  const list = document.getElementById('users-list');
  const userIds = Object.keys(allUsers);
  if (userIds.length === 0) {
    list.innerHTML = '<p class="muted">Нет пользователей</p>';
    return;
  }

  list.innerHTML = userIds.map(userId => {
    const user = allUsers[userId];
    const name = user?.name || 'Без имени';
    const level = user?.level || 1;
    const totalXP = user?.totalXP || 0;
    const avatar = user?.avatarUrl || null;
    const lastUpdated = user?.lastUpdated ? new Date(user.lastUpdated).toLocaleString() : '—';
    const skillsCount = user?.skills?.length || 0;
    const masteredCount = (user?.skills || []).filter(s => s.mastered).length;

    return `
      <div class="user-card" data-user-id="${userId}">
        <div class="user-card-info">
          <div style="display:flex; align-items:center; gap:12px;">
            ${avatar ? `<img src="${avatar}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:2px solid var(--accent);">` : `<div style="width:40px; height:40px; border-radius:50%; background:var(--bg-card); display:flex; align-items:center; justify-content:center; font-size:1.5rem; border:2px solid var(--border-light);">${name.charAt(0).toUpperCase()}</div>`}
            <div>
              <strong>${name}</strong>
              <span style="display:block; font-size:0.8rem; color:var(--text-secondary);">ID: ${userId}</span>
            </div>
          </div>
          <div style="margin-top:6px;">
            <span>Ур. ${level} (${totalXP} XP) · Навыков: ${skillsCount} (освоено: ${masteredCount})</span>
            <span style="display:block; font-size:0.7rem; color:var(--text-secondary);">Обновлён: ${lastUpdated}</span>
          </div>
        </div>
        <button class="delete-user-btn btn btn-danger" data-user-id="${userId}">×</button>
      </div>
    `;
  }).join('');

  // Обработчики кликов по карточке пользователя (открыть детали)
  document.querySelectorAll('.user-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-user-btn')) return;
      const userId = card.dataset.userId;
      openUserDetail(userId);
    });
  });

  // Обработчики удаления
  document.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const userId = btn.dataset.userId;
      if (confirm(`Удалить пользователя ${allUsers[userId]?.name || userId}?`)) {
        deleteUser(userId);
      }
    });
  });
}

// Открыть детали пользователя
function openUserDetail(userId) {
  const user = allUsers[userId];
  if (!user) return;

  const skills = user.skills || [];
  const mastered = skills.filter(s => s.mastered);
  const active = skills.filter(s => !s.mastered);

  const masteredBadges = mastered.map(s => `<span class="mastered-badge hard">${s.name}</span>`).join('');

  let activeHTML = '';
  if (active.length === 0) {
    activeHTML = '<p class="muted">Нет активных навыков</p>';
  } else {
    activeHTML = active.map(s => {
      const max = (s.masteryDays || 10) * 20;
      const pct = Math.min(100, (s.masteryPoints / max) * 100);
      return `
        <div class="skill-detail">
          <strong>${s.name}</strong> (${pct.toFixed(0)}%)
          <div class="progress-bar" style="margin:4px 0;"><div class="fill" style="width:${pct}%"></div></div>
          <ul class="task-list-detail">
            ${(s.tasks || []).map(t => `<li class="${t.done ? 'done' : ''}">${t.text} (${t.xp} XP, ${t.type})</li>`).join('')}
          </ul>
        </div>
      `;
    }).join('');
  }

  const detailHTML = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
      ${user.avatarUrl ? `<img src="${user.avatarUrl}" style="width:60px; height:60px; border-radius:50%; object-fit:cover; border:2px solid var(--accent);">` : `<div style="width:60px; height:60px; border-radius:50%; background:var(--bg-card); display:flex; align-items:center; justify-content:center; font-size:2rem; border:2px solid var(--border-light);">${(user.name || '?').charAt(0).toUpperCase()}</div>`}
      <div>
        <h3>${user.name || 'Имя не указано'}</h3>
        <p>Уровень ${user.level || 1} (${user.totalXP || 0} XP)</p>
        <span style="font-size:0.8rem; color:var(--text-secondary);">ID: ${userId}</span>
      </div>
    </div>
    <hr style="border-color:rgba(255,255,255,0.1); margin:12px 0;">
    <h4>Активные навыки (${active.length})</h4>
    ${activeHTML}
    <h4 style="margin-top:12px;">Освоенные навыки (${mastered.length})</h4>
    <div class="mastered-list">${masteredBadges || '<span class="muted">Нет освоенных</span>'}</div>
  `;

  document.getElementById('user-detail-content').innerHTML = detailHTML;
  document.getElementById('modal-user-detail').classList.remove('hidden');
}

// Удаление пользователя из Firebase
async function deleteUser(userId) {
  try {
    await database.ref('users/' + userId).remove();
    delete allUsers[userId];
    renderUsersList();
    const count = Object.keys(allUsers).length;
    document.getElementById('user-count').textContent = `Всего: ${count}`;
    alert('Пользователь удалён');
  } catch (e) {
    console.error('Ошибка удаления:', e);
    alert('Ошибка удаления');
  }
}

// Загрузить себя (текущего пользователя) из Firebase
async function loadSelf() {
  const userId = getTelegramUserId();
  if (!userId) {
    alert('Не удалось определить ваш Telegram ID. Откройте через бота.');
    return;
  }
  try {
    const snapshot = await database.ref('users/' + userId).once('value');
    const data = snapshot.val();
    if (data) {
      allUsers[userId] = data;
      renderUsersList();
      const count = Object.keys(allUsers).length;
      document.getElementById('user-count').textContent = `Всего: ${count}`;
      alert('Ваши данные загружены в список');
    } else {
      alert('В Firebase нет ваших данных. Сначала создайте профиль в приложении.');
    }
  } catch (e) {
    console.error(e);
    alert('Ошибка загрузки');
  }
}

// Получение Telegram ID (копия из script.js)
function getTelegramUserId() {
  try {
    if (typeof window.Telegram !== 'undefined' && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe) {
      const user = window.Telegram.WebApp.initDataUnsafe.user;
      if (user && user.id) {
        return String(user.id);
      }
    }
  } catch (e) {}
  return null;
}

// События
document.addEventListener('DOMContentLoaded', () => {
  if (!checkAccess()) return;

  document.getElementById('btn-refresh').addEventListener('click', loadUsersFromFirebase);
  document.getElementById('btn-load-self').addEventListener('click', loadSelf);

  // Закрытие модалки
  document.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => {
    b.closest('.modal').classList.add('hidden');
  }));
  document.querySelectorAll('.modal-backdrop').forEach(b => b.addEventListener('click', () => {
    b.parentElement.classList.add('hidden');
  }));

  // Загружаем список при старте
  loadUsersFromFirebase();
});
