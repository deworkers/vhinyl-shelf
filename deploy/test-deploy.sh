#!/usr/bin/env bash
set -Eeuo pipefail

source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
test_parent=$(cd -- "${TMPDIR:-/tmp}" && pwd -P)
test_root=$(mktemp -d "$test_parent/vinyl-deploy-tests.XXXXXX")
cleanup() {
    local resolved
    resolved=$(cd -- "$test_root" && pwd -P)
    [[ "$resolved" == "$test_parent"/vinyl-deploy-tests.* ]] || return 1
    rm -rf -- "$resolved"
}
trap cleanup EXIT
mkdir -p "$test_root/bin"

cat > "$test_root/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == login ]]; then
    cat > /dev/null
    printf '{}' > "$DOCKER_CONFIG/config.json"
    printf '%s\n' "$DOCKER_CONFIG" > "$TEST_AUTH_DIR_FILE"
    echo login >> "$TEST_LOG"
    exit 0
fi
release=''
operation=''
while (( $# )); do
    case "$1" in
        --file) release=$2; shift 2 ;;
        config|pull|up) operation=$1; shift ;;
        *) shift ;;
    esac
done
echo "$operation $release" >> "$TEST_LOG"
if [[ "${TEST_FAILURE:-}" == pull && "$operation" == pull ]]; then exit 1; fi
if [[ "${TEST_FAILURE:-}" == new-up && "$operation" == up && "$release" == */releases/new/* ]]; then exit 1; fi
MOCK
chmod +x "$test_root/bin/docker"

if ! command -v flock > /dev/null; then
    printf '#!/usr/bin/env bash\nexit 0\n' > "$test_root/bin/flock"
    chmod +x "$test_root/bin/flock"
fi
export PATH="$test_root/bin:$PATH"
export TEST_LOG="$test_root/docker.log"

prepare() {
    case_dir="$test_root/$1"
    mkdir -p "$case_dir/releases/new/deploy" "$case_dir/releases/old"
    cp "$source_dir/deploy/deploy.sh" "$case_dir/releases/new/deploy/deploy.sh"
    cp "$source_dir/docker-compose.prod.yml" "$case_dir/releases/new/docker-compose.prod.yml"
    cp "$source_dir/docker-compose.prod.yml" "$case_dir/releases/old/docker-compose.prod.yml"
    printf 'DISCOGS_TOKEN=test\n' > "$case_dir/.env"
    printf 'IMAGE_PREFIX=ghcr.io/test/app\nIMAGE_TAG=old\n' > "$case_dir/releases/old/.images.env"
    printf 'old\n' > "$case_dir/.current-release"
    : > "$TEST_LOG"
    export TEST_AUTH_DIR_FILE="$case_dir/auth-directory"
    export TEST_FAILURE=''
}

run_deploy() {
    printf 'test-registry-token\n' | bash "$case_dir/releases/new/deploy/deploy.sh" \
        "$case_dir" ghcr.io/test/app new test-user > "$case_dir/output.log" 2>&1
}

prepare success
run_deploy
[[ $(cat "$case_dir/.current-release") == new ]]
grep -q '^IMAGE_TAG=new$' "$case_dir/releases/new/.images.env"
[[ $(grep -c '^up ' "$TEST_LOG") == 1 ]]
[[ ! -d $(cat "$TEST_AUTH_DIR_FILE") ]]
echo 'PASS: successful deployment activates the new release'

prepare pull-failure
export TEST_FAILURE=pull
if run_deploy; then echo 'FAIL: failed pull succeeded' >&2; exit 1; fi
[[ $(cat "$case_dir/.current-release") == old ]]
! grep -q '^up ' "$TEST_LOG"
echo 'PASS: failed pull leaves running containers untouched'

prepare rollback
export TEST_FAILURE=new-up
if run_deploy; then echo 'FAIL: unhealthy deployment succeeded' >&2; exit 1; fi
[[ $(cat "$case_dir/.current-release") == old ]]
[[ $(grep -c '^up ' "$TEST_LOG") == 2 ]]
grep -q '/releases/old/docker-compose.prod.yml' "$TEST_LOG"
[[ ! -d $(cat "$TEST_AUTH_DIR_FILE") ]]
echo 'PASS: failed health check restores the previous containers and fails the job'

prepare first-deploy-failure
rm -- "$case_dir/.current-release"
export TEST_FAILURE=new-up
if run_deploy; then echo 'FAIL: unhealthy first deployment succeeded' >&2; exit 1; fi
[[ ! -e "$case_dir/.current-release" ]]
[[ $(grep -c '^up ' "$TEST_LOG") == 1 ]]
echo 'PASS: failed first deployment does not record a successful release'

prepare missing-environment
rm -- "$case_dir/.env"
if run_deploy; then echo 'FAIL: missing environment accepted' >&2; exit 1; fi
[[ ! -s "$TEST_LOG" ]]
echo 'PASS: missing server configuration fails before Docker is touched'

prepare mismatched-release
if printf 'test-registry-token\n' | bash "$case_dir/releases/new/deploy/deploy.sh" \
    "$case_dir" ghcr.io/test/app other test-user > "$case_dir/output.log" 2>&1; then
    echo 'FAIL: mismatched release accepted' >&2
    exit 1
fi
[[ ! -s "$TEST_LOG" ]]
echo 'PASS: mismatched release is rejected before Docker is touched'
