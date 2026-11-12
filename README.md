# agentready

[![CI](https://github.com/jungsunbeen/agentready/actions/workflows/ci.yml/badge.svg)](https://github.com/jungsunbeen/agentready/actions/workflows/ci.yml)

리포지토리가 **AI 코딩 에이전트가 일하기 좋은 상태인지 검사하고, 고칠 방법을 알려주는 CLI 도구**입니다.
Claude Code, Codex, GitHub Copilot CLI에 검사 결과를 보고 직접 고치는 스킬을 설치할 수 있습니다.

```console
$ agentready
✖ agent-instructions  No agent instructions file found.
                      → Run `agentready init` to generate AGENTS.md from your package.json scripts.
- agent-commands      No agent instructions file to check.
✔ readme              README.md has a usage section.
✖ package-scripts     package.json scripts: missing lint; "test" is the npm placeholder.
                      → Add working "lint" and "test" scripts.
✔ typescript-strict   "strict" is enabled.
! ci-workflow         No CI configuration found.
                      → Add a workflow that runs lint and test on every pull request.
✔ single-lockfile     Uses pnpm (pnpm-lock.yaml).
✔ node-version        engines.node is ">=22".

Score 46/100 · 4 passed, 3 failed, 1 skipped
```

## 동작 방식

### 해결하려는 문제

에이전트는 매 세션을 프로젝트에 대한 기억 없이 시작합니다. 사람에게는 사소한 빈틈이 에이전트에게는 그대로 실패로 이어집니다.

- 지침 파일(`AGENTS.md`)이 없으면 빌드·테스트 명령을 추측합니다.
- 지침에 적힌 `npm run check`가 이미 이름이 바뀐 스크립트라면, 실패하는 명령을 실행한 뒤 즉흥적으로 우회합니다.
- `test` 스크립트가 `npm init` 기본값이면 자기 변경을 검증할 수단이 없습니다.
- 락파일이 둘이면 어떤 패키지 매니저를 쓸지 골라야 합니다.

이런 빈틈은 대부분 파일 몇 개만 보면 기계적으로 찾을 수 있습니다. agentready는 이를 규칙으로 만들어 리뷰에서 매번 지적하지 않아도 CI가 잡게 하고, 고치는 일은 AI에게 맡깁니다.

특히 [`agent-commands`](docs/rules.md#agent-commands) 규칙은 지침 파일이 **있는지**가 아니라 **사실인지**를 검사합니다. 지침에 적힌 명령이 `package.json`에 실제로 있는지 대조합니다.

### 역할 분담

| 주체 | 역할 |
|---|---|
| 프로그램 | 파일을 읽어 규칙 검사, 점수 계산, 실패마다 고칠 방법(`fix`) 제시, `AGENTS.md` 초안 생성 |
| AI | 검사 결과의 `fix`를 따라 수정, 다시 검사해 통과할 때까지 반복 |
| 개발자 | 어떤 락파일을 남길지처럼 판단이 필요한 항목 결정, AI가 만든 변경 검토 |

프로그램은 판단하지 않고 사실만 확인합니다. 예를 들어 `pnpm build`는 스크립트일 수도 pnpm 내장 명령일 수도 있어서 검사하지 않습니다. 틀린 경고보다 놓친 경고가 낫다고 봤습니다.

## 설치와 AI 도구 연결

### 공통 설치

Node.js 22 이상이 필요합니다. 런타임 의존성은 없습니다.
아직 npm에 배포하지 않았으므로 저장소에서 빌드해 설치합니다. npm의 `agentready`는 이 프로젝트와 관계없는 다른 패키지이니 `npx agentready`로 실행하지 마세요.

```bash
git clone https://github.com/jungsunbeen/agentready.git
cd agentready
npm ci
npm run build
npm link
```

`npm link`가 `agentready` 명령을 전역에 연결합니다. 지우려면 `npm uninstall -g agentready`를 실행합니다.

### AI 도구 연결

**agentready 저장소가 아니라 검사할 프로젝트 폴더**에서 쓰는 도구를 연결합니다. `--agent`를 반복하면 여러 도구를 함께 연결할 수 있습니다.

| 도구 | 연결 | 스킬 호출 | 설치되는 파일 |
|---|---|---|---|
| Claude Code | `agentready init --agent claude` | `/agentready-fix` | `.claude/skills/agentready-fix/SKILL.md`, `CLAUDE.md` |
| Codex | `agentready init --agent codex` | `$agentready-fix` | `.agents/skills/agentready-fix/SKILL.md` |
| Copilot CLI | `agentready init --agent copilot` | `/agentready-fix` | `.agents/skills/agentready-fix/SKILL.md` |

- Claude Code용 스킬은 `agentready check --json --exit-zero`를 실행한 결과를 미리 담아 시작하므로, AI가 명령을 한 번 덜 실행합니다.
- Codex와 Copilot CLI는 같은 `.agents/skills` 위치를 읽으므로 스킬 파일 하나를 공유합니다.
- Claude Code는 `AGENTS.md` 대신 `CLAUDE.md`를 읽기 때문에, `CLAUDE.md`가 없으면 `@AGENTS.md` 한 줄로 만들어 같은 지침을 보게 합니다.

`AGENTS.md`가 없으면 함께 만듭니다. 이미 있는 파일은 건드리지 않으므로 여러 번 연결해도 결과가 같습니다.

## 기본 작업 흐름

### 1. 검사하기

프로젝트 폴더에서 `agentready`를 실행합니다. 실패한 규칙마다 `→` 뒤에 할 일이 나옵니다.

### 2. 지침 파일 만들기

`agentready init`이 `package.json`의 스크립트와 락파일을 읽어 `AGENTS.md` 초안을 만듭니다.
pnpm 락파일이 있으면 `pnpm run test`처럼 그 패키지 매니저로 명령을 적으므로, 만들어진 파일은 `agent-commands` 규칙을 항상 통과합니다.
`<!-- TODO -->` 주석으로 남은 프로젝트 설명과 규칙은 직접 채웁니다.

### 3. AI에게 고치게 하기

연결한 도구에서 `/agentready-fix`(Codex는 `$agentready-fix`)를 호출합니다.
AI는 `error` 규칙부터 `fix`를 따라 고치고, 다시 검사해 통과할 때까지 반복한 뒤 점수 변화를 보고합니다.
어떤 Node.js 버전을 요구할지처럼 판단이 필요한 항목은 추측하지 않고 개발자에게 묻습니다.

### 4. CI로 유지하기

지침 파일은 시간이 지나면 코드와 어긋납니다. CI에서 `agentready --fail-under 90`처럼 실행하면 스크립트 이름을 바꾸고 지침을 고치지 않은 PR이 바로 실패합니다.
이 저장소도 CI에서 자기 자신을 100점 기준으로 검사합니다.

## 명령어

| 명령어 | 하는 일 |
|---|---|
| `agentready [dir]` | `agentready check`와 같습니다 |
| `agentready check [dir]` | 저장소를 검사하고 결과와 점수를 출력합니다 |
| `agentready check --json` | 결과를 JSON으로 출력합니다. 스킬과 스크립트가 사용합니다 |
| `agentready check --fail-under <n>` | 점수가 `n` 미만이면 종료 코드 `1`로 끝납니다 |
| `agentready check --exit-zero` | 결과와 관계없이 `0`으로 끝납니다. 결과만 읽는 스킬이 사용합니다 |
| `agentready rules` | 규칙 목록을 출력합니다. `--json`, `--markdown`도 지원합니다 |
| `agentready init [dir]` | `AGENTS.md` 초안을 만듭니다. 이미 있으면 실패하며 `--force`로 덮어씁니다 |
| `agentready init --dry-run` | 파일을 쓰지 않고 `AGENTS.md` 내용만 출력합니다 |
| `agentready init --agent <이름>` | AI 도구 연결 파일을 설치합니다. 기존 `AGENTS.md`는 그대로 둡니다 |
| `agentready --help` | 사용법을 출력합니다 |
| `agentready --version` | 현재 버전을 출력합니다 |

종료 코드는 `0` 성공, `1` `error` 규칙 실패 또는 `--fail-under` 미달, `2` 잘못된 사용법입니다.

## 규칙

| 규칙 | 심각도 | 검사 내용 |
|---|---|---|
| `agent-instructions` | error | `AGENTS.md`, `CLAUDE.md` 등 에이전트 지침 파일이 있는가 |
| `agent-commands` | error | 지침에 적힌 `npm run x`, `npm test`가 실제 `package.json`에 있는가 |
| `readme` | error | README에 사용법·설치 섹션이 있는가 |
| `package-scripts` | error | `lint`, `test` 스크립트가 있고 placeholder가 아닌가 |
| `typescript-strict` | warning | `extends` 체인을 따라가서 `strict`가 켜져 있는가 |
| `ci-workflow` | warning | CI 설정이 있는가 |
| `single-lockfile` | warning | 락파일이 정확히 하나인가 |
| `node-version` | warning | Node.js 버전이 선언되어 있는가 |

`error` 규칙은 종료 코드를 정하고, `warning` 규칙은 점수만 낮춥니다.
점수는 적용되는 규칙 중 통과한 비율이며 `error`가 `warning`의 3배 가중치입니다.
`package.json`이 없는 저장소의 `package-scripts`처럼 해당되지 않는 규칙은 `skip`되어 계산에서 빠집니다.

각 규칙이 왜 필요한지는 [docs/rules.md](docs/rules.md)에 있습니다. 이 문서는 코드에서 생성하며, 코드와 어긋나면 테스트가 실패합니다.

## 라이브러리로 쓰기

```ts
import { check, formatText } from 'agentready';

const report = await check('.');
console.log(formatText(report, { color: false }));
if (!report.passed) process.exitCode = 1;
```

`check(root, { rules })`에 직접 만든 규칙을 넘길 수 있습니다. 만드는 방법은 [규칙 추가하기](docs/adding-a-rule.md)에 있습니다.

## 개발과 테스트

```bash
npm ci
npm run typecheck   # 타입 검사
npm run lint        # 린트
npm run build       # dist/에 빌드
npm test            # 테스트
npm run docs        # 규칙을 바꿨다면 빌드 후 docs/rules.md 재생성
npm run check:self  # 빌드 후 이 저장소를 자기 자신으로 검사
```

GitHub Actions는 `main` 브랜치에 push하거나 PR을 만들 때 Node.js 22와 24에서 타입 검사·린트·빌드·테스트·자체 검사를 실행합니다.

| 파일 | 역할 |
|---|---|
| `src/cli.ts` | 실행 파일의 입구 |
| `src/run.ts` | 옵션 해석, 사용법 검사, 명령 실행. 입출력은 주입받습니다 |
| `src/check.ts` | 규칙 실행과 점수 계산 |
| `src/rules/` | 규칙 하나당 파일 하나. `index.ts`에 등록합니다 |
| `src/context.ts` | 파일 읽기. 규칙은 이 클래스로만 파일에 접근합니다 |
| `src/report.ts` | 텍스트·JSON·Markdown 출력 |
| `src/init.ts` | `AGENTS.md` 초안 만들기 |
| `src/agents.ts` | AI 도구별 스킬 설치 계획 |
| `src/jsonc.ts` | 주석이 있는 `tsconfig.json` 파싱 |

설계 원칙은 다음과 같습니다.

- **규칙은 결과만 반환합니다.** 파일 읽기는 `RepoContext`, 출력과 종료 코드는 `run.ts`가 맡습니다. 그래서 테스트는 임시 폴더에 가짜 저장소를 만들고 결과를 바로 비교합니다.
- **실패에는 항상 다음 행동을 붙입니다.** `fail(message, fix)`가 `fix`를 필수로 받아, 출력만 본 사람이나 AI가 바로 고칠 수 있게 합니다.
- **신뢰할 수 없는 JSON은 `unknown`으로 받습니다.** `as` 캐스팅 없이 검증한 값만 씁니다.
- **규칙 하나가 깨져도 검사는 계속됩니다.** 예외를 던진 규칙은 실패로 보고됩니다.

## 라이선스

[MIT](LICENSE)
