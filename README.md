# agent-lint

[![CI](https://github.com/jungsunbeen/agent-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/jungsunbeen/agent-lint/actions/workflows/ci.yml)

**리포지토리가 AI 코딩 에이전트에게 일하기 좋은 상태인지 검사하고, 고칠 방법까지 알려주는 CLI.**

에이전트는 매 세션을 프로젝트 기억 없이 시작합니다. 그래서 사람에겐 사소한 빈틈이 에이전트에겐 그대로 실패가 됩니다. agent-lint는 그런 빈틈을 규칙으로 만들어 CI가 잡게 하고, 고치는 일은 AI에게 맡깁니다.

```console
$ agent-lint
✖ agent-instructions  No agent instructions file found.
                      → Run `agent-lint init` to generate AGENTS.md from your package.json scripts.
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

- **사실만 봅니다.** 파일과 설정을 읽어 확인하고, 판단이 필요한 항목은 검사하지 않습니다.
- **실패에는 항상 `fix`가 붙습니다.** 출력만 본 사람도, AI도 바로 다음 행동을 알 수 있습니다.
- **AI 도구에 바로 연결됩니다.** `init --agent`로 수정 스킬을 설치하면 검사 → 수정 → 재검사를 스스로 반복합니다.
- **런타임 의존성이 없습니다.** Node.js 표준 모듈만 쓰므로 어떤 프로젝트에 설치해도 의존성 충돌이 없습니다.

## 빠른 시작

```bash
# 1. 설치 — 아직 npm에 배포하지 않아 저장소에서 빌드합니다
git clone https://github.com/jungsunbeen/agent-lint.git
cd agent-lint && npm ci && npm run build && npm link

# 2. 검사할 프로젝트에서
cd ~/my-project
agent-lint                        # 검사
agent-lint init                   # package.json 스크립트로 AGENTS.md 초안 생성
agent-lint init --agent claude    # Claude Code에 수정 스킬 연결
```

`npm link`를 되돌리려면 `npm uninstall -g agent-lint`를 실행합니다.

## 검사 대상

- `package.json`과 `tsconfig.json`을 쓰는 JS/TS 리포지토리입니다. Next.js, React, Node.js 등 프레임워크는 가리지 않습니다. 규칙이 프레임워크 기능이 아니라 저장소의 파일과 설정을 보기 때문입니다.
- 도구를 실행하려면 Node.js 22 이상이 필요합니다. 검사 대상 프로젝트가 요구하는 Node 버전은 `node-version` 규칙이 따로 봅니다.
- 해당하지 않는 규칙은 실패가 아니라 `skip`으로 표시되어 점수 계산에서 빠집니다. `package.json`이 없는 저장소에서는 `package-scripts`와 `agent-commands`가 skip됩니다.

## 동작 방식

```
run.ts         argv → 명령 + 옵션
  ↓
RepoContext    파일 1회 캐시 읽기
  ↓
Rule[]         규칙별 예외 격리 실행
  ↓
Report         가중치 점수 · fix · 종료 코드
```

- **프로그램**은 파일을 읽어 규칙을 검사하고, 점수를 계산하고, 실패마다 `fix`를 붙입니다. `AGENTS.md` 초안도 만듭니다.
- **AI**는 `fix`를 따라 고치고, 다시 검사해 통과할 때까지 반복합니다.
- **개발자**는 어떤 락파일을 남길지처럼 판단이 필요한 항목을 정하고, AI가 만든 변경을 검토합니다.

프로그램은 판단하지 않고 사실만 확인합니다. 예를 들어 `pnpm build`는 스크립트일 수도 pnpm 내장 명령일 수도 있어서 검사하지 않습니다. 틀린 경고보다 놓친 경고가 낫다고 봤습니다.

특히 [`agent-commands`](docs/rules.md#agent-commands) 규칙은 지침 파일이 **있는지**가 아니라 **사실인지**를 검사합니다. 지침에 적힌 명령을 `package.json`과 대조합니다.

## AI 도구 연결

**agent-lint 저장소가 아니라 검사할 프로젝트 폴더**에서 실행합니다. `--agent`를 반복하면 여러 도구를 함께 연결할 수 있습니다.

| 도구 | 연결 | 스킬 호출 | 설치되는 파일 |
|---|---|---|---|
| Claude Code | `agent-lint init --agent claude` | `/agent-lint-fix` | `.claude/skills/agent-lint-fix/SKILL.md`, `CLAUDE.md` |
| Codex | `agent-lint init --agent codex` | `$agent-lint-fix` | `.agents/skills/agent-lint-fix/SKILL.md` |
| Copilot CLI | `agent-lint init --agent copilot` | `/agent-lint-fix` | `.agents/skills/agent-lint-fix/SKILL.md` |

- Claude Code 스킬은 `agent-lint check --json --exit-zero` 결과를 미리 담고 시작해서, AI가 명령을 한 번 덜 실행합니다.
- Codex와 Copilot CLI는 같은 `.agents/skills` 위치를 읽으므로 스킬 파일 하나를 공유합니다.
- Claude Code는 `AGENTS.md` 대신 `CLAUDE.md`를 읽습니다. `CLAUDE.md`가 없으면 `@AGENTS.md` 한 줄로 만들어 같은 지침을 보게 합니다.

`AGENTS.md`가 없으면 함께 만듭니다. 이미 있는 파일은 건드리지 않으므로 몇 번을 연결해도 결과가 같습니다.

## 기본 작업 흐름

1. **검사** — 프로젝트 폴더에서 `agent-lint`를 실행합니다. 실패한 규칙마다 `→` 뒤에 할 일이 나옵니다.
2. **지침 파일 만들기** — `agent-lint init`이 `package.json` 스크립트와 락파일을 읽어 `AGENTS.md` 초안을 만듭니다. pnpm 락파일이 있으면 `pnpm run test`처럼 그 패키지 매니저의 명령으로 적어 `agent-commands` 규칙을 통과합니다. `<!-- TODO -->`로 남은 프로젝트 설명은 직접 채웁니다.
3. **AI에게 고치게 하기** — 연결한 도구에서 `/agent-lint-fix`(Codex는 `$agent-lint-fix`)를 호출합니다. AI가 `error` 규칙부터 `fix`를 따라 고치고, 통과할 때까지 다시 검사합니다. 어떤 Node 버전을 요구할지처럼 판단이 필요한 항목은 추측하지 않고 개발자에게 묻습니다.
4. **CI로 유지하기** — 지침은 시간이 지나면 코드와 어긋납니다. CI에서 `agent-lint --fail-under 90`으로 실행하면 스크립트 이름만 바꾸고 지침을 고치지 않은 PR이 바로 실패합니다. 이 저장소도 CI에서 자기 자신을 100점 기준으로 검사합니다.

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

`error` 규칙은 종료 코드를 정하고, `warning` 규칙은 점수만 낮춥니다. 점수는 적용되는 규칙 중 통과한 비율이며 `error`가 `warning`의 3배 가중치입니다.
규칙마다 왜 필요한지는 [docs/rules.md](docs/rules.md)에 있습니다. 이 문서는 코드에서 생성하며, 코드와 어긋나면 테스트가 실패합니다.

### 규칙 끄기

```bash
agent-lint check --ignore typescript-strict
agent-lint check --ignore typescript-strict --ignore ci-workflow
```

`--ignore`한 규칙은 실행하지 않고 `skip`으로 표시해 점수 분모에서 뺍니다. 라이브러리에서는 `check(root, { ignore: ['typescript-strict'] })`로 넘깁니다. 없는 규칙 ID를 넘기면 `agent-lint rules`로 확인하라는 사용법 오류(종료 코드 `2`)가 납니다.

## 명령어

| 명령어 | 하는 일 |
|---|---|
| `agent-lint [dir]` | `agent-lint check`와 같습니다 |
| `agent-lint init [dir]` | `AGENTS.md` 초안을 만듭니다 |
| `agent-lint init --agent <이름>` | AI 도구 연결 파일을 설치합니다 |

<details>
<summary>전체 명령어와 옵션 보기</summary>

| 명령어 | 하는 일 |
|---|---|
| `agent-lint check [dir]` | 저장소를 검사하고 결과와 점수를 출력합니다 |
| `agent-lint check --json` | 결과를 JSON으로 출력합니다. 스킬과 스크립트가 사용합니다 |
| `agent-lint rules` | 규칙 목록을 출력합니다. `--json`, `--markdown`도 지원합니다 |
| `agent-lint init --dry-run` | 파일을 쓰지 않고 `AGENTS.md` 내용만 출력합니다 |
| `agent-lint init --force` | 이미 있는 `AGENTS.md`를 덮어씁니다 |
| `agent-lint --help` | 사용법을 출력합니다 |
| `agent-lint --version` | 현재 버전을 출력합니다 |

| 옵션 | 쓰는 명령 | 내용 |
|---|---|---|
| `--json` | check, rules | 기계가 읽는 출력 |
| `--fail-under <n>` | check | 점수가 `n` 미만이면 종료 코드 `1` |
| `--exit-zero` | check | 결과와 관계없이 `0`으로 끝납니다 |
| `--ignore <ruleId>` | check | 규칙을 건너뜁니다. 반복할 수 있습니다 |
| `--markdown` | rules | 규칙을 Markdown으로 출력합니다 |
| `--agent <이름>` | init | AI 도구 연결 파일을 설치합니다. 반복할 수 있습니다 |
| `--force` | init | 기존 `AGENTS.md`를 덮어씁니다 |
| `--dry-run` | init | 파일을 쓰지 않고 출력만 합니다 |

옵션은 명령마다 정해져 있습니다. 다른 명령의 옵션을 붙이면(`agent-lint init --json`) 조용히 무시하지 않고 사용법 오류로 끝납니다.

</details>

종료 코드는 `0` 성공, `1` `error` 규칙 실패 또는 `--fail-under` 미달, `2` 잘못된 사용법입니다.

## 라이브러리로 쓰기

```ts
import { check, formatText } from 'agent-lint';

const report = await check('.');
console.log(formatText(report, { color: false }));
if (!report.passed) process.exitCode = 1;
```

| API | 내용 |
|---|---|
| `check(root, options?)` | 규칙을 실행하고 `Report`를 돌려줍니다. `options.rules`에 규칙 배열을, `options.ignore`에 건너뛸 규칙 ID를 넘깁니다. `root`가 디렉터리가 아니면 예외를 던집니다 |
| `report.score` | 0–100. `error`가 `warning`의 3배 가중치이고, skip된 규칙은 분모에서 빠집니다 |
| `report.passed` | `error` 규칙이 하나도 실패하지 않았는지 |
| `report.summary` | `pass`, `fail`, `skip` 개수 |
| `report.findings` | 규칙별 결과. `ruleId`, `severity`, `status`, `message`, 실패면 `fix`가 함께 옵니다 |
| `formatText`, `formatJson` | `Report`를 터미널 텍스트나 JSON으로 출력합니다 |

직접 만든 규칙을 넘기는 방법은 [규칙 추가하기](docs/adding-a-rule.md)에 있습니다.

<details>
<summary>패키지가 내보내는 전체 목록 보기</summary>

| 내보내는 것 | 설명 |
|---|---|
| `rules` | 기본으로 실행하는 규칙 8개 |
| `pass`, `fail`, `skip` | 규칙 결과를 만드는 함수. `fail(message, fix)`는 `fix`가 필수입니다 |
| `RepoContext` | 규칙이 파일을 읽는 객체. 같은 파일은 여러 규칙이 읽어도 한 번만 읽습니다 |
| `computeScore(findings)` | 점수만 따로 계산합니다 |
| `renderAgentsMd` | `agent-lint init`이 쓰는 `AGENTS.md` 초안을 만듭니다 |
| `formatRulesMarkdown`, `formatRulesJson`, `formatRulesText` | 규칙 목록을 Markdown·JSON·텍스트로 출력합니다 |
| `Finding`, `Report`, `Rule`, `RuleResult`, `Severity`, `Status` | 타입 |

</details>

## 개발과 테스트

```bash
npm ci
npm run typecheck   # 타입 검사 (src, test, vitest.config.ts)
npm run lint        # 린트
npm run build       # dist/에 빌드
npm test            # 테스트
npm run docs        # 규칙을 바꿨다면 빌드 후 docs/rules.md 재생성
npm run check:self  # 빌드 후 이 저장소를 자기 자신으로 검사
```

- **런타임 의존성은 0개**입니다. 외부 패키지 없이 Node.js 표준 모듈만으로 구현해, 이 도구를 설치한 프로젝트의 의존성과 버전이 충돌할 여지를 없앴습니다.
- **엄격한 타입 검사**를 켜 두었습니다. `strict`에 더해 `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`까지 켜서 인덱스 접근과 옵셔널 프로퍼티 누락을 컴파일 단계에서 잡습니다.
- **검사와 빌드를 나눴습니다.** `tsconfig.json`은 `src`·`test`·`vitest.config.ts`를 `noEmit`으로 검사하고, `tsconfig.build.json`은 `src`만 `dist/`의 JS와 `.d.ts`로 내보냅니다.
- **배포는 `package.json`의 `exports`를 따릅니다.** 타입은 `dist/index.d.ts`, 런타임은 `dist/index.js`로 노출되고, 테스트 코드는 배포물에 들어가지 않습니다.
- **실패에는 항상 다음 행동을 붙입니다.** `fail(message, fix)`가 `fix`를 필수로 받게 해, 출력만 본 사람이나 AI가 바로 고칠 수 있습니다.
- **신뢰할 수 없는 JSON은 `unknown`으로 받습니다.** `as` 캐스팅 없이 검증한 값만 씁니다.
- **규칙 하나가 깨져도 검사는 계속됩니다.** 예외를 던진 규칙은 실패로 보고됩니다.

### CI에서 확인하는 것

`main`에 push하거나 PR을 만들면 Node.js 22와 24에서 타입 검사·린트·빌드를 먼저 돌리고, 이어서 세 가지를 확인합니다.

1. `npm test` — `vitest`가 `mkdtemp`로 만든 임시 디렉터리에 가짜 저장소를 만들어 실제 파일시스템에서 규칙을 실행합니다.
2. 문서 일치 — `test/docs.test.ts`가 코드의 규칙 정의와 커밋된 `docs/rules.md`를 비교합니다. 규칙을 바꾸고 문서를 다시 만들지 않으면 실패합니다.
3. `check:self` — 이 저장소를 자기 자신으로 검사해 100점을 요구합니다.

<details>
<summary>파일 구성 보기</summary>

| 파일 | 역할 |
|---|---|
| `src/cli.ts` | 실행 파일의 입구 |
| `src/run.ts` | 옵션 해석, 명령별 옵션 검사, 명령 실행. 입출력은 주입받습니다 |
| `src/check.ts` | 규칙 실행과 점수 계산 |
| `src/rules/` | 규칙 하나당 파일 하나. `index.ts`에 등록합니다 |
| `src/context.ts` | 파일 읽기. 규칙은 이 클래스로만 파일에 접근합니다 |
| `src/report.ts` | 텍스트·JSON·Markdown 출력 |
| `src/init.ts` | `AGENTS.md` 초안 만들기 |
| `src/agents.ts` | AI 도구별 스킬 설치 계획 |
| `src/jsonc.ts` | 주석이 있는 `tsconfig.json` 파싱 |

규칙은 결과만 반환하고, 파일 읽기는 `RepoContext`, 출력과 종료 코드는 `run.ts`가 맡습니다. 그래서 테스트는 임시 폴더에 가짜 저장소를 만들고 결과를 바로 비교합니다.

</details>

## 라이선스

[MIT](LICENSE)
