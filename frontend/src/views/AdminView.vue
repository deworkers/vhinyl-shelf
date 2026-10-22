<script setup>
import { nextTick, onMounted, ref } from 'vue';
import { apiRequest } from '../utils/api';

const users = ref([]);
const loading = ref(false);
const busyId = ref(null);
const error = ref('');
const success = ref('');
const confirmation = ref(null);
const typedName = ref('');
const confirmationInput = ref(null);

async function loadUsers() {
  loading.value = true;
  try {
    users.value = await apiRequest('/users');
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function confirmAction(user, action) {
  confirmation.value = { user, action };
  typedName.value = '';
  error.value = '';
  await nextTick();
  confirmationInput.value?.focus();
}

function trapFocus(event) {
  const controls = [...event.currentTarget.querySelectorAll('input:not([disabled]), button:not([disabled])')];
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

async function act(user, action) {
  busyId.value = user.id;
  error.value = '';
  success.value = '';
  try {
    if (action === 'block') {
      await apiRequest(`/users/${user.id}`, { method: 'PATCH', body: { blocked: !user.blocked } });
      success.value = user.blocked ? `Пользователь ${user.username} разблокирован.` : `Пользователь ${user.username} заблокирован. Все его сеансы завершены.`;
    } else {
      await apiRequest(`/users/${user.id}${action === 'clear' ? '/collection' : ''}`, { method: 'DELETE' });
      success.value = action === 'clear' ? `Коллекция ${user.username} очищена.` : `Пользователь ${user.username} удалён вместе с коллекцией.`;
    }
    confirmation.value = null;
    await loadUsers();
  } catch (err) {
    error.value = err.message;
  } finally {
    busyId.value = null;
  }
}

onMounted(loadUsers);
</script>

<template>
  <section class="admin-page">
    <header>
      <p class="account-eyebrow">Администрирование</p>
      <h1>Пользователи</h1>
      <p class="account-hint">Управление доступом и коллекциями.</p>
    </header>
    <p v-if="error" class="account-error" role="alert">{{ error }}</p>
    <p v-if="success" class="account-success" role="status">{{ success }}</p>
    <p v-if="loading" role="status">Загружаем пользователей…</p>
    <div v-else class="user-list">
      <article v-for="user in users" :key="user.id" class="user-card">
        <div>
          <h2>{{ user.username }}</h2>
          <p>{{ user.role === 'admin' ? 'Администратор' : user.blocked ? 'Заблокирован' : 'Активен' }} · Релизов: {{ user.record_count }}</p>
        </div>
        <div class="user-actions">
          <router-link class="account-secondary" :to="{ path: '/', query: { user_id: user.id, username: user.username } }">Коллекция</router-link>
          <button v-if="user.role !== 'admin'" class="account-secondary" :disabled="busyId !== null" @click="act(user, 'block')">{{ user.blocked ? 'Разблокировать' : 'Заблокировать' }}</button>
          <button class="account-secondary danger-action" :disabled="busyId !== null" @click="confirmAction(user, 'clear')">Очистить коллекцию</button>
          <button v-if="user.role !== 'admin'" class="account-secondary danger-action" :disabled="busyId !== null" @click="confirmAction(user, 'delete')">Удалить пользователя</button>
        </div>
      </article>
    </div>
    <div v-if="confirmation" class="confirm-overlay" @click.self="busyId === null && (confirmation = null)" @keydown.esc="busyId === null && (confirmation = null)">
      <section class="account-panel confirm-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-title" @keydown.tab="trapFocus">
        <h2 id="confirm-title">{{ confirmation.action === 'clear' ? 'Очистить коллекцию?' : 'Удалить пользователя?' }}</h2>
        <p>{{ confirmation.action === 'clear' ? 'Все пластинки, список желаний и загруженные обложки будут удалены.' : 'Аккаунт, его коллекция, список желаний и загруженные обложки будут удалены.' }} Это действие нельзя отменить.</p>
        <form class="account-form" @submit.prevent="typedName === confirmation.user.username && act(confirmation.user, confirmation.action)">
          <label>Введите логин «{{ confirmation.user.username }}» для подтверждения
            <input ref="confirmationInput" v-model="typedName" autocomplete="off" required :disabled="busyId !== null" />
          </label>
          <p v-if="error" class="account-error" role="alert">{{ error }}</p>
          <button class="account-primary danger-button" :disabled="busyId !== null || typedName !== confirmation.user.username">{{ busyId !== null ? 'Удаляем…' : 'Подтвердить удаление' }}</button>
          <button class="account-secondary" type="button" :disabled="busyId !== null" @click="confirmation = null">Отмена</button>
        </form>
      </section>
    </div>
  </section>
</template>
