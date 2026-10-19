#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

deploy_root=${1:?Deployment directory is required}
image_prefix=${2:?Image prefix is required}
image_tag=${3:?Image tag is required}
registry_user=${4:?Registry username is required}
release_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

[[ "$deploy_root" == /* && "$deploy_root" != / ]] || { echo 'Invalid deployment directory' >&2; exit 1; }
[[ "$image_prefix" =~ ^ghcr\.io/[a-z0-9][a-z0-9._/-]+$ ]] || { echo 'Invalid image prefix' >&2; exit 1; }
[[ "$image_tag" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$ ]] || { echo 'Invalid image tag' >&2; exit 1; }
[[ -f "$deploy_root/.env" ]] || { echo "Create $deploy_root/.env before deploying" >&2; exit 1; }
deploy_root=$(cd -- "$deploy_root" && pwd)
[[ "$deploy_root" != / && "$release_dir" == "$deploy_root/releases/$image_tag" ]] || { echo 'Release directory does not match image tag' >&2; exit 1; }

exec 9>"$deploy_root/.deploy.lock"
flock -w 300 9

export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
cleanup() {
    rm -f -- "$DOCKER_CONFIG/config.json"
    rmdir -- "$DOCKER_CONFIG"
}
trap cleanup EXIT

IFS= read -r registry_token
printf '%s' "$registry_token" | docker login ghcr.io --username "$registry_user" --password-stdin
unset registry_token
unset IMAGE_PREFIX IMAGE_TAG

printf 'IMAGE_PREFIX=%s\nIMAGE_TAG=%s\n' "$image_prefix" "$image_tag" > "$release_dir/.images.env"

compose_for() {
    local directory=$1
    shift
    docker compose --project-name vinyl-shelf \
        --env-file "$deploy_root/.env" \
        --env-file "$directory/.images.env" \
        --file "$directory/docker-compose.prod.yml" "$@"
}

compose_for "$release_dir" config --quiet
compose_for "$release_dir" pull

previous_release=''
if [[ -f "$deploy_root/.current-release" ]]; then
    previous_tag=$(cat -- "$deploy_root/.current-release")
    [[ "$previous_tag" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$ ]] || { echo 'Invalid previous release tag' >&2; exit 1; }
    previous_release="$deploy_root/releases/$previous_tag"
fi

if ! compose_for "$release_dir" up --detach --wait --wait-timeout 180; then
    echo 'Deployment failed health checks' >&2
    compose_for "$release_dir" logs --no-color --tail=100 >&2 || true
    if [[ -n "$previous_release" && "$previous_release" != "$release_dir" ]]; then
        echo 'Restoring previous containers' >&2
        compose_for "$previous_release" up --detach --wait --wait-timeout 180
    fi
    exit 1
fi

printf '%s\n' "$image_tag" > "$deploy_root/.current-release.tmp"
mv -f -- "$deploy_root/.current-release.tmp" "$deploy_root/.current-release"
echo "Deployed $image_tag"
