# Obsidian 플러그인 출시 준비

2026-10-16 기준(이 문서의 커밋 해시는 데스크탑 앱과 함께 있던 이전 저장소의 것이다). 기능, 영어 UI, Obsidian 리뷰 규칙, 릴리스 자동화, 영어 README는 갖췄다. 남은 일은 **라이선스 정하기**, **GitHub 공개와 첫 릴리스**, **실제 휴대폰·태블릿 확인**, **커뮤니티 디렉터리 제출**이다(6·7장). 크기 줄이기는 선택이다.

---

## 1. 이름

**`Boardline` 유지를 권한다.**

- Obsidian 커뮤니티 플러그인 목록([community-plugins.json](https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json), 8,997개)에 같은 이름이나 비슷한 이름이 없다.
- 웹 검색에서도 같은 이름의 소프트웨어를 찾지 못했다.
- 이미 플러그인 id(`boardline`), 파일 머리(`"format":"boardline-board"`), 링크(`boardline://…`), CSS 접두어(`bl-`)에 쓰고 있다. 출시 후에는 사용자 파일이 생기므로 바꾸기 어렵다(바꾸려면 출시 전에).

이름보다 **설명(description)** 이 검색에 더 중요하다. Obsidian의 플러그인 찾기는 이름·작성자·설명을 검색하고, 사용자는 "whiteboard", "mind map", "flowchart" 같은 말로 찾는다. `manifest.json`의 설명을 아래처럼 고쳐 두었다(예전 설명에 없어진 기능 "wireframes"가 남아 있었다).

> Whiteboards in your vault: flowcharts, mind maps, sequence diagrams, tables and sticky notes in .board files, with your notes and pictures on the board.

다른 이름을 원하면 Obsidian 목록에 없는 후보: `Thinkboard`, `Mapboard`, `Plainboard`(웹에서 다른 제품과 겹치는지는 아직 확인하지 않음).

---

## 2. 다국어(l10n)

✅ 했다. 영어가 기준이고 한국어·일본어·중국어(간체)·스페인어·독일어·프랑스어를 둔다(문구 약 470개). 언어는 `getLanguage()`로 알아내고, 그래서 `minAppVersion`은 1.8.7이다(보관함별 로컬 저장소 `App.loadLocalStorage`·`saveLocalStorage`도 1.8.7부터). 아래는 정할 때의 조사다.

예전에는 UI가 전부 한국어였다. Obsidian 커뮤니티는 대부분 영어를 쓰므로 **영어를 기본으로 하고 한국어를 함께 두는 것**이 사실상 필요하다.

### 다른 플러그인은 어떻게 하나

| 플러그인 | 언어 알아내기 | 번역 두는 곳 | 특징 |
|---|---|---|---|
| [Kanban](https://github.com/mgmeyers/obsidian-kanban/blob/main/src/lang/helpers.ts) | `localStorage.getItem('language')` | `locale/*.ts`(언어별 객체) | `t(key)`가 없는 말은 영어로. 이 helpers.ts를 그대로 가져다 쓰는 플러그인이 많다(Linter 등). 의존성 없음 |
| [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/master/src/lang/helpers.ts) | `getLanguage()` | 영어는 번들, 나머지 언어 팩은 압축(base64+deflate)해 넣고 쓸 때 풂 | 번들 크기를 아끼려는 방식 |
| [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks/blob/main/src/i18n/i18n.ts) | `getLanguage()` | `locales/*.json` | i18next 사용 |
| [Remotely Save](https://github.com/remotely-save/remotely-save/blob/master/src/i18n.ts) | `moment.locale()` + 설정에서 고르기 | 언어별 객체 | Mustache로 변수 채움 |

- Obsidian API의 `getLanguage()`(1.8.7부터)가 공식 방법이다. 설정의 언어 코드(`en`, `ko`, `zh` …)를 준다.
- `moment.locale()`은 Obsidian 언어 설정을 따르지 않는다는 보고가 있어 피한다.

### 권장안

- `getLanguage()`를 쓰고 `minAppVersion`을 `1.8.7`로 올린다(이전 버전에서는 `localStorage.getItem('language')`로 대신해도 된다).
- 의존성 없이 Kanban식으로 한다. `en.ts`(기준, 키 목록이 곧 타입)와 `ko.ts`(같은 키, 빠지면 영어)를 두고 `t(key)`를 쓴다. 문자열 몇백 개라 i18next는 과하다(크기도 늘어남).
- **범위: 한국어 문자열 약 750개.**

  | 위치 | 문자열 | 파일 |
  |---|---|---|
  | `src/core` | 약 300 | 30개 |
  | `src/board-ui` | 약 400 | 12개 |
  | `src/` (셸) | 약 50 | 6개 |

- core에는 실행 취소 기록 이름, 알림, 새 보드 이름 같은 것이 있다. core가 앱 언어를 모르므로, 셸이 시작할 때 core에 언어를 알려 주는 `setLocale()`을 둔다.
- 영어 문구는 Obsidian [스타일 가이드](https://help.obsidian.md/Contributing+to+Obsidian/Style+guide)대로 sentence case로 쓴다("New board", "Export to canvas").

---

## 3. 코드에서 고칠 것

| 항목 | 상태 | 비고 |
|---|---|---|
| 정규식 lookbehind 없애기 | ✅ `c67d5e8` | iOS 16.4 미만은 lookbehind가 든 플러그인을 아예 불러오지 못한다(Obsidian 가이드라인). 남은 `(?<` 두 개는 elkjs 안의 문자열이라 괜찮다 |
| 옮기거나 이름 바꾼 파일의 링크 따라가기 | ✅ `c67d5e8` | 노트 카드·링크·그림·글 속 `[[링크]]`. 열린 보드는 편집기로 한 번의 실행 취소 단위로, 닫힌 보드는 파일에서 고친다. Obsidian의 "내부 링크 자동 업데이트" 설정이 꺼져 있어도 보드 링크는 늘 고친다(설정을 따르게 하려면 결정 필요) |
| 큰 보드 성능 | ✅ `d858517` | 아래 표 |
| `manifest.json` | ✅ | `version` 1.0.0, `minAppVersion` 1.8.7, `author` kjs104901, `authorUrl` GitHub 프로필. 설명은 동사로 시작하고 250자 안, "Obsidian"을 넣지 않았다 |
| Obsidian 리뷰 규칙(`npm run lint`) | ✅ | 커뮤니티 디렉터리의 자동 검사가 쓰는 [eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin)의 recommended 설정. 오류 0개. 남긴 경고는 아래 |
| 빌드 재현성 | ✅ | 같은 소스에서 두 번 빌드하면 `main.js`·`styles.css`가 바이트까지 같다(아이콘 파일을 정렬해 읽음). 디렉터리는 `npm run build`로 직접 빌드해 본다 |
| 영어 UI | ✅ | 2장. 영어 기준, 6개 언어 |
| 휴대폰·태블릿 실제 확인 | ⬜ | `isDesktopOnly: false`인데 실기기에서 써 본 적 없다. iOS·Android 각각 보드 열기, 두 손가락 확대·이동, 도구 막대(좁은 화면에서 아래로), 글 입력(가상 키보드), 노트 카드 열기, 파일 넣기 |

### Obsidian [플러그인 가이드라인](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) 점검

| 항목 | 결과 |
|---|---|
| `innerHTML`·`outerHTML`·`insertAdjacentHTML` 쓰지 않기 | ✅ 없음 |
| 콘솔에 불필요한 로그 남기지 않기 | ✅ `console.log` 없음(오류만 `console.error`) |
| 명령에 기본 단축키 두지 않기 | ✅ 명령 1개, 단축키 없음 |
| 전역 `app` 대신 `this.app` | ✅ (`BoardFileView`는 `const app = this.app`) |
| Vault API를 쓰고 Adapter API는 피하기 | ⚠️ 보관함 파일은 Vault API(`create`, 있는 파일은 `process`로 원자적으로 바꿈). 숨김 폴더 `.boardline/history/`(버전 기록)만 Vault API가 다루지 못해 Adapter API로 읽고 쓴다. README에 이유를 적었다. 대안: 버전 기록을 플러그인 데이터 폴더(`.obsidian/plugins/boardline/`)로 옮기기 |
| `localStorage` 대신 `App.loadLocalStorage`·`saveLocalStorage` | ✅ 최근 색·아이콘, 마지막 도구, 기본 스타일, 보드별 화면 위치·읽기 전용. `core/platform/prefs.ts`가 저장소를 받고, 플러그인이 켜질 때 Obsidian의 보관함별 저장소를 넣는다 |
| 타이머는 `window.setTimeout` 등 | ✅ 팝아웃 창 호환 |
| 하드코딩 스타일 피하기 | ✅ 고정 값은 CSS 클래스로(선택 막대 위치 바꿈 `over-node`), 커서는 포인터 아래 것에 따라 그때그때 정하므로 `setCursor()` 한곳에서. 위치·크기(동적)는 인라인 스타일 |
| 설정 화면 글 규칙 | ✅ sentence case, 제목은 `setHeading()`, 제목에 "settings" 없음 |
| 단축키를 가로채지 않기 | ⚠️ 보드에 포커스가 있을 때만 보드 보기의 Scope로 Ctrl+B/I/E/F/H/G/D/L/0/=/-/Enter, Alt+Enter를 보드가 받는다. 노트용 기능을 막는 게 아니라 보드 안에서 같은 뜻으로 쓰는 것이므로, README에 적었다 |
| 네트워크 사용 알리기([개발자 정책](https://docs.obsidian.md/Developer+policies)) | ✅ README의 "Network use". 링크 미리보기가 `requestUrl`로 웹 페이지와 그림을 읽는다. 그 밖의 네트워크·계정·광고·원격 측정은 없다 |
| 번들(`main.js`)에 원격 코드 불러오기로 보일 것 없음 | ✅ React 19의 react-dom은 쓰지 않는 리소스 미리 불러오기 기능에 `createElement("script")`가 있어 18.3으로 내렸다(보드 UI는 두 버전에 다 있는 것만 쓴다). `eval`·`new Function`·`fetch`·`XMLHttpRequest`도 없다. 남은 `innerHTML`은 react-dom의 `dangerouslySetInnerHTML` 처리, `new Worker`는 elkjs의 워커 주소 경로로, 둘 다 Boardline이 쓰지 않는다 |
| 라이트·다크 전환 | ✅ `core/theme/follow.ts`: Obsidian의 `css-change`가 body 클래스보다 먼저 올 수 있어 다음 프레임에 읽고, 클래스만 바꾸는 테마·플러그인(Minimal 설정 등)도 따라간다. 노트 속 보드 그림은 보드 색이 바뀐 뒤 다시 그린다 |

**남긴 lint 경고(29개)와 이유**

| 규칙 | 개수 | 이유 |
|---|---|---|
| `obsidianmd/prefer-create-el` | 17 | 모두 `src/core`(보드 엔진). 엔진은 Obsidian을 모르게 두어 Vitest로 시험하므로 `document.createElement`를 쓴다. 셸(`src/*.ts`)에는 없다 |
| `@typescript-eslint/no-deprecated` | 11 | 10개는 `document.execCommand`(편집 상자의 굵게·실행 취소, 복사). 브라우저가 대신할 API를 아직 주지 않는다. 1개는 `PluginSettingTab.display()` 다시 부르기로, 대신할 `getSettingDefinitions()`는 1.13.0부터라 `minAppVersion` 1.8.7에서는 쓸 수 없다 |
| `obsidianmd/settings-tab/prefer-setting-definitions` | 1 | 같은 이유(1.13.0부터) |

---

## 4. 큰 보드 성능

`scripts/gen-big-board.ts`로 만든 보드(도형·스티키·텍스트·선·마인드맵·표·섹션·펜 그림을 섞음)를 Obsidian(배포 빌드)에서 쟀다. 화면은 2560×1440이다.

| 객체 수 | 열기 | 100%에서 그리기 | 전체 보기에서 그리기 | 포인터 아래 찾기 | 모두 옮기기 | 실행 취소 | 저장(직렬화) |
|---|---|---|---|---|---|---|---|
| 1,013 | 38 ms | 1.2 ms | 12 ms | 0.2 ms | 3.7 ms | 1.7 ms | 0.6 ms |
| 3,029 | 72 ms | 2.0 ms | 28 ms | 0.6 ms | 9.4 ms | 4.4 ms | 1.8 ms |
| 10,092 | 245 ms | 1.9 ms | 33 ms | 1.0 ms | 17.5 ms | 9.9 ms | 5.2 ms |

고치기 전(1만 개)에는 100%에서 그리기 346 ms, 전체 보기 489 ms, 포인터 아래 찾기 85 ms였다. 고친 것:

- 화면에 보일 수 있는 것만 그린다.
- 읽을 수 없을 만큼 작은 글은 그리지 않는다.
- 격자는 점 하나씩이 아니라 무늬 한 번으로 칠한다. 큰 화면에서 보드와 상관없이 프레임마다 약 15 ms가 들던 부분이다.
- 선의 경로, 그리기 순서, 마인드맵 배치를 바뀔 때까지 기억해 둔다.
- 글 배치 캐시를 크게 했다. 예전에는 800개를 넘으면 매 프레임 비워졌다.
- 포인터 아래 찾기에서 정밀 검사 전에 상자로 먼저 거른다.

다시 재려면 다음 순서로 한다.

1. `npx esbuild scripts/gen-big-board.ts --bundle --platform=node --format=esm --outfile=$TEMP/gen.mjs`
2. `node $TEMP/gen.mjs 10000 "testws/큰 보드 10000.board"`
3. `scripts/cdp-profile.mjs`로 시간과 프로파일을 잰다.

---

## 5. 번들 크기

`main.js` 4.12 MB(배포 빌드, 압축 없음, 도형 6개와 6개 언어를 더한 뒤), `styles.css` 22 KB. 아래 표는 데스크탑 전용 코드를 빼기 전(3.98 MB)에 잰 것이다.

| 구성 | 크기 | 내용 |
|---|---|---|
| elkjs | 1,466 KB (35%) | 자동 정렬(Shift+Alt+V/H). Java를 JS로 옮긴 라이브러리 |
| 아이콘 duotone | 783 KB | Phosphor 아이콘 1,512개의 듀오톤 경로 |
| 아이콘 regular | 641 KB | 같은 아이콘의 선 버전 |
| 아이콘 fill | 561 KB | 같은 아이콘의 채움 버전 |
| 아이콘 목록 | 154 KB | 이름·분류·검색어 |
| src/core | 221 KB | 보드 엔진 |
| react-dom + react | 222 KB | |
| src/board-ui | 80 KB | 보드 화면 |
| src/ (셸) | 22 KB | Obsidian 셸 |

**불러오는 시간:** 플러그인을 켜는 데 150~240 ms가 걸리고, 그중 JS 파싱이 약 54 ms다. Obsidian을 켤 때마다 든다.

**다른 플러그인의 `main.js`**(GitHub 최신 릴리스):

| 플러그인 | main.js | 플러그인 | main.js |
|---|---|---|---|
| Diagrams (draw.io) | 8.23 MB | Kanban | 0.99 MB |
| Excalidraw | 5.06 MB | Omnisearch | 0.72 MB |
| Copilot | 4.96 MB | Git | 0.77 MB |
| tldraw | 4.89 MB | Mind Elixir Mind Map | 0.66 MB (+ CSS 1.47 MB) |
| **Boardline** | **3.98 MB** | Calendar | 0.49 MB |
| Dataview | 2.38 MB | Templater | 0.45 MB |
| Enhancing Mindmap | 1.23 MB | Icon Board | 0.35 MB |
| Tasks | 1.07 MB | Advanced Tables | 0.27 MB |

화이트보드·다이어그램 플러그인 중에서는 작은 편이라 지금 크기로 출시해도 된다. 줄인다면(선택):

| 방법 | 줄어드는 양 | 비용 |
|---|---|---|
| 아이콘 데이터를 압축해 넣고 처음 쓸 때 풀기(Excalidraw 방식) | 아이콘 2.1 MB → 약 0.6 MB | 아이콘 고르기를 처음 열 때 한 번 풂 |
| 듀오톤 아이콘 빼기(선·채움만) | −0.78 MB | 아이콘 스타일 하나가 줄어듦 |
| ELK를 압축해 넣고 자동 정렬을 처음 쓸 때 풀기 | 1.47 MB → 약 0.4 MB | 첫 자동 정렬이 조금 늦음 |
| ELK를 가벼운 배치 라이브러리로 바꾸기(dagre 등) | 약 −1.2 MB | 정렬 결과가 달라짐, 비교 필요 |

Obsidian은 `main.js`·`manifest.json`·`styles.css` 세 파일만 받으므로 따로 떨어진 파일로 나눌 수 없다. 압축해 한 파일에 넣는 것이 현실적인 방법이다.

---

## 6. 코드 밖에서 할 일

1. **라이선스** — ✅ MIT(`LICENSE`, README의 License 절, `package.json`). 커뮤니티 디렉터리는 라이선스 종류를 GitHub에서 읽으며, 없거나 "Custom"이면 경고가 나온다.
   - 함께 묶이는 elkjs는 EPL-2.0, Phosphor·React는 MIT다. 고지문은 `main.js` 머리와 설정 화면에 이미 들어간다(`THIRD_PARTY_NOTICES`).
2. **GitHub 공개** (`kjs104901/obsidian-boardline`)
   - `git remote add origin https://github.com/kjs104901/obsidian-boardline.git` → `git push -u origin main`.
   - 저장소 About에 설명과 주제(`obsidian-plugin`, `whiteboard`, `flowchart`, `mind-map`)를 넣는다.
   - CI(`.github/workflows/ci.yml`)가 푸시마다 타입·lint·테스트·빌드를 돈다.
3. **README 스크린샷·GIF** — ✅ 스크린샷 `docs/images/board.png`(`npm run screenshot`로 다시 찍음). GIF는 선택
   - 데모 보드는 `scripts/screenshot/main.tsx`에서 고친다. GIF를 더한다면 마인드맵 만들기, 연결선 끌기, 발표 화면이 좋다(커뮤니티 디렉터리와 Obsidian 플러그인 화면은 README를 그대로 보여 준다).
4. **첫 릴리스 1.0.0**
   - 버전은 이미 1.0.0이므로 `git tag 1.0.0` → `git push origin 1.0.0`. 다음부터는 `npm version patch` → `git push --follow-tags`.
   - `.github/workflows/release.yml`이 태그와 `manifest.json` 버전이 같은지 보고, 검사·테스트·빌드 뒤 `main.js`, `manifest.json`, `styles.css`를 붙인 **초안 릴리스**를 만든다(파일마다 빌드 출처 증명 포함). GitHub에서 릴리스 노트를 다듬고 공개한다.
   - 태그 이름은 `manifest.json`의 `version`과 같고 앞에 `v`가 없다(`.npmrc`의 `tag-version-prefix=""`). `minAppVersion`을 올릴 때는 `versions.json`에 남는다(`scripts/version-bump.mjs`).
5. **휴대폰·태블릿 확인** — `isDesktopOnly: false`이므로 iOS·Android 각각: 보드 열기, 두 손가락 확대·이동, 도구 막대(좁은 화면에서 아래로), 글 입력(가상 키보드), 노트 카드 열기, 파일 넣기.
6. **베타(선택)** — [BRAT](https://github.com/TfTHacker/obsidian42-brat)으로 몇 명이 저장소에서 바로 설치해 써 보게 한다(BRAT은 최신 릴리스의 파일을 받는다). 모바일 확인도 이때 받는다.
7. **커뮤니티 디렉터리 제출** — 이제 obsidian-releases에 PR을 여는 대신 [community.obsidian.md](https://community.obsidian.md)에서 한다.
   1. Obsidian 계정으로 로그인하고 프로필(사용자 이름, 소개, 후원 링크)을 채운다.
   2. **GitHub** 항목에서 GitHub 계정을 연결한다(저장소 주인인지 확인하는 데 쓰며, 연결해야 제출할 수 있다).
   3. 제출 전에 플러그인 관리 화면의 **Review branch**로 `main`이나 태그를 미리 검사해 본다.
   4. **Plugins** > **New plugin**에 저장소 주소를 넣고, 주인(본인)을 고르고, 개발자 정책에 동의하고, 계속 관리하겠다고 확인한 뒤 제출한다.
   - 자동 검사는 **Manifest**, **Releases**, **Source code**, **Build verification** 네 묶음이고 결과는 Error·Warning·Recommendation·Pass로 나온다. 빌드는 `build` 스크립트(`npm run build`)를 쓰며, `scripts`, `docs`, 테스트 파일, `*.mjs` 설정, `node_modules`, `dist`는 검사에서 뺀다.
   - 한 번 올린 뒤에는 새 릴리스만 내면 사용자에게 업데이트가 간다(디렉터리가 주기적으로 확인하고, 관리 화면의 **Check for new releases**로 바로 확인시킬 수 있다).
   - 플러그인 id(`boardline`)는 올린 뒤 바꿀 수 없다.
8. **(선택)** 후원 링크: 디렉터리 프로필의 funding 링크, 또는 `manifest.json`의 `fundingUrl`.

---

## 7. 체크리스트

- [x] 이름 확정(Boardline)
- [x] `manifest.json`: author·authorUrl, version 1.0.0, minAppVersion 1.8.7
- [x] 영어 UI + 한국어 외 5개 언어(`getLanguage()`, `t(key)`)
- [x] 설정 화면 글을 가이드라인에 맞게
- [x] Obsidian 리뷰 규칙(`npm run lint`) 오류 0
- [x] `.boardline/` Adapter 사용 이유를 README에
- [x] 영어 README(네트워크 사용 공개, 데이터 위치), 한국어는 README.ko.md
- [x] GitHub Actions: CI, 태그로 초안 릴리스, versions.json 자동 갱신
- [x] 빌드 재현성(같은 소스 → 같은 main.js)
- [x] 라이선스: MIT
- [ ] GitHub 공개
- [x] README 스크린샷(`npm run screenshot`), GIF는 선택
- [ ] 첫 릴리스 1.0.0 (태그 → 초안 → 공개)
- [ ] iOS·Android 실기기 확인
- [ ] 번역 검토(일본어·중국어·스페인어·독일어·프랑스어는 원어민 확인 전)
- [ ] (선택) BRAT 베타
- [ ] (선택) 아이콘·ELK 압축으로 크기 줄이기
- [ ] community.obsidian.md 제출(Review branch로 먼저 검사)
