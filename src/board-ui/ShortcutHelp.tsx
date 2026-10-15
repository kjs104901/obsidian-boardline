import { useState } from 'react'
import { CloseIcon } from './icons'

interface ShortcutSection {
  title: string
  rows: [string, string][]
}

interface Props {
  onClose: () => void
}

// Keys, then what they do; " / " separates keys shown as chips of their own.
const SECTIONS: ShortcutSection[] = [
  {
    title: '도구',
    rows: [
      ['R / U / O / D', '사각형 · 알약 · 원 · 다이아몬드'],
      ['P / G / F / Y / B / J / V', '그 밖의 도형'],
      ['N / T / .', '스티키 · 텍스트 · 섹션'],
      ['C', '연결선'],
      ['M', '마인드맵'],
      ['Q', '시퀀스 액터'],
      ['E', '표'],
      ['H / Shift+H', '펜 · 형광펜'],
      ['X', '아이콘'],
      ['K', '링크'],
      ['I', '이미지'],
    ],
  },
  {
    title: '편집',
    rows: [
      ['Enter', '글 편집 (그림은 자르기, 노트 카드는 열기)'],
      ['Ctrl+D', '복제'],
      ['Alt+끌기', '복제해서 옮기기 (빈 곳에서는 올가미 선택)'],
      ['Shift+끌기', '한 방향으로 옮기기'],
      ['Ctrl+끌기 / `+끌기', '그리드에만 맞추기 · 맞추지 않기'],
      ['방향키 / Shift+방향키', '20px · 100px 이동'],
      ['Ctrl+G / Ctrl+Shift+G', '그룹 · 그룹 해제'],
      ['Shift+L', '잠금'],
      ['Alt+] / Alt+[', '맨 앞 · 맨 뒤로'],
      ['Ctrl+Alt+C / Ctrl+Alt+V', '스타일 복사 · 붙여넣기'],
      ['Ctrl+Shift+D', '기본 스타일로 저장'],
      ['Ctrl+Shift+C', 'PNG로 복사'],
      ['Ctrl+L / Ctrl+클릭', '링크 복사 · 링크 열기'],
    ],
  },
  {
    title: '글자',
    rows: [
      ['Ctrl+B / Ctrl+I', '굵게 · 기울임'],
      ['Ctrl+Shift+X', '취소선'],
      ['Ctrl+Shift+H', '강조'],
      ['Ctrl+E', '코드'],
      ['Ctrl+Shift+. / Ctrl+Shift+,', '크게 · 작게'],
      ['Ctrl+Shift+8 / 7 / 9', '글머리표 · 번호 · 할 일'],
      ['# / - / 1. / >', '줄 앞에: 제목 · 목록 · 번호 · 인용'],
      ['**굵게**', 'Markdown으로 쳐도 꾸밈'],
    ],
  },
  {
    title: '연결·정렬',
    rows: [
      ['Alt+방향키', '그 방향에 도형 추가'],
      ['Shift+Alt+V / Shift+Alt+H', '자동 정렬 ↓ · →'],
      ['Alt+A / H / D', '왼쪽 · 가운데 · 오른쪽 맞춤'],
      ['Alt+W / V / S', '위 · 가운데 · 아래 맞춤'],
    ],
  },
  {
    title: '마인드맵·표',
    rows: [
      ['Tab', '자식 노드 추가'],
      ['Enter / Ctrl+Enter', '형제 노드 추가 (편집 중 · 선택 중)'],
      ['Alt+Enter', '부모 노드 끼워 넣기'],
      ['/', '가지 접기 · 펼치기'],
      ['방향키', '노드 · 칸 사이 이동'],
      ['Enter / F2', '표 칸 편집'],
      ['Alt+방향키', '표 행 · 열 옮기기 (칸 선택 중)'],
      ['Shift+방향키 / Shift+클릭', '표 칸 여러 개 선택'],
      ['열 경계 더블클릭', '열 너비를 글에 맞추기'],
    ],
  },
  {
    title: '화면',
    rows: [
      ['Space+끌기', '화면 이동'],
      ['Ctrl+휠', '확대·축소'],
      ['Ctrl+0', '100%'],
      ['Shift+1 / Shift+2', '전체 보기 · 선택 보기'],
      ['Ctrl+F', '찾기'],
      ['F5', '발표'],
      ['L', '발표 중 레이저 포인터'],
    ],
  },
]

/** Shift+/: the board's keyboard shortcuts in tabs. */
export function ShortcutHelp({ onClose }: Props) {
  const [tab, setTab] = useState(0)
  const current = SECTIONS[Math.min(tab, SECTIONS.length - 1)]
  return (
    <div className="bl-help-backdrop" onPointerDown={onClose}>
      <div className="bl-help-panel" onPointerDown={(e) => e.stopPropagation()}>
        <header>
          <span>보드 도움말</span>
          <button title="닫기 (Esc)" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <nav className="bl-help-tabs" role="tablist">
          {SECTIONS.map((s, i) => (
            <button key={s.title} role="tab" aria-selected={s === current} className={s === current ? 'active' : ''} onClick={() => setTab(i)}>
              {s.title}
            </button>
          ))}
        </nav>
        <div className="bl-help-list" role="tabpanel">
          {current.rows.map(([keys, what]) => (
            <div key={keys} className="bl-help-row">
              <span className="bl-help-keys">
                {keys.split(' / ').map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
              <span className="bl-help-what">{what}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
