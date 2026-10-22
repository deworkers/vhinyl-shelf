<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useRecordsStore } from '../stores/records';

const auth = useAuthStore();
const records = useRecordsStore();
const route = useRoute();
const router = useRouter();
const registering = ref(false);
const username = ref('');
const password = ref('');
const confirmation = ref('');
const busy = ref(false);
const error = ref('');

async function submit() {
  error.value = '';
  if (registering.value && password.value !== confirmation.value) {
    error.value = 'Пароли не совпадают.';
    return;
  }
  busy.value = true;
  try {
    await auth.authenticate(registering.value ? 'register' : 'login', username.value, password.value);
    records.$reset();
    const target = route.query.redirect;
    await router.replace(typeof target === 'string' && /^\/(?![/\\])/.test(target) && !target.startsWith('/login') ? target : '/');
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}

function toggleMode() {
  registering.value = !registering.value;
  password.value = '';
  confirmation.value = '';
  error.value = '';
}
</script>

<template>
  <section class="account-panel">
    <p class="account-eyebrow">Ваша музыка, ваша коллекция</p>
    <h1>{{ registering ? 'Создать аккаунт' : 'Войти в Vinyl Shelf' }}</h1>
    <p class="account-hint">{{ registering ? 'Собирайте пластинки и сохраняйте список желаний в личном аккаунте.' : 'Войдите, чтобы открыть свою коллекцию пластинок.' }}</p>
    <form class="account-form" @submit.prevent="submit">
      <label>Логин
        <input v-model.trim="username" name="username" autocomplete="username" required minlength="3" maxlength="40" pattern="[a-zA-Z0-9_.\-]+" autocapitalize="none" spellcheck="false" />
      </label>
      <small v-if="registering">От 3 до 40 латинских букв, цифр или символов _ . -</small>
      <label>Пароль
        <input v-model="password" name="password" type="password" :autocomplete="registering ? 'new-password' : 'current-password'" required :minlength="registering ? 12 : 1" maxlength="128" />
      </label>
      <small v-if="registering">От 12 до 128 символов.</small>
      <label v-if="registering">Повторите пароль
        <input v-model="confirmation" name="confirmation" type="password" autocomplete="new-password" required minlength="12" maxlength="128" />
      </label>
      <p v-if="error" class="account-error" role="alert">{{ error }}</p>
      <button class="account-primary" :disabled="busy">{{ busy ? 'Подождите…' : registering ? 'Зарегистрироваться' : 'Войти' }}</button>
      <button class="account-secondary" type="button" :disabled="busy" @click="toggleMode">{{ registering ? 'Уже есть аккаунт? Войти' : 'Создать аккаунт' }}</button>
    </form>
  </section>
</template>
