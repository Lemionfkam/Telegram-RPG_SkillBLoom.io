const STORAGE_KEY = 'admin_users';
const ADMIN_ID = 1099017045;  // Ваш Telegram ID
let adminUsers = [];

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

function loadAdminUsers() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) adminUsers = JSON.parse(stored);
  renderUsersList();
}

function saveAdminUsers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(adminUsers));
}

function renderUsersList() {
  const list = document.getElementById('users-list');
  if (adminUsers.length === 0) {
    list.innerHTML = '<p class="muted">Нет загруженных пользователей</p>';
    return;
  }
  list.innerHTML = adminUsers.map((user, index) => {
    const name = user.profile?.name || 'Без имени';
    const level = user.profile?.level || 1;
    const totalXP = user.profile?.totalXP || 0;
    return `
      <div class="user-card" data-index="${index}">
        <div class="user-card-info">
          <strong>${name}</strong>
          <span>Ур. ${level} (${totalXP} XP)</span>
        </div>
        <button class="delete-user-btn btn btn-danger" data-index="${index}">×</button>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.user-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-user-btn')) return;
      const index = card.dataset.index;
      openUserDetail(index);
    });
  });

  document.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = btn.dataset.index;
      if (confirm('Удалить этого пользователя из админ-панели?')) {
        adminUsers.splice(index, 1);
        saveAdminUsers();
        renderUsersList();
      }
    });
  });
}

function openUserDetail(index) {
  const user = adminUsers[index];
  if (!user) return;
  const skills = user.skills || [];
  const mastered = skills.filter(s => s.mastered);
  const active = skills.filter(s => !s.mastered);
  const profile = user.profile || {};

  const detailHTML = `
    <h3>${profile.name || 'Имя не указано'}</h3>
    <p>Уровень ${profile.level} (${profile.totalXP} XP)</p>
    <p>Возраст: ${profile.age || '—'}</p>
    <hr style="border-color:rgba(255,255,255,0.1); margin:12px 0;">
    <h4>Активные навыки (${active.length})</h4>
    ${active.map(s => {
      const max = (s.masteryDays || 10) * 20;
      const pct = Math.min(100, (s.masteryPoints / max) * 100);
      return `<div class="skill-detail">
        <strong>${s.name}</strong> (${pct.toFixed(0)}%)
        <div class="progress-bar" style="margin:4px 0;"><div class="fill" style="width:${pct}%"></div></div>
        <ul class="task-list-detail">
          ${s.tasks.map(t => `<li class="${t.done?'done':''}">${t.text} (${t.xp} XP, ${t.type})</li>`).join('')}
        </ul>
      </div>`;
    }).join('')}
    <h4 style="margin-top:12px;">Освоенные навыки (${mastered.length})</h4>
    <div class="mastered-list">${mastered.map(s => `<span class="mastered-badge hard">${s.name}</span>`).join('')}</div>
  `;

  document.getElementById('user-detail-content').innerHTML = detailHTML;
  document.getElementById('modal-user-detail').classList.remove('hidden');
}

// Загрузка JSON-файлов
document.getElementById('btn-load-user').addEventListener('click', () => {
  document.getElementById('admin-import-file').click();
});

document.getElementById('admin-import-file').addEventListener('change', (e) => {
  const files = e.target.files;
  if (!files.length) return;
  for (let file of files) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        adminUsers.push(data);
        saveAdminUsers();
        renderUsersList();
      } catch (err) {
        alert('Неверный JSON-файл');
      }
    };
    reader.readAsText(file);
  }
  e.target.value = '';
});

// Новая кнопка: загрузить себя из localStorage
document.getElementById('btn-load-self').addEventListener('click', () => {
  const localData = localStorage.getItem('app_data');
  if (!localData) {
    alert('Нет данных в localStorage. Сначала откройте основное приложение.');
    return;
  }
  try {
    const data = JSON.parse(localData);
    // Проверяем, не добавлен ли уже этот пользователь (по имени, можно добавить более точную проверку)
    const exists = adminUsers.some(u => u.profile?.name === data.profile?.name && u.profile?.totalXP === data.profile?.totalXP);
    if (exists) {
      alert('Этот пользователь уже загружен.');
      return;
    }
    adminUsers.push(data);
    saveAdminUsers();
    renderUsersList();
    alert('Ваши данные загружены в админ-панель.');
  } catch (err) {
    alert('Ошибка чтения данных.');
  }
});

document.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => {
  b.closest('.modal').classList.add('hidden');
}));
document.querySelectorAll('.modal-backdrop').forEach(b => b.addEventListener('click', () => {
  b.parentElement.classList.add('hidden');
}));

if (checkAccess()) {
  loadAdminUsers();
}
