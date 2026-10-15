# 구조

Obsidian 플러그인 하나지만 코드는 세 층으로 나뉜다. 보드 엔진은 Obsidian과 React를 모르고, 보드 화면은 Obsidian을 모른다. 그래서 엔진은 브라우저 없이 Vitest로 시험하고, Obsidian에 맞추는 일은 셸 한곳에서 한다.

```
src/core/       보드의 모든 것 (React·Obsidian 없음)
src/board-ui/   보드 화면 (React)
src/*.ts(x)     Obsidian 셸: 플러그인, .board 보기, Vault 저장소, 대화 상자, 임베드, 설정
```

## 규칙

- **보드의 기능과 모양은 `core`와 `board-ui`에서 고친다.** 도형, 연결선, 도구 막대, 선택 막대, 패널, 단축키, 색, 터치 동작이 여기 있다.
- **셸은 Obsidian과 닿는 일만 맡는다.** 파일 읽고 쓰기(Vault API), 링크·파일 고르기(`SuggestModal`), 글 입력(`Modal`), 머리글 버튼과 메뉴(`Menu`), 노트 속 임베드, 파일 옮김에 따른 링크 고치기, 테마, 설정.
- **의존 방향은 한쪽이다.** `core` ← `board-ui` ← 셸. `core`는 React·Obsidian을 모르고, `board-ui`는 Obsidian과 셸을 모른다(`scripts/architecture.test.ts`가 검사한다). 두 층은 `@boardline/core/…`, `@boardline/board-ui/…`로 가져온다(esbuild·Vitest·TypeScript에 같은 별칭).

## 셸이 보드 화면에 주는 것

`BoardScreen`(`src/board-ui/BoardScreen.tsx`)은 보드 하나를 그리고 편집한다. `BoardFileView`가 `BoardHost`로 다음을 준다.

| | Obsidian에서 |
|---|---|
| 파일 (`WorkspaceStorage`) | `VaultStorage`: Vault API, 숨김 폴더(`.boardline/`)는 Adapter API |
| 불러오기·저장 | `TextFileView` (고칠 때마다 `requestSave`, 다른 곳에서 바뀐 내용은 Obsidian이 알려 줌) |
| 링크·파일 고르기 | Obsidian 검색 상자 (`SuggestModal`) |
| Mermaid 글 입력 | Obsidian `Modal` |
| 내보내기·가져오기 메뉴 | 보기 머리글 버튼과 `…` 메뉴 (`boardMenu()`가 항목을 데이터로 만들고 Obsidian `Menu`로 그림) |
| 웹 링크 미리보기 | `requestUrl` |
| 붙여넣은 그림, 내보낸 그림 | 보관함의 첨부 폴더 (Obsidian Sync가 숨김 폴더를 옮기지 않으므로) |
| 파일 끌어 놓기 | 파일 탐색기의 끌기(`dragManager`) |
| 키 | 보드 보기가 활성일 때만. 겹치는 Obsidian 단축키(Ctrl+G 등)는 보기의 `Scope`로 보드가 먼저 받음 |
| 색 | Obsidian 변수에서 `--bl-*`, 보드 바탕은 노트 바탕색 |
| 전체 화면(발표) | `requestFullscreen` (안 되는 기기에서는 창 안에서 발표) |

## 스타일

- 보드 화면의 클래스는 모두 `bl-`로 시작한다. Obsidian의 `.menu`, `.modal` 같은 이름과 겹치지 않게 하려는 것이다.
- 색은 `--bl-bg`, `--bl-panel`, `--bl-text`, `--bl-accent` 같은 토큰으로 쓰고, `src/plugin.css`가 Obsidian 변수에서 정한다.
- 빌드는 보드 스타일의 모든 선택자 앞에 `.bl-root`를 붙인다(`esbuild.config.mjs`의 `scopeBoardCss`). Obsidian의 태블릿·휴대폰용 버튼 규칙보다 앞서게 하려는 것이고, 보드 규칙끼리의 순서는 그대로다. `styles.css`는 이렇게 고친 `board.css`에 `plugin.css`를 붙인 것이다.
- 좁은 화면(휴대폰, 좁은 Obsidian 창)은 컨테이너 쿼리로 처리한다. 보드가 560px보다 좁으면 도구 막대가 아래로 가로로 놓인다.

## 파일

- 보드는 `이름.board` (JSON, 머리 정보 한 줄 + 객체 한 줄씩. `serialize.ts`의 `formatBoardFile`). Obsidian은 마지막 점 뒤를 확장자로 보므로 확장자는 `.board` 하나다.
- 버전 기록은 `.boardline/history/<보드 id>/`.
- 보드 링크는 `boardline://board/<id>`, 노트 링크는 `boardline://doc/<경로>`다. 보드 링크는 보드 id로 걸려 있어 보드를 옮겨도 이어진다.

## 빌드와 테스트

| | 명령 |
|---|---|
| 빌드 | `npm run build` → `dist/` |
| 개발 | `npm run dev -- --vault <보관함>` (고칠 때마다 다시 만들어 `<보관함>/.obsidian/plugins/boardline/`에 넣음) |
| 테스트 | `npm test` |
| 타입 검사 | `npm run typecheck` |

`scripts/app-cdp.mjs`는 CDP로 Obsidian을 조작해 화면을 확인한다. Obsidian을 `--remote-debugging-port=9222`로 띄우고 쓴다(포트와 페이지 주소는 세 번째·네 번째 인자로 바꿀 수 있다). `scripts/cdp-profile.mjs`는 같은 방식으로 식 하나의 실행 시간을 잰다.
