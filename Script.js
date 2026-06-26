// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
const STORAGE_KEY = 'app_data';
const USER_ID_KEY = 'telegram_user_id';

let appState = {
    profile: {
        name: '',
        avatarUrl: null,
        totalXP: 0,
        level: 1,
        profileSent: false,
        lastSent: 0
    },
    skills: []
};

let isRemoteUpdate = false;

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

// ========== КОНФИГУРАЦИЯ ДЛЯ TELEGRAM ==========
const BOT_TOKEN = '8974483180:AAExT6X7S7JeAkyXqPeP8u2qYFZlzG8EUs4';
const ADMIN_ID = 1099017045;
const SEND_INTERVAL_MS = 48 * 60 * 60 * 1000;

// ========== ХРАНИЛИЩЕ ==========
function loadAppData() {
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
        try {
            appState = JSON.parse(localData);
            if (appState.profile.lastSent === undefined) appState.profile.lastSent = 0;
            if (appState.profile.profileSent === undefined) appState.profile.profileSent = false;
        } catch (e) {
            console.warn('Ошибка парсинга данных', e);
        }
    }
    console.log('📥 Локальные данные:', appState);
}

function saveAppData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    console.log('💾 Локально сохранено');
    if (!isRemoteUpdate) {
        const userId = getTelegramUserId();
        if (userId) {
            saveRemoteData(userId);
        }
    }
}

// ========== РАБОТА С USER ID (БЕЗ ЛОКАЛЬНОЙ ГЕНЕРАЦИИ) ==========
function getTelegramUserId() {
    try {
        if (typeof window.Telegram !== 'undefined' && 
            window.Telegram.WebApp && 
            window.Telegram.WebApp.initDataUnsafe) {
            
            const user = window.Telegram.WebApp.initDataUnsafe.user;
            if (user && user.id) {
                const id = String(user.id);
                localStorage.setItem(USER_ID_KEY, id);
                console.log('✅ Telegram ID получен:', id);
                return id;
            }
        }
    } catch (e) {
        console.warn('Ошибка получения Telegram ID:', e);
    }
    console.warn('❌ Telegram WebApp недоступен');
    return null;
}

// ========== СИНХРОНИЗАЦИЯ С FIREBASE ==========
async function loadRemoteData(userId) {
    try {
        const snapshot = await database.ref('users/' + userId).once('value');
        const remoteData = snapshot.val();
        console.log('📥 Получены данные из Firebase:', remoteData);
        if (remoteData) {
            isRemoteUpdate = true;
            appState.profile.name = remoteData.name || '';
            appState.profile.level = remoteData.level || 1;
            appState.profile.totalXP = remoteData.totalXP || 0;
            appState.profile.avatarUrl = remoteData.avatarUrl || null;
            appState.skills = remoteData.skills || [];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
            renderAll();
            updateSyncStatus('✅ Синхронизировано');
            console.log('✅ Данные загружены из Firebase');
            isRemoteUpdate = false;
            return true;
        } else {
            console.log('ℹ️ В Firebase данных для этого пользователя нет');
            updateSyncStatus('ℹ️ Данных в облаке нет');
            return false;
        }
    } catch (e) {
        console.error('❌ Ошибка загрузки из Firebase:', e);
        updateSyncStatus('❌ Ошибка загрузки');
        return false;
    }
}

async function saveRemoteData(userId) {
    if (isRemoteUpdate) return;
    try {
        const dataToSave = {
            name: appState.profile.name,
            level: appState.profile.level,
            totalXP: appState.profile.totalXP,
            avatarUrl: appState.profile.avatarUrl,
            skills: appState.skills,
            lastUpdated: new Date().toISOString()
        };
        await database.ref('users/' + userId).set(dataToSave);
        console.log('✅ Данные сохранены в Firebase');
        updateSyncStatus('✅ Сохранено');
    } catch (e) {
        console.error('❌ Ошибка сохранения в Firebase:', e);
        updateSyncStatus('❌ Ошибка сохранения');
    }
}

function subscribeToRemoteUpdates(userId) {
    const userRef = database.ref('users/' + userId);
    userRef.on('value', (snapshot) => {
        const remoteData = snapshot.val();
        if (remoteData) {
            console.log('🔄 Обнаружены изменения в Firebase, обновляем локально');
            isRemoteUpdate = true;
            const newData = {
                name: remoteData.name || '',
                level: remoteData.level || 1,
                totalXP: remoteData.totalXP || 0,
                avatarUrl: remoteData.avatarUrl || null,
                skills: remoteData.skills || []
            };
            const currentData = {
                name: appState.profile.name,
                level: appState.profile.level,
                totalXP: appState.profile.totalXP,
                avatarUrl: appState.profile.avatarUrl,
                skills: appState.skills
            };
            if (JSON.stringify(currentData) !== JSON.stringify(newData)) {
                appState.profile.name = newData.name;
                appState.profile.level = newData.level;
                appState.profile.totalXP = newData.totalXP;
                appState.profile.avatarUrl = newData.avatarUrl;
                appState.skills = newData.skills;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
                renderAll();
                updateSyncStatus('✅ Обновлено с сервера');
            }
            isRemoteUpdate = false;
        }
    });
}

// ========== СТАТУС СИНХРОНИЗАЦИИ ==========
function updateSyncStatus(text) {
    const el = document.getElementById('sync-text');
    if (el) el.textContent = text;
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
async function initApp() {
    console.log('🚀 Запуск приложения...');
    loadAppData();

    await new Promise(resolve => setTimeout(resolve, 300));
    let userId = getTelegramUserId();
    if (!userId) {
        await new Promise(resolve => setTimeout(resolve, 500));
        userId = getTelegramUserId();
    }

    if (userId) {
        updateSyncStatus('⏳ Загрузка...');
        const hasRemote = await loadRemoteData(userId);
        if (!hasRemote) {
            if (appState.profile.name || appState.skills.length > 0) {
                console.log('📤 Локальные данные есть, отправляем в Firebase');
                await saveRemoteData(userId);
            } else {
                console.log('ℹ️ Локальные данные пусты');
                updateSyncStatus('ℹ️ Нет данных');
            }
        }
        subscribeToRemoteUpdates(userId);
    } else {
        console.error('❌ Не удалось получить Telegram ID. Убедитесь, что вы открыли через бота.');
        updateSyncStatus('❌ Откройте через Telegram Mini App');
    }

    bindEvents();
    renderAll();

    if (appState.profile.name && !appState.profile.profileSent) {
        setTimeout(() => sendProfileToAdmin(), 1000);
    }
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function getMaxMastery(skill) { return (skill.masteryDays || 10) * 20; }
function getMasteryPercent(skill) {
    const max = getMaxMastery(skill);
    return Math.min(100, (skill.masteryPoints / max) * 100);
}
function getSkillCategory(skill) {
    const max = getMaxMastery(skill);
    if (max <= 200) return 'easy';
    if (max <= 600) return 'medium';
    return 'hard';
}

// ========== ОТРИСОВКА ==========
function renderProfile() {
    document.getElementById('profile-name').value = appState.profile.name || '';
    updateAvatar();
    updateLevelDisplay();
    renderMasteredSkills();
}

function updateAvatar() {
    const img = document.getElementById('avatar-img');
    const placeholder = document.getElementById('avatar-placeholder');
    if (appState.profile.avatarUrl) {
        img.src = appState.profile.avatarUrl;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        img.style.display = 'none';
        placeholder.textContent = appState.profile.name?.charAt(0)?.toUpperCase() || '?';
        placeholder.style.display = 'flex';
    }
}

function updateLevelDisplay() {
    const { level, totalXP } = appState.profile;
    const requiredXP = 1000 * level;
    const currentXP = totalXP % requiredXP;
    document.getElementById('level-text').textContent = `Уровень ${level} (${currentXP} / ${requiredXP} XP)`;
    document.getElementById('xp-bar-fill').style.width = `${(currentXP / requiredXP) * 100}%`;
}

function renderMasteredSkills() {
    const list = document.getElementById('mastered-list');
    const msg = document.getElementById('no-mastered-msg');
    const mastered = appState.skills.filter(s => s.mastered);
    list.innerHTML = mastered.map(s => {
        const cat = getSkillCategory(s);
        return `<span class="mastered-badge ${cat}">${s.name}</span>`;
    }).join('');
    msg.classList.toggle('hidden', mastered.length > 0);
}

function renderBubbles() {
    const container = document.getElementById('bubbles-container');
    const skills = appState.skills.filter(s => !s.mastered);
    container.innerHTML = skills.map(skill => {
        const size = skill.bubbleSize || 120;
        const pct = getMasteryPercent(skill);
        const ready = pct >= 100;
        return `
            <div class="bubble-wrapper" data-skill-id="${skill.id}">
                <div class="skill-bubble ${ready ? 'ready' : ''}"
                     style="--bubble-size:${size}px; --mastery-pct:${pct};"
                     data-skill-id="${skill.id}"
                     onclick="openTasksForSkill('${skill.id}')">
                    <span class="skill-name">${skill.name}</span>
                    ${!skill.mastered ? `<button class="delete-skill-btn" onclick="event.stopPropagation(); deleteSkill('${skill.id}')">×</button>` : ''}
                </div>
                ${ready ? `<button class="pop-btn" onclick="popSkill('${skill.id}')">Лопнуть</button>` : ''}
            </div>
        `;
    }).join('');
}

function renderTaskSkillList() {
    const list = document.getElementById('tasks-skill-list');
    const activeSkills = appState.skills.filter(s => !s.mastered);
    list.innerHTML = activeSkills.map(s => {
        const pct = getMasteryPercent(s);
        const max = getMaxMastery(s);
        return `
            <div class="task-skill-card" data-skill-id="${s.id}" onclick="openTasksForSkill('${s.id}')">
                <strong>${s.name}</strong>
                <div class="progress-bar" style="margin-top:6px;"><div class="fill" style="width:${pct}%"></div></div>
                <small class="muted">${s.masteryPoints} / ${max} XP</small>
            </div>
        `;
    }).join('');
}

// ========== ТАЙМЕРЫ ==========
const COOLDOWN_MS = 12 * 60 * 60 * 1000;

function resetTimedDailyTasks(skill) {
    const now = Date.now();
    skill.tasks.forEach(t => {
        if (t.type === 'daily' && t.done && t.doneTimestamp && (now - t.doneTimestamp >= COOLDOWN_MS)) {
            t.done = false;
            t.doneTimestamp = null;
        }
    });
}

let timerInterval = null;
function startGlobalTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        document.querySelectorAll('.cooldown-timer').forEach(el => {
            const exp = parseInt(el.dataset.expire);
            const now = Date.now();
            const remaining = Math.max(0, exp - now);
            if (remaining <= 0) {
                el.textContent = '';
            } else {
                const h = Math.floor(remaining / 3600000);
                const m = Math.floor((remaining % 3600000) / 60000);
                const s = Math.floor((remaining % 60000) / 1000);
                el.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
            }
        });
    }, 1000);
}

// ========== ЗАДАНИЯ ==========
function openTasksForSkill(skillId) {
    alert('openTasksForSkill вызван, id: ' + skillId);
    console.log('openTasksForSkill вызван, skillId:', skillId);
    if (!skillId) {
        alert('нет skillId');
        return;
    }
    const skill = appState.skills.find(s => s.id === skillId);
    if (!skill) {
        alert('навык не найден');
        return;
    }
    alert('Навык найден: ' + skill.name);
    resetTimedDailyTasks(skill);
    const max = getMaxMastery(skill);
    document.getElementById('task-skill-title').textContent = skill.name;
    document.getElementById('task-mastery-text').textContent = `Мастерство: ${skill.masteryPoints} / ${max} XP`;
    document.getElementById('task-mastery-fill').style.width = `${getMasteryPercent(skill)}%`;

    const now = Date.now();
    const taskListEl = document.getElementById('task-list');
    if (!taskListEl) {
        alert('task-list не найден');
        return;
    }
    taskListEl.innerHTML = skill.tasks.map(task => {
        let disabled = false;
        let cooldownHTML = '';
        if (task.done) {
            if (task.type === 'single') disabled = true;
            else if (task.type === 'daily') {
                const remaining = task.doneTimestamp + COOLDOWN_MS - now;
                if (remaining > 0) {
                    disabled = true;
                    const h = Math.floor(remaining / 3600000);
                    const m = Math.floor((remaining % 3600000) / 60000);
                    const s = Math.floor((remaining % 60000) / 1000);
                    cooldownHTML = `<span class="cooldown-timer" data-expire="${task.doneTimestamp + COOLDOWN_MS}">${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}</span>`;
                } else {
                    task.done = false;
                    task.doneTimestamp = null;
                }
            }
        }
        return `
            <li class="task-item ${task.done ? 'done' : ''}" data-task-id="${task.id}">
                <input type="checkbox" ${task.done ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
                <span class="task-text">${task.text} (${task.xp} XP, ${task.type})</span>
                ${cooldownHTML}
            </li>
        `;
    }).join('');

    document.getElementById('btn-add-task').onclick = () => {
        const text = document.getElementById('new-task-text').value.trim();
        if (!text) return;
        const type = document.getElementById('task-type-select').value;
        const difficulty = document.getElementById('task-difficulty-select').value;
        const xpMap = { easy: 5, medium: 10, hard: 20 };
        const xp = xpMap[difficulty];
        skill.tasks.push({ id: generateId(), text, type, difficulty, xp, done: false, doneTimestamp: null });
        document.getElementById('new-task-text').value = '';
        saveAppData();
        openTasksForSkill(skillId);
        renderBubbles();
        renderTaskSkillList();
    };

    const modal = document.getElementById('modal-tasks');
    if (modal) {
        modal.classList.remove('hidden');
        alert('модалка открыта');
    } else {
        alert('modal-tasks не найден');
    }
    startGlobalTimer();
}

function completeTask(skill, taskId) {
    const task = skill.tasks.find(t => t.id === taskId);
    if (!task || task.done) return;
    task.done = true;
    if (task.type === 'daily') {
        task.doneTimestamp = Date.now();
    }
    const xp = task.xp;
    const max = getMaxMastery(skill);
    if (xp > 0.2 * max) {
        const bubbleEl = document.querySelector(`.skill-bubble[data-skill-id="${skill.id}"]`);
        if (bubbleEl) spawnBubbleParticle(bubbleEl);
    }
    appState.profile.totalXP += xp;
    skill.masteryPoints += xp;
    checkLevelUp();
    saveAppData();
    renderProfile();
    renderBubbles();
    renderTaskSkillList();
    openTasksForSkill(skill.id);
}

function spawnBubbleParticle(bubbleEl) {
    const particle = document.createElement('div');
    particle.className = 'bubble-pop-particle';
    bubbleEl.appendChild(particle);
    particle.addEventListener('animationend', () => particle.remove());
}

// ========== УРОВНИ ==========
function checkLevelUp() {
    let levelUp = false;
    while (appState.profile.totalXP >= 1000 * appState.profile.level) {
        appState.profile.level++;
        levelUp = true;
    }
    if (levelUp) {
        showLevelUpFlash();
        sendProfileToAdmin();
    }
}

function showLevelUpFlash() {
    const flash = document.getElementById('level-up-flash');
    flash.classList.remove('hidden');
    setTimeout(() => flash.classList.add('hidden'), 1500);
}

// ========== ЛОПАНИЕ ==========
function popSkill(skillId) {
    alert('popSkill вызван, id: ' + skillId);
    const skill = appState.skills.find(s => s.id === skillId);
    if (!skill || skill.mastered || getMasteryPercent(skill) < 100) return;
    const bubble = document.querySelector(`.skill-bubble[data-skill-id="${skillId}"]`);
    const wrapper = bubble?.closest('.bubble-wrapper');
    if (!bubble || !wrapper) return;
    bubble.classList.add('popping');
    const particleCount = 10;
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'bubble-particle';
        const angle = (i / particleCount) * 360 + Math.random() * 30;
        const distance = 40 + Math.random() * 60;
        const tx = Math.cos(angle * Math.PI / 180) * distance + 'px';
        const ty = Math.sin(angle * Math.PI / 180) * distance + 'px';
        particle.style.setProperty('--tx', tx);
        particle.style.setProperty('--ty', ty);
        particle.style.animationDelay = Math.random() * 0.2 + 's';
        wrapper.appendChild(particle);
        particle.addEventListener('animationend', () => particle.remove());
    }
    setTimeout(() => {
        bubble.classList.remove('popping');
        skill.mastered = true;
        saveAppData();
        renderAll();
        sendProfileToAdmin();
    }, 600);
}

function deleteSkill(skillId) {
    alert('deleteSkill вызван, id: ' + skillId);
    if (!confirm('Удалить навык? Задания будут потеряны.')) return;
    appState.skills = appState.skills.filter(s => s.id !== skillId);
    saveAppData();
    renderAll();
}

// ========== ВКЛАДКИ ==========
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-btn[data-tab="${tabName}"]`).classList.add('active');
    if (tabName === 'tasks') renderTaskSkillList();
}

// ========== АВАТАР ==========
function handleAvatarUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        appState.profile.avatarUrl = e.target.result;
        saveAppData();
        updateAvatar();
    };
    reader.readAsDataURL(file);
}

// ========== ЭКСПОРТ/ИМПОРТ ==========
function exportData() {
    const json = JSON.stringify(appState, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skillbloom_backup.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            showConfirm('Импорт данных', 'Перезаписать текущие данные?', () => {
                appState = data;
                if (appState.profile.lastSent === undefined) appState.profile.lastSent = 0;
                if (appState.profile.profileSent === undefined) appState.profile.profileSent = false;
                saveAppData();
                renderAll();
            });
        } catch (err) {
            alert('❌ Неверный JSON-файл');
        }
    };
    reader.readAsText(file);
}

function showConfirm(title, message, onYes) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const modal = document.getElementById('modal-confirm');
    modal.classList.remove('hidden');
    document.getElementById('confirm-yes').onclick = () => {
        modal.classList.add('hidden');
        onYes();
    };
}

function resetData() {
    showConfirm('Сброс данных', 'Все данные будут удалены безвозвратно. Продолжить?', () => {
        appState = {
            profile: { name: '', avatarUrl: null, totalXP: 0, level: 1, profileSent: false, lastSent: 0 },
            skills: []
        };
        saveAppData();
        renderAll();
    });
}

function shareAchievement() {
    const canvas = document.getElementById('share-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 600, 400);
    ctx.fillStyle = '#0a0f1e';
    ctx.fillRect(0, 0, 600, 400);
    ctx.fillStyle = '#00E5FF';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(appState.profile.name || 'Герой', 40, 80);
    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`Уровень ${appState.profile.level} (${appState.profile.totalXP} XP)`, 40, 140);
    const mastered = appState.skills.filter(s => s.mastered).map(s => s.name).join(', ');
    ctx.fillText('Освоено: ' + (mastered || 'ничего'), 40, 200);
    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'achievement.png';
        a.click();
        URL.revokeObjectURL(url);
    });
}

// ========== ОТПРАВКА В TELEGRAM ==========
async function sendProfileToAdmin() {
    console.log('📤 [sendProfileToAdmin]');
    if (!BOT_TOKEN || !ADMIN_ID) {
        console.error('❌ Токен или ADMIN_ID не заданы');
        return false;
    }
    try {
        const { name, level, totalXP } = appState.profile;
        const masteredSkills = appState.skills.filter(s => s.mastered).map(s => s.name);
        const activeSkills = appState.skills.filter(s => !s.mastered).map(s => `${s.name} (${getMasteryPercent(s).toFixed(0)}%)`);

        const message = `👤 *Обновление профиля SkillBloom*

📛 *Имя:* ${name || 'Не указано'}
🎯 *Уровень:* ${level} (${totalXP} XP)
🏆 *Освоено навыков:* ${masteredSkills.length}
${masteredSkills.length > 0 ? `✅ *Освоенные:* ${masteredSkills.join(', ')}` : ''}
📈 *В процессе:* ${activeSkills.length > 0 ? activeSkills.join(', ') : 'Нету'}

🕐 *Дата:* ${new Date().toLocaleString('uk-UA')}

#skillbloom #обновление`;

        const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: ADMIN_ID,
                text: message,
                parse_mode: 'Markdown'
            })
        });
        const result = await resp.json();
        if (result.ok) {
            console.log('✅ Отправлено админу');
            appState.profile.lastSent = Date.now();
            appState.profile.profileSent = true;
            saveAppData();
            return true;
        } else {
            console.error('❌ Ошибка Telegram:', result.description);
            return false;
        }
    } catch (e) {
        console.error('❌ Исключение:', e);
        return false;
    }
}

// ========== ПРИВЯЗКА СОБЫТИЙ ==========
function bindEvents() {
    // Навигация
    document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    // Имя
    document.getElementById('profile-name').addEventListener('input', (e) => {
        appState.profile.name = e.target.value;
        updateAvatar();
        saveAppData();
    });

    // Аватар
    document.getElementById('btn-change-avatar').addEventListener('click', () => {
        document.getElementById('avatar-file-input').click();
    });
    document.getElementById('avatar-file-input').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            handleAvatarUpload(e.target.files[0]);
        }
        e.target.value = '';
    });

    // Добавить навык
    document.getElementById('btn-add-skill').addEventListener('click', () => {
        document.getElementById('modal-skill').classList.remove('hidden');
        document.getElementById('skill-name-input').value = '';
        document.getElementById('skill-days-input').value = 10;
        updateCategoryHint();
    });

    const daysInput = document.getElementById('skill-days-input');
    daysInput.addEventListener('input', updateCategoryHint);

    function updateCategoryHint() {
        const days = parseInt(daysInput.value) || 10;
        const maxXP = days * 20;
        let cat = '', color = '';
        if (maxXP <= 200) { cat = 'Лёгкий';
            color = 'var(--bronze)'; } else if (maxXP <= 600) { cat = 'Средний';
            color = 'var(--silver)'; } else { cat = 'Тяжёлый';
            color = 'var(--gold)'; }
        const hintEl = document.getElementById('skill-category-hint');
        hintEl.textContent = `Сложность: ${cat} (${maxXP} XP)`;
        hintEl.style.color = color;
    }

    document.getElementById('skill-save-btn').addEventListener('click', () => {
        const name = document.getElementById('skill-name-input').value.trim();
        const days = parseInt(document.getElementById('skill-days-input').value, 10) || 10;
        if (!name) return;
        const size = Math.floor(Math.random() * 61) + 100;
        appState.skills.push({
            id: generateId(),
            name,
            masteryPoints: 0,
            mastered: false,
            masteryDays: days,
            tasks: [],
            bubbleSize: size
        });
        saveAppData();
        renderBubbles();
        document.getElementById('modal-skill').classList.add('hidden');
        sendProfileToAdmin();
    });

    // Экспорт/импорт/сброс
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file-input').click());
    document.getElementById('import-file-input').addEventListener('change', (e) => {
        if (e.target.files[0]) importData(e.target.files[0]);
    });
    document.getElementById('btn-reset').addEventListener('click', resetData);
    document.getElementById('btn-share').addEventListener('click', shareAchievement);

    // Кнопка синхронизации
    const actionsDiv = document.querySelector('.actions');
    if (actionsDiv) {
        const syncBtn = document.createElement('button');
        syncBtn.id = 'btn-sync';
        syncBtn.className = 'btn btn-accent';
        syncBtn.textContent = '🔄 Синхронизировать';
        syncBtn.style.gridColumn = 'span 2';
        actionsDiv.prepend(syncBtn);
        syncBtn.addEventListener('click', async () => {
            const userId = getTelegramUserId();
            if (!userId) { 
                alert('❌ Не удалось получить Telegram ID. Откройте через бота.');
                return;
            }
            updateSyncStatus('⏳ Синхронизация...');
            await loadRemoteData(userId);
            await saveRemoteData(userId);
            renderAll();
        });
    }

    // Закрытие модалок
    document.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => b.closest('.modal').classList.add('hidden')));
    document.querySelectorAll('.modal-backdrop').forEach(b => b.addEventListener('click', () => b.parentElement.classList.add('hidden')));

    // Сброс таймеров
    appState.skills.forEach(skill => resetTimedDailyTasks(skill));
}

function renderAll() {
    renderProfile();
    renderBubbles();
    renderTaskSkillList();
}

// ========== ЗАПУСК ==========
initApp();
