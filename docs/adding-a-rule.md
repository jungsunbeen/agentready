# 규칙 추가하기

예시로 "`.editorconfig`가 있는가"를 검사하는 `editorconfig` 규칙을 추가해 봅니다.

## 1. 규칙 파일 만들기

`src/rules/editorconfig.ts`:

```ts
import type { Rule } from '../types.js';
import { fail, pass } from './result.js';

export const editorconfig: Rule = {
  id: 'editorconfig',
  title: 'An .editorconfig file exists',
  severity: 'warning',
  rationale:
    'Agents write files with whatever indentation their model prefers. ' +
    '.editorconfig makes the expected style explicit and machine-readable.',
  async check(ctx) {
    if (await ctx.exists('.editorconfig')) return pass('Found .editorconfig.');
    return fail('No .editorconfig found.', 'Add .editorconfig with indent_style and indent_size.');
  },
};
```

정할 것은 네 가지입니다.

| 필드 | 기준 |
| --- | --- |
| `id` | kebab-case. 출력과 문서 앵커에 쓰이므로 한 번 정하면 바꾸지 않습니다. |
| `severity` | 실패하면 에이전트가 **틀린 행동**을 하게 되는가? 그렇다면 `error`, 효율이 떨어지는 정도라면 `warning`. |
| `rationale` | "에이전트에게 왜 중요한가"를 씁니다. `docs/rules.md`에 그대로 들어갑니다. |
| `fix` | 출력만 본 사람이 바로 할 수 있는 **한 가지 행동**. "개선하세요" 같은 문장은 피합니다. |

### 결과 상태 고르기

- `pass` — 조건 충족
- `fail` — 조건 미충족. 반드시 `fix`를 붙입니다(`fail(message, fix)`가 강제합니다).
- `skip` — 이 저장소에는 **해당되지 않음**. 예: `package.json`이 없는 저장소에서 npm 스크립트 검사. 점수 계산에서 빠지므로, "없어서 실패"와 "해당 없음"을 구분해야 합니다.

### 파일 읽기

규칙은 `node:fs`를 직접 쓰지 않고 `RepoContext`만 씁니다.

| 메서드 | 반환 |
| --- | --- |
| `ctx.readText(path)` | 파일 내용, 없으면 `undefined` |
| `ctx.readJson(path, { comments })` | `{ kind: 'missing' \| 'invalid' \| 'ok' }` — 파싱 실패도 값으로 받습니다 |
| `ctx.exists(path)` | `boolean` |
| `ctx.list(dir)` | 정렬된 항목 이름, 디렉토리가 없으면 `[]` |
| `readPackageJson(ctx)` | 검증된 `PackageInfo` (`scripts`, `engines`는 `Map`) |

같은 파일을 여러 규칙이 읽어도 디스크에서는 한 번만 읽습니다.

## 2. 등록하기

`src/rules/index.ts`의 `rules` 배열에 추가합니다. 배열 순서가 출력 순서이며, `error` 규칙을 먼저 둡니다.

## 3. 테스트 쓰기

`test/rules.test.ts`에 `pass`, `fail`, (해당되면) `skip` 각각을 테스트합니다. `runRule`이 임시 저장소를 만들고 규칙을 실행합니다.

```ts
describe('editorconfig', () => {
  it('passes with .editorconfig', async () => {
    expect(await runRule(editorconfig, { '.editorconfig': 'root = true' })).toMatchObject({ status: 'pass' });
  });

  it('fails without it', async () => {
    expect(await runRule(editorconfig, {})).toMatchObject({ status: 'fail' });
  });
});
```

`test/helpers.ts`의 `GOOD_REPO`는 모든 규칙을 통과하는 저장소입니다. 새 규칙을 추가하면 `GOOD_REPO`도 통과하도록 갱신하세요. 그렇지 않으면 `check.test.ts`의 100점 테스트가 실패합니다.

## 4. 문서 재생성

```sh
npm run build && npm run docs
```

`docs/rules.md`는 규칙의 `title`, `severity`, `rationale`에서 생성됩니다. 재생성하지 않으면 `test/docs.test.ts`가 실패합니다.
