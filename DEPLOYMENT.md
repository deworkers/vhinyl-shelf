# Публикация и автодеплой Vinyl Shelf

Проект публикуется в `deworkers/vhinyl-shelf`. Workflow
`.github/workflows/ci-cd.yml` проверяет pull request в `main`, а после push
в `main` автоматически обновляет приложение на VPS через SSH.

## Как работает pipeline

1. Backend и frontend устанавливаются через `npm ci`, запускаются `npm test`.
   Frontend дополнительно собирается через `npm run build`.
2. Docker Compose собирает оба образа, запускает контейнеры и ждёт health checks.
   Проверяются главная страница, маршрут SPA, API health и чтение коллекции из SQLite.
3. Только для `main` проверенные образы публикуются в GitHub Container Registry:
   `ghcr.io/deworkers/vhinyl-shelf-backend` и
   `ghcr.io/deworkers/vhinyl-shelf-frontend`.
4. На VPS передаются production Compose и скрипт деплоя. Сервер скачивает образы
   с уникальным тегом коммита/запуска, затем обновляет контейнеры.
5. При ошибке запуска скрипт пытается вернуть предыдущую успешную версию
   контейнеров. Workflow при этом остаётся красным.

На pull request образы не публикуются, SSH-ключи не используются, деплоя нет.
Токен Discogs не нужен для CI: проверки не обращаются к внешнему API.

## Подготовить VPS один раз

Нужен Linux-сервер **amd64/x86_64**, Docker Engine, Docker Compose **2.20+**,
Bash, `tar` и `flock`. Установка Docker описана в
[официальной инструкции](https://docs.docker.com/engine/install/ubuntu/).
SSH-пользователь должен иметь доступ к Docker без интерактивного `sudo`.

Подготовь каталог, заменив `deploy` своим SSH-пользователем:

```bash
sudo install -d -m 750 -o deploy -g deploy /opt/vinyl-shelf
```

Создай на сервере `/opt/vinyl-shelf/.env` по образцу
[`deploy/.env.example`](deploy/.env.example), затем установи права:

```bash
chmod 600 /opt/vinyl-shelf/.env
```

В этот файл добавляется настоящий `DISCOGS_TOKEN`. Он хранится только на VPS,
в GitHub Secrets его добавлять не требуется. Содержимое `.env` не копируется
с каждого push и не меняется скриптом деплоя.

Для GitHub Actions создай отдельный SSH-ключ и добавь его публичную часть в
`~/.ssh/authorized_keys` SSH-пользователя на VPS. Приватная часть хранится
в GitHub Secrets. Парольный запрос при подключении недопустим для автодеплоя.

## Настроить GitHub

В репозитории создай **Settings → Environments → production**.
Чтобы деплой был автоматическим, не включай обязательное ручное подтверждение.
Разреши deployment из ветки `main`.
[Документация environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

Добавь в environment `production` следующие **Secrets**:

| Имя | Значение |
| --- | --- |
| `DEPLOY_HOST` | IP-адрес или имя VPS, без `https://` |
| `DEPLOY_USER` | SSH-пользователь, например `deploy` |
| `DEPLOY_PORT` | Порт SSH; можно не задавать, по умолчанию `22` |
| `DEPLOY_SSH_KEY` | Полный приватный SSH-ключ |
| `DEPLOY_KNOWN_HOSTS` | Проверенная запись ключа SSH-сервера в формате `known_hosts` |

Ключ сервера можно получить через `ssh-keyscan -p 22 example.com`, но перед
добавлением сверь его отпечаток с ключом в консоли VPS:
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`.
Workflow проверяет ключ сервера через `StrictHostKeyChecking=yes`.

Добавь **Variables** в том же environment:

| Имя | Значение |
| --- | --- |
| `DEPLOY_PATH` | Необязательно; по умолчанию `/opt/vinyl-shelf`. Абсолютный путь без пробелов |
| `SITE_URL` | Необязательно; адрес сайта, например `https://vinyl.example.com` |

`GITHUB_TOKEN` выдаётся автоматически: он публикует образы и позволяет серверу
скачать их, даже если packages приватные. Отдельный постоянный PAT не нужен.
Авторизация registry на VPS временная и удаляется после завершения скрипта.
[Документация GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

Если организация запрещает публикацию packages, разреши её для этого репозитория.
Для ранее существовавших packages проверь доступ репозитория к ним.

## HTTPS и доступ к приложению

Production Compose публикует frontend только на `127.0.0.1:8080` сервера.
Backend напрямую наружу не публикуется. На VPS настрой существующий reverse proxy
на этот адрес и HTTPS для домена: это также необходимо для сканирования камерой.
`SITE_URL` — ссылка в GitHub Actions; сама по себе эта переменная не настраивает DNS или TLS.

В приложении пока нет авторизации. Для личной коллекции закрой сайт паролем
на reverse proxy, включая `/api` и `/uploads`: API позволяет менять коллекцию.
Например, конфигурация **Caddy, установленного на самом VPS**:

```caddyfile
vinyl.example.com {
    basic_auth {
        collector REPLACE_WITH_PASSWORD_HASH
    }
    reverse_proxy 127.0.0.1:8080
}
```

Хеш пароля создаётся командой `caddy hash-password`. Укажи настоящий домен,
направь его DNS на VPS и открой для reverse proxy порты 80/443.
[Документация Caddy basic_auth](https://caddyserver.com/docs/caddyfile/directives/basic_auth).
Если reverse proxy работает в другом контейнере, `127.0.0.1` указывает на его
собственный контейнер: подключи его к сети приложения и проксируй в `frontend:80`.

## Первый и последующие деплои

После настройки сервера и Secrets добавь подготовленные файлы в коммит и отправь
его в `main`. Коммиты и push эта подготовка автоматически не выполняет.

Следить за запуском можно в **Actions → CI and deploy**. Без настроенных SSH Secrets
deploy job завершится понятной ошибкой; CI и сборка образов отработают отдельно.
После исправления настроек запусти **Run workflow** для ветки `main`.
Ручной запуск из других веток выполняет только проверки.

Структура каталога на сервере:

```text
/opt/vinyl-shelf/
  .env                         # серверные настройки и токен Discogs
  .deploy.lock                 # блокировка параллельного деплоя
  .current-release             # тег последнего успешного релиза
  releases/<tag>/
    .images.env                # ссылки на образы, без секретов
    docker-compose.prod.yml
    deploy/deploy.sh
```

Остановка старой версии через `docker compose down` перед обновлением не нужна.
Тома не удаляются; старые образы и каталоги релизов сохраняются для возврата.
Перезапуск контейнеров может кратковременно прервать запросы.

## Данные и резервные копии

Production использует постоянное имя проекта `vinyl-shelf` и тома:

- `vinyl-shelf_backend-data` — SQLite;
- `vinyl-shelf_backend-uploads` — загруженные обложки.

Данные с локального компьютера автоматически не переносятся. Если приложение
уже запускалось на сервере под другим именем Compose-проекта, его тома нужно
перенести до первого production-деплоя.

Перед переносом можно остановить запись, штатно остановить backend, затем
сохранить тома SQLite и обложек. Для копирования работающей SQLite используй
SQLite Backup API; простая копия только `vinyl.sqlite` при активном WAL
может не содержать последние изменения.

Автоматический возврат контейнеров не откатывает содержимое SQLite.
Перед несовместимыми изменениями схемы БД нужна отдельная резервная копия
и план миграции. Не используй `docker compose down --volumes` на production.

## Локальные проверки

```bash
cd backend && npm ci && npm test
cd ../frontend && npm ci && npm test && npm run build
cd ..
bash deploy/test-deploy.sh
docker compose up --build --detach --wait --wait-timeout 180
```

`deploy/test-deploy.sh` проверяет сценарии скрипта с подменой Docker-команд.
Настоящую сборку и запуск контейнеров проверяет отдельный job в GitHub Actions.
