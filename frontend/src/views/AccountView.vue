<script setup>
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import { apiRequest } from '../utils/api';

const auth = useAuthStore();
const currentPassword = ref('');
const password = ref('');
const confirmation = ref('');
const busy = ref(false);
const error = ref('');
const success = ref('');

async function changePassword() {
  error.value = '';
  success.value = '';
  if (password.value !== confirmation.value) {
    error.value = 'Пароли не совпадают.';
    return;
  }
  busy.value = true;
  try {
    await apiRequest('/auth/password', { method: 'PATCH', body: { current_password: currentPassword.value, password: password.value } });
    currentPassword.value = password.value = confirmation.value = '';
    success.value = 'Пароль изменён. Остальные сеансы завершены.';
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="account-panel">
    <p class="account-eyebrow">{{ auth.isAdmin ? 'Администратор' : 'Личный аккаунт' }}</p>
    <h1>{{ auth.user.username }}</h1>
    <h2>Сменить пароль</h2>
    <form class="account-form" @submit.prevent="changePassword">
      <label>Текущий пароль<input v-model="currentPassword" type="password" autocomplete="current-password" required maxlength="128" /></label>
      <label>Новый пароль<input v-model="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128" /></label>
      <small>От 12 до 128 символов.</small>
      <label>Повторите новый пароль<input v-model="confirmation" type="password" autocomplete="new-password" required minlength="12" maxlength="128" /></label>
      <p v-if="error" class="account-error" role="alert">{{ error }}</p>
      <p v-if="success" class="account-success" role="status">{{ success }}</p>
      <button class="account-primary" :disabled="busy">{{ busy ? 'Сохраняем…' : 'Сохранить пароль' }}</button>
    </form>
  </section>
</template>
