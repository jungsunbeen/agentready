# agentready

리포지토리가 **AI 코딩 에이전트가 일하기 좋은 상태인지** 검사하는 CLI입니다.

```console
$ npx agentready
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

## 왜 만들었나

에이전트는 매 세션을 프로젝트에 대한 기억 없이 시작합니다. 그래서 사람에게는 사소한 빈틈이 에이전트에게는 그대로 실패로 이어집니다.

- `AGENTS.md`가 없으면 빌드·테스트 명령을 **추측**합니다.
- `AGENTS.md`에 적힌 `npm run check`가 이미 이름이 바뀐 스크립트라면, 에이전트는 **실패하는 명령을 실행하고 즉흥적으로 우회**합니다.
- `test` 스크립트가 `npm init` 기본값(`echo "Error: no test specified"`)이면 **자기 변경을 검증할 수단이 없습니다.**
- 락파일이 둘이면 어떤 패키지 매니저를 써야 할지 **고르게** 됩니다.

이 문제들은 대부분 파일 몇 개만 보면 기계적으로 찾아낼 수 있습니다. `agentready`는 그걸 규칙으로 만들어서, 사람이 리뷰에서 매번 지적하지 않아도 CI가 잡도록 합니다.

특히 [`agent-commands`](docs/rules.md#agent-commands) 규칙은 **에이전트 지침 문서와 실제 코드가 어긋났는지**를 봅니다. 문서가 있는지만 확인하는 것으로는 부족하고, 문서가 사실인지 확인해야 한다는 생각에서 나온 규칙입니다.

## 설치

Node.js 22 이상이 필요합니다. 런타임 의존성은 없습니다.

```sh
npm install --save-dev agentready
```

## 사용법

```sh
agentready                   # 현재 디렉토리 검사 (check 생략 가능)
agentready check ../other    # 다른 디렉토리 검사
agentready check --json      # 에이전트·스크립트용 JSON 출력
agentready check --fail-under 80   # 점수가 80 미만이면 exit 1

agentready rules             # 규칙 목록
agentready rules --markdown  # 규칙 문서 (docs/rules.md 생성에 사용)

agentready init              # package.json과 락파일을 읽어 AGENTS.md 초안 생성
agentready init --dry-run    # 파일을 쓰지 않고 출력만
```

### 종료 코드

| 코드 | 의미 |
| --- | --- |
| 0 | 통과 |
| 1 | `error` 규칙 실패, 또는 `--fail-under` 미달 |
| 2 | 잘못된 인자, 존재하지 않는 디렉토리 |

`error` 규칙은 종료 코드를 결정하고, `warning` 규칙은 점수만 낮춥니다. 점수는 적용되는 규칙 중 통과한 비율이며 `error`는 `warning`의 3배 가중치입니다. 적용되지 않는 규칙(예: `package.json`이 없는 저장소의 `package-scripts`)은 `skip`되어 점수 계산에서 빠집니다.

### CI에서 쓰기

```yaml
- run: npx agentready --fail-under 90
```

### 라이브러리로 쓰기

```ts
import { check, formatText } from 'agentready';

const report = await check('.');
console.log(formatText(report, { color: false }));
if (!report.passed) process.exitCode = 1;
```

`check(root, { rules })`에 직접 만든 `Rule`을 넘길 수도 있습니다. → [규칙 추가하기](docs/adding-a-rule.md)

## 규칙

| 규칙 | 심각도 | 검사 내용 |
| --- | --- | --- |
| `agent-instructions` | error | `AGENTS.md`, `CLAUDE.md` 등 에이전트 지침 파일이 있는가 |
| `agent-commands` | error | 지침에 적힌 `npm run x`가 실제 `package.json`에 있는가 |
| `readme` | error | README에 사용법·설치 섹션이 있는가 |
| `package-scripts` | error | `lint`, `test` 스크립트가 있고 placeholder가 아닌가 |
| `typescript-strict` | warning | `extends` 체인을 따라가서 `strict`가 켜져 있는가 |
| `ci-workflow` | warning | CI 설정이 있는가 |
| `single-lockfile` | warning | 락파일이 정확히 하나인가 |
| `node-version` | warning | Node.js 버전이 선언되어 있는가 |

각 규칙이 왜 필요한지는 [docs/rules.md](docs/rules.md)에 있습니다. 이 문서는 코드에서 생성되고, 코드와 어긋나면 테스트가 실패합니다.

## 설계

- **규칙 하나 = 파일 하나.** `src/rules/`에 있고 `Rule` 인터페이스(`id`, `severity`, `rationale`, `check`)만 구현하면 됩니다.
- **파일 시스템 접근은 `RepoContext`만.** 규칙은 `node:fs`를 직접 쓰지 않습니다. 읽기가 규칙 사이에서 캐시되고, 테스트는 임시 디렉토리에 가짜 저장소를 만들어 검사합니다.
- **실패에는 항상 다음 행동(`fix`)을 붙입니다.** 사람이든 에이전트든 출력만 보고 바로 고칠 수 있게 하려는 것입니다. `--json` 출력에도 그대로 들어갑니다.
- **신뢰할 수 없는 JSON은 `unknown`으로 받고 좁힙니다.** `as` 캐스팅 없이 `isRecord`로 검증한 값만 씁니다.
- **애매하면 판단하지 않습니다.** `pnpm build`는 스크립트일 수도, pnpm 내장 명령일 수도 있어서 `agent-commands`는 이를 검사하지 않습니다. 틀린 경고보다 놓친 경고가 낫다고 봤습니다.

## 개발

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build && npm run docs   # 규칙을 바꿨다면 문서 재생성
```

이 저장소는 자기 자신을 `--fail-under 100`으로 검사합니다(`npm run check:self`, CI에서 실행).
